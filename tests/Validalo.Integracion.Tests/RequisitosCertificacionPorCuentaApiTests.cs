using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Vinculos;
using Validalo.Contratos;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// La certificación bancaria por cuenta (CB-1, decidido por el usuario el 2026-11-24: una certificación por cuenta): cada cuenta se registra con la suya, la IA la lee y se cruza con
/// <b>esa</b> cuenta, la empresa solo recibe la de la cuenta que el tercero designa con ella, y la certificación vieja sin cuenta se liga a la única cuenta activa.
/// </summary>
[Collection(Colecciones.Api1)]
[Trait("Requiere", "Docker")]
public sealed class RequisitosCertificacionPorCuentaApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    private const string Cuentas = "/public/v1/boveda/cuentas-bancarias";

    /// <summary>Certificación bancaria con marcas que lee el analizador falso (como el simulado de la API).</summary>
    private static byte[] CertificacionCon(string numeroCuenta, string identificacionTitular, string banco = "Bancolombia S.A.") =>
        Pdf($"Certificación [[banco={banco}]][[tipoCuenta=Cuenta de ahorros]][[numeroCuenta={numeroCuenta}]][[titular=ACEROS DEL NORTE SAS]]" +
            $"[[identificacionTitular={identificacionTitular}]][[estadoCuenta=Activa]]");

    private Task<CuentaBancariaPublicaDto> RegistrarAsync(SesionTerceroDto sesion, string banco, string numero, string nit) =>
        TerceroAsync<CuentaBancariaPublicaDto>("POST", Cuentas, sesion.AccessToken,
            new RegistrarCuentaBancariaDto(banco, "Ahorros", numero, "Aceros del Norte S.A.S.", $"NIT {nit}"), 201);

    private Task<List<CuentaBancariaPublicaDto>> CuentasAsync(SesionTerceroDto sesion) =>
        TerceroAsync<List<CuentaBancariaPublicaDto>>("GET", Cuentas, sesion.AccessToken, null, 200);

    private async Task<string> NitDelTerceroAsync(Empresa empresa, VinculoDto vinculo) =>
        (await ApiAsync<FichaTerceroDto>("GET", $"/api/v1/terceros/{vinculo.TerceroId}/ficha", Admin(empresa), null, 200)).Tercero.Identificacion.Numero;

    [Fact]
    public async Task Cada_cuenta_sube_su_certificacion_la_empresa_recibe_solo_la_de_la_cuenta_designada_y_la_ve_cruzada_con_esa_cuenta()
    {
        var e = await PrepararAsync();
        await PlanIaAsync(e.Norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa()));
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var nit = await NitDelTerceroAsync(e.Norte, vinculo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);

        // Dos cuentas: nacen sin certificación y lo dicen.
        var bancolombia = await RegistrarAsync(sesion, "Bancolombia", "031-123456-78", nit);
        var davivienda = await RegistrarAsync(sesion, "Davivienda", "4700 1234 9999", nit);
        foreach (var cuenta in new[] { bancolombia, davivienda })
            (cuenta.FaltaCertificacion, cuenta.Certificacion).ShouldBe((true, null));

        // Cada una sube la suya: son dos documentos y la de una no reemplaza la de la otra.
        var v1Bancolombia = await SubirCertificacionAsync(sesion, bancolombia.Id, CertificacionCon("03112345678", nit));
        var v1Davivienda = await SubirCertificacionAsync(sesion, davivienda.Id, CertificacionCon("470012349999", nit, "Davivienda S.A."));
        v1Bancolombia.Version.DocumentoId.ShouldNotBe(v1Davivienda.Version.DocumentoId);
        var cuentas = await CuentasAsync(sesion);
        foreach (var cuenta in cuentas)
            (cuenta.FaltaCertificacion, cuenta.Certificacion!.Version, cuenta.Certificacion.Estado).ShouldBe((false, 1, "Actual"));
        cuentas.Single(c => c.Id == bancolombia.Id).Certificacion!.DocumentoId.ShouldBe(v1Bancolombia.Version.DocumentoId);

        // La certificación de una cuenta no se comparte antes de designarla: la empresa no recibe ninguna, y sin empresa que la pague tampoco hay lectura de IA.
        (await ApiAsync<List<DocumentoVistaEmpresaDto>>("GET", $"/api/v1/vinculos/{vinculo.Id}/documentos", Admin(e.Norte), null, 200)).ShouldBeEmpty();
        cuentas.ShouldAllBe(c => c.Certificacion!.Verificacion == "SinAnalisis");

        // Designa Bancolombia: se le comparte la certificación de esa cuenta (y solo esa) y la IA la lee.
        await TerceroAsync<CuentaBancariaPublicaDto>("POST", $"/public/v1/vinculos/{vinculo.Id}/cuenta-designada", sesion.AccessToken, new DesignarCuentaDto(bancolombia.Id), 200);
        await EsperarVersionAsync(e.Norte, vinculo.Id, "CERTIFICACION_BANCARIA", 1, v => v.Hechos?.ConIa == true);
        var visibles = await ApiAsync<List<DocumentoVistaEmpresaDto>>("GET", $"/api/v1/vinculos/{vinculo.Id}/documentos", Admin(e.Norte), null, 200);
        visibles.ShouldHaveSingleItem().DocumentoId.ShouldBe(v1Bancolombia.Version.DocumentoId); // la de Davivienda no
        await ApiAsync("GET", $"/api/v1/vinculos/{vinculo.Id}/documentos/{v1Davivienda.Version.DocumentoId}", Admin(e.Norte), null, 404);

        // El tercero ve lo que la IA leyó de su certificación frente a lo que declaró.
        await EsperarAsync(async () => (await CuentasAsync(sesion)).Single(c => c.Id == bancolombia.Id).Certificacion!.Verificacion == "Coincide", "la lectura de la certificación de Bancolombia");
        (await CuentasAsync(sesion)).Single(c => c.Id == davivienda.Id).Certificacion!.Verificacion.ShouldBe("SinAnalisis"); // sin designar no se lee

        // La empresa la ve junto a la cuenta propuesta: el cruce con esa cuenta, con el número enmascarado.
        var url = $"/api/v1/vinculos/{vinculo.Id}/cuenta-designada";
        var vista = await ApiAsync<CuentaDesignadaDelVinculoDto>("GET", url, Delegado(e.Norte, e.Carlos), null, 200);
        var certificacion = vista.Propuesta!.Certificacion.ShouldNotBeNull();
        (vista.Propuesta.SinCertificacion, certificacion.Version, certificacion.SinAnalisis, certificacion.Verificacion, certificacion.DiscrepanciaCritica)
            .ShouldBe((false, 1, false, "Coincide", false));
        var cruce = certificacion.Cruce.ShouldNotBeNull();
        cruce.Campos.Select(c => (c.Campo, c.Resultado)).ShouldBe(
        [
            ("numero", "Coincide"), ("titular", "Coincide"), ("identificacion_titular", "Coincide"), ("titular_es_el_tercero", "Coincide"),
            ("estado_cuenta", "Coincide"), ("banco", "Coincide"), ("tipo_cuenta", "Coincide")
        ]);
        var numero = cruce.Campos.Single(c => c.Campo == "numero");
        (numero.Declarado, numero.Extraido).ShouldBe(("****5678", "****5678"));
        JsonSerializer.Serialize(certificacion).ShouldNotContain("03112345678"); // el cruce nunca lleva el número completo (lo ve aparte, en `numero`, quien aprueba)
        vista.Propuesta.Numero.ShouldBe("03112345678");
    }

    [Fact]
    public async Task Una_version_nueva_con_otro_numero_deja_una_discrepancia_critica_visible_para_el_tercero_y_para_quien_aprueba_sin_bloquear_nada()
    {
        var e = await PrepararAsync();
        await PlanIaAsync(e.Norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa()));
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var nit = await NitDelTerceroAsync(e.Norte, vinculo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        var cuenta = await RegistrarAsync(sesion, "Bancolombia", "031-123456-78", nit);
        await SubirCertificacionAsync(sesion, cuenta.Id, CertificacionCon("03112345678", nit));
        await TerceroAsync<CuentaBancariaPublicaDto>("POST", $"/public/v1/vinculos/{vinculo.Id}/cuenta-designada", sesion.AccessToken, new DesignarCuentaDto(cuenta.Id), 200);
        await EsperarAsync(async () => (await CuentasAsync(sesion)).Single().Certificacion!.Verificacion == "Coincide", "la lectura de la primera versión");

        // La versión 2 de esa cuenta dice otro número (y otro titular): se comparte con la empresa de la cuenta propuesta, se lee y discrepa en lo crítico.
        var v2 = await SubirCertificacionAsync(sesion, cuenta.Id, CertificacionCon("99999999999", "800111222"));
        v2.Version.N.ShouldBe(2);
        await EsperarAsync(async () => (await CuentasAsync(sesion)).Single().Certificacion is { Version: 2, Verificacion: "Discrepa" }, "la lectura de la versión 2");

        var delTercero = (await CuentasAsync(sesion)).Single().Certificacion!;
        delTercero.DiscrepanciaCritica.ShouldBeTrue();
        delTercero.Campos.Single(c => c.Campo == "numero").ShouldSatisfyAllConditions(c => c.Resultado.ShouldBe("Discrepa"), c => c.Extraido.ShouldBe("****9999"));
        delTercero.Campos.Single(c => c.Campo == "titular_es_el_tercero").Resultado.ShouldBe("Discrepa");
        JsonSerializer.Serialize(delTercero).ShouldNotContain("99999999999");

        // Quien aprueba la cuenta la ve destacada en la propia propuesta; nada se bloquea solo: puede aprobar o rechazar como siempre.
        var url = $"/api/v1/vinculos/{vinculo.Id}/cuenta-designada";
        await EsperarAsync(async () => (await ApiAsync<CuentaDesignadaDelVinculoDto>("GET", url, Delegado(e.Norte, e.Carlos), null, 200)).Propuesta!.Certificacion is { Version: 2, SinAnalisis: false },
            "la lectura de la versión 2 para la empresa");
        var vista = await ApiAsync<CuentaDesignadaDelVinculoDto>("GET", url, Delegado(e.Norte, e.Carlos), null, 200);
        var certificacion = vista.Propuesta!.Certificacion!;
        (certificacion.Verificacion, certificacion.DiscrepanciaCritica).ShouldBe(("Discrepa", true));
        vista.PuedesAprobar.ShouldBeTrue();
        (await ApiAsync<CuentaDesignadaDelVinculoDto>("POST", $"{url}/aprobar", Delegado(e.Norte, e.Carlos), new { }, 200)).Propuesta.ShouldNotBeNull();
    }

    [Fact]
    public async Task La_certificacion_de_una_cuenta_solo_se_sube_a_una_cuenta_activa_del_propio_tercero_y_con_su_tipo()
    {
        var e = await PrepararAsync();
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var nit = await NitDelTerceroAsync(e.Norte, vinculo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        var cuenta = await RegistrarAsync(sesion, "Bancolombia", "031-123456-78", nit);
        var pdf = CertificacionCon("03112345678", nit);

        async Task<string?> RechazoAsync(IniciarCargaDto dto, int estado, SesionTerceroDto? deQuien = null) =>
            await CodigoAsync(await TerceroAsync("POST", "/public/v1/boveda/documentos", (deQuien ?? sesion).AccessToken, dto, estado));

        // Solo es el documento de una cuenta la certificación bancaria; no se mezcla con las personas relacionadas.
        (await RechazoAsync(new IniciarCargaDto("rut.pdf", pdf.Length, "application/pdf", TipoCanonico: "RUT", CuentaBancariaId: cuenta.Id), 422)).ShouldBe("documento-no-es-de-cuenta");
        (await RechazoAsync(new IniciarCargaDto("c.pdf", pdf.Length, "application/pdf", CuentaBancariaId: cuenta.Id, TerceroRelacionadoId: Guid.NewGuid()), 422)).ShouldBe("destino-ambiguo");
        (await RechazoAsync(new IniciarCargaDto("c.pdf", pdf.Length, "application/pdf", CuentaBancariaId: Guid.NewGuid()), 404)).ShouldBe("cuenta-no-encontrada");

        // La cuenta de otro tercero no se distingue de una que no existe.
        var otro = CorreoNuevo();
        var vinculoOtro = await CrearVinculoAsync(e.Norte, "CLIENTE", otro);
        var sesionOtro = await SesionAsync(otro);
        await AceptarAsync(sesionOtro, vinculoOtro.Id);
        (await RechazoAsync(new IniciarCargaDto("c.pdf", pdf.Length, "application/pdf", CuentaBancariaId: cuenta.Id), 404, sesionOtro)).ShouldBe("cuenta-no-encontrada");

        // Una cuenta retirada ya no recibe certificaciones.
        await TerceroAsync<CuentaBancariaPublicaDto>("POST", $"{Cuentas}/{cuenta.Id}/retirar", sesion.AccessToken, new { }, 200);
        (await RechazoAsync(new IniciarCargaDto("c.pdf", pdf.Length, "application/pdf", CuentaBancariaId: cuenta.Id), 409)).ShouldBe("cuenta-retirada");
    }

    [Fact]
    public async Task La_certificacion_de_una_cuenta_no_aparece_como_un_documento_suelto_de_la_boveda_pero_si_en_su_tarjeta()
    {
        var e = await PrepararAsync();
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var nit = await NitDelTerceroAsync(e.Norte, vinculo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        var cuenta = await RegistrarAsync(sesion, "Bancolombia", "031-123456-78", nit);
        var confirmada = await SubirCertificacionAsync(sesion, cuenta.Id, CertificacionCon("03112345678", nit));
        var general = await SubirAsync(sesion, "CERTIFICACION_BANCARIA", Pdf("Certificación general"));

        // La bóveda solo lista el documento general (el de la cuenta se ve y se reemplaza en «Mis cuentas») y no puede designar la cuenta.
        var boveda = await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", sesion.AccessToken, null, 200);
        boveda.Documentos.Where(d => d.Tipo.Codigo == "CERTIFICACION_BANCARIA").ShouldHaveSingleItem().Id.ShouldBe(general.Version.DocumentoId);
        (await CuentasAsync(sesion)).Single().Certificacion!.DocumentoId.ShouldBe(confirmada.Version.DocumentoId);
        general.Version.DocumentoId.ShouldNotBe(confirmada.Version.DocumentoId);
    }

    [Fact]
    public async Task La_migracion_liga_la_certificacion_de_antes_a_la_unica_cuenta_activa_no_adivina_con_varias_y_se_puede_repetir()
    {
        var e = await PrepararAsync();
        async Task<(SesionTerceroDto Sesion, VinculoDto Vinculo, string Nit)> TerceroNuevoAsync()
        {
            var correo = CorreoNuevo();
            var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
            var sesion = await SesionAsync(correo);
            await AceptarAsync(sesion, vinculo.Id);
            return (sesion, vinculo, await NitDelTerceroAsync(e.Norte, vinculo));
        }

        // Un tercero con una sola cuenta y la certificación general de antes (dos versiones); otro con dos cuentas y la suya.
        var (unaSesion, unVinculo, unNit) = await TerceroNuevoAsync();
        var unica = await RegistrarAsync(unaSesion, "Bancolombia", "031-123456-78", unNit);
        var general = await SubirAsync(unaSesion, "CERTIFICACION_BANCARIA", CertificacionCon("03112345678", unNit));
        await SubirAsync(unaSesion, "CERTIFICACION_BANCARIA", CertificacionCon("03112345678", unNit, "Bancolombia"));

        var (variasSesion, variasVinculo, variasNit) = await TerceroNuevoAsync();
        var primera = await RegistrarAsync(variasSesion, "Bancolombia", "031-123456-78", variasNit);
        var segunda = await RegistrarAsync(variasSesion, "Davivienda", "4700 1234 9999", variasNit);
        await SubirAsync(variasSesion, "CERTIFICACION_BANCARIA", CertificacionCon("03112345678", variasNit));

        // Antes de migrar ninguna cuenta tiene certificación propia: no se pueden designar.
        (await CuentasAsync(unaSesion)).Single().FaltaCertificacion.ShouldBeTrue();
        (await CodigoAsync(await TerceroAsync("POST", $"/public/v1/vinculos/{unVinculo.Id}/cuenta-designada", unaSesion.AccessToken, new DesignarCuentaDto(unica.Id), 422)))
            .ShouldBe("certificacion-requerida");

        var resultado = await MigrarAsync();
        resultado.Ligados.ShouldBeGreaterThanOrEqualTo(1);

        // La única cuenta quedó con la certificación de antes (con sus versiones) y ya se puede designar.
        var ligada = (await CuentasAsync(unaSesion)).Single();
        (ligada.FaltaCertificacion, ligada.Certificacion!.DocumentoId, ligada.Certificacion.Version).ShouldBe((false, general.Version.DocumentoId, 2));
        await TerceroAsync<CuentaBancariaPublicaDto>("POST", $"/public/v1/vinculos/{unVinculo.Id}/cuenta-designada", unaSesion.AccessToken, new DesignarCuentaDto(unica.Id), 200);

        // Con dos cuentas no se adivina: siguen sin certificación y no se designan.
        var varias = await CuentasAsync(variasSesion);
        varias.ShouldAllBe(c => c.FaltaCertificacion && c.Certificacion == null);
        foreach (var cuenta in new[] { primera, segunda })
            (await CodigoAsync(await TerceroAsync("POST", $"/public/v1/vinculos/{variasVinculo.Id}/cuenta-designada", variasSesion.AccessToken, new DesignarCuentaDto(cuenta.Id), 422)))
                .ShouldBe("certificacion-requerida");

        // Repetirla no cambia nada: lo ligado ya no es general y lo que seguía general se revisa con el mismo resultado.
        var otra = await MigrarAsync();
        otra.Ligados.ShouldBe(0);
        var igual = (await CuentasAsync(unaSesion)).Single();
        (igual.Certificacion!.DocumentoId, igual.Certificacion.Version).ShouldBe((general.Version.DocumentoId, 2));
        (await CuentasAsync(variasSesion)).ShouldAllBe(c => c.FaltaCertificacion);
    }

    private async Task<ResultadoDeMigracionDeCertificaciones> MigrarAsync()
    {
        using var alcance = Host.Services.CreateScope();
        return await MigracionDeCertificacionPorCuenta.EjecutarAsync(alcance.ServiceProvider.GetRequiredService<ISesiones>(), DateTimeOffset.UtcNow, CancellationToken.None);
    }
}
