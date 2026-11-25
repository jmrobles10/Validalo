using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Aplicacion.Ficha;
using Validalo.Aplicacion.Vinculos;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Flujos;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Terceros;
using Validalo.Dominio.Vinculos;

namespace Validalo.Aplicacion.Expedientes;

/// <summary>
/// Lo que una empresa ve del cruce sección ↔ documento en un expediente (F5, FM-8, FM-13). El cruce es un hecho compartido de
/// la versión de la sección, pero la empresa solo ve los cruces con versiones de documento cuyo análisis de IA recibió (consumió
/// su validación, IA-3/IA-11); los demás documentos que respaldan la sección quedan «sin análisis» (revisión manual). Un
/// requisito de documento con «Usar como soporte» apagado no se cruza: sus cruces no se muestran ni cuentan.
/// </summary>
public sealed class CrucesDelExpediente
{
    public const string EstadoCruzado = "Cruzado";
    public const string EstadoManual = "Manual";
    public const string EstadoSinDocumento = "SinDocumento";
    public const string MotivoSinAnalisis = "sin-analisis";

    private readonly Dictionary<Guid, CruceDeRequisitoDto> _secciones = [];
    private readonly Dictionary<Guid, SoporteDeSeccionesDto> _documentos = [];
    private readonly HashSet<Guid> _sinSoporteCritico = [];
    private readonly Dictionary<Guid, ResultadoDeAntiguedad> _antiguedades = [];

    public static readonly CrucesDelExpediente Vacio = new();

    public CruceDeRequisitoDto? DeSeccion(Guid requisitoId) => _secciones.GetValueOrDefault(requisitoId);

    public SoporteDeSeccionesDto? DeDocumento(Guid requisitoId) => _documentos.GetValueOrDefault(requisitoId);

    /// <summary>
    /// La antigüedad máxima al subir (TD-10) del documento que cubre el requisito, evaluada con la lectura de IA que la empresa consumió; nula si el tipo
    /// no la exige. Un hallazgo crítico (<see cref="ResultadoDeAntiguedad.EsCritico"/>) cuenta como discrepancia crítica: no se aprueba sin justificación.
    /// </summary>
    public ResultadoDeAntiguedad? AntiguedadDe(Guid requisitoId) => _antiguedades.GetValueOrDefault(requisitoId);

    /// <summary>
    /// Requisitos que no se aprueban sin justificación (FM-13, FD-4): con una discrepancia crítica en el cruce que la empresa ve (de sección,
    /// de documento o de las cuentas contra su certificación) o de una sección cuyo cambio crítico no trae un documento nuevo (FM-15).
    /// </summary>
    public IReadOnlySet<Guid> ConDiscrepanciaCritica =>
        _secciones.Where(s => s.Value.DiscrepanciaCritica).Select(s => s.Key)
            .Concat(_documentos.Where(d => d.Value.DiscrepanciaCritica).Select(d => d.Key)).Concat(_sinSoporteCritico)
            .Concat(_antiguedades.Where(a => a.Value.EsCritico).Select(a => a.Key)).ToHashSet();

    /// <param name="sesionDelTenant">Sesión del tenant de la empresa (validaciones consumidas, flujo, tercero).</param>
    /// <param name="boveda">Consulta del tenant técnico <c>boveda</c> (secciones y documentos del tercero).</param>
    public static async Task<CrucesDelExpediente> CargarAsync(IQuerySession sesionDelTenant, IQuerySession boveda, Expediente expediente, Guid empresaId,
        IProtectorDeSecretos protector, CancellationToken ct)
    {
        if (!expediente.ConRequisitos)
            return Vacio;
        // La antigüedad máxima al subir (TD-10) no depende de que el documento respalde la ficha: se evalúa en todo requisito de documento cuyo tipo la exija.
        var antiguedades = await AntiguedadesAsync(sesionDelTenant, boveda, expediente, empresaId, ct);
        // El documento de una persona relacionada (ADR-0010) no respalda las secciones del tercero: es de otra bóveda.
        var porDocumento = expediente.Requisitos.Where(r => !r.NoAplica && !r.EsSeccion && !r.EsDePersona && MapaDeRespaldo.RespaldaAlguna(r.TipoCanonico)).ToList();
        var porSeccion = expediente.Requisitos.Where(r => !r.NoAplica && r.EsSeccion && r.Seccion is not null).ToList();
        if (porDocumento.Count == 0 && porSeccion.Count == 0)
        {
            if (antiguedades.Count == 0)
                return Vacio;
            var soloAntiguedad = new CrucesDelExpediente();
            foreach (var (id, antiguedad) in antiguedades)
                soloAntiguedad._antiguedades[id] = antiguedad;
            return soloAntiguedad;
        }

        var terceroId = expediente.TerceroId;
        var tercero = await sesionDelTenant.LoadAsync<Tercero>(terceroId, ct);
        var secciones = (await boveda.Query<SeccionDeFicha>().Where(s => s.TerceroId == terceroId).ToListAsync(ct)).ToDictionary(s => s.Id);
        var documentos = (await boveda.Query<Documento>().Where(d => d.TerceroId == terceroId).ToListAsync(ct)).ToList();
        // Las cuentas que la empresa ve son las de su vínculo: la designada y la propuesta (CB-1: el tercero elige qué cuenta ve cada empresa); cada una se cruza con su propia
        // certificación.
        var cuentas = porDocumento.Any(r => MapaDeRespaldo.RespaldaCuentas(r.TipoCanonico))
            ? await CuentasDelVinculoAsync(sesionDelTenant, boveda, expediente.VinculoId, terceroId, ct)
            : [];
        var ids = documentos.Select(d => d.Id).ToArray();
        var consumidas = ids.Length == 0
            ? new HashSet<(Guid, int)>()
            : (await sesionDelTenant.Query<ValidacionIaConsumida>().Where(v => v.EmpresaId == empresaId && v.DocumentoId.IsOneOf(ids)).ToListAsync(ct))
                .Select(v => (v.DocumentoId, v.Numero)).ToHashSet();

        // «Usar como soporte» de cada requisito de documento según la versión del flujo del expediente (activo por omisión).
        var requisitosDelFlujo = new Dictionary<Guid, RequisitoDelFlujo>();
        if (expediente.Flujo is { } delFlujo && await sesionDelTenant.LoadAsync<Flujo>(delFlujo.FlujoId, ct) is { } flujo &&
            flujo.Versiones.FirstOrDefault(v => v.Id == delFlujo.FlujoVersionId) is { } version)
        {
            foreach (var r in version.Requisitos)
                requisitosDelFlujo[r.Id] = r;
        }

        bool UsaComoSoporte(RequisitoDeExpediente r) =>
            requisitosDelFlujo.TryGetValue(r.Id, out var delFlujo) ? delFlujo.UsaComoSoporte(r.TipoCanonico) : MapaDeRespaldo.RespaldaAlguna(r.TipoCanonico);

        var apagados = porDocumento.Where(r => !UsaComoSoporte(r)).Select(r => r.TipoCanonico!).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var resultado = new CrucesDelExpediente();
        foreach (var (id, antiguedad) in antiguedades)
            resultado._antiguedades[id] = antiguedad;
        var nombres = documentos.ToDictionary(d => d.Id, d => d.NombreTipo);

        foreach (var requisito in porSeccion)
        {
            var seccion = secciones.GetValueOrDefault(SeccionDeFicha.IdPara(terceroId, requisito.Seccion!, requisito.Periodo));
            var versionSeccion = requisito.VersionActual is { } v
                ? seccion?.Versiones.FirstOrDefault(x => x.Numero == v.Numero)
                : seccion?.Vigente;
            if (seccion is null || versionSeccion is null)
                continue;

            // Un cambio crítico sin un documento nuevo (FM-15) tampoco se aprueba sin justificación.
            if (seccion.SinSoporte(versionSeccion.Numero, requisito.VersionAceptadaPrevia?.Numero) is { Critico: true })
                resultado._sinSoporteCritico.Add(requisito.Id);

            var respaldos = CrucesDeFicha.Respaldos(seccion, versionSeccion, documentos).Where(r => !apagados.Contains(r.Documento.TipoCanonico!)).ToList();
            var visibles = versionSeccion.Cruces
                .Where(c => consumidas.Contains((c.DocumentoId, c.VersionDocumento)) && !apagados.Contains(c.TipoDocumento))
                .GroupBy(c => c.DocumentoId).Select(g => g.MaxBy(c => c.VersionDocumento)!)
                .ToList();
            var sinCruce = respaldos.Where(r => visibles.All(c => c.DocumentoId != r.Documento.Id))
                .GroupBy(r => r.Documento.Id).Select(g => g.MaxBy(r => r.Version))
                .Select(r => new DocumentoSinCruceDto(r.Documento.Id, r.Version, r.Documento.TipoCanonico ?? r.Documento.NombreTipo, r.Documento.NombreTipo,
                    MotivoSinAnalisis))
                .ToList();
            var estado = visibles.Count > 0 ? EstadoCruzado : sinCruce.Count > 0 ? EstadoManual : EstadoSinDocumento;
            resultado._secciones[requisito.Id] = new CruceDeRequisitoDto(estado, visibles.Any(c => c.DiscrepanciaCritica),
                [.. visibles.Select(c => ADto(c, nombres))], sinCruce);
        }

        foreach (var requisito in porDocumento.Where(UsaComoSoporte))
        {
            if (requisito.VersionActual is not { } v)
                continue;
            var visible = consumidas.Contains((v.DocumentoId, v.Numero));
            var filas = new List<SeccionRespaldadaDto>();
            foreach (var codigo in MapaDeRespaldo.Secciones(requisito.TipoCanonico))
            {
                var definicion = CatalogoDeSecciones.Buscar(codigo)!;
                if (tercero is not null && !definicion.Obligatoria(tercero.TipoPersona))
                    continue;
                var deLaSeccion = secciones.Values.Where(s => s.Seccion == codigo && s.Vigente is not null).OrderByDescending(s => s.Periodo).ToList();
                if (deLaSeccion.Count == 0)
                {
                    filas.Add(new SeccionRespaldadaDto(codigo, definicion.Nombre, null, null, null));
                    continue;
                }

                foreach (var seccion in deLaSeccion)
                {
                    var cruce = visible ? seccion.Vigente!.Cruces.FirstOrDefault(c => c.Es(v.DocumentoId, v.Numero)) : null;
                    if (definicion.PorPeriodo && cruce is null)
                        continue; // Los estados financieros respaldan solo la financiera de su periodo.
                    filas.Add(new SeccionRespaldadaDto(codigo, RequisitosDeSeccion.Nombre(definicion, seccion.Periodo), seccion.Periodo,
                        seccion.VersionVigente, cruce is null ? null : ADto(cruce, nombres)));
                }
            }

            // La certificación bancaria respalda las cuentas del vínculo (FD-5, CB-1): cada una frente a lo que dice su propia certificación.
            var esDeCuentas = MapaDeRespaldo.RespaldaCuentas(requisito.TipoCanonico);
            if (esDeCuentas && tercero is not null)
                filas.AddRange(FilasDeCuentas(cuentas, tercero, documentos, expediente.VinculoId, consumidas, protector, nombres));

            // Sin lectura: la de la versión que cubre el requisito o, en las cuentas, que ninguna de sus certificaciones tenga cruce para la empresa.
            var sinAnalisis = esDeCuentas ? filas.All(f => f.Cruce is null) : !visible;
            resultado._documentos[requisito.Id] = new SoporteDeSeccionesDto(sinAnalisis, filas.Any(f => f.Cruce?.DiscrepanciaCritica == true), filas);
        }

        return resultado;
    }

    /// <summary>
    /// La antigüedad máxima al subir (TD-10) de cada documento que cubre un requisito cuyo tipo la exige, con la lectura de IA que la empresa consumió (IA-3):
    /// sin ella no se sabe qué leyó la IA y queda <c>SinLectura</c>. Los requisitos sin versión, eximidos o de un tipo sin esa regla no aparecen.
    /// </summary>
    private static async Task<IReadOnlyDictionary<Guid, ResultadoDeAntiguedad>> AntiguedadesAsync(IQuerySession sesionDelTenant, IQuerySession boveda,
        Expediente expediente, Guid empresaId, CancellationToken ct)
    {
        var documentales = expediente.Requisitos.Where(r => !r.NoAplica && !r.EsSeccion && !r.Eximido && r.VersionActual is not null).ToList();
        if (documentales.Count == 0)
            return new Dictionary<Guid, ResultadoDeAntiguedad>();

        var tipoIds = documentales.Select(r => r.TipoDocumentoTenantId).Distinct().ToArray();
        var tipos = (await sesionDelTenant.Query<TipoDocumentoTenant>().Where(t => t.Id.IsOneOf(tipoIds)).ToListAsync(ct))
            .Where(t => t.Frescura.ExigeAntiguedad).ToDictionary(t => t.Id);
        if (tipos.Count == 0)
            return new Dictionary<Guid, ResultadoDeAntiguedad>();

        var relevantes = documentales.Where(r => tipos.ContainsKey(r.TipoDocumentoTenantId)).ToList();
        var documentoIds = relevantes.Select(r => r.VersionActual!.DocumentoId).Distinct().ToArray();
        var documentos = (await boveda.LoadManyAsync<Documento>(ct, documentoIds)).ToDictionary(d => d.Id);
        var consumidas = await AntiguedadDeVersiones.ConsumidasAsync(sesionDelTenant, empresaId, documentoIds, ct);

        var resultado = new Dictionary<Guid, ResultadoDeAntiguedad>();
        foreach (var requisito in relevantes)
        {
            var v = requisito.VersionActual!;
            if (!documentos.TryGetValue(v.DocumentoId, out var documento) || documento.Buscar(v.Numero) is not { } version)
                continue;
            if (AntiguedadDeVersiones.Evaluar(tipos[requisito.TipoDocumentoTenantId], version, consumidas.Contains((v.DocumentoId, v.Numero))) is { } antiguedad)
                resultado[requisito.Id] = antiguedad;
        }

        return resultado;
    }

    /// <summary>
    /// Las cuentas del vínculo (la designada y la propuesta) con su dueño: las que la empresa ve de entre las del tercero. En el orden en que las registró.
    /// </summary>
    private static async Task<IReadOnlyList<CuentaBancaria>> CuentasDelVinculoAsync(IQuerySession sesionDelTenant, IQuerySession boveda, Guid vinculoId, Guid terceroId,
        CancellationToken ct)
    {
        if (await sesionDelTenant.LoadAsync<Vinculo>(vinculoId, ct) is not { } vinculo)
            return [];
        var ids = new[] { vinculo.CuentaDesignada, vinculo.CuentaPropuesta }.Where(c => c is not null).Select(c => c!.Cuenta.CuentaId).Distinct().ToArray();
        return ids.Length == 0
            ? []
            : [.. (await boveda.LoadManyAsync<CuentaBancaria>(ct, ids)).Where(c => c.TerceroId == terceroId).OrderBy(c => c.RegistradaEn)];
    }

    /// <summary>
    /// Las cuentas del vínculo frente a <b>su</b> certificación bancaria (FD-5, CB-1): una fila por cuenta, con su cruce si la empresa recibió el análisis de la versión de la
    /// certificación de esa cuenta que se le compartió. El número completo solo se descifra para comparar y nunca sale: el cruce lo muestra enmascarado (CB-2). Una cuenta sin
    /// certificación propia queda sin cruce (se revisa a mano); sin cuentas, una sola fila sin cruce dice que el tercero no ha designado ninguna con esta empresa.
    /// </summary>
    private static IEnumerable<SeccionRespaldadaDto> FilasDeCuentas(IReadOnlyList<CuentaBancaria> cuentas, Tercero tercero, IReadOnlyList<Documento> documentos, Guid vinculoId,
        IReadOnlySet<(Guid, int)> consumidas, IProtectorDeSecretos protector, IReadOnlyDictionary<Guid, string> nombres)
    {
        if (cuentas.Count == 0)
        {
            yield return new SeccionRespaldadaDto(CodigosDeSeccion.CuentasBancarias, "Cuentas bancarias (ninguna designada con esta empresa)", null, null, null);
            yield break;
        }

        foreach (var cuenta in cuentas)
        {
            CruceDeSeccionDto? cruce = null;
            var certificacion = documentos.FirstOrDefault(d => d.CuentaBancariaId == cuenta.Id);
            // La versión más reciente de esa certificación que se le compartió a la empresa y no está retirada ni devuelta.
            var version = certificacion?.Versiones
                .Where(x => certificacion.EstaCompartida(x.Numero, vinculoId) && x.Estado is not (EstadoVersion.Retirada or EstadoVersion.Devuelta) && !x.Suprimida)
                .MaxBy(x => x.Numero);
            if (certificacion is not null && version is not null && consumidas.Contains((certificacion.Id, version.Numero)) &&
                CertificacionesDeCuentas.NumeroParaCotejar(() => protector.Desproteger(cuenta.NumeroProtegido)) is { } numero &&
                CertificacionesDeCuentas.Cruzar(new DatosDeCuentaParaCruce(cuenta.Banco, cuenta.TipoCuenta.ToString(), numero, cuenta.Titular, cuenta.IdentificacionTitular),
                    tercero, certificacion, version) is { } cruzado)
            {
                cruce = ADto(cruzado, nombres);
            }

            yield return new SeccionRespaldadaDto(CodigosDeSeccion.CuentasBancarias, $"Cuenta de {cuenta.Banco} {cuenta.NumeroEnmascarado}", null, null, cruce);
        }
    }


    public static CruceDeSeccionDto ADto(CruceDeSeccion c, IReadOnlyDictionary<Guid, string> nombres) =>
        new(c.DocumentoId, c.VersionDocumento, c.TipoDocumento, nombres.GetValueOrDefault(c.DocumentoId) ?? c.TipoDocumento, c.Confianza, c.Legible, c.Fecha,
            c.Coincidencias, c.Discrepancias, c.NoVerificables, c.DiscrepanciaCritica,
            [.. c.Campos.Select(x => new CampoCruzadoDto(x.Campo, x.Etiqueta, x.Declarado, x.Extraido, x.Resultado.ToString(), x.Critico, x.Detalle))]);
}
