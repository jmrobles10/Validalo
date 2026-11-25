using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Flujos;
using Validalo.Dominio.Revision;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La antigüedad máxima al subir del tipo (TD-10) en la revisión automática: un hallazgo crítico que nunca se aprueba solo. En Asistido el motor sugiere revisar; en
/// Automático, si es el único hallazgo, el sistema observa el documento al tercero con lo que debe hacer; con otro hallazgo, o si no se pudo verificar la fecha que el tercero
/// declaró, lo decide una persona. También: de dónde cuenta «revalidar cada N días» en el expediente (la aprobación del requisito).
/// </summary>
public class RevisionAutomaticaAntiguedadTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 11, 25, 9, 0, 0, TimeSpan.FromHours(-5));
    private static readonly Guid Documento = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private static readonly AntiguedadParaRevisar Excedida = new(EstadoDeAntiguedad.Excedida, "Expedida el 17/07/2024: 860 días; el máximo es 30.",
        "Sube el documento «Certificación bancaria» expedido hace menos de 30 días.", false);

    private static readonly AntiguedadParaRevisar SinFecha = new(EstadoDeAntiguedad.SinFecha, "No se encontró la fecha de expedición en el documento.",
        "Sube el documento «Certificación bancaria» expedido hace menos de 30 días y que muestre su fecha de expedición.", false);

    private static EntradaDeRevision Limpia() =>
        new(Documento, 1, "CERTIFICACION_BANCARIA", 0, true, false, new AnalisisParaRevisar(0.97m, true, 0, "CERTIFICACION_BANCARIA", 0), false, false, false);

    private static PoliticaDeRevision Automatica() => new(NivelDeRevisionAutomatica.Automatico, 0.95m, 0, ["CERTIFICACION_BANCARIA"], 0, null);

    private static PoliticaDeRevision Asistida() => new(NivelDeRevisionAutomatica.Asistido, 0.95m, 0, ["CERTIFICACION_BANCARIA"], 0, null);

    [Fact]
    public void Una_antiguedad_que_cumple_no_cambia_la_decision()
    {
        var cumple = new AntiguedadParaRevisar(EstadoDeAntiguedad.Cumple, "Expedida el 10/11/2026: 14 días; el máximo es 30.", null, false);

        MotorDeRevision.Decidir(Limpia() with { Antiguedad = cumple }, Automatica())!.Resultado.ShouldBe(ResultadoDeRevision.AprobadaAutomaticamente);
        // Sin lectura aún no dice nada: el motivo lo da la falta de análisis.
        var pendiente = new AntiguedadParaRevisar(EstadoDeAntiguedad.SinLectura, "Aún no hay una lectura del documento.", null, false);
        MotorDeRevision.Decidir(Limpia() with { Antiguedad = pendiente }, Automatica())!.Resultado.ShouldBe(ResultadoDeRevision.AprobadaAutomaticamente);
    }

    [Fact]
    public void En_Automatico_la_antiguedad_excedida_como_unico_hallazgo_observa_al_tercero_con_el_siguiente_paso()
    {
        var decision = MotorDeRevision.Decidir(Limpia() with { Antiguedad = Excedida }, Automatica()).ShouldNotBeNull();

        decision.Resultado.ShouldBe(ResultadoDeRevision.Observada);
        decision.Observa.ShouldBeTrue();
        decision.Aprueba.ShouldBeFalse();
        decision.ObservacionAlTercero.ShouldBe("Sube el documento «Certificación bancaria» expedido hace menos de 30 días.");
        var motivo = decision.Motivos.ShouldHaveSingleItem();
        (motivo.Codigo, motivo.Texto).ShouldBe(("antiguedad-excedida", "Expedida el 17/07/2024: 860 días; el máximo es 30."));
    }

    [Fact]
    public void Sin_fecha_de_expedicion_que_nadie_declaro_tambien_se_observa_pero_si_el_tercero_la_declaro_lo_decide_una_persona()
    {
        var sinFecha = MotorDeRevision.Decidir(Limpia() with { Antiguedad = SinFecha }, Automatica())!;
        sinFecha.Resultado.ShouldBe(ResultadoDeRevision.Observada);
        sinFecha.Motivos.Select(m => m.Codigo).ShouldBe(["sin-fecha-de-expedicion"]);
        sinFecha.ObservacionAlTercero.ShouldEndWith("y que muestre su fecha de expedición.");

        // La IA no la encontró pero el tercero sí la declaró: no verificable, no se observa solo ni se aprueba.
        var declarada = MotorDeRevision.Decidir(Limpia() with { Antiguedad = SinFecha with { Declarada = true } }, Automatica())!;
        declarada.Resultado.ShouldBe(ResultadoDeRevision.Excepcion);
        declarada.Motivos.Select(m => m.Codigo).ShouldBe(["sin-fecha-de-expedicion"]);
        declarada.ObservacionAlTercero.ShouldBeNull();
    }

    [Fact]
    public void Con_otro_hallazgo_la_fecha_leida_puede_estar_mal_y_lo_decide_una_persona_con_todos_los_motivos()
    {
        var baja = new AnalisisParaRevisar(0.80m, true, 0, "CERTIFICACION_BANCARIA", 0);

        var decision = MotorDeRevision.Decidir(Limpia() with { Antiguedad = Excedida, Analisis = baja }, Automatica())!;

        decision.Resultado.ShouldBe(ResultadoDeRevision.Excepcion);
        decision.Motivos.Select(m => m.Codigo).ShouldBe(["confianza-baja", "antiguedad-excedida"]);
    }

    [Fact]
    public void En_Asistido_la_antiguedad_excedida_sugiere_revisar_y_queda_como_hallazgo_visible()
    {
        var decision = MotorDeRevision.Decidir(Limpia() with { Antiguedad = Excedida }, Asistida())!;

        (decision.Resultado, decision.Sugerencia).ShouldBe((ResultadoDeRevision.Sugerida, SugerenciaDeRevision.Revisar));
        decision.Motivos.Select(m => m.Codigo).ShouldBe(["antiguedad-excedida"]);
        decision.ObservacionAlTercero.ShouldBeNull(); // el sistema no observa: sugiere
    }

    // ---------- el expediente: la observación del sistema ----------

    private readonly Guid _area = Guid.NewGuid();
    private readonly Guid _banco = Guid.NewGuid();
    private readonly Guid _docBanco = Guid.NewGuid();

    private Expediente EnRevision() =>
        Expediente.Reproducir(null, Expediente.Abrir(
            new DatosDeApertura(Guid.NewGuid(), Guid.NewGuid(), TipoExpediente.Inicial, "NORTE-E-2026-000007", Guid.NewGuid(), "Aceros S.A.S.", "CO|NIT|900123456",
                Guid.NewGuid(), "PROVEEDOR", "Proveedor", new ActorDeExpediente(ActorTipo.Tercero, "tercero"), []),
            new FlujoParaExpediente(Guid.NewGuid(), Guid.NewGuid(), "PROV", "Proveedores", 1, OrigenFlujo.PorDefecto,
                [new EtapaDelFlujo(1, [new AreaDelFlujo(_area, "COMPRAS", "Compras", 1, false, false, null)])], PoliticaDevolucion.Inmediata, false),
            Ahora,
            [new RequisitoCalculado(_banco, Guid.NewGuid(), "CERTIFICACION_BANCARIA", "Certificación bancaria", "CERTIFICACION_BANCARIA", AmbitoDocumento.Global, true, [], null,
                new VersionDeRequisito(_docBanco, 1, "sha-banco-1", Ahora))]));

    private static PropuestaDeRevision Observar(Guid requisito, Guid area) =>
        new(requisito, area, 1, new DecisionDeRevision(ResultadoDeRevision.Observada, null, [MotivosDeRevision.De(MotivosDeRevision.AntiguedadExcedida)], 0.97m,
            "Sube el documento «Certificación bancaria» expedido hace menos de 30 días."));

    [Fact]
    public void El_sistema_observa_el_documento_con_el_motivo_de_frescura_y_el_siguiente_paso_y_el_expediente_vuelve_al_tercero()
    {
        var e = EnRevision();

        var eventos = e.RegistrarRevisionesAutomaticas([Observar(_banco, _area)], NivelDeRevisionAutomatica.Automatico, Ahora);
        e = Expediente.Reproducir(e, eventos);

        var veredicto = e.BuscarRequisito(_banco)!.Veredictos.ShouldHaveSingleItem();
        (veredicto.Veredicto, veredicto.Origen, veredicto.RevisorId, veredicto.SobreVersion).ShouldBe((Veredicto.Observado, OrigenVeredicto.Sistema, Expediente.RevisorAutomatico, 1));
        veredicto.Motivos.ShouldBe([new MotivoAplicado("frescura-incumplida", "El documento no cumple la antigüedad máxima exigida.")]);
        veredicto.Observacion.ShouldBe("Sube el documento «Certificación bancaria» expedido hace menos de 30 días.");
        e.BuscarRequisito(_banco)!.Estado.ShouldBe(EstadoRequisito.Observado);
        e.Estado.ShouldBe(EstadoExpediente.Observado);
        eventos.OfType<ExpedienteObservado>().ShouldHaveSingleItem();

        // Quedó registrada como una revisión resuelta (no abierta): no entra a la bandeja de excepciones.
        var revision = e.BuscarRequisito(_banco)!.Revisiones.ShouldHaveSingleItem();
        (revision.Resultado, revision.VeredictoId).ShouldBe((ResultadoDeRevision.Observada, veredicto.Id));
        e.RevisionAbierta(revision, e.BuscarRequisito(_banco)!).ShouldBeFalse();
        e.ExcepcionesDeRevisionPendientes.ShouldBe(0);
    }

    [Fact]
    public void Observar_dos_veces_la_misma_version_no_duplica_el_veredicto()
    {
        var e = EnRevision();
        e = Expediente.Reproducir(e, e.RegistrarRevisionesAutomaticas([Observar(_banco, _area)], NivelDeRevisionAutomatica.Automatico, Ahora));

        e.RegistrarRevisionesAutomaticas([Observar(_banco, _area)], NivelDeRevisionAutomatica.Automatico, Ahora).ShouldBeEmpty();
        e.BuscarRequisito(_banco)!.Veredictos.ShouldHaveSingleItem();
    }

    // ---------- «revalidar cada N días» cuenta desde la aprobación del requisito ----------

    [Fact]
    public void El_requisito_aprobado_dice_cuando_lo_aprobo_la_empresa_y_el_cambio_se_detecta_por_documento()
    {
        var antes = EnRevision();
        antes.BuscarRequisito(_banco)!.AprobadoEn.ShouldBeNull();
        antes.DocumentosConAprobacionCambiada(null).ShouldBeEmpty(); // aún sin aprobar

        var cuando = Ahora.AddDays(2);
        var revisor = new Revisor(Guid.NewGuid(), null);
        var despues = Expediente.Reproducir(antes, antes.EmitirVeredictoDeRequisito(_banco, _area, revisor, Veredicto.Aprobado, 1, [], null, cuando));

        despues.BuscarRequisito(_banco)!.Estado.ShouldBe(EstadoRequisito.Aprobado);
        despues.BuscarRequisito(_banco)!.AprobadoEn.ShouldBe(cuando);
        despues.DocumentosConAprobacionCambiada(antes).ShouldBe([_docBanco]);
        despues.DocumentosConAprobacionCambiada(despues).ShouldBeEmpty(); // nada cambió
        // Un expediente que nace ya aprobado (aprobación previa o áreas automáticas) también cuenta.
        despues.DocumentosConAprobacionCambiada(null).ShouldBe([_docBanco]);
    }
}
