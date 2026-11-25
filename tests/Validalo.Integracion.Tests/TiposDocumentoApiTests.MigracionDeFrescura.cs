using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Wolverine.Runtime;

namespace Validalo.Integracion.Tests;

public sealed partial class TiposDocumentoApiTests
{
    // ---------- migración de la regla de frescura heredada a las dos reglas (TD-10) ----------

    private async Task<ResultadoDeMigracionDeFrescura> MigrarFrescuraAsync()
    {
        using var alcance = Host.Services.CreateScope();
        return await MigracionDeReglasDeFrescura.EjecutarAsync(Host.Services.GetRequiredService<IDocumentStore>(), alcance.ServiceProvider.GetRequiredService<ISesiones>(),
            Host.Services.GetRequiredService<IWolverineRuntime>(), CancellationToken.None);
    }

    [Fact]
    public async Task La_migracion_reescribe_la_regla_heredada_una_sola_vez_y_un_tipo_sin_migrar_se_lee_y_se_comporta_igual()
    {
        var e = await EscenarioConRevalidacionAsync([10], 5, antiguedad: null, revalidar: null);
        var hoy = Hoy();

        // El tipo queda como lo guardaba la versión anterior: la regla heredada «MaxDiasDesdeAprobacion(90)» y ninguno de los campos nuevos.
        var almacen = Host.Services.GetRequiredService<IDocumentStore>();
        await using (var sesion = almacen.LightweightSession(e.Empresa.Datos.TenantId.ToString("N")))
        {
            var tipo = (await sesion.LoadAsync<TipoDocumentoTenant>(e.Tipo.Id)).ShouldNotBeNull();
            (tipo.ReglaFrescura, tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias) = (ReglaFrescura.DiasDesdeAprobacion(90), null, null);
            sesion.Store(tipo);
            await sesion.SaveChangesAsync();
        }

        // Sin migrar se lee ya traducido (revalidar cada 90 días, sin antigüedad) y la vigencia cuenta igual desde la aprobación.
        var leido = await ApiAsync<TipoDocumentoTenantDto>("GET", $"/api/v1/tipos-documento/{e.Tipo.Id}", Admin(e.Empresa), null, 200);
        (leido.AntiguedadMaximaDias, leido.RevalidarCadaDias, leido.ReglaFrescura.Tipo).ShouldBe((null, 90, "Ninguna"));
        var documentoId = await SubirCertificadoAsync(e, 3);
        await AprobarAsync(e);
        (await VigenciaParaLaEmpresaAsync(e)).VigenteHasta.ShouldBe(hoy.AddDays(90));

        // La migración la reescribe (una sola vez) y pide recalcular los documentos del tipo, que dan la misma fecha.
        var primera = await MigrarFrescuraAsync();
        primera.Migrados.ShouldBeGreaterThanOrEqualTo(1);
        await using (var consulta = almacen.QuerySession(e.Empresa.Datos.TenantId.ToString("N")))
        {
            var guardado = (await consulta.LoadAsync<TipoDocumentoTenant>(e.Tipo.Id)).ShouldNotBeNull();
            (guardado.ReglaFrescura, guardado.AntiguedadMaximaDias, guardado.RevalidarCadaDias, guardado.TraeReglaHeredada).ShouldBe((ReglaFrescura.Ninguna, null, 90, false));
        }

        (await MigrarFrescuraAsync()).Migrados.ShouldBe(0); // idempotente
        await Task.Delay(TimeSpan.FromSeconds(2)); // el recálculo que pidió la migración, por su cola
        var calculadas = (await EventosAsync(documentoId)).OfType<VigenciaDeVersionCalculada>().Where(c => c.VigenteHasta is not null).ToList();
        calculadas.Select(c => c.VigenteHasta).Distinct().ShouldBe([hoy.AddDays(90)]);
    }

    /// <summary>Un tipo guardado como lo dejaba la versión anterior: la regla heredada «MaxDiasDesdeAprobacion(dias)» y ninguno de los campos nuevos.</summary>
    private async Task DejarTipoConLaReglaHeredadaAsync(EscenarioFormulario e, int dias)
    {
        await using var sesion = Host.Services.GetRequiredService<IDocumentStore>().LightweightSession(e.Empresa.Datos.TenantId.ToString("N"));
        var tipo = (await sesion.LoadAsync<TipoDocumentoTenant>(e.Tipo.Id)).ShouldNotBeNull();
        (tipo.ReglaFrescura, tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias) = (ReglaFrescura.DiasDesdeAprobacion(dias), null, null);
        sesion.Store(tipo);
        await sesion.SaveChangesAsync();
    }

    /// <summary>
    /// Lo que dejó la versión anterior en el stream del documento: una vigencia calculada desde la carga (base heredada), sin aprobación ni regla de revalidación. Es la última
    /// del vínculo, así que es la que se ve hasta que se recalcule.
    /// </summary>
    private async Task DejarLaVigenciaHeredadaAsync(EscenarioFormulario e, Guid documentoId, DateOnly vigenteHasta)
    {
        await using var sesion = Host.Services.GetRequiredService<IDocumentStore>().LightweightSession(TenantsTecnicos.Boveda);
        sesion.Events.Append(documentoId, new VigenciaDeVersionCalculada(1, e.Empresa.Datos.TenantId, e.Empresa.Datos.Id, e.Vinculo.Id, e.Tipo.Id, vigenteHasta, BaseVigencia.FechaCarga, [10], 5,
            DateTimeOffset.UtcNow));
        await sesion.SaveChangesAsync();
    }

    /// <summary>Dos empresas (dos tenants) con el tipo en la regla heredada y su certificado: uno sin aprobar y otro aprobado hace 10 días; ambos con la vigencia heredada «desde la carga».</summary>
    private async Task<(EscenarioFormulario SinAprobar, Guid DocumentoSinAprobar, EscenarioFormulario Aprobada, Guid DocumentoAprobado)> DosEmpresasConVigenciaHeredadaAsync()
    {
        var sinAprobar = await EscenarioConRevalidacionAsync([10], 5, antiguedad: null, revalidar: null);
        var aprobada = await EscenarioConRevalidacionAsync([10], 5, antiguedad: null, revalidar: null);
        await DejarTipoConLaReglaHeredadaAsync(sinAprobar, 30);
        await DejarTipoConLaReglaHeredadaAsync(aprobada, 30);
        var documentoSinAprobar = await SubirCertificadoAsync(sinAprobar, 3);
        var documentoAprobado = await SubirCertificadoAsync(aprobada, 3);
        await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoSinAprobar);
        await AprobarAsync(aprobada, diasAtras: 10);
        // El expediente ya la muestra al aprobar; se espera a que la bóveda la registre, para que la vigencia heredada que se deja después sí sea la última.
        await EsperarUltimaVigenciaAsync(documentoAprobado, v => v.Base == BaseVigencia.Aprobacion && v.VigenteHasta == Hoy().AddDays(20));

        // Como estaban en la base antes de TD-10: la vigencia contaba desde la carga (hoy + 30), con o sin aprobación.
        var heredada = Hoy().AddDays(30);
        await DejarLaVigenciaHeredadaAsync(sinAprobar, documentoSinAprobar, heredada);
        await DejarLaVigenciaHeredadaAsync(aprobada, documentoAprobado, heredada);
        // Lo registrado en cada documento es la vigencia heredada (la de la aprobada no se ve en el expediente: ya lo calcula con la aprobación).
        foreach (var documentoId in new[] { documentoSinAprobar, documentoAprobado })
            (await EventosAsync(documentoId)).OfType<VigenciaDeVersionCalculada>().Last().ShouldSatisfyAllConditions(v => v.Base.ShouldBe(BaseVigencia.FechaCarga), v => v.VigenteHasta.ShouldBe(heredada));
        (await VigenciaParaLaEmpresaAsync(sinAprobar)).VigenteHasta.ShouldBe(heredada);
        return (sinAprobar, documentoSinAprobar, aprobada, documentoAprobado);
    }

    /// <summary>Espera a que lo último registrado en el stream del documento sea una vigencia que cumple la condición (la heredada que se dejó antes no cuenta).</summary>
    private async Task EsperarUltimaVigenciaAsync(Guid documentoId, Func<VigenciaDeVersionCalculada, bool> condicion)
    {
        var limite = DateTime.UtcNow.AddSeconds(30);
        while (true)
        {
            if ((await EventosAsync(documentoId)).OfType<VigenciaDeVersionCalculada>().LastOrDefault() is { } ultima && condicion(ultima))
                return;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"El documento {documentoId} no recalculó su vigencia heredada.");
            await Task.Delay(200);
        }
    }

    private async Task AfirmarVigenciasRecalculadasAsync(EscenarioFormulario sinAprobar, Guid documentoSinAprobar, EscenarioFormulario aprobada, Guid documentoAprobado)
    {
        var hoy = Hoy();
        // Lo registrado en la bóveda se recalcula: el último evento de cada documento deja de ser la vigencia heredada.
        await EsperarUltimaVigenciaAsync(documentoAprobado, v => v.Base == BaseVigencia.Aprobacion && v.VigenteHasta == hoy.AddDays(20));
        await EsperarUltimaVigenciaAsync(documentoSinAprobar, v => v.Base == BaseVigencia.SinVencimiento && v.VigenteHasta is null && v.RevalidarCadaDias == 30);

        // La aprobada cuenta desde su aprobación (hace 10 días): hoy + 20, base «Aprobacion».
        var recalculada = await VigenciaParaLaEmpresaAsync(aprobada, v => v.VigenteHasta == hoy.AddDays(20));
        (recalculada.Base, recalculada.RevalidarCadaDias).ShouldBe(("Aprobacion", 30));
        recalculada.AprobadaEn.ShouldNotBeNull();

        // La que nadie aprobó vuelve a no tener fecha («Vence 30 días después de que la empresa lo apruebe»): ya no cuenta desde la carga.
        var porAprobar = (await EsperarAsync(sinAprobar.Empresa, sinAprobar.Expediente.Id, x => x.Requisitos!.Single().VersionActual?.Vigencia is { VigenteHasta: null })).Requisitos!.Single()
            .VersionActual!.Vigencia!;
        (porAprobar.Base, porAprobar.Estado, porAprobar.RevalidarCadaDias, porAprobar.AprobadaEn).ShouldBe(("SinVencimiento", "SinVencimiento", 30, null));

        // Y en el stream, lo último de cada documento es el recálculo (la vigencia heredada quedó superada).
        (await EventosAsync(documentoSinAprobar)).OfType<VigenciaDeVersionCalculada>().Last().ShouldSatisfyAllConditions(
            v => v.Base.ShouldBe(BaseVigencia.SinVencimiento), v => v.VigenteHasta.ShouldBeNull(), v => v.RevalidarCadaDias.ShouldBe(30));
        (await EventosAsync(documentoAprobado)).OfType<VigenciaDeVersionCalculada>().Last().ShouldSatisfyAllConditions(
            v => v.Base.ShouldBe(BaseVigencia.Aprobacion), v => v.VigenteHasta.ShouldBe(hoy.AddDays(20)));
    }

    [Fact]
    public async Task La_migracion_recalcula_las_vigencias_de_los_documentos_de_cada_tipo_que_migra_y_no_solo_las_del_primero()
    {
        var (sinAprobar, documentoSinAprobar, aprobada, documentoAprobado) = await DosEmpresasConVigenciaHeredadaAsync();

        // Dos tipos (de dos tenants) traen la regla heredada: la migración reescribe los dos y pide recalcular los documentos de cada uno, en su propia transacción.
        (await MigrarFrescuraAsync()).Migrados.ShouldBeGreaterThanOrEqualTo(2);

        await AfirmarVigenciasRecalculadasAsync(sinAprobar, documentoSinAprobar, aprobada, documentoAprobado);
    }

    [Fact]
    public async Task El_arranque_repara_las_vigencias_con_base_heredada_aunque_la_migracion_ya_hubiera_corrido_y_es_idempotente()
    {
        var (sinAprobar, documentoSinAprobar, aprobada, documentoAprobado) = await DosEmpresasConVigenciaHeredadaAsync();
        var almacen = Host.Services.GetRequiredService<IDocumentStore>();

        // La migración corre bien: tipos reescritos y vigencias recalculadas.
        await MigrarFrescuraAsync();
        await AfirmarVigenciasRecalculadasAsync(sinAprobar, documentoSinAprobar, aprobada, documentoAprobado);

        // Pero en otro entorno el recálculo se perdió y quedó la marca de «ya corrió»: las vigencias siguen con la base heredada.
        await DejarLaVigenciaHeredadaAsync(sinAprobar, documentoSinAprobar, Hoy().AddDays(30));
        await DejarLaVigenciaHeredadaAsync(aprobada, documentoAprobado, Hoy().AddDays(30));
        await using (var consulta = almacen.QuerySession(TenantsTecnicos.Boveda))
        {
            var heredados = await ReparacionDeVigenciasHeredadas.DocumentosConVigenciaHeredadaAsync(consulta, CancellationToken.None);
            heredados.ShouldContain(documentoSinAprobar);
            heredados.ShouldContain(documentoAprobado);
        }

        // El arranque las detecta por su base y pide recalcularlas, sin mirar la marca.
        using (var alcance = Host.Services.CreateScope())
            (await ReparacionDeVigenciasHeredadas.PedirAsync(alcance.ServiceProvider.GetRequiredService<ISesiones>(), alcance.ServiceProvider.GetRequiredService<Wolverine.IMessageBus>(),
                CancellationToken.None)).ShouldBeGreaterThanOrEqualTo(2);
        await AfirmarVigenciasRecalculadasAsync(sinAprobar, documentoSinAprobar, aprobada, documentoAprobado);

        // Idempotente: ya recalculadas, no vuelven a salir ni se agregan eventos si se vuelve a calcular.
        await using (var consulta = almacen.QuerySession(TenantsTecnicos.Boveda))
        {
            var heredados = await ReparacionDeVigenciasHeredadas.DocumentosConVigenciaHeredadaAsync(consulta, CancellationToken.None);
            heredados.ShouldNotContain(documentoSinAprobar);
            heredados.ShouldNotContain(documentoAprobado);
        }

        var eventos = (await EventosAsync(documentoAprobado)).OfType<VigenciaDeVersionCalculada>().Count();
        await ProcesarAsync(new CalcularVigenciasDelDocumento(documentoAprobado));
        (await EventosAsync(documentoAprobado)).OfType<VigenciaDeVersionCalculada>().Count().ShouldBe(eventos);
    }

    [Fact]
    public async Task El_barrido_de_aprobaciones_pide_el_recalculo_de_los_documentos_de_todos_los_tenants_con_marcas_y_no_solo_los_del_primero()
    {
        var (sinAprobar, documentoSinAprobar, aprobada, documentoAprobado) = await DosEmpresasConVigenciaHeredadaAsync();
        var almacen = Host.Services.GetRequiredService<IDocumentStore>();

        // Dos expedientes de dos tenants con la aprobación recién cambiada: cada uno dejó su marca en su tenant, en una sola pasada del barrido.
        foreach (var (e, documentoId) in new[] { (sinAprobar, documentoSinAprobar), (aprobada, documentoAprobado) })
        {
            await using var sesion = almacen.LightweightSession(e.Empresa.Datos.TenantId.ToString("N"));
            AprobacionesDeDocumentos.MarcarRecalculos(sesion, [documentoId], DateTimeOffset.UtcNow);
            await sesion.SaveChangesAsync();
        }

        using (var alcance = Host.Services.CreateScope())
            await RevisarRecalculosDeVigenciaHandler.RevisarAsync(new RevisarRecalculosDeVigencia(), almacen, alcance.ServiceProvider.GetRequiredService<ISesiones>(),
                Host.Services.GetRequiredService<IWolverineRuntime>(), CancellationToken.None);

        await AfirmarVigenciasRecalculadasAsync(sinAprobar, documentoSinAprobar, aprobada, documentoAprobado);
        await using var pendientes = almacen.QuerySession();
        (await pendientes.Query<RecalculoDeVigenciaPendiente>().Where(r => r.AnyTenant() && (r.Id == documentoSinAprobar || r.Id == documentoAprobado)).CountAsync()).ShouldBe(0);
    }
}
