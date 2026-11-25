using System.Text.Json.Serialization;

namespace Validalo.Dominio.Documentos;

/// <summary>De dónde salió el <c>vigenteHasta</c> (docs/02 §8.1, <c>motivo_vigencia</c>).</summary>
public enum BaseVigencia
{
    /// <summary>Regla <c>Ninguna</c> y sin fecha de vencimiento declarada: no vence.</summary>
    SinVencimiento,

    /// <summary>
    /// Antes de TD-10: fecha de expedición declarada (<c>fecha_expedicion</c>) + días de la regla. Ya no se calcula (la antigüedad máxima no define la
    /// vigencia); queda para leer las vigencias que se registraron con la regla anterior.
    /// </summary>
    FechaExpedicion,

    /// <summary>Antes de TD-10: sin fecha de expedición declarada, fecha de carga + días de la regla. Ya no se calcula.</summary>
    FechaCarga,

    /// <summary>Ganó la fecha de vencimiento propia del documento (<c>fecha_vencimiento</c>).</summary>
    VencimientoPropio,

    /// <summary>Regla <c>PeriodoMinimo</c>: el fin del periodo aún no se calcula (H6); sin fecha.</summary>
    PeriodoNoCalculado,

    /// <summary>El tercero ratificó que el documento no cambió: los días de la regla corren desde la ratificación (I-14).</summary>
    Ratificacion,

    /// <summary>Revalidar cada N días (TD-10): los días corren desde que la empresa aprobó la versión para el vínculo.</summary>
    Aprobacion
}

/// <summary>
/// Estado de la vigencia en una fecha: <c>PorVencer</c> desde el primer día de aviso, <c>EnGracia</c> pasado
/// <c>vigenteHasta</c> y <c>Vencida</c> pasada la gracia (o marcada con <see cref="VersionVencida"/>).
/// </summary>
public enum EstadoVigencia
{
    SinVencimiento,
    Vigente,
    PorVencer,
    EnGracia,
    Vencida
}

public sealed record CalculoDeVigencia(DateOnly? VigenteHasta, BaseVigencia Base);

/// <summary>
/// Vigencia de una versión para un vínculo (docs/02 §8.1: «el hecho es uno; la exigencia es de cada una»): la calcula la
/// regla del tipo del tenant de ese vínculo. <see cref="VencidaEn"/> se llena con <see cref="VersionVencida"/>.
/// </summary>
public sealed class VigenciaDeVersion
{
    public Guid TenantId { get; set; }

    public Guid EmpresaId { get; set; }

    public Guid VinculoId { get; set; }

    public Guid TipoDocumentoTenantId { get; set; }

    public DateOnly? VigenteHasta { get; set; }

    public BaseVigencia Base { get; set; }

    public List<int> DiasAviso { get; set; } = [];

    public int DiasGracia { get; set; }

    public DateTimeOffset CalculadaEn { get; set; }

    public DateTimeOffset? VencidaEn { get; set; }

    /// <summary>Última ratificación del tercero para este vínculo (RN-2): desde ella corre la revalidación.</summary>
    public DateTimeOffset? RatificadaEn { get; set; }

    /// <summary>
    /// Cuándo la empresa aprobó esta versión para el vínculo (TD-10): desde ahí corre «revalidar cada N días». Nula mientras no esté aprobada: antes
    /// de aprobarse no hay vigencia por revalidación.
    /// </summary>
    public DateTimeOffset? AprobadaEn { get; set; }

    /// <summary>La regla «revalidar cada N días» del tipo con la que se calculó esta vigencia (TD-10); nula si el tipo no revalida o es una vigencia anterior.</summary>
    public int? RevalidarCadaDias { get; set; }

    [JsonIgnore]
    public DateOnly? FinDeGracia => CalculadoraDeVigencia.FinDeGracia(VigenteHasta, DiasGracia);
}

/// <summary>
/// Cálculo de vigencias en dos capas (docs/02 §8.1, TD-6, TD-10), en fechas del calendario del negocio (<see cref="ZonaDeNegocio"/>):
/// <list type="bullet">
/// <item>capa 1: <c>fecha_vencimiento</c> declarada (si el tipo la pide y el tercero la llenó): el vencimiento propio del documento;</item>
/// <item>capa 2: <b>revalidar cada N días</b> desde que la empresa aprobó la versión para ese vínculo (o desde que el tercero la ratificó, la
/// más reciente de las dos fechas). Antes de aprobarse no hay fecha por revalidación. <c>PeriodoMinimo</c> aún sin fecha.</item>
/// </list>
/// <c>vigenteHasta = mín(capa1, capa2)</c> e inclusivo; la versión vence (<see cref="VersionVencida"/>) el día siguiente a
/// <c>vigenteHasta + diasGracia</c>. La <b>antigüedad máxima</b> no define la vigencia: es una condición de aceptación al subir
/// (<see cref="AntiguedadDelDocumento"/>).
/// </summary>
public static class CalculadoraDeVigencia
{
    /// <summary>
    /// Zona horaria del calendario del negocio (hoy, vencimientos, «expedición no futura»). Por omisión Bogotá; se fija al
    /// arrancar con <c>Validalo:ZonaHoraria</c> (FE-1). En UTC, entre las 7 p. m. y la medianoche de Bogotá ya era «mañana».
    /// </summary>
    public static TimeZoneInfo ZonaDeNegocio { get; set; } = Zona("America/Bogota");

    /// <summary>La fecha de calendario del instante en la zona del negocio.</summary>
    public static DateOnly Fecha(DateTimeOffset instante) => DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instante, ZonaDeNegocio).DateTime);

    /// <summary>La zona IANA indicada, o UTC si el sistema no la conoce.</summary>
    public static TimeZoneInfo Zona(string? id) =>
        !string.IsNullOrWhiteSpace(id) && TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zona) ? zona : TimeZoneInfo.Utc;

    /// <summary>
    /// La vigencia de una versión para un vínculo. <paramref name="aprobadaEn"/>: cuándo la empresa la aprobó para el vínculo (nulo si aún no);
    /// <paramref name="ratificadaEn"/>: la última ratificación del tercero (I-14). La revalidación cuenta desde la más reciente de las dos; sin ninguna
    /// no hay fecha por revalidación y solo rige el vencimiento propio, si lo declaró.
    /// </summary>
    public static CalculoDeVigencia Calcular(ReglasDeVigencia reglas, IReadOnlyList<DatoDeclarado>? datos, DateTimeOffset? aprobadaEn = null,
        DateTimeOffset? ratificadaEn = null)
    {
        var vencimientoPropio = EsquemaDeFormulario.Fecha(datos, EsquemaDeFormulario.FechaVencimiento);

        DateOnly? porRevalidacion = null;
        var baseRevalidacion = BaseVigencia.Aprobacion;
        if (reglas.RevalidarCadaDias is > 0 and var dias)
        {
            // Desde la aprobación o la ratificación, la que sea más reciente (I-14: ratificar reinicia el plazo).
            var (desde, origen) = (aprobadaEn, ratificadaEn) switch
            {
                ({ } aprobada, { } ratificada) => ratificada > aprobada ? (ratificada, BaseVigencia.Ratificacion) : (aprobada, BaseVigencia.Aprobacion),
                ({ } aprobada, null) => (aprobada, BaseVigencia.Aprobacion),
                (null, { } ratificada) => (ratificada, BaseVigencia.Ratificacion),
                _ => ((DateTimeOffset?)null, BaseVigencia.Aprobacion)
            };
            if (desde is { } fecha)
            {
                porRevalidacion = Fecha(fecha).AddDays(dias);
                baseRevalidacion = origen;
            }
        }

        if (vencimientoPropio is { } propio && (porRevalidacion is null || propio <= porRevalidacion))
            return new CalculoDeVigencia(propio, BaseVigencia.VencimientoPropio);
        if (porRevalidacion is not null)
            return new CalculoDeVigencia(porRevalidacion, baseRevalidacion);
        return new CalculoDeVigencia(null, reglas.Periodo is not null && !reglas.Revalida ? BaseVigencia.PeriodoNoCalculado : BaseVigencia.SinVencimiento);
    }

    public static DateOnly? FinDeGracia(DateOnly? vigenteHasta, int diasGracia) => vigenteHasta?.AddDays(Math.Max(0, diasGracia));

    /// <summary>Hora local (en la zona de negocio) a la que sale el aviso de una fecha: las 8:00.</summary>
    public static readonly TimeOnly HoraDeAviso = new(8, 0);

    /// <summary>
    /// Cuándo se dispara el aviso de una fecha: las 8:00 de esa fecha en la zona de negocio configurada
    /// (<c>Validalo:ZonaHoraria</c>; en Bogotá, 13:00 UTC). Lo usan los documentos y la vigencia del vínculo.
    /// </summary>
    public static DateTimeOffset MomentoDeAviso(DateOnly fecha) => MomentoDeAviso(fecha, ZonaDeNegocio);

    /// <summary>El aviso de <paramref name="fecha"/> a las 8:00 de <paramref name="zona"/>.</summary>
    public static DateTimeOffset MomentoDeAviso(DateOnly fecha, TimeZoneInfo zona) => Instante(fecha, HoraDeAviso, zona);

    /// <summary>
    /// Cuándo vence lo que terminó su gracia el día <paramref name="finDeGracia"/>: la medianoche (00:00) del día siguiente en la zona de
    /// negocio configurada (en Bogotá, 05:00 UTC).
    /// </summary>
    public static DateTimeOffset MomentoDeVencimiento(DateOnly finDeGracia) => MomentoDeVencimiento(finDeGracia, ZonaDeNegocio);

    /// <summary>El vencimiento tras el fin de gracia <paramref name="finDeGracia"/>: las 00:00 del día siguiente en <paramref name="zona"/>.</summary>
    public static DateTimeOffset MomentoDeVencimiento(DateOnly finDeGracia, TimeZoneInfo zona) => Instante(finDeGracia.AddDays(1), TimeOnly.MinValue, zona);

    /// <summary>
    /// El instante de una hora de pared en la zona. Una hora que no existe (el salto de la hora de verano) se corre una hora adelante; una
    /// que se repite (el fin de la hora de verano) toma su primera ocurrencia.
    /// </summary>
    private static DateTimeOffset Instante(DateOnly fecha, TimeOnly hora, TimeZoneInfo zona)
    {
        var pared = DateTime.SpecifyKind(fecha.ToDateTime(hora), DateTimeKind.Unspecified);
        if (zona.IsInvalidTime(pared))
            pared = pared.AddHours(1);
        var desfase = zona.IsAmbiguousTime(pared) ? zona.GetAmbiguousTimeOffsets(pared).Max() : zona.GetUtcOffset(pared);
        return new DateTimeOffset(pared, desfase);
    }

    /// <summary>Días de aviso convertidos en fechas (sin repetir, de la más próxima a la más lejana del vencimiento).</summary>
    public static IReadOnlyList<DateOnly> FechasDeAviso(DateOnly vigenteHasta, IEnumerable<int> diasAviso) =>
        [.. diasAviso.Where(d => d > 0).Distinct().Select(d => vigenteHasta.AddDays(-d)).Order()];

    public static EstadoVigencia Estado(DateOnly? vigenteHasta, IReadOnlyCollection<int> diasAviso, int diasGracia, DateOnly hoy, bool marcadaVencida = false)
    {
        if (vigenteHasta is not { } hasta)
            return EstadoVigencia.SinVencimiento;
        if (marcadaVencida || hoy > FinDeGracia(hasta, diasGracia))
            return EstadoVigencia.Vencida;
        if (hoy > hasta)
            return EstadoVigencia.EnGracia;
        var aviso = diasAviso.Count == 0 ? 0 : Math.Max(0, diasAviso.Max());
        return hoy >= hasta.AddDays(-aviso) ? EstadoVigencia.PorVencer : EstadoVigencia.Vigente;
    }
}
