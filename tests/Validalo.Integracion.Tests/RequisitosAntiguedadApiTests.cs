using Validalo.Contratos;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// Antigüedad máxima al subir (TD-10) de punta a punta con el analizador falso (la fecha de expedición sale de la marca <c>[[fechaExpedicion=…]]</c> del archivo): el hallazgo
/// crítico que ve el revisor, lo que ve el tercero, la observación automática del nivel Automático, la sugerencia de Asistido y que aprobarlo pida justificación. El tipo
/// de la Cámara de comercio de una empresa nueva trae lo que sugiere el catálogo: antigüedad máxima de 30 días y revalidar cada 365.
/// </summary>
[Collection(Colecciones.Api4)]
[Trait("Requiere", "Docker")]
public sealed class RequisitosAntiguedadApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    private static byte[] CamaraExpedida(DateOnly? fecha) =>
        Pdf(fecha is { } f ? $"Cámara [[fechaExpedicion={f:yyyy-MM-dd}]]" : "Cámara [[razonSocial=ACEROS DEL NORTE SAS]]");

    private async Task AutomaticoAsync(Escenario e)
    {
        await PlanParaRevisionAsync(e.Norte);
        await ConfigRevisionAsync(e.Norte, new ActualizarRevisionAutomaticaDto("Automatico", PorcentajeMuestreo: 0,
            TiposAutorizados: ["RUT", "CAMARA_COMERCIO"], AreasAutorizadas: [e.Compras.Id, e.Cumplimiento.Id]));
    }

    [Fact]
    public async Task En_Automatico_una_Camara_expedida_hace_mas_de_30_dias_se_observa_sola_con_el_motivo_de_frescura_y_lo_que_debe_hacer_el_tercero()
    {
        var e = await PrepararAsync();
        await AutomaticoAsync(e);
        var camara = (await ApiAsync<List<TipoDocumentoTenantDto>>("GET", "/api/v1/tipos-documento", Admin(e.Norte), null, 200)).Single(t => t.Codigo == "CAMARA_COMERCIO");
        (camara.AntiguedadMaximaDias, camara.RevalidarCadaDias).ShouldBe((30, 365));
        var (_, sesion, expedienteId) = await TerceroAceptaAsync(e.Norte, "PROVEEDOR");

        await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", CamaraExpedida(new DateOnly(2024, 7, 17)));

        // El sistema la observa sin pasar por una persona: el expediente vuelve al tercero.
        var observado = await EsperarAsync(e.Norte, expedienteId, x => x.Estado == "Observado");
        var requisito = Requisito(observado, "CAMARA_COMERCIO");
        requisito.Estado.ShouldBe("Observado");
        var veredicto = requisito.Areas.Single(a => a.Codigo == "CUMPLIMIENTO").Veredictos.Single(v => v.Vigente);
        (veredicto.Veredicto, veredicto.Origen, veredicto.Usuario).ShouldBe(("Observado", "Sistema", "revision-automatica"));
        veredicto.Motivos.ShouldBe(["frescura-incumplida"]);
        veredicto.Observacion.ShouldBe("Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días.");
        var revision = RevisionDe(observado, "CAMARA_COMERCIO", "CUMPLIMIENTO").ShouldNotBeNull();
        (revision.Resultado, revision.PendienteDeAtencion).ShouldBe(("Observada", false));
        revision.Motivos.Select(m => m.Codigo).ShouldBe(["antiguedad-excedida"]);
        (await ExcepcionesAsync(e.Norte)).ShouldBeEmpty(); // no es una excepción para una persona: ya está observada

        // El revisor lo ve como un hallazgo crítico: los días desde el 17/07/2024 contra 30, con la fecha que leyó la IA.
        var dias = Hoy().DayNumber - new DateOnly(2024, 7, 17).DayNumber;
        var antiguedad = requisito.VersionActual!.Antiguedad.ShouldNotBeNull();
        (antiguedad.Estado, antiguedad.Dias, antiguedad.MaximoDias, antiguedad.Fuente, antiguedad.Critico).ShouldBe(("Excedida", dias, 30, "Ia", true));
        antiguedad.Detalle.ShouldBe($"Expedida el 17/07/2024: {dias} días; el máximo es 30.");
        antiguedad.Campo.ShouldNotBeNull().ShouldSatisfyAllConditions(c => c.Campo.ShouldBe("antiguedad_documento"), c => c.Resultado.ShouldBe("Discrepa"),
            c => c.Critico.ShouldBeTrue(), c => c.Extraido.ShouldBe("17/07/2024"));

        // El tercero ve la observación con el siguiente paso (y el mismo mensaje en la tarjeta del requisito).
        var publica = await TerceroAsync<ExpedientePublicoDto>("GET", $"/public/v1/expedientes/{expedienteId}", sesion.AccessToken, null, 200);
        var deCamara = publica.Requisitos!.Single(r => r.TipoDocumento.Codigo == "CAMARA_COMERCIO");
        deCamara.Observaciones.ShouldHaveSingleItem().ShouldSatisfyAllConditions(
            o => o.Observacion.ShouldBe("Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días."),
            o => o.Motivos.Single().Codigo.ShouldBe("frescura-incumplida"));
        deCamara.VersionActual!.Antiguedad!.Mensaje.ShouldBe("Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días.");
        deCamara.TipoDocumento.AntiguedadMaximaDias.ShouldBe(30);
        publica.Requisitos!.Single(r => r.TipoDocumento.Codigo == "RUT").VersionActual!.Antiguedad.ShouldBeNull(); // el RUT no pide antigüedad

        // Sube una nueva, reciente: cumple (Coincide) y ya no hay hallazgo de antigüedad. Al ser una versión reenviada tras una observación, la revisa una persona
        // (motivo «version-reenviada»): el único motivo que queda.
        await SubirAsync(sesion, "CAMARA_COMERCIO", CamaraExpedida(Hoy().AddDays(-3)));
        await TerceroAsync<ExpedientePublicoDto>("POST", $"/public/v1/expedientes/{expedienteId}/reenviar", sesion.AccessToken, new ReenviarExpedienteDto(), 200);
        var segunda = await EsperarAsync(e.Norte, expedienteId, x => RevisionDe(x, "CAMARA_COMERCIO", "CUMPLIMIENTO") is { SobreVersion: 2 });
        var cumple = Requisito(segunda, "CAMARA_COMERCIO").VersionActual!.Antiguedad!;
        (cumple.Estado, cumple.Dias, cumple.Critico, cumple.Campo!.Resultado).ShouldBe(("Cumple", 3, false, "Coincide"));
        RevisionDe(segunda, "CAMARA_COMERCIO", "CUMPLIMIENTO")!.Motivos.Select(m => m.Codigo).ShouldBe(["version-reenviada"]);
    }

    [Fact]
    public async Task Una_Camara_sin_fecha_de_expedicion_legible_se_observa_pidiendo_que_la_muestre()
    {
        var e = await PrepararAsync();
        await AutomaticoAsync(e);
        var (_, sesion, expedienteId) = await TerceroAceptaAsync(e.Norte, "PROVEEDOR");
        await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", CamaraExpedida(null));

        var observado = await EsperarAsync(e.Norte, expedienteId, x => x.Estado == "Observado");
        var requisito = Requisito(observado, "CAMARA_COMERCIO");
        requisito.Areas.Single(a => a.Codigo == "CUMPLIMIENTO").Veredictos.Single(v => v.Vigente).ShouldSatisfyAllConditions(
            v => v.Origen.ShouldBe("Sistema"),
            v => v.Observacion.ShouldBe("Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días y que muestre su fecha de expedición."));
        var antiguedad = requisito.VersionActual!.Antiguedad!;
        (antiguedad.Estado, antiguedad.FechaExpedicion, antiguedad.Critico, antiguedad.Campo!.Resultado).ShouldBe(("SinFecha", null, true, "NoVerificable"));
        RevisionDe(observado, "CAMARA_COMERCIO", "CUMPLIMIENTO")!.Motivos.Select(m => m.Codigo).ShouldBe(["sin-fecha-de-expedicion"]);
    }

    [Fact]
    public async Task En_Asistido_sugiere_revisar_y_aprobar_una_Camara_vencida_pide_justificacion_y_la_deja_escrita()
    {
        var e = await PrepararAsync();
        await PlanParaRevisionAsync(e.Norte);
        await ConfigRevisionAsync(e.Norte, new ActualizarRevisionAutomaticaDto("Asistido"));
        var (_, sesion, expedienteId) = await TerceroAceptaAsync(e.Norte, "PROVEEDOR");
        await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", CamaraExpedida(new DateOnly(2024, 7, 17)));

        // Asistido nunca observa ni aprueba solo: sugiere revisar, con el hallazgo crítico visible.
        var sugerido = await EsperarAsync(e.Norte, expedienteId, x => RevisionDe(x, "CAMARA_COMERCIO", "CUMPLIMIENTO") is not null);
        var sugerencia = RevisionDe(sugerido, "CAMARA_COMERCIO", "CUMPLIMIENTO")!;
        (sugerencia.Resultado, sugerencia.Sugerencia).ShouldBe(("Sugerida", "Revisar"));
        sugerencia.Motivos.Select(m => m.Codigo).ShouldBe(["antiguedad-excedida"]);
        sugerido.Estado.ShouldBe("EnRevision");
        Requisito(sugerido, "CAMARA_COMERCIO").Areas.SelectMany(a => a.Veredictos).ShouldBeEmpty();
        Requisito(sugerido, "CAMARA_COMERCIO").VersionActual!.Antiguedad!.Critico.ShouldBeTrue();

        // Aprobarla sin justificación: 422; con ella, queda escrita en el veredicto.
        var camara = Requisito(sugerido, "CAMARA_COMERCIO");
        (await CodigoAsync(await VeredictoAsync(e, expedienteId, camara.Id, e.Cumplimiento, e.Carlos, new VeredictoDto("Aprobado", SobreVersion: 1), 422)))
            .ShouldBe("justificacion-por-discrepancias");
        var conJustificacion = await VeredictoAsync<ExpedienteDto>(e, expedienteId, camara.Id, e.Cumplimiento, e.Carlos,
            new VeredictoDto("Aprobado", SobreVersion: 1, Justificacion: "La Cámara es de 2024 pero el estado de la matrícula se verificó en el RUES."));
        Requisito(conJustificacion, "CAMARA_COMERCIO").Areas.Single(a => a.Codigo == "CUMPLIMIENTO").Veredictos.Single(v => v.Vigente).Justificacion
            .ShouldBe("La Cámara es de 2024 pero el estado de la matrícula se verificó en el RUES.");
    }

    private Task<List<ExcepcionDeRevisionDto>> ExcepcionesAsync(Empresa empresa) =>
        ApiAsync<List<ExcepcionDeRevisionDto>>("GET", "/api/v1/revision-automatica/excepciones?estado=Pendientes", Admin(empresa), null, 200);
}
