using System.Collections.Concurrent;
using System.Text.Json;
using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Ia;
using Validalo.Aplicacion.Interesado;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ia;
using Wolverine;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// Analizador falso de las pruebas (nunca se llama a OpenAI). Responde según la llave de la empresa que paga: con
/// <c>-falla-</c> lanza la falla controlada de un HTTP 500; con <c>-baja-</c> el modelo por defecto devuelve confianza baja
/// (y el de escalamiento, alta); si no, hechos de un RUT con confianza alta. Si el archivo trae marcas <c>[[clave=valor]]</c>,
/// responde esos campos (como el analizador simulado de la API, F5). Cuenta las llamadas por llave.
/// </summary>
public sealed class AnalizadorFalso : IAnalizadorDeDocumentos
{
    public const string NitExtraido = "900123456";

    private readonly ConcurrentQueue<(string Llave, SolicitudDeAnalisis Solicitud)> _llamadas = new();

    public IReadOnlyList<SolicitudDeAnalisis> LlamadasCon(string llave) => [.. _llamadas.Where(l => l.Llave == llave).Select(l => l.Solicitud)];

    /// <summary>Con una llave <c>-lenta-</c> el análisis espera a que se complete (un OpenAI que tarda); las demás llaves responden de una vez.</summary>
    public TaskCompletionSource? Retencion { get; set; }

    public async Task<ResultadoDeAnalisis> AnalizarAsync(SolicitudDeAnalisis solicitud, string apiKey, CancellationToken ct)
    {
        _llamadas.Enqueue((apiKey, solicitud));
        if (apiKey.Contains("-lenta-", StringComparison.Ordinal) && Retencion is { } retencion)
            await retencion.Task.WaitAsync(ct);
        if (apiKey.Contains("-falla-", StringComparison.Ordinal))
            throw new AnalisisDeIaException("http-500", "OpenAI respondió 500.");
        // La respuesta llegó incompleta: no sirve, pero OpenAI la facturó con sus tokens (OC-6).
        if (apiKey.Contains("-incompleta-", StringComparison.Ordinal))
            throw new AnalisisDeIaException("respuesta-incompleta", "OpenAI no completó la respuesta.", uso: new UsoDeTokens(1000, 200, 300));

        var confianza = apiKey.Contains("-baja-", StringComparison.Ordinal) && solicitud.Modelo == PlanDeIaEmpresa.ModeloPorDefectoInicial ? 0.5m : 0.97m;
        // F5: un archivo con marcas [[clave=valor]] responde lo que dicen (el mismo lector del analizador simulado).
        if (Validalo.Infraestructura.IA.AnalizadorSimulado.Marcas(solicitud.Contenido).Count > 0)
        {
            var simulados = Validalo.Infraestructura.IA.AnalizadorSimulado.Hechos(EsquemasDeAnalisis.Para(solicitud.TipoCanonico)!, solicitud.Contenido);
            return new ResultadoDeAnalisis(solicitud.Modelo, simulados with { Confianza = confianza }, new UsoDeTokens(1000, 200, 300),
                solicitud.Paginas, 0);
        }

        var campos = new Dictionary<string, JsonElement>
        {
            ["nit"] = JsonSerializer.SerializeToElement(NitExtraido),
            ["razonSocial"] = JsonSerializer.SerializeToElement("Aceros del Norte S.A.S.")
        };
        return new ResultadoDeAnalisis(solicitud.Modelo, new HechosExtraidos(solicitud.TipoCanonico, true, confianza, [], null, campos),
            new UsoDeTokens(1000, 200, 300), solicitud.Paginas, 0);
    }

    /// <summary>«Probar llave» sin red (PT-6): con <c>-rechazada-</c> es inválida; si no, válida. Cuenta las pruebas por llave.</summary>
    public Task<ResultadoDePruebaDeLlave> ProbarLlaveAsync(string apiKey, CancellationToken ct)
    {
        _pruebas.Enqueue(apiKey);
        return Task.FromResult(apiKey.Contains("-rechazada-", StringComparison.Ordinal)
            ? new ResultadoDePruebaDeLlave(ResultadoDePruebaDeLlave.Invalida, "Rechazada (falso).")
            : new ResultadoDePruebaDeLlave(ResultadoDePruebaDeLlave.Valida, "Aceptada (falso)."));
    }

    private readonly ConcurrentQueue<string> _pruebas = new();

    public int PruebasCon(string llave) => _pruebas.Count(p => p == llave);
}

[Collection(Colecciones.Api4)]
[Trait("Requiere", "Docker")]
public sealed class RequisitosIaApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    // ---------- IA con OpenAI y cupo por empresa (ADR-0012) ----------

    /// <summary>Costo de una llamada del falso con gpt-6-luna: (800 × 0,10 + 200 × 0,01 + 300 × 0,50) / 1M.</summary>
    private const decimal CostoLuna = 0.000232m;

    [Fact]
    public async Task Con_plan_el_RUT_se_analiza_una_vez_y_cada_empresa_del_tenant_que_lo_recibe_consume_una_validacion()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var sur = await OtraEmpresaDelTenantAsync(norte, "Sur S.A.S.", "SUR", "899999068");
        var llave = LlaveIa();
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: llave));
        await PlanIaAsync(sur, new ActualizarPlanIaEmpresaDto(10, false)); // sin llave: recibe el análisis pero no paga llamadas
        var (vinculos, sesion) = await TerceroConEmpresasAsync(norte, sur);
        var (vinculoNorte, vinculoSur) = (vinculos[0], vinculos[1]);

        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT"));
        rut.Version.Hechos!.ConIa.ShouldBeFalse(); // el tercero nunca ve el análisis
        await AceptarAsync(sesion, vinculoNorte.Id);

        var deNorte = await EsperarVersionAsync(norte, vinculoNorte.Id, "RUT", 1, v => v.Hechos!.ConIa);
        deNorte.Hechos!.PendienteRevisionHumana.ShouldBeFalse();
        var ia = deNorte.Hechos.Ia.ShouldNotBeNull();
        ia.Modelo.ShouldBe("gpt-6-luna");
        ia.Escalado.ShouldBeFalse();
        ia.TipoDetectado.ShouldBe("RUT");
        ia.Confianza.ShouldBe(0.97m);
        ia.Campos["nit"].GetString().ShouldBe(AnalizadorFalso.NitExtraido);

        await AceptarAsync(sesion, vinculoSur.Id);
        var deSur = await EsperarVersionAsync(sur, vinculoSur.Id, "RUT", 1, v => v.Hechos!.ConIa);
        deSur.Hechos!.Ia!.Campos["nit"].GetString().ShouldBe(AnalizadorFalso.NitExtraido);

        // Una sola llamada a OpenAI, con la llave de Norte; cada empresa consumió una validación incluida.
        Fixture.Analizador.LlamadasCon(llave).ShouldHaveSingleItem().TipoCanonico.ShouldBe("RUT");
        var usoNorte = await UsoIaAsync(norte);
        (usoNorte.IncluidasConsumidas, usoNorte.AdicionalesConsumidas, usoNorte.IncluidasRestantes, usoNorte.AnalisisPagados).ShouldBe((1, 0, 9, 1));
        (usoNorte.TokensEntrada, usoNorte.TokensEntradaEnCache, usoNorte.TokensSalida, usoNorte.CostoUsd).ShouldBe((1000L, 200L, 300L, CostoLuna));
        var dia = usoNorte.PorDia.ShouldHaveSingleItem();
        (dia.Incluidas, dia.AnalisisPagados, dia.CostoUsd).ShouldBe((1, 1, CostoLuna));
        usoNorte.Plan.LlaveConfigurada.ShouldBeTrue();

        // Costo y tokens solo en la empresa que pagó la llamada.
        var usoSur = await UsoIaAsync(sur);
        (usoSur.IncluidasConsumidas, usoSur.AnalisisPagados, usoSur.TokensEntrada, usoSur.CostoUsd).ShouldBe((1, 0, 0L, 0m));
        usoSur.Plan.LlaveConfigurada.ShouldBeFalse();

        // IA-15: Norte pagó la llamada con su llave (lo suyo es real, nada reutilizado); a Sur, que reutilizó el análisis, se le atribuye el costo y los tokens de ese
        // análisis aparte de lo real, y su día también.
        (usoNorte.ValidacionesReutilizadas, usoNorte.TokensEntradaReutilizados, usoNorte.CostoReutilizadoUsd).ShouldBe((0, 0L, 0m));
        (usoSur.ValidacionesReutilizadas, usoSur.TokensEntradaReutilizados, usoSur.TokensEntradaEnCacheReutilizados, usoSur.TokensSalidaReutilizados, usoSur.CostoReutilizadoUsd)
            .ShouldBe((1, 1000L, 200L, 300L, CostoLuna));
        var diaSur = usoSur.PorDia.ShouldHaveSingleItem();
        (diaSur.Reutilizadas, diaSur.TokensEntradaReutilizados, diaSur.TokensSalidaReutilizados, diaSur.CostoReutilizadoUsd, diaSur.CostoUsd).ShouldBe((1, 1000L, 300L, CostoLuna, 0m));

        // La consola de Plataforma sigue mostrando el costo REAL, sin doble conteo: lo reutilizado de Sur es informativo y no se suma al costo real del total.
        var consumo = await ApiAsync<ConsumoDeIaDto>("GET", $"/api/v1/plataforma/ia/consumo?periodo={usoNorte.Mes}&grupoId={norte.Datos.TenantId}", Plataforma(), null, 200);
        consumo.Totales.CostoUsd.ShouldBe(CostoLuna);
        (consumo.Totales.ValidacionesReutilizadas, consumo.Totales.CostoReutilizadoUsd).ShouldBe((1, CostoLuna));
        var filas = consumo.Grupos.Single().Empresas.ToDictionary(e => e.EmpresaId);
        (filas[norte.Datos.Id].CostoUsd, filas[norte.Datos.Id].ValidacionesReutilizadas, filas[norte.Datos.Id].CostoReutilizadoUsd).ShouldBe((CostoLuna, 0, 0m));
        (filas[sur.Datos.Id].CostoUsd, filas[sur.Datos.Id].ValidacionesReutilizadas, filas[sur.Datos.Id].CostoReutilizadoUsd).ShouldBe((0m, 1, CostoLuna));

        // Repetir el mensaje no vuelve a llamar ni a cobrar (idempotente), ni a atribuir dos veces el costo.
        await AsentarIaAsync(rut.Version.DocumentoId, 1);
        Fixture.Analizador.LlamadasCon(llave).Count.ShouldBe(1);
        var repetido = await UsoIaAsync(sur);
        (repetido.IncluidasConsumidas, repetido.ValidacionesReutilizadas, repetido.CostoReutilizadoUsd).ShouldBe((1, 1, CostoLuna));
    }

    [Fact]
    public async Task Lo_reutilizado_atribuye_el_costo_completo_del_analisis_con_el_escalamiento_solo_a_quien_lo_recibe_y_queda_en_su_validacion()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var sur = await OtraEmpresaDelTenantAsync(norte, "Sur S.A.S.", "SUR", "899999068");
        var sinCupo = await OtraEmpresaDelTenantAsync(norte, "Oriente S.A.S.", "ORIENTE", "860001022");
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa("baja"))); // cada análisis escala a un segundo modelo
        await PlanIaAsync(sur, new ActualizarPlanIaEmpresaDto(10, false));
        await PlanIaAsync(sinCupo, new ActualizarPlanIaEmpresaDto(0, false)); // sin incluidas ni adicional: IA-4, no recibe el análisis
        var (vinculos, sesion) = await TerceroConEmpresasAsync(norte, sur, sinCupo);

        // Una empresa tras otra: cada una recibe el análisis ya hecho por la anterior (Norte paga la llamada; Sur lo reutiliza; Oriente no tiene cupo).
        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await AceptarAsync(sesion, vinculos[0].Id);
        await EsperarVersionAsync(norte, vinculos[0].Id, "RUT", 1, v => v.Hechos!.ConIa);
        await AceptarAsync(sesion, vinculos[1].Id);
        await EsperarVersionAsync(sur, vinculos[1].Id, "RUT", 1, v => v.Hechos!.ConIa);
        await AceptarAsync(sesion, vinculos[2].Id);
        await AsentarIaAsync(rut.Version.DocumentoId, 1);

        // Terra: (800 × 1 + 200 × 0,05 + 300 × 5) / 1M; el costo del análisis suma la llamada y su escalamiento.
        var costo = CostoLuna + 0.00231m;
        var usoNorte = await UsoIaAsync(norte);
        (usoNorte.CostoUsd, usoNorte.TokensEntrada, usoNorte.ValidacionesReutilizadas, usoNorte.CostoReutilizadoUsd).ShouldBe((costo, 2000L, 0, 0m));
        var usoSur = await UsoIaAsync(sur);
        (usoSur.IncluidasConsumidas, usoSur.CostoUsd, usoSur.TokensEntrada).ShouldBe((1, 0m, 0L)); // nada pagado con su llave
        (usoSur.ValidacionesReutilizadas, usoSur.TokensEntradaReutilizados, usoSur.TokensEntradaEnCacheReutilizados, usoSur.TokensSalidaReutilizados, usoSur.CostoReutilizadoUsd)
            .ShouldBe((1, 2000L, 400L, 600L, costo));

        // Sin cupo no recibe el análisis ni se le atribuye nada (IA-4).
        var usoSinCupo = await UsoIaAsync(sinCupo);
        (usoSinCupo.IncluidasConsumidas, usoSinCupo.ValidacionesReutilizadas, usoSinCupo.TokensEntradaReutilizados, usoSinCupo.CostoReutilizadoUsd).ShouldBe((0, 0, 0L, 0m));
        (await EsperarVersionAsync(sinCupo, vinculos[2].Id, "RUT", 1, _ => true)).Hechos!.ConIa.ShouldBeFalse();

        // La validación guarda lo suyo: la de Norte pagó la llamada (nada atribuido) y la de Sur es reutilizada con el costo del análisis.
        var tenant = norte.Datos.TenantId.ToString("N");
        var deNorte = (await CargarAsync<ValidacionIaConsumida>(ValidacionIaConsumida.Clave(norte.Datos.Id, rut.Version.DocumentoId, 1), tenant))!;
        (deNorte.PagoLaLlamada, deNorte.CostoAtribuido, deNorte.CostoAtribuidoUsd).ShouldBe((true, false, 0m));
        var deSur = (await CargarAsync<ValidacionIaConsumida>(ValidacionIaConsumida.Clave(sur.Datos.Id, rut.Version.DocumentoId, 1), tenant))!;
        (deSur.PagoLaLlamada, deSur.CostoAtribuido, deSur.Atribuido).ShouldBe((false, true, new CostoDeAnalisis(2000, 400, 600, costo)));
        (await CargarAsync<ValidacionIaConsumida>(ValidacionIaConsumida.Clave(sinCupo.Datos.Id, rut.Version.DocumentoId, 1), tenant)).ShouldBeNull();

        // La consola cuenta el real una sola vez (el de Norte) y el reutilizado queda aparte, como dato informativo.
        var consumo = await ApiAsync<ConsumoDeIaDto>("GET", $"/api/v1/plataforma/ia/consumo?periodo={usoNorte.Mes}&grupoId={norte.Datos.TenantId}", Plataforma(), null, 200);
        var grupo = consumo.Grupos.ShouldHaveSingleItem();
        (grupo.CostoUsd, grupo.ValidacionesReutilizadas, grupo.CostoReutilizadoUsd).ShouldBe((costo, 1, costo));
        (consumo.Totales.CostoUsd, consumo.Totales.CostoReutilizadoUsd).ShouldBe((costo, costo));
    }

    [Fact]
    public async Task El_recalculo_del_historico_atribuye_el_costo_a_las_reutilizadas_sin_atribuir_y_repetirlo_no_cambia_nada()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var sur = await OtraEmpresaDelTenantAsync(norte, "Sur S.A.S.", "SUR", "899999068");
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa()));
        await PlanIaAsync(sur, new ActualizarPlanIaEmpresaDto(10, false));
        var (vinculos, sesion) = await TerceroConEmpresasAsync(norte, sur);
        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await AceptarAsync(sesion, vinculos[0].Id);
        await EsperarVersionAsync(norte, vinculos[0].Id, "RUT", 1, v => v.Hechos!.ConIa); // Norte paga la llamada antes de que Sur reciba el análisis
        await AceptarAsync(sesion, vinculos[1].Id);
        await EsperarVersionAsync(sur, vinculos[1].Id, "RUT", 1, v => v.Hechos!.ConIa);
        await AsentarIaAsync(rut.Version.DocumentoId, 1);
        var antes = await UsoIaAsync(sur);
        antes.CostoReutilizadoUsd.ShouldBe(CostoLuna);

        // Un histórico de antes de IA-15: la validación reutilizada sin costo atribuido y el uso sin lo reutilizado (lo real y el cupo ya estaban). Otra reutilizada cuyo
        // análisis no existe (nunca se registró) queda contada con costo cero.
        var tenant = norte.Datos.TenantId.ToString("N");
        var idSur = ValidacionIaConsumida.Clave(sur.Datos.Id, rut.Version.DocumentoId, 1);
        await using (var sesionTenant = Host.Services.GetRequiredService<IDocumentStore>().LightweightSession(tenant))
        {
            var validacion = (await sesionTenant.LoadAsync<ValidacionIaConsumida>(idSur))!;
            validacion.CostoAtribuido = false;
            validacion.TokensEntradaAtribuidos = validacion.TokensEntradaEnCacheAtribuidos = validacion.TokensSalidaAtribuidos = 0;
            validacion.CostoAtribuidoUsd = 0m;
            sesionTenant.Store(validacion);
            sesionTenant.Insert(new ValidacionIaConsumida
            {
                Id = ValidacionIaConsumida.Clave(sur.Datos.Id, Guid.NewGuid(), 1),
                EmpresaId = sur.Datos.Id,
                DocumentoId = Guid.NewGuid(),
                Numero = 1,
                Mes = antes.Mes,
                Tipo = TipoValidacionIa.Incluida,
                PagoLaLlamada = false,
                Fecha = validacion.Fecha
            });
            var uso = (await sesionTenant.LoadAsync<UsoMensualIa>(UsoMensualIa.Clave(sur.Datos.Id, antes.Mes)))!;
            uso.ReconstruirReutilizado([]);
            sesionTenant.Store(uso);
            await sesionTenant.SaveChangesAsync();
        }

        (await UsoIaAsync(sur)).CostoReutilizadoUsd.ShouldBe(0m);

        var primera = await RecalcularReutilizadoAsync();

        primera.ConError.ShouldBe(0);
        primera.SinAnalisis.ShouldBeGreaterThanOrEqualTo(1);
        primera.UsosActualizados.ShouldBeGreaterThanOrEqualTo(1);
        var despues = await UsoIaAsync(sur);
        // La validación recuperó el costo del análisis original, la huérfana cuenta con costo cero y lo real no se movió.
        (despues.ValidacionesReutilizadas, despues.TokensEntradaReutilizados, despues.TokensEntradaEnCacheReutilizados, despues.TokensSalidaReutilizados, despues.CostoReutilizadoUsd)
            .ShouldBe((2, 1000L, 200L, 300L, CostoLuna));
        (despues.IncluidasConsumidas, despues.AnalisisPagados, despues.CostoUsd).ShouldBe((antes.IncluidasConsumidas, 0, 0m));
        var deSur = (await CargarAsync<ValidacionIaConsumida>(idSur, tenant))!;
        (deSur.CostoAtribuido, deSur.Atribuido).ShouldBe((true, new CostoDeAnalisis(1000, 200, 300, CostoLuna)));
        // Lo de Norte (la que pagó) no se toca.
        (await UsoIaAsync(norte)).ShouldSatisfyAllConditions(u => u.CostoUsd.ShouldBe(CostoLuna), u => u.ValidacionesReutilizadas.ShouldBe(0));

        // Repetirlo no cambia nada: lo atribuido ya no se vuelve a buscar y los acumulados quedan igual.
        var segunda = await RecalcularReutilizadoAsync();
        (segunda.ConError, segunda.Atribuidas, segunda.UsosActualizados).ShouldBe((0, 0, 0));
        var repetido = await UsoIaAsync(sur);
        (repetido.ValidacionesReutilizadas, repetido.CostoReutilizadoUsd).ShouldBe((2, CostoLuna));
    }

    [Fact]
    public async Task Pedir_el_recalculo_al_bus_lo_ejecuta_y_deja_su_marca_para_no_repetirlo_al_arrancar()
    {
        using (var alcance = Host.Services.CreateScope())
            await alcance.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(new RecalcularReutilizadoDeIa());

        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession();
        (await RecalculoDeReutilizadoDeIa.YaCorrioAsync(consulta, CancellationToken.None)).ShouldBeTrue();
        (await consulta.LoadAsync<MigracionDeDatosEjecutada>(RecalculoDeReutilizadoDeIa.Nombre))!.Resumen.ShouldContain("validaciones reutilizadas revisadas");
    }

    private async Task<ResultadoDeRecalculoDeReutilizado> RecalcularReutilizadoAsync()
    {
        using var alcance = Host.Services.CreateScope();
        return await RecalculoDeReutilizadoDeIa.EjecutarAsync(alcance.ServiceProvider.GetRequiredService<ISesiones>(), Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance,
            CancellationToken.None);
    }

    [Fact]
    public async Task Sin_plan_o_sin_cupo_ni_adicional_la_empresa_no_ve_los_hechos_de_IA_y_no_consume()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var sur = await OtraEmpresaDelTenantAsync(norte, "Sur S.A.S.", "SUR", "899999068");
        var oriente = await OtraEmpresaDelTenantAsync(norte, "Oriente S.A.S.", "ORIENTE", "860001022");
        var llave = LlaveIa();
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(5, false, ApiKeyOpenAi: llave));
        await PlanIaAsync(sur, new ActualizarPlanIaEmpresaDto(0, false, ApiKeyOpenAi: LlaveIa())); // con llave pero sin cupo
        var (vinculos, sesion) = await TerceroConEmpresasAsync(norte, sur, oriente);
        var (vinculoNorte, vinculoSur, vinculoOriente) = (vinculos[0], vinculos[1], vinculos[2]);

        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await AceptarAsync(sesion, vinculoSur.Id);
        await AceptarAsync(sesion, vinculoOriente.Id);
        await AceptarAsync(sesion, vinculoNorte.Id);

        await EsperarVersionAsync(norte, vinculoNorte.Id, "RUT", 1, v => v.Hechos!.ConIa);
        await AsentarIaAsync(rut.Version.DocumentoId, 1);

        foreach (var (empresa, vinculo) in new[] { (sur, vinculoSur), (oriente, vinculoOriente) })
        {
            var version = await EsperarVersionAsync(empresa, vinculo.Id, "RUT", 1, _ => true);
            version.Hechos!.ConIa.ShouldBeFalse();
            version.Hechos.Ia.ShouldBeNull();
            version.Hechos.PendienteRevisionHumana.ShouldBeTrue();
            version.Hechos.Comparacion.ShouldBe("SinAnterior");
            var uso = await UsoIaAsync(empresa);
            (uso.IncluidasConsumidas, uso.AdicionalesConsumidas, uso.AnalisisPagados).ShouldBe((0, 0, 0));
            // IA-4: sin cupo no recibe el análisis y por eso tampoco se le atribuye costo, aunque otra empresa ya lo haya pagado.
            (uso.ValidacionesReutilizadas, uso.TokensEntradaReutilizados, uso.CostoReutilizadoUsd).ShouldBe((0, 0L, 0m));
        }

        (await UsoIaAsync(oriente)).Plan.Configurado.ShouldBeFalse();
        Fixture.Analizador.LlamadasCon(llave).Count.ShouldBe(1);
        (await UsoIaAsync(norte)).IncluidasConsumidas.ShouldBe(1);
    }

    [Fact]
    public async Task Agotadas_las_incluidas_se_cobran_adicionales_hasta_el_tope_y_despues_la_version_queda_sin_IA()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var llave = LlaveIa();
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(1, true, TopeAdicionalMes: 1, ApiKeyOpenAi: llave));
        await FlujoConAsync(norte, "CLIENTE",
        [
            new RequisitoDelFlujoDto(TipoDocumento: "RUT"), new RequisitoDelFlujoDto(TipoDocumento: "CAMARA_COMERCIO"),
            new RequisitoDelFlujoDto(TipoDocumento: "CERTIFICACION_BANCARIA")
        ]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);

        await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await EsperarVersionAsync(norte, vinculo.Id, "RUT", 1, v => v.Hechos!.ConIa);
        await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara"));
        await EsperarVersionAsync(norte, vinculo.Id, "CAMARA_COMERCIO", 1, v => v.Hechos!.ConIa);
        var certificacion = await SubirAsync(sesion, "CERTIFICACION_BANCARIA", Pdf("Certificación"));
        await AsentarIaAsync(certificacion.Version.DocumentoId, 1);

        (await EsperarVersionAsync(norte, vinculo.Id, "CERTIFICACION_BANCARIA", 1, _ => true)).Hechos!.ConIa.ShouldBeFalse();
        Fixture.Analizador.LlamadasCon(llave).Select(s => s.TipoCanonico).ShouldBe(["RUT", "CAMARA_COMERCIO"]);
        var uso = await UsoIaAsync(norte);
        (uso.IncluidasConsumidas, uso.AdicionalesConsumidas, uso.IncluidasRestantes, uso.AdicionalesRestantes, uso.AnalisisPagados)
            .ShouldBe((1, 1, 0, (int?)0, 2));
        uso.CostoUsd.ShouldBe(2 * CostoLuna);
    }

    [Fact]
    public async Task Con_confianza_baja_se_escala_al_otro_modelo_suma_ambos_costos_y_la_version_nueva_se_compara_sin_otra_llamada()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var llave = LlaveIa("baja");
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: llave));
        await FlujoConAsync(norte, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);

        await SubirAsync(sesion, "RUT", Pdf("RUT v1"));
        var v1 = await EsperarVersionAsync(norte, vinculo.Id, "RUT", 1, v => v.Hechos!.ConIa);
        v1.Hechos!.Ia!.Escalado.ShouldBeTrue();
        v1.Hechos.Ia.Modelo.ShouldBe("gpt-6.1-terra");
        v1.Hechos.Ia.Confianza.ShouldBe(0.97m);
        v1.Hechos.PendienteRevisionHumana.ShouldBeFalse();
        Fixture.Analizador.LlamadasCon(llave).Select(s => s.Modelo).ShouldBe(["gpt-6-luna", "gpt-6.1-terra"]);
        // Terra: (800 × 1 + 200 × 0,05 + 300 × 5) / 1M; el uso suma las dos llamadas y cuenta un solo análisis.
        var uso = await UsoIaAsync(norte);
        (uso.AnalisisPagados, uso.IncluidasConsumidas, uso.TokensEntrada, uso.CostoUsd).ShouldBe((1, 1, 2000L, CostoLuna + 0.00231m));

        await SubirAsync(sesion, "RUT", Pdf("RUT v2"));
        var v2 = await EsperarVersionAsync(norte, vinculo.Id, "RUT", 2, v => v.Hechos!.ConIa);
        v2.Hechos!.Comparacion.ShouldBe("SinCambios");
        v2.Hechos.CamposCambiados.ShouldBeEmpty();
        (await UsoIaAsync(norte)).IncluidasConsumidas.ShouldBe(2);
    }

    [Fact]
    public async Task Si_el_analizador_falla_la_version_queda_sin_IA_para_revision_humana_y_no_se_cobra_la_validacion()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var llave = LlaveIa("falla");
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: llave));
        await FlujoConAsync(norte, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);

        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT"));
        var documentoId = rut.Version.DocumentoId;
        await EsperarAsync(async () => (await DocumentoDeBovedaAsync(documentoId))?.VersionRequerida(1).FalloIa is not null, "el fallo de IA");
        // La validación se consumió antes de llamar y se devuelve al fallar.
        await EsperarAsync(async () => (await UsoIaAsync(norte)).IncluidasConsumidas == 0, "la devolución de la validación");

        Fixture.Analizador.LlamadasCon(llave).Count.ShouldBe(1);
        var fallo = (await EventosDeBovedaAsync(documentoId)).OfType<AnalisisDeIaFallido>().ShouldHaveSingleItem();
        fallo.Motivo.ShouldBe("http-500");
        fallo.EmpresaQuePago.ShouldBe(norte.Datos.Id);
        var version = await EsperarVersionAsync(norte, vinculo.Id, "RUT", 1, _ => true);
        version.Hechos!.ConIa.ShouldBeFalse();
        version.Hechos.PendienteRevisionHumana.ShouldBeTrue();
        var uso = await UsoIaAsync(norte);
        (uso.AnalisisPagados, uso.CostoUsd).ShouldBe((0, 0m));

        // Fail-closed: no se reintenta (ni consume) aunque el mensaje se repita.
        await AsentarIaAsync(documentoId, 1);
        Fixture.Analizador.LlamadasCon(llave).Count.ShouldBe(1);
        (await UsoIaAsync(norte)).IncluidasConsumidas.ShouldBe(0);
    }

    [Fact]
    public async Task Si_la_respuesta_sale_incompleta_se_registra_su_consumo_aunque_no_haya_analisis_y_no_se_cobra_la_validacion()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var llave = LlaveIa("incompleta");
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: llave));
        await FlujoConAsync(norte, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);

        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT"));
        var documentoId = rut.Version.DocumentoId;
        await EsperarAsync(async () => (await DocumentoDeBovedaAsync(documentoId))?.VersionRequerida(1).FalloIa is not null, "el fallo de IA");
        await EsperarAsync(async () => (await UsoIaAsync(norte)).TokensEntrada > 0, "el consumo de la respuesta incompleta");

        (await EventosDeBovedaAsync(documentoId)).OfType<AnalisisDeIaFallido>().ShouldHaveSingleItem().Motivo.ShouldBe("respuesta-incompleta");
        // La llamada se facturó: tokens y costo quedan en el uso de la empresa; el análisis no existe y la validación se devolvió.
        var uso = await UsoIaAsync(norte);
        (uso.AnalisisPagados, uso.IncluidasConsumidas, uso.TokensEntrada, uso.CostoUsd).ShouldBe((0, 0, 1000L, CostoLuna));
        Fixture.Analizador.LlamadasCon(llave).Count.ShouldBe(1);
    }

    /// <summary>
    /// El análisis de una empresa se queda esperando a OpenAI: su carril de la cola de IA queda ocupado, pero los demás tenants se analizan sin
    /// esperarla (con la cola secuencial de antes, todos esperaban). Cuatro tenants «sanos»: con 5 carriles, que los cuatro compartan el del lento
    /// es 1 de cada 625.
    /// </summary>
    [Fact]
    public async Task El_analisis_lento_de_un_tenant_no_frena_el_de_otros_tenants()
    {
        var retencion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        Fixture.Analizador.Retencion = retencion;
        try
        {
            var lenta = await EmpresaConIaAsync("lenta");
            await SubirAsync(lenta.Sesion, "RUT", Pdf("RUT lento"));
            await EsperarAsync(() => Task.FromResult(Fixture.Analizador.LlamadasCon(lenta.Llave).Count == 1), "la llamada lenta a OpenAI");

            var sanas = new List<EmpresaConIa>();
            for (var n = 0; n < 4; n++)
            {
                var sana = await EmpresaConIaAsync("ok");
                await SubirAsync(sana.Sesion, "RUT", Pdf($"RUT sano {n}"));
                sanas.Add(sana);
            }

            // Al menos uno de los otros tenants termina su análisis mientras el lento sigue esperando (nunca lo liberamos antes).
            var terminadas = sanas.Select(s => EsperarVersionAsync(s.Empresa, s.Vinculo.Id, "RUT", 1, v => v.Hechos!.ConIa)).ToList();
            var primera = await Task.WhenAny(terminadas).WaitAsync(TimeSpan.FromSeconds(30));
            (await primera).Hechos!.ConIa.ShouldBeTrue();
            retencion.Task.IsCompleted.ShouldBeFalse();
        }
        finally
        {
            retencion.TrySetResult();
            Fixture.Analizador.Retencion = null;
        }
    }

    private sealed record EmpresaConIa(Empresa Empresa, VinculoDto Vinculo, SesionTerceroDto Sesion, string Llave);

    /// <summary>Una empresa en su propio tenant con plan de IA y llave (el marcador decide cómo responde el analizador falso), con un tercero que ya aceptó.</summary>
    private async Task<EmpresaConIa> EmpresaConIaAsync(string marcador)
    {
        var empresa = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var llave = LlaveIa(marcador);
        await PlanIaAsync(empresa, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: llave));
        await FlujoConAsync(empresa, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(empresa, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        return new EmpresaConIa(empresa, vinculo, sesion, llave);
    }

    [Fact]
    public async Task Al_llegar_al_80_por_ciento_de_las_incluidas_se_avisa_a_los_administradores_de_la_empresa()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var correoAdmin = $"admin.{Guid.NewGuid():N}@norte.co";
        await ApiAsync<UsuarioDto>("POST", "/api/v1/usuarios", new Credencial(norte.Admin),
            new CrearUsuarioDto("Admin Norte", correoAdmin, null, [new RolAsignadoDto("Administrador", norte.Datos.Id)], null), 201);
        var llave = LlaveIa();
        await PlanIaAsync(norte, new ActualizarPlanIaEmpresaDto(5, false, ApiKeyOpenAi: llave));
        await FlujoConAsync(norte, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);

        for (var n = 1; n <= 4; n++)
        {
            await SubirAsync(sesion, "RUT", Pdf($"RUT v{n}"));
            await EsperarVersionAsync(norte, vinculo.Id, "RUT", n, v => v.Hechos!.ConIa);
        }

        var aviso = await Fixture.Correos.EsperarAsync(correoAdmin, m => m.Asunto.Contains("IA", StringComparison.Ordinal));
        aviso.Asunto.ShouldContain("80 %");
        aviso.Texto.ShouldContain("4 de 5");
        Fixture.Correos.Para(correoAdmin).Count(m => m.Asunto.Contains("IA", StringComparison.Ordinal)).ShouldBe(1);
        (await UsoIaAsync(norte)).IncluidasRestantes.ShouldBe(1);
    }

    [Fact]
    public async Task Plataforma_configura_el_plan_y_la_llave_nunca_vuelve_ni_queda_en_la_auditoria()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var otra = await EmpresaNuevaAsync("Otra S.A.S.", "OTRA");
        var llave = LlaveIa("secreta");
        var url = $"/api/v1/plataforma/tenants/{norte.Datos.TenantId}/empresas/{norte.Datos.Id}/plan-ia";
        var plataforma = new Credencial(ApiFixture.ClavePlataforma);

        var inicial = await ApiAsync<PlanIaEmpresaDto>("GET", url, plataforma, null, 200);
        (inicial.Configurado, inicial.Activo, inicial.LlaveConfigurada, inicial.ModeloPorDefecto, inicial.UmbralConfianza)
            .ShouldBe((false, false, false, "gpt-6-luna", 0.85m));

        var creado = await ApiAsync("PUT", url, plataforma, new ActualizarPlanIaEmpresaDto(200, true, 50, llave), 200);
        var texto = await creado.ReadAsTextAsync();
        texto.ShouldNotContain(llave);
        var plan = JsonSerializer.Deserialize<PlanIaEmpresaDto>(texto, JsonSerializerOptions.Web)!;
        (plan.Configurado, plan.LlaveConfigurada, plan.UltimosCuatro, plan.ValidacionesIncluidasMes, plan.TopeAdicionalMes, plan.ModeloEscalamiento)
            .ShouldBe((true, true, llave[^4..], 200, (int?)50, "gpt-6.1-terra"));

        // Nulo conserva la llave; vacío la quita.
        (await ApiAsync<PlanIaEmpresaDto>("PUT", url, plataforma, new ActualizarPlanIaEmpresaDto(300, false, UmbralConfianza: 0.9m), 200))
            .ShouldSatisfyAllConditions(p => p.LlaveConfigurada.ShouldBeTrue(), p => p.ValidacionesIncluidasMes.ShouldBe(300),
                p => p.UmbralConfianza.ShouldBe(0.9m));
        (await (await ApiAsync("GET", url, plataforma, null, 200)).ReadAsTextAsync()).ShouldNotContain(llave);
        (await ApiAsync<PlanIaEmpresaDto>("PUT", url, plataforma, new ActualizarPlanIaEmpresaDto(300, false, ApiKeyOpenAi: ""), 200))
            .LlaveConfigurada.ShouldBeFalse();

        // La empresa ve su plan y su uso sin la llave; la auditoría registra los tres cambios sin ella.
        var uso = await ApiAsync("GET", "/api/v1/ia/uso", Admin(norte), null, 200);
        (await uso.ReadAsTextAsync()).ShouldNotContain(llave);
        var resumen = (await uso.ReadAsJsonAsync<UsoIaDto>())!;
        resumen.Mes.ShouldBe(UsoMensualIa.MesDe(CalendarioDeIa.Dia(Fixture.Reloj.GetUtcNow(), "America/Bogota")));
        (resumen.Plan.Configurado, resumen.Plan.ValidacionesIncluidasMes, resumen.IncluidasRestantes, resumen.AdicionalesRestantes)
            .ShouldBe((true, 300, 300, (int?)0));
        (await ApiAsync<UsoIaDto>("GET", "/api/v1/ia/uso?mes=2026-01", Admin(norte), null, 200)).Mes.ShouldBe("2026-01");
        var auditoria = await ApiAsync("GET", $"/api/v1/auditoria?entidad={PlanIaEndpoints.Entidad}", Admin(norte), null, 200);
        var registros = (await auditoria.ReadAsJsonAsync<PaginaDto<RegistroAuditoriaDto>>())!.Datos;
        registros.Select(r => r.Accion).ShouldBe(["Modificado", "Modificado", "Creado"]);
        registros.ShouldAllBe(r => r.Actor.Tipo == "Plataforma" && r.EmpresaId == norte.Datos.Id);
        JsonSerializer.Serialize(registros).ShouldNotContain(llave);

        // Validaciones, empresa de otro tenant, credencial sin el permiso de Plataforma y mes inválido.
        (await CodigoAsync(await ApiAsync("PUT", url, plataforma, new ActualizarPlanIaEmpresaDto(-1, false), 422))).ShouldBe("validaciones-incluidas-invalidas");
        (await CodigoAsync(await ApiAsync("PUT", url, plataforma, new ActualizarPlanIaEmpresaDto(1, false, UmbralConfianza: 2m), 422)))
            .ShouldBe("umbral-confianza-invalido");
        (await CodigoAsync(await ApiAsync("PUT", url, plataforma, new ActualizarPlanIaEmpresaDto(1, false, ApiKeyOpenAi: "corta"), 422))).ShouldBe("api-key-invalida");
        (await CodigoAsync(await ApiAsync("GET", $"/api/v1/plataforma/tenants/{norte.Datos.TenantId}/empresas/{otra.Datos.Id}/plan-ia", plataforma, null, 404)))
            .ShouldBe("empresa-no-encontrada");
        await ApiAsync("PUT", url, Admin(norte), new ActualizarPlanIaEmpresaDto(1, false), 403);
        (await CodigoAsync(await ApiAsync("GET", "/api/v1/ia/uso?mes=2026-13", Admin(norte), null, 422))).ShouldBe("mes-invalido");
    }

    /// <summary>
    /// Un tercero (persona jurídica) invitado como CLIENTE por varias empresas cuyos flujos piden el RUT, y su sesión (que
    /// ya incluye todos sus vínculos).
    /// </summary>
    private async Task<(IReadOnlyList<VinculoDto> Vinculos, SesionTerceroDto Sesion)> TerceroConEmpresasAsync(params Empresa[] empresas)
    {
        var correo = CorreoNuevo();
        var nit = Nit();
        var vinculos = new List<VinculoDto>();
        foreach (var empresa in empresas)
        {
            await FlujoConAsync(empresa, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
            vinculos.Add(await CrearVinculoAsync(empresa, "CLIENTE", correo, nit));
        }

        return (vinculos, await SesionAsync(correo, empresas[0].Datos.Nombre));
    }

    private async Task<IReadOnlyList<object>> EventosDeBovedaAsync(Guid documentoId)
    {
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession("boveda");
        return [.. (await consulta.Events.FetchStreamAsync(documentoId)).Select(e => e.Data)];
    }
}
