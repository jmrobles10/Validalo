using System.Text.Json;
using Validalo.Aplicacion.Vinculos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identificaciones;
using Validalo.Dominio.Terceros;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La antigüedad máxima (TD-10) que le exige cada empresa a la certificación bancaria de una cuenta, en «Mis cuentas»: es la misma evaluación del expediente
/// (<c>AntiguedadDeVersiones</c>), junta por empresa. El caso real: una certificación expedida el 17/07/2024 y una empresa que exige 30 días.
/// </summary>
public class AntiguedadDeLaCertificacionDeCuentaTests
{
    private static readonly DateTimeOffset Carga = new(2026, 11, 24, 9, 0, 0, TimeSpan.FromHours(-5));
    private static readonly Guid TerceroId = Guid.NewGuid();
    private static readonly TipoDocumentoCanonico Canonico = CatalogoCanonico.Requerido(CatalogoCanonico.CertificacionBancaria);

    /// <summary>El tipo «Certificación bancaria» de una empresa con esa antigüedad máxima; sin ella, un tipo propio sin reglas (el canónico trae una sugerida de 30 días que se aplica al crearlo).</summary>
    private static TipoDocumentoTenant Tipo(int? antiguedad) =>
        antiguedad is null
            ? TipoDocumentoTenant.Crear(Guid.NewGuid(), "PROPIO", "Tipo propio", null, null, null, null, null, null, null, Carga)
            : TipoDocumentoTenant.Crear(Guid.NewGuid(), "CERTIFICACION_BANCARIA", null, "CERTIFICACION_BANCARIA", null, null, null, null, null, null, Carga, antiguedadMaximaDias: antiguedad);

    private static CertificacionesDeCuentas.ReglaDeAntiguedad Regla(string empresa, int? antiguedad) => new(Guid.NewGuid(), empresa, Tipo(antiguedad));

    private static CuentaBancaria Cuenta() =>
        CuentaBancaria.Registrar(TerceroId, new DatosDeCuentaBancaria("CO", "Davivienda", "Ahorros", "031-123456-78", "Aceros del Norte S.A.S.", "NIT 900373913", null), n => $"p({n})", Carga);

    /// <summary>La certificación de la cuenta con su única versión, subida el 24/11/2026, y, si se da, lo que la IA leyó de su fecha de expedición.</summary>
    private static Documento Certificacion(CuentaBancaria cuenta, string? expedicionLeida, bool devuelta = false)
    {
        var d = Documento.Create(Documento.CrearDeCuenta(TerceroId, cuenta.Id, Canonico, Documento.NombreDeCertificacion(Canonico.Nombre, cuenta.Banco, cuenta.NumeroEnmascarado), Carga));
        var archivo = new ArchivoVerificado(d.SiguienteNumero, "sha-1", "boveda", $"terceros/{TerceroId:N}/sha-1", "application/pdf", "application/pdf", 1000, "certificacion.pdf", 1, null,
            TerceroId.ToString());
        var devolucion = devuelta ? new MotivoDeDevolucion("ilegible", "No se lee.") : (MotivoDeDevolucion?)null;
        foreach (var e in d.RegistrarVersionArchivo(archivo, devolucion, Antivirus.NoDisponible, false, Carga))
            d.Aplicar(e);
        if (expedicionLeida is not null && !devuelta)
        {
            var campos = JsonSerializer.SerializeToElement(new
            {
                banco = "Davivienda S.A.", tipoCuenta = "Cuenta de ahorros", numeroCuenta = "031-123456-78", titular = "ACEROS DEL NORTE SAS", identificacionTitular = "900373913",
                fechaExpedicion = expedicionLeida
            }).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
            var analisis = new AnalisisDeIaRegistrado(1, "gpt-test", false, 0.93m, true, "CERTIFICACION_BANCARIA", campos, [], 1, 0, 100, 100, 0m, Guid.NewGuid(), Guid.NewGuid(), Carga);
            d.Aplicar(d.RegistrarAnalisisDeIa(analisis).ShouldNotBeNull());
        }

        return d;
    }

    private static VersionDocumento? Visible(Documento d) => CertificacionesDeCuentas.VersionVisible(d);

    [Fact]
    public void Una_certificacion_expedida_en_2024_no_cumple_los_30_dias_de_la_empresa_y_se_le_dice_al_tercero_que_suba_una_reciente()
    {
        var documento = Certificacion(Cuenta(), "2024-07-17");

        var avisos = CertificacionesDeCuentas.Antiguedad(Visible(documento), [Regla("Sinco OK", 30)]);

        var aviso = avisos.ShouldHaveSingleItem();
        aviso.Empresa.ShouldBe("Sinco OK");
        (aviso.Antiguedad.Estado, aviso.Antiguedad.MaximoDias, aviso.Antiguedad.Critico).ShouldBe(("Excedida", 30, true));
        aviso.Antiguedad.Detalle.ShouldBe("Expedida el 17/07/2024: 860 días; el máximo es 30.");
        aviso.Antiguedad.Mensaje.ShouldBe("Sube el documento «Certificación bancaria» expedido hace menos de 30 días.");
    }

    [Fact]
    public void Con_varias_empresas_de_reglas_distintas_cada_una_trae_su_resultado_y_su_nombre()
    {
        // Expedida el 01/06/2026 y subida el 24/11/2026: 176 días. Cumple una regla de un año y no la de 30 días.
        var documento = Certificacion(Cuenta(), "2026-06-01");

        var avisos = CertificacionesDeCuentas.Antiguedad(Visible(documento), [Regla("Sinco OK", 30), Regla("Constructora Sur", 365)]);

        avisos.Select(a => (a.Empresa, a.Antiguedad.Estado, a.Antiguedad.MaximoDias, Pide: a.Antiguedad.Mensaje is not null)).ShouldBe(
        [
            ("Sinco OK", "Excedida", 30, true),
            ("Constructora Sur", "Cumple", 365, false)
        ]);
    }

    [Fact]
    public void Sin_lectura_de_la_IA_no_se_puede_decir_nada_todavia_y_no_se_pide_nada()
    {
        var documento = Certificacion(Cuenta(), expedicionLeida: null);

        var aviso = CertificacionesDeCuentas.Antiguedad(Visible(documento), [Regla("Sinco OK", 30)]).ShouldHaveSingleItem();

        (aviso.Antiguedad.Estado, aviso.Antiguedad.Mensaje).ShouldBe(("SinLectura", null));
    }

    [Fact]
    public void Una_empresa_que_no_exige_antiguedad_no_aparece_y_una_version_devuelta_no_se_evalua()
    {
        var cuenta = Cuenta();
        CertificacionesDeCuentas.Antiguedad(Visible(Certificacion(cuenta, "2024-07-17")), [Regla("Sin regla", null)]).ShouldBeEmpty();
        CertificacionesDeCuentas.Antiguedad(Visible(Certificacion(cuenta, "2024-07-17", devuelta: true)), [Regla("Sinco OK", 30)]).ShouldBeEmpty();
        CertificacionesDeCuentas.Antiguedad(null, [Regla("Sinco OK", 30)]).ShouldBeEmpty();
        CertificacionesDeCuentas.Antiguedad(Visible(Certificacion(cuenta, "2024-07-17")), []).ShouldBeEmpty();
    }

    [Fact]
    public void La_certificacion_de_la_cuenta_trae_la_antiguedad_junto_con_el_cruce_de_lo_declarado()
    {
        var cuenta = Cuenta();
        var documento = Certificacion(cuenta, "2024-07-17");
        var dueno = Tercero.Crear(Identificacion.Crear("CO", "NIT", "900373913"), TipoPersona.Juridica, "Aceros del Norte S.A.S.", null, null, Carga);

        var dto = CertificacionesDeCuentas.ParaElTercero(cuenta, documento, dueno, n => n[2..^1], [Regla("Sinco OK", 30)]).ShouldNotBeNull();

        dto.Verificacion.ShouldBe("Coincide");
        dto.Antiguedad.ShouldNotBeNull().ShouldHaveSingleItem().Antiguedad.Estado.ShouldBe("Excedida");
        // Sin reglas (ninguna empresa la exige o el tercero no tiene vínculos) la lista viene vacía, no nula.
        CertificacionesDeCuentas.ParaElTercero(cuenta, documento, dueno, n => n[2..^1])!.Antiguedad.ShouldNotBeNull().ShouldBeEmpty();
    }
}
