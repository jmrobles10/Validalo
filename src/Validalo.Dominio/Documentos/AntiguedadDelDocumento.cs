using System.Globalization;
using System.Text.Json;
using Validalo.Dominio.Ficha;

namespace Validalo.Dominio.Documentos;

/// <summary>Cómo quedó la antigüedad de un documento frente a la regla de su tipo (TD-10).</summary>
public enum EstadoDeAntiguedad
{
    /// <summary>La fecha de expedición cumple: no supera el máximo de días.</summary>
    Cumple,

    /// <summary>La fecha de expedición supera el máximo de días: el tercero debe subir uno más reciente.</summary>
    Excedida,

    /// <summary>Se leyó el documento y no trae una fecha de expedición que se pueda verificar: no se puede comprobar la antigüedad.</summary>
    SinFecha,

    /// <summary>Aún no hay una lectura del documento (el análisis no llegó, no se consumió o el tipo no se lee): no se puede decir nada todavía.</summary>
    SinLectura
}

/// <summary>De dónde sale la fecha de expedición con la que se evaluó: lo que leyó la IA del documento o, si el tipo no se lee, lo que declaró el tercero.</summary>
public enum FuenteDeFechaDeExpedicion
{
    Ia,
    Declarada
}

/// <summary>
/// Resultado de evaluar la antigüedad máxima al subir (TD-10). <see cref="Dias"/>: días entre la expedición y la carga; <see cref="DifiereDeLaDeclarada"/>:
/// la fecha que leyó la IA no es la que declaró el tercero (evidencia para el revisor; la regla usa la de la IA).
/// </summary>
public sealed record ResultadoDeAntiguedad(
    EstadoDeAntiguedad Estado, int MaximoDias, DateOnly? FechaDeExpedicion, FuenteDeFechaDeExpedicion? Fuente, DateOnly? FechaDeclarada, int? Dias,
    bool DifiereDeLaDeclarada)
{
    /// <summary>Un hallazgo crítico: la antigüedad se excedió o no se pudo verificar. Nunca se aprueba solo.</summary>
    public bool EsCritico => Estado is EstadoDeAntiguedad.Excedida or EstadoDeAntiguedad.SinFecha;

    /// <summary>El resultado del cotejo para el revisor: <c>Coincide</c>, <c>Discrepa</c> o <c>NoVerificable</c> (<c>SinLectura</c> no se cota).</summary>
    public string Resultado => Estado switch
    {
        EstadoDeAntiguedad.Cumple => "Coincide",
        EstadoDeAntiguedad.Excedida => "Discrepa",
        _ => "NoVerificable"
    };
}

/// <summary>
/// Antigüedad máxima al subir (TD-10): el documento debe haberse expedido hace no más de <c>n</c> días, contados hasta la fecha de <b>carga</b> de la
/// versión en el calendario del negocio. La fecha de expedición es la que <b>lee la IA</b> del documento; la que declara el tercero se coteja con ella
/// (si difieren, es evidencia) pero manda la de la IA. Si la IA no la encuentra, no se puede verificar (<see cref="EstadoDeAntiguedad.SinFecha"/>)
/// aunque el tercero la haya declarado. Solo un tipo que no se lee (sin esquema de IA) toma la fecha declarada.
/// </summary>
public static class AntiguedadDelDocumento
{
    /// <summary>Clave de la fecha de expedición en lo que extrae la IA.</summary>
    public const string ClaveIa = "fechaExpedicion";

    /// <summary>
    /// Evalúa la antigüedad. Nulo si el tipo no exige antigüedad máxima. <paramref name="hayLectura"/>: la versión tiene un análisis de IA visible
    /// para quien consulta; <paramref name="fechaIa"/>: la fecha que ese análisis leyó (nula si no la encontró); <paramref name="tipoSeLee"/>: el tipo
    /// tiene lectura de IA (si no, la fecha declarada es la única fuente).
    /// </summary>
    public static ResultadoDeAntiguedad? Evaluar(int? maximoDias, DateOnly cargadaEl, bool hayLectura, DateOnly? fechaIa, DateOnly? declarada,
        bool tipoSeLee = true)
    {
        if (maximoDias is not { } maximo || maximo <= 0)
            return null;

        if (hayLectura)
        {
            if (fechaIa is not { } leida)
                return new ResultadoDeAntiguedad(EstadoDeAntiguedad.SinFecha, maximo, null, null, declarada, null, false);
            return Con(maximo, cargadaEl, leida, FuenteDeFechaDeExpedicion.Ia, declarada, declarada is { } d && d != leida);
        }

        // Un tipo que no se lee (sin esquema de IA) solo puede apoyarse en lo que declara el tercero; si no declaró nada no hay con qué evaluar.
        if (!tipoSeLee && declarada is { } soloDeclarada)
            return Con(maximo, cargadaEl, soloDeclarada, FuenteDeFechaDeExpedicion.Declarada, soloDeclarada, false);
        return new ResultadoDeAntiguedad(EstadoDeAntiguedad.SinLectura, maximo, null, null, declarada, null, false);
    }

    private static ResultadoDeAntiguedad Con(int maximo, DateOnly cargadaEl, DateOnly expedicion, FuenteDeFechaDeExpedicion fuente, DateOnly? declarada, bool difiere)
    {
        var dias = Math.Max(0, cargadaEl.DayNumber - expedicion.DayNumber);
        return new ResultadoDeAntiguedad(dias <= maximo ? EstadoDeAntiguedad.Cumple : EstadoDeAntiguedad.Excedida, maximo, expedicion, fuente, declarada, dias, difiere);
    }

    /// <summary>
    /// La fecha de expedición que leyó la IA (<c>fechaExpedicion</c>, <c>aaaa-mm-dd</c>) o, en los tipos de pares clave/valor, la del par
    /// <c>fechaExpedicion</c> de <c>datos</c>. Nula si no la encontró o no es una fecha.
    /// </summary>
    public static DateOnly? FechaLeida(IReadOnlyDictionary<string, JsonElement> campos)
    {
        if (Fecha(LecturaDeHechos.Texto(campos, ClaveIa)) is { } directa)
            return directa;
        if (campos.TryGetValue("datos", out var datos) && datos.ValueKind == JsonValueKind.Array)
        {
            foreach (var par in datos.EnumerateArray().Where(p => p.ValueKind == JsonValueKind.Object))
            {
                if (par.TryGetProperty("clave", out var clave) && clave.ValueKind == JsonValueKind.String &&
                    string.Equals(clave.GetString()?.Trim(), ClaveIa, StringComparison.OrdinalIgnoreCase) &&
                    par.TryGetProperty("valor", out var valor) && valor.ValueKind == JsonValueKind.String && Fecha(valor.GetString()) is { } delPar)
                    return delPar;
            }
        }

        return null;
    }

    /// <summary>La fecha <c>aaaa-mm-dd</c> (con o sin hora detrás); nula si no lo es.</summary>
    public static DateOnly? Fecha(string? texto)
    {
        var inicio = (texto ?? string.Empty).Trim();
        if (inicio.Length > 10)
            inicio = inicio[..10];
        return DateOnly.TryParseExact(inicio, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var fecha) ? fecha : null;
    }

    // ---------- Textos ----------

    /// <summary>La fecha como la lee una persona en Colombia: <c>17/07/2024</c>.</summary>
    public static string Dia(DateOnly fecha) => fecha.ToString("dd/MM/yyyy", CultureInfo.InvariantCulture);

    /// <summary>El detalle para el revisor: la fecha, los días y el máximo; con la fecha declarada si difiere o si la IA no encontró la del documento.</summary>
    public static string Detalle(ResultadoDeAntiguedad r)
    {
        var maximo = $"el máximo es {r.MaximoDias}";
        var declarada = r.FechaDeclarada is { } d ? Dia(d) : null;
        switch (r.Estado)
        {
            case EstadoDeAntiguedad.SinFecha:
                return "No se encontró la fecha de expedición en el documento, así que no se puede verificar su antigüedad; " + maximo + " días." +
                       (declarada is null ? string.Empty : $" El tercero declaró el {declarada}.");
            case EstadoDeAntiguedad.SinLectura:
                return $"Aún no hay una lectura del documento; {maximo} días." + (declarada is null ? string.Empty : $" El tercero declaró el {declarada}.");
            default:
                var origen = r.Fuente == FuenteDeFechaDeExpedicion.Declarada ? " (declarada por el tercero)" : string.Empty;
                var texto = $"Expedida el {Dia(r.FechaDeExpedicion!.Value)}{origen}: {Dias(r.Dias!.Value)}; {maximo}.";
                return r.DifiereDeLaDeclarada && declarada is not null ? texto + $" El tercero declaró otra fecha: {declarada}." : texto;
        }
    }

    /// <summary>
    /// Lo que se le pide al tercero cuando el documento no cumple: un documento reciente y, si no traía fecha, que la muestre. Nulo si cumple o aún no hay
    /// lectura. <paramref name="nombreDelTipo"/> es el nombre del tipo de documento de la empresa.
    /// </summary>
    public static string? MensajeAlTercero(ResultadoDeAntiguedad r, string nombreDelTipo) => r.Estado switch
    {
        EstadoDeAntiguedad.Excedida => $"Sube el documento «{nombreDelTipo}» expedido hace menos de {Dias(r.MaximoDias)}.",
        EstadoDeAntiguedad.SinFecha =>
            $"Sube el documento «{nombreDelTipo}» expedido hace menos de {Dias(r.MaximoDias)} y que muestre su fecha de expedición.",
        _ => null
    };

    private static string Dias(int dias) => dias == 1 ? "1 día" : $"{dias} días";
}
