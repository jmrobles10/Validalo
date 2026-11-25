using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Notificaciones;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Identidad;
using Validalo.Dominio.Plataforma;
using Wolverine;

namespace Validalo.Aplicacion.Ia;

/// <summary>Una empresa con la que está compartida la versión (destinataria del análisis).</summary>
public sealed record EmpresaDestinataria(Guid TenantId, Guid EmpresaId);

/// <summary>Cómo terminó el pedido de una validación para una empresa.</summary>
public enum ResultadoDeConsumo
{
    /// <summary>Se consumió una validación ahora.</summary>
    Consumida,

    /// <summary>La empresa ya había consumido la validación de esta versión (idempotente).</summary>
    YaConsumida,

    /// <summary>Sin plan activo, sin incluidas y sin adicional (o con el tope alcanzado): no recibe el análisis.</summary>
    SinCupo
}

/// <summary>Mes y día calendario en la zona horaria del tenant (IA-3).</summary>
public static class CalendarioDeIa
{
    public static DateOnly Dia(DateTimeOffset instante, string? zonaHoraria)
    {
        var zona = !string.IsNullOrWhiteSpace(zonaHoraria) && TimeZoneInfo.TryFindSystemTimeZoneById(zonaHoraria, out var encontrada)
            ? encontrada
            : TimeZoneInfo.Utc;
        return DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(instante, zona).DateTime);
    }
}

/// <summary>
/// Cupo de validaciones de IA de las empresas (IA-3, IA-4), en el esquema <c>validacion</c> de cada tenant. Cada operación
/// abre su propia sesión y se reintenta si pierde una carrera (el contador mensual tiene concurrencia optimista y la
/// validación consumida tiene id determinista).
/// </summary>
public sealed class CupoDeIa(ISesiones sesiones, TimeProvider reloj)
{
    private readonly Dictionary<Guid, string?> _zonas = [];

    /// <summary>Plan de la empresa (nulo si no se configuró).</summary>
    public async Task<PlanDeIaEmpresa?> PlanAsync(EmpresaDestinataria empresa, CancellationToken ct)
    {
        await using var sesion = sesiones.ParaTenant(empresa.TenantId);
        return await sesion.LoadAsync<PlanDeIaEmpresa>(empresa.EmpresaId, ct);
    }

    /// <summary>La empresa puede pagar la llamada: plan activo con llave y, si aún no consumió esta versión, cupo disponible.</summary>
    public async Task<PlanDeIaEmpresa?> PagadorAsync(EmpresaDestinataria empresa, Guid documentoId, int numero, CancellationToken ct)
    {
        await using var sesion = sesiones.ParaTenant(empresa.TenantId);
        var plan = await sesion.LoadAsync<PlanDeIaEmpresa>(empresa.EmpresaId, ct);
        if (plan is not { PuedePagar: true })
            return null;
        if (await sesion.LoadAsync<ValidacionIaConsumida>(ValidacionIaConsumida.Clave(empresa.EmpresaId, documentoId, numero), ct) is not null)
            return plan;
        var mes = UsoMensualIa.MesDe(await DiaAsync(empresa.TenantId, ct));
        var uso = await sesion.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(empresa.EmpresaId, mes), ct) ?? UsoMensualIa.Nuevo(empresa.EmpresaId, mes);
        return uso.CupoDisponible(plan) is null ? null : plan;
    }

    /// <summary>
    /// La empresa consume la validación de la versión: incluida, adicional o sin cupo (IA-4). Si cruza el 80 % o el 100 % de
    /// las incluidas, avisa a sus administradores (campana en la misma transacción; correo por el outbox de
    /// <paramref name="mensajes"/>). Si <paramref name="pagaLaLlamada"/> es falso, la empresa reutiliza un análisis que pagó otra (IA-3): la validación queda marcada como
    /// reutilizada y se le atribuye el costo y los tokens de ese análisis (IA-15), que se leen del análisis registrado de la versión. Sin cupo no se consume ni se atribuye
    /// nada (IA-4).
    /// </summary>
    public async Task<ResultadoDeConsumo> ConsumirAsync(EmpresaDestinataria empresa, Guid documentoId, int numero, bool pagaLaLlamada,
        IMessageContext mensajes, CancellationToken ct)
    {
        var dia = await DiaAsync(empresa.TenantId, ct);
        var intento = 0;
        CostoDeAnalisis? costoDelAnalisis = null; // se lee una sola vez aunque el intento se repita
        return await Peticiones.ConReintentosAsync(async () =>
        {
            // Lo que publicó un intento que perdió la carrera no debe salir con el siguiente.
            if (intento++ > 0 && mensajes is Wolverine.Runtime.MessageContext pendientes)
                await pendientes.ClearAllAsync();

            // TD-8: la sesión del outbox toma el tenant del contexto del mensaje.
            mensajes.TenantId = empresa.TenantId.ToString("N");
            await using var sesion = sesiones.ParaTenant(empresa.TenantId, mensajes);
            var id = ValidacionIaConsumida.Clave(empresa.EmpresaId, documentoId, numero);
            if (await sesion.LoadAsync<ValidacionIaConsumida>(id, ct) is not null)
                return ResultadoDeConsumo.YaConsumida;

            var plan = await sesion.LoadAsync<PlanDeIaEmpresa>(empresa.EmpresaId, ct);
            var mes = UsoMensualIa.MesDe(dia);
            var uso = await sesion.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(empresa.EmpresaId, mes), ct) ?? UsoMensualIa.Nuevo(empresa.EmpresaId, mes);
            // Sin cupo no hace falta saber cuánto costó el análisis: la empresa no lo recibe.
            if (!pagaLaLlamada && uso.CupoDisponible(plan) is not null)
                costoDelAnalisis ??= await CostoDelAnalisisAsync(documentoId, numero, ct);
            var consumo = uso.Consumir(plan, dia);
            if (consumo.Tipo is not { } tipo)
                return ResultadoDeConsumo.SinCupo;

            var validacion = new ValidacionIaConsumida
            {
                Id = id,
                EmpresaId = empresa.EmpresaId,
                DocumentoId = documentoId,
                Numero = numero,
                Mes = mes,
                Tipo = tipo,
                PagoLaLlamada = pagaLaLlamada,
                Fecha = reloj.GetUtcNow()
            };
            if (!pagaLaLlamada)
            {
                // Reutilizada: el costo del análisis original se le atribuye como si lo hubiera pagado (IA-15). Si el análisis no se encuentra queda sin atribuir y el
                // recálculo del histórico lo completa cuando aparezca.
                if (costoDelAnalisis is { } atribuido)
                    validacion.Atribuir(atribuido);
                uso.RegistrarReutilizada(costoDelAnalisis ?? CostoDeAnalisis.Ninguno, dia);
            }

            sesion.Insert(validacion);
            sesion.Store(uso);
            foreach (var umbral in consumo.AvisosCruzados)
                await AvisarAsync(sesion, mensajes, empresa, plan!, uso, umbral, ct);
            await sesion.SaveChangesAsync(ct);
            return ResultadoDeConsumo.Consumida;
        });
    }

    /// <summary>
    /// Lo que costó el análisis de la versión (tokens y dólares de la llamada y, si la hubo, de la de escalamiento): se lee del evento <see cref="AnalisisDeIaRegistrado"/> de la
    /// bóveda, porque la proyección de la versión no guarda costos (nunca se exponen a quien ve el análisis). Nulo si la versión no tiene análisis registrado.
    /// </summary>
    public async Task<CostoDeAnalisis?> CostoDelAnalisisAsync(Guid documentoId, int numero, CancellationToken ct)
    {
        await using var consulta = sesiones.ConsultaBoveda();
        return CostoDeAnalisisRegistrado.De(await consulta.Events.FetchStreamAsync(documentoId, token: ct), numero);
    }

    /// <summary>Devuelve la validación consumida por la versión (el análisis falló y no se cobra, IA-6). Idempotente.</summary>
    public async Task RevertirAsync(EmpresaDestinataria empresa, Guid documentoId, int numero, CancellationToken ct)
    {
        await Peticiones.ConReintentosAsync(async () =>
        {
            await using var sesion = sesiones.ParaTenant(empresa.TenantId);
            var validacion = await sesion.LoadAsync<ValidacionIaConsumida>(ValidacionIaConsumida.Clave(empresa.EmpresaId, documentoId, numero), ct);
            if (validacion is null)
                return false;

            var uso = await sesion.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(empresa.EmpresaId, validacion.Mes), ct);
            if (uso is not null)
            {
                var dia = CalendarioDeIa.Dia(validacion.Fecha, await ZonaAsync(empresa.TenantId, ct));
                uso.Revertir(validacion.Tipo, dia);
                // Una validación reutilizada también devuelve lo que se le había atribuido (IA-15).
                if (!validacion.PagoLaLlamada)
                    uso.RevertirReutilizada(validacion.Atribuido, dia);
                sesion.Store(uso);
            }

            sesion.Delete(validacion);
            await sesion.SaveChangesAsync(ct);
            return true;
        });
    }

    /// <summary>Suma tokens y costo real de las llamadas en el uso del mes de la empresa que pagó (IA-3).</summary>
    public async Task RegistrarCostoAsync(EmpresaDestinataria empresa, IReadOnlyList<LlamadaDeIa> llamadas, bool analisisRegistrado, CancellationToken ct)
    {
        if (llamadas.Count == 0)
            return;
        var dia = await DiaAsync(empresa.TenantId, ct);
        await Peticiones.ConReintentosAsync(async () =>
        {
            await using var sesion = sesiones.ParaTenant(empresa.TenantId);
            var mes = UsoMensualIa.MesDe(dia);
            var uso = await sesion.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(empresa.EmpresaId, mes), ct) ?? UsoMensualIa.Nuevo(empresa.EmpresaId, mes);
            uso.RegistrarLlamadas(llamadas, dia, analisisRegistrado);
            sesion.Store(uso);
            await sesion.SaveChangesAsync(ct);
            return true;
        });
    }

    /// <summary>Hoy en la zona horaria del tenant.</summary>
    public async Task<DateOnly> DiaAsync(Guid tenantId, CancellationToken ct) => CalendarioDeIa.Dia(reloj.GetUtcNow(), await ZonaAsync(tenantId, ct));

    private async Task<string?> ZonaAsync(Guid tenantId, CancellationToken ct)
    {
        if (_zonas.TryGetValue(tenantId, out var zona))
            return zona;
        await using var consulta = sesiones.ConsultaGlobal();
        return _zonas[tenantId] = (await consulta.LoadAsync<Tenant>(tenantId, ct))?.ZonaHoraria;
    }

    private async Task AvisarAsync(IDocumentSession sesion, IMessageBus mensajes, EmpresaDestinataria empresa, PlanDeIaEmpresa plan,
        UsoMensualIa uso, int umbral, CancellationToken ct)
    {
        await using var consulta = sesiones.ConsultaGlobal();
        var nombre = (await consulta.LoadAsync<Empresa>(empresa.EmpresaId, ct))?.Nombre;
        var usuarios = await sesion.Query<Usuario>().Where(u => u.Activo).ToListAsync(ct);
        var ids = usuarios.Select(u => u.Id).ToArray();
        var preferencias = ids.Length == 0
            ? []
            : (await sesion.LoadManyAsync<PreferenciasNotificacion>(ct, ids)).ToDictionary(p => p.Id);
        var ahora = reloj.GetUtcNow();
        var avisos = PlanificadorDeNotificaciones.CupoDeIa(empresa.TenantId, empresa.EmpresaId, nombre, umbral, uso.Mes, uso.IncluidasConsumidas,
            plan.ValidacionesIncluidasMes, plan.AdicionalHabilitado, usuarios, id => preferencias.GetValueOrDefault(id), ahora, ahora.UtcTicks + umbral);
        foreach (var (_, notificacion) in avisos.Campana)
            sesion.Store(notificacion);
        foreach (var correo in avisos.Correos)
            await mensajes.PublishAsync(correo);
    }
}
