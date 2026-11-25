using JasperFx.Events;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ia;

namespace Validalo.Aplicacion.Ia;

/// <summary>
/// El costo de un análisis tal como quedó en el stream del documento (IA-15). La proyección de la versión (<see cref="AnalisisDeIaDeVersion"/>) no guarda tokens ni dólares, a propósito:
/// quien ve el análisis nunca ve lo que costó ni quién lo pagó. El costo vive solo en el evento <see cref="AnalisisDeIaRegistrado"/>, y de ahí se atribuye a cada empresa que lo
/// reutiliza.
/// </summary>
public static class CostoDeAnalisisRegistrado
{
    /// <summary>
    /// Tokens y dólares del análisis de la versión <paramref name="numero"/>: la suma de la llamada y, si hubo, la de escalamiento. Nulo si el stream no trae un análisis registrado de
    /// esa versión (nunca se analizó, falló o se suprimió).
    /// </summary>
    public static CostoDeAnalisis? De(IEnumerable<IEvent> eventos, int numero) =>
        eventos.Select(e => e.Data).OfType<AnalisisDeIaRegistrado>().FirstOrDefault(a => a.Numero == numero) is { } analisis
            ? new CostoDeAnalisis(analisis.TokensEntrada, analisis.TokensEntradaEnCache, analisis.TokensSalida, analisis.CostoUsd)
            : null;
}
