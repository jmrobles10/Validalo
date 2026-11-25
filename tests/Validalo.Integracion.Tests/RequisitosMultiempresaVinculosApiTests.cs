using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Validalo.Contratos;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

[Collection(Colecciones.Api3)]
[Trait("Requiere", "Docker")]
public sealed class RequisitosMultiempresaVinculosApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    // ---------- un mismo tercero con varios vínculos y varias empresas (RQ-11, M-8) ----------

    /// <summary>
    /// Norte con el flujo PROVEEDOR (RUT y Cámara) y un tercero ya aprobado como proveedor por las dos áreas; devuelve su vínculo, su sesión,
    /// su correo, su NIT y el expediente aprobado.
    /// </summary>
    private async Task<(Escenario E, VinculoDto Proveedor, SesionTerceroDto Sesion, string Correo, string Nit, ExpedienteDto Aprobado)> ProveedorYaAprobadoAsync()
    {
        var e = await PrepararAsync();
        var correo = CorreoNuevo();
        var nit = Nit();
        var proveedor = await CrearVinculoAsync(e.Norte, "PROVEEDOR", correo, nit);
        var sesion = await SesionAsync(correo);
        await SubirAsync(sesion, "RUT", Pdf("RUT v1"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara v1"));
        await AceptarAsync(sesion, proveedor.Id);
        var inicial = await AbiertoEnAsync(e.Norte, proveedor.Id);
        await EsperarAsync(e.Norte, inicial, x => x.Estado == "EnRevision");
        await AprobarAreasAsync(e, inicial);
        var aprobado = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{inicial}", Admin(e.Norte), null, 200);
        aprobado.Estado.ShouldBe("Aprobado");
        return (e, proveedor, sesion, correo, nit, aprobado);
    }

    /// <summary>
    /// Sesión del tercero con el enlace de la invitación de ese tipo de vínculo (la sesión de una invitación anterior no ve los vínculos creados
    /// después): el asunto del correo dice «como cliente», «como proveedor»…
    /// </summary>
    private async Task<SesionTerceroDto> SesionDeLaInvitacionComoAsync(string correo, string tipoVinculo)
    {
        var invitacion = await Fixture.Correos.EsperarAsync(correo, m => m.Asunto.Contains($"como {tipoVinculo.ToLowerInvariant()}"));
        var canje = await PublicoAsync($"/public/v1/enlaces/{RegexToken().Match(invitacion.Texto).Groups[1].Value}/canjear", null);
        canje.Context.Response.StatusCode.ShouldBe(StatusCodes.Status200OK);
        return (await canje.ReadAsJsonAsync<SesionTerceroDto>())!;
    }

    /// <summary>Publica el flujo CLIENTE de Norte con una sola etapa de Compras (el área del flujo de clientes de la semilla) y los requisitos dados.</summary>
    private async Task PublicarFlujoDeClientesDeComprasAsync(Escenario e, params RequisitoDelFlujoDto[] requisitos)
    {
        var flujo = await ApiAsync<FlujoDto>("POST", "/api/v1/flujos", Admin(e.Norte), new CrearFlujoDto("CLI_" + Guid.NewGuid().ToString("N")[..6].ToUpperInvariant(),
            "Vinculación de clientes", "CLIENTE", [new EtapaDto(1, [new AreaDeEtapaDto(e.Compras.Id)])], Requisitos: requisitos), 201);
        await ApiAsync<FlujoDto>("POST", $"/api/v1/flujos/{flujo.Id}/publicar", Admin(e.Norte), new { }, 200);
    }

    [Fact]
    public async Task El_proveedor_aprobado_que_la_empresa_vincula_tambien_como_cliente_reutiliza_el_RUT_ya_aprobado_y_solo_se_decide_lo_adicional()
    {
        var (e, proveedor, _, correo, nit, expedienteProveedor) = await ProveedorYaAprobadoAsync();

        // Como cliente se pide el RUT (lo revisan las dos áreas) y la certificación bancaria (solo Compras), que como proveedor no se pedía.
        await FlujoConAsync(e.Norte, "CLIENTE",
        [
            new RequisitoDelFlujoDto(TipoDocumento: "RUT", AreasQueRevisan: [e.Compras.Id, e.Cumplimiento.Id]),
            new RequisitoDelFlujoDto(TipoDocumento: "CERTIFICACION_BANCARIA", AreasQueRevisan: [e.Compras.Id])
        ]);
        var cliente = await CrearVinculoAsync(e.Norte, "CLIENTE", correo, nit);
        cliente.TerceroId.ShouldBe(proveedor.TerceroId);
        cliente.Id.ShouldNotBe(proveedor.Id);
        var sesionCliente = await SesionDeLaInvitacionComoAsync(correo, "CLIENTE");
        await AceptarAsync(sesionCliente, cliente.Id);

        // El RUT que Norte ya tiene compartido se adjunta solo; la certificación bancaria es nueva y falta: el expediente espera en la fase de carga.
        var expedienteCliente = await AbiertoEnAsync(e.Norte, cliente.Id);
        var abierto = await EsperarAsync(e.Norte, expedienteCliente, x => Requisito(x, "RUT").Estado == "Cargado");
        abierto.Estado.ShouldBe("Abierto");
        Requisito(abierto, "CERTIFICACION_BANCARIA").Estado.ShouldBe("Pendiente");

        // El tercero sube la certificación bancaria: el expediente pasa a revisión. El RUT es la misma versión que la empresa ya aprobó como
        // proveedor: lo aprueba el sistema (con la referencia al expediente de proveedor) y no se vuelve a revisar; solo la certificación espera a Compras.
        await SubirAsync(sesionCliente, "CERTIFICACION_BANCARIA", Pdf("Certificación bancaria"));
        var enRevision = await EsperarAsync(e.Norte, expedienteCliente, x => x.Estado == "EnRevision");
        var rut = Requisito(enRevision, "RUT");
        (rut.Estado, rut.VersionActual!.N).ShouldBe(("Aprobado", 1));
        rut.Areas.Select(a => (a.Codigo, a.Estado)).ShouldBe([("COMPRAS", "Aprobado"), ("CUMPLIMIENTO", "Aprobado")], ignoreOrder: true);
        foreach (var area in rut.Areas)
        {
            var veredicto = area.Veredictos.ShouldHaveSingleItem();
            (veredicto.Veredicto, veredicto.Origen, veredicto.SobreVersion, veredicto.Vigente).ShouldBe(("Aprobado", "Sistema", (int?)1, true));
            veredicto.Justificacion.ShouldBe($"La empresa ya aprobó esta versión en el expediente {expedienteProveedor.Folio} (Proveedor).");
        }

        var bancaria = Requisito(enRevision, "CERTIFICACION_BANCARIA");
        bancaria.Estado.ShouldBe("EnRevision");
        bancaria.Areas.ShouldHaveSingleItem().Veredictos.ShouldBeEmpty();
        var deLaura = Area(await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteCliente}", Delegado(e.Norte, e.Laura), null, 200), "COMPRAS");
        deLaura.DocumentosPorDecidir.ShouldBe([new DocumentoPorDecidirDto(bancaria.Id, 1)]);
        var deCarlos = Area(await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteCliente}", Delegado(e.Norte, e.Carlos), null, 200), "CUMPLIMIENTO");
        (deCarlos.Estado, deCarlos.RequisitosPorDecidir).ShouldBe(("Aprobada", 0));

        // Compras decide solo la certificación bancaria: el expediente se aprueba y los dos vínculos quedan activos.
        (await VeredictoAsync<ExpedienteDto>(e, expedienteCliente, bancaria.Id, e.Compras, e.Laura, new VeredictoDto("Aprobado", SobreVersion: 1))).Estado
            .ShouldBe("Aprobado");
        (await VinculoDeAsync(e.Norte, cliente.Id)).Estado.ShouldBe("Activo");
        (await VinculoDeAsync(e.Norte, proveedor.Id)).Estado.ShouldBe("Activo");
        (await VinculoPublicoAsync(sesionCliente, cliente.Id)).Estado.ShouldBe("Activo");
    }

    [Fact]
    public async Task Si_como_cliente_solo_se_pide_lo_que_ya_aprobo_como_proveedor_el_vinculo_de_cliente_queda_activo_al_aceptar()
    {
        var (e, proveedor, _, correo, nit, _) = await ProveedorYaAprobadoAsync();

        // La administración deja el flujo de clientes pidiendo solo el RUT.
        await PublicarFlujoDeClientesDeComprasAsync(e, new RequisitoDelFlujoDto(TipoDocumento: "RUT", AreasQueRevisan: [e.Compras.Id]));
        var cliente = await CrearVinculoAsync(e.Norte, "CLIENTE", correo, nit);
        cliente.TerceroId.ShouldBe(proveedor.TerceroId);
        (await VinculoDeAsync(e.Norte, cliente.Id)).Estado.ShouldBe("Invitado");

        // Al aceptar no queda nada por revisar: el expediente se aprueba solo (sin ninguna decisión humana) y el vínculo de cliente queda activo.
        var sesionCliente = await SesionDeLaInvitacionComoAsync(correo, "CLIENTE");
        await AceptarAsync(sesionCliente, cliente.Id);
        await EsperarVinculoAsync(e.Norte, cliente.Id, v => v.Estado == "Activo");
        var expedienteCliente = (await ApiAsync<PaginaDto<ExpedienteDto>>("GET", $"/api/v1/expedientes?vinculoId={cliente.Id}", Admin(e.Norte), null, 200))
            .Datos.ShouldHaveSingleItem().Id;
        var aprobado = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteCliente}", Admin(e.Norte), null, 200);
        aprobado.Estado.ShouldBe("Aprobado");
        var rut = Requisito(aprobado, "RUT");
        rut.Estado.ShouldBe("Aprobado");
        rut.Areas.Single().Veredictos.ShouldHaveSingleItem().ShouldSatisfyAllConditions(v => v.Origen.ShouldBe("Sistema"), v => v.Veredicto.ShouldBe("Aprobado"));

        // El tercero lo ve aprobado con esa empresa, en los dos vínculos.
        var publico = await VinculoPublicoAsync(sesionCliente, cliente.Id);
        (publico.Estado, publico.EnRevision).ShouldBe(("Activo", false));
        (await TerceroAsync<ExpedientePublicoDto>("GET", $"/public/v1/expedientes/{expedienteCliente}", sesionCliente.AccessToken, null, 200)).Requisitos!
            .Single().Estado.ShouldBe("Aprobado");
        (await VinculoPublicoAsync(sesionCliente, proveedor.Id)).Estado.ShouldBe("Activo");
    }

    /// <summary>Espera (hasta 20 s) a que el vínculo cumpla la condición: el expediente que se aprueba al abrirse lo cierra una cola.</summary>
    private async Task<VinculoDto> EsperarVinculoAsync(Empresa empresa, Guid vinculoId, Func<VinculoDto, bool> condicion)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            var vinculo = await VinculoDeAsync(empresa, vinculoId);
            if (condicion(vinculo))
                return vinculo;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"El vínculo {vinculoId} no llegó al estado esperado (está {vinculo.Estado}).");
            await Task.Delay(100);
        }
    }

    /// <summary>La revalidación del RUT de la empresa: cada cuántos días vence desde que la empresa lo aprueba (TD-10); sin antigüedad máxima.</summary>
    private async Task FijarFrescuraDelRutAsync(Empresa empresa, int dias)
    {
        var rut = (await ApiAsync<List<TipoDocumentoTenantDto>>("GET", "/api/v1/tipos-documento", Admin(empresa), null, 200)).Single(t => t.Codigo == "RUT");
        await ApiAsync<TipoDocumentoTenantDto>("PUT", $"/api/v1/tipos-documento/{rut.Id}", Admin(empresa),
            new ActualizarTipoDocumentoDto(AntiguedadMaximaDias: 0, RevalidarCadaDias: dias, DiasAviso: [], DiasGracia: 0), 200);
    }

    [Fact]
    public async Task Dos_grupos_empresariales_que_invitan_al_mismo_proveedor_comparten_una_boveda_y_cada_uno_ve_su_vigencia_del_RUT_sin_ver_al_otro()
    {
        var grupoA = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        var grupoB = await EmpresaNuevaAsync("Sur S.A.S.", "SUR");
        await FijarFrescuraDelRutAsync(grupoA, 30);
        await FijarFrescuraDelRutAsync(grupoB, 365);
        await FlujoConAsync(grupoA, "PROVEEDOR", [new RequisitoDelFlujoDto(TipoDocumento: "RUT"), new RequisitoDelFlujoDto(TipoDocumento: "CAMARA_COMERCIO")]);
        await FlujoConAsync(grupoB, "PROVEEDOR", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var correo = CorreoNuevo();
        var nit = Nit();
        var enA = await CrearVinculoAsync(grupoA, "PROVEEDOR", correo, nit);
        var enB = await CrearVinculoAsync(grupoB, "PROVEEDOR", correo, nit);
        enB.TerceroId.ShouldBe(enA.TerceroId);

        // Una sola bóveda: el tercero sube su RUT y su Cámara una vez y acepta a cada grupo.
        var sesion = await SesionAsync(correo, grupoA.Datos.Nombre);
        var rut = (await SubirAsync(sesion, "RUT", Pdf("RUT v1"))).Version;
        await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara v1"));
        (await AceptarAsync(sesion, enA.Id)).Compartidos.Select(c => c.Tipo).Order().ShouldBe(["CAMARA_COMERCIO", "RUT"]);
        var aceptadaB = await AceptarAsync(sesion, enB.Id);
        var compartidoB = aceptadaB.Compartidos.ShouldHaveSingleItem();
        (compartidoB.Tipo, compartidoB.DocumentoId, compartidoB.Version).ShouldBe(("RUT", rut.DocumentoId, 1)); // el mismo documento y versión que ya tiene A

        // Cada grupo ve la vigencia de su regla sobre la misma versión del RUT, contada desde que lo aprueba: 30 días para A, 365 para B.
        var hoy = Hoy();
        var abiertoA = await AbiertoEnAsync(grupoA, enA.Id);
        var abiertoB = await AbiertoEnAsync(grupoB, enB.Id);
        // Antes de aprobar, ninguno tiene fecha de vencimiento: la regla de cada grupo cuenta desde su aprobación.
        var sinAprobarA = await EsperarAsync(grupoA, abiertoA, x => x.Estado == "EnRevision" && Requisito(x, "RUT").VersionActual is not null);
        Requisito(sinAprobarA, "RUT").VersionActual!.Vigencia!.VigenteHasta.ShouldBeNull();
        await AprobarComoAdministradorAsync(grupoA, abiertoA);
        await AprobarComoAdministradorAsync(grupoB, abiertoB);
        var expedienteA = await EsperarAsync(grupoA, abiertoA, x => Requisito(x, "RUT").VersionActual?.Vigencia?.VigenteHasta is not null);
        var expedienteB = await EsperarAsync(grupoB, abiertoB, x => Requisito(x, "RUT").VersionActual?.Vigencia?.VigenteHasta is not null);
        Requisito(expedienteA, "RUT").VersionActual!.Vigencia!.VigenteHasta.ShouldBe(hoy.AddDays(30));
        Requisito(expedienteB, "RUT").VersionActual!.Vigencia!.VigenteHasta.ShouldBe(hoy.AddDays(365));
        Requisito(expedienteB, "RUT").VersionActual!.DocumentoId.ShouldBe(Requisito(expedienteA, "RUT").VersionActual!.DocumentoId);

        // La revisora del grupo B ve el RUT con la vigencia de su grupo y nada del grupo A: ni su nombre ni lo que solo pide A.
        expedienteB.Requisitos!.Select(r => r.TipoDocumento.Codigo).ShouldBe(["RUT"]);
        var texto = JsonSerializer.Serialize(expedienteB);
        texto.ShouldNotContain(grupoA.Datos.Nombre);
        texto.ShouldNotContain("CAMARA_COMERCIO");
        texto.ShouldNotContain(enA.Id.ToString());
        await ApiAsync("GET", $"/api/v1/expedientes/{expedienteA.Id}", Admin(grupoB), null, 404);
    }
}
