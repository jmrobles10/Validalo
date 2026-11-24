using Marten;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Interesado;
using Validalo.Dominio.Documentos;
using Wolverine;

namespace Validalo.Aplicacion.Vinculos;

/// <summary>
/// Lo que hizo la pasada que liga por número las certificaciones bancarias generales ya leídas: revisadas, ligadas a su cuenta, sin ligar y con error técnico (si hay alguna con error,
/// la pasada no deja su marca y se repite en el siguiente arranque).
/// </summary>
public sealed record ResultadoDeLigaPorNumero(int Revisadas, int Ligadas, int SinLigar, int ConError)
{
    public string Resumen =>
        $"{Revisadas} certificaciones bancarias sin cuenta ya leídas revisadas: {Ligadas} ligadas a su cuenta por el número, {SinLigar} sin ligar (sin coincidencia, ambigua o la cuenta " +
        $"ya tiene la suya), {ConError} con error.";
}

/// <summary>Pide correr la pasada que liga por número las certificaciones generales ya leídas (la publica el arranque).</summary>
public sealed record MigrarCertificacionesPorNumero;

public static class MigrarCertificacionesPorNumeroHandler
{
    public static async Task Handle(MigrarCertificacionesPorNumero mensaje, ISesiones sesiones, IProtectorDeSecretos protector, TimeProvider reloj,
        ILogger<MigrarCertificacionesPorNumero> logger, CancellationToken ct)
    {
        var resultado = await MigracionDeCertificacionPorNumero.EjecutarAsync(sesiones, protector, reloj.GetUtcNow(), logger, ct);
        logger.LogInformation("Liga por número de las certificaciones bancarias generales: {Resumen}", resultado.Resumen);
        if (resultado.ConError > 0)
        {
            // Un fallo técnico no cierra la pasada: sin marca, el siguiente arranque la repite, y repetirla no cambia lo ya ligado.
            logger.LogWarning("La liga por número de las certificaciones no deja su marca: {Documentos} documentos fallaron y se reintentan en el siguiente arranque.", resultado.ConError);
            return;
        }

        await MigracionDeCertificacionPorNumero.MarcarEjecutadaAsync(sesiones, resultado, reloj.GetUtcNow(), ct);
    }
}

/// <summary>
/// Pasada de datos, única e idempotente, de la liga por número de la certificación bancaria general (CB-8, 2026-11-24). Lo que la IA lee desde ahora se liga solo
/// (<see cref="LigaDeCertificacionGeneral"/>, al registrarse la lectura); esto recorre lo que <b>ya estaba leído</b>: cada certificación bancaria global sin cuenta (la que el tercero
/// subió desde el requisito del expediente) se mira con la misma regla y, si su número coincide con una sola cuenta activa del tercero sin certificación propia, se liga. Con
/// varias coincidencias, con una cuenta que ya tiene la suya o sin número no se adivina y queda como general. Repetirla no cambia nada: lo ligado ya no es general.
/// </summary>
public static class MigracionDeCertificacionPorNumero
{
    public const string Nombre = "certificacion-bancaria-por-numero";

    public static async Task<bool> YaCorrioAsync(IQuerySession consulta, CancellationToken ct) =>
        await consulta.LoadAsync<MigracionDeDatosEjecutada>(Nombre, ct) is not null;

    public static async Task MarcarEjecutadaAsync(ISesiones sesiones, ResultadoDeLigaPorNumero resultado, DateTimeOffset ahora, CancellationToken ct)
    {
        await using var sesion = sesiones.Global();
        sesion.Store(new MigracionDeDatosEjecutada { Id = Nombre, EjecutadaEn = ahora, Resumen = resultado.Resumen });
        await sesion.SaveChangesAsync(ct);
    }

    public static async Task<ResultadoDeLigaPorNumero> EjecutarAsync(ISesiones sesiones, IProtectorDeSecretos protector, DateTimeOffset ahora, ILogger logger, CancellationToken ct)
    {
        List<Guid> ids;
        await using (var consulta = sesiones.ConsultaBoveda())
        {
            // Solo las que la IA ya leyó con un número utilizable: sin lectura no hay con qué decidir (cuando llegue, la liga la hace el análisis).
            ids =
            [
                .. (await consulta.Query<Documento>()
                    .Where(d => d.TipoCanonico == CatalogoCanonico.CertificacionBancaria && d.CuentaBancariaId == null && d.Ambito == AmbitoDocumento.Global && !d.EnCuarentena)
                    .OrderBy(d => d.CreadoEn)
                    .ToListAsync(ct))
                .Where(d => LigaDeCertificacionPorNumero.NumeroLeido(d) is not null)
                .Select(d => d.Id)
            ];
        }

        int ligadas = 0, sinLigar = 0, conError = 0;
        foreach (var id in ids)
        {
            try
            {
                if (await LigaDeCertificacionGeneral.IntentarAsync(sesiones, protector, id, ahora, ct) == ResultadoDeLigaGeneral.Ligada)
                    ligadas++;
                else
                    sinLigar++;
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                conError++;
                logger.LogError(e, "No se pudo revisar la certificación bancaria {DocumentoId} para ligarla a su cuenta.", id);
            }
        }

        return new ResultadoDeLigaPorNumero(ids.Count, ligadas, sinLigar, conError);
    }
}

/// <summary>
/// Al arrancar corre una sola vez la liga por número de las certificaciones generales ya leídas (<see cref="MigracionDeCertificacionPorNumero"/>): si no hay marca de que ya corrió, la
/// pide al bus; el manejador la ejecuta y deja la marca. Solo el nodo líder; si el esquema aún no existe (entornos sin creación automática), lo advierte y la pide en el siguiente
/// arranque. Apagable con <c>Validalo:Migraciones:CertificacionPorNumero:Habilitada</c> en <c>false</c> (encendida por omisión).
/// </summary>
public sealed class MigracionDeCertificacionPorNumeroAlArrancar(IServiceProvider servicios, IConfiguration configuracion, ILogger<MigracionDeCertificacionPorNumeroAlArrancar> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuracion.GetValue("Validalo:Migraciones:CertificacionPorNumero:Habilitada", true))
            return;

        // Wolverine y la base necesitan haber arrancado (y la migración de CB-7 haber ligado lo suyo): se espera un poco y, si aún no están, se reintenta unas veces.
        var espera = configuracion.GetValue("Validalo:Migraciones:CertificacionPorNumero:Espera", TimeSpan.FromSeconds(30));
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
                        if (await MigracionDeCertificacionPorNumero.YaCorrioAsync(consulta, stoppingToken))
                            return;

                    await alcance.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new MigrarCertificacionesPorNumero());
                    logger.LogInformation("Se pidió la liga por número de las certificaciones bancarias generales.");
                    return;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogWarning(e, "No se pudo pedir la liga por número de las certificaciones bancarias generales (intento {Intento}).", intento);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado de la API.
        }
    }
}
