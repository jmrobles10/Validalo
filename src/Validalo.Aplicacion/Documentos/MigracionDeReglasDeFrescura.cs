using Marten;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Interesado;
using Validalo.Dominio.Documentos;
using Wolverine;
using Wolverine.Runtime;

namespace Validalo.Aplicacion.Documentos;

/// <summary>Lo que hizo la migración de las reglas de frescura: tipos revisados, reescritos con las dos reglas nuevas y ya al día.</summary>
public sealed record ResultadoDeMigracionDeFrescura(int Revisados, int Migrados)
{
    public string Resumen => $"{Revisados} tipos de documento revisados: {Migrados} reescritos con antigüedad máxima y revalidación, {Revisados - Migrados} ya estaban al día.";
}

/// <summary>Pide correr la migración de las reglas de frescura de los tipos de documento (la publica el arranque).</summary>
public sealed record MigrarReglasDeFrescura;

public static class MigrarReglasDeFrescuraHandler
{
    public static async Task Handle(MigrarReglasDeFrescura mensaje, IDocumentStore store, ISesiones sesiones, IWolverineRuntime runtime, TimeProvider reloj, CancellationToken ct)
    {
        var resultado = await MigracionDeReglasDeFrescura.EjecutarAsync(store, sesiones, runtime, ct);
        await MigracionDeReglasDeFrescura.MarcarEjecutadaAsync(sesiones, resultado, reloj.GetUtcNow(), ct);
    }
}

/// <summary>
/// Migración de datos, única e idempotente, de la regla de frescura de cada tipo de documento (TD-10). Antes un tipo tenía <b>una</b> regla
/// (<see cref="ReglaFrescura"/>) que solo calculaba la vigencia; ahora tiene dos independientes: <c>antiguedadMaximaDias</c> (condición al subir) y
/// <c>revalidarCadaDias</c> (cuenta desde la aprobación de la empresa). Cada tipo que aún trae una regla heredada se reescribe (<see cref="ReglasDeVigencia.DeHeredada"/>):
/// <list type="bullet">
/// <item><c>MaxDiasDesdeAprobacion(n)</c> ⇒ revalidar cada <c>n</c> días.</item>
/// <item><c>MaxDiasDesdeExpedicion(n)</c> ⇒ antigüedad máxima de <c>n</c> días y revalidar cada <c>n</c> días (el más fiel: su nombre decía «máximo de días desde la
/// expedición» y vencía a los <c>n</c> días de expedido).</item>
/// <item><c>PeriodoMinimo</c> y <c>Ninguna</c> no cambian.</item>
/// </list>
/// y se pide recalcular las vigencias de sus documentos, que ahora cuentan desde la aprobación de la empresa (se lee de sus expedientes). Repetirla no cambia nada: un
/// tipo ya reescrito no trae la regla heredada. Mientras no corre, un tipo no migrado se lee ya traducido (<see cref="TipoDocumentoTenant.Frescura"/>), así que nada
/// se comporta distinto.
/// </summary>
public static class MigracionDeReglasDeFrescura
{
    public const string Nombre = "reglas-de-frescura-de-los-tipos";

    public static async Task<bool> YaCorrioAsync(IQuerySession consulta, CancellationToken ct) =>
        await consulta.LoadAsync<MigracionDeDatosEjecutada>(Nombre, ct) is not null;

    public static async Task MarcarEjecutadaAsync(ISesiones sesiones, ResultadoDeMigracionDeFrescura resultado, DateTimeOffset ahora, CancellationToken ct)
    {
        await using var sesion = sesiones.Global();
        sesion.Store(new MigracionDeDatosEjecutada { Id = Nombre, EjecutadaEn = ahora, Resumen = resultado.Resumen });
        await sesion.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Reescribe los tipos con regla heredada de todos los tenants y, por cada uno, pide recalcular las vigencias de sus documentos en la misma transacción (outbox, si hay
    /// <paramref name="runtime"/>). Cada tipo va en su propia transacción <b>y con su propio contexto de mensajes</b>: un contexto de Wolverine envía una sola vez y descarta lo que se
    /// encola después de ese envío, así que compartirlo entre transacciones dejaba sin recálculo a todos los tipos menos el primero. Uno que falle no frena a los demás ni deja a medias a ninguno.
    /// </summary>
    public static async Task<ResultadoDeMigracionDeFrescura> EjecutarAsync(IDocumentStore store, ISesiones sesiones, IWolverineRuntime? runtime, CancellationToken ct)
    {
        List<(Guid TenantId, Guid Id)> pendientes;
        int revisados;
        await using (var consulta = store.QuerySession())
        {
            var tipos = await consulta.Query<TipoDocumentoTenant>().Where(t => t.AnyTenant()).ToListAsync(ct);
            revisados = tipos.Count;
            pendientes = [.. tipos.Where(t => t.TraeReglaHeredada).Select(t => (t.TenantId, t.Id))];
        }

        var migrados = 0;
        foreach (var (tenantId, id) in pendientes)
        {
            // Un contexto nuevo por transacción, con el tenant del tipo (la sesión del outbox usa el del contexto y no el pedido, TD-8).
            var mensajes = runtime is null ? null : new MessageContext(runtime) { TenantId = tenantId.ToString("N") };
            await using var sesion = sesiones.ParaTenant(tenantId, mensajes);
            if (await sesion.LoadAsync<TipoDocumentoTenant>(id, ct) is not { } tipo || !tipo.MigrarReglaHeredada())
                continue;

            sesion.Store(tipo);
            if (mensajes is not null)
                await mensajes.PublishAsync(new RecalcularVigenciasDelTipo(tenantId, id));
            await sesion.SaveChangesAsync(ct);
            migrados++;
        }

        return new ResultadoDeMigracionDeFrescura(revisados, migrados);
    }
}

/// <summary>
/// Al arrancar corre una sola vez la migración de las reglas de frescura (<see cref="MigracionDeReglasDeFrescura"/>): si no hay marca de que ya corrió, la pide al bus; el
/// manejador la ejecuta y deja la marca. Además, <b>en cada arranque y sin mirar la marca</b>, pide reparar las vigencias que aún traen la base anterior a TD-10
/// (<see cref="ReparacionDeVigenciasHeredadas"/>): si el recálculo que pidió la migración se perdió, el siguiente arranque lo repone. Solo el nodo líder; si el esquema aún no
/// existe, lo advierte y lo pide en el siguiente arranque. Apagable con <c>Validalo:Migraciones:ReglasDeFrescura:Habilitada</c> en <c>false</c> (apaga las dos cosas).
/// </summary>
public sealed class MigracionDeReglasDeFrescuraAlArrancar(IServiceProvider servicios, IConfiguration configuracion, ILogger<MigracionDeReglasDeFrescuraAlArrancar> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuracion.GetValue("Validalo:Migraciones:ReglasDeFrescura:Habilitada", true))
            return;

        // Wolverine y la base necesitan haber arrancado: se espera un poco y, si aún no están, se reintenta unas veces.
        var espera = configuracion.GetValue("Validalo:Migraciones:ReglasDeFrescura:Espera", TimeSpan.FromSeconds(20));
        try
        {
            for (var intento = 1; intento <= 6; intento++)
            {
                await Task.Delay(espera, stoppingToken);
                try
                {
                    await using var alcance = servicios.CreateAsyncScope();
                    var store = alcance.ServiceProvider.GetRequiredService<IDocumentStore>();
                    var bus = alcance.ServiceProvider.GetRequiredService<IMessageBus>();
                    await using (var consulta = store.QuerySession())
                        if (!await MigracionDeReglasDeFrescura.YaCorrioAsync(consulta, stoppingToken))
                        {
                            await bus.PublishAsync(new MigrarReglasDeFrescura());
                            logger.LogInformation("Se pidió la migración de las reglas de frescura de los tipos de documento.");
                        }

                    // Sin marca de «ya corrió»: en cada arranque se recalculan las vigencias que aún traen la base anterior a TD-10 (p. ej. si el recálculo que pidió la migración se perdió).
                    // Idempotente: lo recalculado ya no sale en el siguiente arranque.
                    await bus.PublishAsync(new RepararVigenciasHeredadas());
                    return;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogWarning(e, "No se pudo pedir la migración de las reglas de frescura (intento {Intento}).", intento);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado de la API.
        }
    }
}
