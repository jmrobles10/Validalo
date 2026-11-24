using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Personas;
using Validalo.Contratos;
using Validalo.Dominio.Terceros;

namespace Validalo.Integracion.Tests;

/// <summary>
/// La ficha legal es el único lugar donde se registran los representantes legales, suplentes y socios (decisión de Producto del 2026-11-24, ADR-0010): «Personas relacionadas» es una
/// vista. Declararlos ahí es 422; confirmar lo que detectó la IA los escribe además en la sección legal, en la misma transacción, y la sincronización de la ficha ya no encuentra nada
/// que cambiar.
/// </summary>
public sealed partial class RequisitosPersonasApiTests
{
    private const string RutaLegal = "/public/v1/ficha/FICHA_LEGAL";

    private static IReadOnlyList<System.Text.Json.JsonElement> FilasDeLaFicha(SeccionFichaDto seccion) => [.. seccion.Datos!.Value.GetProperty("personas").EnumerateArray()];

    private static string? Texto(System.Text.Json.JsonElement fila, string campo) => fila.TryGetProperty(campo, out var valor) ? valor.GetString() : null;

    /// <summary>La Cámara de comercio de un tercero con un representante legal en la ficha, y lo que la IA lee en ella ya reconciliado: la propuesta que el tercero confirmará.</summary>
    private async Task<(SesionTerceroDto Sesion, Guid TerceroId, Guid DocumentoId, Guid ExpedienteId, Empresa Empresa)> ConPropuestaDeCamaraAsync(string nombre, string prefijo, string juan,
        IReadOnlyList<(string Nombre, string Identificacion, string Cargo)> leidas)
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync(nombre, prefijo);
        var (vinculo, sesion, expedienteId) = await ProveedorAceptadoAsync(empresa);
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", juan, "Juan", "Principal")));
        await EsperarAsync(empresa, expedienteId, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var documentoId = (await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara de comercio"))).Version.DocumentoId;
        await RegistrarLecturaDeCamaraAsync(documentoId, leidas, 0.93m);
        await ReconciliarAsync(vinculo.TerceroId, documentoId);
        return (sesion, vinculo.TerceroId, documentoId, expedienteId, empresa);
    }

    /// <summary>Pone al día las relaciones desde la ficha como lo hace el mensaje que publica el guardado: no debe encontrar nada que cambiar.</summary>
    private async Task<ResultadoDeSincronizacionDePersonas> SincronizarComoElMensajeAsync(Guid terceroId) =>
        await SincronizacionDePersonas.SincronizarAsync(Host.Services.GetRequiredService<IDocumentStore>(), Fixture.Reloj, terceroId, null, CancellationToken.None);

    /// <summary>Una relación de representante legal declarada a mano (no de la ficha): hoy la API ya no deja crearla, pero las que había antes de esa regla siguen existiendo.</summary>
    private async Task DeclararAManoDeLegadoAsync(Guid terceroId, string cedula, string nombre)
    {
        var ahora = Fixture.Reloj.GetUtcNow();
        await using var escritura = Host.Services.GetRequiredService<IDocumentStore>().LightweightSession(TenantsTecnicos.Boveda);
        var persona = Tercero.Crear(Validalo.Dominio.Identificaciones.Identificacion.Crear("CO", "CC", cedula), TipoPersona.Natural, nombre, null, null, ahora);
        escritura.Store(persona);
        escritura.Events.StartStream<RelacionEntreTerceros>(RelacionEntreTerceros.IdPara(terceroId, persona.Id, TipoRelacionTerceros.RepresentanteLegal),
            RelacionEntreTerceros.Registrar(persona.Id, terceroId, TipoRelacionTerceros.RepresentanteLegal, true, null, null, Hoy().AddDays(-1), FuenteDeRelacion.Declarada, false,
                terceroId.ToString(), ahora));
        await escritura.SaveChangesAsync();
    }

    [Fact]
    public async Task Los_roles_que_la_ficha_maneja_no_se_declaran_en_personas_y_el_beneficiario_final_y_el_miembro_si()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Solo ficha S.A.S.", "SOLF");
        var (_, sesion, _) = await ProveedorAceptadoAsync(empresa);

        foreach (var tipo in new[] { "RepresentanteLegal", "Suplente", "Socio" })
        {
            var rechazada = await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
                new DeclararRelacionDto(new IdentificacionDto("CO", "CC", Cedula()), "Persona " + tipo, tipo, true, tipo == "Socio" ? 40m : null), 422);
            (await CodigoAsync(rechazada)).ShouldBe("persona-se-registra-en-la-ficha");
            (await rechazada.ReadAsTextAsync()).ShouldContain("Información legal");
        }

        (await RelacionesAsync(sesion)).ShouldBeEmpty(); // lo rechazado no crea nada

        // Los dos tipos que la ficha no maneja siguen declarándose aquí.
        foreach (var tipo in new[] { "BeneficiarioFinal", "MiembroDe" })
        {
            var creada = await (await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
                new DeclararRelacionDto(new IdentificacionDto("CO", "CC", Cedula()), "Persona " + tipo, tipo, false, 25m), 201)).ReadAsJsonAsync<RelacionEntreTercerosDto>();
            (creada!.Tipo, creada.Estado, creada.DeFicha).ShouldBe((tipo, "Confirmada", false));
        }
    }

    [Fact]
    public async Task Confirmar_al_representante_que_leyo_la_ia_lo_escribe_en_la_ficha_legal_quita_al_saliente_y_repetirlo_no_cambia_nada()
    {
        var (juan, maria) = (Cedula(), Cedula());
        var (sesion, terceroId, documentoId, expedienteId, empresa) = await ConPropuestaDeCamaraAsync("Escribe en ficha S.A.S.", "EFIC", juan,
            [("María Gómez Nueva", $"CC {maria}", "Representante legal principal")]);
        var propuesta = (await RelacionesAsync(sesion)).Single(r => r.Estado == "Propuesta");
        var antes = await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200);
        FilasDeLaFicha(antes).Select(f => Texto(f, "numero")).ShouldBe([juan]);

        var confirmada = await TerceroAsync<RelacionEntreTercerosDto>("POST", $"/public/v1/tercero/relaciones/{propuesta.Id}/confirmar", sesion.AccessToken, null, 200);
        (confirmada.Estado, confirmada.Principal, confirmada.DeFicha).ShouldBe(("Confirmada", true, true));

        // La ficha tiene una versión nueva del tercero con María como representante principal, la Cámara que la sustenta y sin Juan, que salió.
        var despues = await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200);
        despues.Version.ShouldBe(antes.Version + 1);
        despues.Origen.ShouldBe("Tercero");
        despues.Soportes.ShouldHaveSingleItem().DocumentoId.ShouldBe(documentoId);
        var fila = FilasDeLaFicha(despues).ShouldHaveSingleItem();
        (Texto(fila, "numero"), Texto(fila, "rol"), Texto(fila, "tipo_representacion"), Texto(fila, "nombres"), Texto(fila, "cargo")).ShouldBe(
            (maria, "RepresentanteLegal", "Principal", "María Gómez Nueva", "Representante legal principal"));
        // Lo que la propuesta no trae queda por completar en la sección, sin bloquear la confirmación.
        despues.Completitud!.Completa.ShouldBeFalse();
        despues.Completitud.Faltantes.Select(f => f.Campo).ShouldContain("personas[0].apellidos");

        // La relación quedó vigente y de la ficha; la del saliente terminó porque dejó la ficha, y la lista del tercero no depende de una ficha desactualizada.
        var relaciones = await EsperarRelacionesAsync(terceroId, r => r.Count(x => x.Estado == EstadoDeRelacion.Finalizada) == 1);
        var vigente = relaciones.Single(r => r.Estado == EstadoDeRelacion.Confirmada);
        (vigente.DeFicha, vigente.Principal, vigente.ConfirmadaVia).ShouldBe((true, true, ViaDeConfirmacionDeRelacion.Tercero));
        relaciones.Single(r => r.Estado == EstadoDeRelacion.Finalizada).MotivoDeTermino.ShouldBe(ConciliacionDeRelaciones.MotivoDeSalida);
        (await RelacionesAsync(sesion)).Select(r => r.Nombre).ShouldBe(["María Gómez Nueva"]);

        // Los avisos de la versión nueva de la ficha salieron en la misma transacción: el expediente pide la cédula de María y exime la de Juan.
        var recalculado = await EsperarAsync(empresa, expedienteId, x => x.Requisitos!.Any(r => r.Persona?.Nombre == "María Gómez Nueva"));
        recalculado.Requisitos!.Single(r => r.Persona?.Nombre == "María Gómez Nueva").Estado.ShouldBe("Pendiente");
        recalculado.Requisitos!.Single(r => r.Persona?.Nombre == "Juan Prueba").Estado.ShouldBe("Eximido");

        // La sincronización de la ficha (el mensaje que publica el guardado) no encuentra nada que cambiar: no duplica eventos.
        var versiones = relaciones.ToDictionary(r => r.Id, r => r.Version);
        (await SincronizarComoElMensajeAsync(terceroId)).HuboCambios.ShouldBeFalse();
        (await EsperarRelacionesAsync(terceroId, r => r.Count == 2)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);

        // Idempotente: confirmar otra vez no escribe otra versión ni toca las relaciones.
        await TerceroAsync<RelacionEntreTercerosDto>("POST", $"/public/v1/tercero/relaciones/{propuesta.Id}/confirmar", sesion.AccessToken, null, 200);
        (await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200)).Version.ShouldBe(despues.Version);
        (await EsperarRelacionesAsync(terceroId, r => r.Count == 2)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);
    }

    [Fact]
    public async Task Confirmar_al_suplente_que_leyo_la_ia_lo_agrega_a_la_ficha_sin_tocar_al_representante()
    {
        var (juan, pedro) = (Cedula(), Cedula());
        var (sesion, terceroId, _, _, _) = await ConPropuestaDeCamaraAsync("Suplente en ficha S.A.S.", "SUFI", juan,
            [("Pedro Suplente Nuevo", $"CC {pedro}", "Suplente del representante legal")]);
        var propuesta = (await RelacionesAsync(sesion)).Single(r => r.Estado == "Propuesta");
        propuesta.Tipo.ShouldBe("Suplente");

        var confirmada = await TerceroAsync<RelacionEntreTercerosDto>("POST", $"/public/v1/tercero/relaciones/{propuesta.Id}/confirmar", sesion.AccessToken, null, 200);
        confirmada.DeFicha.ShouldBeTrue();

        var filas = FilasDeLaFicha(await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200));
        filas.Select(f => (Texto(f, "rol"), Texto(f, "numero"))).ShouldBe([("RepresentanteLegal", juan), ("Suplente", pedro)]);
        Texto(filas[0], "nombres").ShouldBe("Juan"); // el representante queda tal cual
        Texto(filas[1], "cargo").ShouldBe("Suplente del representante legal");

        // El suplente es la principal de su tipo según la ficha (el primero) y la relación ya lo dice: la sincronización no emite nada más.
        var relaciones = await EsperarRelacionesAsync(terceroId, r => r.Count == 2 && r.All(x => x.Estado == EstadoDeRelacion.Confirmada));
        relaciones.Single(r => r.Tipo == TipoRelacionTerceros.Suplente).Principal.ShouldBeTrue();
        relaciones.Single(r => r.Tipo == TipoRelacionTerceros.RepresentanteLegal).Principal.ShouldBeTrue();
        var versiones = relaciones.ToDictionary(r => r.Id, r => r.Version);
        (await SincronizarComoElMensajeAsync(terceroId)).HuboCambios.ShouldBeFalse();
        (await EsperarRelacionesAsync(terceroId, r => r.Count == 2)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);
    }

    [Fact]
    public async Task El_representante_que_el_tercero_declaro_a_mano_antes_de_esta_regla_sale_como_siempre_al_confirmar_a_quien_lo_reemplaza()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Legado S.A.S.", "LEGA");
        var (vinculo, sesion, _) = await ProveedorAceptadoAsync(empresa);
        var (legado, maria) = (Cedula(), Cedula());

        await DeclararAManoDeLegadoAsync(vinculo.TerceroId, legado, "Luis Legado");

        var documentoId = (await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara de comercio"))).Version.DocumentoId;
        await RegistrarLecturaDeCamaraAsync(documentoId, [("María Gómez Nueva", $"CC {maria}", "Representante legal principal")], 0.9m);
        await ReconciliarAsync(vinculo.TerceroId, documentoId);
        var propuesta = (await RelacionesAsync(sesion)).Single(r => r.Estado == "Propuesta");
        propuesta.Reemplaza!.Nombre.ShouldBe("Luis Legado");

        await TerceroAsync<RelacionEntreTercerosDto>("POST", $"/public/v1/tercero/relaciones/{propuesta.Id}/confirmar", sesion.AccessToken, null, 200);

        // María queda escrita en la ficha (que no tenía nada) y el saliente, que la ficha no mantenía, termina por reemplazo.
        FilasDeLaFicha(await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200)).Select(f => Texto(f, "numero")).ShouldBe([maria]);
        var relaciones = await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count(x => x.Estado == EstadoDeRelacion.Finalizada) == 1);
        relaciones.Single(r => r.Estado == EstadoDeRelacion.Finalizada).MotivoDeTermino.ShouldBe("Reemplazada por la persona que el tercero confirmó.");
        relaciones.Single(r => r.Estado == EstadoDeRelacion.Confirmada).DeFicha.ShouldBeTrue();
        (await SincronizarComoElMensajeAsync(vinculo.TerceroId)).HuboCambios.ShouldBeFalse();
    }

    [Fact]
    public async Task La_persona_declarada_a_mano_antes_de_esta_regla_pasa_a_ser_de_la_ficha_cuando_el_tercero_la_agrega_alli_y_sale_con_ella()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Adopta S.A.S.", "ADOP");
        var (vinculo, sesion, _) = await ProveedorAceptadoAsync(empresa);
        var legado = Cedula();
        await DeclararAManoDeLegadoAsync(vinculo.TerceroId, legado, "Luis Legado");
        var antes = (await RelacionesAsync(sesion)).ShouldHaveSingleItem();
        antes.DeFicha.ShouldBeFalse(); // la declaró el tercero a mano: la ficha todavía no la tiene

        // El tercero la agrega a su información legal (lo que hace «Agregar aquí»): desde entonces la ficha la mantiene.
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", legado, "Luis", "Principal")));
        var adoptada = (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Single().DeFicha)).Single();
        (adoptada.Estado, adoptada.Principal).ShouldBe((EstadoDeRelacion.Confirmada, true));
        (await RelacionesAsync(sesion)).ShouldHaveSingleItem().DeFicha.ShouldBeTrue();
        (await SincronizarComoElMensajeAsync(vinculo.TerceroId)).HuboCambios.ShouldBeFalse();

        // Ya es de la ficha: no se termina desde Personas y, si sale de la sección, la relación termina con ella.
        (await CodigoAsync(await TerceroAsync("DELETE", $"/public/v1/tercero/relaciones/{adoptada.Id}", sesion.AccessToken, null, 409))).ShouldBe("relacion-de-la-ficha");
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", """{ "personas": [] }""");
        await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Single().Estado == EstadoDeRelacion.Finalizada);
    }
}
