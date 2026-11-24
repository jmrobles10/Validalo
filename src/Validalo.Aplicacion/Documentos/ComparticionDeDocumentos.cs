using JasperFx.Events;
using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Expedientes;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Plataforma;
using Validalo.Dominio.Terceros;
using Validalo.Dominio.Vinculos;
using Wolverine;

namespace Validalo.Aplicacion.Documentos;

/// <summary>
/// Documentos del tercero que tocan a un vínculo (globales que pide su flujo y los <c>PorVinculo</c> del vínculo) ya con
/// las comparticiones nuevas aplicadas, y las comparticiones que se registraron. <see cref="DocumentosDePersonas"/> son los de las personas
/// relacionadas que el flujo pide (ADR-0010), ya compartidos con el vínculo: de otra bóveda, aparte de los del tercero.
/// </summary>
public sealed record DocumentosDelVinculo(IReadOnlyList<CompartidoDto> Compartidos, IReadOnlyList<Documento> Documentos,
    IReadOnlyList<Documento>? DocumentosDePersonas = null);

/// <summary>Qué documentos globales (canónicos) pide el flujo de una persona relacionada para un vínculo (ADR-0010).</summary>
public sealed record PersonaPedida(Guid PersonaId, IReadOnlySet<string> Codigos);

/// <summary>
/// Compartición de la bóveda con las empresas (B-1, ADR-0009, A-8). Nada se comparte antes de que el tercero acepte la
/// invitación. Qué recibe cada vínculo lo deciden los <b>requisitos de su flujo</b> (RQ-3, reemplaza las exigencias por
/// tipo de BO-3): al aceptar —o al abrir el expediente de un vínculo ya aceptado— la empresa recibe la versión actual de
/// cada tipo global que pide el flujo resuelto para ese vínculo (y los <c>PorVinculo</c> ya cargados para él); cuando una
/// versión nueva pasa a <c>Actual</c>, se comparte con los vínculos aceptados del tercero cuyo expediente abierto o
/// flujo vigente pide ese tipo. El tercero no excluye empresas (A-8). Las reglas viven en <see cref="Documento.Compartir"/>;
/// aquí solo se resuelven los candidatos entre tenants.
/// </summary>
public static class ComparticionDeDocumentos
{
    /// <summary>
    /// Comparte con <paramref name="vinculo"/> (ya aceptado, o aceptándose en esta misma transacción) la versión actual de
    /// cada documento global cuyo canónico está en <paramref name="codigosGlobales"/> y de sus <c>PorVinculo</c>. La sesión
    /// es la del tenant del vínculo; los streams de la bóveda se escriben con <c>ForTenant("boveda")</c> sobre la misma
    /// unidad de trabajo, cada uno con concurrencia optimista: el llamador reintenta si pierde la carrera (BO-6).
    /// </summary>
    public static async Task<DocumentosDelVinculo> CompartirConVinculoAsync(IDocumentSession sesionDelTenant, Vinculo vinculo, Guid tenantId,
        IReadOnlySet<string> codigosGlobales, OrigenComparticion origen, DateTimeOffset ahora, CancellationToken ct)
    {
        var boveda = sesionDelTenant.ForTenant(TenantsTecnicos.Boveda);
        var terceroId = vinculo.TerceroId;
        var documentos = await boveda.Query<Documento>().Where(d => d.TerceroId == terceroId).ToListAsync(ct);

        var compartidos = new List<CompartidoDto>();
        var resultado = new List<Documento>();
        foreach (var candidato in documentos.OrderBy(d => d.CreadoEn))
        {
            var esDelVinculo = candidato.Ambito == AmbitoDocumento.PorVinculo && candidato.VinculoId == vinculo.Id;
            // La certificación de una cuenta (CB-1) no la pide el flujo: se comparte solo cuando el tercero designa esa cuenta con la empresa (CompartirCertificacionDeCuentaAsync).
            var pedido = candidato.Ambito == AmbitoDocumento.Global && candidato.CuentaBancariaId is null && candidato.TipoCanonico is { } codigo && codigosGlobales.Contains(codigo);
            if (!esDelVinculo && !pedido)
            {
                // La certificación general que ya se le había compartido a la empresa y luego se ligó a su cuenta (CB-8) no se vuelve a compartir aquí, pero sigue siendo lo que
                // cubre ese requisito: va en el resultado para que el cálculo de requisitos la vea.
                if (candidato.Ambito == AmbitoDocumento.Global && candidato.CuentaBancariaId is not null && candidato.TipoCanonico is { } canonico && codigosGlobales.Contains(canonico) &&
                    candidato.Comparticiones.Any(c => c.VinculoId == vinculo.Id))
                    resultado.Add(candidato);
                continue;
            }

            var destino = new VinculoCandidato(vinculo.Id, tenantId, vinculo.EmpresaId, terceroId, InvitacionAceptada: true, vinculo.Estado,
                ExigeElTipo: pedido, vinculo.BovedaDisponible);
            if (candidato.Compartir(destino, origen, ahora) is null)
            {
                resultado.Add(candidato);
                continue;
            }

            // Concurrencia optimista (no FetchForExclusiveWriting: la operación por tenant tomaría el bloqueo en otra conexión
            // y el guardado de esta sesión esperaría por él). Si una confirmación cambió el documento entretanto, la operación
            // entera se reintenta y comparte la versión que quedó actual.
            var stream = await boveda.Events.FetchForWriting<Documento>(candidato.Id, ct);
            var documento = stream.Aggregate!;
            if (documento.Compartir(destino, origen, ahora) is { } evento)
            {
                stream.AppendOne(evento);
                compartidos.Add(evento.ADto(documento));
                resultado.Add(documento.Proyectar([evento]));
            }
            else
            {
                resultado.Add(documento);
            }
        }

        return new DocumentosDelVinculo(compartidos, resultado);
    }

    /// <summary>
    /// Comparte con el vínculo (aceptado) la versión actual de los documentos globales de las personas relacionadas que su flujo pide (ADR-0010, PR-3): cada
    /// <see cref="PersonaPedida"/> trae el id de la persona y los canónicos que se le piden. Solo eso: del resto de la bóveda de la persona, y de la de cualquier otra
    /// persona, no se comparte nada. Misma mecánica que <see cref="CompartirConVinculoAsync"/> (concurrencia optimista por stream; el llamador reintenta). Devuelve los
    /// documentos pedidos ya con las comparticiones nuevas y las comparticiones que se registraron.
    /// </summary>
    public static async Task<DocumentosDelVinculo> CompartirPersonasConVinculoAsync(IDocumentSession sesionDelTenant, Vinculo vinculo, Guid tenantId,
        IReadOnlyList<PersonaPedida> personas, OrigenComparticion origen, DateTimeOffset ahora, CancellationToken ct)
    {
        if (personas.Count == 0)
            return new DocumentosDelVinculo([], [], []);

        var boveda = sesionDelTenant.ForTenant(TenantsTecnicos.Boveda);
        var ids = personas.Select(p => p.PersonaId).Distinct().ToArray();
        var documentos = await boveda.Query<Documento>().Where(d => d.TerceroId.IsOneOf(ids) && d.Ambito == AmbitoDocumento.Global).ToListAsync(ct);

        var compartidos = new List<CompartidoDto>();
        var resultado = new List<Documento>();
        foreach (var candidato in documentos.OrderBy(d => d.CreadoEn))
        {
            var pedido = candidato.TipoCanonico is { } codigo && personas.Any(p => p.PersonaId == candidato.TerceroId && p.Codigos.Contains(codigo));
            if (!pedido)
                continue;

            // La propia persona natural que es el tercero (su representante soy yo): no es «vía una relación», es su bóveda.
            var destino = new VinculoCandidato(vinculo.Id, tenantId, vinculo.EmpresaId, vinculo.TerceroId, InvitacionAceptada: true, vinculo.Estado,
                ExigeElTipo: true, vinculo.BovedaDisponible, ViaPersonaRelacionada: candidato.TerceroId != vinculo.TerceroId);
            if (candidato.Compartir(destino, origen, ahora) is null)
            {
                resultado.Add(candidato);
                continue;
            }

            var stream = await boveda.Events.FetchForWriting<Documento>(candidato.Id, ct);
            var documento = stream.Aggregate!;
            if (documento.Compartir(destino, origen, ahora) is { } evento)
            {
                stream.AppendOne(evento);
                compartidos.Add(evento.ADto(documento));
                resultado.Add(documento.Proyectar([evento]));
            }
            else
            {
                resultado.Add(documento);
            }
        }

        return new DocumentosDelVinculo(compartidos, [], resultado);
    }

    /// <summary>
    /// La versión actual de <paramref name="proyectado"/> (el documento con los eventos nuevos ya aplicados) se comparte con
    /// cada vínculo aceptado que la pida. Se llama con el stream ya tomado con bloqueo: los vínculos se leen después, así
    /// una aceptación simultánea o la ve en su propia transacción o la ve esta. Con <paramref name="mensajes"/> (sesión
    /// enlistada en el outbox) cada vínculo que la recibe pide adjuntarla a su expediente abierto (RQ-2).
    /// </summary>
    public static async Task<IReadOnlyList<CompartidoDto>> CompartirActualAsync(IDocumentSession sesionBoveda, IEventStream<Documento> stream,
        Documento proyectado, OrigenComparticion origen, DateTimeOffset ahora, CancellationToken ct, IMessageBus? mensajes = null,
        IContextoSolicitud? contexto = null)
    {
        if (proyectado.VersionActual is null)
            return [];

        var candidatos = await CandidatosAsync(sesionBoveda, proyectado, CalculadoraDeVigencia.Fecha(ahora), ct);
        var eventos = proyectado.CompartirActual(candidatos, origen, ahora);
        foreach (var evento in eventos)
            stream.AppendOne(evento);
        if (mensajes is not null && contexto is not null)
        {
            await PedirSincronizacionAsync(mensajes, eventos.Select(e => (e.TenantId, e.VinculoId)), contexto);
            if (eventos.Count > 0)
                await mensajes.PublishAsync(new CalcularVigenciasDelDocumento(proyectado.Id));
            // Análisis con IA de la versión actual y consumo de las empresas que la reciben (ADR-0012); idempotente.
            await Ia.AnalisisConIa.PedirAsync(mensajes, proyectado);
        }

        return [.. eventos.Select(e => e.ADto(proyectado))];
    }

    /// <summary>
    /// Publica en el outbox (cola local durable <c>requisitos</c>) un <see cref="SincronizarRequisitosDelVinculo"/> por
    /// vínculo: sale solo si la transacción de la bóveda se confirma (RQ-2).
    /// </summary>
    public static async Task PedirSincronizacionAsync(IMessageBus mensajes, IEnumerable<(Guid TenantId, Guid VinculoId)> vinculos,
        IContextoSolicitud contexto)
    {
        foreach (var (tenantId, vinculoId) in vinculos.Distinct())
            await mensajes.PublishAsync(new SincronizarRequisitosDelVinculo(tenantId, vinculoId, contexto.ActorTipo.ToString(), contexto.ActorId));
    }

    private static async Task<IReadOnlyList<VinculoCandidato>> CandidatosAsync(IQuerySession consulta, Documento documento, DateOnly hoy, CancellationToken ct)
    {
        var propios = await CandidatosDelDuenoAsync(consulta, documento, ct);
        // La certificación de una cuenta es del tercero y de las empresas con las que designó esa cuenta: no de quien se relaciona con él.
        if (documento.Ambito != AmbitoDocumento.Global || documento.CuentaBancariaId is not null)
            return propios;
        // ADR-0010: si el dueño es una persona natural relacionada con otros terceros, sus documentos también van a los vínculos de esos terceros cuyo flujo se los pide.
        return [.. propios, .. await CandidatosPorRelacionAsync(consulta, documento, hoy, ct)];
    }

    /// <summary>
    /// Los vínculos de los terceros a los que la persona dueña del documento se relaciona (representante, suplente, socio…) y cuyo flujo (o expediente abierto) le pide ese
    /// documento por su rol. Solo relaciones vigentes: una relación terminada, propuesta o descartada no comparte nada nuevo.
    /// </summary>
    private static async Task<IReadOnlyList<VinculoCandidato>> CandidatosPorRelacionAsync(IQuerySession consulta, Documento documento, DateOnly hoy, CancellationToken ct)
    {
        var personaId = documento.TerceroId;
        var relaciones = RelacionesDeTercero.Vigentes(
            await consulta.Query<RelacionEntreTerceros>().Where(r => r.AnyTenant() && r.OrigenId == personaId).ToListAsync(ct), hoy);
        if (relaciones.Count == 0 || documento.TipoCanonico is not { } codigo)
            return [];

        var destinos = relaciones.Select(r => r.DestinoId).Distinct().ToArray();
        var vinculos = await consulta.Query<Vinculo>().Where(v => v.AnyTenant() && v.TerceroId.IsOneOf(destinos) && v.InvitacionAceptada).ToListAsync(ct);
        if (vinculos.Count == 0)
            return [];

        var empresas = (await consulta.LoadManyAsync<Empresa>(ct, vinculos.Select(v => v.EmpresaId).Distinct().ToArray())).ToDictionary(e => e.Id);
        var piden = await RequisitosDeExpediente.VinculosQuePidenPersonaAsync(consulta, vinculos, personaId, codigo, hoy, ct);
        return
        [
            .. vinculos
                .Where(v => empresas.ContainsKey(v.EmpresaId) && piden.Contains(v.Id))
                .Select(v => new VinculoCandidato(v.Id, empresas[v.EmpresaId].TenantId, v.EmpresaId, v.TerceroId, v.InvitacionAceptada, v.Estado, true,
                    v.BovedaDisponible, ViaPersonaRelacionada: true))
        ];
    }

    private static async Task<IReadOnlyList<VinculoCandidato>> CandidatosDelDuenoAsync(IQuerySession consulta, Documento documento, CancellationToken ct)
    {
        var terceroId = documento.TerceroId;
        if (documento.Ambito == AmbitoDocumento.PorVinculo)
        {
            var vinculoId = documento.VinculoId!.Value;
            var propio = await consulta.Query<Vinculo>().Where(v => v.AnyTenant() && v.Id == vinculoId).FirstOrDefaultAsync(ct);
            return propio is null
                ? []
                : [new VinculoCandidato(propio.Id, documento.TenantId!.Value, propio.EmpresaId, propio.TerceroId, propio.InvitacionAceptada,
                    propio.Estado, ExigeElTipo: false, propio.BovedaDisponible)];
        }

        var vinculos = await consulta.Query<Vinculo>()
            .Where(v => v.AnyTenant() && v.TerceroId == terceroId && v.InvitacionAceptada)
            .ToListAsync(ct);
        if (vinculos.Count == 0)
            return [];

        var empresaIds = vinculos.Select(v => v.EmpresaId).Distinct().ToArray();
        var empresas = (await consulta.LoadManyAsync<Empresa>(ct, empresaIds)).ToDictionary(e => e.Id);
        // Cada cuenta tiene su certificación (CB-1): la reciben las empresas con las que esa cuenta está designada o propuesta (las demás cuentas del tercero no se les muestran);
        // el resto de los globales, las empresas cuyo flujo los pide.
        var piden = documento.CuentaBancariaId is { } cuentaId
            ? vinculos.Where(v => CuentaLigada(v, cuentaId)).Select(v => v.Id).ToHashSet()
            : await RequisitosDeExpediente.VinculosQuePidenAsync(consulta, vinculos, documento.TipoCanonico!, ct);

        return
        [
            .. vinculos
                .Where(v => empresas.ContainsKey(v.EmpresaId))
                .Select(v => new VinculoCandidato(v.Id, empresas[v.EmpresaId].TenantId, v.EmpresaId, v.TerceroId, v.InvitacionAceptada, v.Estado,
                    piden.Contains(v.Id), v.BovedaDisponible))
        ];
    }

    /// <summary>La cuenta está designada o propuesta con la empresa del vínculo (una rechazada ya no es de su interés: no se le comparte más).</summary>
    public static bool CuentaLigada(Vinculo vinculo, Guid cuentaId) =>
        vinculo.CuentaDesignada?.Cuenta.CuentaId == cuentaId || vinculo.CuentaPropuesta?.Cuenta.CuentaId == cuentaId;

    /// <summary>
    /// El tercero designó la cuenta con la empresa del vínculo: se le comparte la versión actual de la certificación de <b>esa</b> cuenta (y solo esa), en la misma transacción
    /// que la propuesta. La sesión es la del tenant del vínculo; el stream de la bóveda se escribe con <c>ForTenant("boveda")</c> sobre la misma unidad de trabajo, con
    /// concurrencia optimista (el llamador reintenta si pierde la carrera). Devuelve las comparticiones nuevas; nada si ya estaba compartida (idempotente) o la cuenta no tiene
    /// versión actual. Quien llama publica después el cálculo de vigencias, el análisis de IA y la sincronización de requisitos del vínculo.
    /// </summary>
    public static async Task<IReadOnlyList<CompartidoDto>> CompartirCertificacionDeCuentaAsync(IDocumentSession sesionDelTenant, Vinculo vinculo, Guid tenantId, Guid cuentaId,
        OrigenComparticion origen, DateTimeOffset ahora, CancellationToken ct)
    {
        var boveda = sesionDelTenant.ForTenant(TenantsTecnicos.Boveda);
        var certificacion = await boveda.Query<Documento>().FirstOrDefaultAsync(d => d.CuentaBancariaId == cuentaId, ct);
        if (certificacion is null)
            return [];

        var destino = new VinculoCandidato(vinculo.Id, tenantId, vinculo.EmpresaId, vinculo.TerceroId, InvitacionAceptada: true, vinculo.Estado, ExigeElTipo: true, vinculo.BovedaDisponible);
        if (certificacion.Compartir(destino, origen, ahora) is null)
            return [];

        var stream = await boveda.Events.FetchForWriting<Documento>(certificacion.Id, ct);
        var documento = stream.Aggregate!;
        if (documento.Compartir(destino, origen, ahora) is not { } evento)
            return [];

        stream.AppendOne(evento);
        return [evento.ADto(documento)];
    }
}
