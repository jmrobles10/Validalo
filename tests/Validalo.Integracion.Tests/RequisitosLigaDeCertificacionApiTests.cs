using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Aplicacion.Expedientes;
using Validalo.Aplicacion.Interesado;
using Validalo.Aplicacion.Vinculos;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Vinculos;
using Wolverine;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// La liga automática de la certificación bancaria general a su cuenta (CB-8, 2026-11-24): el tercero sube la certificación desde el requisito del expediente (sin cuenta), la IA la
/// lee y, si el número es el de una sola cuenta activa suya sin certificación propia, esa certificación pasa a ser la de la cuenta sin dejar de cubrir el requisito. Con dos
/// coincidencias, o con una cuenta que ya tiene la suya, no adivina; y la pasada única al arrancar liga lo que ya estaba leído.
/// </summary>
[Collection(Colecciones.Api1)]
[Trait("Requiere", "Docker")]
public sealed class RequisitosLigaDeCertificacionApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    private const string Cuentas = "/public/v1/boveda/cuentas-bancarias";

    /// <summary>Certificación bancaria con marcas que lee el analizador falso (como el simulado de la API).</summary>
    private static byte[] CertificacionCon(string numeroCuenta, string identificacionTitular, string banco = "Davivienda S.A.") =>
        Pdf($"Certificación [[banco={banco}]][[tipoCuenta=Cuenta corriente]][[numeroCuenta={numeroCuenta}]][[titular=ACEROS DEL NORTE SAS]]" +
            $"[[identificacionTitular={identificacionTitular}]]");

    private Task<CuentaBancariaPublicaDto> RegistrarAsync(SesionTerceroDto sesion, string banco, string numero, string nit) =>
        TerceroAsync<CuentaBancariaPublicaDto>("POST", Cuentas, sesion.AccessToken,
            new RegistrarCuentaBancariaDto(banco, "Corriente", numero, "Aceros del Norte S.A.S.", $"NIT {nit}"), 201);

    private Task<List<CuentaBancariaPublicaDto>> CuentasAsync(SesionTerceroDto sesion) =>
        TerceroAsync<List<CuentaBancariaPublicaDto>>("GET", Cuentas, sesion.AccessToken, null, 200);

    private sealed record Tercero(Escenario E, VinculoDto Vinculo, SesionTerceroDto Sesion, string Nit, Guid Expediente);

    /// <summary>Un tercero con la invitación aceptada y el expediente abierto de un flujo que pide la certificación bancaria, con la IA de la empresa lista para leerla.</summary>
    private async Task<Tercero> TerceroQueDebeLaCertificacionAsync()
    {
        var e = await PrepararAsync();
        await PlanIaAsync(e.Norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa()));
        await FlujoConAsync(e.Norte, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "CERTIFICACION_BANCARIA", AreasQueRevisan: [e.Compras.Id, e.Cumplimiento.Id])]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var nit = (await ApiAsync<FichaTerceroDto>("GET", $"/api/v1/terceros/{vinculo.TerceroId}/ficha", Admin(e.Norte), null, 200)).Tercero.Identificacion.Numero;
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        return new Tercero(e, vinculo, sesion, nit, await AbiertoEnAsync(e.Norte, vinculo.Id));
    }

    /// <summary>Espera a que la IA lea la versión 1 de la certificación general que la empresa recibió por el requisito.</summary>
    private Task EsperarLecturaAsync(Tercero t) =>
        EsperarVersionAsync(t.E.Norte, t.Vinculo.Id, "CERTIFICACION_BANCARIA", 1, v => v.Hechos?.ConIa == true);

    private async Task<ResultadoDeLigaGeneral> IntentarAsync(Guid documentoId)
    {
        using var alcance = Host.Services.CreateScope();
        return await LigaDeCertificacionGeneral.IntentarAsync(alcance.ServiceProvider.GetRequiredService<ISesiones>(), alcance.ServiceProvider.GetRequiredService<IProtectorDeSecretos>(),
            documentoId, DateTimeOffset.UtcNow, CancellationToken.None);
    }

    [Fact]
    public async Task La_certificacion_general_leida_se_liga_sola_a_la_unica_cuenta_con_ese_numero_sin_dejar_de_cubrir_el_requisito_y_repetirlo_no_cambia_nada()
    {
        var t = await TerceroQueDebeLaCertificacionAsync();
        // Dos cuentas: la certificación dice el número de Davivienda (con ceros a la izquierda; la cuenta se escribió con espacios), no el de Bancolombia.
        var davivienda = await RegistrarAsync(t.Sesion, "Davivienda", "0074 6999 7097", t.Nit);
        var bancolombia = await RegistrarAsync(t.Sesion, "Bancolombia", "031-123456-78", t.Nit);
        (await CuentasAsync(t.Sesion)).ShouldAllBe(c => c.FaltaCertificacion);

        // El tercero la sube desde el requisito (sin cuenta): se comparte con la empresa que la pide, la IA la lee y la liga a Davivienda.
        var general = await SubirAsync(t.Sesion, "CERTIFICACION_BANCARIA", CertificacionCon("007469997097", t.Nit));
        var documentoId = general.Version.DocumentoId;
        await EsperarAsync(async () => (await CuentasAsync(t.Sesion)).Single(c => c.Id == davivienda.Id).Certificacion is not null, "la liga de la certificación a su cuenta");

        var cuentas = await CuentasAsync(t.Sesion);
        var ligada = cuentas.Single(c => c.Id == davivienda.Id);
        (ligada.FaltaCertificacion, ligada.Certificacion!.DocumentoId, ligada.Certificacion.Version).ShouldBe((false, documentoId, 1));
        cuentas.Single(c => c.Id == bancolombia.Id).FaltaCertificacion.ShouldBeTrue(); // la otra cuenta no se toca
        // Ya no es un documento suelto de la bóveda: es la certificación de la cuenta (se ve y se reemplaza en «Mis cuentas»).
        (await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", t.Sesion.AccessToken, null, 200)).Documentos.ShouldNotContain(d => d.Tipo.Codigo == "CERTIFICACION_BANCARIA");

        // La empresa con la que ya estaba compartida la sigue viendo (la misma versión) y el requisito sigue cubierto con ella, también tras sincronizar el vínculo.
        var visibles = await ApiAsync<List<DocumentoVistaEmpresaDto>>("GET", $"/api/v1/vinculos/{t.Vinculo.Id}/documentos", Admin(t.E.Norte), null, 200);
        var visible = visibles.ShouldHaveSingleItem();
        (visible.DocumentoId, visible.Tipo.Codigo, visible.VersionesCompartidas.Single().N).ShouldBe((documentoId, "CERTIFICACION_BANCARIA", 1));
        await InvocarAsync(new SincronizarRequisitosDelVinculo(t.E.Norte.Datos.TenantId, t.Vinculo.Id, "Tercero", t.Sesion.TerceroId.ToString()));
        var requisito = Requisito(await EsperarAsync(t.E.Norte, t.Expediente, x => Requisito(x, "CERTIFICACION_BANCARIA").VersionActual is not null), "CERTIFICACION_BANCARIA");
        (requisito.VersionActual!.DocumentoId, requisito.VersionActual.N).ShouldBe((documentoId, 1));

        // El cálculo de requisitos de la empresa (al abrir un expediente o aplicar un requisito nuevo) también la ve: no se vuelve a compartir, pero va en lo que cubre.
        using (var alcance = Host.Services.CreateScope())
        {
            var sesiones = alcance.ServiceProvider.GetRequiredService<ISesiones>();
            await using var sesion = sesiones.ParaTenant(t.E.Norte.Datos.TenantId);
            var vinculo = (await sesion.LoadAsync<Vinculo>(t.Vinculo.Id))!;
            var compartido = await ComparticionDeDocumentos.CompartirConVinculoAsync(sesion, vinculo, t.E.Norte.Datos.TenantId, new HashSet<string> { "CERTIFICACION_BANCARIA" },
                OrigenComparticion.Automatica, DateTimeOffset.UtcNow, CancellationToken.None);
            compartido.Compartidos.ShouldBeEmpty();
            var cubre = RequisitosDeExpediente.Cubre(Guid.NewGuid(), "CERTIFICACION_BANCARIA", AmbitoDocumento.Global, compartido.Documentos, t.Vinculo.Id).ShouldNotBeNull();
            (cubre.DocumentoId, cubre.Numero).ShouldBe((documentoId, 1));
        }

        // Idempotente: ya es de una cuenta, no hay nada más que ligar.
        (await IntentarAsync(documentoId)).ShouldBe(ResultadoDeLigaGeneral.NoAplica);
        var igual = (await CuentasAsync(t.Sesion)).Single(c => c.Id == davivienda.Id);
        (igual.Certificacion!.DocumentoId, igual.Certificacion.Version).ShouldBe((documentoId, 1));
    }

    [Fact]
    public async Task Con_dos_cuentas_con_el_mismo_numero_no_adivina_y_la_certificacion_sigue_siendo_general()
    {
        var t = await TerceroQueDebeLaCertificacionAsync();
        await RegistrarAsync(t.Sesion, "Bancolombia", "031-123456-78", t.Nit);
        await RegistrarAsync(t.Sesion, "Davivienda", "03112345678", t.Nit);

        var general = await SubirAsync(t.Sesion, "CERTIFICACION_BANCARIA", CertificacionCon("03112345678", t.Nit));
        await EsperarLecturaAsync(t);

        (await IntentarAsync(general.Version.DocumentoId)).ShouldBe(ResultadoDeLigaGeneral.Ambigua);
        (await CuentasAsync(t.Sesion)).ShouldAllBe(c => c.FaltaCertificacion && c.Certificacion == null);
        (await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", t.Sesion.AccessToken, null, 200)).Documentos
            .Single(d => d.Tipo.Codigo == "CERTIFICACION_BANCARIA").Id.ShouldBe(general.Version.DocumentoId);
    }

    [Fact]
    public async Task No_pisa_la_certificacion_propia_de_la_cuenta_con_ese_numero()
    {
        var t = await TerceroQueDebeLaCertificacionAsync();
        var cuenta = await RegistrarAsync(t.Sesion, "Davivienda", "007469997097", t.Nit);
        var propia = await SubirCertificacionAsync(t.Sesion, cuenta.Id, CertificacionCon("007469997097", t.Nit));

        var general = await SubirAsync(t.Sesion, "CERTIFICACION_BANCARIA", CertificacionCon("7469997097", t.Nit));
        await EsperarLecturaAsync(t);

        (await IntentarAsync(general.Version.DocumentoId)).ShouldBe(ResultadoDeLigaGeneral.YaTienePropia);
        var vista = (await CuentasAsync(t.Sesion)).Single();
        vista.Certificacion!.DocumentoId.ShouldBe(propia.Version.DocumentoId); // la suya manda
        general.Version.DocumentoId.ShouldNotBe(propia.Version.DocumentoId);
        (await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", t.Sesion.AccessToken, null, 200)).Documentos
            .Single(d => d.Tipo.Codigo == "CERTIFICACION_BANCARIA").Id.ShouldBe(general.Version.DocumentoId); // la general sigue siendo general
    }

    [Fact]
    public async Task Una_certificacion_sin_numero_en_la_lectura_no_se_liga()
    {
        var t = await TerceroQueDebeLaCertificacionAsync();
        await RegistrarAsync(t.Sesion, "Davivienda", "007469997097", t.Nit);

        var general = await SubirAsync(t.Sesion, "CERTIFICACION_BANCARIA", Pdf("Certificación [[banco=Davivienda S.A.]][[titular=ACEROS DEL NORTE SAS]]"));
        await EsperarLecturaAsync(t);

        (await IntentarAsync(general.Version.DocumentoId)).ShouldBe(ResultadoDeLigaGeneral.SinNumero);
        (await CuentasAsync(t.Sesion)).Single().FaltaCertificacion.ShouldBeTrue();
    }

    [Fact]
    public async Task La_pasada_al_arrancar_liga_lo_que_ya_estaba_leido_y_se_puede_repetir()
    {
        var t = await TerceroQueDebeLaCertificacionAsync();
        // La certificación se leyó antes de que existiera la cuenta (no había con quién ligarla); después el tercero registra la cuenta sin certificación.
        var general = await SubirAsync(t.Sesion, "CERTIFICACION_BANCARIA", CertificacionCon("007469997097", t.Nit));
        await EsperarLecturaAsync(t);
        var cuenta = await RegistrarAsync(t.Sesion, "Davivienda", "0074 6999 7097", t.Nit);
        (await CuentasAsync(t.Sesion)).Single().FaltaCertificacion.ShouldBeTrue();

        var resultado = await MigrarAsync();

        resultado.Ligadas.ShouldBeGreaterThanOrEqualTo(1);
        resultado.ConError.ShouldBe(0);
        var ligada = (await CuentasAsync(t.Sesion)).Single(c => c.Id == cuenta.Id);
        (ligada.FaltaCertificacion, ligada.Certificacion!.DocumentoId, ligada.Certificacion.Version).ShouldBe((false, general.Version.DocumentoId, 1));

        // Repetirla no cambia nada: lo ligado ya no es general.
        var otra = await MigrarAsync();
        otra.Ligadas.ShouldBe(0);
        (await CuentasAsync(t.Sesion)).Single(c => c.Id == cuenta.Id).Certificacion!.DocumentoId.ShouldBe(general.Version.DocumentoId);
    }

    [Fact]
    public async Task Pedir_la_pasada_al_bus_la_ejecuta_y_deja_su_marca_para_no_repetirla_al_arrancar()
    {
        using (var alcance = Host.Services.CreateScope())
            await alcance.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(new MigrarCertificacionesPorNumero());

        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession();
        (await MigracionDeCertificacionPorNumero.YaCorrioAsync(consulta, CancellationToken.None)).ShouldBeTrue();
        (await consulta.LoadAsync<MigracionDeDatosEjecutada>(MigracionDeCertificacionPorNumero.Nombre))!.Resumen.ShouldContain("certificaciones bancarias sin cuenta ya leídas revisadas");
    }

    private async Task<ResultadoDeLigaPorNumero> MigrarAsync()
    {
        using var alcance = Host.Services.CreateScope();
        return await MigracionDeCertificacionPorNumero.EjecutarAsync(alcance.ServiceProvider.GetRequiredService<ISesiones>(), alcance.ServiceProvider.GetRequiredService<IProtectorDeSecretos>(),
            DateTimeOffset.UtcNow, Microsoft.Extensions.Logging.Abstractions.NullLogger.Instance, CancellationToken.None);
    }
}
