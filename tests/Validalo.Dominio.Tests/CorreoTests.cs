using Microsoft.Extensions.Configuration;
using Validalo.Aplicacion.Comun;

namespace Validalo.Dominio.Tests;

/// <summary>Redacción de los correos al tercero (lo que lee el proveedor).</summary>
public class CorreoTests
{
    [Fact]
    public void Los_motivos_se_unen_como_oraciones_sin_punto_y_coma()
    {
        RedactorDeCorreos.UnirMotivos(
                ["Los datos informados no coinciden con los soportes.", "Falta la firma requerida.", "El documento está vencido."])
            .ShouldBe("Los datos informados no coinciden con los soportes. Falta la firma requerida. El documento está vencido.");
    }

    [Fact]
    public void Un_motivo_sin_punto_final_lo_recibe_y_los_vacios_se_omiten()
    {
        RedactorDeCorreos.UnirMotivos(["  Ilegible  ", "", "¿Es de otra empresa?"]).ShouldBe("Ilegible. ¿Es de otra empresa?");
    }

    private static RedactorDeCorreos Redactor() =>
        new(new Microsoft.Extensions.Configuration.ConfigurationBuilder()
            .AddInMemoryCollection([new("Validalo:Correo:UrlPublica", "https://valida.test")]).Build());

    [Fact]
    public void El_rechazo_llega_al_tercero_con_los_motivos_tal_como_se_le_comunican()
    {
        var mensaje = Redactor().RedactarResultado(new CorreoDeResultadoPendiente("ana@aceros.co", "Constructora Norte S.A.S.", "NORTE-E-2026-000001",
            false, ["El documento no corresponde a la persona o empresa que se está validando", "Los datos no coinciden."]));

        mensaje.Asunto.ShouldBe("Constructora Norte S.A.S. cerró tu validación NORTE-E-2026-000001 sin aprobarla");
        mensaje.Texto.ShouldContain("Motivos: El documento no corresponde a la persona o empresa que se está validando. Los datos no coinciden.");
        mensaje.Html.ShouldContain("Motivos: El documento no corresponde");
    }

    // 18 de noviembre de 2026, 03:08 UTC = 17 de noviembre, 10:08 p. m. en Bogotá (el vencimiento que el tercero leía como «03:08 UTC»).
    private static readonly DateTimeOffset Vence = new(2026, 11, 18, 3, 8, 0, TimeSpan.Zero);

    private static CorreoDeAccesoPendiente Acceso(PlantillaCorreo plantilla) => new(plantilla, "ana@aceros.co", "x", Vence, null, null);

    [Fact]
    public void El_enlace_de_acceso_dice_cuando_vence_en_hora_local_de_Colombia_y_no_en_UTC()
    {
        var mensaje = Redactor().Redactar(Acceso(PlantillaCorreo.AccesoPorCorreo), "tok");

        mensaje.Texto.ShouldContain("vence el 17 de noviembre de 2026, 10:08 p. m. (hora de Colombia)");
        mensaje.Html.ShouldContain("vence el 17 de noviembre de 2026, 10:08 p. m. (hora de Colombia).");
        mensaje.Texto.ShouldNotContain("UTC");
        mensaje.Html.ShouldNotContain("UTC");
    }

    [Fact]
    public void Con_la_zona_del_grupo_la_hora_es_la_de_esa_zona_y_sin_la_aclaracion_de_Colombia()
    {
        // Madrid es UTC+1 en noviembre: 04:08 a. m. del 18.
        var mensaje = Redactor().Redactar(Acceso(PlantillaCorreo.AccesoAutorregistro), "tok", "Europe/Madrid");

        mensaje.Texto.ShouldContain("vence el 18 de noviembre de 2026, 4:08 a. m.");
        mensaje.Texto.ShouldNotContain("Colombia");
        mensaje.Texto.ShouldNotContain("UTC");
    }

    [Fact]
    public void Sin_grupo_la_zona_es_la_de_la_plataforma_configurada()
    {
        var redactor = new RedactorDeCorreos(new ConfigurationBuilder().AddInMemoryCollection(
            [new("Validalo:Correo:UrlPublica", "https://valida.test"), new("Validalo:ZonaHoraria", "Europe/Madrid")]).Build());

        redactor.ZonaPorOmision.ShouldBe("Europe/Madrid");
        redactor.Redactar(Acceso(PlantillaCorreo.AccesoPorCorreo), "tok").Texto.ShouldContain("vence el 18 de noviembre de 2026, 4:08 a. m.");
        Redactor().ZonaPorOmision.ShouldBe("America/Bogota");
    }

    [Fact]
    public void El_codigo_de_acceso_el_de_ingreso_y_el_de_reautenticacion_tambien_dicen_su_vencimiento_en_hora_local()
    {
        foreach (var plantilla in new[] { PlantillaCorreo.CodigoOtp, PlantillaCorreo.CodigoDeIngreso, PlantillaCorreo.CodigoDeReautenticacion })
        {
            var mensaje = Redactor().Redactar(Acceso(plantilla), "482915");

            mensaje.Texto.ShouldContain("17 de noviembre de 2026, 10:08 p. m. (hora de Colombia)");
            mensaje.Html.ShouldContain("17 de noviembre de 2026, 10:08 p. m. (hora de Colombia)");
            mensaje.Texto.ShouldNotContain("UTC");
        }
    }

    [Theory]
    [InlineData(5, 0, "12:00 a. m.")]
    [InlineData(5, 5, "12:05 a. m.")]
    [InlineData(17, 0, "12:00 p. m.")]
    [InlineData(14, 30, "9:30 a. m.")]
    [InlineData(23, 59, "6:59 p. m.")]
    public void La_hora_se_escribe_en_formato_de_doce_horas_con_a_m_y_p_m(int horaUtc, int minuto, string esperado)
    {
        FechasDeCorreo.Larga(new DateTimeOffset(2026, 11, 17, horaUtc, minuto, 0, TimeSpan.Zero), "America/Bogota")
            .ShouldBe($"17 de noviembre de 2026, {esperado} (hora de Colombia)");
    }

    [Fact]
    public void Una_zona_que_el_sistema_no_conoce_se_dice_UTC_en_vez_de_dejar_una_hora_que_parezca_local()
    {
        FechasDeCorreo.Larga(Vence, "Marte/Olympus").ShouldBe("18 de noviembre de 2026, 3:08 a. m. (UTC)");
        FechasDeCorreo.Larga(Vence, "UTC").ShouldBe("18 de noviembre de 2026, 3:08 a. m.");
    }

    [Fact]
    public void El_enlace_principal_de_los_correos_al_tercero_es_un_boton_de_marca_y_no_un_enlace_de_texto()
    {
        var botones = new List<(string Html, string Texto)>
        {
            (Redactor().Redactar(Acceso(PlantillaCorreo.AccesoPorCorreo), "tok").Html, "Abrir Valídalo"),
            (Redactor().Redactar(Acceso(PlantillaCorreo.Invitacion), "tok").Html, "Abrir Valídalo"),
            (Redactor().RedactarObservacion(new CorreoDeObservacionPendiente("ana@aceros.co", "Norte", "N-E-1", [new ObservacionParaCorreo(["Ilegible"], null)]), "tok").Html,
                "Responder en Valídalo"),
            (Redactor().RedactarPlazoDeCargue(new Validalo.Aplicacion.Expedientes.CorreoDePlazoDeCarguePendiente("ana@aceros.co", "Norte", "N-E-1",
                Validalo.Aplicacion.Expedientes.AvisoDePlazo.Recordatorio, Vence, 3), "tok").Html, "Completar en Valídalo"),
            (Redactor().Redactar(Acceso(PlantillaCorreo.InvitacionDeUsuario) with { Empresa = "Grupo Norte" }, "-").Html, "Entrar a Valídalo"),
        };

        foreach (var (html, texto) in botones)
        {
            html.ShouldContain($">{System.Net.WebUtility.HtmlEncode(texto)}</a>"); // el texto del botón va codificado en HTML (í → &#237;)
            html.ShouldContain("background-color:#2F55D9");
            html.ShouldContain("color:#FFFFFF");
            html.ShouldContain("text-decoration:none");
            html.ShouldNotContain($"<p><a href=\"https://valida.test/e/tok\">{texto}</a></p>");
        }
    }

    [Fact]
    public void Las_fechas_de_los_correos_con_enlace_a_la_observacion_van_en_hora_local()
    {
        var mensaje = Redactor().RedactarObservacion(new CorreoDeObservacionPendiente("ana@aceros.co", "Norte", "N-E-1", [new ObservacionParaCorreo(["Ilegible"], null)],
            EnlaceExpira: Vence), "tok");

        mensaje.Texto.ShouldContain("vence el 17 de noviembre de 2026, 10:08 p. m. (hora de Colombia)");
        mensaje.Html.ShouldContain("vence el 17 de noviembre de 2026, 10:08 p. m. (hora de Colombia)");
        mensaje.Texto.ShouldNotContain("UTC");
    }

    [Fact]
    public void El_aviso_de_seguridad_dice_cuando_paso_en_hora_local()
    {
        var mensaje = CorreoDeSeguridadPendienteHandler.Redactar(new CorreoDeSeguridadPendiente("ana@aceros.co", "Ana", TiposDeAvisoDeSeguridad.PasskeyRegistrada, "Mi celular",
            false, null, null, Vence), "https://valida.test/app/");

        mensaje.Texto.ShouldContain("el 17 de noviembre de 2026, 10:08 p. m. (hora de Colombia)");
        mensaje.Texto.ShouldNotContain("UTC");
    }

    [Fact]
    public void La_aprobacion_llega_al_tercero_con_el_enlace_para_ver_su_certificado()
    {
        var mensaje = Redactor().RedactarResultado(new CorreoDeResultadoPendiente("ana@aceros.co", "Constructora Norte S.A.S.", "NORTE-E-2026-000001", true, []));

        mensaje.Asunto.ShouldBe("Constructora Norte S.A.S. aprobó tu validación NORTE-E-2026-000001");
        mensaje.Texto.ShouldContain("tu vínculo está activo y ya tienes tu certificado");
        mensaje.Texto.ShouldContain("https://valida.test");
        mensaje.Texto.ShouldNotContain("Motivos");
    }
}
