using Marten;
using Validalo.Aplicacion.Documentos;
using Validalo.Aplicacion.Expedientes;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Revision;

namespace Validalo.Aplicacion.Revision;

/// <summary>
/// Lo que la IA concluye de cada documento del expediente para la empresa que lo mira, en <b>cualquier nivel</b> de revisión (Manual incluido): aprobar, revisar con los motivos o sin
/// análisis. No es otra regla: arma la entrada con lo mismo que lee el procesador de la revisión automática (<see cref="EntradasDeRevision"/>) y la pasa por el mismo motor
/// (<see cref="MotorDeRevision.Concluir"/>) que da la sugerencia del nivel Asistido y las excepciones del Automático. Es una sugerencia: no registra nada ni decide. El umbral de
/// confianza es el de la empresa si su nivel lo usa (Asistido o Automático, que nunca baja del plan) y el del plan de IA en Manual, donde la empresa no lo configura. Solo en la
/// vista de la empresa, nunca en la del tercero.
/// </summary>
public sealed class ConclusionesDelExpediente
{
    public const string Aprobar = "Aprobar";
    public const string Revisar = "Revisar";
    public const string SinAnalisis = "SinAnalisis";

    private readonly Dictionary<Guid, ConclusionDeRevisionDto> _porRequisito = [];

    public static readonly ConclusionesDelExpediente Vacio = new();

    public ConclusionDeRevisionDto? De(Guid requisitoId) => _porRequisito.GetValueOrDefault(requisitoId);

    /// <param name="sesionDelTenant">Sesión del tenant de la empresa (configuración, plan de IA, uso y validaciones consumidas).</param>
    /// <param name="documentos">Los documentos de la bóveda que cubren los requisitos (también los de las personas relacionadas), ya cargados.</param>
    /// <param name="cruces">Lo que la empresa ve del cruce con la ficha y de la antigüedad (<see cref="CrucesDelExpediente"/>).</param>
    public static async Task<ConclusionesDelExpediente> CargarAsync(IQuerySession sesionDelTenant, Expediente expediente, IReadOnlyDictionary<Guid, Documento> documentos,
        CrucesDelExpediente cruces, DateOnly hoy, CancellationToken ct)
    {
        var requisitos = expediente.Requisitos.Where(r => !r.NoAplica && !r.EsSeccion && !r.Eximido && r.VersionActual is not null).ToList();
        if (requisitos.Count == 0)
            return Vacio;

        var empresaId = expediente.EmpresaId;
        var mes = UsoMensualIa.MesDe(hoy);
        var plan = await sesionDelTenant.LoadAsync<PlanDeIaEmpresa>(empresaId, ct);
        var config = await sesionDelTenant.LoadAsync<RevisionAutomaticaEmpresa>(empresaId, ct) ?? RevisionAutomaticaEmpresa.PorDefecto(empresaId);
        var uso = await sesionDelTenant.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(empresaId, mes), ct) ?? UsoMensualIa.Nuevo(empresaId, mes);
        var consumidas = await AntiguedadDeVersiones.ConsumidasAsync(sesionDelTenant, empresaId, [.. requisitos.Select(r => r.VersionActual!.DocumentoId).Distinct()], ct);
        var umbralDelPlan = plan?.UmbralConfianza ?? PlanDeIaEmpresa.UmbralConfianzaInicial;
        var umbral = config.Nivel == NivelDeRevisionAutomatica.Manual ? umbralDelPlan : config.UmbralEfectivo(umbralDelPlan);
        // El motivo de la confianza baja dice de quién es el umbral: el del plan en Manual (la empresa no configura el suyo) o cuando el del plan es el que manda.
        var delPlan = config.Nivel == NivelDeRevisionAutomatica.Manual || umbralDelPlan > config.UmbralConfianza;

        var resultado = new ConclusionesDelExpediente();
        foreach (var requisito in requisitos)
        {
            var actual = requisito.VersionActual!;
            // Una versión de solo formulario no tiene archivo que la IA lea.
            if (!documentos.TryGetValue(actual.DocumentoId, out var documento) || documento.Buscar(actual.Numero) is not { Clase: ClaseDocumento.Archivo } version)
                continue;

            var lectura = EntradasDeRevision.Leer(version, consumidas.Contains((actual.DocumentoId, actual.Numero)), plan, uso, iaHabilitada: true);
            // Sin análisis: si aún puede llegar, no hay nada que concluir todavía; si la empresa no usa IA, tampoco (la revisión es a mano, como siempre); si la empresa usa IA y no le va a
            // llegar (falló o no hay cupo), la conclusión lo dice.
            if (lectura.Analisis is null && (lectura.IaPuedeLlegar || !lectura.EmpresaUsaIa))
                continue;

            var cruceDePersona = EntradasDeRevision.CruceDePersona(requisito, version, lectura);
            var soporte = cruces.DeDocumento(requisito.Id);
            var antiguedad = cruces.AntiguedadDe(requisito.Id);
            var entrada = EntradasDeRevision.Armar(requisito, lectura, soporte, cruceDePersona, antiguedad, areaAutorizada: true, areaExigeVariasAprobaciones: false);
            var conclusion = MotorDeRevision.Concluir(entrada, umbral, delPlan);
            var motivos = conclusion.Motivos.Select(m => new MotivoDeRevisionDto(m.Codigo, m.Texto)).ToList();

            if (lectura.Analisis is null)
            {
                resultado._porRequisito[requisito.Id] = new ConclusionDeRevisionDto(SinAnalisis, config.Nivel.ToString(), motivos, false, false, [], umbral, []);
                continue;
            }

            var aprueba = conclusion.Sugerencia == SugerenciaDeRevision.Aprobar;
            var hallazgos = EntradasDeRevision.HallazgosDe(soporte, cruceDePersona);
            resultado._porRequisito[requisito.Id] = new ConclusionDeRevisionDto(aprueba ? Aprobar : Revisar, config.Nivel.ToString(), motivos,
                aprueba && hallazgos.HayCruce, aprueba && antiguedad is { Estado: EstadoDeAntiguedad.Cumple }, aprueba ? hallazgos.CriticosSinVerificar : [], umbral,
                aprueba ? [.. hallazgos.NoCriticosQueDifieren.Select(d => new DiferenciaDeCruceDto(d.Etiqueta, d.Declarado, d.Extraido))] : [],
                aprueba && cruceDePersona is not null && requisito.Persona is { } persona
                    ? new PersonaVerificadaDto(persona.Nombre ?? string.Empty, EntradasDeRevision.IdentificacionLegible(persona.Identificacion))
                    : null);
        }

        return resultado;
    }
}
