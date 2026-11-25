using Validalo.Dominio.Documentos;

namespace Validalo.Dominio.Tests;

/// <summary>
/// Vigencia de un documento que se revalida cada N días desde que la empresa lo aprueba (TD-10): revalidar cada 30 días, aviso a los 10 días y 5 de gracia
/// (el certificado propio de Sur). El mismo día, según cuándo lo aprobó la empresa, el documento queda vigente, por vencer, en gracia o vencido; la fecha de
/// expedición ya no cuenta para la vigencia (es la antigüedad máxima, una condición al subirlo).
/// </summary>
public class VigenciaPorRevalidacionTests
{
    private static readonly DateOnly Hoy = new(2026, 11, 12);
    private static readonly DateTimeOffset Ahora = new(2026, 11, 12, 9, 0, 0, TimeSpan.FromHours(-5));
    private const int DiasDeRevalidacion = 30;
    private const int DiasDeAviso = 10;
    private const int DiasDeGracia = 5;

    [Theory]
    [InlineData(3, 27, EstadoVigencia.Vigente, 32)]
    [InlineData(25, 5, EstadoVigencia.PorVencer, 10)]
    [InlineData(32, -2, EstadoVigencia.EnGracia, 3)]
    [InlineData(40, -10, EstadoVigencia.Vencida, -5)]
    public void Aprobado_hace_3_25_32_o_40_dias_queda_vigente_por_vencer_en_gracia_o_vencido_con_su_fecha_de_vencimiento_y_el_fin_de_su_gracia(
        int diasDesdeLaAprobacion, int diasParaVencer, EstadoVigencia estado, int diasParaElFinDeLaGracia)
    {
        var aprobada = Ahora.AddDays(-diasDesdeLaAprobacion);

        var calculo = CalculadoraDeVigencia.Calcular(ReglasDeVigencia.SoloRevalidacion(DiasDeRevalidacion), null, aprobada);

        calculo.ShouldBe(new CalculoDeVigencia(Hoy.AddDays(diasParaVencer), BaseVigencia.Aprobacion));
        CalculadoraDeVigencia.FinDeGracia(calculo.VigenteHasta, DiasDeGracia).ShouldBe(Hoy.AddDays(diasParaElFinDeLaGracia));
        CalculadoraDeVigencia.Estado(calculo.VigenteHasta, [DiasDeAviso], DiasDeGracia, Hoy).ShouldBe(estado);
    }

    [Fact]
    public void Sin_aprobar_el_documento_no_tiene_fecha_aunque_haya_sido_expedido_hace_mucho()
    {
        var expedicion = new DatoDeclarado(EsquemaDeFormulario.FechaExpedicion, "Fecha de expedición", TipoCampo.Fecha, Hoy.AddDays(-400).ToString("yyyy-MM-dd"));

        CalculadoraDeVigencia.Calcular(ReglasDeVigencia.SoloRevalidacion(DiasDeRevalidacion), [expedicion])
            .ShouldBe(new CalculoDeVigencia(null, BaseVigencia.SinVencimiento));
    }

    [Fact]
    public void Si_el_tercero_ratifica_despues_de_la_aprobacion_el_plazo_corre_desde_la_ratificacion_y_si_la_aprobacion_es_posterior_desde_la_aprobacion()
    {
        var reglas = ReglasDeVigencia.SoloRevalidacion(DiasDeRevalidacion);
        var aprobada = Ahora.AddDays(-20);
        var ratificada = Ahora.AddDays(-2);

        CalculadoraDeVigencia.Calcular(reglas, null, aprobada, ratificada).ShouldBe(new CalculoDeVigencia(Hoy.AddDays(-2 + DiasDeRevalidacion), BaseVigencia.Ratificacion));
        // La renovación se aprueba después de la ratificación: cuenta la aprobación, la más reciente.
        CalculadoraDeVigencia.Calcular(reglas, null, Ahora, ratificada).ShouldBe(new CalculoDeVigencia(Hoy.AddDays(DiasDeRevalidacion), BaseVigencia.Aprobacion));
        // Ratificado y sin aprobación registrada (datos anteriores): cuenta la ratificación.
        CalculadoraDeVigencia.Calcular(reglas, null, null, ratificada).Base.ShouldBe(BaseVigencia.Ratificacion);
    }

    [Theory]
    [InlineData(BaseVigencia.FechaCarga, true)]
    [InlineData(BaseVigencia.FechaExpedicion, true)]
    [InlineData(BaseVigencia.Aprobacion, false)]
    [InlineData(BaseVigencia.Ratificacion, false)]
    [InlineData(BaseVigencia.SinVencimiento, false)]
    [InlineData(BaseVigencia.VencimientoPropio, false)]
    public void Una_vigencia_con_la_base_anterior_a_TD_10_en_la_version_actual_se_reconoce_como_heredada_y_se_repara_al_recalcularla(BaseVigencia @base, bool heredada)
    {
        var documento = new Documento { VersionActual = 2 };
        documento.Versiones.Add(new VersionDocumento { Numero = 1, Vigencias = [new VigenciaDeVersion { VinculoId = Guid.NewGuid(), Base = BaseVigencia.FechaCarga }] });
        documento.Versiones.Add(new VersionDocumento { Numero = 2, Vigencias = [new VigenciaDeVersion { VinculoId = Guid.NewGuid(), Base = @base }] });

        documento.TieneVigenciaHeredada.ShouldBe(heredada);
        // Una versión anterior (superada) con la base vieja no cuenta: solo importa la actual.
        new Documento { VersionActual = 2, Versiones = [documento.Versiones[0], new VersionDocumento { Numero = 2 }] }.TieneVigenciaHeredada.ShouldBeFalse();
        new Documento().TieneVigenciaHeredada.ShouldBeFalse();
    }
}
