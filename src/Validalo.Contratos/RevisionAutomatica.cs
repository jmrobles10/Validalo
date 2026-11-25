namespace Validalo.Contratos;

// DTOs de la revisión automática con IA (ADR-0012): configuración por empresa, resumen por documento en el expediente y bandeja
// de excepciones. Enums como texto.

/// <summary>Una razón (código estable y texto en español) por la que el sistema no aprueba solo.</summary>
public sealed record MotivoDeRevisionDto(string Codigo, string Texto);

/// <summary>
/// Lo que la revisión automática registró de un documento para un área y la versión vigente. <see cref="Nivel"/>:
/// <c>Manual|Asistido|Automatico</c>. <see cref="Resultado"/>: <c>Sugerida|AprobadaAutomaticamente|AprobadaConMuestreo|Excepcion|SinAlcance</c>.
/// <see cref="Sugerencia"/> (solo Asistido): <c>Aprobar|Revisar</c>. <see cref="PendienteDeAtencion"/>: una persona debe decidir (excepción)
/// o confirmar (muestreo). <see cref="Resolucion"/>: <c>Confirmada|Revertida</c> si una persona ya resolvió el muestreo.
/// </summary>
public sealed record RevisionAutomaticaDto(
    Guid AreaId, string AreaCodigo, int SobreVersion, string Nivel, string Resultado, string? Sugerencia, IReadOnlyList<MotivoDeRevisionDto> Motivos,
    decimal? Confianza, DateTimeOffset Fecha, bool PendienteDeAtencion, string? Resolucion, string? ResueltaPor, DateTimeOffset? ResueltaEn,
    string? JustificacionResolucion);

/// <summary>Un campo que no es crítico y difiere entre lo declarado y lo que trae el documento: no manda el documento a una persona, se dice aparte (IA-16). Un valor nulo es «nada».</summary>
public sealed record DiferenciaDeCruceDto(string Etiqueta, string? Declarado, string? Extraido);

/// <summary>La persona declarada de un documento de persona relacionada (ADR-0010) con la que se cruzó: su nombre y su identificación como la lee una persona («CC 1073250322»).</summary>
public sealed record PersonaVerificadaDto(string Nombre, string? Identificacion);

/// <summary>
/// Lo que la IA concluye del documento que cubre un requisito, en <b>cualquier nivel</b> de revisión de la empresa (Manual incluido): la misma regla que da la sugerencia del
/// nivel Asistido (<c>MotorDeRevision.Concluir</c>), con el umbral de confianza de la empresa (en Manual, el del plan de IA). <see cref="Sugerencia"/>: <c>Aprobar</c> (la IA
/// lo verificó y no hay motivos), <c>Revisar</c> (hay <see cref="Motivos"/>) o <c>SinAnalisis</c> (la empresa usa IA y el análisis de esta versión no le llegó ni va a llegar:
/// falló o no hay cupo). <see cref="Nivel"/>: <c>Manual|Asistido|Automatico</c> de la empresa. <see cref="Umbral"/>: el umbral de confianza con el que se concluyó (el de la
/// empresa o, en Manual, el del plan). Es una sugerencia: decide una persona (salvo lo que el nivel Automático apruebe solo). Para <c>Aprobar</c>:
/// <see cref="CruzadoConLoDeclarado"/> (el documento se cruzó con lo declarado y lo crítico coincide), <see cref="AntiguedadVerificada"/> (cumple la antigüedad máxima de su
/// tipo), <see cref="SinVerificar"/> (campos críticos que el cruce no pudo verificar; el motor no los cuenta como motivo), <see cref="Diferencias"/> (campos no críticos que
/// difieren, con lo declarado y lo leído: una nota, no un motivo) y <see cref="Persona"/> (la persona declarada con la que coincide, en el documento de una persona relacionada). Nula si no hay conclusión: el análisis aún llega, la empresa no usa IA o la versión
/// no tiene archivo.
/// </summary>
public sealed record ConclusionDeRevisionDto(
    string Sugerencia, string Nivel, IReadOnlyList<MotivoDeRevisionDto> Motivos, bool CruzadoConLoDeclarado, bool AntiguedadVerificada, IReadOnlyList<string> SinVerificar,
    decimal Umbral, IReadOnlyList<DiferenciaDeCruceDto> Diferencias, PersonaVerificadaDto? Persona = null);

public sealed record UsoRevisionAutomaticaDto(string Mes, int Aprobadas, int Muestreadas, int Excepciones, int Sugerencias, int? Tope);

/// <summary>Tipo de documento que el sistema puede analizar con IA (y, por tanto, aprobar solo).</summary>
public sealed record TipoAnalizableDto(string Codigo, string Nombre);

public sealed record AreaDisponibleDto(Guid Id, string Codigo, string Nombre);

/// <summary>
/// Revisión automática de la empresa activa. <see cref="IaDisponible"/>: el plan de IA está activo y con llave (necesario para el nivel
/// Automático). <see cref="UmbralDelPlan"/>: el umbral del plan de IA, que el de la empresa nunca baja. <see cref="Configurada"/>: ya hay
/// una configuración guardada (si no, es Manual por omisión).
/// </summary>
public sealed record RevisionAutomaticaConfigDto(
    bool Configurada, string Nivel, decimal UmbralConfianza, int PorcentajeMuestreo, int? TopeMensualAprobaciones, IReadOnlyList<string> TiposAutorizados,
    IReadOnlyList<Guid> AreasAutorizadas, int EsperaIaMinutos, DateTimeOffset? ActualizadaEn, bool IaDisponible, decimal UmbralDelPlan,
    UsoRevisionAutomaticaDto Uso, IReadOnlyList<TipoAnalizableDto> TiposAnalizables, IReadOnlyList<AreaDisponibleDto> Areas);

/// <summary>
/// Reemplaza la configuración. <see cref="Nivel"/>: <c>Manual|Asistido|Automatico</c>. Lo nulo toma el valor por omisión (umbral 0,95,
/// muestreo 10 %, espera 10 min; tope nulo = sin tope). Automático exige al menos un tipo y un área.
/// </summary>
public sealed record ActualizarRevisionAutomaticaDto(
    string Nivel, decimal? UmbralConfianza = null, int? PorcentajeMuestreo = null, int? TopeMensualAprobaciones = null,
    IReadOnlyList<string>? TiposAutorizados = null, IReadOnlyList<Guid>? AreasAutorizadas = null, int? EsperaIaMinutos = null);

/// <summary>
/// Una fila de la bandeja de excepciones: un documento que el sistema no aprobó solo (<see cref="Tipo"/> <c>Excepcion</c>) o una aprobación
/// automática que una persona debe confirmar por muestreo (<c>Muestreo</c>). <see cref="Resuelta"/>: ya no espera a nadie.
/// </summary>
public sealed record ExcepcionDeRevisionDto(
    Guid ExpedienteId, string Folio, Guid VinculoId, TerceroResumenDto Tercero, string TipoVinculo, string EstadoExpediente, Guid RequisitoId,
    string Requisito, string? TipoCanonico, int Version, Guid AreaId, string AreaCodigo, string Tipo, string Resultado,
    IReadOnlyList<MotivoDeRevisionDto> Motivos, decimal? Confianza, DateTimeOffset Desde, bool Resuelta, string? Resolucion, string? ResueltaPor,
    DateTimeOffset? ResueltaEn);

/// <summary><see cref="Decision"/>: <c>Confirmar|Revertir</c>; la justificación es obligatoria al revertir.</summary>
public sealed record ResolverRevisionAutomaticaDto(Guid AreaId, string Decision, string? Justificacion = null);
