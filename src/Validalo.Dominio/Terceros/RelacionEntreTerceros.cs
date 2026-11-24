using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Validalo.Dominio.Comun;

namespace Validalo.Dominio.Terceros;

/// <summary>Cómo se relaciona una persona con otro tercero (ADR-0010).</summary>
public enum TipoRelacionTerceros
{
    RepresentanteLegal,
    Suplente,
    Socio,
    BeneficiarioFinal,

    /// <summary>Miembro de un consorcio o unión temporal.</summary>
    MiembroDe
}

/// <summary>De dónde salió la relación: la declaró el tercero, la leyó la IA de un documento, la trajo un importador o la registró Plataforma.</summary>
public enum FuenteDeRelacion
{
    Declarada,
    ExtraidaIa,
    Importacion,
    Plataforma
}

/// <summary>
/// Estado de la relación. Solo una <see cref="Confirmada"/> cuenta (requisitos, listas restrictivas): una <see cref="Propuesta"/> (lo que detectó la IA y el tercero aún
/// no confirma) no cambia nada por sí sola.
/// </summary>
public enum EstadoDeRelacion
{
    Propuesta,
    Confirmada,
    Finalizada,
    Descartada
}

/// <summary>Quién confirmó una relación propuesta: el tercero desde su cuenta, un revisor al revalidar el documento o el sistema por la regla de la confianza alta.</summary>
public enum ViaDeConfirmacionDeRelacion
{
    Tercero,
    Revisor,
    Automatica
}

// ---------- Eventos (stream RelacionEntreTerceros-{id determinista}, tenant técnico «boveda») ----------

/// <summary>
/// Primer evento de una relación que declara el tercero (desde su ficha o su cuenta), trae un importador o registra Plataforma: nace <see cref="EstadoDeRelacion.Confirmada"/>
/// (quien la declara es quien la confirma). <paramref name="DeFicha"/>: la mantiene la sincronización de la ficha legal (si la persona deja de figurar, la relación termina).
/// </summary>
public sealed record RelacionRegistrada(Guid RelacionId, Guid OrigenId, Guid DestinoId, TipoRelacionTerceros Tipo, bool Principal, decimal? Participacion,
    string? Cargo, DateOnly VigenteDesde, FuenteDeRelacion Fuente, bool DeFicha, string Por, DateTimeOffset Fecha);

/// <summary>
/// Primer evento de una relación que la IA leyó de un documento (la Cámara de comercio) y que difiere de lo que hay: nace <see cref="EstadoDeRelacion.Propuesta"/> y no
/// cambia nada hasta que se confirme (ADR-0010, regla 5). <paramref name="Confianza"/> va de 0 a 1; <paramref name="DocumentoId"/> y <paramref name="Version"/> son la
/// versión del documento que la sustenta.
/// </summary>
public sealed record CambioDeRelacionDetectado(Guid RelacionId, Guid OrigenId, Guid DestinoId, TipoRelacionTerceros Tipo, bool Principal, decimal? Participacion,
    string? Cargo, decimal Confianza, Guid? DocumentoId, int? Version, DateTimeOffset Fecha);

/// <summary>La propuesta pasó a ser relación vigente: la confirmó el tercero, un revisor o el sistema.</summary>
public sealed record RelacionConfirmada(Guid RelacionId, string Por, ViaDeConfirmacionDeRelacion Via, DateOnly VigenteDesde, DateTimeOffset Fecha, bool? DeFicha = null);

/// <summary>El tercero (o quien decide) descartó lo que detectó la IA: la relación nunca fue vigente.</summary>
public sealed record CambioDeRelacionDescartado(Guid RelacionId, string Por, DateTimeOffset Fecha);

/// <summary>La relación pasó a ser (o dejó de ser) la principal de su tipo ante el tercero destino.</summary>
public sealed record RelacionMarcadaPrincipal(Guid RelacionId, bool Principal, DateTimeOffset Fecha);

/// <summary>
/// Cambió la participación o el cargo de la persona en la relación y, si <paramref name="DeFicha"/> viene (los eventos anteriores no lo traen), la ficha legal pasó a mantenerla: la persona
/// que el tercero había declarado a mano figura ahora en su sección legal, que es el único lugar donde se registra.
/// </summary>
public sealed record RelacionActualizada(Guid RelacionId, decimal? Participacion, string? Cargo, DateTimeOffset Fecha, bool? DeFicha = null);

/// <summary>La relación terminó: deja de contar desde ya (no es vigente en ninguna fecha); <paramref name="VigenteHasta"/> registra el último día en que valió.</summary>
public sealed record RelacionTerminada(Guid RelacionId, DateOnly VigenteHasta, string Motivo, string Por, DateTimeOffset Fecha);

/// <summary>Una relación terminada o descartada vuelve a declararse: vigente otra vez, con los datos de ahora.</summary>
public sealed record RelacionRestablecida(Guid RelacionId, DateOnly VigenteDesde, bool Principal, decimal? Participacion, string? Cargo, string Por,
    DateTimeOffset Fecha, bool? DeFicha = null);

/// <summary>
/// Relación entre dos terceros (ADR-0010): una <b>persona natural</b> (<see cref="OrigenId"/>, con bóveda propia) es representante legal, suplente, socio, beneficiario
/// final o miembro de otro tercero (<see cref="DestinoId"/>). Un stream por (destino, persona, tipo) en el tenant técnico <c>boveda</c> con snapshot inline: la lee el
/// tercero destino (sus personas relacionadas), la resolución de requisitos <c>DePersonaRelacionada</c> y las listas restrictivas. Los métodos de decisión validan y
/// devuelven eventos (nulo si no hay nada que cambiar: idempotentes); los <c>Apply</c> solo evolucionan el estado.
/// </summary>
public sealed class RelacionEntreTerceros
{
    public const int MaximoCargo = 150;

    public const decimal ConfianzaParaConfirmarSola = 0.98m;

    public Guid Id { get; set; }

    public long Version { get; set; }

    /// <summary>La persona natural (con su bóveda propia).</summary>
    public Guid OrigenId { get; set; }

    /// <summary>El tercero al que la persona se relaciona (el jurídico, el consorcio…).</summary>
    public Guid DestinoId { get; set; }

    public TipoRelacionTerceros Tipo { get; set; }

    public bool Principal { get; set; }

    /// <summary>Participación en porcentaje (socios, beneficiarios finales, miembros); nula si no aplica o no se conoce.</summary>
    public decimal? Participacion { get; set; }

    public string? Cargo { get; set; }

    public EstadoDeRelacion Estado { get; set; }

    public FuenteDeRelacion Fuente { get; set; }

    /// <summary>La mantiene la sincronización de la ficha legal del destino: si la persona deja de figurar en ella, la relación termina.</summary>
    public bool DeFicha { get; set; }

    /// <summary>Desde cuándo vale (día de negocio); en una propuesta, desde que se confirma.</summary>
    public DateOnly VigenteDesde { get; set; }

    /// <summary>Último día en que vale; nulo mientras no termine.</summary>
    public DateOnly? VigenteHasta { get; set; }

    /// <summary>Confianza de la IA (0 a 1) si la relación nació de un cambio detectado.</summary>
    public decimal? Confianza { get; set; }

    /// <summary>Versión del documento que sustenta lo detectado por la IA.</summary>
    public Guid? DocumentoId { get; set; }

    public int? VersionDelDocumento { get; set; }

    /// <summary>Quién la declaró o confirmó (id del tercero, de un operador o <c>sistema</c>).</summary>
    public string? ConfirmadaPor { get; set; }

    public ViaDeConfirmacionDeRelacion? ConfirmadaVia { get; set; }

    public DateTimeOffset? ConfirmadaEn { get; set; }

    public string? MotivoDeTermino { get; set; }

    public DateTimeOffset CreadaEn { get; set; }

    public DateTimeOffset ActualizadaEn { get; set; }

    /// <summary>¿Cuenta hoy? Confirmada, ya iniciada y sin terminar.</summary>
    public bool EsVigente(DateOnly hoy) =>
        Estado == EstadoDeRelacion.Confirmada && VigenteDesde <= hoy && (VigenteHasta is null || VigenteHasta >= hoy);

    [JsonIgnore]
    public bool EstaPropuesta => Estado == EstadoDeRelacion.Propuesta;

    /// <summary>Id determinista de la relación de una persona con un tercero y su tipo: registrarla dos veces no crea dos streams.</summary>
    public static Guid IdPara(Guid destinoId, Guid origenId, TipoRelacionTerceros tipo) =>
        new(SHA256.HashData(Encoding.UTF8.GetBytes($"validalo:relacion:{destinoId:N}:{origenId:N}:{tipo}"))[..16]);

    // ---------- Decisiones ----------

    /// <summary>Declara una relación (nace confirmada). 422 <c>relacion-consigo-misma</c>, <c>tipo-relacion-invalido</c>, <c>participacion-invalida</c>, <c>cargo-demasiado-largo</c>.</summary>
    public static RelacionRegistrada Registrar(Guid origenId, Guid destinoId, TipoRelacionTerceros tipo, bool principal, decimal? participacion, string? cargo,
        DateOnly desde, FuenteDeRelacion fuente, bool deFicha, string por, DateTimeOffset ahora)
    {
        Validar(origenId, destinoId, tipo, participacion, cargo);
        return new RelacionRegistrada(IdPara(destinoId, origenId, tipo), origenId, destinoId, tipo, principal, participacion, Texto(cargo), desde, fuente, deFicha,
            por, ahora);
    }

    /// <summary>Anota lo que la IA leyó de un documento y que difiere de lo vigente: una propuesta que nadie vio todavía en la relación.</summary>
    public static CambioDeRelacionDetectado Detectar(Guid origenId, Guid destinoId, TipoRelacionTerceros tipo, bool principal, decimal? participacion, string? cargo,
        decimal confianza, Guid? documentoId, int? version, DateTimeOffset ahora)
    {
        Validar(origenId, destinoId, tipo, participacion, cargo);
        if (confianza is < 0 or > 1)
            throw ReglaDeNegocioException.Validacion("confianza-invalida", "La confianza va de 0 a 1.");
        return new CambioDeRelacionDetectado(IdPara(destinoId, origenId, tipo), origenId, destinoId, tipo, principal, participacion, Texto(cargo), confianza,
            documentoId, version, ahora);
    }

    /// <summary>
    /// La IA vuelve a leer a la persona en un documento <b>distinto</b> al de la propuesta que se descartó (o de la relación que terminó): vuelve a ser una propuesta con los
    /// datos de ahora. Una propuesta ya pendiente, una vigente o una descartada por este mismo documento y versión ⇒ nulo (no se insiste con lo que el tercero ya decidió).
    /// </summary>
    public CambioDeRelacionDetectado? Redetectar(bool principal, decimal? participacion, string? cargo, decimal confianza, Guid? documentoId, int? version, DateTimeOffset ahora)
    {
        if (Estado is EstadoDeRelacion.Propuesta or EstadoDeRelacion.Confirmada)
            return null;
        if (Estado == EstadoDeRelacion.Descartada && DocumentoId == documentoId && VersionDelDocumento == version)
            return null;
        return Detectar(OrigenId, DestinoId, Tipo, principal, participacion, cargo, confianza, documentoId, version, ahora);
    }

    /// <summary>
    /// Confirma una propuesta: pasa a vigente desde <paramref name="hoy"/>. Ya confirmada ⇒ nulo (idempotente); finalizada o descartada ⇒ 409
    /// <c>relacion-no-propuesta</c>.
    /// </summary>
    public RelacionConfirmada? Confirmar(string por, ViaDeConfirmacionDeRelacion via, DateOnly hoy, DateTimeOffset ahora, bool? deFicha = null)
    {
        if (Estado == EstadoDeRelacion.Confirmada)
            return null;
        if (Estado != EstadoDeRelacion.Propuesta)
            throw ReglaDeNegocioException.Conflicto("relacion-no-propuesta", "Esa relación ya no es una propuesta pendiente de confirmar.");
        return new RelacionConfirmada(Id, por, via, hoy, ahora, deFicha);
    }

    /// <summary>Descarta una propuesta. Ya descartada ⇒ nulo; vigente o terminada ⇒ 409 <c>relacion-no-propuesta</c> (una vigente se termina, no se descarta).</summary>
    public CambioDeRelacionDescartado? Descartar(string por, DateTimeOffset ahora)
    {
        if (Estado == EstadoDeRelacion.Descartada)
            return null;
        if (Estado != EstadoDeRelacion.Propuesta)
            throw ReglaDeNegocioException.Conflicto("relacion-no-propuesta", "Solo se descarta una propuesta pendiente; una relación vigente se termina.");
        return new CambioDeRelacionDescartado(Id, por, ahora);
    }

    /// <summary>
    /// Termina una relación vigente: deja de contar ya y <paramref name="hasta"/> queda como el último día que valió. Ya terminada ⇒ nulo; una propuesta ⇒ 409 <c>relacion-propuesta</c> (se descarta).
    /// </summary>
    public RelacionTerminada? Terminar(DateOnly hasta, string? motivo, string por, DateTimeOffset ahora)
    {
        if (Estado is EstadoDeRelacion.Finalizada or EstadoDeRelacion.Descartada)
            return null;
        if (Estado == EstadoDeRelacion.Propuesta)
            throw ReglaDeNegocioException.Conflicto("relacion-propuesta", "Esa relación aún es una propuesta: descártala en vez de terminarla.");
        var texto = Texto(motivo) ?? "Terminada.";
        if (texto.Length > 300)
            throw ReglaDeNegocioException.Validacion("motivo-demasiado-largo", "El motivo admite hasta 300 caracteres.");
        return new RelacionTerminada(Id, hasta < VigenteDesde ? VigenteDesde : hasta, texto, por, ahora);
    }

    /// <summary>Cambia si la relación es la principal de su tipo. Solo una confirmada; sin cambio ⇒ nulo.</summary>
    public RelacionMarcadaPrincipal? MarcarPrincipal(bool principal, DateTimeOffset ahora) =>
        Estado == EstadoDeRelacion.Confirmada && Principal != principal ? new RelacionMarcadaPrincipal(Id, principal, ahora) : null;

    /// <summary>
    /// Cambia la participación o el cargo y, con <paramref name="deFicha"/>, hace que la ficha legal la mantenga (la persona declarada a mano que ahora figura en la sección legal).
    /// Solo una confirmada; sin cambio ⇒ nulo.
    /// </summary>
    public RelacionActualizada? Actualizar(decimal? participacion, string? cargo, DateTimeOffset ahora, bool? deFicha = null)
    {
        if (Estado != EstadoDeRelacion.Confirmada)
            return null;
        Validar(OrigenId, DestinoId, Tipo, participacion, cargo);
        var nuevoCargo = Texto(cargo);
        var adopta = deFicha == true && !DeFicha;
        return Participacion == participacion && Cargo == nuevoCargo && !adopta ? null : new RelacionActualizada(Id, participacion, nuevoCargo, ahora, adopta ? true : null);
    }

    /// <summary>Vuelve a declarar una relación terminada o descartada. Solo en esos estados (en los demás ⇒ nulo).</summary>
    public RelacionRestablecida? Restablecer(DateOnly desde, bool principal, decimal? participacion, string? cargo, string por, DateTimeOffset ahora, bool? deFicha = null)
    {
        if (Estado is not (EstadoDeRelacion.Finalizada or EstadoDeRelacion.Descartada))
            return null;
        Validar(OrigenId, DestinoId, Tipo, participacion, cargo);
        return new RelacionRestablecida(Id, desde, principal, participacion, Texto(cargo), por, ahora, deFicha);
    }

    private static void Validar(Guid origenId, Guid destinoId, TipoRelacionTerceros tipo, decimal? participacion, string? cargo)
    {
        if (origenId == destinoId)
            throw ReglaDeNegocioException.Validacion("relacion-consigo-misma", "Una persona no se relaciona consigo misma.");
        if (!Enum.IsDefined(tipo))
            throw ReglaDeNegocioException.Validacion("tipo-relacion-invalido", "El tipo de relación no existe (RepresentanteLegal, Suplente, Socio, BeneficiarioFinal, MiembroDe).");
        if (participacion is < 0 or > 100)
            throw ReglaDeNegocioException.Validacion("participacion-invalida", "La participación va de 0 a 100.");
        if (Texto(cargo) is { Length: > MaximoCargo })
            throw ReglaDeNegocioException.Validacion("cargo-demasiado-largo", $"El cargo admite hasta {MaximoCargo} caracteres.");
    }

    private static string? Texto(string? texto) => string.IsNullOrWhiteSpace(texto) ? null : texto.Trim();

    // ---------- Evolución ----------

    public static RelacionEntreTerceros Create(RelacionRegistrada e) => new()
    {
        Id = e.RelacionId,
        OrigenId = e.OrigenId,
        DestinoId = e.DestinoId,
        Tipo = e.Tipo,
        Principal = e.Principal,
        Participacion = e.Participacion,
        Cargo = e.Cargo,
        Estado = EstadoDeRelacion.Confirmada,
        Fuente = e.Fuente,
        DeFicha = e.DeFicha,
        VigenteDesde = e.VigenteDesde,
        ConfirmadaPor = e.Por,
        ConfirmadaVia = ViaDeConfirmacionDeRelacion.Tercero,
        ConfirmadaEn = e.Fecha,
        CreadaEn = e.Fecha,
        ActualizadaEn = e.Fecha
    };

    public static RelacionEntreTerceros Create(CambioDeRelacionDetectado e) => new()
    {
        Id = e.RelacionId,
        OrigenId = e.OrigenId,
        DestinoId = e.DestinoId,
        Tipo = e.Tipo,
        Principal = e.Principal,
        Participacion = e.Participacion,
        Cargo = e.Cargo,
        Estado = EstadoDeRelacion.Propuesta,
        Fuente = FuenteDeRelacion.ExtraidaIa,
        Confianza = e.Confianza,
        DocumentoId = e.DocumentoId,
        VersionDelDocumento = e.Version,
        CreadaEn = e.Fecha,
        ActualizadaEn = e.Fecha
    };

    public void Apply(CambioDeRelacionDetectado e)
    {
        // La relación ya existía (terminada o descartada) y la IA la vuelve a proponer: otra vez una propuesta, con lo que la IA leyó ahora.
        Estado = EstadoDeRelacion.Propuesta;
        Fuente = FuenteDeRelacion.ExtraidaIa;
        Principal = e.Principal;
        Participacion = e.Participacion;
        Cargo = e.Cargo;
        Confianza = e.Confianza;
        DocumentoId = e.DocumentoId;
        VersionDelDocumento = e.Version;
        VigenteHasta = null;
        MotivoDeTermino = null;
        DeFicha = false;
        ActualizadaEn = e.Fecha;
    }

    public void Apply(RelacionConfirmada e)
    {
        Estado = EstadoDeRelacion.Confirmada;
        VigenteDesde = e.VigenteDesde;
        VigenteHasta = null;
        ConfirmadaPor = e.Por;
        ConfirmadaVia = e.Via;
        ConfirmadaEn = e.Fecha;
        if (e.DeFicha is { } deFichaConfirmada)
            DeFicha = deFichaConfirmada;
        ActualizadaEn = e.Fecha;
    }

    public void Apply(CambioDeRelacionDescartado e)
    {
        Estado = EstadoDeRelacion.Descartada;
        ConfirmadaPor = e.Por;
        ConfirmadaEn = e.Fecha;
        ActualizadaEn = e.Fecha;
    }

    public void Apply(RelacionMarcadaPrincipal e)
    {
        Principal = e.Principal;
        ActualizadaEn = e.Fecha;
    }

    public void Apply(RelacionActualizada e)
    {
        Participacion = e.Participacion;
        Cargo = e.Cargo;
        if (e.DeFicha is { } deFicha)
            DeFicha = deFicha;
        ActualizadaEn = e.Fecha;
    }

    public void Apply(RelacionTerminada e)
    {
        Estado = EstadoDeRelacion.Finalizada;
        VigenteHasta = e.VigenteHasta;
        MotivoDeTermino = e.Motivo;
        Principal = false;
        ActualizadaEn = e.Fecha;
    }

    public void Apply(RelacionRestablecida e)
    {
        Estado = EstadoDeRelacion.Confirmada;
        VigenteDesde = e.VigenteDesde;
        VigenteHasta = null;
        MotivoDeTermino = null;
        Principal = e.Principal;
        Participacion = e.Participacion;
        Cargo = e.Cargo;
        ConfirmadaPor = e.Por;
        ConfirmadaVia = ViaDeConfirmacionDeRelacion.Tercero;
        ConfirmadaEn = e.Fecha;
        if (e.DeFicha is { } deFichaRestablecida)
            DeFicha = deFichaRestablecida;
        ActualizadaEn = e.Fecha;
    }

    /// <summary>El agregado con los eventos nuevos ya aplicados (para decidir sobre lo que quedará, sin tocar el original).</summary>
    public RelacionEntreTerceros Proyectar(IEnumerable<object> eventos)
    {
        var copia = (RelacionEntreTerceros)MemberwiseClone();
        foreach (var evento in eventos)
        {
            switch (evento)
            {
                case CambioDeRelacionDetectado e: copia.Apply(e); break;
                case RelacionConfirmada e: copia.Apply(e); break;
                case CambioDeRelacionDescartado e: copia.Apply(e); break;
                case RelacionMarcadaPrincipal e: copia.Apply(e); break;
                case RelacionActualizada e: copia.Apply(e); break;
                case RelacionTerminada e: copia.Apply(e); break;
                case RelacionRestablecida e: copia.Apply(e); break;
            }
        }

        return copia;
    }
}
