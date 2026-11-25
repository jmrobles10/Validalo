using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;

namespace Validalo.Dominio.Tests;

/// <summary>
/// Reglas de frescura de un tipo de documento (TD-10): dos independientes y opcionales (antigüedad máxima al subir y revalidar cada N días), lo que sugiere
/// el catálogo y la traducción de la regla heredada (<see cref="ReglaFrescura"/>), que es también la migración de los tipos ya configurados.
/// </summary>
public class FrescuraDelTipoTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 11, 25, 15, 0, 0, TimeSpan.Zero);

    private static TipoDocumentoTenant Crear(string? canonico = null, ReglaFrescura? heredada = null, int? antiguedad = null, int? revalidar = null) =>
        TipoDocumentoTenant.Crear(Guid.NewGuid(), canonico ?? "PROPIO", canonico is null ? "Tipo propio" : null, canonico, null, heredada, null, null, null, null, Ahora,
            antiguedadMaximaDias: antiguedad, revalidarCadaDias: revalidar);

    private static string Codigo(Action accion) => Should.Throw<ReglaDeNegocioException>(accion).Codigo;

    [Fact]
    public void El_catalogo_sugiere_antiguedad_y_revalidacion_segun_el_documento()
    {
        CatalogoCanonico.Requerido("CAMARA_COMERCIO").FrescuraSugerida.ShouldBe(ReglasDeVigencia.Ambas(30, 365));
        CatalogoCanonico.Requerido("CERTIFICACION_BANCARIA").FrescuraSugerida.ShouldBe(ReglasDeVigencia.Ambas(30, 365));
        CatalogoCanonico.Requerido("RUT").FrescuraSugerida.ShouldBe(ReglasDeVigencia.SoloRevalidacion(365));
        CatalogoCanonico.Requerido("CEDULA").FrescuraSugerida!.SinReglas.ShouldBeTrue();
        // El periodo (sin fecha) se conserva como regla heredada.
        CatalogoCanonico.Requerido("ESTADOS_FINANCIEROS").ReglaFrescuraSugerida.ShouldBe(ReglaFrescura.Periodo("ultimo-anio-fiscal-cerrado"));
        CatalogoCanonico.Requerido("CAMARA_COMERCIO").ReglaFrescuraSugerida.ShouldBeNull();
    }

    [Fact]
    public void Un_tipo_nuevo_de_un_canonico_nace_con_las_reglas_que_sugiere_y_un_propio_sin_ninguna()
    {
        var camara = Crear("CAMARA_COMERCIO");
        (camara.AntiguedadMaximaDias, camara.RevalidarCadaDias, camara.ReglaFrescura).ShouldBe((30, 365, ReglaFrescura.Ninguna));

        var propio = Crear();
        (propio.AntiguedadMaximaDias, propio.RevalidarCadaDias).ShouldBe((null, null));
        propio.Frescura.SinReglas.ShouldBeTrue();

        // Pedir otras reglas, o ninguna explícita, no toma las sugeridas.
        var distinto = Crear("CAMARA_COMERCIO", antiguedad: 15);
        (distinto.AntiguedadMaximaDias, distinto.RevalidarCadaDias).ShouldBe((15, null));
        var sinNinguna = Crear("CAMARA_COMERCIO", heredada: ReglaFrescura.Ninguna);
        (sinNinguna.AntiguedadMaximaDias, sinNinguna.RevalidarCadaDias).ShouldBe((null, null));
    }

    [Fact]
    public void Las_dos_reglas_son_independientes_y_un_cero_quita_la_regla()
    {
        var tipo = Crear(antiguedad: 30, revalidar: 365);

        tipo.Actualizar(null, null, null, null, null, null, null, null, antiguedadMaximaDias: 0);
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias).ShouldBe((null, 365)); // quitó solo la antigüedad

        tipo.Actualizar(null, null, null, null, null, null, null, null, revalidarCadaDias: 90);
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias).ShouldBe((null, 90));

        tipo.Actualizar("Otro nombre", null, null, null, null, null, null, null); // nulos conservan
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias).ShouldBe((null, 90));

        tipo.Actualizar(null, null, null, null, null, null, null, null, antiguedadMaximaDias: 7, revalidarCadaDias: 0);
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias).ShouldBe((7, null));
    }

    [Theory]
    [InlineData(-1, null, "antiguedad-invalida")]
    [InlineData(3651, null, "antiguedad-invalida")]
    [InlineData(null, -5, "revalidacion-invalida")]
    [InlineData(null, 3651, "revalidacion-invalida")]
    public void Los_dias_fuera_de_rango_se_rechazan_sin_cambiar_nada(int? antiguedad, int? revalidar, string codigo)
    {
        var tipo = Crear(antiguedad: 30, revalidar: 365);

        Codigo(() => tipo.Actualizar(null, null, null, null, null, null, null, null, antiguedad, revalidar)).ShouldBe(codigo);
        (tipo.AntiguedadMaximaDias, tipo.RevalidarCadaDias).ShouldBe((30, 365));
        Codigo(() => Crear(antiguedad: antiguedad, revalidar: revalidar)).ShouldBe(codigo);
    }

    [Theory]
    // MaxDiasDesdeAprobacion(n) ⇒ revalidar cada n días.
    [InlineData(TipoReglaFrescura.MaxDiasDesdeAprobacion, 365, null, 365)]
    // MaxDiasDesdeExpedicion(n) ⇒ antigüedad máxima de n días y revalidar cada n días.
    [InlineData(TipoReglaFrescura.MaxDiasDesdeExpedicion, 30, 30, 30)]
    [InlineData(TipoReglaFrescura.MaxDiasDesdeExpedicion, 365, 365, 365)]
    public void La_regla_heredada_se_traduce_a_las_dos_reglas_nuevas(TipoReglaFrescura tipoDeRegla, int dias, int? antiguedad, int? revalidar)
    {
        var heredada = new ReglaFrescura(tipoDeRegla, dias);

        ReglasDeVigencia.DeHeredada(heredada).ShouldBe(new ReglasDeVigencia(antiguedad, revalidar));
        // Al crear o actualizar por la API de antes se guarda ya traducida y la regla heredada queda sin efecto.
        var creado = Crear(heredada: heredada);
        (creado.AntiguedadMaximaDias, creado.RevalidarCadaDias, creado.ReglaFrescura).ShouldBe((antiguedad, revalidar, ReglaFrescura.Ninguna));
    }

    [Fact]
    public void El_periodo_minimo_y_ninguna_no_cambian()
    {
        ReglasDeVigencia.DeHeredada(ReglaFrescura.Periodo("ultimo-anio")).ShouldBe(ReglasDeVigencia.DePeriodo("ultimo-anio"));
        ReglasDeVigencia.DeHeredada(ReglaFrescura.Ninguna).SinReglas.ShouldBeTrue();
        var conPeriodo = Crear(heredada: ReglaFrescura.Periodo("ultimo-anio"));
        conPeriodo.ReglaFrescura.ShouldBe(ReglaFrescura.Periodo("ultimo-anio"));
        // Cambiar la antigüedad no pierde el periodo.
        conPeriodo.Actualizar(null, null, null, null, null, null, null, null, antiguedadMaximaDias: 10);
        (conPeriodo.AntiguedadMaximaDias, conPeriodo.ReglaFrescura).ShouldBe((10, ReglaFrescura.Periodo("ultimo-anio")));
    }

    [Fact]
    public void La_regla_heredada_mal_formada_sigue_rechazandose()
    {
        Codigo(() => Crear(heredada: new ReglaFrescura(TipoReglaFrescura.MaxDiasDesdeExpedicion, 0))).ShouldBe("frescura-invalida");
        Codigo(() => Crear(heredada: new ReglaFrescura(TipoReglaFrescura.MaxDiasDesdeAprobacion))).ShouldBe("frescura-invalida");
        Codigo(() => Crear(heredada: new ReglaFrescura(TipoReglaFrescura.PeriodoMinimo))).ShouldBe("frescura-invalida");
    }

    [Fact]
    public void Un_tipo_guardado_antes_con_la_regla_heredada_se_lee_traducido_y_la_migracion_lo_reescribe_una_sola_vez()
    {
        // Como lo dejó Marten antes de TD-10: la regla heredada y ningún campo nuevo.
        var guardado = new TipoDocumentoTenant { ReglaFrescura = ReglaFrescura.DiasDesdeExpedicion(30) };

        guardado.TraeReglaHeredada.ShouldBeTrue();
        guardado.Frescura.ShouldBe(ReglasDeVigencia.Ambas(30, 30)); // se lee ya traducido: nada se comporta distinto

        guardado.MigrarReglaHeredada().ShouldBeTrue();
        (guardado.AntiguedadMaximaDias, guardado.RevalidarCadaDias, guardado.ReglaFrescura).ShouldBe((30, 30, ReglaFrescura.Ninguna));
        guardado.TraeReglaHeredada.ShouldBeFalse();
        guardado.MigrarReglaHeredada().ShouldBeFalse(); // idempotente

        var porAprobacion = new TipoDocumentoTenant { ReglaFrescura = ReglaFrescura.DiasDesdeAprobacion(365) };
        porAprobacion.MigrarReglaHeredada().ShouldBeTrue();
        (porAprobacion.AntiguedadMaximaDias, porAprobacion.RevalidarCadaDias).ShouldBe((null, 365));

        // Un periodo o ninguna regla no se tocan.
        var periodo = new TipoDocumentoTenant { ReglaFrescura = ReglaFrescura.Periodo("mes-en-curso") };
        periodo.MigrarReglaHeredada().ShouldBeFalse();
        periodo.ReglaFrescura.ShouldBe(ReglaFrescura.Periodo("mes-en-curso"));
        new TipoDocumentoTenant().MigrarReglaHeredada().ShouldBeFalse();
    }

    [Fact]
    public void Un_tipo_ya_reconfigurado_con_las_reglas_nuevas_nunca_vuelve_a_leer_la_heredada()
    {
        // Quedó «sin reglas» a propósito: la regla heredada que pudiera quedar de antes no revive.
        var tipo = Crear(heredada: ReglaFrescura.DiasDesdeExpedicion(30));
        tipo.Actualizar(null, null, null, null, null, null, null, null, antiguedadMaximaDias: 0, revalidarCadaDias: 0);

        tipo.Frescura.SinReglas.ShouldBeTrue();
        tipo.TraeReglaHeredada.ShouldBeFalse();
    }
}
