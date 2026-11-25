using System.Text.Json.Serialization;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;

namespace Validalo.Dominio.Expedientes;

/// <summary>
/// Documento que el flujo pide en este expediente (docs/03 §6.2, reducido): el tipo del tenant, las áreas que lo revisan,
/// la versión de la bóveda que lo cubre y los veredictos de cada área sobre esa versión. <see cref="Estado"/> se deriva
/// en cada evento (<see cref="EstadoRequisito"/>); nunca se escribe desde fuera.
/// </summary>
public sealed class RequisitoDeExpediente
{
    public Guid Id { get; set; }

    /// <summary>Documento de la bóveda o sección de la ficha maestra (F2).</summary>
    public TipoDeRequisito TipoRequisito { get; set; }

    public Guid TipoDocumentoTenantId { get; set; }

    public string Codigo { get; set; } = string.Empty;

    public string Nombre { get; set; } = string.Empty;

    /// <summary>Canónico del tipo (casa con el documento global del tercero); nulo en un tipo propio.</summary>
    public string? TipoCanonico { get; set; }

    public AmbitoDocumento Ambito { get; set; }

    /// <summary>
    /// Nulo en el documento del propio tercero. Con valor (ADR-0010), el documento es de una persona relacionada: la que cumple el rol o, mientras nadie lo cumple, ninguna
    /// (<see cref="PersonaDelRequisito.SinPersona"/>). La versión que lo cubre sale de la bóveda de esa persona, no de la del tercero.
    /// </summary>
    public PersonaDelRequisito? Persona { get; set; }

    [JsonIgnore]
    public bool EsDePersona => Persona is not null;

    public bool Obligatorio { get; set; }

    /// <summary>Áreas que lo revisan, ya resueltas al abrir (vacío en el flujo ⇒ todas).</summary>
    public List<Guid> AreasQueRevisan { get; set; } = [];

    /// <summary>Aprobadores distintos que pide cada área para este requisito; nulo ⇒ los del área.</summary>
    public int? AprobadoresRequeridos { get; set; }

    public EstadoRequisito Estado { get; set; }

    public VersionDeRequisito? VersionActual { get; set; }

    /// <summary>Aprobación de esta empresa a esta misma versión en otro expediente del tercero (RQ-11); nula si no la hay.</summary>
    public AprobacionPrevia? AprobacionPrevia { get; set; }

    /// <summary>
    /// El tercero retiró la versión que este requisito reemplaza (la que la empresa había aprobado o revisaba) y la versión
    /// actual es la que vuelve (RT-3). Se limpia cuando llega una versión nueva por otra vía.
    /// </summary>
    public RetiroDeVersion? Retiro { get; set; }

    /// <summary>Ratificación del tercero en una renovación (RN-2); nula si no ratificó.</summary>
    public RatificacionDeRequisito? Ratificacion { get; set; }

    /// <summary>¿La versión actual es la que el tercero ratificó? Una versión nueva posterior la deja sin efecto.</summary>
    [JsonIgnore]
    public bool Ratificado => Ratificacion is { } r && VersionActual is { } v && v.DocumentoId == r.Version.DocumentoId && v.Numero == r.Version.Numero;

    /// <summary>¿La versión actual es la que la empresa ya aprobó en otro expediente?</summary>
    public bool ReutilizaAprobacion => AprobacionPrevia is { } previa && VersionActual is { } version &&
                                       version.DocumentoId == previa.DocumentoId && version.Numero == previa.Version;

    /// <summary>Versiones que lo cubrieron antes (la más reciente al final).</summary>
    public List<VersionDeRequisito> Historial { get; set; } = [];

    /// <summary>Veces que llegó una versión nueva después de la primera.</summary>
    public int Reenvios { get; set; }

    public List<VeredictoRegistrado> Veredictos { get; set; } = [];

    /// <summary>Lo que la revisión automática registró para este documento (una fila por área y versión, ADR-0012).</summary>
    public List<RevisionAutomaticaDeRequisito> Revisiones { get; set; } = [];

    public bool Eximido { get; set; }

    // ---------- Requisito de sección (F2) ----------

    /// <summary>Código de la sección de la ficha (<c>FICHA_*</c>); nulo en un documento.</summary>
    public string? Seccion { get; set; }

    /// <summary>Periodo (año) en la financiera.</summary>
    public int? Periodo { get; set; }

    /// <summary>La versión de la sección debe traer soporte para estar completa para la empresa.</summary>
    public bool ExigeSoporte { get; set; }

    /// <summary>Completitud para la empresa de la última versión vigente evaluada (guardada, FM-16).</summary>
    public CompletitudParaEmpresa? Completitud { get; set; }

    /// <summary>Versión que la empresa ya había aceptado en el vínculo al abrir el expediente (base de la comparación).</summary>
    public VersionDeRequisito? VersionAceptadaPrevia { get; set; }

    /// <summary>
    /// Renovación periódica del vínculo (VV-1): la sección no queda cubierta por la versión que la empresa ya había aceptado; hace falta
    /// una versión nueva o que el tercero ratifique que sigue igual (<see cref="RatificacionDeRequisito"/>).
    /// </summary>
    public bool ExigeRatificacion { get; set; }

    /// <summary>Días del plazo para resolver una revalidación que incluya el requisito (RV-4); nulo = el de por omisión.</summary>
    public int? DiasRevalidacion { get; set; }

    /// <summary>Cuándo la empresa aceptó la versión actual (al aprobarse el expediente).</summary>
    public DateTimeOffset? AceptadaEn { get; set; }

    [JsonIgnore]
    public bool EsSeccion => TipoRequisito == TipoDeRequisito.Seccion;

    public string? EximidoPor { get; set; }

    public string? JustificacionExencion { get; set; }

    public DateTimeOffset? EximidoEn { get; set; }

    /// <summary>La exención del vínculo que lo eximió (EX-3), al abrirse el expediente o con él abierto; nula si lo eximió una persona o no está eximido.</summary>
    public Guid? ExencionDeVinculoId { get; set; }

    /// <summary>
    /// El requisito ya no aplica porque lo que el tercero declaró en su ficha cambió (EF-5): sigue en el expediente, sin exigirse (cuenta como <see cref="Eximido"/> para las áreas y el cierre, y su estado es
    /// <see cref="EstadoRequisito.NoAplica"/>), y vuelve a exigirse si lo declarado vuelve a cumplir la condición. Nunca se marca un requisito ya aprobado.
    /// </summary>
    public bool NoAplica { get; set; }

    /// <summary>Lo de la ficha que hizo que se pida (EF-6), para decírselo al tercero; nulo si la condición no mira la ficha.</summary>
    public List<MotivoDeExigencia>? PorQue { get; set; }

    /// <summary>
    /// ¿Cuenta para el alcance de sus áreas? Un opcional sin versión no frena a nadie; si el tercero lo carga, se revisa.
    /// </summary>
    [JsonIgnore]
    public bool Cuenta => !NoAplica && (Obligatorio || VersionActual is not null || Eximido);

    public bool LoRevisa(Guid areaId) => AreasQueRevisan.Contains(areaId);

    public int AprobadoresPara(AreaDeExpediente area) => AprobadoresRequeridos ?? area.AprobadoresRequeridos;

    /// <summary>Aprobaciones vigentes del área: una del sistema o del administrador completa; si no, N personas distintas.</summary>
    public bool AprobadoPor(AreaDeExpediente area)
    {
        if (Eximido)
            return true;
        var aprobaciones = Veredictos.Where(v => v.Vigente && v.AreaId == area.AreaId && v.Veredicto == Veredicto.Aprobado).ToList();
        return aprobaciones.Any(v => v.Origen != OrigenVeredicto.Humano) ||
               aprobaciones.Where(v => v.RevisorId is not null).Select(v => v.RevisorId).Distinct().Count() >= AprobadoresPara(area);
    }

    /// <summary>
    /// Cuándo la empresa aprobó este requisito (TD-10): la fecha del último veredicto de aprobación vigente de sus áreas, es decir, el momento en que
    /// el requisito quedó <see cref="EstadoRequisito.Aprobado"/>. Nula si no lo está (o está eximido). De aquí corre «revalidar cada N días» del tipo.
    /// </summary>
    [JsonIgnore]
    public DateTimeOffset? AprobadoEn => Estado == EstadoRequisito.Aprobado && !Eximido
        ? Veredictos.Where(v => v is { Vigente: true, Veredicto: Veredicto.Aprobado, AreaId: not null }).Select(v => (DateTimeOffset?)v.Fecha).Max()
        : null;

    public bool ObservadoPor(Guid areaId) => Veredictos.Any(v => v.Vigente && v.AreaId == areaId && v.Veredicto == Veredicto.Observado);

    public bool DecididoPor(AreaDeExpediente area) => AprobadoPor(area) || ObservadoPor(area.AreaId);

    /// <summary>¿Esta persona ya emitió, en esta ronda, un veredicto humano vigente sobre el requisito en el área?</summary>
    public bool DecidioPersona(Guid areaId, string revisorId) =>
        Veredictos.Any(v => v.Vigente && v.AreaId == areaId && v.Origen == OrigenVeredicto.Humano && v.RevisorId == revisorId);

    /// <summary>Personas distintas con aprobación humana vigente del área (x de <see cref="AprobadoresPara"/>).</summary>
    public int AprobacionesDe(AreaDeExpediente area) =>
        AprobadoPor(area) && !Eximido
            ? Math.Max(AprobadoresPara(area), 1)
            : Veredictos.Where(v => v.Vigente && v.AreaId == area.AreaId && v.Veredicto == Veredicto.Aprobado && v.RevisorId is not null)
                .Select(v => v.RevisorId).Distinct().Count();
}

public sealed partial class Expediente
{
    /// <summary>Con requisitos: todos los obligatorios cargados o eximidos. Sin requisitos: siempre (FL-1).</summary>
    [JsonIgnore]
    public bool ListoParaRevision => Requisitos.Where(r => r.Obligatorio).All(r => r.VersionActual is not null || r.Eximido);

    public RequisitoDeExpediente? BuscarRequisito(Guid requisitoId) => Requisitos.FirstOrDefault(r => r.Id == requisitoId);

    /// <summary>
    /// Documentos de la bóveda (no secciones de la ficha) cuya aprobación por la empresa cambió respecto de <paramref name="antes"/> (nulo = el expediente
    /// recién abierto): un requisito pasó a quedar aprobado con una versión, dejó de estarlo o cambió la versión aprobada (TD-10). Con ellos se pide recalcular la
    /// vigencia del documento, que cuenta «revalidar cada N días» desde la aprobación.
    /// </summary>
    public IReadOnlyList<Guid> DocumentosConAprobacionCambiada(Expediente? antes)
    {
        static (Guid DocumentoId, int Numero)? Aprobada(RequisitoDeExpediente? requisito) =>
            requisito is { EsSeccion: false, Eximido: false, Estado: EstadoRequisito.Aprobado, VersionActual: { } version } ? (version.DocumentoId, version.Numero) : null;

        var documentos = new HashSet<Guid>();
        foreach (var requisito in Requisitos.Where(r => !r.EsSeccion))
        {
            var despues = Aprobada(requisito);
            var previa = Aprobada(antes?.BuscarRequisito(requisito.Id));
            if (despues == previa)
                continue;
            if (despues is { } nueva)
                documentos.Add(nueva.DocumentoId);
            if (previa is { } anterior)
                documentos.Add(anterior.DocumentoId);
        }

        return [.. documentos];
    }

    /// <summary>Requisitos que cuentan para el área (en su alcance y no opcionales sin cargar).</summary>
    public IEnumerable<RequisitoDeExpediente> RequisitosDelArea(Guid areaId) => Requisitos.Where(r => r.Cuenta && r.LoRevisa(areaId));

    /// <summary>Requisitos con alguna observación vigente.</summary>
    public IEnumerable<RequisitoDeExpediente> RequisitosConObservacion() =>
        Requisitos.Where(r => r.Veredictos.Any(v => v.Vigente && v.Veredicto == Veredicto.Observado));

    // ---------- Decisiones ----------

    /// <summary>
    /// Veredicto de un miembro del área sobre un requisito de su alcance y una versión concreta. La versión debe ser la
    /// actual del requisito (409 <c>version-superada</c>); cada persona decide una vez por requisito y área
    /// (<c>aprobador-repetido</c>) y el requisito queda decidido por el área al observarlo o al juntar
    /// <c>AprobadoresRequeridos</c> personas distintas (<c>requisito-ya-decidido</c>). La aprobación del área y el
    /// resto de la cascada se derivan (RQ-4, RQ-5). Las mismas reglas valen documento a documento en la decisión por
    /// área (<see cref="AprobarArea"/>, <see cref="ObservarArea"/>).
    /// </summary>
    public IReadOnlyList<object> EmitirVeredictoDeRequisito(Guid requisitoId, Guid areaId, Revisor revisor, Veredicto veredicto, int? sobreVersion,
        IReadOnlyList<MotivoAplicado> motivos, string? observacion, DateTimeOffset ahora, IReadOnlyList<string>? campos = null,
        bool discrepanciaCritica = false, string? justificacion = null)
    {
        var area = AreaParaDecidirPorRequisitos(areaId, revisor);
        var revisorId = revisor.UsuarioId.ToString();
        var requisito = RequisitoDecidible(requisitoId, area, revisorId, sobreVersion, superadas: null);
        var texto = veredicto == Veredicto.Aprobado && discrepanciaCritica ? JustificacionPorDiscrepancias([requisito], justificacion) : null;
        var evento = VeredictoHumano(requisito, area, veredicto, revisorId, Motivos(veredicto, motivos), Texto(observacion, "observacion"), ahora,
            Campos(requisito, veredicto, campos), texto);
        return Simular(s => s.Emitir(evento), ahora);
    }

    /// <summary>
    /// El tercero ratifica en una renovación que el documento no cambió (RN-2) o que la sección de la ficha sigue igual (VV-1): solo
    /// en un expediente de <c>Renovacion</c> abierto y sobre un requisito sin versión (el que venció o la sección que se renueva).
    /// Las áreas lo aprueban solas.
    /// </summary>
    public IReadOnlyList<object> RatificarRequisito(Guid requisitoId, VersionDeRequisito version, string por, DateTimeOffset ahora)
    {
        if (!EstaAbierto || Tipo != TipoExpediente.Renovacion)
            throw ReglaDeNegocioException.Conflicto("estado-invalido", "Solo se ratifica un documento en una renovación abierta.");
        var requisito = BuscarRequisito(requisitoId)
                        ?? throw ReglaDeNegocioException.NoEncontrado("requisito-no-encontrado", "Ese requisito no está en el expediente.");
        if (requisito.Eximido || requisito.VersionActual is not null)
            throw ReglaDeNegocioException.Conflicto("estado-invalido", $"{requisito.Nombre} ya tiene una versión en esta renovación.");
        return Simular(s => s.Emitir(new RequisitoRatificado(requisitoId, version, por, ahora)), ahora);
    }

    /// <summary>
    /// Un administrador exime el requisito (justificación obligatoria). Sus veredictos dejan de contar; si era lo único
    /// que faltaba cargar, el expediente pasa a revisión, y si era la última observación vigente de un expediente
    /// devuelto, la revisión se reanuda (RQ-6).
    /// </summary>
    public IReadOnlyList<object> EximirRequisito(Guid requisitoId, string por, string? justificacion, DateTimeOffset ahora, Guid? exencionDeVinculoId = null)
    {
        if (!EstaAbierto)
            throw ReglaDeNegocioException.Conflicto("estado-invalido", $"No se eximen requisitos de un expediente {Estado}.");
        var requisito = BuscarRequisito(requisitoId)
                        ?? throw ReglaDeNegocioException.NoEncontrado("requisito-no-encontrado", "Ese requisito no está en el expediente.");
        if (requisito.NoAplica)
            throw ReglaDeNegocioException.Conflicto("requisito-no-aplica", $"{requisito.Nombre} no aplica según lo que el tercero declaró en su ficha.");
        if (requisito.Eximido)
            throw ReglaDeNegocioException.Conflicto("requisito-eximido", $"{requisito.Nombre} ya está eximido.");
        if (requisito.Estado == EstadoRequisito.Aprobado)
            throw ReglaDeNegocioException.Conflicto("estado-invalido", $"{requisito.Nombre} ya está aprobado.");

        var texto = Requerido(justificacion, "justificacion-requerida", "Eximir un requisito necesita una justificación.");
        return Simular(s =>
        {
            s.Emitir(new RequisitoEximido(requisitoId, por, texto, ahora, exencionDeVinculoId));
            if (s.Estado is { Estado: EstadoExpediente.Observado, EtapaActiva: { } etapa } &&
                etapa.Areas.All(a => a.Estado != EstadoAreaExpediente.Observada))
                s.Emitir(new RevisionReanudada(Guid.Empty, ahora, requisitoId));
        }, ahora);
    }

    /// <summary>
    /// Adjunta a cada requisito la versión actual que la bóveda compartió con el vínculo (<paramref name="disponibles"/>,
    /// por requisito). Idempotente: si el requisito ya tiene esa versión no hace nada. Si tenía veredictos vigentes, se
    /// invalidan (solo ese requisito; RQ-8). No toca requisitos eximidos ni aquellos cuyas áreas están todas en etapas
    /// ya aprobadas (nadie queda para revisarla: la versión nueva queda para la revalidación). Si alguna de sus áreas
    /// sigue en una etapa abierta —p. ej. una etapa posterior que lo observó—, la versión se adjunta e invalida solo los
    /// veredictos de esas áreas; lo aprobado por etapas cerradas queda como aprobado sobre la versión anterior (RQ-10).
    /// Solo en expedientes abiertos.
    /// </summary>
    /// <remarks>
    /// Con requisitos de sección (F2), <paramref name="secciones"/> trae la evaluación de la versión vigente de cada una: si su
    /// completitud para la empresa cambió se guarda (<see cref="CompletitudDeSeccionEvaluada"/>), y solo una versión completa
    /// para la empresa se adjunta (las incompletas no las revisa nadie: el requisito sigue con su motivo legible).
    /// <para>
    /// <paramref name="retiradas"/> son las versiones de la bóveda que el tercero retiró, por (documento, número): si la que
    /// el requisito reemplaza está ahí, <see cref="VersionAdjuntadaARequisito.Retiro"/> lleva el motivo (RT-1).
    /// </para>
    /// </remarks>
    public IReadOnlyList<object> SincronizarVersiones(IReadOnlyDictionary<Guid, VersionDeRequisito> disponibles, DateTimeOffset ahora,
        IReadOnlyDictionary<Guid, EvaluacionDeSeccion>? secciones = null,
        IReadOnlyDictionary<(Guid DocumentoId, int Numero), RetiroDeVersion>? retiradas = null)
    {
        if (!EstaAbierto || !ConRequisitos)
            return [];

        var evaluadas = new List<CompletitudDeSeccionEvaluada>();
        var todas = new Dictionary<Guid, VersionDeRequisito>(disponibles);
        foreach (var (requisitoId, evaluacion) in secciones ?? new Dictionary<Guid, EvaluacionDeSeccion>())
        {
            if (BuscarRequisito(requisitoId) is not { EsSeccion: true, Eximido: false } requisito)
                continue;
            if (!evaluacion.Completitud.Igual(requisito.Completitud))
                evaluadas.Add(new CompletitudDeSeccionEvaluada(requisitoId, evaluacion.Completitud, ahora));
            if (evaluacion.Disponible is { } disponible)
                todas[requisitoId] = disponible;
            else
                todas.Remove(requisitoId);
        }

        var cambios = new List<(RequisitoDeExpediente Requisito, VersionDeRequisito Version)>();
        foreach (var requisito in Requisitos)
        {
            if (requisito.Eximido || !todas.TryGetValue(requisito.Id, out var version))
                continue;
            if (requisito.VersionActual is { } actual && actual.DocumentoId == version.DocumentoId && actual.Numero == version.Numero)
                continue;
            // Renovación periódica (VV-1): la versión que la empresa ya aceptó no cubre la sección; solo una nueva o la ratificación.
            if (requisito is { ExigeRatificacion: true, VersionActual: null, VersionAceptadaPrevia: { } aceptada } &&
                aceptada.DocumentoId == version.DocumentoId && aceptada.Numero == version.Numero)
                continue;
            if (requisito.AreasQueRevisan.All(EtapaCerrada))
                continue;
            cambios.Add((requisito, version));
        }

        if (cambios.Count == 0 && evaluadas.Count == 0)
            return [];

        return Simular(s =>
        {
            foreach (var evaluada in evaluadas)
                s.Emitir(evaluada);
            foreach (var (requisito, version) in cambios)
            {
                var afectadas = requisito.Veredictos.Where(v => v.Vigente).Select(v => v.AreaId).OfType<Guid>()
                    .Where(a => !EtapaCerrada(a)).Distinct().ToList();
                RetiroDeVersion? retiro = null;
                if (requisito.VersionActual is { } reemplazada)
                    retiro = retiradas?.GetValueOrDefault((reemplazada.DocumentoId, reemplazada.Numero));
                s.Emitir(new VersionAdjuntadaARequisito(requisito.Id, version, requisito.VersionActual?.Numero, ahora, retiro));
                if (afectadas.Count > 0)
                    s.Emitir(new VeredictosInvalidadosPorNuevaVersion(requisito.Id, requisito.VersionActual!.Numero, afectadas, ahora));
            }
        }, ahora);
    }

    /// <summary>
    /// Amplía una actualización abierta con los requisitos que cambiaron después de abrirse (<see cref="RequisitosAgregados"/>):
    /// cada uno entra con la versión que lo cubre y las áreas que lo revisan vuelven a quedar pendientes aunque ya hubieran
    /// decidido lo demás (si su etapa estaba aprobada, se reabre y las posteriores esperan). Solo en expedientes de
    /// <c>Actualizacion</c> abiertos; idempotente: lo que el expediente ya tiene (por id de requisito) no se agrega y, sin nada
    /// nuevo, no emite eventos. Si la actualización estaba devuelta al tercero y la etapa reabierta es anterior a la que
    /// observó, la revisión se reanuda (<see cref="RevisionReanudada"/>).
    /// </summary>
    public IReadOnlyList<object> AgregarRequisitos(IReadOnlyList<RequisitoCalculado> requisitos, DateTimeOffset ahora)
    {
        if (Tipo != TipoExpediente.Actualizacion || !EstaAbierto)
            return [];
        var nuevos = requisitos.DistinctBy(r => r.RequisitoId).Where(r => BuscarRequisito(r.RequisitoId) is null).ToList();
        if (nuevos.Count == 0)
            return [];

        var areas = Etapas.OrderBy(e => e.Orden).SelectMany(e => e.Areas).Select(a => a.AreaId).ToList();
        return Simular(s =>
        {
            s.Emitir(new RequisitosAgregados(ResolverAlcance(nuevos, areas), ahora));
            if (s.Estado is { Estado: EstadoExpediente.Observado, EtapaActiva: { } etapa } && etapa.Areas.All(a => a.Estado != EstadoAreaExpediente.Observada))
                s.Emitir(new RevisionReanudada(Guid.Empty, ahora));
        }, ahora);
    }

    /// <summary>
    /// Pone al día las personas de los requisitos <c>DePersonaRelacionada</c> de un expediente <b>abierto</b> (ADR-0010: «se resuelve al abrir o recalcular»).
    /// <paramref name="deseados"/> es lo que el flujo del expediente pide hoy contra las relaciones vigentes: por cada requisito del flujo, un requisito por persona que cumple
    /// el rol (la principal, o todas con <c>TodasLasRelaciones</c>) o, si nadie lo cumple, uno <b>sin persona</b>. Aquí se decide qué cambia, sin tocar lo que ya está bien:
    /// <list type="bullet">
    /// <item>un requisito sin persona que ya tiene a quién pedírsela la recibe (<see cref="PersonaDeRequisitoResuelta"/>), conservando su id y sus áreas;</item>
    /// <item>una persona nueva sin requisito (otro suplente, un representante nuevo, un socio con «todas») entra como un requisito más
    /// (<see cref="RequisitosDePersonaAgregados"/>), ya cubierto si su documento está compartido con el vínculo;</item>
    /// <item>el requisito de una persona que ya no cumple el rol, mientras no esté aprobado, queda eximido por el sistema (su documento ya no se exige); si ya estaba
    /// aprobado se conserva como lo que la empresa aceptó.</item>
    /// </list>
    /// Idempotente: sin diferencias no emite nada. Si no hay ninguna persona para un requisito del flujo, el expediente no cambia (el requisito sin persona espera).
    /// </summary>
    public IReadOnlyList<object> ResolverPersonas(IReadOnlyList<RequisitoCalculado> deseados, DateTimeOffset ahora)
    {
        if (!EstaAbierto || !ConRequisitos)
            return [];

        var resueltas = new List<PersonaDeRequisitoResuelta>();
        var nuevos = new List<RequisitoCalculado>();
        var sobrantes = new List<RequisitoDeExpediente>();
        foreach (var grupo in deseados.Where(d => d.Persona is not null).GroupBy(d => d.Persona!.RequisitoDelFlujoId))
        {
            var existentes = Requisitos.Where(r => r.Persona?.RequisitoDelFlujoId == grupo.Key).ToList();
            var conPersona = grupo.Where(d => d.Persona!.PersonaId is not null).DistinctBy(d => d.Persona!.PersonaId).ToList();
            if (conPersona.Count == 0)
            {
                // El flujo pide el rol y nadie lo cumple todavía: queda (o nace) el requisito sin persona.
                if (existentes.Count == 0 && grupo.FirstOrDefault() is { } marcador)
                    nuevos.Add(marcador);
                continue;
            }

            var sinPersona = existentes.Where(r => r.Persona!.SinPersona).ToList();
            var yaCubiertas = existentes.Where(r => !r.Persona!.SinPersona).Select(r => r.Persona!.PersonaId!.Value).ToHashSet();
            foreach (var deseado in conPersona.Where(d => !yaCubiertas.Contains(d.Persona!.PersonaId!.Value)))
            {
                if (sinPersona.Count > 0)
                {
                    resueltas.Add(new PersonaDeRequisitoResuelta(sinPersona[0].Id, deseado.Persona!, ahora));
                    sinPersona.RemoveAt(0);
                }
                else
                {
                    nuevos.Add(deseado);
                }
            }

            var deseadas = conPersona.Select(d => d.Persona!.PersonaId!.Value).ToHashSet();
            sobrantes.AddRange(existentes.Where(r => !r.Persona!.SinPersona && !deseadas.Contains(r.Persona.PersonaId!.Value) && !r.Eximido &&
                                                    r.Estado != EstadoRequisito.Aprobado));
        }

        nuevos = [.. nuevos.Where(n => BuscarRequisito(n.RequisitoId) is null).DistinctBy(n => n.RequisitoId)];
        if (resueltas.Count == 0 && nuevos.Count == 0 && sobrantes.Count == 0)
            return [];

        var areas = Etapas.OrderBy(e => e.Orden).SelectMany(e => e.Areas).Select(a => a.AreaId).ToList();
        return Simular(s =>
        {
            foreach (var resuelta in resueltas)
                s.Emitir(resuelta);
            if (nuevos.Count > 0)
                s.Emitir(new RequisitosDePersonaAgregados(ResolverAlcance(nuevos, areas), ahora));
            foreach (var sobrante in sobrantes)
                s.Emitir(new RequisitoEximido(sobrante.Id, ExencionPorCambioDePersona.Por, ExencionPorCambioDePersona.Justificacion, ahora, null));
            if (s.Estado is { Estado: EstadoExpediente.Observado, EtapaActiva: { } etapa } && etapa.Areas.All(a => a.Estado != EstadoAreaExpediente.Observada))
                s.Emitir(new RevisionReanudada(Guid.Empty, ahora));
        }, ahora);
    }

    /// <summary>
    /// Pone al día el expediente <b>abierto</b> con lo que el tercero declaró en su ficha (EF-5): las condiciones del flujo que miran la ficha dan hoy otro
    /// resultado que cuando se calcularon los requisitos. El llamador resuelve el flujo del expediente contra la ficha de hoy y entrega:
    /// <paramref name="nuevos"/> (requisitos que ahora aplican y el expediente no tiene), <paramref name="noAplican"/> (ids de los que ya no aplican),
    /// <paramref name="vuelvenAAplicar"/> (ids de los marcados <c>NoAplica</c> que vuelven a aplicar) y <paramref name="motivos"/> (el porqué vigente de los que
    /// siguen). Aquí se decide qué cambia, sin tocar lo que ya está bien:
    /// <list type="bullet">
    /// <item>un requisito nuevo entra como uno más (ya cubierto si su documento está compartido con el vínculo) y sus áreas vuelven a quedar pendientes;</item>
    /// <item>uno que ya no aplica, mientras no esté aprobado ni eximido a mano, pasa a <see cref="EstadoRequisito.NoAplica"/>: sigue en el expediente, sin exigirse y
    /// con sus decisiones invalidadas; si ya estaba aprobado se conserva como lo que la empresa aceptó;</item>
    /// <item>uno <c>NoAplica</c> que vuelve a aplicar se vuelve a exigir (sus áreas lo revisan de nuevo);</item>
    /// <item>el porqué de los que siguen se actualiza solo si cambió.</item>
    /// </list>
    /// Idempotente: sin diferencias no emite nada. Un expediente cerrado no cambia.
    /// </summary>
    public IReadOnlyList<object> ResolverSegunFicha(IReadOnlyList<RequisitoCalculado> nuevos, IReadOnlySet<Guid> noAplican, IReadOnlySet<Guid> vuelvenAAplicar,
        IReadOnlyList<MotivosDelRequisito> motivos, DateTimeOffset ahora)
    {
        if (!EstaAbierto || !ConRequisitos)
            return [];

        var agregados = nuevos.DistinctBy(r => r.RequisitoId).Where(r => BuscarRequisito(r.RequisitoId) is null).ToList();
        var salen = Requisitos.Where(r => noAplican.Contains(r.Id) && !r.Eximido && r.Estado != EstadoRequisito.Aprobado).Select(r => r.Id).ToList();
        var vuelven = Requisitos.Where(r => vuelvenAAplicar.Contains(r.Id) && r.NoAplica).Select(r => r.Id).ToList();
        var cambiados = motivos
            .Where(m => !salen.Contains(m.RequisitoId) && BuscarRequisito(m.RequisitoId) is { } r && (!r.NoAplica || vuelven.Contains(r.Id)) &&
                        !MismosMotivos(r.PorQue, m.Motivos))
            .DistinctBy(m => m.RequisitoId)
            .ToList();
        if (agregados.Count == 0 && salen.Count == 0 && vuelven.Count == 0 && cambiados.Count == 0)
            return [];

        var areas = Etapas.OrderBy(e => e.Orden).SelectMany(e => e.Areas).Select(a => a.AreaId).ToList();
        return Simular(s =>
        {
            s.Emitir(new RequisitosSegunFichaResueltos(ResolverAlcance(agregados, areas), salen, vuelven, cambiados, ahora));
            if (s.Estado is { Estado: EstadoExpediente.Observado, EtapaActiva: { } etapa } && etapa.Areas.All(a => a.Estado != EstadoAreaExpediente.Observada))
                s.Emitir(new RevisionReanudada(Guid.Empty, ahora));
        }, ahora);
    }

    private static bool MismosMotivos(IReadOnlyList<MotivoDeExigencia>? actuales, IReadOnlyList<MotivoDeExigencia> nuevos) =>
        (actuales ?? []).Count == nuevos.Count &&
        (actuales ?? []).Zip(nuevos).All(p => p.First.Campo == p.Second.Campo && p.First.Etiqueta == p.Second.Etiqueta && p.First.Valores.SequenceEqual(p.Second.Valores));

    /// <summary>Quién y por qué deja el sistema sin exigir un requisito cuya condición sobre la ficha dejó de cumplirse (EF-5).</summary>
    public static class NoAplicaPorFicha
    {
        public const string Por = "sistema";

        public const string Justificacion = "Lo que el tercero declaró en su ficha ya no cumple la condición con la que se pedía este documento.";
    }

    /// <summary>Quién y por qué exime el sistema el requisito de una persona que dejó de cumplir el rol (ADR-0010).</summary>
    public static class ExencionPorCambioDePersona
    {
        public const string Por = "sistema";

        public const string Justificacion = "La persona ya no cumple ese rol ante el tercero: su documento dejó de exigirse.";
    }

    /// <summary>¿La etapa del área ya se aprobó? Sus veredictos quedan cerrados (no los invalida una versión nueva).</summary>
    private bool EtapaCerrada(Guid areaId) => EtapaDe(areaId) is { Estado: EstadoEtapa.Aprobada };

    /// <summary>El administrador aprueba en nombre del área todos los requisitos de su alcance que ella aún no decidió.</summary>
    private IReadOnlyList<object> AprobarRequisitosComoAdministrador(AreaDeExpediente area, string administradorId, string justificacion,
        DateTimeOffset ahora)
    {
        var pendientes = RequisitosDelArea(area.AreaId).Where(r => !r.DecididoPor(area)).ToList();
        if (pendientes.FirstOrDefault(r => r.VersionActual is null) is { } sinVersion)
            throw ReglaDeNegocioException.Conflicto("requisito-sin-version", $"El tercero aún no ha cargado {sinVersion.Nombre}.");

        return Simular(s =>
        {
            foreach (var requisito in pendientes)
                s.Emitir(new VeredictoDeRequisitoEmitido(Guid.CreateVersion7(), requisito.Id, area.AreaId, Veredicto.Aprobado,
                    OrigenVeredicto.Administrador, administradorId, requisito.VersionActual!.Numero, [], null, justificacion, ahora));
        }, ahora);
    }

    // ---------- Evolución ----------

    public void Apply(RequisitosCalculados e)
    {
        Requisitos = [.. e.Requisitos.Select(DeCalculado)];
        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(RequisitosAgregados e)
    {
        var nuevos = e.Requisitos.Select(DeCalculado).ToList();
        Requisitos = [.. Requisitos, .. nuevos];
        var reabiertas = ReabrirEtapasDe(nuevos);
        RecalcularRequisitos(e.Fecha);
        // La etapa reabierta cuenta su SLA desde que le llegó lo nuevo (como al activarse).
        foreach (var area in reabiertas.SelectMany(etapa => etapa.Areas).Where(a => a.Estado == EstadoAreaExpediente.Pendiente))
            area.ReiniciarSla(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(RequisitosDePersonaAgregados e)
    {
        var nuevos = e.Requisitos.Select(DeCalculado).ToList();
        Requisitos = [.. Requisitos, .. nuevos];
        var reabiertas = ReabrirEtapasDe(nuevos);
        RecalcularRequisitos(e.Fecha);
        foreach (var area in reabiertas.SelectMany(etapa => etapa.Areas).Where(a => a.Estado == EstadoAreaExpediente.Pendiente))
            area.ReiniciarSla(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(RequisitosSegunFichaResueltos e)
    {
        var nuevos = e.Agregados.Select(DeCalculado).ToList();
        Requisitos = [.. Requisitos, .. nuevos];
        foreach (var id in e.NoAplican)
        {
            var requisito = BuscarRequisito(id)!;
            // «No aplica» cuenta como eximido para las áreas, el cierre y todo lo que ya mira Eximido; NoAplica dice por qué (y se muestra distinto).
            requisito.NoAplica = true;
            requisito.Eximido = true;
            requisito.EximidoPor = NoAplicaPorFicha.Por;
            requisito.JustificacionExencion = NoAplicaPorFicha.Justificacion;
            requisito.EximidoEn = e.Fecha;
            requisito.ExencionDeVinculoId = null;
            foreach (var veredicto in requisito.Veredictos.Where(v => v.Vigente))
            {
                veredicto.Vigente = false;
                veredicto.Superado = true;
            }
        }

        var vueltos = new List<RequisitoDeExpediente>();
        foreach (var id in e.VuelvenAAplicar)
        {
            var requisito = BuscarRequisito(id)!;
            requisito.NoAplica = false;
            requisito.Eximido = false;
            requisito.EximidoPor = null;
            requisito.JustificacionExencion = null;
            requisito.EximidoEn = null;
            vueltos.Add(requisito);
        }

        foreach (var motivo in e.Motivos)
            BuscarRequisito(motivo.RequisitoId)!.PorQue = motivo.Motivos.Count > 0 ? [.. motivo.Motivos] : null;

        var reabiertas = ReabrirEtapasDe([.. nuevos, .. vueltos]);
        RecalcularRequisitos(e.Fecha);
        foreach (var area in reabiertas.SelectMany(etapa => etapa.Areas).Where(a => a.Estado == EstadoAreaExpediente.Pendiente))
            area.ReiniciarSla(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(PersonaDeRequisitoResuelta e)
    {
        BuscarRequisito(e.RequisitoId)!.Persona = e.Persona;
        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    private static RequisitoDeExpediente DeCalculado(RequisitoCalculado r) => new()
    {
        Id = r.RequisitoId,
        TipoRequisito = r.TipoRequisito,
        Seccion = r.Seccion,
        Periodo = r.Periodo,
        ExigeSoporte = r.ExigeSoporte,
        Completitud = r.Completitud,
        ExigeRatificacion = r.ExigeRatificacion,
        DiasRevalidacion = r.DiasRevalidacion,
        VersionAceptadaPrevia = r.Aceptada,
        TipoDocumentoTenantId = r.TipoDocumentoTenantId,
        Codigo = r.Codigo,
        Nombre = r.Nombre,
        TipoCanonico = r.TipoCanonico,
        Ambito = r.Ambito,
        Obligatorio = r.Obligatorio,
        AreasQueRevisan = [.. r.AreasQueRevisan],
        AprobadoresRequeridos = r.AprobadoresRequeridos,
        VersionActual = r.Version,
        AprobacionPrevia = r.Previa,
        Retiro = r.Retiro,
        // Un requisito que el vínculo tiene eximido (EX-3) nace Eximido citando la exención: no lo cubre una versión ni lo revisa nadie.
        Eximido = r.Exencion is not null,
        EximidoPor = r.Exencion?.Por,
        JustificacionExencion = r.Exencion?.Justificacion,
        EximidoEn = r.Exencion?.Fecha,
        ExencionDeVinculoId = r.Exencion?.ExencionId,
        Persona = r.Persona,
        PorQue = r.PorQue is { Count: > 0 } ? [.. r.PorQue] : null
    };

    /// <summary>
    /// Un requisito nuevo lo revisan áreas cuya etapa pudo haberse aprobado ya: la primera de ellas se reabre y las posteriores
    /// vuelven a esperarla (cuando se apruebe de nuevo se reactivan y, con sus decisiones vigentes, avanzan solas). Con todas
    /// las áreas en etapas abiertas no cambia nada. Devuelve las etapas reabiertas.
    /// </summary>
    private List<EtapaDeExpediente> ReabrirEtapasDe(IEnumerable<RequisitoDeExpediente> nuevos)
    {
        var cerradas = nuevos.SelectMany(r => r.AreasQueRevisan).Select(EtapaDe).OfType<EtapaDeExpediente>()
            .Where(e => e.Estado == EstadoEtapa.Aprobada).ToList();
        if (cerradas.Count == 0)
            return [];

        var primera = cerradas.Min(e => e.Orden);
        foreach (var posterior in Etapas.Where(e => e.Orden > primera && e.Estado != EstadoEtapa.Esperando))
        {
            posterior.Estado = EstadoEtapa.Esperando;
            posterior.ActivadaEn = null;
            posterior.AprobadaEn = null;
        }

        var reabierta = Etapas.First(e => e.Orden == primera);
        reabierta.Estado = EstadoEtapa.Activa;
        reabierta.AprobadaEn = null;
        return [reabierta];
    }

    public void Apply(VersionAdjuntadaARequisito e)
    {
        var requisito = BuscarRequisito(e.RequisitoId)!;
        if (requisito.VersionActual is { } anterior)
        {
            requisito.Historial.Add(anterior);
            requisito.Reenvios++;
        }

        requisito.VersionActual = e.Version;
        requisito.Retiro = e.Retiro;
        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(VeredictosInvalidadosPorNuevaVersion e)
    {
        // Solo los de las áreas afectadas: lo aprobado por una etapa cerrada sigue en pie (RQ-10).
        var afectadas = e.AreasAfectadas.ToHashSet();
        foreach (var veredicto in BuscarRequisito(e.RequisitoId)!.Veredictos.Where(v => v.Vigente && v.AreaId is { } area && afectadas.Contains(area)))
        {
            veredicto.Vigente = false;
            veredicto.Invalidado = true;
        }

        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(VeredictoDeRequisitoEmitido e)
    {
        BuscarRequisito(e.RequisitoId)!.Veredictos.Add(new VeredictoRegistrado
        {
            Id = e.VeredictoId,
            RequisitoId = e.RequisitoId,
            AreaId = e.AreaId,
            SobreVersion = e.SobreVersion,
            Veredicto = e.Veredicto,
            Origen = e.Origen,
            RevisorId = e.RevisorId,
            Motivos = [.. e.Motivos],
            Campos = [.. e.Campos ?? []],
            Observacion = e.Observacion,
            Justificacion = e.Justificacion,
            Fecha = e.Fecha
        });
        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(CompletitudDeSeccionEvaluada e)
    {
        BuscarRequisito(e.RequisitoId)!.Completitud = e.Completitud;
        ActualizadoEn = e.Fecha;
    }

    public void Apply(SeccionAceptadaPorEmpresa e)
    {
        BuscarRequisito(e.RequisitoId)!.AceptadaEn = e.Fecha;
        ActualizadoEn = e.Fecha;
    }

    public void Apply(RequisitoRatificado e)
    {
        var requisito = BuscarRequisito(e.RequisitoId)!;
        requisito.VersionActual = e.Version;
        requisito.Ratificacion = new RatificacionDeRequisito(e.Version, e.Por, e.Fecha);
        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    public void Apply(RequisitoEximido e)
    {
        var requisito = BuscarRequisito(e.RequisitoId)!;
        requisito.Eximido = true;
        requisito.EximidoPor = e.Por;
        requisito.JustificacionExencion = e.Justificacion;
        requisito.EximidoEn = e.Fecha;
        requisito.ExencionDeVinculoId = e.ExencionDeVinculoId;
        foreach (var veredicto in requisito.Veredictos.Where(v => v.Vigente))
        {
            veredicto.Vigente = false;
            veredicto.Superado = true;
        }

        RecalcularRequisitos(e.Fecha);
        ActualizadoEn = e.Fecha;
    }

    // ---------- Reglas internas ----------

    /// <summary>Copia las áreas del flujo a los requisitos que no las indican (vacío ⇒ todas las áreas, cada una en su etapa).</summary>
    private static IReadOnlyList<RequisitoCalculado> ResolverAlcance(IReadOnlyList<RequisitoCalculado> requisitos, FlujoParaExpediente flujo) =>
        ResolverAlcance(requisitos, flujo.Etapas.OrderBy(e => e.Orden).SelectMany(e => e.Areas).Select(a => a.AreaId).ToList());

    private static IReadOnlyList<RequisitoCalculado> ResolverAlcance(IReadOnlyList<RequisitoCalculado> requisitos, IReadOnlyList<Guid> todas) =>
        [.. requisitos.Select(r => r.AreasQueRevisan is { Count: > 0 } ? r : r with { AreasQueRevisan = todas })];

    private EtapaDeExpediente? EtapaDe(Guid areaId) => Etapas.FirstOrDefault(e => e.Areas.Any(a => a.AreaId == areaId));

    /// <summary>
    /// Deriva, tras cada evento, el estado de cada requisito y el de cada área: una observación vigente del área sobre
    /// un requisito de su alcance manda (<c>Observada</c>); todos aprobados por ella o eximidos ⇒ <c>Aprobada</c>; si no,
    /// <c>Pendiente</c> (o <c>Esperando</c> si su etapa no se activó). El veredicto de área derivado deja de contar en
    /// cuanto el área pierde su aprobación. No hace nada en un expediente sin requisitos.
    /// </summary>
    private void RecalcularRequisitos(DateTimeOffset fecha)
    {
        if (!ConRequisitos)
            return;

        foreach (var requisito in Requisitos)
            requisito.Estado = EstadoDe(requisito);

        foreach (var etapa in Etapas)
        {
            foreach (var area in etapa.Areas)
            {
                var previo = area.Estado;
                var propios = RequisitosDelArea(area.AreaId).ToList();
                area.RequisitosPorDecidir = propios.Count(r => !r.DecididoPor(area));
                area.Estado = etapa.Estado == EstadoEtapa.Esperando ? EstadoAreaExpediente.Esperando
                    : propios.Any(r => r.ObservadoPor(area.AreaId)) ? EstadoAreaExpediente.Observada
                    : propios.All(r => r.AprobadoPor(area)) ? EstadoAreaExpediente.Aprobada
                    : EstadoAreaExpediente.Pendiente;

                if (area.Estado == EstadoAreaExpediente.Pendiente && previo != EstadoAreaExpediente.Pendiente)
                    area.IniciarRonda(fecha);

                if (area.Estado != EstadoAreaExpediente.Aprobada)
                {
                    foreach (var derivado in area.Veredictos.Where(v => v.Vigente && v.Derivado))
                    {
                        derivado.Vigente = false;
                        derivado.Superado = true;
                    }
                }
            }
        }

        RecalcularRevisionAutomatica();
    }

    private EstadoRequisito EstadoDe(RequisitoDeExpediente requisito)
    {
        if (requisito.NoAplica)
            return EstadoRequisito.NoAplica;
        if (requisito.Eximido)
            return EstadoRequisito.Eximido;
        if (requisito.VersionActual is null)
            return EstadoRequisito.Pendiente;
        if (Estado == EstadoExpediente.Abierto)
            return EstadoRequisito.Cargado;
        if (requisito.Veredictos.Any(v => v.Vigente && v.Veredicto == Veredicto.Observado))
            return EstadoRequisito.Observado;

        var areas = requisito.AreasQueRevisan.Select(BuscarArea).OfType<AreaDeExpediente>().ToList();
        if (areas.All(requisito.AprobadoPor))
            return EstadoRequisito.Aprobado;

        // Corregido con una versión nueva mientras el expediente sigue devuelto: espera el reenvío del tercero.
        return Estado == EstadoExpediente.Observado && RequisitosObservados.Contains(requisito.Id)
            ? EstadoRequisito.Cargado
            : EstadoRequisito.EnRevision;
    }

    /// <summary>
    /// Con requisitos, en la etapa activa: las áreas automáticas aprueban (origen <c>Sistema</c>) lo que les falte de
    /// su alcance; cualquier área aprueba igual, con la referencia, lo que la empresa ya aprobó en esa misma versión en
    /// otro expediente del tercero (RQ-11); y el área que quedó aprobada recibe su <c>VeredictoDeAreaEmitido</c>
    /// derivado. Devuelve si emitió algo (la cascada vuelve a evaluar).
    /// </summary>
    private static bool AprobarAutomaticasYDerivadas(Simulacion simulacion, EtapaDeExpediente etapa, DateTimeOffset ahora)
    {
        var expediente = simulacion.Estado!;
        var emitio = false;
        foreach (var area in etapa.Areas.ToList())
        {
            foreach (var requisito in expediente.RequisitosDelArea(area.AreaId).ToList())
            {
                if (requisito.Eximido || requisito.VersionActual is not { } version || requisito.DecididoPor(area))
                    continue;
                var reutiliza = requisito.ReutilizaAprobacion;
                var ratificado = requisito.Ratificado;
                if (!area.Automatica && !reutiliza && !ratificado)
                    continue;
                var nota = ratificado && requisito.Ratificacion is { } ratificacion
                    ? $"El tercero ratificó el {ratificacion.Fecha:dd/MM/yyyy} que {(requisito.EsSeccion ? "la información" : "el documento")} no cambió."
                    : reutiliza && requisito.AprobacionPrevia is { } previa
                        ? $"La empresa ya aprobó esta versión en el expediente {previa.Folio} ({previa.TipoVinculo})."
                        : null;
                simulacion.Emitir(new VeredictoDeRequisitoEmitido(Guid.CreateVersion7(), requisito.Id, area.AreaId, Veredicto.Aprobado,
                    OrigenVeredicto.Sistema, null, version.Numero, [], null, nota, ahora));
                emitio = true;
            }

            if (area.Estado == EstadoAreaExpediente.Aprobada && !area.Veredictos.Any(v => v.Vigente && v.Derivado))
            {
                // Sin nada que revisar (lo que pide no aplica a este tercero, RQ-12; una actualización que no trae sus
                // documentos, RV-1; o solo opcionales sin cargar) aprueba Sistema.
                var sinAlcance = !expediente.RequisitosDelArea(area.AreaId).Any();
                simulacion.Emitir(new VeredictoDeAreaEmitido(Guid.CreateVersion7(), area.AreaId, Veredicto.Aprobado,
                    sinAlcance ? OrigenVeredicto.Sistema : OrigenDerivado(expediente, area), null, [], null,
                    sinAlcance ? SinDocumentosQueRevisar : null, null, ahora, DerivadoDeRequisitos: true));
                emitio = true;
            }
        }

        return emitio;
    }

    public const string SinDocumentosQueRevisar = "Esta área no tiene documentos que revisar en este expediente.";

    public const int MaximoCamposSenalados = 50;

    /// <summary>
    /// Al aprobarse el expediente, la empresa acepta la versión de cada sección que pide (no eximida): queda como lo aceptado
    /// por el vínculo (FM-3) y es el punto de F3 para <c>seccion.aceptada</c>.
    /// </summary>
    private static void AceptarSecciones(Simulacion simulacion, DateTimeOffset ahora)
    {
        foreach (var requisito in simulacion.Estado!.Requisitos.Where(r => r is { EsSeccion: true, Eximido: false, VersionActual: not null }).ToList())
        {
            var version = requisito.VersionActual!;
            simulacion.Emitir(new SeccionAceptadaPorEmpresa(requisito.Id, requisito.Seccion!, requisito.Periodo, version.DocumentoId, version.Numero,
                version.Sha256, ahora));
        }
    }

    /// <summary>
    /// Campos señalados al observar una sección (F2): solo en secciones (422 <c>campos-solo-en-secciones</c>) y al observar
    /// (<c>campos-solo-al-observar</c>); rutas sin espacios a los lados, sin repetir, hasta <see cref="MaximoCamposSenalados"/>.
    /// </summary>
    private static IReadOnlyList<string> Campos(RequisitoDeExpediente requisito, Veredicto veredicto, IReadOnlyList<string>? campos)
    {
        var lista = (campos ?? []).Where(c => !string.IsNullOrWhiteSpace(c)).Select(c => c.Trim()).Distinct(StringComparer.Ordinal).ToList();
        if (lista.Count == 0)
            return [];
        if (!requisito.EsSeccion)
            throw ReglaDeNegocioException.Validacion("campos-solo-en-secciones", "Los campos se señalan al observar una sección de la ficha, no un documento.");
        if (veredicto != Veredicto.Observado)
            throw ReglaDeNegocioException.Validacion("campos-solo-al-observar", "Los campos señalados solo acompañan una observación.");
        if (lista.Count > MaximoCamposSenalados || lista.Any(c => c.Length > 200))
            throw ReglaDeNegocioException.Validacion("campos-invalidos", $"Señala hasta {MaximoCamposSenalados} campos (rutas de hasta 200 caracteres).");
        return lista;
    }

    /// <summary>Quién aprobó los requisitos del área: <c>Administrador</c> si intervino (o solo hubo exenciones), si no <c>Humano</c>, si no <c>Sistema</c>.</summary>
    private static OrigenVeredicto OrigenDerivado(Expediente expediente, AreaDeExpediente area)
    {
        var origenes = expediente.RequisitosDelArea(area.AreaId)
            .SelectMany(r => r.Veredictos.Where(v => v.Vigente && v.AreaId == area.AreaId && v.Veredicto == Veredicto.Aprobado))
            .Select(v => v.Origen)
            .ToHashSet();
        return origenes.Contains(OrigenVeredicto.Administrador) || origenes.Count == 0 ? OrigenVeredicto.Administrador
            : origenes.Contains(OrigenVeredicto.Humano) ? OrigenVeredicto.Humano
            : OrigenVeredicto.Sistema;
    }

    /// <summary><c>Observado</c> exige al menos un motivo; <c>Aprobado</c> no lleva motivos.</summary>
    private static IReadOnlyList<MotivoAplicado> Motivos(Veredicto veredicto, IReadOnlyList<MotivoAplicado>? motivos)
    {
        var lista = motivos ?? [];
        if (veredicto == Veredicto.Observado && lista.Count == 0)
            throw ReglaDeNegocioException.Validacion("motivo-requerido", "Para observar indica al menos un motivo.");
        if (veredicto == Veredicto.Aprobado && lista.Count > 0)
            throw ReglaDeNegocioException.Validacion("motivos-solo-al-observar", "Los motivos solo acompañan una observación.");
        return lista;
    }
}
