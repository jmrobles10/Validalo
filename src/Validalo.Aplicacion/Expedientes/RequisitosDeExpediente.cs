using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Configuracion;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Flujos;
using Validalo.Dominio.Terceros;
using Validalo.Dominio.Vinculos;

namespace Validalo.Aplicacion.Expedientes;

/// <summary>Requisito de una versión de flujo con su tipo del tenant (código, nombre, canónico y ámbito).</summary>
public sealed record RequisitoPedido(RequisitoDelFlujo Requisito, TipoDocumentoTenant Tipo);

/// <summary>
/// Puente entre la bóveda y los requisitos del expediente (RQ-2, RQ-3): qué tipos pide el flujo, qué versión compartida
/// con el vínculo cubre cada requisito y qué vínculos piden un tipo (para compartir una versión nueva). El expediente
/// decide; aquí solo se leen los documentos y se casan con los requisitos.
/// </summary>
public static class RequisitosDeExpediente
{
    /// <summary>
    /// Requisitos de la versión del flujo que se le piden a este tercero en este vínculo (los que cumplen su condición,
    /// RQ-12), con su tipo del tenant y en el orden del flujo.
    /// </summary>
    public static async Task<IReadOnlyList<RequisitoPedido>> DelFlujoAsync(IQuerySession sesionDelTenant, FlujoVersion version,
        ContextoDeExigencia contexto, CancellationToken ct, bool incluirPersonas = false)
    {
        // Los requisitos de una persona relacionada (ADR-0010) piden el documento de OTRA bóveda: solo los calcula quien los pide (apertura y recálculo del expediente).
        // Todo lo demás (compartir lo del tercero, vigencias, renovaciones…) los ignora, así nunca confunde la cédula del representante con la del tercero.
        var aplican = EvaluadorDeExigencia.Filtrar(version.Requisitos.Where(r => !r.EsSeccion && (incluirPersonas || !r.EsDePersona)), contexto);
        if (aplican.Count == 0)
            return [];

        var ids = aplican.Select(r => r.TipoDocumentoTenantId).Distinct().ToArray();
        var tipos = (await sesionDelTenant.LoadManyAsync<TipoDocumentoTenant>(ct, ids)).ToDictionary(t => t.Id);
        return [.. aplican.Where(r => tipos.ContainsKey(r.TipoDocumentoTenantId)).Select(r => new RequisitoPedido(r, tipos[r.TipoDocumentoTenantId]))];
    }

    /// <summary>
    /// Requisitos de sección de la versión del flujo que se le piden a este tercero en este vínculo (condición y tipo de
    /// persona: la natural no tiene Legal ni Financiera), uno por sección y, en la financiera, uno por periodo exigido (F2).
    /// </summary>
    public static IReadOnlyList<RequisitoDeSeccionPedido> SeccionesDelFlujo(FlujoVersion version, ContextoDeExigencia contexto, DateOnly hoy) =>
        RequisitosDeSeccion.Expandir(EvaluadorDeExigencia.Filtrar(version.Requisitos.Where(r => r.EsSeccion), contexto), hoy);

    /// <summary>Las secciones de la ficha del tercero, por id de stream (tenant técnico <c>boveda</c> en la misma sesión).</summary>
    public static async Task<IReadOnlyDictionary<Guid, SeccionDeFicha>> FichaAsync(IDocumentSession sesionDelTenant, Guid terceroId,
        CancellationToken ct) =>
        (await sesionDelTenant.ForTenant(TenantsTecnicos.Boveda).Query<SeccionDeFicha>().Where(s => s.TerceroId == terceroId).ToListAsync(ct))
        .ToDictionary(s => s.Id);

    /// <summary>Lo aceptado por la empresa de cada sección en el vínculo, por clave (vínculo, sección, periodo).</summary>
    public static async Task<IReadOnlyDictionary<string, SeccionAceptada>> AceptadasAsync(IQuerySession sesionDelTenant, Guid vinculoId,
        CancellationToken ct) =>
        (await sesionDelTenant.Query<SeccionAceptada>().Where(a => a.VinculoId == vinculoId).ToListAsync(ct)).ToDictionary(a => a.Id);

    /// <summary>Versión aceptada de la sección como versión de requisito (base de la comparación de una actualización).</summary>
    public static VersionDeRequisito? Aceptada(IReadOnlyDictionary<string, SeccionAceptada> aceptadas, Guid vinculoId, RequisitoDeSeccionPedido pedido) =>
        aceptadas.TryGetValue(SeccionAceptada.Clave(vinculoId, pedido.Definicion.Codigo, pedido.Periodo), out var a)
            ? new VersionDeRequisito(a.SeccionId, a.Version, a.Huella, a.AceptadaEn)
            : null;

    /// <summary>
    /// Foto del requisito de sección para <c>RequisitosCalculados</c>: con <paramref name="ficha"/> (el tercero ya aceptó la
    /// invitación: la ficha está disponible para la empresa) se evalúa la versión vigente con la regla de «completa para la
    /// empresa» y solo la cubre si lo es; sin ella, nace pendiente sin evaluar.
    /// </summary>
    public static RequisitoCalculado CalcularSeccion(RequisitoDeSeccionPedido pedido, Guid terceroId, IReadOnlyDictionary<Guid, SeccionDeFicha>? ficha,
        VersionDeRequisito? aceptada) =>
        pedido.Calcular(ficha is null ? null : RequisitosDeSeccion.Evaluar(pedido, ficha.GetValueOrDefault(pedido.SeccionId(terceroId))), aceptada);

    /// <summary>
    /// Tercero, tipo de vínculo y atributos del vínculo: con qué se evalúan las condiciones de sus requisitos. Con la <paramref name="version"/> del flujo que se va a
    /// evaluar, y solo si alguna de sus condiciones mira la ficha del tercero y la empresa ya puede verla, el contexto trae también lo que el tercero declaró (EF-2);
    /// sin versión, la ficha no se carga (sus campos son datos faltantes). <paramref name="aceptandose"/>: la aceptación de la invitación ocurre en esta transacción.
    /// </summary>
    public static async Task<ContextoDeExigencia> ContextoAsync(IQuerySession sesionDelTenant, Vinculo vinculo, CancellationToken ct, FlujoVersion? version = null,
        bool aceptandose = false)
    {
        var tercero = await sesionDelTenant.LoadAsync<Tercero>(vinculo.TerceroId, ct)
                      ?? throw ReglaDeNegocioException.NoEncontrado("tercero-no-encontrado", "El tercero del vínculo no existe.");
        var tipo = await sesionDelTenant.LoadAsync<TipoVinculo>(vinculo.TipoVinculoId, ct);
        var contexto = ContextoDeExigencia.De(tercero, tipo?.Codigo ?? string.Empty, vinculo.Atributos);
        return version is null ? contexto : await FichaDeExigencia.CompletarAsync(sesionDelTenant, contexto, vinculo, version, aceptandose, ct);
    }

    /// <summary>Canónicos de los tipos globales que se piden: lo que la bóveda del tercero comparte con el vínculo.</summary>
    public static IReadOnlySet<string> CodigosGlobales(IEnumerable<RequisitoPedido> pedidos) =>
        pedidos.Where(p => p.Tipo.Ambito == AmbitoDocumento.Global && p.Tipo.TipoCanonico is not null)
            .Select(p => p.Tipo.TipoCanonico!)
            .ToHashSet(StringComparer.Ordinal);

    /// <summary>Foto del requisito para <c>RequisitosCalculados</c>, con la versión que ya lo cubre (si está compartida con el vínculo).</summary>
    public static RequisitoCalculado Calcular(RequisitoPedido pedido, IEnumerable<Documento> documentos, Guid vinculoId)
    {
        var tipo = pedido.Tipo;
        return new RequisitoCalculado(pedido.Requisito.Id, tipo.Id, tipo.Codigo, tipo.Nombre, tipo.TipoCanonico, tipo.Ambito,
            pedido.Requisito.Obligatorio, pedido.Requisito.AreasQueRevisan, pedido.Requisito.AprobadoresRequeridos,
            Cubre(tipo.Id, tipo.TipoCanonico, tipo.Ambito, documentos, vinculoId), DiasRevalidacion: tipo.DiasRevalidacion);
    }

    // ---------- Requisitos de persona relacionada (ADR-0010) ----------

    /// <summary>Las personas a las que un requisito del flujo les pide su documento, ya resueltas contra las relaciones vigentes.</summary>
    public sealed record PersonasDelPedido(RequisitoPedido Pedido, IReadOnlyList<PersonaDelRequisito> Personas);

    /// <summary>
    /// Resuelve cada requisito de persona del flujo contra las relaciones vigentes del tercero (ADR-0010, regla 4): la relación <b>principal</b> del rol o, con
    /// <c>TodasLasRelaciones</c>, todas las vigentes del rol. Un tercero persona natural es su propio representante legal (la regla del ERP: el propio tercero), sin necesidad
    /// de una relación. Sin nadie que cumpla el rol, la lista va vacía (el requisito nace sin persona y espera a que se declare).
    /// </summary>
    public static async Task<IReadOnlyList<PersonasDelPedido>> ResolverPersonasAsync(IQuerySession consulta, Tercero tercero, IReadOnlyList<RequisitoPedido> pedidos,
        DateOnly hoy, CancellationToken ct)
    {
        if (pedidos.Count == 0)
            return [];

        var terceroId = tercero.Id;
        var relaciones = await consulta.Query<RelacionEntreTerceros>().Where(r => r.AnyTenant() && r.DestinoId == terceroId).ToListAsync(ct);
        var ids = relaciones.Where(r => r.EsVigente(hoy)).Select(r => r.OrigenId).Distinct().ToArray();
        var personas = ids.Length == 0 ? new Dictionary<Guid, Tercero>() : (await consulta.LoadManyAsync<Tercero>(ct, ids)).ToDictionary(t => t.Id);

        var resultado = new List<PersonasDelPedido>();
        foreach (var pedido in pedidos)
        {
            var rol = pedido.Requisito.DePersonaRelacionada!.Value;
            var elegidas = RelacionesDeTercero.Resolver(relaciones, rol, pedido.Requisito.TodasLasRelaciones, hoy)
                .Where(r => personas.ContainsKey(r.OrigenId))
                .Select(r => new PersonaDelRequisito(pedido.Requisito.Id, rol, pedido.Requisito.TodasLasRelaciones, r.OrigenId, r.Id,
                    personas[r.OrigenId].Nombre, personas[r.OrigenId].Identificacion.Clave.Replace('|', ' ')))
                .ToList();
            if (elegidas.Count == 0 && rol == TipoRelacionTerceros.RepresentanteLegal && tercero.TipoPersona == TipoPersona.Natural)
                elegidas.Add(new PersonaDelRequisito(pedido.Requisito.Id, rol, pedido.Requisito.TodasLasRelaciones, tercero.Id, null, tercero.Nombre,
                    tercero.Identificacion.Clave.Replace('|', ' ')));
            resultado.Add(new PersonasDelPedido(pedido, elegidas));
        }

        return resultado;
    }

    /// <summary>
    /// Lo que piden los requisitos de persona: por cada uno, un requisito por persona que cumple el rol y, si nadie lo cumple, uno <b>sin persona</b> (nace pendiente).
    /// Cada uno trae la versión que ya lo cubre (el documento de esa persona, si está compartido con el vínculo). Con el vínculo aceptado y la bóveda disponible, antes
    /// comparte con él los documentos que se le piden a cada persona (los de su bóveda, solo esos): así una persona que ya validó su cédula con otra empresa o
    /// en otro tercero no la sube de nuevo.
    /// </summary>
    public static async Task<PersonasCalculadas> CalcularDePersonasAsync(IDocumentSession sesion, Vinculo vinculo, Tercero tercero, Guid tenantId,
        IReadOnlyList<RequisitoPedido> pedidos, DateTimeOffset ahora, CancellationToken ct)
    {
        if (pedidos.Count == 0)
            return new PersonasCalculadas([], 0);

        var hoy = CalculadoraDeVigencia.Fecha(ahora);
        var resueltos = await ResolverPersonasAsync(sesion, tercero, pedidos, hoy, ct);
        IReadOnlyList<Documento> documentos = [];
        var compartidos = 0;
        if (vinculo is { InvitacionAceptada: true, BovedaDisponible: true })
        {
            var pedidas = resueltos.SelectMany(r => r.Personas.Where(p => p.PersonaId is not null)
                    .Select(p => (PersonaId: p.PersonaId!.Value, Codigo: r.Pedido.Tipo.TipoCanonico)))
                .Where(x => x.Codigo is not null)
                .GroupBy(x => x.PersonaId)
                .Select(g => new PersonaPedida(g.Key, g.Select(x => x.Codigo!).ToHashSet(StringComparer.Ordinal)))
                .ToList();
            var compartido = await ComparticionDeDocumentos.CompartirPersonasConVinculoAsync(sesion, vinculo, tenantId, pedidas, OrigenComparticion.Automatica, ahora, ct);
            documentos = compartido.DocumentosDePersonas ?? [];
            compartidos = compartido.Compartidos.Count;
        }

        var calculados = new List<RequisitoCalculado>();
        foreach (var resuelto in resueltos)
        {
            var requisito = resuelto.Pedido.Requisito;
            // Sin nadie que cumpla el rol: un requisito sin persona (nace pendiente) en vez de callar que el flujo lo pide.
            var personasDelRequisito = resuelto.Personas.Count > 0
                ? resuelto.Personas
                : [new PersonaDelRequisito(requisito.Id, requisito.DePersonaRelacionada!.Value, requisito.TodasLasRelaciones)];
            calculados.AddRange(personasDelRequisito.Select(p => CalcularDePersona(resuelto.Pedido, p, documentos, vinculo)));
        }

        return new PersonasCalculadas(calculados, compartidos);
    }

    /// <summary>Lo que calculan los requisitos de persona (ADR-0010) y cuántos documentos de personas se compartieron con el vínculo al calcularlos.</summary>
    public sealed record PersonasCalculadas(IReadOnlyList<RequisitoCalculado> Requisitos, int Compartidos);

    /// <summary>Qué cambió al recalcular las personas de un expediente: los eventos y si se compartió algún documento de una persona con el vínculo (hay que calcular su vigencia y su IA).</summary>
    public sealed record RecalculoDePersonas(IReadOnlyList<object> Eventos, bool Compartio)
    {
        public static readonly RecalculoDePersonas Nada = new([], false);
    }

    /// <summary>
    /// El requisito de una persona: con persona, su id es determinista por (requisito del flujo, persona) y la versión sale solo de los documentos de <b>esa</b> persona
    /// compartidos con el vínculo; sin persona, conserva el id del requisito del flujo y nace pendiente.
    /// </summary>
    internal static RequisitoCalculado CalcularDePersona(RequisitoPedido pedido, PersonaDelRequisito persona, IEnumerable<Documento> documentos, Vinculo vinculo)
    {
        var tipo = pedido.Tipo;
        var id = persona.PersonaId is { } personaId ? PersonaDelRequisito.IdDeRequisito(pedido.Requisito.Id, personaId) : pedido.Requisito.Id;
        var version = persona.PersonaId is { } dueno
            ? Cubre(tipo.Id, tipo.TipoCanonico, tipo.Ambito, documentos.Where(d => d.TerceroId == dueno), vinculo.Id)
            : null;
        return new RequisitoCalculado(id, tipo.Id, tipo.Codigo, tipo.Nombre, tipo.TipoCanonico, tipo.Ambito, pedido.Requisito.Obligatorio,
            pedido.Requisito.AreasQueRevisan, pedido.Requisito.AprobadoresRequeridos, version, DiasRevalidacion: tipo.DiasRevalidacion, Persona: persona);
    }

    /// <summary>
    /// Recalcula las personas de los requisitos de persona de un expediente abierto contra las relaciones de hoy (ADR-0010: «al abrir o recalcular»): resuelve de nuevo
    /// el flujo del expediente y deja que el expediente decida qué cambia (<see cref="Expediente.ResolverPersonas"/>). Vacío si el flujo no pide personas.
    /// </summary>
    public static async Task<RecalculoDePersonas> RecalcularPersonasAsync(IDocumentSession sesion, Vinculo vinculo, Expediente expediente, Guid tenantId,
        DateTimeOffset ahora, CancellationToken ct)
    {
        if (!expediente.EstaAbierto || !expediente.ConRequisitos || expediente.Flujo is not { } delFlujo)
            return RecalculoDePersonas.Nada;
        var flujo = await sesion.LoadAsync<Flujo>(delFlujo.FlujoId, ct);
        if (flujo?.Versiones.FirstOrDefault(v => v.Id == delFlujo.FlujoVersionId) is not { } version || !version.Requisitos.Any(r => r.EsDePersona))
            return RecalculoDePersonas.Nada;

        var tercero = await sesion.LoadAsync<Tercero>(vinculo.TerceroId, ct);
        if (tercero is null)
            return RecalculoDePersonas.Nada;
        var pedidos = (await DelFlujoAsync(sesion, version, await ContextoAsync(sesion, vinculo, ct, version), ct, incluirPersonas: true))
            .Where(p => p.Requisito.EsDePersona).ToList();
        if (pedidos.Count == 0)
            return RecalculoDePersonas.Nada;

        var deseados = await CalcularDePersonasAsync(sesion, vinculo, tercero, tenantId, pedidos, ahora, ct);
        return new RecalculoDePersonas(expediente.ResolverPersonas(deseados.Requisitos, ahora), deseados.Compartidos > 0);
    }

    /// <summary>Qué cambió al recalcular un expediente abierto contra la ficha del tercero y si se compartió algún documento con el vínculo (hay que calcular su vigencia y su IA).</summary>
    public sealed record RecalculoPorFicha(IReadOnlyList<object> Eventos, bool Compartio)
    {
        public static readonly RecalculoPorFicha Nada = new([], false);
    }

    /// <summary>
    /// Recalcula los requisitos de un expediente <b>abierto</b> contra lo que el tercero declara hoy en su ficha (EF-5): resuelve de nuevo, con la ficha de hoy,
    /// las condiciones de los requisitos de la versión del flujo con la que se abrió el expediente que la miran y deja que el expediente decida qué cambia
    /// (<see cref="Expediente.ResolverSegunFicha"/>): los que ahora aplican y no estaban se suman con el documento que el tercero ya tenga (se comparte con el vínculo
    /// como al abrir), los que dejan de aplicar pasan a <c>NoAplica</c> y los que vuelven a aplicar se vuelven a exigir. Es el mismo camino que el recálculo de
    /// personas relacionadas. Vacío si el flujo no mira la ficha, la empresa aún no puede verla (B-1) o el expediente está cerrado. El flujo del expediente no cambia
    /// (FR-3), solo sus requisitos.
    /// </summary>
    public static async Task<RecalculoPorFicha> RecalcularPorFichaAsync(IDocumentSession sesion, Vinculo vinculo, Expediente expediente, Guid tenantId,
        DateTimeOffset ahora, CancellationToken ct)
    {
        if (!expediente.EstaAbierto || !expediente.ConRequisitos || expediente.Flujo is not { } delFlujo || !FichaDeExigencia.Disponible(vinculo))
            return RecalculoPorFicha.Nada;
        var flujo = await sesion.LoadAsync<Flujo>(delFlujo.FlujoId, ct);
        if (flujo?.Versiones.FirstOrDefault(v => v.Id == delFlujo.FlujoVersionId) is not { } version || !FichaDeExigencia.LaMira(version) ||
            await sesion.LoadAsync<Tercero>(vinculo.TerceroId, ct) is not { } tercero)
            return RecalculoPorFicha.Nada;

        var contexto = await ContextoAsync(sesion, vinculo, ct, version);
        var hoy = CalculadoraDeVigencia.Fecha(ahora);

        // Los requisitos del flujo cuya condición mira la ficha y cuáles aplican hoy.
        var condicionados = version.Requisitos.Where(r => AtributosDeExigencia.MencionaFicha(r.Condicion)).ToList();
        var aplican = EvaluadorDeExigencia.Filtrar(condicionados, contexto).Select(r => r.Id).ToHashSet();
        var delFlujoDe = expediente.Requisitos
            .Select(r => (Requisito: r, IdDelFlujo: FichaDeExigencia.RequisitoDelFlujo(version, r.Id, r.Persona, r.TipoRequisito, r.Seccion)))
            .Where(x => x.IdDelFlujo is { } id && condicionados.Any(c => c.Id == id))
            .ToList();

        var noAplican = delFlujoDe.Where(x => !aplican.Contains(x.IdDelFlujo!.Value)).Select(x => x.Requisito.Id).ToHashSet();
        var vuelvenAAplicar = delFlujoDe.Where(x => x.Requisito.NoAplica && aplican.Contains(x.IdDelFlujo!.Value)).Select(x => x.Requisito.Id).ToHashSet();

        // Los que aplican y el expediente no tiene (una sección de la financiera trae un requisito por periodo). El expediente inicial trae todo lo que aplicaba al abrirse,
        // así que lo que falta es nuevo; una renovación o una actualización traen solo una parte (lo que venció o cambió): ahí es nuevo lo que la empresa nunca había pedido
        // a este vínculo, no lo que ya revisó en otro expediente y no entra por no haber cambiado.
        var yaEstan = delFlujoDe.Select(x => x.IdDelFlujo!.Value).ToHashSet();
        if (expediente.Tipo != TipoExpediente.Inicial)
        {
            var vinculoId = vinculo.Id;
            var expedienteId = expediente.Id;
            var anteriores = await sesion.Query<Expediente>().Where(e => e.VinculoId == vinculoId && e.Id != expedienteId).ToListAsync(ct);
            yaEstan.UnionWith(anteriores.SelectMany(e => e.Requisitos)
                .Select(r => FichaDeExigencia.RequisitoDelFlujo(version, r.Id, r.Persona, r.TipoRequisito, r.Seccion))
                .OfType<Guid>());
        }

        var faltantes = aplican.Where(id => !yaEstan.Contains(id)).ToHashSet();
        var ids = new HashSet<Guid>(faltantes);
        ids.UnionWith(RequisitosDeSeccion.Expandir(version.Requisitos.Where(r => r.EsSeccion && faltantes.Contains(r.Id)), hoy).Select(p => p.RequisitoId));

        IReadOnlyList<RequisitoCalculado> nuevos = [];
        var compartio = false;
        // Los documentos de lo que entra y de lo que vuelve a aplicar se comparten con el vínculo (RQ-3) antes de calcular, como al abrir: quien ya subió su RUT no lo vuelve a
        // subir, y mientras un requisito no aplicaba no recibió las versiones nuevas (ahora sí: la sincronización siguiente las adjunta).
        var delFlujoQueVuelve = delFlujoDe.Where(x => vuelvenAAplicar.Contains(x.Requisito.Id)).Select(x => x.IdDelFlujo!.Value);
        var aCompartir = new HashSet<Guid>(ids);
        aCompartir.UnionWith(delFlujoQueVuelve);
        if (aCompartir.Count > 0)
        {
            var pedidos = (await DelFlujoAsync(sesion, version, contexto, ct)).Where(p => aCompartir.Contains(p.Requisito.Id)).ToList();
            DocumentosDelVinculo? documentos = null;
            if (pedidos.Count > 0)
            {
                documentos = await ComparticionDeDocumentos.CompartirConVinculoAsync(sesion, vinculo, tenantId, CodigosGlobales(pedidos),
                    OrigenComparticion.Automatica, ahora, ct);
                compartio = documentos.Compartidos.Count > 0;
            }

            if (ids.Count > 0)
                nuevos = await ProcesoDeValidacion.CalcularRequisitosAsync(sesion, vinculo, tercero, tenantId, version, contexto, ids, documentos, ahora, ct,
                    enrutarPorSector: expediente.Tipo == TipoExpediente.Actualizacion);
        }

        // El porqué vigente de los que siguen pidiéndose (si el tercero cambia una especialidad por otra del mismo grupo, el motivo dice la nueva).
        var motivos = await FichaDeExigencia.MotivosAsync(sesion, version, contexto, ct);
        var motivosVigentes = delFlujoDe
            .Where(x => aplican.Contains(x.IdDelFlujo!.Value))
            .Select(x => new MotivosDelRequisito(x.Requisito.Id, motivos.GetValueOrDefault(x.IdDelFlujo!.Value) ?? []))
            .ToList();

        return new RecalculoPorFicha(expediente.ResolverSegunFicha(nuevos, noAplican, vuelvenAAplicar, motivosVigentes, ahora), compartio);
    }

    /// <summary>
    /// Marca en cada requisito ya cubierto si la misma empresa aprobó esa misma versión del documento en otro expediente
    /// aprobado del mismo tercero (otro tipo de vínculo, RQ-11): el expediente nuevo la aprueba sin volver a revisarla y
    /// solo pide lo que falte. Toma el expediente aprobado más reciente; la versión debe ser exactamente la misma.
    /// </summary>
    public static async Task<IReadOnlyList<RequisitoCalculado>> ConAprobacionesPreviasAsync(IQuerySession sesionDelTenant, Vinculo vinculo,
        IReadOnlyList<RequisitoCalculado> requisitos, CancellationToken ct)
    {
        if (requisitos.All(r => r.Version is null))
            return requisitos;

        var empresaId = vinculo.EmpresaId;
        var terceroId = vinculo.TerceroId;
        var vinculoId = vinculo.Id;
        var aprobados = (await sesionDelTenant.Query<Expediente>()
                .Where(e => e.EmpresaId == empresaId && e.TerceroId == terceroId && e.VinculoId != vinculoId && e.Estado == EstadoExpediente.Aprobado)
                .ToListAsync(ct))
            .OrderByDescending(e => e.ActualizadoEn)
            .ToList();
        if (aprobados.Count == 0)
            return requisitos;

        return [.. requisitos.Select(requisito =>
        {
            if (requisito.Version is not { } version)
                return requisito;
            var previa = aprobados
                .SelectMany(e => e.Requisitos
                    .Where(r => !r.Eximido && r.Estado == EstadoRequisito.Aprobado && r.VersionActual is { } v &&
                                v.DocumentoId == version.DocumentoId && v.Numero == version.Numero)
                    .Select(_ => new AprobacionPrevia(e.Id, e.Folio, e.TipoVinculoNombre, version.DocumentoId, version.Numero)))
                .FirstOrDefault();
            return previa is null ? requisito : requisito with { Previa = previa };
        })];
    }

    /// <summary>
    /// Versión que cubre un requisito: la actual del documento global del canónico (o del <c>PorVinculo</c> del vínculo y
    /// ese tipo), siempre que ya esté compartida con el vínculo y no esté vencida para él (RN-1: lo vencido se renueva con
    /// una versión nueva o se ratifica); si no, nula. Si el vínculo tiene lo que subió una persona con acceso aislado (el documento en cuarentena del
    /// canónico), lo cubre mientras la bóveda no tenga otra cosa compartida con el vínculo: con el acceso aprobado lo subido se promueve a la bóveda y,
    /// si su contenido es el mismo, el requisito no cambia de versión (no se revisa dos veces el mismo archivo); una versión distinta de la bóveda manda.
    /// </summary>
    public static VersionDeRequisito? Cubre(Guid tipoDocumentoTenantId, string? tipoCanonico, AmbitoDocumento ambito, IEnumerable<Documento> documentos,
        Guid vinculoId)
    {
        if (ambito != AmbitoDocumento.Global)
            return Vigente(documentos.FirstOrDefault(d => d.Ambito == AmbitoDocumento.PorVinculo && !d.EnCuarentena && d.VinculoId == vinculoId &&
                                                          d.TipoDocumentoTenantId == tipoDocumentoTenantId), vinculoId);

        var global = tipoCanonico is null ? null : GlobalVigente(documentos, tipoCanonico, vinculoId);
        var cuarentena = tipoCanonico is null
            ? null
            : Vigente(documentos.FirstOrDefault(d => d.EnCuarentena && d.VinculoId == vinculoId && d.TipoCanonico == tipoCanonico), vinculoId);
        return cuarentena is not null && (global is null || string.Equals(global.Sha256, cuarentena.Sha256, StringComparison.OrdinalIgnoreCase))
            ? cuarentena
            : global;
    }

    /// <summary>
    /// La versión vigente del documento global del canónico. Casi siempre hay uno solo; la certificación bancaria puede tener varios (el general sin cuenta y uno por cada cuenta,
    /// CB-1): cubre el que ya está compartido con el vínculo y no venció, y entre varios, el de una cuenta (la que el tercero designó con esa empresa) y el compartido más
    /// recientemente, así lo que cubre el requisito es lo que la empresa debe revisar.
    /// </summary>
    private static VersionDeRequisito? GlobalVigente(IEnumerable<Documento> documentos, string tipoCanonico, Guid vinculoId) =>
        documentos.Where(d => d.Ambito == AmbitoDocumento.Global && d.TipoCanonico == tipoCanonico)
            .OrderByDescending(d => d.CuentaBancariaId is not null)
            .ThenByDescending(d => d.Comparticiones.Where(c => c.VinculoId == vinculoId).Select(c => (DateTimeOffset?)c.Fecha).Max())
            .Select(d => Vigente(d, vinculoId))
            .FirstOrDefault(v => v is not null);

    /// <summary>La versión actual del documento si ya está compartida con el vínculo y no venció para él.</summary>
    private static VersionDeRequisito? Vigente(Documento? documento, Guid vinculoId)
    {
        if (documento?.VersionActual is not { } numero || !documento.EstaCompartida(numero, vinculoId))
            return null;

        var version = documento.VersionRequerida(numero);
        return version.VigenciaPara(vinculoId)?.VencidaEn is not null
            ? null
            : new VersionDeRequisito(documento.Id, numero, version.Sha256, version.CargadaEn);
    }

    /// <summary>
    /// Eventos que ponen al día el expediente con la bóveda: a cada requisito, la versión actual compartida con su vínculo
    /// (<see cref="Expediente.SincronizarVersiones"/>; idempotente). Lee los documentos con <c>ForTenant("boveda")</c> en la
    /// misma sesión del tenant.
    /// </summary>
    public static async Task<IReadOnlyList<object>> SincronizarAsync(IDocumentSession sesionDelTenant, Expediente expediente, DateTimeOffset ahora,
        CancellationToken ct)
    {
        if (!expediente.EstaAbierto || !expediente.ConRequisitos)
            return [];

        var terceroId = expediente.TerceroId;
        var boveda = sesionDelTenant.ForTenant(TenantsTecnicos.Boveda);
        var documentos = await boveda.Query<Documento>().Where(d => d.TerceroId == terceroId).ToListAsync(ct);
        // Los documentos de las personas relacionadas que piden los requisitos (ADR-0010): de otra bóveda, cada uno solo cubre el requisito de su persona.
        var personaIds = expediente.Requisitos.Where(r => r.Persona?.PersonaId is { } p && p != terceroId).Select(r => r.Persona!.PersonaId!.Value).Distinct().ToArray();
        var deLasPersonas = personaIds.Length == 0
            ? []
            : await boveda.Query<Documento>().Where(d => d.TerceroId.IsOneOf(personaIds) && d.Ambito == AmbitoDocumento.Global).ToListAsync(ct);
        var disponibles = new Dictionary<Guid, VersionDeRequisito>();
        foreach (var requisito in expediente.Requisitos.Where(r => !r.EsSeccion))
        {
            if (requisito.Persona is { } persona)
            {
                if (persona.PersonaId is not { } dueno)
                    continue;
                var delDueno = dueno == terceroId ? documentos : [.. deLasPersonas.Where(d => d.TerceroId == dueno)];
                if (Cubre(requisito.TipoDocumentoTenantId, requisito.TipoCanonico, requisito.Ambito, delDueno, expediente.VinculoId) is { } deLaPersona)
                    disponibles[requisito.Id] = deLaPersona;
                continue;
            }

            if (Cubre(requisito.TipoDocumentoTenantId, requisito.TipoCanonico, requisito.Ambito, documentos, expediente.VinculoId) is { } version)
                disponibles[requisito.Id] = version;
        }

        return expediente.SincronizarVersiones(disponibles, ahora, await EvaluarSeccionesAsync(sesionDelTenant, expediente, ct),
            Revalidacion.RetiradasDe([.. documentos, .. deLasPersonas], ahora));
    }

    /// <summary>
    /// Evaluación de la versión vigente de cada sección que pide el expediente (F2), solo si el tercero ya aceptó la invitación
    /// (antes, nada de su ficha está disponible para la empresa, B-1). La regla es la única de «completa para la empresa».
    /// </summary>
    private static async Task<IReadOnlyDictionary<Guid, EvaluacionDeSeccion>> EvaluarSeccionesAsync(IDocumentSession sesionDelTenant,
        Expediente expediente, CancellationToken ct)
    {
        var secciones = expediente.Requisitos.Where(r => r.EsSeccion && !r.Eximido).ToList();
        if (secciones.Count == 0 || await sesionDelTenant.LoadAsync<Vinculo>(expediente.VinculoId, ct) is not { InvitacionAceptada: true, BovedaDisponible: true })
            return new Dictionary<Guid, EvaluacionDeSeccion>();

        var ficha = await FichaAsync(sesionDelTenant, expediente.TerceroId, ct);
        var evaluaciones = new Dictionary<Guid, EvaluacionDeSeccion>();
        foreach (var requisito in secciones)
        {
            if (CatalogoDeSecciones.Buscar(requisito.Seccion) is not { } definicion)
                continue;
            var seccion = ficha.GetValueOrDefault(SeccionDeFicha.IdPara(expediente.TerceroId, definicion.Codigo, requisito.Periodo));
            evaluaciones[requisito.Id] = RequisitosDeSeccion.Evaluar(definicion, requisito.Periodo, requisito.ExigeSoporte, seccion);
        }

        return evaluaciones;
    }

    /// <summary>
    /// Vínculos (de cualquier tenant) que piden el canónico global <paramref name="codigo"/>: su expediente abierto tiene
    /// un requisito de ese tipo o su flujo vigente (el del vínculo publicado, si no el por defecto) lo pide a este tercero
    /// en ese vínculo (RQ-3, RQ-12).
    /// </summary>
    public static async Task<IReadOnlySet<Guid>> VinculosQuePidenAsync(IQuerySession consulta, IReadOnlyList<Vinculo> vinculos, string codigo,
        CancellationToken ct)
    {
        var piden = new HashSet<Guid>();
        if (vinculos.Count == 0)
            return piden;

        var ids = vinculos.Select(v => v.Id).ToArray();
        var expedientes = await consulta.Query<Expediente>().Where(e => e.AnyTenant() && e.VinculoId.IsOneOf(ids)).ToListAsync(ct);
        foreach (var expediente in expedientes.Where(e => e.EstaAbierto))
        {
            // El requisito de otra persona (ADR-0010) no pide el documento del tercero; el de una persona natural que es su propio representante, sí.
            if (expediente.Requisitos.Any(r => !r.NoAplica && r.Ambito == AmbitoDocumento.Global && r.TipoCanonico == codigo &&
                                               (r.Persona is null || r.Persona.PersonaId == expediente.TerceroId)))
                piden.Add(expediente.VinculoId);
        }

        var claves = vinculos.Select(v => FlujoPorDefecto.Clave(v.EmpresaId, v.TipoVinculoId)).Distinct().ToArray();
        var porDefecto = await consulta.Query<FlujoPorDefecto>().Where(p => p.AnyTenant() && p.Id.IsOneOf(claves)).ToListAsync(ct);
        // Los flujos de cada (empresa, tipo): el del vínculo, el por defecto y los que se escogen por regla de selección (FR-1).
        var flujos = await ProcesoDeValidacion.CargarFlujosDeLosVinculosAsync(consulta, vinculos, ct);
        if (flujos.Count == 0)
            return piden;

        var tipoIds = flujos.SelectMany(f => f.VersionPublicada?.Requisitos ?? []).Select(r => r.TipoDocumentoTenantId).Distinct().ToArray();
        if (tipoIds.Length == 0)
            return piden;

        var tipos = await consulta.Query<TipoDocumentoTenant>().Where(t => t.AnyTenant() && t.Id.IsOneOf(tipoIds)).ToListAsync(ct);
        var delCodigo = tipos.Where(t => t.Ambito == AmbitoDocumento.Global && t.TipoCanonico == codigo).Select(t => t.Id).ToHashSet();
        if (delCodigo.Count == 0)
            return piden;

        var terceroIds = vinculos.Select(v => v.TerceroId).Distinct().ToArray();
        var terceros = (await consulta.LoadManyAsync<Tercero>(ct, terceroIds)).ToDictionary(t => t.Id);
        var fichas = await FichaDeExigencia.CargarDeLosVinculosAsync(consulta, vinculos, flujos, ct);
        var tipoVinculoIds = vinculos.Select(v => v.TipoVinculoId).Distinct().ToArray();
        var tiposVinculo = (await consulta.Query<TipoVinculo>().Where(t => t.AnyTenant() && t.Id.IsOneOf(tipoVinculoIds)).ToListAsync(ct))
            .ToDictionary(t => t.Id);
        foreach (var vinculo in vinculos)
        {
            if (!terceros.TryGetValue(vinculo.TerceroId, out var tercero))
                continue;
            var contexto = ContextoDeExigencia.De(tercero, tiposVinculo.GetValueOrDefault(vinculo.TipoVinculoId)?.Codigo ?? string.Empty, vinculo.Atributos).ConFicha(fichas.GetValueOrDefault(vinculo.TerceroId));
            if (ProcesoDeValidacion.FlujoVigente(vinculo, flujos, porDefecto, contexto) is not { } version)
                continue;
            if (EvaluadorDeExigencia.Filtrar(version.Requisitos.Where(r => !r.EsDePersona && delCodigo.Contains(r.TipoDocumentoTenantId)), contexto).Count > 0)
                piden.Add(vinculo.Id);
        }

        return piden;
    }

    /// <summary>
    /// Vínculos (de cualquier tenant) a los que hay que compartir el documento <paramref name="codigo"/> de la persona <paramref name="personaId"/> (ADR-0010): su expediente
    /// abierto ya tiene un requisito de ese documento para esa persona, o su flujo vigente lo pide por un rol que esa persona cumple hoy ante el tercero del vínculo (la
    /// relación principal vigente del rol, o cualquiera con «todas las relaciones»). Lo que otro tercero, otra empresa o la propia persona tengan no entra: solo lo que
    /// el flujo de ese vínculo pide por esa relación.
    /// </summary>
    public static async Task<IReadOnlySet<Guid>> VinculosQuePidenPersonaAsync(IQuerySession consulta, IReadOnlyList<Vinculo> vinculos, Guid personaId, string codigo,
        DateOnly hoy, CancellationToken ct)
    {
        var piden = new HashSet<Guid>();
        if (vinculos.Count == 0)
            return piden;

        var ids = vinculos.Select(v => v.Id).ToArray();
        var expedientes = await consulta.Query<Expediente>().Where(e => e.AnyTenant() && e.VinculoId.IsOneOf(ids)).ToListAsync(ct);
        foreach (var expediente in expedientes.Where(e => e.EstaAbierto))
        {
            if (expediente.Requisitos.Any(r => !r.NoAplica && r.Persona?.PersonaId == personaId && r.TipoCanonico == codigo))
                piden.Add(expediente.VinculoId);
        }

        var flujos = await ProcesoDeValidacion.CargarFlujosDeLosVinculosAsync(consulta, vinculos, ct);
        if (flujos.Count == 0)
            return piden;
        var claves = vinculos.Select(v => FlujoPorDefecto.Clave(v.EmpresaId, v.TipoVinculoId)).Distinct().ToArray();
        var porDefecto = await consulta.Query<FlujoPorDefecto>().Where(p => p.AnyTenant() && p.Id.IsOneOf(claves)).ToListAsync(ct);
        var tipoIds = flujos.SelectMany(f => f.VersionPublicada?.Requisitos ?? []).Where(r => r.EsDePersona).Select(r => r.TipoDocumentoTenantId).Distinct().ToArray();
        if (tipoIds.Length == 0)
            return piden;

        var delCodigo = (await consulta.Query<TipoDocumentoTenant>().Where(t => t.AnyTenant() && t.Id.IsOneOf(tipoIds)).ToListAsync(ct))
            .Where(t => t.Ambito == AmbitoDocumento.Global && t.TipoCanonico == codigo).Select(t => t.Id).ToHashSet();
        if (delCodigo.Count == 0)
            return piden;

        var terceroIds = vinculos.Select(v => v.TerceroId).Distinct().ToArray();
        var terceros = (await consulta.LoadManyAsync<Tercero>(ct, terceroIds)).ToDictionary(t => t.Id);
        var fichas = await FichaDeExigencia.CargarDeLosVinculosAsync(consulta, vinculos, flujos, ct);
        var relaciones = (await consulta.Query<RelacionEntreTerceros>().Where(r => r.AnyTenant() && r.DestinoId.IsOneOf(terceroIds)).ToListAsync(ct))
            .GroupBy(r => r.DestinoId).ToDictionary(g => g.Key, g => (IReadOnlyList<RelacionEntreTerceros>)[.. g]);
        var tiposVinculo = (await consulta.Query<TipoVinculo>().Where(t => t.AnyTenant() && t.Id.IsOneOf(vinculos.Select(v => v.TipoVinculoId).Distinct().ToArray())).ToListAsync(ct))
            .ToDictionary(t => t.Id);
        foreach (var vinculo in vinculos)
        {
            if (!terceros.TryGetValue(vinculo.TerceroId, out var tercero))
                continue;
            var contexto = ContextoDeExigencia.De(tercero, tiposVinculo.GetValueOrDefault(vinculo.TipoVinculoId)?.Codigo ?? string.Empty, vinculo.Atributos).ConFicha(fichas.GetValueOrDefault(vinculo.TerceroId));
            if (ProcesoDeValidacion.FlujoVigente(vinculo, flujos, porDefecto, contexto) is not { } version)
                continue;
            var delTercero = relaciones.GetValueOrDefault(vinculo.TerceroId) ?? [];
            foreach (var requisito in EvaluadorDeExigencia.Filtrar(version.Requisitos.Where(r => r.EsDePersona && delCodigo.Contains(r.TipoDocumentoTenantId)), contexto))
            {
                if (RelacionesDeTercero.Resolver(delTercero, requisito.DePersonaRelacionada!.Value, requisito.TodasLasRelaciones, hoy).Any(r => r.OrigenId == personaId))
                    piden.Add(vinculo.Id);
            }
        }

        return piden;
    }
}
