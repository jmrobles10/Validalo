using System.Text.Json;
using Validalo.Aplicacion.Revision;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Ia;
using Validalo.Dominio.Revision;
using Validalo.Dominio.Terceros;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La conclusión que la IA da del documento en cualquier nivel de revisión (Manual incluido): una sola regla —la del motor, la misma de la sugerencia del nivel Asistido y de las
/// excepciones del Automático— con lo que la empresa recibió del análisis, el cruce con lo declarado (la ficha o la persona de un documento de persona relacionada, ADR-0010)
/// y la antigüedad máxima del tipo.
/// </summary>
public class ConclusionDeRevisionTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 11, 25, 9, 0, 0, TimeSpan.FromHours(-5));
    private static readonly Guid Documento = Guid.Parse("22222222-2222-2222-2222-222222222222");
    private const decimal UmbralDelPlan = 0.85m;

    private static EntradaDeRevision Limpia(string tipo = "CEDULA") =>
        new(Documento, 1, tipo, 0, true, false, new AnalisisParaRevisar(0.98m, true, 0, tipo, 0), false, false, false);

    private static string[] Codigos(ConclusionDeRevision c) => [.. c.Motivos.Select(m => m.Codigo)];

    // ---------- el motor: Concluir ----------

    [Fact]
    public void Todo_verificado_concluye_aprobar_sin_motivos_y_con_la_confianza_del_analisis()
    {
        var conclusion = MotorDeRevision.Concluir(Limpia(), UmbralDelPlan);

        conclusion.Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
        conclusion.Motivos.ShouldBeEmpty();
        conclusion.Confianza.ShouldBe(0.98m);
    }

    public static IEnumerable<object[]> Hallazgos()
    {
        var limpia = Limpia();
        var analisis = limpia.Analisis!;
        yield return ["discrepancia crítica con lo declarado", limpia with { DiscrepanciaCritica = true, ConDiscrepancias = true }, new[] { "discrepancia-critica-ficha" }];
        yield return ["confianza bajo el umbral", limpia with { Analisis = analisis with { Confianza = 0.80m } }, new[] { "confianza-baja" }];
        yield return ["ilegible", limpia with { Analisis = analisis with { Legible = false } }, new[] { "ilegible" }];
        yield return ["tipo distinto", limpia with { Analisis = analisis with { TipoDetectado = "RUT" } }, new[] { "tipo-detectado-distinto" }];
        yield return ["señales de manipulación", limpia with { Analisis = analisis with { Alertas = 1 } }, new[] { "alertas-de-manipulacion" }];
        yield return ["versión reenviada", limpia with { Reenvios = 1 }, new[] { "version-reenviada" }];
        yield return ["sin análisis", limpia with { Analisis = null }, new[] { "sin-analisis-ia" }];
        yield return ["antigüedad excedida",
            limpia with { Antiguedad = new AntiguedadParaRevisar(EstadoDeAntiguedad.Excedida, "Expedida el 17/07/2024: 860 días; el máximo es 30.", "Sube uno reciente.", true) },
            new[] { "antiguedad-excedida" }];
        yield return ["sin fecha de expedición",
            limpia with { Antiguedad = new AntiguedadParaRevisar(EstadoDeAntiguedad.SinFecha, "No se encontró la fecha de expedición.", "Sube uno con fecha.", false) },
            new[] { "sin-fecha-de-expedicion" }];
    }

    [Theory]
    [MemberData(nameof(Hallazgos))]
    public void Cada_hallazgo_concluye_revisar_con_su_motivo(string nombre, EntradaDeRevision entrada, string[] codigos)
    {
        var conclusion = MotorDeRevision.Concluir(entrada, UmbralDelPlan);

        conclusion.Sugerencia.ShouldBe(SugerenciaDeRevision.Revisar, nombre);
        Codigos(conclusion).ShouldBe(codigos, nombre);
    }

    [Fact]
    public void Una_diferencia_solo_en_campos_no_criticos_no_es_motivo_en_ningun_nivel()
    {
        var entrada = Limpia() with { ConDiscrepancias = true };

        MotorDeRevision.Concluir(entrada, UmbralDelPlan).ShouldSatisfyAllConditions(c => c.Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar), c => c.Motivos.ShouldBeEmpty());
        MotorDeRevision.Decidir(entrada, new PoliticaDeRevision(NivelDeRevisionAutomatica.Asistido, 0.95m, 0, ["CEDULA"], 0, null))!.Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
        MotorDeRevision.Decidir(entrada, new PoliticaDeRevision(NivelDeRevisionAutomatica.Automatico, 0.95m, 0, ["CEDULA"], 0, null))!.Aprueba.ShouldBeTrue();
        // Lo crítico sí: con la diferencia crítica va a una persona, con su motivo.
        MotorDeRevision.Concluir(entrada with { DiscrepanciaCritica = true }, UmbralDelPlan).Motivos.Single().Codigo.ShouldBe("discrepancia-critica-ficha");
    }

    [Fact]
    public void Una_antiguedad_que_cumple_no_es_motivo()
    {
        var cumple = Limpia() with { Antiguedad = new AntiguedadParaRevisar(EstadoDeAntiguedad.Cumple, "Expedida el 20/11/2026: 5 días; el máximo es 30.", null, true) };

        MotorDeRevision.Concluir(cumple, UmbralDelPlan).Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
    }

    [Fact]
    public void El_texto_de_la_antiguedad_excedida_es_el_detalle_del_documento()
    {
        var detalle = "Expedida el 17/07/2024: 860 días; el máximo es 30.";
        var entrada = Limpia() with { Antiguedad = new AntiguedadParaRevisar(EstadoDeAntiguedad.Excedida, detalle, "x", true) };

        MotorDeRevision.Concluir(entrada, UmbralDelPlan).Motivos.Single().Texto.ShouldBe(detalle);
    }

    [Fact]
    public void La_confianza_baja_dice_la_confianza_y_el_umbral_que_se_uso()
    {
        var entrada = Limpia() with { Analisis = new AnalisisParaRevisar(0.80m, true, 0, "CEDULA", 0) };

        MotorDeRevision.Concluir(entrada, 0.85m).Motivos.Single().Texto.ShouldBe("La confianza del análisis (80 %) está bajo el umbral de la empresa (85 %).");
        MotorDeRevision.Concluir(entrada, 0.75m).Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar); // un umbral más bajo la deja pasar
    }

    [Fact]
    public void El_texto_de_la_confianza_baja_dice_si_el_umbral_es_el_del_plan_o_el_de_la_empresa()
    {
        var entrada = Limpia() with { Analisis = new AnalisisParaRevisar(0.80m, true, 0, "CEDULA", 0) };

        MotorDeRevision.Concluir(entrada, 0.85m, umbralDelPlan: true).Motivos.Single().Texto.ShouldBe("La confianza del análisis (80 %) está bajo el umbral del plan (85 %).");
        MotorDeRevision.Concluir(entrada, 0.85m).Motivos.Single().Texto.ShouldBe("La confianza del análisis (80 %) está bajo el umbral de la empresa (85 %).");
        // La política lo lleva: el motivo que registra la revisión automática dice lo mismo que la conclusión.
        MotorDeRevision.Decidir(entrada, new PoliticaDeRevision(NivelDeRevisionAutomatica.Asistido, 0.85m, 0, ["CEDULA"], 0, null, UmbralDelPlan: true))!.Motivos.Single().Texto
            .ShouldBe("La confianza del análisis (80 %) está bajo el umbral del plan (85 %).");
    }

    [Fact]
    public void El_detalle_de_la_discrepancia_reemplaza_el_texto_generico_del_motivo()
    {
        var generico = MotorDeRevision.Concluir(Limpia() with { DiscrepanciaCritica = true }, UmbralDelPlan).Motivos.Single();
        var concreto = MotorDeRevision.Concluir(Limpia() with { DiscrepanciaCritica = true, DetalleDeLaDiscrepancia = "El documento difiere de lo declarado en: Número de la cuenta." },
            UmbralDelPlan).Motivos.Single();

        generico.Texto.ShouldBe("El documento discrepa de la ficha en un campo crítico.");
        (concreto.Codigo, concreto.Texto).ShouldBe(("discrepancia-critica-ficha", "El documento difiere de lo declarado en: Número de la cuenta."));
    }

    [Fact]
    public void La_conclusion_no_mira_el_alcance_ni_el_nivel_ni_el_tope()
    {
        // Un tipo o un área sin autorizar dejan el documento fuera de la revisión automática, pero no cambian lo que la IA concluye de él.
        var entrada = Limpia() with { AreaAutorizada = false, AreaExigeVariasAprobaciones = true, TipoCanonico = "CEDULA" };

        MotorDeRevision.Concluir(entrada, UmbralDelPlan).Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
    }

    [Fact]
    public void Es_la_misma_regla_de_la_sugerencia_de_Asistido_y_de_las_excepciones_del_Automatico()
    {
        // Lo limpio: la conclusión aprueba, Asistido sugiere aprobar y Automático aprueba.
        MotorDeRevision.Decidir(Limpia(), new PoliticaDeRevision(NivelDeRevisionAutomatica.Asistido, 0.95m, 0, ["CEDULA"], 0, null))!.Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
        MotorDeRevision.Decidir(Limpia(), new PoliticaDeRevision(NivelDeRevisionAutomatica.Automatico, 0.95m, 0, ["CEDULA"], 0, null))!.Aprueba.ShouldBeTrue();

        foreach (var fila in Hallazgos())
        {
            var entrada = (EntradaDeRevision)fila[1];
            var conclusion = MotorDeRevision.Concluir(entrada, 0.95m);

            var asistido = MotorDeRevision.Decidir(entrada, new PoliticaDeRevision(NivelDeRevisionAutomatica.Asistido, 0.95m, 0, ["CEDULA"], 0, null))!;
            asistido.Sugerencia.ShouldBe(conclusion.Sugerencia, (string)fila[0]);
            asistido.Motivos.ShouldBe(conclusion.Motivos, (string)fila[0]);

            var automatico = MotorDeRevision.Decidir(entrada, new PoliticaDeRevision(NivelDeRevisionAutomatica.Automatico, 0.95m, 0, ["CEDULA"], 0, null))!;
            if (conclusion.Sugerencia == SugerenciaDeRevision.Aprobar)
                automatico.Aprueba.ShouldBeTrue((string)fila[0]);
            else
                Codigos(conclusion).ShouldBe(automatico.Motivos.Select(m => m.Codigo).ToArray(), (string)fila[0]);
        }
    }

    // ---------- el cruce de la persona de un documento de persona relacionada ----------

    private static Dictionary<string, JsonElement> Cedula(string numero = "1073250322", string nombres = "JOEL MATEO", string apellidos = "ROBLES ATUESTA") =>
        JsonSerializer.SerializeToElement(new { numero, nombres, apellidos, fechaExpedicion = "2019-03-12" }).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());

    private static CruceDeSeccion? Cruzar(Dictionary<string, JsonElement> extraidos, string? nombre = "JOEL MATEO ROBLES ATUESTA", string? numero = "1073250322", bool legible = true,
        string tipo = "CEDULA") => CruceConDocumento.CruzarPersona(nombre, numero, tipo, Documento, 1, extraidos, 0.98m, legible, Ahora);

    [Fact]
    public void La_cedula_de_la_persona_declarada_coincide_en_numero_y_en_nombres_y_apellidos()
    {
        var cruce = Cruzar(Cedula()).ShouldNotBeNull();

        cruce.Campos.Select(c => (c.Etiqueta, c.Resultado, c.Critico)).ShouldBe(
            [("Número de identificación", ResultadoDeCruce.Coincide, true), ("Nombres y apellidos", ResultadoDeCruce.Coincide, true)]);
        cruce.DiscrepanciaCritica.ShouldBeFalse();
    }

    [Fact]
    public void El_nombre_coincide_sin_importar_tildes_mayusculas_ni_el_orden_y_el_numero_sin_puntos_ni_ceros()
    {
        var cruce = Cruzar(Cedula("1.073.250.322", "joel mateo", "róbles atuesta"), "ATUESTA ROBLES JOEL MATEO", "01073250322").ShouldNotBeNull();

        cruce.Campos.ShouldAllBe(c => c.Resultado == ResultadoDeCruce.Coincide);
    }

    [Fact]
    public void La_cedula_de_otra_persona_discrepa_en_lo_critico()
    {
        var cruce = Cruzar(Cedula("52123456", "ANA MARIA", "GOMEZ RUIZ")).ShouldNotBeNull();

        cruce.Campos.Select(c => (c.Etiqueta, c.Resultado)).ShouldBe(
            [("Número de identificación", ResultadoDeCruce.Discrepa), ("Nombres y apellidos", ResultadoDeCruce.Discrepa)]);
        cruce.DiscrepanciaCritica.ShouldBeTrue();
    }

    [Fact]
    public void Un_numero_igual_con_otro_nombre_discrepa_solo_en_el_nombre()
    {
        var cruce = Cruzar(Cedula(nombres: "JOEL", apellidos: "ROBLES")).ShouldNotBeNull();

        cruce.Campos.Single(c => c.Resultado == ResultadoDeCruce.Discrepa).Etiqueta.ShouldBe("Nombres y apellidos");
        cruce.Campos.Single(c => c.Etiqueta == "Número de identificación").Resultado.ShouldBe(ResultadoDeCruce.Coincide);
    }

    [Fact]
    public void Un_dato_que_el_documento_no_trae_no_se_puede_verificar_y_uno_ilegible_tampoco()
    {
        var sinNombre = JsonSerializer.SerializeToElement(new { numero = "1073250322" }).EnumerateObject().ToDictionary(p => p.Name, p => p.Value.Clone());
        Cruzar(sinNombre).ShouldNotBeNull().Campos.Single(c => c.Etiqueta == "Nombres y apellidos").Resultado.ShouldBe(ResultadoDeCruce.NoVerificable);

        var ilegible = Cruzar(Cedula("52123456", "ANA", "GOMEZ"), legible: false).ShouldNotBeNull();
        ilegible.Campos.ShouldAllBe(c => c.Resultado == ResultadoDeCruce.NoVerificable);
        ilegible.DiscrepanciaCritica.ShouldBeFalse();
    }

    [Fact]
    public void El_pasaporte_y_los_antecedentes_se_cruzan_con_sus_campos_de_nombre()
    {
        var antecedentes = JsonSerializer.SerializeToElement(new { numero = "1073250322", nombre = "ROBLES ATUESTA JOEL MATEO" }).EnumerateObject()
            .ToDictionary(p => p.Name, p => p.Value.Clone());

        Cruzar(antecedentes, tipo: "CERTIFICADO_ANTECEDENTES").ShouldNotBeNull().Campos.ShouldAllBe(c => c.Resultado == ResultadoDeCruce.Coincide);
    }

    // ---------- la entrada: lo que la empresa recibió y lo que cruza ----------

    private static RequisitoDeExpediente RequisitoDePersona(string nombre = "JOEL MATEO ROBLES ATUESTA", string identificacion = "CO CC 1073250322", bool conPersona = true) =>
        new()
        {
            Id = Guid.NewGuid(),
            TipoCanonico = "CEDULA",
            Nombre = "Fotocopia de la cédula del representante legal",
            VersionActual = new VersionDeRequisito(Documento, 1, "hash", Ahora),
            Persona = new PersonaDelRequisito(Guid.NewGuid(), TipoRelacionTerceros.RepresentanteLegal, false, conPersona ? Guid.NewGuid() : null, null, nombre, identificacion)
        };

    private static VersionDocumento Version(Dictionary<string, JsonElement> campos, bool legible = true, decimal confianza = 0.98m) =>
        new() { Numero = 1, Clase = ClaseDocumento.Archivo, Ia = new AnalisisDeIaDeVersion { Confianza = confianza, Legible = legible, TipoDetectado = "CEDULA", Campos = campos, Fecha = Ahora } };

    private static PlanDeIaEmpresa PlanActivo(int incluidas = 10) => new() { Id = Guid.NewGuid(), Activo = true, ValidacionesIncluidasMes = incluidas };

    private static UsoMensualIa Uso(int incluidasConsumidas = 0) => new() { Id = "x", EmpresaId = Guid.NewGuid(), Mes = "2026-11", IncluidasConsumidas = incluidasConsumidas };

    [Fact]
    public void La_cedula_de_la_persona_declarada_arma_una_entrada_que_concluye_aprobar()
    {
        var requisito = RequisitoDePersona();
        var version = Version(Cedula());
        var lectura = EntradasDeRevision.Leer(version, consumida: true, PlanActivo(), Uso(), iaHabilitada: true);
        var cruce = EntradasDeRevision.CruceDePersona(requisito, version, lectura);

        var entrada = EntradasDeRevision.Armar(requisito, lectura, null, cruce, null, areaAutorizada: true, areaExigeVariasAprobaciones: false);

        (entrada.DiscrepanciaCritica, entrada.ConDiscrepancias, entrada.CrucePendiente).ShouldBe((false, false, false));
        MotorDeRevision.Concluir(entrada, UmbralDelPlan).Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
    }

    [Fact]
    public void La_cedula_de_otra_persona_concluye_revisar_y_el_motivo_dice_con_quien_no_coincide_y_en_que()
    {
        var requisito = RequisitoDePersona();
        var version = Version(Cedula("52123456", "ANA MARIA", "GOMEZ RUIZ"));
        var lectura = EntradasDeRevision.Leer(version, true, PlanActivo(), Uso(), true);
        var cruce = EntradasDeRevision.CruceDePersona(requisito, version, lectura);

        var entrada = EntradasDeRevision.Armar(requisito, lectura, null, cruce, null, true, false);
        var conclusion = MotorDeRevision.Concluir(entrada, UmbralDelPlan);

        conclusion.Sugerencia.ShouldBe(SugerenciaDeRevision.Revisar);
        var motivo = conclusion.Motivos.Single();
        motivo.Codigo.ShouldBe("discrepancia-critica-ficha");
        motivo.Texto.ShouldBe("El documento no coincide con la persona declarada, JOEL MATEO ROBLES ATUESTA (CC 1073250322): Número de identificación (declaró 1073250322; el documento trae 52123456); " +
                              "Nombres y apellidos (declaró JOEL MATEO ROBLES ATUESTA; el documento trae ANA MARIA GOMEZ RUIZ).");
    }

    [Fact]
    public void Sin_persona_que_cumpla_el_rol_sin_lectura_o_de_otro_tipo_no_hay_cruce_de_persona()
    {
        var version = Version(Cedula());
        var lectura = EntradasDeRevision.Leer(version, true, PlanActivo(), Uso(), true);

        EntradasDeRevision.CruceDePersona(RequisitoDePersona(conPersona: false), version, lectura).ShouldBeNull(); // nadie cumple el rol todavía
        EntradasDeRevision.CruceDePersona(RequisitoDePersona(), version, EntradasDeRevision.Leer(version, false, PlanActivo(), Uso(), true)).ShouldBeNull(); // la empresa no lo recibió
        var delTercero = RequisitoDePersona();
        delTercero.Persona = null;
        EntradasDeRevision.CruceDePersona(delTercero, version, lectura).ShouldBeNull(); // el documento es del propio tercero: lo cruza la ficha
        var rut = RequisitoDePersona();
        rut.TipoCanonico = "RUT";
        EntradasDeRevision.CruceDePersona(rut, version, lectura).ShouldBeNull();
    }

    [Fact]
    public void La_identificacion_de_la_persona_se_lee_sin_el_pais()
    {
        EntradasDeRevision.IdentificacionLegible("CO CC 1073250322").ShouldBe("CC 1073250322");
        EntradasDeRevision.PartesDeLaIdentificacion("CO CC 1073250322").ShouldBe(("CC", "1073250322"));
        EntradasDeRevision.PartesDeLaIdentificacion("CC 123").ShouldBe(("CC", "123"));
        EntradasDeRevision.PartesDeLaIdentificacion("123").ShouldBe((null, "123"));
        EntradasDeRevision.PartesDeLaIdentificacion(null).ShouldBe((null, string.Empty));
    }

    // ---------- lo que la empresa recibió del análisis ----------

    [Fact]
    public void Con_la_validacion_consumida_la_empresa_recibe_el_analisis()
    {
        var lectura = EntradasDeRevision.Leer(Version(Cedula()), consumida: true, PlanActivo(), Uso(), iaHabilitada: true);

        lectura.Analisis.ShouldNotBeNull().ShouldBe(new AnalisisParaRevisar(0.98m, true, 0, "CEDULA", 0));
        (lectura.IaPuedeLlegar, lectura.EmpresaUsaIa).ShouldBe((false, true));
    }

    [Fact]
    public void Sin_consumir_y_con_cupo_el_analisis_aun_puede_llegar_y_sin_cupo_ya_no()
    {
        var version = Version(Cedula());

        EntradasDeRevision.Leer(version, false, PlanActivo(incluidas: 10), Uso(), true).ShouldSatisfyAllConditions(
            l => l.Analisis.ShouldBeNull(), l => l.IaPuedeLlegar.ShouldBeTrue());
        EntradasDeRevision.Leer(version, false, PlanActivo(incluidas: 1), Uso(incluidasConsumidas: 1), true).ShouldSatisfyAllConditions(
            l => l.Analisis.ShouldBeNull(), l => l.IaPuedeLlegar.ShouldBeFalse(), l => l.EmpresaUsaIa.ShouldBeTrue());
    }

    [Fact]
    public void Una_lectura_que_fallo_no_va_a_llegar_y_sin_plan_activo_la_empresa_no_usa_IA()
    {
        var fallida = new VersionDocumento { Numero = 1, Clase = ClaseDocumento.Archivo, FalloIa = "tiempo agotado" };

        EntradasDeRevision.Leer(fallida, false, PlanActivo(), Uso(), true).IaPuedeLlegar.ShouldBeFalse();
        EntradasDeRevision.Leer(Version(Cedula()), false, null, Uso(), true).ShouldSatisfyAllConditions(l => l.EmpresaUsaIa.ShouldBeFalse(), l => l.IaPuedeLlegar.ShouldBeFalse());
        EntradasDeRevision.Leer(Version(Cedula()), true, null, Uso(), true).Analisis.ShouldNotBeNull(); // un análisis ya recibido se ve aunque el plan se haya apagado
    }

    // ---------- los hallazgos del cruce ----------

    private static SoporteDeSeccionesDto Soporte(params (string Etiqueta, string Resultado, bool Critico)[] campos) =>
        new(false, campos.Any(c => c.Critico && c.Resultado == "Discrepa"),
        [
            new SeccionRespaldadaDto("CUENTAS_BANCARIAS", "Cuenta de Davivienda ****7097", null, null,
                new CruceDeSeccionDto(Documento, 1, "CERTIFICACION_BANCARIA", "Certificación bancaria", 0.98m, true, Ahora, campos.Count(c => c.Resultado == "Coincide"),
                    campos.Count(c => c.Resultado == "Discrepa"), campos.Count(c => c.Resultado == "NoVerificable"), campos.Any(c => c.Critico && c.Resultado == "Discrepa"),
                    [.. campos.Select(c => new CampoCruzadoDto("x", c.Etiqueta, "d", "e", c.Resultado, c.Critico, null))]))
        ]);

    [Fact]
    public void Los_hallazgos_distinguen_lo_critico_que_difiere_de_lo_critico_sin_verificar()
    {
        var soporte = Soporte(("Número de la cuenta", "Discrepa", true), ("Identificación del titular", "NoVerificable", true), ("Banco", "Discrepa", false), ("Titular", "Coincide", true));

        var hallazgos = EntradasDeRevision.HallazgosDe(soporte, null);

        hallazgos.HayCruce.ShouldBeTrue();
        hallazgos.ConDiscrepancias.ShouldBeTrue();
        hallazgos.CriticosQueDifieren.Select(c => c.Descripcion()).ShouldBe(["Número de la cuenta (declaró d; el documento trae e)"]);
        hallazgos.CriticosSinVerificar.ShouldBe(["Identificación del titular"]);
        hallazgos.NoCriticosQueDifieren.Select(c => c.Etiqueta).ShouldBe(["Banco"]);
    }

    [Fact]
    public void Sin_cruces_no_hay_hallazgos_y_el_motivo_de_una_cuenta_dice_en_que_difiere()
    {
        EntradasDeRevision.HallazgosDe(null, null).ShouldSatisfyAllConditions(h => h.HayCruce.ShouldBeFalse(), h => h.ConDiscrepancias.ShouldBeFalse());

        var requisito = RequisitoDePersona();
        requisito.Persona = null;
        requisito.TipoCanonico = "CERTIFICACION_BANCARIA";
        var lectura = EntradasDeRevision.Leer(Version(Cedula()), true, PlanActivo(), Uso(), true);
        var entrada = EntradasDeRevision.Armar(requisito, lectura, Soporte(("Número de la cuenta", "Discrepa", true), ("Titular", "Discrepa", true)), null, null, true, false);

        entrada.DiscrepanciaCritica.ShouldBeTrue();
        entrada.DetalleDeLaDiscrepancia.ShouldBe("El documento difiere de lo declarado en Número de la cuenta (declaró d; el documento trae e); Titular (declaró d; el documento trae e).");
    }

    [Fact]
    public void El_RUT_con_solo_las_actividades_secundarias_distintas_se_sugiere_aprobar_y_la_diferencia_va_aparte_con_lo_declarado_y_lo_leido()
    {
        CampoCruzadoDto Campo(string etiqueta, string resultado, bool critico, string? declarado = "x", string? extraido = "x", string? detalle = null) =>
            new("c", etiqueta, declarado, extraido, resultado, critico, detalle);
        var campos = new[]
        {
            Campo("Número de identificación", "Coincide", true), Campo("Razón social", "Coincide", true),
            Campo("Actividades económicas secundarias", "Discrepa", false, declarado: null, extraido: "8129, 4330, 4799", detalle: "El documento trae 8129, 4330, 4799.")
        };
        var soporte = new SoporteDeSeccionesDto(false, false,
        [
            new SeccionRespaldadaDto("FICHA_GENERAL", "Información general", null, 1,
                new CruceDeSeccionDto(Documento, 1, "RUT", "RUT", 0.98m, true, Ahora, 2, 1, 0, false, campos))
        ]);
        var requisito = RequisitoDePersona();
        requisito.Persona = null;
        requisito.TipoCanonico = "RUT";
        var lectura = EntradasDeRevision.Leer(Version(Cedula()), true, PlanActivo(), Uso(), true);

        var entrada = EntradasDeRevision.Armar(requisito, lectura, soporte, null, null, true, false);
        var hallazgos = EntradasDeRevision.HallazgosDe(soporte, null);

        (entrada.DiscrepanciaCritica, entrada.ConDiscrepancias).ShouldBe((false, true));
        MotorDeRevision.Concluir(entrada with { Analisis = entrada.Analisis! with { TipoDetectado = "RUT" } }, UmbralDelPlan).Sugerencia.ShouldBe(SugerenciaDeRevision.Aprobar);
        hallazgos.CriticosQueDifieren.ShouldBeEmpty();
        hallazgos.NoCriticosQueDifieren.ShouldHaveSingleItem().Descripcion().ShouldBe("Actividades económicas secundarias (declaró —; el documento trae 8129, 4330, 4799)");
    }
}
