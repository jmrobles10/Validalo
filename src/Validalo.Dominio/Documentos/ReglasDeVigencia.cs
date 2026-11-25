using Validalo.Dominio.Comun;

namespace Validalo.Dominio.Documentos;

/// <summary>
/// Las reglas de frescura de un tipo de documento (TD-10): <b>dos independientes y opcionales</b>.
/// <list type="bullet">
/// <item><see cref="AntiguedadMaximaDias"/>: condición de aceptación al subir; el documento debe haberse expedido hace
/// no más de ese número de días (contra la fecha de carga de la versión). No define la vigencia.</item>
/// <item><see cref="RevalidarCadaDias"/>: cada cuántos días hay que revalidar; se cuenta desde que la empresa aprueba esa versión para ese
/// vínculo (o desde que el tercero la ratifica) y es lo que hace vencer el documento.</item>
/// </list>
/// <see cref="Periodo"/> conserva la regla <c>PeriodoMinimo</c> de antes (el texto del periodo, p. ej. <c>ultimo-anio-fiscal-cerrado</c>).
/// </summary>
public sealed record ReglasDeVigencia(int? AntiguedadMaximaDias, int? RevalidarCadaDias, string? Periodo = null)
{
    /// <summary>Máximo admitido por cada regla: diez años.</summary>
    public const int MaximoDias = 3650;

    public static readonly ReglasDeVigencia Ninguna = new(null, null);

    /// <summary>Solo la antigüedad máxima al subir (días desde la expedición).</summary>
    public static ReglasDeVigencia SoloAntiguedad(int dias) => new(dias, null);

    /// <summary>Solo la revalidación periódica (días desde la aprobación de la empresa).</summary>
    public static ReglasDeVigencia SoloRevalidacion(int dias) => new(null, dias);

    /// <summary>Las dos reglas.</summary>
    public static ReglasDeVigencia Ambas(int antiguedadDias, int revalidarCadaDias) => new(antiguedadDias, revalidarCadaDias);

    /// <summary>Solo el periodo de antes (<c>PeriodoMinimo</c>).</summary>
    public static ReglasDeVigencia DePeriodo(string periodo) => new(null, null, periodo);

    [System.Text.Json.Serialization.JsonIgnore]
    public bool ExigeAntiguedad => AntiguedadMaximaDias is > 0;

    [System.Text.Json.Serialization.JsonIgnore]
    public bool Revalida => RevalidarCadaDias is > 0;

    [System.Text.Json.Serialization.JsonIgnore]
    public bool SinReglas => !ExigeAntiguedad && !Revalida && Periodo is null;

    /// <summary>
    /// Traduce la regla heredada (<see cref="ReglaFrescura"/>, una sola por tipo) a las dos reglas nuevas (TD-10, migración):
    /// <list type="bullet">
    /// <item><c>MaxDiasDesdeAprobacion(n)</c> ⇒ revalidar cada <c>n</c> días.</item>
    /// <item><c>MaxDiasDesdeExpedicion(n)</c> ⇒ antigüedad máxima de <c>n</c> días <b>y</b> revalidar cada <c>n</c> días. Su nombre decía «máximo de
    /// días desde la expedición»: exigía que el documento fuera reciente y, al contar desde la expedición, lo hacía vencer a los <c>n</c> días de
    /// expedido (se volvía a pedir). Las dos reglas conservan ambos efectos; el plazo de revalidación ahora corre desde la aprobación.</item>
    /// <item><c>PeriodoMinimo</c> ⇒ se conserva como periodo.</item>
    /// <item><c>Ninguna</c> ⇒ sin reglas.</item>
    /// </list>
    /// </summary>
    public static ReglasDeVigencia DeHeredada(ReglaFrescura? heredada) => heredada?.Tipo switch
    {
        TipoReglaFrescura.MaxDiasDesdeExpedicion when heredada.Dias is > 0 and var dias => Ambas(dias, dias),
        TipoReglaFrescura.MaxDiasDesdeAprobacion when heredada.Dias is > 0 and var dias => SoloRevalidacion(dias),
        TipoReglaFrescura.PeriodoMinimo when !string.IsNullOrWhiteSpace(heredada.Regla) => DePeriodo(heredada.Regla.Trim()),
        _ => Ninguna
    };

    /// <summary>
    /// Las reglas efectivas de un tipo guardado: las dos nuevas o, si el tipo aún trae una regla heredada <c>MaxDias*</c> sin haberse migrado
    /// (ambas nulas), la traducción de esa regla. Un tipo ya configurado con las reglas nuevas nunca vuelve a leer la heredada.
    /// </summary>
    public static ReglasDeVigencia Efectivas(ReglaFrescura heredada, int? antiguedadMaximaDias, int? revalidarCadaDias)
    {
        var traducida = DeHeredada(heredada);
        if (antiguedadMaximaDias is null && revalidarCadaDias is null && heredada.Tipo is TipoReglaFrescura.MaxDiasDesdeExpedicion or TipoReglaFrescura.MaxDiasDesdeAprobacion)
            return traducida;
        return new ReglasDeVigencia(antiguedadMaximaDias, revalidarCadaDias, traducida.Periodo);
    }

    /// <summary>Un valor de una regla: nulo = sin regla; fuera de <c>1..3650</c> ⇒ 422 con el <paramref name="codigo"/>.</summary>
    public static int? Validar(int? dias, string codigo, string que)
    {
        if (dias is null)
            return null;
        if (dias is < 1 or > MaximoDias)
            throw ReglaDeNegocioException.Validacion(codigo, $"{que} debe estar entre 1 y {MaximoDias} días.");
        return dias;
    }
}
