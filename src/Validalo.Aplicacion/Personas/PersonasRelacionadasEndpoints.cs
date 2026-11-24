using Marten;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Aplicacion.Ficha;
using Validalo.Aplicacion.Interesado;
using Validalo.Contratos;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Identidad;
using Validalo.Dominio.Identificaciones;
using Validalo.Dominio.Plataforma;
using Validalo.Dominio.Terceros;
using Wolverine;
using Wolverine.Http;

namespace Validalo.Aplicacion.Personas;

/// <summary>
/// Lo común de las personas relacionadas vistas desde el tercero y desde la empresa (ADR-0010): las relaciones de un tercero, comprobar que una persona se relaciona con él
/// (única llave para tocar su bóveda) y la traducción a DTO con el estado de los documentos de cada persona.
/// </summary>
public static class PersonasDelTercero
{
    /// <summary>Documentos que pueden vivir en la bóveda de una persona (los canónicos de archivo marcados <c>dePersonaRelacionada</c>), en el orden del catálogo.</summary>
    public static IReadOnlyList<TipoDocumentoCanonico> TiposDePersona { get; } =
    [
        .. CatalogoCanonico.Todos.Where(t => t is { DePersonaRelacionada: true, Clase: ClaseDocumento.Archivo, Ambito: AmbitoDocumento.Global })
    ];

    public static async Task<IReadOnlyList<RelacionEntreTerceros>> DelDestinoAsync(IQuerySession consulta, Guid destinoId, CancellationToken ct) =>
        await consulta.Query<RelacionEntreTerceros>().Where(r => r.AnyTenant() && r.DestinoId == destinoId).ToListAsync(ct);

    /// <summary>
    /// La relación vigente (confirmada y sin terminar) de <paramref name="personaId"/> con <paramref name="destinoId"/>; 404 <c>persona-no-encontrada</c> si no la hay:
    /// una persona que no se relaciona con el tercero no existe para él (no se distingue de una que no existe), y su bóveda no se abre.
    /// </summary>
    public static async Task<RelacionEntreTerceros> ExigirRelacionAsync(IQuerySession consulta, Guid destinoId, Guid personaId, DateOnly hoy, CancellationToken ct)
    {
        var relaciones = await consulta.Query<RelacionEntreTerceros>().Where(r => r.AnyTenant() && r.DestinoId == destinoId && r.OrigenId == personaId).ToListAsync(ct);
        return relaciones.Where(r => r.EsVigente(hoy)).OrderByDescending(r => r.Principal).FirstOrDefault()
               ?? throw ReglaDeNegocioException.NoEncontrado("persona-no-encontrada", "Esa persona no está relacionada con tu información.");
    }

    public static string TextoDelRol(TipoRelacionTerceros tipo) => tipo switch
    {
        TipoRelacionTerceros.RepresentanteLegal => "Representante legal",
        TipoRelacionTerceros.Suplente => "Suplente del representante legal",
        TipoRelacionTerceros.Socio => "Socio o accionista",
        TipoRelacionTerceros.BeneficiarioFinal => "Beneficiario final",
        _ => "Miembro del consorcio"
    };

    /// <summary>Lo que el tercero ve de una relación suya: la persona, cómo se relaciona y el estado de sus documentos (<paramref name="pedidos"/>: lo que sus empresas le piden).</summary>
    public static RelacionEntreTercerosDto ADto(RelacionEntreTerceros relacion, Tercero persona, IReadOnlyList<Documento> documentosDeLaPersona,
        IReadOnlySet<(Guid PersonaId, string Codigo)> pedidos, ReemplazaRelacionDto? reemplaza)
    {
        var documentos = TiposDePersona.Select(tipo =>
        {
            var documento = documentosDeLaPersona.FirstOrDefault(d => d.Ambito == AmbitoDocumento.Global && d.TipoCanonico == tipo.Codigo);
            var version = documento is null ? null
                : documento.VersionActual is { } actual ? documento.Buscar(actual)
                : documento.Versiones.OrderByDescending(v => v.Numero).FirstOrDefault();
            return new DocumentoDePersonaDto(tipo.Codigo, tipo.Nombre, documento?.Id, version?.Numero, version?.Estado.ToString(), version?.CargadaEn,
                pedidos.Contains((persona.Id, tipo.Codigo)));
        }).ToList();
        return new RelacionEntreTercerosDto(relacion.Id, persona.Id, persona.Identificacion.ADto(), persona.Nombre, relacion.Tipo.ToString(), relacion.Principal,
            relacion.Participacion, relacion.Cargo, relacion.VigenteDesde, relacion.VigenteHasta, relacion.Estado.ToString(), relacion.Fuente.ToString(), relacion.DeFicha,
            relacion.Confianza, relacion.ConfirmadaEn, documentos, reemplaza);
    }
}

/// <summary>
/// Las personas relacionadas del tercero vistas por él (ADR-0010, PR-7): lista, declarar, confirmar o descartar lo que detectó la IA y terminar una relación. Es un
/// grupo propio de la sesión (<see cref="GrupoDeAcceso.Personas"/>): solo un contacto del tercero, nunca una sesión aislada ni un token embebido. Los documentos de cada persona
/// se suben por la carga de siempre (<c>POST /public/v1/boveda/documentos</c> con <c>terceroRelacionadoId</c>) y van a <b>su</b> bóveda.
/// </summary>
public static class PersonasRelacionadasEndpoints
{
    /// <summary>
    /// Personas relacionadas vigentes del tercero y las propuestas pendientes de confirmar (lo que la IA detectó en la Cámara de comercio). Antes de responder pone al día las
    /// que salen de su ficha legal (idempotente): quien ya tenía su ficha las ve sin hacer nada. Cada una trae el estado de los documentos de su bóveda y si alguna de las
    /// empresas del tercero se los pide.
    /// </summary>
    [WolverineGet("/public/v1/tercero/relaciones")]
    [Authorize(Policy = ReclamosTercero.Politica)]
    public static async Task<IReadOnlyList<RelacionEntreTercerosDto>> Listar(HttpContext http, IDocumentStore store, ISesiones sesiones, TimeProvider reloj, CancellationToken ct)
    {
        var tercero = SesionDeTercero.De(http.User, GrupoDeAcceso.Personas);
        await SincronizacionDePersonas.SincronizarAsync(store, reloj, tercero.TerceroId, null, ct);
        return await ListarDeAsync(sesiones, tercero, reloj.Hoy(), ct);
    }

    internal static async Task<IReadOnlyList<RelacionEntreTercerosDto>> ListarDeAsync(ISesiones sesiones, SesionDeTercero sesion, DateOnly hoy, CancellationToken ct)
    {
        await using var global = sesiones.ConsultaGlobal();
        var relaciones = (await PersonasDelTercero.DelDestinoAsync(global, sesion.TerceroId, ct))
            .Where(r => r.EsVigente(hoy) || r.EstaPropuesta)
            .OrderBy(r => r.Tipo).ThenByDescending(r => r.Principal).ThenBy(r => r.VigenteDesde).ThenBy(r => r.CreadaEn)
            .ToList();
        if (relaciones.Count == 0)
            return [];

        var personaIds = relaciones.Select(r => r.OrigenId).Distinct().ToArray();
        var personas = (await global.LoadManyAsync<Tercero>(ct, personaIds)).ToDictionary(p => p.Id);
        await using var boveda = sesiones.ConsultaBoveda();
        var documentos = (await boveda.Query<Documento>().Where(d => d.TerceroId.IsOneOf(personaIds) && d.Ambito == AmbitoDocumento.Global).ToListAsync(ct))
            .GroupBy(d => d.TerceroId).ToDictionary(g => g.Key, g => (IReadOnlyList<Documento>)[.. g]);
        var pedidos = await PedidosAsync(global, sesion, ct);

        var vigentesPorTipo = relaciones.Where(r => r.EsVigente(hoy)).ToLookup(r => r.Tipo);
        return
        [
            .. relaciones.Where(r => personas.ContainsKey(r.OrigenId)).Select(r =>
            {
                ReemplazaRelacionDto? reemplaza = null;
                if (r.EstaPropuesta && r.Principal && vigentesPorTipo[r.Tipo].FirstOrDefault(v => v.Principal) is { } saliente && personas.TryGetValue(saliente.OrigenId, out var anterior))
                    reemplaza = new ReemplazaRelacionDto(saliente.Id, anterior.Nombre, anterior.Identificacion.ADto());
                return PersonasDelTercero.ADto(r, personas[r.OrigenId], documentos.GetValueOrDefault(r.OrigenId) ?? [], pedidos, reemplaza);
            })
        ];
    }

    /// <summary>(Persona, canónico) de los documentos que los expedientes abiertos de los vínculos de la sesión le piden al tercero para sus personas.</summary>
    private static async Task<IReadOnlySet<(Guid PersonaId, string Codigo)>> PedidosAsync(IQuerySession global, SesionDeTercero sesion, CancellationToken ct)
    {
        var vinculos = sesion.Vinculos.Select(v => v.VinculoId).ToArray();
        if (vinculos.Length == 0)
            return new HashSet<(Guid, string)>();
        var expedientes = await global.Query<Expediente>().Where(e => e.AnyTenant() && e.TerceroId == sesion.TerceroId && e.VinculoId.IsOneOf(vinculos)).ToListAsync(ct);
        return expedientes.Where(e => e.EstaAbierto)
            .SelectMany(e => e.Requisitos.Where(r => r.Persona?.PersonaId is not null && r.TipoCanonico is not null)
                .Select(r => (r.Persona!.PersonaId!.Value, r.TipoCanonico!)))
            .ToHashSet();
    }

    /// <summary>
    /// El tercero declara una persona relacionada que la ficha legal no maneja (beneficiario final o miembro de consorcio). Los representantes legales, suplentes y socios se registran
    /// en la información legal de la ficha, que es el único lugar para ellos (decisión de Producto del 2026-11-24): 422 <c>persona-se-registra-en-la-ficha</c>. Si ya figuraba
    /// terminada, descartada o como una propuesta de la IA, la declaración la devuelve a vigente; si ya era vigente, 409 <c>relacion-duplicada</c>. Con <c>principal</c>, la que era
    /// principal de ese tipo deja de serlo.
    /// </summary>
    [WolverinePost("/public/v1/tercero/relaciones")]
    [Authorize(Policy = ReclamosTercero.Politica)]
    public static async Task<IResult> Declarar(DeclararRelacionDto dto, HttpContext http, IDocumentStore store, ISesiones sesiones, IMessageBus mensajes, TimeProvider reloj,
        CancellationToken ct)
    {
        var sesion = SesionDeTercero.De(http.User, GrupoDeAcceso.Personas);
        if (!Enum.TryParse<TipoRelacionTerceros>(dto.Tipo, true, out var tipo) || !Enum.IsDefined(tipo))
            throw ReglaDeNegocioException.Validacion("tipo-relacion-invalido",
                $"«{dto.Tipo}» no es un tipo de relación ({string.Join(", ", Enum.GetNames<TipoRelacionTerceros>())}).");
        if (PersonasDeLaFicha.LaFichaManeja(tipo))
            throw ReglaDeNegocioException.Validacion("persona-se-registra-en-la-ficha",
                $"{PersonasDelTercero.TextoDelRol(tipo)}: esta persona se registra en la información legal de tu ficha, no en Personas relacionadas. Agrégala en «Información legal» y aparecerá aquí.");
        var nombre = (dto.Nombre ?? string.Empty).Trim();
        if (nombre.Length == 0)
            throw ReglaDeNegocioException.Validacion("nombre-requerido", "Indica el nombre de la persona.");
        if (nombre.Length > 250)
            throw ReglaDeNegocioException.Validacion("nombre-demasiado-largo", "El nombre admite hasta 250 caracteres.");
        var identificacion = (dto.Identificacion ?? throw ReglaDeNegocioException.Validacion("identificacion-requerida", "Indica la identificación de la persona.")).ADominio();
        // Persona natural: su documento de identidad (cédula, extranjería, pasaporte…). Un NIT, RUT o CUIT es de una sociedad (o de ambas): no es una persona relacionada.
        if (CatalogoIdentificacion.Buscar(identificacion.Pais, identificacion.Tipo) is not { } tipoId ||
            !(tipoId.AplicaA == AplicaA.Natural || tipoId.Codigo == "ID_FISCAL"))
            throw ReglaDeNegocioException.Validacion("persona-no-natural", "Una persona relacionada es una persona natural: usa su cédula, cédula de extranjería o pasaporte.");

        var terceroId = sesion.TerceroId;
        var ahora = reloj.GetUtcNow();
        var hoy = reloj.Hoy();
        var relacionId = await Peticiones.ConReintentosAsync(async () =>
        {
            await using var escritura = store.LightweightSession(TenantsTecnicos.Boveda);
            escritura.SetHeader("actorTipo", ActorTipo.Tercero.ToString());
            escritura.SetHeader("actorId", terceroId.ToString());
            var tercero = await escritura.LoadAsync<Tercero>(terceroId, ct)
                          ?? throw ReglaDeNegocioException.NoEncontrado("tercero-no-encontrado", "No existe ese tercero.");
            if (identificacion.Clave == tercero.Identificacion.Clave)
                throw ReglaDeNegocioException.Validacion("relacion-consigo-misma", "Una persona no se relaciona consigo misma.");

            var declarada = new PersonaDeclarada(identificacion, nombre, tipo, dto.Principal, dto.Participacion, dto.Cargo);
            var (personaDe, _) = await SincronizacionDePersonas.AsegurarPersonasAsync(escritura, tercero, [declarada], ahora, ct);
            var personaId = personaDe[declarada.Clave];
            var id = RelacionEntreTerceros.IdPara(terceroId, personaId, tipo);
            var delTercero = await escritura.Query<RelacionEntreTerceros>().Where(r => r.DestinoId == terceroId).ToListAsync(ct);
            var existente = delTercero.FirstOrDefault(r => r.Id == id);

            var eventos = new List<object>();
            if (existente is null)
            {
                eventos.Add(RelacionEntreTerceros.Registrar(personaId, terceroId, tipo, dto.Principal, dto.Participacion, dto.Cargo, hoy, FuenteDeRelacion.Declarada, false,
                    terceroId.ToString(), ahora));
            }
            else if (existente.Estado == EstadoDeRelacion.Confirmada)
            {
                throw ReglaDeNegocioException.Conflicto("relacion-duplicada", "Esa persona ya figura con ese rol.");
            }
            else if (existente.Estado == EstadoDeRelacion.Propuesta)
            {
                eventos.Add(existente.Confirmar(terceroId.ToString(), ViaDeConfirmacionDeRelacion.Tercero, hoy, ahora)!);
                var confirmada = existente.Proyectar(eventos);
                if (confirmada.MarcarPrincipal(dto.Principal, ahora) is { } marca)
                    eventos.Add(marca);
                if (confirmada.Actualizar(dto.Participacion, dto.Cargo, ahora) is { } cambio)
                    eventos.Add(cambio);
            }
            else if (existente.Restablecer(hoy, dto.Principal, dto.Participacion, dto.Cargo, terceroId.ToString(), ahora) is { } restablecida)
            {
                eventos.Add(restablecida);
            }

            if (existente is null)
                escritura.Events.StartStream<RelacionEntreTerceros>(id, eventos.ToArray());
            else
                (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(id, ct)).AppendMany(eventos.ToArray());

            if (dto.Principal)
                await DejarDeSerPrincipalAsync(escritura, delTercero.Where(r => r.Id != id && r.Tipo == tipo && r.Principal && r.EsVigente(hoy)), ahora, ct);
            await escritura.SaveChangesAsync(ct);
            return id;
        });

        await SincronizacionDePersonas.AvisarDeCambiosAsync(store, mensajes, terceroId, ct);
        var lista = await ListarDeAsync(sesiones, sesion, hoy, ct);
        return Results.Created($"/public/v1/tercero/relaciones/{relacionId}", lista.First(r => r.Id == relacionId));
    }

    /// <summary>
    /// Confirma lo que detectó la IA (una propuesta): la persona pasa a ser la relación vigente del tipo. Como la ficha legal es el único lugar donde se registran los representantes
    /// legales, suplentes y socios, confirmar también escribe a la persona en la sección <c>FICHA_LEGAL</c> (versión nueva, en la misma transacción) y la relación queda de la ficha.
    /// Si la propuesta es la principal, la que lo era sale (termina y deja la ficha) y, con ella, lo que se había validado de ella en los expedientes abiertos: sus requisitos de
    /// persona se eximen y los de la persona nueva se piden (ADR-0010, regla 5). Repetir la confirmación no cambia nada.
    /// </summary>
    [WolverinePost("/public/v1/tercero/relaciones/{id}/confirmar")]
    [Authorize(Policy = ReclamosTercero.Politica)]
    public static async Task<RelacionEntreTercerosDto> Confirmar(Guid id, HttpContext http, IDocumentStore store, ISesiones sesiones, IMessageBus mensajes, TimeProvider reloj,
        CancellationToken ct)
    {
        var sesion = SesionDeTercero.De(http.User, GrupoDeAcceso.Personas);
        var terceroId = sesion.TerceroId;
        var ahora = reloj.GetUtcNow();
        var hoy = reloj.Hoy();
        // La sesión sale del outbox de la petición: lo que publica el guardado de la ficha (avisos a los vínculos, a las listas restrictivas y a los cruces) viaja en la misma transacción.
        var yaAvisada = await GuardadoDeSecciones.ConReintentosAsync(async () =>
        {
            await using var escritura = sesiones.Boveda(mensajes);
            escritura.SetHeader("actorTipo", ActorTipo.Tercero.ToString());
            escritura.SetHeader("actorId", terceroId.ToString());
            var delTercero = await escritura.Query<RelacionEntreTerceros>().Where(r => r.DestinoId == terceroId).ToListAsync(ct);
            var relacion = delTercero.FirstOrDefault(r => r.Id == id)
                           ?? throw ReglaDeNegocioException.NoEncontrado("relacion-no-encontrada", "No existe esa relación.");
            if (relacion.Confirmar(terceroId.ToString(), ViaDeConfirmacionDeRelacion.Tercero, hoy, ahora) is not { } confirmada)
                return false;

            // La que era la principal de su tipo sale: una sola principal vigente por tipo ante el tercero.
            IReadOnlyList<RelacionEntreTerceros> salientes = relacion.Principal
                ? [.. delTercero.Where(r => r.Id != id && r.Tipo == relacion.Tipo && r.Principal && r.EsVigente(hoy))]
                : [];
            if (PersonasDeLaFicha.LaFichaManeja(relacion.Tipo))
            {
                // La ficha legal es el único lugar donde se registran estas personas: confirmar también las escribe en ella, en esta misma transacción.
                var tercero = await escritura.LoadAsync<Tercero>(terceroId, ct)
                              ?? throw ReglaDeNegocioException.NoEncontrado("tercero-no-encontrado", "No existe ese tercero.");
                var avisada = await PersonasEnLaFicha.ConfirmarAsync(escritura, sesiones, mensajes, tercero, relacion, confirmada, delTercero, salientes, hoy, ahora, ct);
                await escritura.SaveChangesAsync(ct);
                return avisada;
            }

            (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(id, ct)).AppendOne(confirmada);
            await TerminarSalientesAsync(escritura, salientes, hoy, "Reemplazada por la persona que el tercero confirmó.", terceroId.ToString(), ahora, ct);
            await escritura.SaveChangesAsync(ct);
            return false;
        }, mensajes);

        if (!yaAvisada)
            await SincronizacionDePersonas.AvisarDeCambiosAsync(store, mensajes, terceroId, ct);
        return (await ListarDeAsync(sesiones, sesion, hoy, ct)).FirstOrDefault(r => r.Id == id)
               ?? throw ReglaDeNegocioException.NoEncontrado("relacion-no-encontrada", "No existe esa relación.");
    }

    /// <summary>Descarta lo que detectó la IA: la propuesta no cambia nada y no vuelve a ofrecerse por esa versión del documento.</summary>
    [WolverinePost("/public/v1/tercero/relaciones/{id}/descartar")]
    [Authorize(Policy = ReclamosTercero.Politica)]
    public static async Task<IResult> Descartar(Guid id, HttpContext http, IDocumentStore store, TimeProvider reloj, CancellationToken ct)
    {
        var sesion = SesionDeTercero.De(http.User, GrupoDeAcceso.Personas);
        var terceroId = sesion.TerceroId;
        var ahora = reloj.GetUtcNow();
        await Peticiones.ConReintentosAsync(async () =>
        {
            await using var escritura = store.LightweightSession(TenantsTecnicos.Boveda);
            escritura.SetHeader("actorTipo", ActorTipo.Tercero.ToString());
            escritura.SetHeader("actorId", terceroId.ToString());
            var relacion = (await escritura.Query<RelacionEntreTerceros>().Where(r => r.DestinoId == terceroId && r.Id == id).ToListAsync(ct)).FirstOrDefault()
                           ?? throw ReglaDeNegocioException.NoEncontrado("relacion-no-encontrada", "No existe esa relación.");
            if (relacion.Descartar(terceroId.ToString(), ahora) is not { } descartada)
                return 0;
            (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(id, ct)).AppendOne(descartada);
            await escritura.SaveChangesAsync(ct);
            return 1;
        });
        return Results.NoContent();
    }

    /// <summary>
    /// Termina una relación vigente que el tercero declaró a mano (la persona deja de ser representante, socio…): desde mañana no cuenta. 409 <c>relacion-de-la-ficha</c> si la
    /// persona figura en su información legal (se quita de la ficha, que es la fuente) y <c>relacion-propuesta</c> si es una propuesta (se descarta).
    /// </summary>
    [WolverineDelete("/public/v1/tercero/relaciones/{id}")]
    [Authorize(Policy = ReclamosTercero.Politica)]
    public static async Task<IResult> Terminar(Guid id, HttpContext http, IDocumentStore store, IMessageBus mensajes, TimeProvider reloj, CancellationToken ct)
    {
        var sesion = SesionDeTercero.De(http.User, GrupoDeAcceso.Personas);
        var terceroId = sesion.TerceroId;
        var ahora = reloj.GetUtcNow();
        var hoy = reloj.Hoy();
        var cambio = await Peticiones.ConReintentosAsync(async () =>
        {
            await using var escritura = store.LightweightSession(TenantsTecnicos.Boveda);
            escritura.SetHeader("actorTipo", ActorTipo.Tercero.ToString());
            escritura.SetHeader("actorId", terceroId.ToString());
            var relacion = (await escritura.Query<RelacionEntreTerceros>().Where(r => r.DestinoId == terceroId && r.Id == id).ToListAsync(ct)).FirstOrDefault()
                           ?? throw ReglaDeNegocioException.NoEncontrado("relacion-no-encontrada", "No existe esa relación.");
            if (relacion.DeFicha && relacion.Estado == EstadoDeRelacion.Confirmada)
                throw ReglaDeNegocioException.Conflicto("relacion-de-la-ficha",
                    "Esa persona figura en tu información legal: quítala de la ficha para terminar la relación.");
            if (relacion.Terminar(hoy, "El tercero la terminó.", terceroId.ToString(), ahora) is not { } terminada)
                return false;
            (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(id, ct)).AppendOne(terminada);
            await escritura.SaveChangesAsync(ct);
            return true;
        });

        if (cambio)
            await SincronizacionDePersonas.AvisarDeCambiosAsync(store, mensajes, terceroId, ct);
        return Results.NoContent();
    }

    private static async Task DejarDeSerPrincipalAsync(IDocumentSession escritura, IEnumerable<RelacionEntreTerceros> relaciones, DateTimeOffset ahora, CancellationToken ct)
    {
        foreach (var relacion in relaciones)
        {
            if (relacion.MarcarPrincipal(false, ahora) is { } marca)
                (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(relacion.Id, ct)).AppendOne(marca);
        }
    }

    internal static async Task TerminarSalientesAsync(IDocumentSession escritura, IEnumerable<RelacionEntreTerceros> relaciones, DateOnly hoy, string motivo, string por,
        DateTimeOffset ahora, CancellationToken ct)
    {
        foreach (var relacion in relaciones)
        {
            if (relacion.Terminar(hoy, motivo, por, ahora) is { } terminada)
                (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(relacion.Id, ct)).AppendOne(terminada);
        }
    }
}

/// <summary>
/// Las personas relacionadas del tercero de un vínculo, vistas por la empresa (ADR-0010, PR-7): solo las relaciones vigentes y, de cada persona, los documentos de su bóveda que
/// <b>se compartieron con este vínculo</b>. La empresa no ve el resto de la bóveda de la persona ni las relaciones que la persona tenga con otros terceros.
/// </summary>
public static class PersonasDelVinculoEndpoints
{
    [WolverineGet("/api/v1/vinculos/{id}/personas-relacionadas")]
    [Authorize(Policy = Permisos.DocumentosLeer)]
    public static async Task<IReadOnlyList<PersonaDelVinculoDto>> Listar(Guid id, SesionDeEmpresa empresa, ISesiones sesiones, TimeProvider reloj, CancellationToken ct)
    {
        var vinculo = await empresa.CargarVinculoAsync(id, ct);
        // Como los documentos del vínculo: invitación aceptada, vínculo no anulado y, con acceso aislado, nada de la bóveda del tercero.
        if (!DocumentosDeVinculoEndpoints.Visible(vinculo) || !vinculo.BovedaDisponible)
            return [];

        var hoy = reloj.Hoy();
        await using var global = sesiones.ConsultaGlobal();
        var relaciones = RelacionesDeTercero.Vigentes(await PersonasDelTercero.DelDestinoAsync(global, vinculo.TerceroId, ct), hoy);
        if (relaciones.Count == 0)
            return [];

        var personaIds = relaciones.Select(r => r.OrigenId).Distinct().ToArray();
        var personas = (await global.LoadManyAsync<Tercero>(ct, personaIds)).ToDictionary(p => p.Id);
        await using var boveda = sesiones.ConsultaBoveda();
        var documentos = await boveda.Query<Documento>().Where(d => d.TerceroId.IsOneOf(personaIds) && d.Ambito == AmbitoDocumento.Global).ToListAsync(ct);
        var conIa = await DocumentosDeVinculoEndpoints.ValidacionesDeIaAsync(empresa, documentos, ct);

        // La empresa ve a la persona solo si su flujo la involucra: un requisito de documento de esa persona en algún expediente del vínculo o un documento suyo ya
        // compartido con el vínculo. Que el tercero tenga representantes no le da a una empresa cuyo flujo no los pide su nombre ni su cédula.
        var expedientes = await empresa.Sesion.Query<Expediente>().Where(e => e.VinculoId == id).ToListAsync(ct);
        var pedidas = expedientes.SelectMany(e => e.Requisitos).Where(r => r.Persona?.PersonaId is not null).Select(r => r.Persona!.PersonaId!.Value).ToHashSet();
        return
        [
            .. relaciones.Where(r => personas.ContainsKey(r.OrigenId)).Select(r =>
            {
                var vistas = documentos.Where(d => d.TerceroId == r.OrigenId).Select(d => DocumentosDeVinculoEndpoints.Vista(d, id, hoy, conIa)).OfType<DocumentoVistaEmpresaDto>().ToList();
                return (Relacion: r, Vistas: vistas, Visible: vistas.Count > 0 || pedidas.Contains(r.OrigenId));
            }).Where(x => x.Visible).Select(x => new PersonaDelVinculoDto(x.Relacion.Id, x.Relacion.OrigenId, personas[x.Relacion.OrigenId].Identificacion.ADto(),
                personas[x.Relacion.OrigenId].Nombre, x.Relacion.Tipo.ToString(), x.Relacion.Principal, x.Relacion.Participacion, x.Relacion.Cargo, x.Relacion.VigenteDesde,
                x.Vistas))
        ];
    }
}
