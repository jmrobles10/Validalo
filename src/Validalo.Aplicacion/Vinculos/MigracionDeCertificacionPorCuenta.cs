using Marten;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Interesado;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Terceros;
using Wolverine;

namespace Validalo.Aplicacion.Vinculos;

/// <summary>Lo que hizo la migración de la certificación bancaria por cuenta: documentos generales revisados, ligados a su única cuenta y dejados sin ligar.</summary>
public sealed record ResultadoDeMigracionDeCertificaciones(int Revisados, int Ligados, int SinLigar)
{
    public string Resumen => $"{Revisados} certificaciones bancarias sin cuenta revisadas: {Ligados} ligadas a su única cuenta activa, {SinLigar} sin ligar.";
}

/// <summary>Pide correr la migración de la certificación bancaria por cuenta (la publica el arranque).</summary>
public sealed record MigrarCertificacionesPorCuenta;

public static class MigrarCertificacionesPorCuentaHandler
{
    public static async Task Handle(MigrarCertificacionesPorCuenta mensaje, ISesiones sesiones, TimeProvider reloj, CancellationToken ct)
    {
        var resultado = await MigracionDeCertificacionPorCuenta.EjecutarAsync(sesiones, reloj.GetUtcNow(), ct);
        await MigracionDeCertificacionPorCuenta.MarcarEjecutadaAsync(sesiones, resultado, reloj.GetUtcNow(), ct);
    }
}

/// <summary>
/// Migración de datos, única e idempotente, de la certificación bancaria por cuenta (CB-1, decidido por el usuario el 2026-11-24: una certificación por cuenta). Antes la
/// certificación era el documento global <c>CERTIFICACION_BANCARIA</c> del tercero (uno solo, sin cuenta). Por cada uno de esos documentos:
/// <list type="bullet">
/// <item>si el tercero tiene <b>una sola cuenta activa</b>, el documento queda ligado a ella (<see cref="Documento.LigarACuenta"/>): conserva sus versiones y las comparticiones
/// con las empresas, y desde ahí es la certificación de esa cuenta;</item>
/// <item>si tiene varias (o ninguna), <b>no se adivina</b>: el documento queda como general, las cuentas quedan «sin certificación» y no se pueden designar de nuevo hasta que el
/// tercero suba la de cada una.</item>
/// </list>
/// Repetirla no cambia nada: un documento ya ligado no es general y uno que sigue general se revisa con el mismo resultado.
/// </summary>
public static class MigracionDeCertificacionPorCuenta
{
    public const string Nombre = "certificacion-bancaria-por-cuenta";

    public static async Task<bool> YaCorrioAsync(IQuerySession consulta, CancellationToken ct) =>
        await consulta.LoadAsync<MigracionDeDatosEjecutada>(Nombre, ct) is not null;

    public static async Task MarcarEjecutadaAsync(ISesiones sesiones, ResultadoDeMigracionDeCertificaciones resultado, DateTimeOffset ahora, CancellationToken ct)
    {
        await using var sesion = sesiones.Global();
        sesion.Store(new MigracionDeDatosEjecutada { Id = Nombre, EjecutadaEn = ahora, Resumen = resultado.Resumen });
        await sesion.SaveChangesAsync(ct);
    }

    public static async Task<ResultadoDeMigracionDeCertificaciones> EjecutarAsync(ISesiones sesiones, DateTimeOffset ahora, CancellationToken ct)
    {
        List<Documento> generales;
        await using (var consulta = sesiones.ConsultaBoveda())
        {
            generales =
            [
                .. await consulta.Query<Documento>()
                    .Where(d => d.TipoCanonico == CatalogoCanonico.CertificacionBancaria && d.CuentaBancariaId == null && d.Ambito == AmbitoDocumento.Global && !d.EnCuarentena)
                    .OrderBy(d => d.CreadoEn)
                    .ToListAsync(ct)
            ];
        }

        var nombreDelTipo = CatalogoCanonico.Requerido(CatalogoCanonico.CertificacionBancaria).Nombre;
        int ligados = 0, sinLigar = 0;
        foreach (var general in generales)
        {
            if (await LigarAsync(general, nombreDelTipo, sesiones, ahora, ct))
                ligados++;
            else
                sinLigar++;
        }

        return new ResultadoDeMigracionDeCertificaciones(generales.Count, ligados, sinLigar);
    }

    /// <summary>Liga el documento general a la única cuenta activa de su tercero; falso si no hay una sola (no se adivina) o ya tiene la certificación de esa cuenta.</summary>
    private static async Task<bool> LigarAsync(Documento general, string nombreDelTipo, ISesiones sesiones, DateTimeOffset ahora, CancellationToken ct)
    {
        try
        {
            await using var sesion = sesiones.Boveda();
            var terceroId = general.TerceroId;
            var activas = await sesion.Query<CuentaBancaria>().Where(c => c.TerceroId == terceroId && c.Estado == EstadoCuentaBancaria.Activa).ToListAsync(ct);
            if (activas.Count != 1)
                return false;

            var cuenta = activas[0];
            var cuentaId = cuenta.Id;
            // Esa cuenta ya tiene su certificación propia: lo de antes queda como general, no se pisa.
            if (await sesion.Query<Documento>().AnyAsync(d => d.CuentaBancariaId == cuentaId, ct))
                return false;

            var stream = await sesion.Events.FetchForExclusiveWriting<Documento>(general.Id, ct);
            if (stream.Aggregate is not { CuentaBancariaId: null } actual)
                return false;

            var evento = actual.LigarACuenta(cuenta.Id, Documento.NombreDeCertificacion(nombreDelTipo, cuenta.Banco, cuenta.NumeroEnmascarado), ahora);
            if (evento is null)
                return false;

            stream.AppendOne(evento);
            await sesion.SaveChangesAsync(ct);
            return true;
        }
        catch (Exception e) when (Peticiones.EsCarrera(e))
        {
            // Alguien subió la certificación de esa cuenta mientras tanto: la suya manda y lo de antes queda como general.
            return false;
        }
    }
}

/// <summary>
/// Al arrancar corre una sola vez la migración de la certificación bancaria por cuenta (<see cref="MigracionDeCertificacionPorCuenta"/>): si no hay marca de que ya corrió, la
/// pide al bus; el manejador la ejecuta y deja la marca. Solo el nodo líder; si el esquema aún no existe (entornos sin creación automática), lo advierte y la pide en el
/// siguiente arranque. Apagable con <c>Validalo:Migraciones:CertificacionPorCuenta:Habilitada</c> en <c>false</c>.
/// </summary>
public sealed class MigracionDeCertificacionPorCuentaAlArrancar(IServiceProvider servicios, IConfiguration configuracion, ILogger<MigracionDeCertificacionPorCuentaAlArrancar> logger)
    : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuracion.GetValue("Validalo:Migraciones:CertificacionPorCuenta:Habilitada", true))
            return;

        // Wolverine y la base necesitan haber arrancado: se espera un poco y, si aún no están, se reintenta unas veces.
        var espera = configuracion.GetValue("Validalo:Migraciones:CertificacionPorCuenta:Espera", TimeSpan.FromSeconds(20));
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
                        if (await MigracionDeCertificacionPorCuenta.YaCorrioAsync(consulta, stoppingToken))
                            return;

                    await alcance.ServiceProvider.GetRequiredService<IMessageBus>().PublishAsync(new MigrarCertificacionesPorCuenta());
                    logger.LogInformation("Se pidió la migración de la certificación bancaria por cuenta.");
                    return;
                }
                catch (Exception e) when (e is not OperationCanceledException)
                {
                    logger.LogWarning(e, "No se pudo pedir la migración de la certificación bancaria por cuenta (intento {Intento}).", intento);
                }
            }
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
        {
            // Apagado de la API.
        }
    }
}
