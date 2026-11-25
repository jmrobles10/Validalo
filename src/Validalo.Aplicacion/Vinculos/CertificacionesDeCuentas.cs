using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Aplicacion.Interesado;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Terceros;
using Validalo.Dominio.Vinculos;

namespace Validalo.Aplicacion.Vinculos;

/// <summary>
/// La certificación bancaria <b>de cada cuenta</b> (CB-1): un documento propio de la cuenta (<see cref="Documento.CuentaBancariaId"/>) con sus versiones, que la IA lee y se cruza
/// con lo que el tercero declaró de <b>esa</b> cuenta (<see cref="CruceConDocumento.CruzarCuenta"/>). El cruce se calcula al leer y no se guarda: el número completo solo existe en
/// memoria y en el resultado va siempre enmascarado. Lo ve el tercero (si hay lectura) y cada empresa solo si recibió esa lectura (consumió su validación, IA-11).
/// </summary>
public static class CertificacionesDeCuentas
{
    /// <summary>Los documentos de certificación por cuenta del tercero, por id de cuenta (a lo sumo uno por cuenta: su clave natural es única).</summary>
    public static async Task<IReadOnlyDictionary<Guid, Documento>> DelTerceroAsync(IQuerySession boveda, Guid terceroId, CancellationToken ct)
    {
        var documentos = await boveda.Query<Documento>().Where(d => d.TerceroId == terceroId && d.CuentaBancariaId != null).ToListAsync(ct);
        return documentos.ToDictionary(d => d.CuentaBancariaId!.Value);
    }

    /// <summary>La cuenta tiene una certificación vigente propia: una versión actual del documento de la cuenta. Sin ella no se designa.</summary>
    public static bool TieneVigente(Documento? documento) => documento?.VersionActual is not null;

    /// <summary>
    /// La versión que se muestra al dueño: la actual y, si ninguna quedó vigente (la que subió se devolvió), la última devuelta, para decirle por qué. Las retiradas no se muestran.
    /// </summary>
    public static VersionDocumento? VersionVisible(Documento? documento)
    {
        if (documento is null)
            return null;
        if (documento.VersionActual is { } actual)
            return documento.Buscar(actual);
        return documento.Versiones.Where(v => v.Estado == EstadoVersion.Devuelta).MaxBy(v => v.Numero);
    }

    /// <summary>El número de la cuenta en claro para compararlo en memoria; si no se puede descifrar (clave retirada), la cuenta queda sin cruce.</summary>
    public static string? NumeroParaCotejar(Func<string> descifrar)
    {
        try
        {
            return descifrar();
        }
        catch (Exception e) when (e is System.Security.Cryptography.CryptographicException or FormatException or ArgumentException)
        {
            return null;
        }
    }

    /// <summary>El cruce de la cuenta con la lectura de IA de esa versión de su certificación; nulo si la versión no tiene lectura (sin plan, sin cupo o fallida).</summary>
    public static CruceDeSeccion? Cruzar(DatosDeCuentaParaCruce cuenta, Tercero tercero, Documento certificacion, VersionDocumento version) =>
        version.Ia is { } ia
            ? CruceConDocumento.CruzarCuenta(cuenta, tercero.Nombre, tercero.Identificacion.Numero, certificacion.Id, version.Numero, ia.Campos, ia.Confianza, ia.Legible, version.CargadaEn)
            : null;

    /// <summary>El tipo «Certificación bancaria» de una empresa del tercero y la antigüedad máxima que exige (TD-10).</summary>
    public sealed record ReglaDeAntiguedad(Guid EmpresaId, string Empresa, TipoDocumentoTenant Tipo);

    /// <summary>
    /// Las empresas con las que el tercero tiene un vínculo vivo (invitación aceptada, ni desvinculado ni anulado) cuyo tipo «Certificación bancaria» exige antigüedad máxima. Es la
    /// misma regla que evalúa el expediente de cada empresa (<see cref="AntiguedadDeVersiones"/>); aquí solo se junta, por empresa, para decírsela al tercero en «Mis cuentas». El tipo
    /// es el activo y global del canónico en el tenant del vínculo. Se carga una vez por petición y sirve para todas las cuentas.
    /// </summary>
    public static async Task<IReadOnlyList<ReglaDeAntiguedad>> ReglasDeAntiguedadAsync(IQuerySession consulta, SesionDeTercero tercero, IReadOnlyList<VinculoVisto> vistos, CancellationToken ct)
    {
        var vivos = vistos.Where(v => v.Empresa is not null && v.Vinculo.InvitacionAceptada && v.Vinculo.Estado is not (EstadoVinculo.Desvinculado or EstadoVinculo.Anulado)).ToList();
        var tenants = tercero.Vinculos.Where(s => vivos.Any(v => v.Vinculo.Id == s.VinculoId)).Select(s => s.TenantId).Distinct().ToArray();
        if (tenants.Length == 0)
            return [];

        var tipos = (await consulta.Query<TipoDocumentoTenant>()
                .Where(t => t.AnyTenant() && t.TipoCanonico == CodigoCertificacionBancaria && t.Activo && t.TenantId.IsOneOf(tenants))
                .ToListAsync(ct))
            .Where(t => t.Ambito == AmbitoDocumento.Global && t.Frescura.AntiguedadMaximaDias is not null)
            .ToList();
        return [.. vivos.SelectMany(v => tercero.Vinculos.Where(s => s.VinculoId == v.Vinculo.Id).Select(s => (Visto: v, Tenant: s.TenantId)))
            .SelectMany(x => tipos.Where(t => t.TenantId == x.Tenant).Select(t => new ReglaDeAntiguedad(x.Visto.Vinculo.EmpresaId, x.Visto.Empresa!.Nombre, t)))
            .DistinctBy(r => r.EmpresaId)
            .OrderBy(r => r.Empresa, StringComparer.CurrentCultureIgnoreCase)];
    }

    /// <summary>Código canónico del tipo de la certificación bancaria.</summary>
    public const string CodigoCertificacionBancaria = "CERTIFICACION_BANCARIA";

    /// <summary>
    /// La antigüedad de la versión visible de la certificación frente a la regla de cada empresa (<paramref name="reglas"/>), con la lectura de IA que exista: es el documento del
    /// tercero. Vacía si la cuenta no tiene versión vigente (una devuelta no se evalúa) o ninguna empresa exige antigüedad.
    /// </summary>
    public static IReadOnlyList<AntiguedadDeCertificacionDto> Antiguedad(VersionDocumento? version, IReadOnlyList<ReglaDeAntiguedad> reglas)
    {
        if (version is null || version.Estado == EstadoVersion.Devuelta)
            return [];
        return [.. reglas.Select(r => (Regla: r, Resultado: AntiguedadDeVersiones.Evaluar(r.Tipo, version, conLecturaDeIa: true)))
            .Where(x => x.Resultado is not null)
            .Select(x => new AntiguedadDeCertificacionDto(x.Regla.EmpresaId, x.Regla.Empresa, x.Resultado!.ADto(x.Regla.Tipo.Nombre)))];
    }

    /// <summary>
    /// La certificación de una cuenta como la ve su dueño: la versión visible, su resultado frente a lo declarado (con la lectura que exista, sin importar quién la pagó), la
    /// antigüedad que le exige cada empresa (<paramref name="reglas"/>) y, si la devolvieron, el motivo. Nula si la cuenta no tiene ninguna certificación.
    /// </summary>
    public static CertificacionDeCuentaDto? ParaElTercero(CuentaBancaria cuenta, Documento? documento, Tercero? tercero, Func<string, string> desproteger,
        IReadOnlyList<ReglaDeAntiguedad>? reglas = null)
    {
        var version = VersionVisible(documento);
        if (documento is null || version is null)
            return null;

        CruceDeSeccion? cruce = null;
        if (version.Estado != EstadoVersion.Devuelta && tercero is not null && NumeroParaCotejar(() => desproteger(cuenta.NumeroProtegido)) is { } numero)
            cruce = Cruzar(new DatosDeCuentaParaCruce(cuenta.Banco, cuenta.TipoCuenta.ToString(), numero, cuenta.Titular, cuenta.IdentificacionTitular), tercero, documento, version);

        return new CertificacionDeCuentaDto(documento.Id, version.Numero, version.Estado.ToString(), version.CargadaEn, version.NombreOriginal,
            ResumenDeCruceDeCuenta.De(cruce).ToString(), cruce?.DiscrepanciaCritica == true, cruce is null ? [] : [.. cruce.Campos.Select(ADto)], version.DetalleDevolucion ?? version.MotivoDevolucion,
            Antiguedad(version, reglas ?? []));
    }

    /// <summary>
    /// La certificación de una cuenta designada (o propuesta, o rechazada) como la ve la empresa del vínculo: la versión más reciente que se le compartió y, si la empresa
    /// recibió su lectura de IA, el cruce con la copia de la cuenta que el vínculo guarda. Nula si la cuenta no tiene certificación compartida con esta empresa (una cuenta
    /// designada antes de la certificación por cuenta): el llamador lo marca como «sin certificación».
    /// </summary>
    public static async Task<CertificacionDeCuentaDelVinculoDto?> ParaLaEmpresaAsync(IQuerySession sesionDelTenant, Guid empresaId, Vinculo vinculo, CuentaParaDesignar cuenta,
        Documento? documento, Tercero? tercero, Func<string> numeroDeLaCopia, CancellationToken ct)
    {
        if (documento is null)
            return null;
        var compartidas = documento.Comparticiones.Where(c => c.VinculoId == vinculo.Id).Select(c => c.Numero).ToHashSet();
        var version = documento.Versiones.Where(v => compartidas.Contains(v.Numero) && v.Estado is not (EstadoVersion.Retirada or EstadoVersion.Devuelta) && !v.Suprimida)
            .MaxBy(v => v.Numero);
        if (version is null)
            return null;

        CruceDeSeccion? cruce = null;
        var consumida = await sesionDelTenant.LoadAsync<ValidacionIaConsumida>(ValidacionIaConsumida.Clave(empresaId, documento.Id, version.Numero), ct) is not null;
        if (consumida && tercero is not null && NumeroParaCotejar(numeroDeLaCopia) is { } numero)
            cruce = Cruzar(new DatosDeCuentaParaCruce(cuenta.Banco, cuenta.TipoCuenta, numero, cuenta.Titular, cuenta.IdentificacionTitular), tercero, documento, version);

        return new CertificacionDeCuentaDelVinculoDto(documento.Id, version.Numero, version.CargadaEn, ResumenDeCruceDeCuenta.De(cruce).ToString(), cruce is null,
            cruce?.DiscrepanciaCritica == true, cruce is null ? null : Expedientes.CrucesDelExpediente.ADto(cruce, new Dictionary<Guid, string> { [documento.Id] = documento.NombreTipo }));
    }

    private static CampoCruzadoDto ADto(CampoCruzado c) => new(c.Campo, c.Etiqueta, c.Declarado, c.Extraido, c.Resultado.ToString(), c.Critico, c.Detalle);
}

