using System.Text.Json;
using Validalo.Dominio.Documentos;

namespace Validalo.Dominio.Tests;

/// <summary>
/// Antigüedad máxima al subir (TD-10): el documento debe haberse expedido hace no más de N días contados hasta la carga. La fecha es la que lee la IA; la que
/// declara el tercero se coteja (si difiere, es evidencia) pero manda la de la IA, y si la IA no la encuentra no se puede verificar aunque el tercero la declare.
/// </summary>
public class AntiguedadDelDocumentoTests
{
    // El caso real: una certificación bancaria expedida el 17/07/2024 y subida el 24/11/2026 con una antigüedad máxima de 30 días.
    private static readonly DateOnly Carga = new(2026, 11, 24);
    private static readonly DateOnly Expedida = new(2024, 7, 17);

    [Fact]
    public void Sin_regla_no_se_evalua_nada()
    {
        AntiguedadDelDocumento.Evaluar(null, Carga, true, Expedida, null).ShouldBeNull();
        AntiguedadDelDocumento.Evaluar(0, Carga, true, Expedida, null).ShouldBeNull();
    }

    [Fact]
    public void Una_certificacion_expedida_hace_mas_de_dos_anos_supera_el_maximo_de_30_dias_y_es_un_hallazgo_critico()
    {
        var r = AntiguedadDelDocumento.Evaluar(30, Carga, true, Expedida, null).ShouldNotBeNull();

        (r.Estado, r.Dias, r.MaximoDias, r.Fuente, r.EsCritico, r.Resultado).ShouldBe((EstadoDeAntiguedad.Excedida, 860, 30, FuenteDeFechaDeExpedicion.Ia, true, "Discrepa"));
        AntiguedadDelDocumento.Detalle(r).ShouldBe("Expedida el 17/07/2024: 860 días; el máximo es 30.");
        AntiguedadDelDocumento.MensajeAlTercero(r, "Certificación bancaria").ShouldBe("Sube el documento «Certificación bancaria» expedido hace menos de 30 días.");
    }

    [Theory]
    [InlineData(0, EstadoDeAntiguedad.Cumple)]
    [InlineData(29, EstadoDeAntiguedad.Cumple)]
    [InlineData(30, EstadoDeAntiguedad.Cumple)] // el límite es inclusivo: «máximo 30 días»
    [InlineData(31, EstadoDeAntiguedad.Excedida)]
    public void Dentro_o_fuera_del_limite_segun_los_dias_entre_la_expedicion_y_la_carga(int dias, EstadoDeAntiguedad estado)
    {
        var r = AntiguedadDelDocumento.Evaluar(30, Carga, true, Carga.AddDays(-dias), null).ShouldNotBeNull();

        (r.Estado, r.Dias, r.EsCritico).ShouldBe((estado, dias, estado == EstadoDeAntiguedad.Excedida));
        r.Resultado.ShouldBe(estado == EstadoDeAntiguedad.Cumple ? "Coincide" : "Discrepa");
        AntiguedadDelDocumento.MensajeAlTercero(r, "RUT").ShouldBe(estado == EstadoDeAntiguedad.Cumple ? null : "Sube el documento «RUT» expedido hace menos de 30 días.");
    }

    [Fact]
    public void Una_fecha_de_expedicion_futura_cuenta_como_cero_dias()
    {
        AntiguedadDelDocumento.Evaluar(30, Carga, true, Carga.AddDays(3), null)!.Dias.ShouldBe(0);
    }

    [Fact]
    public void Si_la_IA_no_encuentra_la_fecha_no_se_puede_verificar_aunque_el_tercero_la_haya_declarado()
    {
        var sinDeclarar = AntiguedadDelDocumento.Evaluar(30, Carga, true, null, null).ShouldNotBeNull();
        (sinDeclarar.Estado, sinDeclarar.EsCritico, sinDeclarar.Resultado).ShouldBe((EstadoDeAntiguedad.SinFecha, true, "NoVerificable"));
        AntiguedadDelDocumento.MensajeAlTercero(sinDeclarar, "Cámara de comercio")
            .ShouldBe("Sube el documento «Cámara de comercio» expedido hace menos de 30 días y que muestre su fecha de expedición.");

        var declarada = AntiguedadDelDocumento.Evaluar(30, Carga, true, null, Carga.AddDays(-2)).ShouldNotBeNull();
        (declarada.Estado, declarada.FechaDeclarada, declarada.Dias).ShouldBe((EstadoDeAntiguedad.SinFecha, Carga.AddDays(-2), null));
        AntiguedadDelDocumento.Detalle(declarada).ShouldContain("El tercero declaró el 22/11/2026.");
    }

    [Fact]
    public void Si_la_IA_y_el_tercero_difieren_manda_la_fecha_de_la_IA_y_la_diferencia_queda_como_evidencia()
    {
        // El tercero declara que es de hoy; el documento dice 2024: la regla usa la del documento.
        var r = AntiguedadDelDocumento.Evaluar(30, Carga, true, Expedida, Carga).ShouldNotBeNull();

        (r.Estado, r.DifiereDeLaDeclarada, r.FechaDeExpedicion, r.FechaDeclarada).ShouldBe((EstadoDeAntiguedad.Excedida, true, Expedida, Carga));
        AntiguedadDelDocumento.Detalle(r).ShouldBe("Expedida el 17/07/2024: 860 días; el máximo es 30. El tercero declaró otra fecha: 24/11/2026.");

        // Coinciden: no hay diferencia que mostrar.
        AntiguedadDelDocumento.Evaluar(30, Carga, true, Carga.AddDays(-5), Carga.AddDays(-5))!.DifiereDeLaDeclarada.ShouldBeFalse();
    }

    [Fact]
    public void Sin_lectura_de_la_IA_aun_no_se_dice_nada_salvo_en_un_tipo_que_no_se_lee()
    {
        // Un tipo que se lee, pero la lectura aún no llega (o la empresa no la consumió): no se evalúa con lo declarado.
        var pendiente = AntiguedadDelDocumento.Evaluar(30, Carga, false, null, Carga.AddDays(-2), tipoSeLee: true).ShouldNotBeNull();
        (pendiente.Estado, pendiente.EsCritico, pendiente.Dias).ShouldBe((EstadoDeAntiguedad.SinLectura, false, null));
        AntiguedadDelDocumento.MensajeAlTercero(pendiente, "RUT").ShouldBeNull();

        // Un tipo propio sin esquema de IA solo tiene lo que declara el tercero: se evalúa con eso.
        var declarada = AntiguedadDelDocumento.Evaluar(30, Carga, false, null, Carga.AddDays(-40), tipoSeLee: false).ShouldNotBeNull();
        (declarada.Estado, declarada.Fuente, declarada.Dias).ShouldBe((EstadoDeAntiguedad.Excedida, FuenteDeFechaDeExpedicion.Declarada, 40));
        AntiguedadDelDocumento.Detalle(declarada).ShouldContain("(declarada por el tercero)");

        // Sin lectura y sin nada declarado no hay con qué evaluar.
        AntiguedadDelDocumento.Evaluar(30, Carga, false, null, null, tipoSeLee: false)!.Estado.ShouldBe(EstadoDeAntiguedad.SinLectura);
    }

    [Theory]
    [InlineData("""{ "fechaExpedicion": "2024-07-17" }""", "2024-07-17")]
    [InlineData("""{ "fechaExpedicion": "2024-07-17T10:20:30Z" }""", "2024-07-17")]
    [InlineData("""{ "fechaExpedicion": "17/07/2024" }""", null)]
    [InlineData("""{ "fechaExpedicion": null }""", null)]
    [InlineData("""{ "otro": "2024-07-17" }""", null)]
    [InlineData("""{ "datos": [ { "clave": "banco", "valor": "X" }, { "clave": "fechaExpedicion", "valor": "2025-01-31" } ] }""", "2025-01-31")]
    public void La_fecha_que_lee_la_IA_sale_del_campo_o_del_par_de_los_tipos_genericos(string json, string? esperada)
    {
        var campos = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json)!;

        AntiguedadDelDocumento.FechaLeida(campos).ShouldBe(esperada is null ? null : DateOnly.Parse(esperada));
    }
}
