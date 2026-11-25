using System.Text.Json;
using Validalo.Aplicacion.Vinculos;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identificaciones;
using Validalo.Dominio.Terceros;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La certificación bancaria por cuenta (CB-1, decidido por el usuario el 2026-11-24: una certificación por cuenta): cada cuenta tiene su documento propio con sus versiones,
/// designar exige la de esa cuenta, la certificación vieja sin cuenta se liga a la única cuenta activa y el cruce se hace contra la cuenta a la que pertenece.
/// </summary>
public class CertificacionPorCuentaTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 11, 24, 9, 0, 0, TimeSpan.FromHours(-5));
    private static readonly Guid Tercero = Guid.NewGuid();
    private static readonly TipoDocumentoCanonico Tipo = CatalogoCanonico.Requerido(CatalogoCanonico.CertificacionBancaria);

    private static string Codigo(Action accion) => Should.Throw<ReglaDeNegocioException>(accion).Codigo;

    private static CuentaBancaria Cuenta(string numero, string banco = "Bancolombia") =>
        CuentaBancaria.Registrar(Tercero, new DatosDeCuentaBancaria("CO", banco, "Ahorros", numero, "Aceros del Norte S.A.S.", "NIT 900373913", null), n => $"p({n})", Ahora);

    private static Documento CertificacionDe(CuentaBancaria cuenta) =>
        Documento.Create(Documento.CrearDeCuenta(Tercero, cuenta.Id, Tipo, Documento.NombreDeCertificacion(Tipo.Nombre, cuenta.Banco, cuenta.NumeroEnmascarado), Ahora));

    private static Documento General() => Documento.Create(Documento.CrearGlobal(Tercero, Tipo, Ahora));

    private static void Cargar(Documento d, string sha, MotivoDeDevolucion? devolucion = null)
    {
        var archivo = new ArchivoVerificado(d.SiguienteNumero, sha, "boveda", $"terceros/{Tercero:N}/{sha}", "application/pdf", "application/pdf", 1000, "certificacion.pdf", 1, null,
            Tercero.ToString());
        foreach (var e in d.RegistrarVersionArchivo(archivo, devolucion, Antivirus.NoDisponible, false, Ahora))
            d.Aplicar(e);
    }

    /// <summary>Le pone al documento el análisis de IA de su versión, con las marcas que el analizador leería de la certificación.</summary>
    private static void Analizar(Documento d, int version, string numeroCuenta, string identificacionTitular = "900373913", bool legible = true, string banco = "Bancolombia S.A.")
    {
        var campos = JsonSerializer.SerializeToElement(new
        {
            banco, tipoCuenta = "Cuenta de ahorros", numeroCuenta, titular = "ACEROS DEL NORTE SAS", identificacionTitular
        }).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
        var analisis = new AnalisisDeIaRegistrado(version, "gpt-test", false, 0.93m, legible, "CERTIFICACION_BANCARIA", campos, [], 1, 0, 100, 100, 0m, Guid.NewGuid(), Guid.NewGuid(), Ahora);
        d.Aplicar(d.RegistrarAnalisisDeIa(analisis).ShouldNotBeNull());
    }

    private static Tercero Dueno() => Dominio.Terceros.Tercero.Crear(Identificacion.Crear("CO", "NIT", "900373913"), TipoPersona.Juridica, "Aceros del Norte S.A.S.", null, null, Ahora);

    // ---------- ligar la certificación a su cuenta ----------

    [Fact]
    public void Cada_cuenta_tiene_su_propio_documento_de_certificacion_con_su_clave_y_su_nombre()
    {
        var cuenta = Cuenta("031-123456-78");
        var certificacion = CertificacionDe(cuenta);

        certificacion.CuentaBancariaId.ShouldBe(cuenta.Id);
        (certificacion.Ambito, certificacion.TipoCanonico, certificacion.Clase).ShouldBe((AmbitoDocumento.Global, "CERTIFICACION_BANCARIA", ClaseDocumento.Archivo));
        certificacion.ClaveNatural.ShouldBe(Documento.ClaveDeCuenta(Tercero, cuenta.Id));
        certificacion.ClaveNatural.ShouldNotBe(Documento.ClaveGlobal(Tercero, "CERTIFICACION_BANCARIA")); // no es el documento general del tipo
        certificacion.NombreTipo.ShouldBe("Certificación bancaria · Bancolombia ****5678");
        certificacion.TerceroId.ShouldBe(Tercero);
    }

    [Fact]
    public void Solo_la_certificacion_bancaria_es_el_documento_de_una_cuenta()
    {
        var cuenta = Cuenta("031-123456-78");
        Codigo(() => Documento.CrearDeCuenta(Tercero, cuenta.Id, CatalogoCanonico.Requerido("RUT"), "RUT", Ahora)).ShouldBe("documento-no-es-de-cuenta");
    }

    [Fact]
    public void Dos_cuentas_con_dos_certificaciones_no_se_pisan()
    {
        var bancolombia = Cuenta("031-123456-78");
        var davivienda = Cuenta("4700 1234 9999", "Davivienda");
        var deBancolombia = CertificacionDe(bancolombia);
        var deDavivienda = CertificacionDe(davivienda);

        // Son dos documentos distintos, cada uno con su clave natural (la única por (tercero, cuenta)): subirle a una no toca la otra.
        deBancolombia.Id.ShouldNotBe(deDavivienda.Id);
        deBancolombia.ClaveNatural.ShouldNotBe(deDavivienda.ClaveNatural);
        Cargar(deBancolombia, "a1");
        Cargar(deDavivienda, "b1");
        Cargar(deBancolombia, "a2"); // la versión nueva de Bancolombia supera su v1, no la certificación de Davivienda

        deBancolombia.Versiones.Select(v => (v.Numero, v.Estado)).ShouldBe([(1, EstadoVersion.Superada), (2, EstadoVersion.Actual)]);
        deDavivienda.Versiones.Select(v => (v.Numero, v.Estado)).ShouldBe([(1, EstadoVersion.Actual)]);
        deDavivienda.VersionRequerida(1).Sha256.ShouldBe("b1");
        deBancolombia.VersionRequerida(2).Sha256.ShouldBe("a2");
        // El mismo archivo en otra cuenta no es un duplicado: cada documento tiene sus propias versiones.
        deDavivienda.DetectarDuplicado("a1", Ahora).ShouldBeNull();
    }

    [Fact]
    public void La_certificacion_general_de_antes_se_liga_a_su_cuenta_y_conserva_sus_versiones()
    {
        var cuenta = Cuenta("031-123456-78");
        var general = General();
        Cargar(general, "g1");
        Cargar(general, "g2");
        general.ClaveNatural.ShouldBe(Documento.ClaveGlobal(Tercero, "CERTIFICACION_BANCARIA"));

        var evento = general.LigarACuenta(cuenta.Id, "Certificación bancaria · Bancolombia ****5678", Ahora).ShouldNotBeNull();
        general.Aplicar(evento);

        general.CuentaBancariaId.ShouldBe(cuenta.Id);
        general.ClaveNatural.ShouldBe(Documento.ClaveDeCuenta(Tercero, cuenta.Id));
        general.NombreTipo.ShouldBe("Certificación bancaria · Bancolombia ****5678");
        general.Versiones.Count.ShouldBe(2);
        general.VersionActual.ShouldBe(2);
        Documento.CertificacionVigenteRequerida(cuenta.Id, general).ShouldBeSameAs(general);
    }

    [Fact]
    public void Ligar_dos_veces_a_la_misma_cuenta_no_repite_el_evento_y_a_otra_cuenta_es_un_conflicto()
    {
        var cuenta = Cuenta("031-123456-78");
        var otra = Cuenta("4700 1234 9999", "Davivienda");
        var general = General();
        general.Aplicar(general.LigarACuenta(cuenta.Id, "x", Ahora).ShouldNotBeNull());

        general.LigarACuenta(cuenta.Id, "x", Ahora).ShouldBeNull(); // idempotente
        Codigo(() => general.LigarACuenta(otra.Id, "y", Ahora)).ShouldBe("certificacion-ya-ligada");
    }

    [Fact]
    public void Solo_el_documento_global_de_la_certificacion_bancaria_se_liga_a_una_cuenta()
    {
        var cuenta = Cuenta("031-123456-78");
        var rut = Documento.Create(Documento.CrearGlobal(Tercero, CatalogoCanonico.Requerido("RUT"), Ahora));
        Codigo(() => rut.LigarACuenta(cuenta.Id, "x", Ahora)).ShouldBe("documento-no-es-de-cuenta");
    }

    // ---------- designar exige la certificación de esa cuenta ----------

    [Fact]
    public void Designar_sin_la_certificacion_de_esa_cuenta_es_un_422()
    {
        var bancolombia = Cuenta("031-123456-78");
        var davivienda = Cuenta("4700 1234 9999", "Davivienda");

        // Sin ningún documento.
        Codigo(() => Documento.CertificacionVigenteRequerida(davivienda.Id, null)).ShouldBe("certificacion-requerida");

        // La certificación de otra cuenta no sirve.
        var deBancolombia = CertificacionDe(bancolombia);
        Cargar(deBancolombia, "a1");
        Codigo(() => Documento.CertificacionVigenteRequerida(davivienda.Id, deBancolombia)).ShouldBe("certificacion-requerida");

        // Tampoco la general sin cuenta de la bóveda.
        var general = General();
        Cargar(general, "g1");
        Codigo(() => Documento.CertificacionVigenteRequerida(davivienda.Id, general)).ShouldBe("certificacion-requerida");

        // Ni la de la cuenta sin versión actual (la que subió se devolvió).
        var deDavivienda = CertificacionDe(davivienda);
        Cargar(deDavivienda, "d0", new MotivoDeDevolucion("pdf-con-contenido-activo", "El PDF trae contenido activo."));
        deDavivienda.VersionActual.ShouldBeNull();
        Codigo(() => Documento.CertificacionVigenteRequerida(davivienda.Id, deDavivienda)).ShouldBe("certificacion-requerida");

        // Con una versión actual de su propia certificación sí.
        Cargar(deDavivienda, "d1");
        Documento.CertificacionVigenteRequerida(davivienda.Id, deDavivienda).ShouldBeSameAs(deDavivienda);
        CertificacionesDeCuentas.TieneVigente(deDavivienda).ShouldBeTrue();
        CertificacionesDeCuentas.TieneVigente(null).ShouldBeFalse();
    }

    // ---------- el cruce contra la cuenta correcta ----------

    [Fact]
    public void El_cruce_se_hace_contra_la_cuenta_a_la_que_pertenece_cada_certificacion()
    {
        var bancolombia = Cuenta("031-123456-78");
        var davivienda = Cuenta("4700 1234 9999", "Davivienda");
        var deBancolombia = CertificacionDe(bancolombia);
        var deDavivienda = CertificacionDe(davivienda);
        Cargar(deBancolombia, "a1");
        Cargar(deDavivienda, "b1");
        Analizar(deBancolombia, 1, "03112345678");
        Analizar(deDavivienda, 1, "470012349999", banco: "Davivienda S.A.");
        var dueno = Dueno();

        var propia = CertificacionesDeCuentas.ParaElTercero(bancolombia, deBancolombia, dueno, p => p["p(".Length..^1]).ShouldNotBeNull();
        propia.Verificacion.ShouldBe("Coincide");
        propia.DiscrepanciaCritica.ShouldBeFalse();
        propia.DocumentoId.ShouldBe(deBancolombia.Id);
        CertificacionesDeCuentas.ParaElTercero(davivienda, deDavivienda, dueno, p => p["p(".Length..^1]).ShouldNotBeNull().Verificacion.ShouldBe("Coincide");

        // Con la certificación de la otra cuenta el número no coincide (lo crítico se destaca) y el número completo nunca sale.
        var cruzada = CertificacionesDeCuentas.ParaElTercero(bancolombia, deDavivienda, dueno, p => p["p(".Length..^1]).ShouldNotBeNull();
        cruzada.Verificacion.ShouldBe("Discrepa");
        cruzada.DiscrepanciaCritica.ShouldBeTrue();
        var numero = cruzada.Campos.Single(c => c.Campo == "numero");
        (numero.Resultado, numero.Declarado, numero.Extraido).ShouldBe(("Discrepa", "****5678", "****9999"));
        JsonSerializer.Serialize(cruzada).ShouldNotContain("03112345678");
        JsonSerializer.Serialize(cruzada).ShouldNotContain("470012349999");
    }

    [Fact]
    public void Sin_lectura_de_ia_la_certificacion_queda_sin_analisis_y_una_devuelta_dice_por_que()
    {
        var cuenta = Cuenta("031-123456-78");
        var certificacion = CertificacionDe(cuenta);
        Cargar(certificacion, "a1");

        var sinLectura = CertificacionesDeCuentas.ParaElTercero(cuenta, certificacion, Dueno(), p => p).ShouldNotBeNull();
        (sinLectura.Verificacion, sinLectura.Version, sinLectura.Estado).ShouldBe(("SinAnalisis", 1, "Actual"));
        sinLectura.Campos.ShouldBeEmpty();

        // Si lo que subió se devolvió, el tercero ve la versión devuelta con su motivo y no hay cruce.
        var cuentaDevuelta = Cuenta("4700 1234 9999", "Davivienda");
        var devuelta = CertificacionDe(cuentaDevuelta);
        Cargar(devuelta, "d0", new MotivoDeDevolucion("pdf-con-contenido-activo", "El PDF trae contenido activo."));
        var visible = CertificacionesDeCuentas.ParaElTercero(cuentaDevuelta, devuelta, Dueno(), p => p).ShouldNotBeNull();
        (visible.Estado, visible.MotivoDevolucion, visible.Verificacion).ShouldBe(("Devuelta", "El PDF trae contenido activo.", "SinAnalisis"));

        // Una cuenta sin certificación no tiene nada que mostrar.
        CertificacionesDeCuentas.ParaElTercero(cuenta, null, Dueno(), p => p).ShouldBeNull();
    }

    [Fact]
    public void El_resumen_del_cruce_distingue_lo_que_coincide_lo_que_discrepa_y_lo_que_no_se_pudo_verificar()
    {
        CruceDeSeccion Cruce(string numero, string identificacionTitular = "900373913", bool legible = true, object? extra = null)
        {
            var campos = JsonSerializer.SerializeToElement(extra ?? new { banco = "Bancolombia", tipoCuenta = "Ahorros", numeroCuenta = numero, titular = "ACEROS DEL NORTE SAS", identificacionTitular })
                .EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            return CruceConDocumento.CruzarCuenta(new DatosDeCuentaParaCruce("Bancolombia", "Ahorros", "03112345678", "Aceros del Norte S.A.S.", "NIT 900373913"),
                "Aceros del Norte S.A.S.", "900373913", Guid.NewGuid(), 1, campos, 0.9m, legible, Ahora);
        }

        ResumenDeCruceDeCuenta.De(null).ShouldBe(VerificacionDeCuenta.SinAnalisis);
        ResumenDeCruceDeCuenta.De(Cruce("03112345678")).ShouldBe(VerificacionDeCuenta.Coincide);
        ResumenDeCruceDeCuenta.De(Cruce("99999999999")).ShouldBe(VerificacionDeCuenta.Discrepa);
        ResumenDeCruceDeCuenta.De(Cruce("03112345678", "800111222")).ShouldBe(VerificacionDeCuenta.Discrepa); // el titular no es el tercero
        ResumenDeCruceDeCuenta.De(Cruce("03112345678", legible: false)).ShouldBe(VerificacionDeCuenta.NoSeLee);
        // Sin el número en el documento lo crítico no se pudo verificar; sin el banco ni el tipo (evidencia) sí se da por verificada.
        ResumenDeCruceDeCuenta.De(Cruce("x", extra: new { titular = "ACEROS DEL NORTE SAS", identificacionTitular = "900373913" })).ShouldBe(VerificacionDeCuenta.NoVerificable);
        ResumenDeCruceDeCuenta.De(Cruce("03112345678", extra: new { numeroCuenta = "03112345678", titular = "ACEROS DEL NORTE SAS", identificacionTitular = "900373913" }))
            .ShouldBe(VerificacionDeCuenta.Coincide);
    }

    [Fact]
    public void Una_certificacion_sin_el_estado_de_la_cuenta_queda_verificada_si_lo_demas_coincide_CB_12()
    {
        // CB-12 (decisión del usuario, 2026-11-25): el estado de la cuenta ya no se valida, así que que la IA no lo lea no deja la certificación «sin verificar».
        var campos = JsonSerializer.SerializeToElement(new
        {
            banco = "Bancolombia S.A.", tipoCuenta = "Cuenta de ahorros", numeroCuenta = "03112345678", titular = "ACEROS DEL NORTE SAS", identificacionTitular = "900373913"
        }).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
        var cruce = CruceConDocumento.CruzarCuenta(new DatosDeCuentaParaCruce("Bancolombia", "Ahorros", "03112345678", "Aceros del Norte S.A.S.", "NIT 900373913"),
            "Aceros del Norte S.A.S.", "900373913", Guid.NewGuid(), 1, campos, 0.9m, true, Ahora);

        cruce.Campos.Select(c => c.Campo).ShouldNotContain("estado_cuenta");
        cruce.Campos.Where(c => c.Critico).Select(c => c.Campo).ShouldBe(["numero", "titular", "identificacion_titular", "titular_es_el_tercero"]);
        cruce.Campos.Where(c => c.Critico).ShouldAllBe(c => c.Resultado == ResultadoDeCruce.Coincide);
        ResumenDeCruceDeCuenta.De(cruce).ShouldBe(VerificacionDeCuenta.Coincide);
    }
}
