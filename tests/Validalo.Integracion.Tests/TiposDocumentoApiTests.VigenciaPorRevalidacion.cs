using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Documentos;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;

namespace Validalo.Integracion.Tests;

public sealed partial class TiposDocumentoApiTests
{
    // ---------- frescura: antigüedad máxima al subir y revalidar cada N días desde la aprobación (TD-10) ----------

    /// <summary>
    /// Una empresa con el tipo propio «Certificado de seguridad y salud» (solo formulario: fecha de expedición y origen; antigüedad máxima de 30 días al subirlo y
    /// revalidación cada 30 días desde que la empresa lo aprueba) pedido por su flujo, con los días de aviso y de gracia indicados, y un tercero que ya aceptó.
    /// </summary>
    private async Task<EscenarioFormulario> EscenarioConRevalidacionAsync(int[] diasAviso, int diasGracia, int? antiguedad = 30, int? revalidar = 30)
    {
        var empresa = await EmpresaNuevaAsync("Comercial " + Guid.NewGuid().ToString("N")[..6], "F" + Random.Shared.Next(10, 99));
        var tipo = await ApiAsync<TipoDocumentoTenantDto>("POST", "/api/v1/tipos-documento", Admin(empresa),
            new CrearTipoDocumentoDto("CERT_SST", "Certificado de seguridad y salud", null,
                AntiguedadMaximaDias: antiguedad, RevalidarCadaDias: revalidar, DiasAviso: diasAviso, DiasGracia: diasGracia, Modo: "Formulario",
                Campos:
                [
                    new CampoFormularioDto("fecha_expedicion", "Fecha de expedición", "Fecha", true),
                    new CampoFormularioDto("origen", "Origen de los fondos", "Lista", true, ["Nacional", "Extranjero"])
                ]), 201);
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias, tipo.ReglaFrescura.Tipo).ShouldBe((antiguedad, revalidar, "Ninguna"));
        await FlujoConAsync(empresa, [new RequisitoDelFlujoDto(TipoDocumentoTenantId: tipo.Id)]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(empresa, correo);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        var expedienteId = (await ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{vinculo.Id}", Admin(empresa), null, 200)).ExpedienteAbiertoId!.Value;
        var expediente = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Admin(empresa), null, 200);
        return new EscenarioFormulario(empresa, tipo, vinculo, sesion, expediente, correo);
    }

    private async Task<Guid> SubirCertificadoAsync(EscenarioFormulario e, int diasDesdeExpedicion) =>
        (await TerceroAsync<ConfirmacionCargaDto>("POST", "/public/v1/boveda/formularios", e.Sesion.AccessToken,
            Formulario(e, ("fecha_expedicion", Hoy().AddDays(-diasDesdeExpedicion).ToString("yyyy-MM-dd")), ("origen", "Nacional")), 200)).Version.DocumentoId;

    /// <summary>
    /// La empresa aprueba el expediente (el administrador en nombre de su área). Con <paramref name="diasAtras"/> el reloj retrocede esos días mientras se aprueba:
    /// la aprobación queda con esa fecha, que es desde donde cuenta «revalidar cada N días».
    /// </summary>
    private Task AprobarAsync(EscenarioFormulario e, int diasAtras = 0) => AprobarAsync(e.Empresa, e.Expediente.Id, diasAtras);

    private async Task AprobarAsync(Empresa empresa, Guid expedienteId, int diasAtras = 0)
    {
        await EsperarAsync(empresa, expedienteId, x => x.Estado == "EnRevision");
        try
        {
            fixture.Reloj.Desfase = TimeSpan.FromDays(-diasAtras);
            var url = $"/api/v1/expedientes/{expedienteId}";
            foreach (var area in (await ApiAsync<ExpedienteDto>("GET", url, Admin(empresa), null, 200)).Etapas.SelectMany(t => t.Areas).Select(a => a.AreaId).ToList())
                await ApiAsync<ExpedienteDto>("POST", $"{url}/areas/{area}/aprobar-como-administrador", Admin(empresa), new JustificacionDto("Revisada con el área."), 200);
        }
        finally
        {
            fixture.Reloj.Desfase = TimeSpan.Zero;
        }

        (await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Admin(empresa), null, 200)).Estado.ShouldBe("Aprobado");
    }

    /// <summary>La vigencia de la versión del requisito vista por la empresa, cuando ya tiene fecha (el cálculo llega por un mensaje).</summary>
    private async Task<VigenciaDto> VigenciaParaLaEmpresaAsync(EscenarioFormulario e, Func<VigenciaDto, bool>? condicion = null)
    {
        var expediente = await EsperarAsync(e.Empresa, e.Expediente.Id,
            x => x.Requisitos!.Single().VersionActual?.Vigencia is { VigenteHasta: not null } v && (condicion?.Invoke(v) ?? true));
        return expediente.Requisitos!.Single().VersionActual!.Vigencia!;
    }

    [Fact]
    public async Task Antes_de_que_la_empresa_apruebe_el_documento_no_tiene_fecha_de_vencimiento_y_la_vigencia_cuenta_desde_la_aprobacion_y_no_desde_la_carga()
    {
        var e = await EscenarioConRevalidacionAsync([10], 5);
        var hoy = Hoy();
        var documentoId = await SubirCertificadoAsync(e, 3);

        // Cargado y compartido, sin aprobar: la vigencia se registra sin fecha de vencimiento («Vence 30 días después de que la empresa lo apruebe»).
        var primera = await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId);
        (primera.VigenteHasta, primera.Base, primera.AprobadaEn, primera.RevalidarCadaDias, primera.VinculoId).ShouldBe((null, BaseVigencia.SinVencimiento, null, 30, e.Vinculo.Id));
        var antes = (await EsperarAsync(e.Empresa, e.Expediente.Id, x => x.Requisitos!.Single().VersionActual is not null)).Requisitos!.Single().VersionActual!;
        (antes.Vigencia!.VigenteHasta, antes.Vigencia.RevalidarCadaDias, antes.Vigencia.AprobadaEn, antes.Vigencia.Estado).ShouldBe((null, 30, null, "SinVencimiento"));
        var publicaAntes = await TerceroAsync<ExpedientePublicoDto>("GET", $"/public/v1/expedientes/{e.Expediente.Id}", e.Sesion.AccessToken, null, 200);
        publicaAntes.Requisitos!.Single().VersionActual!.Vigencia!.VigenteHasta.ShouldBeNull();
        publicaAntes.Requisitos!.Single().TipoDocumento.RevalidarCadaDias.ShouldBe(30);
        fixture.Correos.Para(e.Correo).ShouldNotContain(m => m.Asunto.Contains("vencer"));

        // La empresa lo aprueba: desde ese día cuentan los 30 días (no desde la carga ni desde la expedición).
        await AprobarAsync(e);
        var vigencia = await VigenciaParaLaEmpresaAsync(e);
        (vigencia.VigenteHasta, vigencia.Base, vigencia.Estado, vigencia.FinDeGracia).ShouldBe((hoy.AddDays(30), "Aprobacion", "Vigente", hoy.AddDays(35)));
        vigencia.AprobadaEn.ShouldNotBeNull();
        var publica = await TerceroAsync<ExpedientePublicoDto>("GET", $"/public/v1/expedientes/{e.Expediente.Id}", e.Sesion.AccessToken, null, 200);
        publica.Requisitos!.Single().VersionActual!.Vigencia!.VigenteHasta.ShouldBe(hoy.AddDays(30));

        // El expediente la calcula ya con la aprobación; la bóveda la registra enseguida, por su barrido, como una segunda vigencia del mismo vínculo (la versión es la misma), con la
        // fecha de aprobación.
        await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId, c => c.Base == BaseVigencia.Aprobacion);
        var calculadas = (await EventosAsync(documentoId)).OfType<VigenciaDeVersionCalculada>().ToList();
        calculadas.Select(c => (c.VinculoId, c.VigenteHasta, c.Base)).ShouldBe([(e.Vinculo.Id, (DateOnly?)null, BaseVigencia.SinVencimiento), (e.Vinculo.Id, hoy.AddDays(30), BaseVigencia.Aprobacion)]);
        calculadas[1].AprobadaEn.ShouldNotBeNull();
    }

    [Theory]
    [InlineData(3, "Vigente", 27, true)]
    [InlineData(25, "PorVencer", 5, false)]
    [InlineData(32, "EnGracia", -2, false)]
    [InlineData(40, "Vencida", -10, false)]
    public async Task Segun_cuando_lo_aprobo_la_empresa_el_documento_queda_vigente_por_vencer_en_gracia_o_vencido_y_solo_se_programa_el_aviso_que_aun_no_paso(
        int diasDesdeLaAprobacion, string estado, int diasParaVencer, bool seProgramaElAviso)
    {
        var e = await EscenarioConRevalidacionAsync([10], 5);
        var vence = Hoy().AddDays(diasParaVencer);
        var documentoId = await SubirCertificadoAsync(e, 3);
        await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId);

        await AprobarAsync(e, diasAtras: diasDesdeLaAprobacion);

        // La vigencia que registra la bóveda para el vínculo: vence 30 días después de aprobado, con 5 de gracia.
        var calculada = await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId, c => c.VigenteHasta is not null);
        (calculada.VigenteHasta, calculada.Base, calculada.DiasGracia, calculada.VinculoId).ShouldBe((vence, BaseVigencia.Aprobacion, 5, e.Vinculo.Id));

        // La empresa y el tercero ven el mismo estado y las mismas fechas.
        var vigencia = await VigenciaParaLaEmpresaAsync(e);
        (vigencia.Estado, vigencia.VigenteHasta, vigencia.FinDeGracia).ShouldBe((estado, vence, vence.AddDays(5)));
        var publica = await TerceroAsync<ExpedientePublicoDto>("GET", $"/public/v1/expedientes/{e.Expediente.Id}", e.Sesion.AccessToken, null, 200);
        var vista = publica.Requisitos!.Single().VersionActual!.Vigencia!;
        (vista.Estado, vista.VigenteHasta, vista.FinDeGracia).ShouldBe((estado, vence, vence.AddDays(5)));

        // El aviso de los 10 días solo se programa si todavía no pasó (NW-15): quien lo aprueba a 5 días de vencer no recibe un aviso atrasado.
        var fechaAviso = vence.AddDays(-10);
        await using (var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda))
        {
            var programado = await consulta.LoadAsync<AvisoDeVencimiento>(AvisoDeVencimiento.Clave(e.Sesion.TerceroId, fechaAviso));
            (programado is not null).ShouldBe(seProgramaElAviso);
            programado?.Estado.ShouldBe(EstadoAviso.Programado);
        }

        if (estado != "Vencida")
        {
            // Mientras esté vigente, por vencer o en gracia, la versión no vence y nadie recibe el aviso de vencido ni uno atrasado.
            (await EventosAsync(documentoId)).OfType<VersionVencida>().ShouldBeEmpty();
            fixture.Correos.Para(e.Correo).ShouldNotContain(m => m.Asunto.Contains("venció") || m.Asunto.Contains("por vencer"));
            return;
        }

        // Ya pasó la gracia: el vencimiento programado en el pasado se ejecuta enseguida (TD-7) y se le avisa al tercero por correo.
        var vencida = await EsperarEventoAsync<VersionVencida>(documentoId);
        (vencida.VinculoId, vencida.VigenteHasta).ShouldBe((e.Vinculo.Id, vence));
        var aviso = await fixture.Correos.EsperarAsync(e.Correo, m => m.Asunto == $"Tu Certificado de seguridad y salud venció para {e.Empresa.Nombre}");
        aviso.Texto.ShouldContain("ya pasó el plazo de gracia");
        aviso.Texto.ShouldContain("vigente hasta el");
    }

    [Fact]
    public async Task Cambiar_la_revalidacion_del_tipo_recalcula_la_vigencia_que_ya_tenia_el_documento_y_reprograma_su_aviso()
    {
        var e = await EscenarioConRevalidacionAsync([10], 5);
        var hoy = Hoy();
        var documentoId = await SubirCertificadoAsync(e, 3);
        await AprobarAsync(e, diasAtras: 25);

        // Revalidar cada 30 días y aprobado hace 25: le quedan 5 y por eso está por vencer.
        var antes = await VigenciaParaLaEmpresaAsync(e);
        (antes.Estado, antes.VigenteHasta).ShouldBe(("PorVencer", hoy.AddDays(5)));

        // El expediente la calcula ya con la aprobación, pero la bóveda la registra en el stream del documento por su barrido, un poco después. Se espera ese registro antes de
        // cambiar el tipo: si el cambio llega primero, el barrido ya calcula con los 90 días y la vigencia de 5 días nunca llega a registrarse.
        await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId, c => c.VigenteHasta == hoy.AddDays(5));

        // La administración del grupo amplía la revalidación a 90 días: el mismo documento pasa a vigente hasta la aprobación + 90. La antigüedad máxima no se tocó.
        var tipo = await ApiAsync<TipoDocumentoTenantDto>("PUT", $"/api/v1/tipos-documento/{e.Tipo.Id}", Admin(e.Empresa),
            new ActualizarTipoDocumentoDto(RevalidarCadaDias: 90), 200);
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias).ShouldBe((30, 90));
        var despues = await VigenciaParaLaEmpresaAsync(e, v => v.VigenteHasta == hoy.AddDays(65));
        (despues.Estado, despues.VigenteHasta, despues.FinDeGracia, despues.RevalidarCadaDias).ShouldBe(("Vigente", hoy.AddDays(65), hoy.AddDays(70), 90));

        // Quedó registrada como una vigencia nueva del mismo vínculo (el recálculo del tipo llega por un mensaje, así que se espera su evento) y su aviso, a los 10 días de la
        // fecha nueva, programado.
        await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId, c => c.VigenteHasta == hoy.AddDays(65));
        var calculadas = (await EventosAsync(documentoId)).OfType<VigenciaDeVersionCalculada>().Where(c => c.VigenteHasta is not null).ToList();
        calculadas.Select(c => (c.VinculoId, c.VigenteHasta)).ShouldBe([(e.Vinculo.Id, (DateOnly?)hoy.AddDays(5)), (e.Vinculo.Id, hoy.AddDays(65))]);
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda);
        (await consulta.LoadAsync<AvisoDeVencimiento>(AvisoDeVencimiento.Clave(e.Sesion.TerceroId, hoy.AddDays(55)))).ShouldNotBeNull().Estado.ShouldBe(EstadoAviso.Programado);
    }

    [Fact]
    public async Task Un_tipo_sin_revalidacion_nunca_vence_por_ella_aunque_este_aprobado_y_quitar_la_regla_con_cero_la_deja_sin_fecha()
    {
        var e = await EscenarioConRevalidacionAsync([10], 5, antiguedad: 30, revalidar: null);
        var documentoId = await SubirCertificadoAsync(e, 3);
        await AprobarAsync(e);

        // Con solo la antigüedad máxima, la versión aprobada no vence: ninguna vigencia con fecha.
        var primera = await EsperarEventoAsync<VigenciaDeVersionCalculada>(documentoId);
        primera.VigenteHasta.ShouldBeNull();
        await Task.Delay(TimeSpan.FromSeconds(3)); // da tiempo al barrido de recálculos
        (await EventosAsync(documentoId)).OfType<VigenciaDeVersionCalculada>().ShouldAllBe(c => c.VigenteHasta == null);

        // Se pide revalidar cada 365 días y luego se quita con 0: la regla vuelve a no existir.
        var conRegla = await ApiAsync<TipoDocumentoTenantDto>("PUT", $"/api/v1/tipos-documento/{e.Tipo.Id}", Admin(e.Empresa), new ActualizarTipoDocumentoDto(RevalidarCadaDias: 365), 200);
        conRegla.RevalidarCadaDias.ShouldBe(365);
        (await VigenciaParaLaEmpresaAsync(e)).VigenteHasta.ShouldBe(Hoy().AddDays(365));
        var sinRegla = await ApiAsync<TipoDocumentoTenantDto>("PUT", $"/api/v1/tipos-documento/{e.Tipo.Id}", Admin(e.Empresa), new ActualizarTipoDocumentoDto(RevalidarCadaDias: 0), 200);
        (sinRegla.AntiguedadMaximaDias, sinRegla.RevalidarCadaDias).ShouldBe((30, null));
    }

    [Fact]
    public async Task La_regla_heredada_de_la_API_de_antes_se_traduce_a_las_dos_reglas_y_los_dias_fuera_de_rango_se_rechazan()
    {
        var empresa = await EmpresaNuevaAsync("Comercial " + Guid.NewGuid().ToString("N")[..6], "H" + Random.Shared.Next(10, 99));

        // MaxDiasDesdeExpedicion(n) ⇒ antigüedad máxima de n días y revalidar cada n.
        var porExpedicion = await ApiAsync<TipoDocumentoTenantDto>("POST", "/api/v1/tipos-documento", Admin(empresa),
            new CrearTipoDocumentoDto("FORMATO_A", "Formato A", null, ReglaFrescura: new ReglaFrescuraDto("MaxDiasDesdeExpedicion", 60)), 201);
        (porExpedicion.AntiguedadMaximaDias, porExpedicion.RevalidarCadaDias, porExpedicion.ReglaFrescura.Tipo).ShouldBe((60, 60, "Ninguna"));
        // MaxDiasDesdeAprobacion(n) ⇒ revalidar cada n días, sin antigüedad.
        var porAprobacion = await ApiAsync<TipoDocumentoTenantDto>("PUT", $"/api/v1/tipos-documento/{porExpedicion.Id}", Admin(empresa),
            new ActualizarTipoDocumentoDto(ReglaFrescura: new ReglaFrescuraDto("MaxDiasDesdeAprobacion", 90)), 200);
        (porAprobacion.AntiguedadMaximaDias, porAprobacion.RevalidarCadaDias).ShouldBe((null, 90));
        // El periodo se conserva como está.
        var periodo = await ApiAsync<TipoDocumentoTenantDto>("PUT", $"/api/v1/tipos-documento/{porExpedicion.Id}", Admin(empresa),
            new ActualizarTipoDocumentoDto(ReglaFrescura: new ReglaFrescuraDto("PeriodoMinimo", Regla: "ultimo-anio")), 200);
        (periodo.ReglaFrescura.Tipo, periodo.ReglaFrescura.Regla, periodo.AntiguedadMaximaDias, periodo.RevalidarCadaDias).ShouldBe(("PeriodoMinimo", "ultimo-anio", null, null));

        // Un tipo nuevo de un canónico sin reglas pedidas toma las que sugiere el catálogo (Cámara: 30 días y 365).
        var tipos = await ApiAsync<List<TipoDocumentoTenantDto>>("GET", "/api/v1/tipos-documento", Admin(empresa), null, 200);
        var camara = tipos.Single(t => t.Codigo == "CAMARA_COMERCIO");
        (camara.AntiguedadMaximaDias, camara.RevalidarCadaDias).ShouldBe((30, 365));
        var rut = tipos.Single(t => t.Codigo == "RUT");
        (rut.AntiguedadMaximaDias, rut.RevalidarCadaDias).ShouldBe((null, 365));
        var catalogo = await ApiAsync<List<TipoDocumentoCanonicoDto>>("GET", "/api/v1/catalogos/tipos-documento", Admin(empresa), null, 200);
        var sugerida = catalogo.Single(c => c.Codigo == "CAMARA_COMERCIO");
        (sugerida.AntiguedadMaximaSugeridaDias, sugerida.RevalidarCadaSugeridoDias).ShouldBe((30, 365));

        // Fuera de 1 a 3650 días.
        (await CodigoAsync(await ApiAsync("PUT", $"/api/v1/tipos-documento/{porExpedicion.Id}", Admin(empresa), new ActualizarTipoDocumentoDto(AntiguedadMaximaDias: 4000), 422)))
            .ShouldBe("antiguedad-invalida");
        (await CodigoAsync(await ApiAsync("PUT", $"/api/v1/tipos-documento/{porExpedicion.Id}", Admin(empresa), new ActualizarTipoDocumentoDto(RevalidarCadaDias: -1), 422)))
            .ShouldBe("revalidacion-invalida");
    }

    [Fact]
    public async Task Un_documento_expedido_hace_mas_del_maximo_se_ve_excedido_para_el_revisor_y_para_el_tercero_con_lo_que_debe_hacer()
    {
        var e = await EscenarioConRevalidacionAsync([10], 5);

        // Un tipo que no se lee (formulario propio) se evalúa con la fecha que declara el tercero: 40 días contra un máximo de 30.
        await SubirCertificadoAsync(e, 40);
        var delRevisor = (await EsperarAsync(e.Empresa, e.Expediente.Id, x => x.Requisitos!.Single().VersionActual is not null)).Requisitos!.Single().VersionActual!.Antiguedad!;
        (delRevisor.Estado, delRevisor.MaximoDias, delRevisor.Dias, delRevisor.Fuente, delRevisor.Critico).ShouldBe(("Excedida", 30, 40, "Declarada", true));
        delRevisor.Detalle.ShouldBe($"Expedida el {Hoy().AddDays(-40):dd/MM/yyyy} (declarada por el tercero): 40 días; el máximo es 30.");
        var campo = delRevisor.Campo.ShouldNotBeNull();
        (campo.Campo, campo.Etiqueta, campo.Resultado, campo.Critico).ShouldBe(("antiguedad_documento", "Antigüedad del documento", "Discrepa", true));

        // El tercero ve el mismo hallazgo con el siguiente paso, y la regla del tipo en su requisito.
        var publica = await TerceroAsync<ExpedientePublicoDto>("GET", $"/public/v1/expedientes/{e.Expediente.Id}", e.Sesion.AccessToken, null, 200);
        var requisito = publica.Requisitos!.Single();
        requisito.TipoDocumento.AntiguedadMaximaDias.ShouldBe(30);
        requisito.VersionActual!.Antiguedad!.Mensaje.ShouldBe("Sube el documento «Certificado de seguridad y salud» expedido hace menos de 30 días.");

        // Una versión nueva reciente cumple: Coincide, sin mensaje.
        await SubirCertificadoAsync(e, 5);
        var cumple = (await EsperarAsync(e.Empresa, e.Expediente.Id, x => x.Requisitos!.Single().VersionActual?.N == 2)).Requisitos!.Single().VersionActual!.Antiguedad!;
        (cumple.Estado, cumple.Dias, cumple.Critico, cumple.Mensaje, cumple.Campo!.Resultado).ShouldBe(("Cumple", 5, false, null, "Coincide"));
    }
}
