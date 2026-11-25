using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Revision;

namespace Validalo.Aplicacion.Revision;

/// <summary>
/// Lo que la empresa sabe del análisis de IA de una versión: <see cref="Analisis"/> (nulo si no lo recibió); <see cref="IaPuedeLlegar"/>: aún puede llegar (hay plan activo,
/// cupo y la IA no falló); <see cref="EmpresaUsaIa"/>: la empresa tiene un plan de IA activo.
/// </summary>
public sealed record LecturaDeLaVersion(AnalisisParaRevisar? Analisis, bool IaPuedeLlegar, bool EmpresaUsaIa);

/// <summary>Un campo del cruce que difiere: su etiqueta, lo declarado, lo que trae el documento y la nota del cruce (nulos si no hay).</summary>
public sealed record CampoQueDifiere(string Etiqueta, string? Declarado, string? Extraido, string? Detalle)
{
    /// <summary>
    /// «Razón social (declaró ACEROS SAS; el documento trae ACEROS LTDA)»; sin declarado, «declaró —». Si el documento no trae el dato, lo que dice el cruce («No figura en el
    /// documento»).
    /// </summary>
    public string Descripcion()
    {
        if (string.IsNullOrWhiteSpace(Extraido) && !string.IsNullOrWhiteSpace(Detalle))
            return $"{Etiqueta} ({Detalle.Trim().TrimEnd('.')})";
        return $"{Etiqueta} (declaró {Valor(Declarado)}; el documento trae {Valor(Extraido)})";
    }

    private static string Valor(string? valor) => string.IsNullOrWhiteSpace(valor) ? "—" : valor.Trim();
}

/// <summary>
/// Qué dice el cruce de un documento: si lo hay, si algo difiere, los campos <b>críticos</b> que difieren (motivo de revisión), los críticos que no se pudieron verificar y los
/// que difieren sin ser críticos (una nota: no mandan el documento a una persona, IA-16).
/// </summary>
public sealed record HallazgosDeCruce(bool HayCruce, bool ConDiscrepancias, IReadOnlyList<CampoQueDifiere> CriticosQueDifieren, IReadOnlyList<string> CriticosSinVerificar,
    IReadOnlyList<CampoQueDifiere> NoCriticosQueDifieren);

/// <summary>
/// Arma lo que el motor de la revisión (<see cref="MotorDeRevision"/>) necesita de un documento del expediente: el análisis de IA que <b>la empresa</b> recibió, el cruce con
/// lo declarado (la ficha del tercero o, en el documento de una persona relacionada, la persona declarada, ADR-0010) y la antigüedad máxima del tipo. Lo usan el procesador
/// de la revisión automática (para decidir) y el detalle del expediente (para la conclusión que ve el revisor, en cualquier nivel): una sola manera de leer los mismos hechos.
/// </summary>
public static class EntradasDeRevision
{
    /// <summary>Tipos de documento de una persona que se cruzan con lo declarado de ella (número de identificación y nombre).</summary>
    private static readonly string[] TiposDeIdentidadDePersona = ["CEDULA", "PASAPORTE", "CERTIFICADO_ANTECEDENTES"];

    /// <summary>
    /// El análisis de IA que la empresa recibió de la versión (<paramref name="consumida"/>: consumió su validación, IA-3) y si todavía puede llegar. Sin cupo (incluidas y
    /// adicional agotados) la empresa no consumirá la validación de la versión: el análisis no le va a llegar (IA-4, IA-6); si ya la consumió, viene en camino.
    /// </summary>
    public static LecturaDeLaVersion Leer(VersionDocumento? version, bool consumida, PlanDeIaEmpresa? plan, UsoMensualIa usoIa, bool iaHabilitada)
    {
        var ia = consumida ? version?.Ia : null;
        AnalisisParaRevisar? analisis = ia is null ? null : new AnalisisParaRevisar(ia.Confianza, ia.Legible, ia.Alertas.Count, ia.TipoDetectado, ia.CamposCriticosCambiados.Count);
        var sinCupo = !consumida && usoIa.CupoDisponible(plan) is null;
        var puedeLlegar = analisis is null && iaHabilitada && plan is { Activo: true } && !sinCupo && version is not null && version.FalloIa is null;
        return new LecturaDeLaVersion(analisis, puedeLlegar, plan is { Activo: true });
    }

    /// <summary>
    /// El cruce del documento de una persona relacionada con la persona declarada (el número de identificación y los nombres y apellidos que la ficha legal registró y la relación
    /// llevó al requisito), con la lectura de IA que la empresa recibió. Nulo si el documento no es de una persona, no hay quien cumpla el rol, el tipo no es de identidad o no hay lectura.
    /// </summary>
    public static CruceDeSeccion? CruceDePersona(RequisitoDeExpediente requisito, VersionDocumento? version, LecturaDeLaVersion lectura)
    {
        if (requisito.Persona is not { PersonaId: not null } persona || requisito.VersionActual is not { } actual || lectura.Analisis is null || version?.Ia is not { } ia ||
            requisito.TipoCanonico is not { } tipo || !TiposDeIdentidadDePersona.Contains(tipo, StringComparer.OrdinalIgnoreCase))
            return null;
        return CruceConDocumento.CruzarPersona(persona.Nombre, PartesDeLaIdentificacion(persona.Identificacion).Numero, tipo, actual.DocumentoId, actual.Numero, ia.Campos,
            ia.Confianza, ia.Legible, ia.Fecha);
    }

    /// <summary>
    /// La entrada del motor para el documento que cubre el requisito. <paramref name="soporte"/>: el cruce con las secciones y cuentas que respalda; <paramref name="cruceDePersona"/>:
    /// el de una persona relacionada (el documento de una persona no respalda las secciones del tercero, ADR-0010). Los dos cuentan igual: discrepancia crítica o con la ficha.
    /// </summary>
    public static EntradaDeRevision Armar(RequisitoDeExpediente requisito, LecturaDeLaVersion lectura, SoporteDeSeccionesDto? soporte, CruceDeSeccion? cruceDePersona,
        ResultadoDeAntiguedad? antiguedad, bool areaAutorizada, bool areaExigeVariasAprobaciones)
    {
        var version = requisito.VersionActual!;
        var crucePendiente = lectura.Analisis is not null && soporte is { SinAnalisis: false } && soporte.Secciones.Any(s => s.Version is not null && s.Cruce is null);
        var hallazgos = HallazgosDe(soporte, cruceDePersona);
        var discrepanciaCritica = (soporte?.DiscrepanciaCritica ?? false) || (cruceDePersona?.DiscrepanciaCritica ?? false);
        var detalle = discrepanciaCritica ? DetalleDeLaDiscrepancia(hallazgos.CriticosQueDifieren, requisito.Persona, cruceDePersona is not null) : null;
        return new EntradaDeRevision(version.DocumentoId, version.Numero, requisito.TipoCanonico, requisito.Reenvios, areaAutorizada, areaExigeVariasAprobaciones, lectura.Analisis,
            crucePendiente, discrepanciaCritica, hallazgos.ConDiscrepancias, AntiguedadDe(antiguedad, requisito), detalle);
    }

    /// <summary>La antigüedad máxima del tipo (TD-10) frente a lo que leyó la IA y la empresa recibió, para el motor; nula si el tipo no la exige.</summary>
    public static AntiguedadParaRevisar? AntiguedadDe(ResultadoDeAntiguedad? antiguedad, RequisitoDeExpediente requisito) =>
        antiguedad is null
            ? null
            : new AntiguedadParaRevisar(antiguedad.Estado, AntiguedadDelDocumento.Detalle(antiguedad), AntiguedadDelDocumento.MensajeAlTercero(antiguedad, requisito.Nombre),
                antiguedad.FechaDeclarada is not null);

    /// <summary>Qué cruces tiene el documento y qué campos difieren (críticos o no) o no se pudieron verificar (los de las secciones o cuentas que respalda y el de la persona).</summary>
    public static HallazgosDeCruce HallazgosDe(SoporteDeSeccionesDto? soporte, CruceDeSeccion? cruceDePersona)
    {
        var campos = new List<(string Etiqueta, string Resultado, bool Critico, string? Declarado, string? Extraido, string? Detalle)>();
        var hayCruce = false;
        var conDiscrepancias = false;
        foreach (var cruce in soporte?.Secciones.Select(s => s.Cruce).OfType<CruceDeSeccionDto>() ?? [])
        {
            hayCruce = true;
            conDiscrepancias |= cruce.Discrepancias > 0;
            campos.AddRange(cruce.Campos.Select(c => (c.Etiqueta, c.Resultado, c.Critico, c.Declarado, c.Extraido, c.Detalle)));
        }

        if (cruceDePersona is not null)
        {
            hayCruce = true;
            conDiscrepancias |= cruceDePersona.Discrepancias > 0;
            campos.AddRange(cruceDePersona.Campos.Select(c => (c.Etiqueta, c.Resultado.ToString(), c.Critico, c.Declarado, c.Extraido, c.Detalle)));
        }

        return new HallazgosDeCruce(hayCruce, conDiscrepancias,
            [.. campos.Where(c => c.Critico && c.Resultado == nameof(ResultadoDeCruce.Discrepa)).Select(Diferencia).DistinctBy(c => c.Etiqueta)],
            [.. campos.Where(c => c.Critico && c.Resultado == nameof(ResultadoDeCruce.NoVerificable)).Select(c => c.Etiqueta).Distinct()],
            [.. campos.Where(c => !c.Critico && c.Resultado == nameof(ResultadoDeCruce.Discrepa)).Select(Diferencia).DistinctBy(c => c.Etiqueta)]);
    }

    private static CampoQueDifiere Diferencia((string Etiqueta, string Resultado, bool Critico, string? Declarado, string? Extraido, string? Detalle) campo) =>
        new(campo.Etiqueta, campo.Declarado, campo.Extraido, campo.Detalle);

    /// <summary>
    /// El texto del motivo de la discrepancia crítica, concreto: qué campo difiere, lo declarado y lo que trae el documento («El documento no coincide con la persona declarada,
    /// JOEL ROBLES (CC 1073250322): Número de identificación (declaró 1073250322; el documento trae 52123456).»); nulo si no se sabe cuáles (queda el texto genérico del motivo).
    /// </summary>
    private static string? DetalleDeLaDiscrepancia(IReadOnlyList<CampoQueDifiere> campos, PersonaDelRequisito? persona, bool esDePersona)
    {
        if (campos.Count == 0)
            return null;
        var lista = string.Join("; ", campos.Select(c => c.Descripcion()));
        if (!esDePersona || persona is null)
            return $"El documento difiere de lo declarado en {lista}.";
        return $"El documento no coincide con la persona declarada, {persona.Nombre} ({IdentificacionLegible(persona.Identificacion)}): {lista}.";
    }

    /// <summary>
    /// La clave de la identificación de la persona del requisito (<c>CO CC 1073250322</c>: país, tipo y número) en sus partes: el tipo (<c>CC</c>) y el número (sin tipo
    /// ni país). Con menos partes, lo que haya.
    /// </summary>
    public static (string? Tipo, string Numero) PartesDeLaIdentificacion(string? clave)
    {
        var partes = (clave ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return partes.Length switch
        {
            0 => (null, string.Empty),
            1 => (null, partes[0]),
            _ => (partes[^2], partes[^1])
        };
    }

    /// <summary>«CC 1073250322»: el tipo y el número como los lee una persona (sin el país).</summary>
    public static string IdentificacionLegible(string? clave)
    {
        var (tipo, numero) = PartesDeLaIdentificacion(clave);
        return tipo is null ? numero : $"{tipo} {numero}";
    }
}
