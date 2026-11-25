using Validalo.Dominio.Identificaciones;

namespace Validalo.Dominio.Documentos;

/// <summary>Archivo binario o datos estructurados con esquema (docs/03 §3.1).</summary>
public enum ClaseDocumento
{
    Archivo,
    Formulario
}

/// <summary><c>Global</c>: bóveda del tercero, compartido. <c>PorVinculo</c>: privado de una relación (docs/03 §3.1).</summary>
public enum AmbitoDocumento
{
    Global,
    PorVinculo
}

/// <summary>Naturaleza del dato (informativo para UI y retención, docs/02 §4.2).</summary>
public enum Sensibilidad
{
    Ninguna,
    Identidad,
    Financiera,
    Personal
}

public enum TipoReglaFrescura
{
    Ninguna,
    MaxDiasDesdeExpedicion,
    PeriodoMinimo,
    MaxDiasDesdeAprobacion
}

/// <summary>
/// Regla de frescura heredada de un tipo de documento (docs/02 §4.3): una sola por tipo. Desde TD-10 las reglas son dos independientes
/// (<see cref="ReglasDeVigencia"/>: antigüedad máxima al subir y revalidar cada N días); aquí solo vive <c>PeriodoMinimo</c> y las otras se aceptan por
/// compatibilidad con la API y se traducen (<see cref="ReglasDeVigencia.DeHeredada"/>).
/// </summary>
public sealed record ReglaFrescura(TipoReglaFrescura Tipo, int? Dias = null, string? Regla = null)
{
    public static readonly ReglaFrescura Ninguna = new(TipoReglaFrescura.Ninguna);

    public static ReglaFrescura DiasDesdeExpedicion(int dias) => new(TipoReglaFrescura.MaxDiasDesdeExpedicion, dias);

    public static ReglaFrescura DiasDesdeAprobacion(int dias) => new(TipoReglaFrescura.MaxDiasDesdeAprobacion, dias);

    public static ReglaFrescura Periodo(string regla) => new(TipoReglaFrescura.PeriodoMinimo, null, regla);
}

/// <summary>
/// Tipo de documento canónico de la plataforma (docs/02 §4.2): define la naturaleza del documento y lo hace compartible
/// entre tenants ("RUT" en A y "Registro Único Tributario" en B son el mismo documento). Vive en código y no lo editan los
/// tenants; la semilla es el Anexo A de docs/03.
/// </summary>
public sealed record TipoDocumentoCanonico(
    string Codigo,
    string Nombre,
    ClaseDocumento Clase,
    AmbitoDocumento Ambito,
    Sensibilidad Sensibilidad,
    AplicaA AplicaA,
    bool TieneVencimientoIntrinseco,
    bool TieneFechaExpedicion,
    bool EsPeriodico,
    string? Periodicidad,
    bool PermiteRatificacion,
    bool DePersonaRelacionada,
    IReadOnlyList<string> CamposClave,
    IReadOnlyList<string> CamposCriticos,
    ReglasDeVigencia? FrescuraSugerida,
    int Version = 1,
    int RetencionAniosSugerida = 10,
    IReadOnlyList<string>? FormatosPermitidos = null,
    int? TamanoMaximoMb = null,
    int? PaginasMaximas = null,
    IReadOnlyList<string>? Paises = null,
    string? EquivalenteA = null)
{
    /// <summary>La regla heredada sugerida: solo el periodo (<c>PeriodoMinimo</c>); las sugerencias de TD-10 están en <see cref="FrescuraSugerida"/>.</summary>
    public ReglaFrescura? ReglaFrescuraSugerida => FrescuraSugerida?.Periodo is { } periodo ? ReglaFrescura.Periodo(periodo) : null;

    /// <summary>
    /// ¿El tipo aplica a un tercero de ese país (ISO 3166-1 alfa-2)? Sin <see cref="Paises"/> aplica a todos; con lista, solo a esos países
    /// (RG-5): el RUT y la Cámara de comercio son de Colombia y sus equivalentes, de Panamá y República Dominicana.
    /// </summary>
    public bool AplicaAlPais(string? pais) =>
        Paises is null || Paises.Contains((pais ?? string.Empty).Trim().ToUpperInvariant(), StringComparer.Ordinal);

    /// <summary>
    /// Un canónico global de clase <c>Formulario</c> aún no tiene esquema canónico: responde 422 <c>clase-no-soportada</c>.
    /// Un tipo del tenant puede pedirlo como formulario propio restringido a <c>PorVinculo</c> (TD-4).
    /// </summary>
    public bool CargaSoportada => Clase == ClaseDocumento.Archivo;

    /// <summary>Formatos (MIME) que admite el canónico; vacío ⇒ todos los de la lista blanca (TD-1).</summary>
    public IReadOnlyList<string> Formatos => FormatosPermitidos ?? [];
}

/// <summary>Catálogo canónico (Anexo A de docs/03, fuente única de códigos). Los códigos retirados no existen aquí.</summary>
public static class CatalogoCanonico
{
    /// <summary>Certificación bancaria: es de <b>una cuenta</b> del tercero (documento propio de la cuenta, <see cref="Documento.CuentaBancariaId"/>) además del documento general sin cuenta de antes.</summary>
    public const string CertificacionBancaria = "CERTIFICACION_BANCARIA";

    /// <summary>Solo PDF: documentos que se expiden o descargan como PDF (RUT, Cámara, estados financieros, renta). Va antes de <see cref="Tipos"/>: los estáticos se inicializan en orden.</summary>
    private static readonly string[] SoloPdf = [InspectorDeArchivos.Pdf];

    private static readonly IReadOnlyList<TipoDocumentoCanonico> Tipos =
    [
        Archivo("RUT", "Registro Único Tributario", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Ambas,
            vencimiento: false, expedicion: true, ratificable: true, persona: false,
            ["nit", "razonSocial", "actividadCiiuPrincipal", "responsabilidades", "direccion", "representanteLegal"],
            ["nit", "razonSocial", "representanteLegal"], ReglasDeVigencia.SoloRevalidacion(365), formatos: SoloPdf, paises: ["CO"]),
        Archivo("CAMARA_COMERCIO", "Certificado de existencia y representación legal", AmbitoDocumento.Global, Sensibilidad.Identidad,
            AplicaA.Juridica, vencimiento: false, expedicion: true, ratificable: false, persona: false,
            ["nit", "razonSocial", "matricula", "representanteLegal", "suplentes", "objeto", "capital", "estadoMatricula", "fechaExpedicion"],
            ["representanteLegal", "razonSocial", "estadoMatricula"], ReglasDeVigencia.Ambas(30, 365), formatos: SoloPdf, paises: ["CO"]),
        // Equivalentes por país del RUT y de la Cámara de comercio (RG-5). Son soportes de la ficha que el tercero adjunta y la empresa revisa
        // a mano: no tienen lectura de IA, cruce con la ficha ni consulta a fuentes oficiales, que son solo de Colombia (RG-6).
        Archivo("CERTIFICADO_RUC", "Certificado de RUC (DGI)", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Ambas,
            vencimiento: false, expedicion: true, ratificable: true, persona: false,
            ["ruc", "dv", "razonSocial", "estado", "actividadEconomica", "direccion"], ["ruc", "razonSocial"], ReglasDeVigencia.SoloRevalidacion(365),
            formatos: SoloPdf, paises: ["PA"], equivalente: "RUT"),
        Archivo("REGISTRO_PUBLICO", "Certificado del Registro Público de Panamá", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Juridica,
            vencimiento: false, expedicion: true, ratificable: false, persona: false,
            ["razonSocial", "folio", "estado", "representantes", "fechaExpedicion"], ["razonSocial", "estado", "representantes"],
            ReglasDeVigencia.Ambas(30, 365), formatos: SoloPdf, paises: ["PA"], equivalente: "CAMARA_COMERCIO"),
        Archivo("CONSTANCIA_RNC", "Constancia de RNC (DGII)", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Ambas,
            vencimiento: false, expedicion: true, ratificable: true, persona: false,
            ["rnc", "razonSocial", "estado", "actividadEconomica", "regimen"], ["rnc", "razonSocial"], ReglasDeVigencia.SoloRevalidacion(365),
            formatos: SoloPdf, paises: ["DO"], equivalente: "RUT"),
        Archivo("REGISTRO_MERCANTIL", "Certificado de registro mercantil", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Juridica,
            vencimiento: false, expedicion: true, ratificable: false, persona: false,
            ["razonSocial", "matricula", "estado", "representantes", "fechaExpedicion"], ["razonSocial", "estado", "representantes"],
            ReglasDeVigencia.Ambas(30, 365), formatos: SoloPdf, paises: ["DO"], equivalente: "CAMARA_COMERCIO"),
        Archivo("CEDULA", "Cédula de ciudadanía", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Natural,
            vencimiento: false, expedicion: true, ratificable: true, persona: true,
            ["numero", "nombres", "fechaExpedicion"], ["numero", "nombres"], ReglasDeVigencia.Ninguna),
        Archivo("PASAPORTE", "Pasaporte", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Natural,
            vencimiento: true, expedicion: true, ratificable: false, persona: true,
            ["numero", "nombres", "pais", "vencimiento"], ["numero"], null),
        Archivo("CERTIFICADO_ANTECEDENTES", "Certificado de antecedentes", AmbitoDocumento.Global, Sensibilidad.Personal, AplicaA.Natural,
            vencimiento: false, expedicion: true, ratificable: false, persona: true,
            ["numero", "nombre", "resultado", "fecha", "entidad"], ["resultado"], ReglasDeVigencia.Ambas(30, 365)),
        Archivo("ESTADOS_FINANCIEROS", "Estados financieros", AmbitoDocumento.Global, Sensibilidad.Financiera, AplicaA.Ambas,
            vencimiento: false, expedicion: false, ratificable: false, persona: false,
            ["periodo", "activos", "pasivos", "patrimonio", "ingresos", "firmaContador"], ["periodo"],
            ReglasDeVigencia.DePeriodo("ultimo-anio-fiscal-cerrado"), periodicidad: "Anual", formatos: SoloPdf),
        Archivo("DECLARACION_RENTA", "Declaración de renta", AmbitoDocumento.Global, Sensibilidad.Financiera, AplicaA.Ambas,
            vencimiento: false, expedicion: false, ratificable: false, persona: false,
            ["anioGravable", "nit", "formulario"], ["anioGravable"], ReglasDeVigencia.DePeriodo("ultimo-anio-gravable"), periodicidad: "Anual", formatos: SoloPdf),
        Archivo("CERTIFICACION_BANCARIA", "Certificación bancaria", AmbitoDocumento.Global, Sensibilidad.Financiera, AplicaA.Ambas,
            vencimiento: false, expedicion: true, ratificable: false, persona: false,
            ["banco", "tipo", "numero", "titular", "identificacionTitular", "fecha"], ["numero", "titular"],
            ReglasDeVigencia.Ambas(30, 365)),
        Formulario("CUENTA_BANCARIA", "Cuenta bancaria", AmbitoDocumento.Global, Sensibilidad.Financiera, ratificable: true, persona: false,
            ["banco", "tipo", "numero", "titular", "identificacionTitular", "moneda"], ["numero", "titular"], ReglasDeVigencia.Ninguna),
        Formulario("DATOS_MAESTROS", "Datos maestros", AmbitoDocumento.Global, Sensibilidad.Identidad, ratificable: true, persona: false,
            ["razonSocial", "nombreComercial", "direccion", "ciudad", "telefono", "correo", "representantes"],
            ["razonSocial", "representantes"], ReglasDeVigencia.Ninguna),
        Formulario("INFO_TRIBUTARIA", "Información tributaria", AmbitoDocumento.Global, Sensibilidad.Financiera, ratificable: true,
            persona: false, ["regimen", "responsabilidades", "retenciones", "granContribuyente"], ["regimen"],
            ReglasDeVigencia.SoloRevalidacion(365)),
        Formulario("INFO_LEGAL", "Información legal", AmbitoDocumento.Global, Sensibilidad.Identidad, ratificable: true, persona: false,
            ["tipoSocietario", "representantes", "socios", "revisorFiscal"], ["representantes"], ReglasDeVigencia.SoloRevalidacion(365)),
        Formulario("BENEFICIARIO_FINAL", "Beneficiario final", AmbitoDocumento.Global, Sensibilidad.Personal, ratificable: true, persona: true,
            ["identificacion", "porcentaje", "cadenaDeControl"], ["identificacion", "porcentaje"], ReglasDeVigencia.SoloRevalidacion(365)),
        Archivo("SG_SST", "Evaluación SG-SST", AmbitoDocumento.Global, Sensibilidad.Identidad, AplicaA.Ambas,
            vencimiento: true, expedicion: true, ratificable: false, persona: false, ["empresa", "puntaje", "fecha"], ["puntaje"], null),
        Archivo("HOJA_DE_VIDA", "Hoja de vida", AmbitoDocumento.Global, Sensibilidad.Personal, AplicaA.Natural,
            vencimiento: false, expedicion: false, ratificable: true, persona: false, ["nombre", "identificacion"], [], ReglasDeVigencia.Ninguna),
        Archivo("TITULO_ACADEMICO", "Título académico", AmbitoDocumento.Global, Sensibilidad.Personal, AplicaA.Natural,
            vencimiento: false, expedicion: true, ratificable: true, persona: false, ["institucion", "titulo", "fecha"], ["titulo"],
            ReglasDeVigencia.Ninguna),
        Archivo("POLIZA", "Póliza", AmbitoDocumento.PorVinculo, Sensibilidad.Financiera, AplicaA.Ambas,
            vencimiento: true, expedicion: true, ratificable: false, persona: false,
            ["aseguradora", "numero", "tomador", "beneficiario", "amparos", "vigenciaDesde", "vigenciaHasta", "valor"],
            ["beneficiario", "vigencia", "amparos"], null),
        Formulario("AUTORIZACION_TRATAMIENTO_DATOS", "Autorización de tratamiento de datos", AmbitoDocumento.PorVinculo, Sensibilidad.Personal,
            ratificable: true, persona: false, ["firmante", "fecha", "versionTexto", "empresaDestinataria"], ["firmante"], ReglasDeVigencia.Ninguna),
        Formulario("TERMINOS_Y_CONDICIONES", "Términos y condiciones", AmbitoDocumento.PorVinculo, Sensibilidad.Ninguna, ratificable: true,
            persona: false, ["versionAceptada"], ["version"], ReglasDeVigencia.Ninguna),
        Formulario("FORMULARIO_SARLAFT", "Formulario SARLAFT", AmbitoDocumento.PorVinculo, Sensibilidad.Personal, ratificable: false,
            persona: false, ["origenDeFondos", "beneficiarioFinal", "pep"], ["beneficiarioFinal", "pep"],
            ReglasDeVigencia.SoloRevalidacion(365)),
        Archivo("AFILIACION_SEGURIDAD_SOCIAL", "Afiliación a seguridad social", AmbitoDocumento.PorVinculo, Sensibilidad.Personal,
            AplicaA.Ambas, vencimiento: true, expedicion: false, ratificable: false, persona: false, ["periodo", "eps", "afp", "arl", "estado"],
            ["estado"], ReglasDeVigencia.DePeriodo("mes-en-curso"), periodicidad: "Mensual"),
        Archivo("PAZ_Y_SALVO", "Paz y salvo", AmbitoDocumento.PorVinculo, Sensibilidad.Ninguna, AplicaA.Ambas,
            vencimiento: false, expedicion: true, ratificable: false, persona: false, ["emisor", "fecha", "concepto"], [],
            ReglasDeVigencia.Ambas(30, 365)),
        // Soporte ad hoc de una sección de la ficha maestra (FM-5): el tercero lo sube por la carga de siempre y lo refiere
        // desde la versión de la sección. Global (es del tercero) y sin campos clave: no se pide en flujos.
        Archivo("SOPORTE_FICHA", "Soporte de la ficha", AmbitoDocumento.Global, Sensibilidad.Personal, AplicaA.Ambas,
            vencimiento: false, expedicion: false, ratificable: false, persona: false, [], [], ReglasDeVigencia.Ninguna),
        Archivo("FORMATO_VINCULACION", "Formato de vinculación", AmbitoDocumento.PorVinculo, Sensibilidad.Ninguna, AplicaA.Ambas,
            vencimiento: false, expedicion: false, ratificable: false, persona: false, ["versionPlantilla", "firma"], ["versionPlantilla"],
            ReglasDeVigencia.Ninguna)
    ];

    private static readonly Dictionary<string, TipoDocumentoCanonico> PorCodigo = Tipos.ToDictionary(t => t.Codigo, StringComparer.OrdinalIgnoreCase);

    /// <summary>Tipos canónicos de clase <c>Archivo</c> que se siembran en cada tenant nuevo (sin exigencias).</summary>
    public static readonly IReadOnlyList<string> SemillaDeTenant =
        ["RUT", "CAMARA_COMERCIO", "CEDULA", "ESTADOS_FINANCIEROS", "CERTIFICACION_BANCARIA", "POLIZA"];

    public static IReadOnlyList<TipoDocumentoCanonico> Todos => Tipos;

    public static TipoDocumentoCanonico? Buscar(string? codigo) =>
        codigo is not null && PorCodigo.TryGetValue(codigo.Trim(), out var tipo) ? tipo : null;

    public static TipoDocumentoCanonico Requerido(string? codigo) =>
        Buscar(codigo) ?? throw Comun.ReglaDeNegocioException.Validacion("tipo-documento-invalido",
            $"'{codigo}' no es un tipo de documento canónico.");

    private static TipoDocumentoCanonico Archivo(string codigo, string nombre, AmbitoDocumento ambito, Sensibilidad sensibilidad, AplicaA aplicaA,
        bool vencimiento, bool expedicion, bool ratificable, bool persona, string[] clave, string[] criticos, ReglasDeVigencia? frescura,
        string? periodicidad = null, string[]? formatos = null, string[]? paises = null, string? equivalente = null) =>
        new(codigo, nombre, ClaseDocumento.Archivo, ambito, sensibilidad, aplicaA, vencimiento, expedicion, periodicidad is not null,
            periodicidad, ratificable, persona, clave, criticos, frescura, FormatosPermitidos: formatos, Paises: paises, EquivalenteA: equivalente);

    private static TipoDocumentoCanonico Formulario(string codigo, string nombre, AmbitoDocumento ambito, Sensibilidad sensibilidad,
        bool ratificable, bool persona, string[] clave, string[] criticos, ReglasDeVigencia? frescura) =>
        new(codigo, nombre, ClaseDocumento.Formulario, ambito, sensibilidad, AplicaA.Ambas, false, false, false, null, ratificable, persona,
            clave, criticos, frescura);
}
