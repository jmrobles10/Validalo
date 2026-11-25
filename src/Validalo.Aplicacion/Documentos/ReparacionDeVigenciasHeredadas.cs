using Marten;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Dominio.Documentos;
using Wolverine;

namespace Validalo.Aplicacion.Documentos;

/// <summary>Pide recalcular las vigencias que quedaron calculadas con la regla anterior a TD-10 (la publica el arranque en cada inicio).</summary>
public sealed record RepararVigenciasHeredadas;

public static class RepararVigenciasHeredadasHandler
{
    public static async Task Handle(RepararVigenciasHeredadas mensaje, ISesiones sesiones, IMessageContext mensajes, ILogger<RepararVigenciasHeredadas> logger, CancellationToken ct)
    {
        var pedidos = await ReparacionDeVigenciasHeredadas.PedirAsync(sesiones, mensajes, ct);
        if (pedidos > 0)
            logger.LogInformation("Se pidió recalcular la vigencia de {Documentos} documentos que quedaron con la regla anterior a TD-10 (desde la carga o la expedición).", pedidos);
    }
}

/// <summary>
/// Repara, sin marca de «ya corrió», las vigencias de los documentos que quedaron con la base anterior a TD-10 (<see cref="BaseVigencia.FechaExpedicion"/> o
/// <see cref="BaseVigencia.FechaCarga"/>): esa base ya no se calcula (la vigencia cuenta desde la aprobación de la empresa), así que una vigencia con ella es un cálculo viejo que
/// la migración de los tipos (<see cref="MigracionDeReglasDeFrescura"/>) debió reemplazar y no alcanzó, p. ej. porque se perdió el mensaje de recálculo. Por cada documento cuya
/// versión actual la tenga pide <see cref="CalcularVigenciasDelDocumento"/>. Es idempotente: una vez recalculada, la vigencia pasa a una base nueva y el documento no vuelve a salir.
/// Corre en cada arranque (<see cref="MigracionDeReglasDeFrescuraAlArrancar"/>): sin documentos heredados no hace nada.
/// </summary>
public static class ReparacionDeVigenciasHeredadas
{
    private const int TamanoDelLote = 500;

    /// <summary>Documentos cuya versión actual aún trae una vigencia con la base anterior a TD-10.</summary>
    public static async Task<IReadOnlyList<Guid>> DocumentosConVigenciaHeredadaAsync(IQuerySession consulta, CancellationToken ct)
    {
        var heredados = new List<Guid>();
        for (var desde = 0; ; desde += TamanoDelLote)
        {
            var lote = await consulta.Query<Documento>().Where(d => d.VersionActual != null).OrderBy(d => d.Id).Skip(desde).Take(TamanoDelLote).ToListAsync(ct);
            heredados.AddRange(lote.Where(d => d.TieneVigenciaHeredada).Select(d => d.Id));
            if (lote.Count < TamanoDelLote)
                return heredados;
        }
    }

    /// <summary>Pide el recálculo de cada documento con vigencia heredada; devuelve cuántos pidió.</summary>
    public static async Task<int> PedirAsync(ISesiones sesiones, IMessageBus mensajes, CancellationToken ct)
    {
        IReadOnlyList<Guid> heredados;
        await using (var consulta = sesiones.ConsultaBoveda())
            heredados = await DocumentosConVigenciaHeredadaAsync(consulta, ct);

        foreach (var documentoId in heredados)
            await mensajes.PublishAsync(new CalcularVigenciasDelDocumento(documentoId));
        return heredados.Count;
    }
}
