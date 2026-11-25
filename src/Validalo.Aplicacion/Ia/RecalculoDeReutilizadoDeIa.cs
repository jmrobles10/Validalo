using System.Text.Json;
using Marten;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Interesado;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Plataforma;
using Wolverine;

namespace Validalo.Aplicacion.Ia;

/// <summary>
/// Lo que hizo el recálculo del costo reutilizado: validaciones reutilizadas revisadas, las que quedaron con el costo del análisis original atribuido, las que no tenían análisis
/// registrado (quedan con costo cero), los usos mensuales que cambiaron y los grupos (empresa y mes) que fallaron por un error técnico (si hay alguno, la pasada no deja su marca y se
/// repite en el siguiente arranque).
/// </summary>
public sealed record ResultadoDeRecalculoDeReutilizado(int Validaciones, int Atribuidas, int SinAnalisis, int UsosActualizados, int ConError)
{
    public string Resumen =>
        $"{Validaciones} validaciones reutilizadas revisadas: {Atribuidas} con el costo del análisis original atribuido ahora, {SinAnalisis} sin análisis registrado (quedan con costo cero), " +
        $"{UsosActualizados} usos mensuales puestos al día, {ConError} con error.";
}

/// <summary>Pide correr el recálculo del costo reutilizado del histórico (lo publica el arranque).</summary>
public sealed record RecalcularReutilizadoDeIa;

public static class RecalcularReutilizadoDeIaHandler
{
    public static async Task Handle(RecalcularReutilizadoDeIa mensaje, ISesiones sesiones, TimeProvider reloj, ILogger<RecalcularReutilizadoDeIa> logger, CancellationToken ct)
    {
        var resultado = await RecalculoDeReutilizadoDeIa.EjecutarAsync(sesiones, logger, ct);
        logger.LogInformation("Recálculo del costo reutilizado de IA: {Resumen}", resultado.Resumen);
        if (resultado.ConError > 0)
        {
            // Un fallo técnico no cierra la pasada: sin marca, el siguiente arranque la repite, y repetirla no cambia lo ya atribuido.
            logger.LogWarning("El recálculo del costo reutilizado de IA no deja su marca: {Grupos} grupos fallaron y se reintentan en el siguiente arranque.", resultado.ConError);
            return;
        }

        await RecalculoDeReutilizadoDeIa.MarcarEjecutadaAsync(sesiones, resultado, reloj.GetUtcNow(), ct);
    }
}

/// <summary>
/// Pasada de datos, única e idempotente, del costo atribuido a las validaciones reutilizadas (IA-15, 2026-11-25). Desde IA-15 cada validación que una empresa consume con un análisis que
/// pagó otra guarda el costo y los tokens de ese análisis y los suma a su uso mensual y diario en campos aparte de los reales. Esto recorre lo que <b>ya estaba registrado</b>: de cada
/// validación reutilizada sin costo atribuido (la que no pagó la llamada) busca el costo del análisis original en el evento de la bóveda y lo atribuye; después rehace los acumulados
/// reutilizados de cada empresa y mes desde las validaciones que los componen (<see cref="UsoMensualIa.ReconstruirReutilizado"/>), sin tocar lo real. Una validación cuyo análisis ya no está
/// (suprimido por habeas data, por ejemplo) cuenta como reutilizada con costo cero: el histórico de esas queda solo con lo que sí se puede probar. Repetirla no cambia nada.
/// </summary>
public static class RecalculoDeReutilizadoDeIa
{
    public const string Nombre = "ia-costo-reutilizado";

    public static async Task<bool> YaCorrioAsync(IQuerySession consulta, CancellationToken ct) =>
        await consulta.LoadAsync<MigracionDeDatosEjecutada>(Nombre, ct) is not null;

    public static async Task MarcarEjecutadaAsync(ISesiones sesiones, ResultadoDeRecalculoDeReutilizado resultado, DateTimeOffset ahora, CancellationToken ct)
    {
        await using var sesion = sesiones.Global();
        sesion.Store(new MigracionDeDatosEjecutada { Id = Nombre, EjecutadaEn = ahora, Resumen = resultado.Resumen });
        await sesion.SaveChangesAsync(ct);
    }

    public static async Task<ResultadoDeRecalculoDeReutilizado> EjecutarAsync(ISesiones sesiones, ILogger logger, CancellationToken ct)
    {
        List<Tenant> tenants;
        await using (var global = sesiones.ConsultaGlobal())
            tenants = [.. await global.Query<Tenant>().ToListAsync(ct)];

        var costos = new Dictionary<(Guid DocumentoId, int Numero), CostoDeAnalisis?>(); // un análisis se lee una sola vez
        int validaciones = 0, atribuidas = 0, sinAnalisis = 0, usos = 0, conError = 0;
        foreach (var tenant in tenants)
        {
            List<(Guid EmpresaId, string Mes)> grupos;
            await using (var lectura = sesiones.ParaTenant(tenant.Id))
            {
                grupos =
                [
                    .. (await lectura.Query<ValidacionIaConsumida>().Where(v => !v.PagoLaLlamada).ToListAsync(ct))
                    .Select(v => (v.EmpresaId, v.Mes))
                    .Distinct()
                ];
            }

            foreach (var (empresaId, mes) in grupos)
            {
                try
                {
                    var resultado = await Peticiones.ConReintentosAsync(() => RecalcularGrupoAsync(sesiones, tenant, empresaId, mes, costos, ct));
                    validaciones += resultado.Validaciones;
                    atribuidas += resultado.Atribuidas;
                    sinAnalisis += resultado.SinAnalisis;
                    usos += resultado.Usos;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    conError++;
                    logger.LogError(e, "No se pudo recalcular el costo reutilizado de IA de la empresa {EmpresaId} en {Mes}.", empresaId, mes);
                }
            }
        }

        return new ResultadoDeRecalculoDeReutilizado(validaciones, atribuidas, sinAnalisis, usos, conError);
    }

    /// <summary>Atribuye el costo que falte a las validaciones reutilizadas de la empresa en el mes y rehace sus acumulados reutilizados.</summary>
    private static async Task<(int Validaciones, int Atribuidas, int SinAnalisis, int Usos)> RecalcularGrupoAsync(ISesiones sesiones, Tenant tenant, Guid empresaId, string mes,
        Dictionary<(Guid DocumentoId, int Numero), CostoDeAnalisis?> costos, CancellationToken ct)
    {
        await using var sesion = sesiones.ParaTenant(tenant.Id);
        var reutilizadas = await sesion.Query<ValidacionIaConsumida>().Where(v => v.EmpresaId == empresaId && v.Mes == mes && !v.PagoLaLlamada).ToListAsync(ct);

        int atribuidas = 0, sinAnalisis = 0;
        foreach (var validacion in reutilizadas.Where(v => !v.CostoAtribuido))
        {
            if (!costos.TryGetValue((validacion.DocumentoId, validacion.Numero), out var costo))
            {
                await using var consulta = sesiones.ConsultaBoveda();
                costos[(validacion.DocumentoId, validacion.Numero)] = costo =
                    CostoDeAnalisisRegistrado.De(await consulta.Events.FetchStreamAsync(validacion.DocumentoId, token: ct), validacion.Numero);
            }

            if (costo is null)
            {
                sinAnalisis++;
                continue;
            }

            validacion.Atribuir(costo);
            sesion.Store(validacion);
            atribuidas++;
        }

        var uso = await sesion.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(empresaId, mes), ct) ?? UsoMensualIa.Nuevo(empresaId, mes);
        var antes = JsonSerializer.Serialize(uso);
        uso.ReconstruirReutilizado(reutilizadas.Select(v => (CalendarioDeIa.Dia(v.Fecha, tenant.ZonaHoraria), v.Atribuido)));
        var cambio = JsonSerializer.Serialize(uso) != antes;
        if (cambio)
            sesion.Store(uso);

        await sesion.SaveChangesAsync(ct);
        return (reutilizadas.Count, atribuidas, sinAnalisis, cambio ? 1 : 0);
    }
}

/// <summary>
/// Al arrancar corre una sola vez el recálculo del costo reutilizado del histórico (<see cref="RecalculoDeReutilizadoDeIa"/>): si no hay marca de que ya corrió, lo pide al bus; el
/// manejador lo ejecuta y deja la marca. Solo el nodo líder; si el esquema aún no existe (entornos sin creación automática), lo advierte y lo pide en el siguiente arranque. Apagable con
/// <c>Validalo:Migraciones:ReutilizadoIa:Habilitada</c> en <c>false</c> (encendida por omisión).
/// </summary>
public sealed class RecalculoDeReutilizadoDeIaAlArrancar(IServiceProvider servicios, IConfiguration configuracion, ILogger<RecalculoDeReutilizadoDeIaAlArrancar> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuracion.GetValue("Validalo:Migraciones:ReutilizadoIa:Habilitada", true))
            return;

        // Wolverine y la base necesitan haber arrancado: se espera un poco y, si aún no están, se reintenta unas veces.
        var espera = configuracion.GetValue("Validalo:Migraciones:ReutilizadoIa:Espera", TimeSpan.FromSeconds(35));
        try
        {
            for (var intento = 1; intento <= 6; intento++)
            {
                await Task.Delay(espera, stoppingToken);
                try
                {
                    await using var alcance = servicios.CreateAsyncScope();
                    var store = alcance.ServiceProvider.GetRequiredService<IDocumentStore>();
                    await using (var consulta = store.QuerySession())
                        if (await RecalculoDeReutilizadoDeIa.YaCorrioAsync(consulta, stoppingToken))
                            return;

                    await alcance.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new RecalcularReutilizadoDeIa());
                    logger.LogInformation("Se pidió el recálculo del costo reutilizado de IA.");
                    return;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogWarning(e, "No se pudo pedir el recálculo del costo reutilizado de IA (intento {Intento}).", intento);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado de la API.
        }
    }
}
