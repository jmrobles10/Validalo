using System.Text.Json;
using Validalo.Aplicacion.Expedientes;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Terceros;
using Validalo.Dominio.Vinculos;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La liga automática de la certificación bancaria general a su cuenta por el número que la IA leyó (CB-8, 2026-11-24): liga con una sola cuenta activa sin certificación propia,
/// no adivina con dos coincidencias ni pisa la propia, y lo ligado sigue visible para la empresa con la que ya estaba compartido y cubriendo su requisito.
/// </summary>
public class LigaDeCertificacionPorNumeroTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 11, 24, 9, 0, 0, TimeSpan.FromHours(-5));
    private static readonly Guid Tercero = Guid.NewGuid();
    private static readonly TipoDocumentoCanonico Tipo = CatalogoCanonico.Requerido(CatalogoCanonico.CertificacionBancaria);

    private static Documento General() => Documento.Create(Documento.CrearGlobal(Tercero, Tipo, Ahora));

    private static Documento DeCuenta(Guid cuentaId) =>
        Documento.Create(Documento.CrearDeCuenta(Tercero, cuentaId, Tipo, Documento.NombreDeCertificacion(Tipo.Nombre, "Davivienda", "****7097"), Ahora));

    private static void Cargar(Documento d, string sha, MotivoDeDevolucion? devolucion = null)
    {
        var archivo = new ArchivoVerificado(d.SiguienteNumero, sha, "boveda", $"terceros/{Tercero:N}/{sha}", "application/pdf", "application/pdf", 1000, "certificacion.pdf", 1, null,
            Tercero.ToString());
        foreach (var e in d.RegistrarVersionArchivo(archivo, devolucion, Antivirus.NoDisponible, false, Ahora))
            d.Aplicar(e);
    }

    /// <summary>Le pone a la versión el análisis de IA con lo que el analizador leería de la certificación (sin el número cuando <paramref name="numeroCuenta"/> es nulo).</summary>
    private static void Analizar(Documento d, int version, string? numeroCuenta, bool legible = true)
    {
        var campos = new Dictionary<string, JsonElement>
        {
            ["banco"] = JsonSerializer.SerializeToElement("Davivienda S.A."),
            ["tipoCuenta"] = JsonSerializer.SerializeToElement("Cuenta corriente"),
            ["titular"] = JsonSerializer.SerializeToElement("ATLAS SERVICES SAS"),
            ["identificacionTitular"] = JsonSerializer.SerializeToElement("9011788768"),
            ["estadoCuenta"] = JsonSerializer.SerializeToElement("Activa")
        };
        if (numeroCuenta is not null)
            campos["numeroCuenta"] = JsonSerializer.SerializeToElement(numeroCuenta);
        var analisis = new AnalisisDeIaRegistrado(version, "gpt-test", false, 0.93m, legible, "CERTIFICACION_BANCARIA", campos, [], 1, 0, 100, 100, 0m, Guid.NewGuid(), Guid.NewGuid(), Ahora);
        d.Aplicar(d.RegistrarAnalisisDeIa(analisis).ShouldNotBeNull());
    }

    private static Documento GeneralLeida(string? numeroCuenta)
    {
        var general = General();
        Cargar(general, "g1");
        Analizar(general, 1, numeroCuenta);
        return general;
    }

    private static CuentaParaLigar Cuenta(string? numero, bool conPropia = false) => new(Guid.NewGuid(), numero, conPropia);

    // ---------- el número leído ----------

    [Theory]
    [InlineData("007469997097", "7469997097")]
    [InlineData("7469997097", "7469997097")]
    [InlineData("031-123456-78", "3112345678")]
    [InlineData("4700 1234 9999", "470012349999")]
    [InlineData("Cta. 0074 6999 7097", "7469997097")]
    public void El_numero_se_normaliza_a_digitos_sin_ceros_a_la_izquierda_como_lo_compara_el_cruce(string escrito, string esperado) =>
        LigaDeCertificacionPorNumero.Normalizar(escrito).ShouldBe(esperado);

    [Fact]
    public void Solo_la_certificacion_bancaria_global_sin_cuenta_es_candidata_a_ligarse()
    {
        LigaDeCertificacionPorNumero.EsCandidata(General()).ShouldBeTrue();
        LigaDeCertificacionPorNumero.EsCandidata(DeCuenta(Guid.NewGuid())).ShouldBeFalse();
        LigaDeCertificacionPorNumero.EsCandidata(Documento.Create(Documento.CrearGlobal(Tercero, CatalogoCanonico.Requerido("RUT"), Ahora))).ShouldBeFalse();

        var ligada = General();
        ligada.Aplicar(ligada.LigarACuenta(Guid.NewGuid(), "x", Ahora).ShouldNotBeNull());
        LigaDeCertificacionPorNumero.EsCandidata(ligada).ShouldBeFalse(); // ya es de una cuenta: idempotente
    }

    [Fact]
    public void El_numero_leido_sale_de_la_version_actual_cuando_la_ia_la_leyo_con_seguridad()
    {
        LigaDeCertificacionPorNumero.NumeroLeido(GeneralLeida("007469997097")).ShouldBe("7469997097");
    }

    [Fact]
    public void Sin_lectura_ilegible_sin_numero_o_con_un_numero_demasiado_corto_no_hay_numero_para_ligar()
    {
        var sinLectura = General();
        Cargar(sinLectura, "g1");
        LigaDeCertificacionPorNumero.NumeroLeido(sinLectura).ShouldBeNull();

        var ilegible = General();
        Cargar(ilegible, "g1");
        Analizar(ilegible, 1, "007469997097", legible: false);
        LigaDeCertificacionPorNumero.NumeroLeido(ilegible).ShouldBeNull();

        LigaDeCertificacionPorNumero.NumeroLeido(GeneralLeida(null)).ShouldBeNull();
        LigaDeCertificacionPorNumero.NumeroLeido(GeneralLeida("7097")).ShouldBeNull();

        var devuelta = General();
        Cargar(devuelta, "g0", new MotivoDeDevolucion("pdf-con-contenido-activo", "El PDF trae contenido activo."));
        devuelta.VersionActual.ShouldBeNull();
        LigaDeCertificacionPorNumero.NumeroLeido(devuelta).ShouldBeNull();
    }

    [Fact]
    public void Lo_que_ya_es_de_una_cuenta_no_tiene_numero_para_ligar()
    {
        var deCuenta = DeCuenta(Guid.NewGuid());
        Cargar(deCuenta, "c1");
        Analizar(deCuenta, 1, "007469997097");
        LigaDeCertificacionPorNumero.NumeroLeido(deCuenta).ShouldBeNull();
    }

    // ---------- la decisión ----------

    [Fact]
    public void Con_el_numero_de_una_sola_cuenta_sin_certificacion_propia_se_liga_a_esa_cuenta()
    {
        var atlas = Cuenta("7469997097");
        var decision = LigaDeCertificacionPorNumero.Decidir("7469997097", [Cuenta("031-123456-78"), atlas, Cuenta("4700 1234 9999")]);

        (decision.Resultado, decision.CuentaId).ShouldBe((ResultadoDeLiga.Ligar, atlas.CuentaId));
    }

    [Fact]
    public void El_numero_se_compara_sin_importar_ceros_espacios_ni_guiones()
    {
        var cuenta = Cuenta("0074-6999 7097");
        LigaDeCertificacionPorNumero.Decidir("7469997097", [cuenta]).CuentaId.ShouldBe(cuenta.CuentaId);
    }

    [Fact]
    public void Con_dos_cuentas_con_el_mismo_numero_no_adivina()
    {
        var decision = LigaDeCertificacionPorNumero.Decidir("7469997097", [Cuenta("7469997097"), Cuenta("007469997097")]);

        (decision.Resultado, decision.CuentaId).ShouldBe((ResultadoDeLiga.Ambigua, null));
    }

    [Fact]
    public void Con_dos_cuentas_con_el_mismo_numero_no_adivina_aunque_una_ya_tenga_su_certificacion()
    {
        LigaDeCertificacionPorNumero.Decidir("7469997097", [Cuenta("7469997097", conPropia: true), Cuenta("7469997097")]).Resultado.ShouldBe(ResultadoDeLiga.Ambigua);
    }

    [Fact]
    public void No_pisa_la_certificacion_propia_de_la_cuenta()
    {
        var decision = LigaDeCertificacionPorNumero.Decidir("7469997097", [Cuenta("7469997097", conPropia: true), Cuenta("031-123456-78")]);

        (decision.Resultado, decision.CuentaId).ShouldBe((ResultadoDeLiga.YaTienePropia, null));
    }

    [Fact]
    public void Sin_coincidencia_o_sin_numero_no_se_liga_y_una_cuenta_que_no_se_pudo_descifrar_no_participa()
    {
        LigaDeCertificacionPorNumero.Decidir("7469997097", [Cuenta("031-123456-78")]).Resultado.ShouldBe(ResultadoDeLiga.SinCoincidencia);
        LigaDeCertificacionPorNumero.Decidir("7469997097", []).Resultado.ShouldBe(ResultadoDeLiga.SinCoincidencia);
        LigaDeCertificacionPorNumero.Decidir("7469997097", [Cuenta(null)]).Resultado.ShouldBe(ResultadoDeLiga.SinCoincidencia);
        LigaDeCertificacionPorNumero.Decidir(null, [Cuenta("7469997097")]).Resultado.ShouldBe(ResultadoDeLiga.SinNumero);
        LigaDeCertificacionPorNumero.Decidir("", [Cuenta("7469997097")]).Resultado.ShouldBe(ResultadoDeLiga.SinNumero);
    }

    // ---------- lo ligado sigue visible y cubriendo el requisito de la empresa ----------

    [Fact]
    public void La_certificacion_ligada_sigue_compartida_con_la_empresa_y_cubriendo_su_requisito()
    {
        var general = GeneralLeida("007469997097");
        var vinculoId = Guid.NewGuid();
        var otroVinculoId = Guid.NewGuid();
        var tipoDelTenant = Guid.NewGuid();
        var sinCompartir = new VinculoCandidato(otroVinculoId, Guid.NewGuid(), Guid.NewGuid(), Tercero, true, EstadoVinculo.EnValidacion, true);
        general.Aplicar(general.Compartir(new VinculoCandidato(vinculoId, Guid.NewGuid(), Guid.NewGuid(), Tercero, true, EstadoVinculo.EnValidacion, true), OrigenComparticion.Automatica, Ahora)
            .ShouldNotBeNull());
        var antes = RequisitosDeExpediente.Cubre(tipoDelTenant, CatalogoCanonico.CertificacionBancaria, AmbitoDocumento.Global, [general], vinculoId).ShouldNotBeNull();

        var cuenta = Cuenta("7469997097");
        var decision = LigaDeCertificacionPorNumero.Decidir(LigaDeCertificacionPorNumero.NumeroLeido(general), [cuenta]);
        decision.CuentaId.ShouldBe(cuenta.CuentaId);
        general.Aplicar(general.LigarACuenta(cuenta.CuentaId, Documento.NombreDeCertificacion(Tipo.Nombre, "Davivienda", "****7097"), Ahora).ShouldNotBeNull());

        // Ahora es la certificación de la cuenta (sus versiones, su lectura y su compartición siguen) y el requisito de esa empresa la sigue cubriendo con la misma versión.
        general.CuentaBancariaId.ShouldBe(cuenta.CuentaId);
        general.EstaCompartida(1, vinculoId).ShouldBeTrue();
        general.Buscar(1)!.Ia.ShouldNotBeNull();
        var despues = RequisitosDeExpediente.Cubre(tipoDelTenant, CatalogoCanonico.CertificacionBancaria, AmbitoDocumento.Global, [general], vinculoId).ShouldNotBeNull();
        (despues.DocumentoId, despues.Numero).ShouldBe((antes.DocumentoId, antes.Numero));
        // Otra empresa con la que no estaba compartida no la ve cubrir nada: ligar no comparte con nadie.
        general.EstaCompartida(1, sinCompartir.VinculoId).ShouldBeFalse();
        RequisitosDeExpediente.Cubre(tipoDelTenant, CatalogoCanonico.CertificacionBancaria, AmbitoDocumento.Global, [general], otroVinculoId).ShouldBeNull();
    }

    [Fact]
    public void Repetir_la_liga_no_cambia_nada()
    {
        var general = GeneralLeida("007469997097");
        var cuenta = Cuenta("7469997097");
        general.Aplicar(general.LigarACuenta(cuenta.CuentaId, "x", Ahora).ShouldNotBeNull());

        general.LigarACuenta(cuenta.CuentaId, "x", Ahora).ShouldBeNull();
        LigaDeCertificacionPorNumero.NumeroLeido(general).ShouldBeNull(); // ya no es candidata: el manejador responde «no aplica»
    }
}
