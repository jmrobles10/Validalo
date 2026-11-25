using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Validalo.Dominio.Documentos;

namespace Validalo.Dominio.Revision;

/// <summary>
/// Qué resolvió el motor para un documento y un área: <c>Sugerida</c> (Asistido: una sugerencia, ningún veredicto),
/// <c>AprobadaAutomaticamente</c>, <c>AprobadaConMuestreo</c> (aprobada y además queda para confirmación humana),
/// <c>Excepcion</c> (una persona decide; va a la bandeja de excepciones) y <c>SinAlcance</c> (el tipo o el área no están
/// autorizados para la revisión automática: se revisa como siempre, sin ruido en la bandeja) y <c>Observada</c> (Automático: el documento no cumple la
/// antigüedad máxima del tipo, TD-10, y el sistema lo observa al tercero sin pasar por una persona).
/// </summary>
public enum ResultadoDeRevision
{
    Sugerida,
    AprobadaAutomaticamente,
    AprobadaConMuestreo,
    Excepcion,
    SinAlcance,
    Observada
}

/// <summary>Sugerencia del nivel Asistido: <c>Aprobar</c> (sin excepciones) o <c>Revisar</c> (con motivos).</summary>
public enum SugerenciaDeRevision
{
    Aprobar,
    Revisar
}

/// <summary>Una razón (código estable y texto en español) por la que el sistema no aprueba solo o no sugiere aprobar.</summary>
public sealed record MotivoDeRevision(string Codigo, string Texto);

/// <summary>
/// La antigüedad máxima al subir del tipo frente a lo que leyó la IA (TD-10): <see cref="Estado"/>, el detalle para el revisor y lo que se le pide al tercero.
/// <see cref="Declarada"/>: el tercero declaró una fecha de expedición (aunque la IA no la encontrara).
/// </summary>
public sealed record AntiguedadParaRevisar(EstadoDeAntiguedad Estado, string Detalle, string? MensajeAlTercero, bool Declarada);

/// <summary>Lo que dejó el análisis de IA de la versión y que la empresa recibió (nunca el contenido del documento).</summary>
public sealed record AnalisisParaRevisar(decimal Confianza, bool Legible, int Alertas, string? TipoDetectado, int CamposCriticosCambiados);

/// <summary>
/// Todo lo que el motor necesita saber de un documento en un área: el análisis (nulo si la empresa no lo recibió) y el cruce
/// con la ficha (F5). <see cref="CrucePendiente"/>: el documento respalda secciones ya diligenciadas y su cruce aún no existe.
/// </summary>
public sealed record EntradaDeRevision(
    Guid DocumentoId,
    int Version,
    string? TipoCanonico,
    int Reenvios,
    bool AreaAutorizada,
    bool AreaExigeVariasAprobaciones,
    AnalisisParaRevisar? Analisis,
    bool CrucePendiente,
    bool DiscrepanciaCritica,
    bool ConDiscrepancias,
    AntiguedadParaRevisar? Antiguedad = null);

/// <summary>
/// Política de la empresa al decidir: nivel, umbral efectivo (el de la empresa, nunca bajo el del plan), muestreo, tipos
/// autorizados y lo aprobado en el mes contra el tope.
/// </summary>
public sealed record PoliticaDeRevision(
    NivelDeRevisionAutomatica Nivel,
    decimal UmbralConfianza,
    int PorcentajeMuestreo,
    IReadOnlyCollection<string> TiposAutorizados,
    int AprobadasEnElMes,
    int? TopeMensual);

/// <summary>
/// Lo que resolvió el motor. <see cref="ObservacionAlTercero"/>: con <c>Observada</c>, lo que se le pide al tercero (el siguiente paso accionable).
/// </summary>
public sealed record DecisionDeRevision(ResultadoDeRevision Resultado, SugerenciaDeRevision? Sugerencia, IReadOnlyList<MotivoDeRevision> Motivos,
    decimal? Confianza, string? ObservacionAlTercero = null)
{
    public bool Aprueba => Resultado is ResultadoDeRevision.AprobadaAutomaticamente or ResultadoDeRevision.AprobadaConMuestreo;

    /// <summary>El sistema observó el documento al tercero (antigüedad máxima incumplida).</summary>
    public bool Observa => Resultado == ResultadoDeRevision.Observada;
}

/// <summary>Códigos estables de los motivos de excepción (y sus textos) de la revisión automática.</summary>
public static class MotivosDeRevision
{
    public const string TipoNoAutorizado = "tipo-no-autorizado";
    public const string AreaNoAutorizada = "area-no-autorizada";
    public const string AreaConVariasAprobaciones = "area-con-varias-aprobaciones";
    public const string SinAnalisisIa = "sin-analisis-ia";
    public const string CrucePendiente = "cruce-pendiente";
    public const string ConfianzaBaja = "confianza-baja";
    public const string Ilegible = "ilegible";
    public const string AlertasDeManipulacion = "alertas-de-manipulacion";
    public const string TipoDetectadoDistinto = "tipo-detectado-distinto";
    public const string CampoCriticoCambiado = "campo-critico-cambiado";
    public const string DiscrepanciaCriticaFicha = "discrepancia-critica-ficha";
    public const string DiscrepanciasConLaFicha = "discrepancias-con-la-ficha";
    public const string VersionReenviada = "version-reenviada";
    public const string SinPresupuesto = "sin-presupuesto";
    public const string AntiguedadExcedida = "antiguedad-excedida";
    public const string SinFechaDeExpedicion = "sin-fecha-de-expedicion";

    public static MotivoDeRevision De(string codigo) => new(codigo, Texto(codigo));

    public static string Texto(string codigo) => codigo switch
    {
        TipoNoAutorizado => "El tipo de documento no está autorizado para la revisión automática.",
        AreaNoAutorizada => "El área no está autorizada para la revisión automática.",
        AreaConVariasAprobaciones => "El área exige varias aprobaciones: las da una persona.",
        SinAnalisisIa => "La empresa no recibió el análisis de IA de esta versión.",
        CrucePendiente => "Falta el cruce con la ficha del tercero.",
        ConfianzaBaja => "La confianza del análisis está bajo el umbral de la empresa.",
        Ilegible => "El documento no es legible.",
        AlertasDeManipulacion => "El análisis detectó señales de manipulación.",
        TipoDetectadoDistinto => "El documento parece ser de otro tipo.",
        CampoCriticoCambiado => "Cambió un campo crítico respecto de la versión anterior.",
        DiscrepanciaCriticaFicha => "El documento discrepa de la ficha en un campo crítico.",
        DiscrepanciasConLaFicha => "El documento discrepa de la ficha del tercero.",
        VersionReenviada => "Es una versión reenviada por el tercero: la revisa una persona.",
        SinPresupuesto => "Se alcanzó el tope mensual de aprobaciones automáticas.",
        AntiguedadExcedida => "El documento supera la antigüedad máxima que exige el tipo.",
        SinFechaDeExpedicion => "No se pudo verificar la fecha de expedición del documento.",
        _ => codigo
    };
}

/// <summary>
/// Motor de decisión de la revisión automática (puro y determinista). Tabla de decisión:
/// <list type="bullet">
/// <item><b>Manual</b> ⇒ sin acción (nulo): el análisis solo informa.</item>
/// <item><b>Asistido</b> ⇒ nunca emite veredictos: <c>Sugerida</c> con <c>Aprobar</c> (sin motivos) o <c>Revisar</c> (con ellos).</item>
/// <item><b>Automático</b> ⇒ tipo o área sin autorizar, o un área que exige varias aprobaciones: <c>SinAlcance</c>. Si el único motivo es la
/// antigüedad máxima del tipo excedida (o sin fecha de expedición que nadie declaró): <c>Observada</c>, el sistema observa al tercero con lo que debe hacer.
/// Con otros motivos: <c>Excepcion</c>. Sin motivos y con el tope mensual alcanzado: <c>Excepcion</c> (<c>sin-presupuesto</c>). Sin motivos y elegida por
/// muestreo: <c>AprobadaConMuestreo</c>. Si no: <c>AprobadaAutomaticamente</c>.</item>
/// </list>
/// Motivos (en este orden): sin análisis de IA o, con él, confianza baja, ilegible, alertas de manipulación, tipo detectado distinto y
/// campo crítico cambiado; luego antigüedad excedida o sin fecha de expedición (TD-10), cruce pendiente, discrepancia crítica o discrepancias con la ficha (F5) y versión reenviada.
/// </summary>
public static class MotorDeRevision
{
    public static DecisionDeRevision? Decidir(EntradaDeRevision entrada, PoliticaDeRevision politica)
    {
        if (politica.Nivel == NivelDeRevisionAutomatica.Manual)
            return null;

        if (FueraDeAlcance(entrada, politica) is { } fuera)
            return fuera;

        var motivos = Motivos(entrada, politica.UmbralConfianza);
        var confianza = entrada.Analisis?.Confianza;
        if (politica.Nivel == NivelDeRevisionAutomatica.Asistido)
            return new DecisionDeRevision(ResultadoDeRevision.Sugerida, motivos.Count == 0 ? SugerenciaDeRevision.Aprobar : SugerenciaDeRevision.Revisar, motivos,
                confianza);

        // Antigüedad máxima incumplida (TD-10) como único hallazgo: el análisis es fiable y el tercero sabe qué hacer, así que el sistema lo observa sin pasar
        // por una persona. Con otro hallazgo (confianza baja, ilegible…) la fecha leída puede estar mal: lo decide una persona. Una fecha declarada que la IA
        // no encontró es «no verificable»: tampoco se observa solo.
        if (motivos.Count > 0 && motivos.All(m => m.Codigo is MotivosDeRevision.AntiguedadExcedida or MotivosDeRevision.SinFechaDeExpedicion) &&
            entrada.Antiguedad is { MensajeAlTercero: { } mensaje } antiguedad &&
            (antiguedad.Estado == EstadoDeAntiguedad.Excedida || (antiguedad.Estado == EstadoDeAntiguedad.SinFecha && !antiguedad.Declarada)))
            return new DecisionDeRevision(ResultadoDeRevision.Observada, null, motivos, confianza, mensaje);
        if (motivos.Count > 0)
            return new DecisionDeRevision(ResultadoDeRevision.Excepcion, null, motivos, confianza);
        if (politica.TopeMensual is { } tope && politica.AprobadasEnElMes >= tope)
            return new DecisionDeRevision(ResultadoDeRevision.Excepcion, null, [MotivosDeRevision.De(MotivosDeRevision.SinPresupuesto)], confianza);
        return new DecisionDeRevision(EnMuestra(entrada.DocumentoId, entrada.Version, politica.PorcentajeMuestreo)
            ? ResultadoDeRevision.AprobadaConMuestreo
            : ResultadoDeRevision.AprobadaAutomaticamente, null, [], confianza);
    }

    /// <summary>
    /// ¿Esta versión cae en el muestreo? Determinista (misma versión, mismo resultado): los primeros 4 bytes del SHA-256 de
    /// <c>documento:versión</c> módulo 100 contra el porcentaje. 0 % nunca; 100 % siempre.
    /// </summary>
    public static bool EnMuestra(Guid documentoId, int version, int porcentaje)
    {
        if (porcentaje <= 0)
            return false;
        if (porcentaje >= 100)
            return true;
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{documentoId:N}:{version.ToString(CultureInfo.InvariantCulture)}"));
        return BitConverter.ToUInt32(hash, 0) % 100 < (uint)porcentaje;
    }

    /// <summary>
    /// En Automático, el tipo o el área sin autorizar (o un área que exige varias aprobaciones) dejan el documento fuera de la revisión
    /// automática: <c>SinAlcance</c>, sin esperar análisis alguno. En otro nivel, nunca.
    /// </summary>
    public static DecisionDeRevision? FueraDeAlcance(EntradaDeRevision entrada, PoliticaDeRevision politica)
    {
        if (politica.Nivel != NivelDeRevisionAutomatica.Automatico)
            return null;
        var tipo = (entrada.TipoCanonico ?? string.Empty).ToUpperInvariant();
        if (tipo.Length == 0 || !politica.TiposAutorizados.Contains(tipo, StringComparer.OrdinalIgnoreCase))
            return SinAlcance(MotivosDeRevision.TipoNoAutorizado);
        if (!entrada.AreaAutorizada)
            return SinAlcance(MotivosDeRevision.AreaNoAutorizada);
        return entrada.AreaExigeVariasAprobaciones ? SinAlcance(MotivosDeRevision.AreaConVariasAprobaciones) : null;
    }

    private static DecisionDeRevision SinAlcance(string codigo) => new(ResultadoDeRevision.SinAlcance, null, [MotivosDeRevision.De(codigo)], null);

    private static List<MotivoDeRevision> Motivos(EntradaDeRevision entrada, decimal umbral)
    {
        var motivos = new List<MotivoDeRevision>();
        if (entrada.Analisis is not { } analisis)
        {
            motivos.Add(MotivosDeRevision.De(MotivosDeRevision.SinAnalisisIa));
        }
        else
        {
            if (analisis.Confianza < umbral)
                motivos.Add(new MotivoDeRevision(MotivosDeRevision.ConfianzaBaja,
                    $"La confianza del análisis ({Porcentaje(analisis.Confianza)}) está bajo el umbral de la empresa ({Porcentaje(umbral)})."));
            if (!analisis.Legible)
                motivos.Add(MotivosDeRevision.De(MotivosDeRevision.Ilegible));
            if (analisis.Alertas > 0)
                motivos.Add(MotivosDeRevision.De(MotivosDeRevision.AlertasDeManipulacion));
            if (!string.IsNullOrWhiteSpace(analisis.TipoDetectado) &&
                !string.Equals(analisis.TipoDetectado.Trim(), entrada.TipoCanonico?.Trim(), StringComparison.OrdinalIgnoreCase))
                motivos.Add(new MotivoDeRevision(MotivosDeRevision.TipoDetectadoDistinto, $"El documento parece ser de otro tipo ({analisis.TipoDetectado.Trim()})."));
            if (analisis.CamposCriticosCambiados > 0)
                motivos.Add(MotivosDeRevision.De(MotivosDeRevision.CampoCriticoCambiado));
        }

        // La antigüedad máxima del tipo (TD-10): excedida o sin una fecha de expedición verificable. Sin lectura aún no se dice nada (ya cuenta como sin análisis).
        if (entrada.Antiguedad is { Estado: EstadoDeAntiguedad.Excedida } excedida)
            motivos.Add(new MotivoDeRevision(MotivosDeRevision.AntiguedadExcedida, excedida.Detalle));
        else if (entrada.Antiguedad is { Estado: EstadoDeAntiguedad.SinFecha } sinFecha)
            motivos.Add(new MotivoDeRevision(MotivosDeRevision.SinFechaDeExpedicion, sinFecha.Detalle));

        if (entrada.CrucePendiente)
            motivos.Add(MotivosDeRevision.De(MotivosDeRevision.CrucePendiente));
        if (entrada.DiscrepanciaCritica)
            motivos.Add(MotivosDeRevision.De(MotivosDeRevision.DiscrepanciaCriticaFicha));
        else if (entrada.ConDiscrepancias)
            motivos.Add(MotivosDeRevision.De(MotivosDeRevision.DiscrepanciasConLaFicha));
        if (entrada.Reenvios > 0)
            motivos.Add(MotivosDeRevision.De(MotivosDeRevision.VersionReenviada));
        return motivos;
    }

    private static string Porcentaje(decimal valor) => (valor * 100m).ToString("0.#", CultureInfo.InvariantCulture) + " %";
}
