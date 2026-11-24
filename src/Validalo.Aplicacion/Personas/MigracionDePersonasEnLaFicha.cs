using Marten;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Ficha;
using Validalo.Aplicacion.Interesado;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Terceros;
using Wolverine;
using Wolverine.Runtime;

namespace Validalo.Aplicacion.Personas;

/// <summary>
/// Lo que hizo la migración de las personas declaradas a mano a la ficha legal: terceros revisados y migrados, personas escritas en la ficha, relaciones que ahora son de la ficha,
/// relaciones que quedaron como estaban y terceros que fallaron por una causa técnica (si hay alguno, la migración no deja su marca y se repite en el siguiente arranque).
/// </summary>
public sealed record ResultadoDeMigracionDePersonasEnLaFicha(int TercerosRevisados, int TercerosMigrados, int PersonasEscritas, int RelacionesAdoptadas, int RelacionesSinMigrar,
    int TercerosConError)
{
    public string Resumen =>
        $"{TercerosRevisados} terceros con personas declaradas a mano revisados: {TercerosMigrados} migrados ({PersonasEscritas} personas escritas en su ficha legal y " +
        $"{RelacionesAdoptadas} relaciones ahora de la ficha), {RelacionesSinMigrar} relaciones sin migrar (la sección no admite el formato o la ficha no lee a la persona), " +
        $"{TercerosConError} terceros con error.";
}

/// <summary>Pide correr la migración de las personas declaradas a mano a la ficha legal (la publica el arranque).</summary>
public sealed record MigrarPersonasEnLaFicha;

public static class MigrarPersonasEnLaFichaHandler
{
    public static async Task Handle(MigrarPersonasEnLaFicha mensaje, ISesiones sesiones, IWolverineRuntime runtime, TimeProvider reloj, ILogger<MigrarPersonasEnLaFicha> logger,
        CancellationToken ct)
    {
        var resultado = await MigracionDePersonasEnLaFicha.EjecutarAsync(sesiones, runtime, reloj.GetUtcNow(), logger, ct);
        logger.LogInformation("Migración de las personas declaradas a mano a la ficha legal: {Resumen}", resultado.Resumen);
        if (resultado.TercerosConError > 0)
        {
            // Un fallo técnico (no un formato que la sección rechaza) no cierra la migración: sin marca, el siguiente arranque la repite, y repetirla no cambia lo ya migrado.
            logger.LogWarning("La migración de las personas a la ficha legal no deja su marca: {Terceros} terceros fallaron y se reintentan en el siguiente arranque.",
                resultado.TercerosConError);
            return;
        }

        await MigracionDePersonasEnLaFicha.MarcarEjecutadaAsync(sesiones, resultado, reloj.GetUtcNow(), ct);
    }
}

/// <summary>
/// Migración de datos, única e idempotente, de las personas declaradas a mano antes de que la ficha legal fuera el único lugar donde se registran los representantes legales,
/// suplentes y socios (decisión de Producto del 2026-11-24, ADR-0010, PR-11…PR-17). Esas relaciones vigentes (<c>DeFicha</c> en falso, de un tipo que la ficha maneja) no están en la
/// sección legal: la información legal del tercero decía «Aún no registras personas» aunque «Personas relacionadas» tuviera a su representante. Por cada tercero con alguna:
/// <list type="bullet">
/// <item>escribe a esas personas en <c>FICHA_LEGAL</c> en <b>una sola versión nueva</b> (no una por persona), con el mismo guardado de la ficha y sin tocar lo que ya figura (la ficha
/// manda: <see cref="AdopcionDePersonasEnLaFicha"/>);</item>
/// <item>concilia las relaciones con esa sección con la misma cuenta de la sincronización: las declaradas pasan a ser de la ficha (<c>DeFicha</c>) y la sincronización que la versión
/// publica después ya no encuentra nada que cambiar (no duplica eventos); si todas ya figuraban en la ficha, no hay versión y solo se adoptan las relaciones;</item>
/// <item>si la sección no admite el formato (422 de validación: un nombre demasiado largo, datos viejos que ya no pasan la regla…), <b>deja ese tercero sin migrar</b> y lo anota en
/// el registro; los demás siguen.</item>
/// </list>
/// Todo por tercero en una transacción: o quedan la versión y las relaciones, o ninguna. Repetirla no cambia nada: lo ya migrado ya no tiene relaciones pendientes. Lo que la ficha
/// no maneja (beneficiario final, miembro de consorcio) no se toca.
/// </summary>
public static class MigracionDePersonasEnLaFicha
{
    public const string Nombre = "personas-en-la-ficha-legal";

    /// <summary>
    /// Autor de la versión y actor de los eventos de la migración. El origen de la versión sigue siendo <see cref="Validalo.Dominio.Ficha.OrigenDeSeccion.Tercero"/> (son personas que el
    /// tercero declaró; el modelo no tiene un origen de migración y los otros dos significan importación); esto es lo que la marca como migración en la bitácora.
    /// </summary>
    public const string Autor = "migracion-personas-en-la-ficha";

    public static async Task<bool> YaCorrioAsync(IQuerySession consulta, CancellationToken ct) =>
        await consulta.LoadAsync<MigracionDeDatosEjecutada>(Nombre, ct) is not null;

    public static async Task MarcarEjecutadaAsync(ISesiones sesiones, ResultadoDeMigracionDePersonasEnLaFicha resultado, DateTimeOffset ahora, CancellationToken ct)
    {
        await using var sesion = sesiones.Global();
        sesion.Store(new MigracionDeDatosEjecutada { Id = Nombre, EjecutadaEn = ahora, Resumen = resultado.Resumen });
        await sesion.SaveChangesAsync(ct);
    }

    public static async Task<ResultadoDeMigracionDePersonasEnLaFicha> EjecutarAsync(ISesiones sesiones, IWolverineRuntime runtime, DateTimeOffset ahora, ILogger logger,
        CancellationToken ct)
    {
        // Los terceros con relaciones vigentes de un tipo que la ficha maneja y que la ficha todavía no mantiene.
        Dictionary<Guid, int> pendientes;
        var hoy = CalculadoraDeVigencia.Fecha(ahora);
        await using (var consulta = sesiones.ConsultaBoveda())
        {
            var candidatas = await consulta.Query<RelacionEntreTerceros>().Where(r => r.Estado == EstadoDeRelacion.Confirmada && !r.DeFicha).ToListAsync(ct);
            pendientes = candidatas.Where(r => PersonasDeLaFicha.LaFichaManeja(r.Tipo) && r.EsVigente(hoy)).GroupBy(r => r.DestinoId).ToDictionary(g => g.Key, g => g.Count());
        }

        int migrados = 0, escritas = 0, adoptadas = 0, sinMigrar = 0, conError = 0;
        foreach (var (terceroId, cuantas) in pendientes.OrderBy(p => p.Key))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                if (await MigrarTerceroAsync(terceroId, sesiones, runtime, ahora, hoy, logger, ct) is not { } resultado)
                {
                    sinMigrar += cuantas;
                    continue;
                }

                escritas += resultado.PersonasEscritas;
                adoptadas += resultado.RelacionesAdoptadas;
                sinMigrar += resultado.SinMigrar.Count;
                if (resultado.RelacionesAdoptadas > 0 || resultado.PersonasEscritas > 0)
                {
                    migrados++;
                    logger.LogInformation("Tercero {TerceroId}: {Escritas} personas escritas en la ficha legal y {Adoptadas} relaciones ahora de la ficha{Version}.", terceroId,
                        resultado.PersonasEscritas, resultado.RelacionesAdoptadas, resultado.VersionNueva ? " (versión nueva)" : string.Empty);
                }

                if (resultado.SinMigrar.Count > 0)
                    logger.LogWarning("Tercero {TerceroId}: {Cuantas} relaciones declaradas a mano quedaron sin migrar (la ficha no lee a la persona o ya no existe): {Relaciones}.",
                        terceroId, resultado.SinMigrar.Count, string.Join(", ", resultado.SinMigrar));
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                conError++;
                logger.LogError(e, "Tercero {TerceroId}: la migración de las personas a la ficha legal falló.", terceroId);
            }
        }

        return new ResultadoDeMigracionDePersonasEnLaFicha(pendientes.Count, migrados, escritas, adoptadas, sinMigrar, conError);
    }

    /// <summary>
    /// Migra a un tercero en una sola transacción (con reintentos ante carreras). Nulo si la sección legal no admite el formato (422 de validación): queda sin migrar y no cambia nada.
    /// </summary>
    private static Task<ResultadoDeAdopcion?> MigrarTerceroAsync(Guid terceroId, ISesiones sesiones, IWolverineRuntime runtime, DateTimeOffset ahora, DateOnly hoy, ILogger logger,
        CancellationToken ct) =>
        GuardadoDeSecciones.ConReintentosAsync<ResultadoDeAdopcion?>(async () =>
        {
            // Cada intento con su propio contexto de mensajería: los avisos de la versión nueva salen por el outbox de esta transacción.
            var mensajes = new MessageContext(runtime);
            await using var escritura = sesiones.Boveda(mensajes);
            escritura.SetHeader("actorTipo", ActorTipo.Migracion.ToString());
            escritura.SetHeader("actorId", Autor);
            var tercero = await escritura.LoadAsync<Tercero>(terceroId, ct);
            if (tercero is null)
                return ResultadoDeAdopcion.Nada;

            var delTercero = await escritura.Query<RelacionEntreTerceros>().Where(r => r.DestinoId == terceroId).ToListAsync(ct);
            try
            {
                var adopcion = await PersonasEnLaFicha.AdoptarAsync(escritura, sesiones, mensajes, tercero, delTercero, Autor, (ActorTipo.Migracion.ToString(), Autor), hoy, ahora, ct);
                if (adopcion.HayQueGuardar)
                    await escritura.SaveChangesAsync(ct);
                return adopcion;
            }
            catch (ReglaDeNegocioException e) when (e.Tipo == TipoFalla.Validacion)
            {
                logger.LogWarning("Tercero {TerceroId}: su sección legal no admite el formato y queda sin migrar ({Codigo}: {Mensaje}).", terceroId, e.Codigo, e.Message);
                return null;
            }
        });
}

/// <summary>
/// Al arrancar corre una sola vez la migración de las personas declaradas a mano a la ficha legal (<see cref="MigracionDePersonasEnLaFicha"/>): si no hay marca de que ya corrió, la
/// pide al bus; el manejador la ejecuta y deja la marca. Solo el nodo líder; si el esquema aún no existe (entornos sin creación automática), lo advierte y la pide en el siguiente
/// arranque. Apagable con <c>Validalo:Migraciones:PersonasEnLaFicha:Habilitada</c> en <c>false</c> (por omisión corre).
/// </summary>
public sealed class MigracionDePersonasEnLaFichaAlArrancar(IServiceProvider servicios, IConfiguration configuracion, ILogger<MigracionDePersonasEnLaFichaAlArrancar> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuracion.GetValue("Validalo:Migraciones:PersonasEnLaFicha:Habilitada", true))
            return;

        // Wolverine y la base necesitan haber arrancado: se espera un poco y, si aún no están, se reintenta unas veces.
        var espera = configuracion.GetValue("Validalo:Migraciones:PersonasEnLaFicha:Espera", TimeSpan.FromSeconds(25));
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
                        if (await MigracionDePersonasEnLaFicha.YaCorrioAsync(consulta, stoppingToken))
                            return;

                    await alcance.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new MigrarPersonasEnLaFicha());
                    logger.LogInformation("Se pidió la migración de las personas declaradas a mano a la ficha legal.");
                    return;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogWarning(e, "No se pudo pedir la migración de las personas declaradas a mano a la ficha legal (intento {Intento}).", intento);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado de la API.
        }
    }
}
