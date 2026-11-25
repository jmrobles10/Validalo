using System.Globalization;
using Validalo.Dominio.Integraciones;

namespace Validalo.Dominio.Ia;

/// <summary>De qué cupo salió una validación (IA-3, IA-4).</summary>
public enum TipoValidacionIa
{
    Incluida,
    Adicional
}

/// <summary>
/// Una validación de IA que consumió una empresa (IA-3): el análisis de una versión de un documento que esa empresa
/// recibe. Esquema <c>validacion</c>, multi-tenant; id determinista por (empresa, documento, versión), así la misma
/// empresa nunca paga dos veces la misma versión. Que exista es lo que habilita a la empresa a ver los hechos de IA.
/// </summary>
public sealed class ValidacionIaConsumida
{
    public Guid Id { get; set; }

    public Guid EmpresaId { get; set; }

    public Guid DocumentoId { get; set; }

    public int Numero { get; set; }

    /// <summary>Mes calendario (<c>yyyy-MM</c>) en la zona del tenant.</summary>
    public string Mes { get; set; } = string.Empty;

    public TipoValidacionIa Tipo { get; set; }

    /// <summary>La llamada a OpenAI se pagó con la llave de esta empresa. Falso = el análisis lo pagó otra empresa y esta lo reutiliza (IA-3, IA-15).</summary>
    public bool PagoLaLlamada { get; set; }

    public DateTimeOffset Fecha { get; set; }

    /// <summary>
    /// El costo del análisis original ya quedó atribuido a esta validación reutilizada (IA-15). Las validaciones reutilizadas de antes de IA-15 no lo traen: un recálculo
    /// idempotente lo busca en el análisis de la versión. En una validación que pagó la llamada no aplica (su costo real va en <see cref="UsoMensualIa.CostoUsd"/>).
    /// </summary>
    public bool CostoAtribuido { get; set; }

    /// <summary>Tokens de entrada del análisis original atribuidos a esta validación reutilizada.</summary>
    public long TokensEntradaAtribuidos { get; set; }

    public long TokensEntradaEnCacheAtribuidos { get; set; }

    public long TokensSalidaAtribuidos { get; set; }

    /// <summary>Costo en dólares del análisis original atribuido a esta validación reutilizada: lo que habría costado si la empresa lo hubiera pagado.</summary>
    public decimal CostoAtribuidoUsd { get; set; }

    /// <summary>Lo atribuido a la validación como costo (cero mientras no se haya podido atribuir).</summary>
    [System.Text.Json.Serialization.JsonIgnore]
    public CostoDeAnalisis Atribuido => new(TokensEntradaAtribuidos, TokensEntradaEnCacheAtribuidos, TokensSalidaAtribuidos, CostoAtribuidoUsd);

    /// <summary>Atribuye a la validación reutilizada el costo y los tokens del análisis original.</summary>
    public void Atribuir(CostoDeAnalisis costo)
    {
        CostoAtribuido = true;
        TokensEntradaAtribuidos = costo.TokensEntrada;
        TokensEntradaEnCacheAtribuidos = costo.TokensEntradaEnCache;
        TokensSalidaAtribuidos = costo.TokensSalida;
        CostoAtribuidoUsd = costo.CostoUsd;
    }

    public static Guid Clave(Guid empresaId, Guid documentoId, int numero) => Deterministas.Guid($"ia-validacion:{empresaId:N}:{documentoId:N}:{numero}");
}

/// <summary>
/// Lo que costó el análisis de una versión: los tokens y los dólares que facturó OpenAI a quien hizo la llamada (la llamada y, si hubo, la de escalamiento). Es lo que se
/// atribuye a cada empresa que reutiliza ese análisis (IA-15).
/// </summary>
public sealed record CostoDeAnalisis(long TokensEntrada, long TokensEntradaEnCache, long TokensSalida, decimal CostoUsd)
{
    public static readonly CostoDeAnalisis Ninguno = new(0, 0, 0, 0m);
}

/// <summary>Uso de un día del mes (serie diaria de <c>GET /ia/uso</c>).</summary>
public sealed class UsoDiarioIa
{
    public int Incluidas { get; set; }

    public int Adicionales { get; set; }

    public int AnalisisPagados { get; set; }

    public long TokensEntrada { get; set; }

    public long TokensSalida { get; set; }

    public decimal CostoUsd { get; set; }

    /// <summary>Validaciones del día que usaron un análisis que pagó otra empresa (IA-15); ya cuentan en incluidas o adicionales.</summary>
    public int Reutilizadas { get; set; }

    public long TokensEntradaReutilizados { get; set; }

    public long TokensSalidaReutilizados { get; set; }

    /// <summary>Costo atribuido del día: el de los análisis originales de las validaciones reutilizadas. No es lo que pagó la llave de la empresa.</summary>
    public decimal CostoReutilizadoUsd { get; set; }
}

/// <summary>Lo que gastó un modelo en el mes de una empresa (PI-12).</summary>
public sealed class UsoPorModeloIa
{
    public int Llamadas { get; set; }

    public long TokensEntrada { get; set; }

    public long TokensEntradaEnCache { get; set; }

    public long TokensSalida { get; set; }

    public decimal CostoUsd { get; set; }
}

/// <summary>Resultado de pedir una validación: el cupo del que salió (nulo = sin cupo) y los umbrales de aviso que cruzó.</summary>
public sealed record ConsumoDeValidacion(TipoValidacionIa? Tipo, IReadOnlyList<int> AvisosCruzados)
{
    public bool Consumida => Tipo is not null;

    public static readonly ConsumoDeValidacion SinCupo = new(null, []);
}

/// <summary>
/// Contador de uso de IA de una empresa en un mes (IA-3, IA-4). Esquema <c>validacion</c>, multi-tenant, con concurrencia
/// optimista (los manejadores reintentan si pierden la carrera); id <c>{empresa:N}:{yyyy-MM}</c>. Cuenta validaciones
/// incluidas y adicionales consumidas, los análisis que pagó su llave (tokens y costo real) y los avisos de 80 % y 100 %
/// ya enviados (uno por umbral y mes). Aparte, lo <b>reutilizado</b> (IA-15): las validaciones que recibieron un análisis que pagó otra
/// empresa, con el costo y los tokens de ese análisis atribuidos a esta empresa. El costo real (<see cref="CostoUsd"/>) y el reutilizado
/// nunca se mezclan: la consola de Plataforma suma el real (lo que se pagó a OpenAI) y la empresa ve el total atribuido (real + reutilizado).
/// </summary>
public sealed class UsoMensualIa
{
    public static readonly IReadOnlyList<int> Umbrales = [80, 100];

    public string Id { get; set; } = string.Empty;

    public Guid EmpresaId { get; set; }

    public string Mes { get; set; } = string.Empty;

    public int IncluidasConsumidas { get; set; }

    public int AdicionalesConsumidas { get; set; }

    public int AnalisisPagados { get; set; }

    public long TokensEntrada { get; set; }

    public long TokensEntradaEnCache { get; set; }

    public long TokensSalida { get; set; }

    public decimal CostoUsd { get; set; }

    /// <summary>Validaciones del mes que usaron un análisis que pagó otra empresa (IA-15). Ya cuentan en incluidas o adicionales; aquí solo se distinguen.</summary>
    public int ValidacionesReutilizadas { get; set; }

    /// <summary>Tokens de entrada de los análisis originales de las validaciones reutilizadas (no se pagaron con la llave de esta empresa).</summary>
    public long TokensEntradaReutilizados { get; set; }

    public long TokensEntradaEnCacheReutilizados { get; set; }

    public long TokensSalidaReutilizados { get; set; }

    /// <summary>Costo atribuido: lo que costaron los análisis originales de las validaciones reutilizadas, como si la empresa los hubiera pagado.</summary>
    public decimal CostoReutilizadoUsd { get; set; }

    /// <summary>Umbrales (80, 100) cuyo aviso ya salió este mes.</summary>
    public List<int> AvisosEnviados { get; set; } = [];

    /// <summary>Serie por día (<c>yyyy-MM-dd</c> en la zona del tenant).</summary>
    public Dictionary<string, UsoDiarioIa> PorDia { get; set; } = [];

    /// <summary>Lo que pagó la llave de la empresa en el mes, por modelo (PI-12): llamadas, tokens y costo. Los meses anteriores a PI-12 no lo traen.</summary>
    public Dictionary<string, UsoPorModeloIa> PorModelo { get; set; } = [];

    public static string Clave(Guid empresaId, string mes) => $"{empresaId:N}:{mes}";

    public static UsoMensualIa Nuevo(Guid empresaId, string mes) => new() { Id = Clave(empresaId, mes), EmpresaId = empresaId, Mes = mes };

    public static string MesDe(DateOnly dia) => dia.ToString("yyyy-MM", CultureInfo.InvariantCulture);

    /// <summary>
    /// Regla de cupo (IA-4) sin cambiar nada: con validaciones incluidas disponibles ⇒ <c>Incluida</c>; si no, con adicional
    /// habilitado y bajo el tope ⇒ <c>Adicional</c>; si no (o sin plan activo) ⇒ nulo.
    /// </summary>
    public TipoValidacionIa? CupoDisponible(PlanDeIaEmpresa? plan)
    {
        if (plan is not { Activo: true })
            return null;
        if (IncluidasConsumidas < plan.ValidacionesIncluidasMes)
            return TipoValidacionIa.Incluida;
        if (plan.AdicionalHabilitado && (plan.TopeAdicionalMes is not { } tope || AdicionalesConsumidas < tope))
            return TipoValidacionIa.Adicional;
        return null;
    }

    /// <summary>Consume una validación según <see cref="CupoDisponible"/> y marca los avisos de 80 % y 100 % de las incluidas que cruce.</summary>
    public ConsumoDeValidacion Consumir(PlanDeIaEmpresa? plan, DateOnly dia)
    {
        if (CupoDisponible(plan) is not { } tipo)
            return ConsumoDeValidacion.SinCupo;

        var delDia = Dia(dia);
        if (tipo == TipoValidacionIa.Incluida)
        {
            IncluidasConsumidas++;
            delDia.Incluidas++;
        }
        else
        {
            AdicionalesConsumidas++;
            delDia.Adicionales++;
        }

        // Si una sola validación cruza los dos umbrales (cupo pequeño), sale solo el aviso del mayor; ambos quedan enviados.
        var cruzados = new List<int>();
        var incluidas = plan!.ValidacionesIncluidasMes;
        if (incluidas > 0)
        {
            foreach (var umbral in Umbrales)
            {
                if (IncluidasConsumidas * 100L >= (long)incluidas * umbral && !AvisosEnviados.Contains(umbral))
                {
                    AvisosEnviados.Add(umbral);
                    cruzados.Add(umbral);
                }
            }
        }

        return new ConsumoDeValidacion(tipo, cruzados.Count == 0 ? [] : [cruzados.Max()]);
    }

    /// <summary>Devuelve una validación consumida (el análisis falló: no se cobra, IA-6). Los avisos ya enviados no se retiran.</summary>
    public void Revertir(TipoValidacionIa tipo, DateOnly dia)
    {
        var delDia = Dia(dia);
        if (tipo == TipoValidacionIa.Incluida)
        {
            IncluidasConsumidas = Math.Max(0, IncluidasConsumidas - 1);
            delDia.Incluidas = Math.Max(0, delDia.Incluidas - 1);
        }
        else
        {
            AdicionalesConsumidas = Math.Max(0, AdicionalesConsumidas - 1);
            delDia.Adicionales = Math.Max(0, delDia.Adicionales - 1);
        }
    }

    /// <summary>
    /// La empresa recibe un análisis que pagó otra (IA-3): suma la validación reutilizada y le atribuye el costo y los tokens del análisis original (IA-15). No toca
    /// <see cref="CostoUsd"/> ni los tokens reales: esos son solo lo que facturó OpenAI a la llave de esta empresa.
    /// </summary>
    public void RegistrarReutilizada(CostoDeAnalisis costo, DateOnly dia)
    {
        var delDia = Dia(dia);
        ValidacionesReutilizadas++;
        delDia.Reutilizadas++;
        Sumar(costo, delDia, 1);
    }

    /// <summary>Devuelve una validación reutilizada y el costo que se le había atribuido (el recibo se anuló). Idempotente por construcción: nunca baja de cero.</summary>
    public void RevertirReutilizada(CostoDeAnalisis costo, DateOnly dia)
    {
        var delDia = Dia(dia);
        ValidacionesReutilizadas = Math.Max(0, ValidacionesReutilizadas - 1);
        delDia.Reutilizadas = Math.Max(0, delDia.Reutilizadas - 1);
        Sumar(costo, delDia, -1);
    }

    /// <summary>
    /// Rehace lo reutilizado del mes desde las validaciones reutilizadas que lo componen (IA-15, recálculo del histórico): borra los acumulados reutilizados del mes y de
    /// cada día y los suma de nuevo. Lo real (incluidas, adicionales, costo, tokens) no se toca. Repetirlo con las mismas validaciones deja el mismo resultado.
    /// </summary>
    public void ReconstruirReutilizado(IEnumerable<(DateOnly Dia, CostoDeAnalisis Costo)> reutilizadas)
    {
        ValidacionesReutilizadas = 0;
        TokensEntradaReutilizados = TokensEntradaEnCacheReutilizados = TokensSalidaReutilizados = 0;
        CostoReutilizadoUsd = 0m;
        foreach (var dia in PorDia.Values)
        {
            dia.Reutilizadas = 0;
            dia.TokensEntradaReutilizados = dia.TokensSalidaReutilizados = 0;
            dia.CostoReutilizadoUsd = 0m;
        }

        foreach (var (dia, costo) in reutilizadas)
            RegistrarReutilizada(costo, dia);
    }

    private void Sumar(CostoDeAnalisis costo, UsoDiarioIa delDia, int signo)
    {
        TokensEntradaReutilizados = Math.Max(0, TokensEntradaReutilizados + signo * costo.TokensEntrada);
        TokensEntradaEnCacheReutilizados = Math.Max(0, TokensEntradaEnCacheReutilizados + signo * costo.TokensEntradaEnCache);
        TokensSalidaReutilizados = Math.Max(0, TokensSalidaReutilizados + signo * costo.TokensSalida);
        CostoReutilizadoUsd = Math.Max(0m, CostoReutilizadoUsd + signo * costo.CostoUsd);
        delDia.TokensEntradaReutilizados = Math.Max(0, delDia.TokensEntradaReutilizados + signo * costo.TokensEntrada);
        delDia.TokensSalidaReutilizados = Math.Max(0, delDia.TokensSalidaReutilizados + signo * costo.TokensSalida);
        delDia.CostoReutilizadoUsd = Math.Max(0m, delDia.CostoReutilizadoUsd + signo * costo.CostoUsd);
    }

    /// <summary>Suma una llamada a OpenAI pagada con la llave de la empresa (tokens y costo real, IA-3).</summary>
    public void RegistrarCosto(long tokensEntrada, long tokensEnCache, long tokensSalida, decimal costoUsd, DateOnly dia, bool analisis)
    {
        var delDia = Dia(dia);
        if (analisis)
        {
            AnalisisPagados++;
            delDia.AnalisisPagados++;
        }

        TokensEntrada += tokensEntrada;
        TokensEntradaEnCache += tokensEnCache;
        TokensSalida += tokensSalida;
        CostoUsd += costoUsd;
        delDia.TokensEntrada += tokensEntrada;
        delDia.TokensSalida += tokensSalida;
        delDia.CostoUsd += costoUsd;
    }

    /// <summary>
    /// Suma las llamadas a OpenAI que pagó la llave de la empresa: los totales del mes y del día de <see cref="RegistrarCosto"/> y, además, lo que gastó cada
    /// modelo (PI-12), para cobrar y explicar el consumo por cliente.
    /// </summary>
    public void RegistrarLlamadas(IReadOnlyList<LlamadaDeIa> llamadas, DateOnly dia, bool analisis)
    {
        RegistrarCosto(llamadas.Sum(l => l.TokensEntrada), llamadas.Sum(l => l.TokensEntradaEnCache), llamadas.Sum(l => l.TokensSalida), llamadas.Sum(l => l.CostoUsd), dia,
            analisis);
        foreach (var llamada in llamadas)
        {
            var modelo = string.IsNullOrWhiteSpace(llamada.Modelo) ? "desconocido" : llamada.Modelo.Trim();
            if (!PorModelo.TryGetValue(modelo, out var uso))
                PorModelo[modelo] = uso = new UsoPorModeloIa();
            uso.Llamadas++;
            uso.TokensEntrada += llamada.TokensEntrada;
            uso.TokensEntradaEnCache += llamada.TokensEntradaEnCache;
            uso.TokensSalida += llamada.TokensSalida;
            uso.CostoUsd += llamada.CostoUsd;
        }
    }

    private UsoDiarioIa Dia(DateOnly dia)
    {
        var clave = dia.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
        if (!PorDia.TryGetValue(clave, out var uso))
            PorDia[clave] = uso = new UsoDiarioIa();
        return uso;
    }
}
