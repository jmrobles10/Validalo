using Validalo.Contratos;

namespace Validalo.Integracion.Tests;

public sealed partial class RequisitosPersonasApiTests
{
    // ---------- La conclusión de la IA sobre la cédula de una persona relacionada ----------

    private static byte[] CedulaLeida(string numero, string nombres, string apellidos) =>
        Pdf($"Cédula [[numero={numero}]][[nombres={nombres}]][[apellidos={apellidos}]]");

    /// <summary>
    /// Empresa en Manual (nunca configuró la revisión automática) con plan de IA, cuyo flujo pide la cédula del representante legal; el tercero declara a «Juan Prueba» en su ficha legal y
    /// la persona sube su cédula. Devuelve la conclusión que el revisor ve en el requisito.
    /// </summary>
    private async Task<ConclusionDeRevisionDto> ConclusionDeLaCedulaAsync(string nombre, string prefijo, Func<string, byte[]> cedula)
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync(nombre, prefijo);
        await PlanParaRevisionAsync(empresa);
        var (_, sesion, expedienteId) = await ProveedorAceptadoAsync(empresa);
        var numero = Cedula();
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", numero, "Juan", "Principal")));
        await EsperarAsync(empresa, expedienteId, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var juan = (await RelacionesAsync(sesion)).Single();
        await SubirDePersonaAsync(sesion, juan.PersonaId, "CEDULA", cedula(numero));

        var conConclusion = await EsperarAsync(empresa, expedienteId, x => Requisito(x, "CEDULA").ConclusionDeRevision is not null);
        var requisito = Requisito(conConclusion, "CEDULA");
        requisito.RevisionesAutomaticas.ShouldBeNull(); // en Manual el sistema no registra nada: solo concluye
        conConclusion.Requisitos!.SelectMany(r => r.Areas).SelectMany(a => a.Veredictos).ShouldBeEmpty();
        return requisito.ConclusionDeRevision!;
    }

    [Fact]
    public async Task La_cedula_que_coincide_con_la_persona_declarada_concluye_aprobar_en_Manual_y_dice_con_quien_coincide()
    {
        var conclusion = await ConclusionDeLaCedulaAsync("Coincide S.A.S.", "COIN", numero => CedulaLeida(numero, "JUAN", "PRUEBA"));

        conclusion.ShouldSatisfyAllConditions(
            c => c.Sugerencia.ShouldBe("Aprobar"),
            c => c.Nivel.ShouldBe("Manual"),
            c => c.Motivos.ShouldBeEmpty(),
            c => c.CruzadoConLoDeclarado.ShouldBeTrue(),
            c => c.SinVerificar.ShouldBeEmpty());
        conclusion.Persona.ShouldNotBeNull().ShouldSatisfyAllConditions(p => p.Nombre.ShouldBe("Juan Prueba"), p => p.Identificacion.ShouldStartWith("CC "));
    }

    [Fact]
    public async Task La_cedula_de_otra_persona_concluye_revisar_con_el_motivo_concreto()
    {
        var conclusion = await ConclusionDeLaCedulaAsync("Otra S.A.S.", "OTRA", _ => CedulaLeida("52123456", "ANA MARIA", "GOMEZ RUIZ"));

        conclusion.Sugerencia.ShouldBe("Revisar");
        conclusion.Persona.ShouldBeNull();
        var motivo = conclusion.Motivos.ShouldHaveSingleItem();
        motivo.Codigo.ShouldBe("discrepancia-critica-ficha");
        motivo.Texto.ShouldStartWith("El documento no coincide con la persona declarada, Juan Prueba (CC ");
        motivo.Texto.ShouldContain("): Número de identificación (declaró ");
        motivo.Texto.ShouldContain("; el documento trae 52123456); Nombres y apellidos (declaró Juan Prueba; el documento trae ANA MARIA GOMEZ RUIZ).");
    }
}
