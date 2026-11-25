using Marten;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Wolverine;
using Wolverine.Runtime;

namespace Validalo.Aplicacion.Documentos;

// «Revalidar cada N días» cuenta desde que la empresa aprueba la versión para el vínculo (TD-10). La aprobación vive en el expediente (el requisito queda
// Aprobado, RequisitoDeExpediente.AprobadoEn) y la vigencia, en el stream del documento (otro tenant): se unen así, sin escribir en los dos a la vez.
//  1. El cálculo (CalcularVigenciasDelDocumento) lee la aprobación de los expedientes del vínculo (AprobacionesDeDocumentos.AprobadasAsync).
//  2. Quien cambia una aprobación (ProcesoDeValidacion) deja, en la misma transacción del expediente, una marca RecalculoDeVigenciaPendiente por documento.
//  3. Un barrido corto (ProgramadorDeRecalculosDeVigencia) la convierte en CalcularVigenciasDelDocumento por la cola durable «vigencias» y la borra,
//     todo en una transacción (outbox): ninguna aprobación se pierde y quien aprueba no necesita un bus.

/// <summary>
/// Marca, en el tenant del expediente y en la misma transacción que la decisión, que la aprobación de un documento cambió y su vigencia debe recalcularse
/// (TD-10). El id es el del documento: varias aprobaciones del mismo documento comparten una marca. La borra el barrido al pedir el cálculo.
/// </summary>
public sealed class RecalculoDeVigenciaPendiente
{
    public Guid Id { get; set; }

    /// <summary>Tenant del expediente (su identificador de sesión, <c>N</c>): con él el barrido abre la sesión desde donde se borra la marca.</summary>
    public string TenantId { get; set; } = string.Empty;

    public DateTimeOffset Desde { get; set; }
}

public static class AprobacionesDeDocumentos
{
    /// <summary>
    /// Expedientes que cuentan como «la empresa aprobó»: abiertos en revisión u observados, o aprobados. Uno rechazado, anulado o caducado no cuenta.
    /// </summary>
    private static readonly EstadoExpediente[] Vigentes = [EstadoExpediente.EnRevision, EstadoExpediente.Observado, EstadoExpediente.Aprobado];

    /// <summary>
    /// Cuándo aprobó cada empresa (por vínculo) esta versión del documento: la fecha de aprobación más reciente de un requisito de documento ya
    /// aprobado cuya versión es <paramref name="numero"/>. Un vínculo sin aprobación no aparece. Lee de todos los tenants (<c>AnyTenant</c>); el llamador ya
    /// filtró los vínculos que importan.
    /// </summary>
    public static async Task<IReadOnlyDictionary<Guid, DateTimeOffset>> AprobadasAsync(IQuerySession consulta, Guid documentoId, int numero,
        IReadOnlyCollection<Guid> vinculoIds, CancellationToken ct)
    {
        if (vinculoIds.Count == 0)
            return new Dictionary<Guid, DateTimeOffset>();

        var ids = vinculoIds.ToArray();
        var expedientes = await consulta.Query<Expediente>()
            .Where(e => e.AnyTenant() && e.VinculoId.IsOneOf(ids) && e.Estado.IsOneOf(Vigentes))
            .ToListAsync(ct);
        return DeLosExpedientes(expedientes, documentoId, numero);
    }

    /// <summary>La misma lectura sobre expedientes ya cargados (sin acceso a datos, para probarla).</summary>
    public static IReadOnlyDictionary<Guid, DateTimeOffset> DeLosExpedientes(IEnumerable<Expediente> expedientes, Guid documentoId, int numero)
    {
        var resultado = new Dictionary<Guid, DateTimeOffset>();
        foreach (var expediente in expedientes.Where(e => e.Estado is EstadoExpediente.EnRevision or EstadoExpediente.Observado or EstadoExpediente.Aprobado))
        {
            foreach (var requisito in expediente.Requisitos.Where(r => !r.EsSeccion && r.VersionActual is { } v && v.DocumentoId == documentoId && v.Numero == numero))
            {
                if (requisito.AprobadoEn is not { } aprobada)
                    continue;
                if (!resultado.TryGetValue(expediente.VinculoId, out var previa) || aprobada > previa)
                    resultado[expediente.VinculoId] = aprobada;
            }
        }

        return resultado;
    }

    /// <summary>
    /// Deja la marca de recálculo de los documentos cuya aprobación cambió con un movimiento del expediente (<see cref="Expediente.DocumentosConAprobacionCambiada"/>),
    /// en la sesión del expediente y antes de guardar: la marca y la decisión se confirman juntas. Sin documentos no escribe nada.
    /// </summary>
    public static void MarcarRecalculos(IDocumentSession sesion, IEnumerable<Guid> documentoIds, DateTimeOffset ahora)
    {
        foreach (var documentoId in documentoIds)
            sesion.Store(new RecalculoDeVigenciaPendiente { Id = documentoId, TenantId = sesion.TenantId, Desde = ahora });
    }
}

/// <summary>Convierte las marcas de recálculo pendientes en cálculos de vigencia de sus documentos (cola durable «vigencias») y las borra.</summary>
public sealed record RevisarRecalculosDeVigencia(int Maximo = 200);

public static class RevisarRecalculosDeVigenciaHandler
{
    /// <summary>
    /// Por cada tenant con marcas, borra las marcas y publica un <see cref="CalcularVigenciasDelDocumento"/> por documento (uno solo aunque estuviera marcado en
    /// varios tenants) en la misma transacción (outbox). El cálculo vuelve a leer las aprobaciones al correr, así que una aprobación que llegue entre
    /// el barrido y el cálculo también se cuenta, y una posterior deja una marca nueva. Devuelve cuántos documentos pidió.
    /// </summary>
    public static Task Handle(RevisarRecalculosDeVigencia mensaje, IDocumentStore store, ISesiones sesiones, IWolverineRuntime runtime, CancellationToken ct) =>
        RevisarAsync(mensaje, store, sesiones, runtime, ct);

    /// <summary>El barrido; devuelve cuántos documentos pidió recalcular (el manejador no devuelve nada: Wolverine trataría el valor como un mensaje).</summary>
    public static async Task<int> RevisarAsync(RevisarRecalculosDeVigencia mensaje, IDocumentStore store, ISesiones sesiones, IWolverineRuntime runtime, CancellationToken ct)
    {
        List<RecalculoDeVigenciaPendiente> pendientes;
        await using (var consulta = store.QuerySession())
            pendientes = [.. await consulta.Query<RecalculoDeVigenciaPendiente>().Where(r => r.AnyTenant()).OrderBy(r => r.Desde).Take(Math.Clamp(mensaje.Maximo, 1, 1000)).ToListAsync(ct)];
        if (pendientes.Count == 0)
            return 0;

        var pedidos = new HashSet<Guid>();
        foreach (var delTenant in pendientes.GroupBy(p => p.TenantId))
        {
            if (!Guid.TryParseExact(delTenant.Key, "N", out var tenantId))
                continue;
            // Un contexto de mensajes nuevo por transacción, con el tenant del expediente (la sesión del outbox usa el del contexto y no el pedido, TD-8). Un contexto envía una
            // sola vez y descarta lo que se encola después: compartido entre tenants, solo el primero pediría su cálculo y los demás perderían la marca sin que se recalcule nada.
            var mensajes = new MessageContext(runtime) { TenantId = delTenant.Key };
            await using var sesion = sesiones.ParaTenant(tenantId, mensajes);
            foreach (var marca in delTenant)
            {
                sesion.Delete<RecalculoDeVigenciaPendiente>(marca.Id);
                if (pedidos.Add(marca.Id))
                    await mensajes.PublishAsync(new CalcularVigenciasDelDocumento(marca.Id));
            }

            await sesion.SaveChangesAsync(ct);
        }

        return pedidos.Count;
    }
}

/// <summary>
/// Dispara el barrido de recálculos de vigencia cada <c>Validalo:VigenciasDeDocumentos:SegundosProceso</c> (15 por omisión; 0 lo apaga). Con varias
/// réplicas solo corre en el líder; el barrido es idempotente.
/// </summary>
public sealed class ProgramadorDeRecalculosDeVigencia(IServiceProvider servicios, IConfiguration configuracion,
    ILogger<ProgramadorDeRecalculosDeVigencia> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var segundos = Math.Clamp(configuracion.GetValue("Validalo:VigenciasDeDocumentos:SegundosProceso", 15), 0, 3600);
        if (segundos == 0)
            return;

        try
        {
            using var temporizador = new PeriodicTimer(TimeSpan.FromSeconds(segundos));
            while (await temporizador.WaitForNextTickAsync(stoppingToken))
            {
                try
                {
                    await using var alcance = servicios.CreateAsyncScope();
                    await alcance.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new RevisarRecalculosDeVigencia());
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogWarning(e, "No se pudo pedir el barrido de recálculos de vigencia; se reintenta en {Segundos} s.", segundos);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado de la API.
        }
    }
}
