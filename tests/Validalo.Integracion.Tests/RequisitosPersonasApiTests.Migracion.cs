using System.Text.Json;
using Marten;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Ficha;
using Validalo.Aplicacion.Interesado;
using Validalo.Aplicacion.Personas;
using Validalo.Contratos;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identificaciones;
using Validalo.Dominio.Terceros;
using Wolverine;
using Wolverine.Runtime;

namespace Validalo.Integracion.Tests;

/// <summary>
/// La migración de las personas declaradas a mano a la ficha legal (PR-17): antes de que la ficha fuera el único lugar donde se registran los representantes legales, suplentes y
/// socios, el tercero los declaraba en «Personas relacionadas» y no figuraban en su información legal. Al arrancar la API la migración los escribe en la sección legal (una sola
/// versión por tercero), concilia las relaciones para que queden de la ficha sin repetir eventos, no toca lo que la ficha ya decía ni lo que no maneja, y deja sin migrar al tercero
/// cuya sección no admite el formato.
/// </summary>
public sealed partial class RequisitosPersonasApiTests
{
    /// <summary>Un registro que guarda lo que la migración escribe en el log.</summary>
    private sealed class RegistroDeMigracion : ILogger
    {
        public List<(LogLevel Nivel, string Mensaje)> Entradas { get; } = [];

        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

        public bool IsEnabled(LogLevel logLevel) => true;

        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entradas.Add((logLevel, formatter(state, exception)));
    }

    /// <summary>Una relación declarada a mano antes de la regla (no de la ficha): hoy la API ya no deja crearla, pero las que había siguen existiendo. Devuelve la persona y la relación.</summary>
    private async Task<(Guid PersonaId, Guid RelacionId)> DeclararAManoAsync(Guid terceroId, TipoRelacionTerceros tipo, string cedula, string nombre, bool principal = false,
        decimal? participacion = null, string? cargo = null)
    {
        var ahora = Fixture.Reloj.GetUtcNow();
        await using var escritura = Host.Services.GetRequiredService<IDocumentStore>().LightweightSession(TenantsTecnicos.Boveda);
        var persona = Tercero.Crear(Identificacion.Crear("CO", "CC", cedula), TipoPersona.Natural, nombre, null, null, ahora);
        escritura.Store(persona);
        var id = RelacionEntreTerceros.IdPara(terceroId, persona.Id, tipo);
        escritura.Events.StartStream<RelacionEntreTerceros>(id,
            RelacionEntreTerceros.Registrar(persona.Id, terceroId, tipo, principal, participacion, cargo, Hoy().AddDays(-1), FuenteDeRelacion.Declarada, false, terceroId.ToString(), ahora));
        await escritura.SaveChangesAsync();
        return (persona.Id, id);
    }

    /// <summary>
    /// La sección legal escrita sin el aviso que sincroniza las relaciones (el que publica el guardado del tercero): como estaba una ficha que ya tenía a la persona cuando su relación
    /// todavía no era de la ficha.
    /// </summary>
    private async Task GuardarLegalSinAvisarAsync(Guid terceroId, string json)
    {
        using var alcance = Host.Services.CreateScope();
        var sesiones = alcance.ServiceProvider.GetRequiredService<ISesiones>();
        var tercero = await GuardadoDeSecciones.TerceroAsync(sesiones, terceroId, CancellationToken.None);
        var definicion = CatalogoDeSecciones.Requerida(CodigosDeSeccion.Legal);
        var contexto = new ContextoDeSeccion(tercero.TipoPersona, tercero.Identificacion, null, Hoy());
        var datos = ReglasDeFicha.Leer(definicion, JsonSerializer.Deserialize<JsonElement>(json), contexto);
        ICatalogosDeFicha catalogos;
        await using (var global = sesiones.ConsultaGlobal())
            catalogos = await ImportacionDeCatalogos.CargarAsync(global, definicion.Esquema.Referencias(datos), CancellationToken.None);
        await GuardadoDeSecciones.RegistrarAsync(() => sesiones.Boveda(), tercero, definicion, null, datos, [], contexto, catalogos, OrigenDeSeccion.Tercero, terceroId.ToString(),
            Fixture.Reloj, CancellationToken.None);
    }

    private async Task<(ResultadoDeMigracionDePersonasEnLaFicha Resultado, RegistroDeMigracion Registro)> MigrarPersonasAsync()
    {
        using var alcance = Host.Services.CreateScope();
        var registro = new RegistroDeMigracion();
        var resultado = await MigracionDePersonasEnLaFicha.EjecutarAsync(alcance.ServiceProvider.GetRequiredService<ISesiones>(),
            alcance.ServiceProvider.GetRequiredService<IWolverineRuntime>(), Fixture.Reloj.GetUtcNow(), registro, CancellationToken.None);
        return (resultado, registro);
    }

    private async Task<SeccionDeFicha?> SeccionLegalAsync(Guid terceroId)
    {
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda);
        return await consulta.LoadAsync<SeccionDeFicha>(SeccionDeFicha.IdPara(terceroId, CodigosDeSeccion.Legal, null));
    }

    [Fact]
    public async Task La_migracion_escribe_en_la_ficha_vacia_al_representante_declarado_a_mano_y_su_relacion_queda_de_la_ficha_sin_duplicar_eventos()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Migra vacia S.A.S.", "MIGV");
        var (vinculo, sesion, expedienteId) = await ProveedorAceptadoAsync(empresa);
        var juan = Cedula();
        var (_, relacionId) = await DeclararAManoAsync(vinculo.TerceroId, TipoRelacionTerceros.RepresentanteLegal, juan, "Juan Legado", principal: true, cargo: "Gerente");

        // El caso real: «Personas relacionadas» lo tiene y la información legal dice que aún no hay personas.
        var antes = await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200);
        (antes.Version, antes.Datos).ShouldBe((null, null));
        (await SeccionLegalAsync(vinculo.TerceroId)).ShouldBeNull();

        var (resultado, _) = await MigrarPersonasAsync();
        (resultado.TercerosMigrados >= 1 && resultado.PersonasEscritas >= 1 && resultado.RelacionesAdoptadas >= 1 && resultado.TercerosConError == 0).ShouldBeTrue(resultado.Resumen);

        // Una versión del tercero con el representante como principal y el nombre completo; lo que falta (apellidos…) queda por completar sin bloquear.
        var despues = await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200);
        (despues.Version, despues.Origen).ShouldBe((1, "Tercero"));
        var fila = FilasDeLaFicha(despues).ShouldHaveSingleItem();
        (Texto(fila, "rol"), Texto(fila, "numero"), Texto(fila, "tipo_representacion"), Texto(fila, "nombres"), Texto(fila, "cargo")).ShouldBe(
            ("RepresentanteLegal", juan, "Principal", "Juan Legado", "Gerente"));
        despues.Completitud!.Completa.ShouldBeFalse();
        despues.Completitud.Faltantes.Select(f => f.Campo).ShouldContain("personas[0].apellidos");

        // Se marca como migración en el autor de la versión y en el actor de los eventos.
        var seccion = (await SeccionLegalAsync(vinculo.TerceroId))!;
        seccion.Versiones.Count.ShouldBe(1);
        (seccion.Vigente!.Origen, seccion.Vigente.Autor).ShouldBe((OrigenDeSeccion.Tercero, MigracionDePersonasEnLaFicha.Autor));
        await using (var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda))
        {
            var ultimo = (await consulta.Events.FetchStreamAsync(seccion.Id)).Last();
            (ultimo.Headers!["actorTipo"], ultimo.Headers["actorId"]).ShouldBe(("Migracion", MigracionDePersonasEnLaFicha.Autor));
        }

        // La relación quedó de la ficha con lo mismo que tenía; la sincronización de la ficha no encuentra nada que cambiar.
        var relaciones = await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 1 && r[0].DeFicha);
        var relacion = relaciones.Single();
        (relacion.Id, relacion.Estado, relacion.Principal, relacion.Cargo, relacion.Fuente).ShouldBe((relacionId, EstadoDeRelacion.Confirmada, true, "Gerente", FuenteDeRelacion.Declarada));
        (await RelacionesAsync(sesion)).ShouldHaveSingleItem().DeFicha.ShouldBeTrue();
        var versiones = relaciones.ToDictionary(r => r.Id, r => r.Version);
        (await SincronizarComoElMensajeAsync(vinculo.TerceroId)).HuboCambios.ShouldBeFalse();
        (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 1)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);

        // Los avisos de la versión nueva salieron con ella: el expediente sigue pidiendo la cédula del representante.
        (await EsperarAsync(empresa, expedienteId, x => !Requisito(x, "CEDULA").Persona!.SinPersona)).Requisitos!.ShouldNotBeEmpty();
    }

    [Fact]
    public async Task Varias_relaciones_declaradas_a_mano_de_un_tercero_con_ficha_dejan_una_sola_version_y_la_ficha_manda_sobre_lo_que_ya_figuraba()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Migra mixta S.A.S.", "MIGM");
        var (vinculo, sesion, _) = await ProveedorAceptadoAsync(empresa);
        var (juan, luis, maria, pedro) = (Cedula(), Cedula(), Cedula(), Cedula());
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", juan, "Juan", "Principal")));
        await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 1 && r[0].DeFicha);

        // Declaradas a mano: otro representante que se dice principal (la ficha ya tiene al suyo), una suplente y un socio.
        var (_, luisRelacion) = await DeclararAManoAsync(vinculo.TerceroId, TipoRelacionTerceros.RepresentanteLegal, luis, "Luis Legado", principal: true);
        var (_, mariaRelacion) = await DeclararAManoAsync(vinculo.TerceroId, TipoRelacionTerceros.Suplente, maria, "María Legado", principal: true, cargo: "Suplente del gerente");
        var (_, pedroRelacion) = await DeclararAManoAsync(vinculo.TerceroId, TipoRelacionTerceros.Socio, pedro, "Pedro Legado", principal: true, participacion: 30m);
        var antes = await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200);

        (await MigrarPersonasAsync()).Resultado.TercerosConError.ShouldBe(0);

        // Una sola versión con las tres, después de lo que ya figuraba (que queda intacto, con Juan como el principal).
        var despues = await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200);
        despues.Version.ShouldBe(antes.Version + 1);
        var filas = FilasDeLaFicha(despues);
        filas.Select(f => (Texto(f, "rol"), Texto(f, "numero"), Texto(f, "tipo_representacion"), Texto(f, "nombres"))).ShouldBe(
        [
            ("RepresentanteLegal", juan, "Principal", "Juan"),
            ("RepresentanteLegal", luis, null, "Luis Legado"),
            ("Suplente", maria, null, "María Legado"),
            ("Socio", pedro, null, "Pedro Legado")
        ]);
        Texto(filas[0], "apellidos").ShouldBe("Prueba");
        filas[2].GetProperty("cargo").GetString().ShouldBe("Suplente del gerente");
        filas[3].GetProperty("porcentaje").GetDecimal().ShouldBe(30m);
        (await SeccionLegalAsync(vinculo.TerceroId))!.Versiones.Count.ShouldBe(despues.Version!.Value);

        // Las cuatro relaciones son de la ficha y hay una sola principal de cada tipo: la de la ficha; la que se decía principal pasó a la ficha como una más.
        var relaciones = await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 4 && r.All(x => x.DeFicha));
        relaciones.ShouldAllBe(r => r.Estado == EstadoDeRelacion.Confirmada);
        relaciones.Single(r => r.Id == luisRelacion).Principal.ShouldBeFalse();
        relaciones.Where(r => r.Tipo == TipoRelacionTerceros.RepresentanteLegal && r.Principal).ShouldHaveSingleItem().OrigenId.ShouldNotBe(relaciones.Single(r => r.Id == luisRelacion).OrigenId);
        (relaciones.Single(r => r.Id == mariaRelacion).Principal, relaciones.Single(r => r.Id == mariaRelacion).Cargo).ShouldBe((true, "Suplente del gerente"));
        (relaciones.Single(r => r.Id == pedroRelacion).Principal, relaciones.Single(r => r.Id == pedroRelacion).Participacion).ShouldBe((true, 30m));

        var versiones = relaciones.ToDictionary(r => r.Id, r => r.Version);
        (await SincronizarComoElMensajeAsync(vinculo.TerceroId)).HuboCambios.ShouldBeFalse();
        (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 4)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);
    }

    [Fact]
    public async Task Si_la_persona_ya_figura_en_la_ficha_la_migracion_solo_adopta_su_relacion_con_lo_que_dice_la_ficha_y_no_crea_version()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Migra figura S.A.S.", "MIGF");
        var (vinculo, _, _) = await ProveedorAceptadoAsync(empresa);
        var luis = Cedula();
        var (_, relacionId) = await DeclararAManoAsync(vinculo.TerceroId, TipoRelacionTerceros.RepresentanteLegal, luis, "Luis Legado", principal: true, cargo: "Cargo viejo");
        // La ficha ya tiene a Luis (con otro cargo), pero su relación todavía no se sincronizó con ella.
        await GuardarLegalSinAvisarAsync(vinculo.TerceroId, $$"""{ "personas": [ {{FilaLegal("RepresentanteLegal", luis, "Luis", "Principal").Replace("\"pep\"", "\"cargo\": \"Gerente general\", \"pep\"")}} ] }""");
        var antes = (await SeccionLegalAsync(vinculo.TerceroId))!;
        antes.Versiones.Count.ShouldBe(1);
        (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 1)).Single().DeFicha.ShouldBeFalse();

        var (resultado, _) = await MigrarPersonasAsync();
        (resultado.TercerosMigrados >= 1 && resultado.RelacionesAdoptadas >= 1 && resultado.TercerosConError == 0).ShouldBeTrue(resultado.Resumen);

        // La ficha no cambió (ninguna versión nueva) y la relación pasó a ser suya con lo que la ficha dice.
        var despues = (await SeccionLegalAsync(vinculo.TerceroId))!;
        (despues.Versiones.Count, despues.Vigente!.Huella).ShouldBe((1, antes.Vigente!.Huella));
        var relacion = (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 1 && r[0].DeFicha)).Single();
        (relacion.Id, relacion.Principal, relacion.Cargo).ShouldBe((relacionId, true, "Gerente general"));
        var version = relacion.Version;
        (await SincronizarComoElMensajeAsync(vinculo.TerceroId)).HuboCambios.ShouldBeFalse();
        (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 1)).Single().Version.ShouldBe(version);
    }

    [Fact]
    public async Task La_migracion_no_toca_el_beneficiario_final_y_repetirla_no_hace_nada()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Migra tipos S.A.S.", "MIGT");
        var (vinculo, sesion, _) = await ProveedorAceptadoAsync(empresa);
        var (juan, ana) = (Cedula(), Cedula());
        await DeclararAManoAsync(vinculo.TerceroId, TipoRelacionTerceros.RepresentanteLegal, juan, "Juan Legado", principal: true);
        var beneficiaria = await (await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "CC", ana), "Ana Beneficiaria", "BeneficiarioFinal", false, 25m), 201)).ReadAsJsonAsync<RelacionEntreTercerosDto>();

        (await MigrarPersonasAsync()).Resultado.TercerosConError.ShouldBe(0);

        // El representante pasó a la ficha; la beneficiaria final, que la ficha no maneja, sigue como estaba (declarada en Personas, no de la ficha).
        FilasDeLaFicha(await TerceroAsync<SeccionFichaDto>("GET", RutaLegal, sesion.AccessToken, null, 200)).Select(f => Texto(f, "numero")).ShouldBe([juan]);
        var relaciones = await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 2 && r.Count(x => x.DeFicha) == 1);
        var beneficiariaFinal = relaciones.Single(r => r.Tipo == TipoRelacionTerceros.BeneficiarioFinal);
        (beneficiariaFinal.Id, beneficiariaFinal.DeFicha, beneficiariaFinal.Estado, beneficiariaFinal.Participacion).ShouldBe((beneficiaria!.Id, false, EstadoDeRelacion.Confirmada, 25m));

        // Repetirla no escribe ninguna versión ni toca ninguna relación.
        var versiones = relaciones.ToDictionary(r => r.Id, r => r.Version);
        var seccion = await SeccionLegalAsync(vinculo.TerceroId);
        var (otra, _) = await MigrarPersonasAsync();
        (otra.TercerosMigrados, otra.PersonasEscritas, otra.RelacionesAdoptadas, otra.TercerosConError).ShouldBe((0, 0, 0, 0));
        (await SeccionLegalAsync(vinculo.TerceroId))!.Versiones.Count.ShouldBe(seccion!.Versiones.Count);
        (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 2)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);
    }

    [Fact]
    public async Task El_tercero_cuya_seccion_no_admite_el_formato_queda_sin_migrar_se_anota_en_el_log_y_los_demas_se_migran()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Migra formato S.A.S.", "MIGE");
        var (malo, _, _) = await ProveedorAceptadoAsync(empresa);
        var (bueno, _, _) = await ProveedorAceptadoAsync(empresa);
        // Un nombre más largo de lo que admite la sección (200): la versión no se puede escribir.
        var (_, relacionMala) = await DeclararAManoAsync(malo.TerceroId, TipoRelacionTerceros.RepresentanteLegal, Cedula(), new string('N', 250), principal: true);
        var (_, relacionBuena) = await DeclararAManoAsync(bueno.TerceroId, TipoRelacionTerceros.RepresentanteLegal, Cedula(), "Juan Legado", principal: true);

        var (resultado, registro) = await MigrarPersonasAsync();

        // El que no cabe queda como estaba: sin versión y con su relación declarada a mano; el otro sigue su camino.
        resultado.RelacionesSinMigrar.ShouldBeGreaterThanOrEqualTo(1);
        resultado.TercerosConError.ShouldBe(0);
        (await SeccionLegalAsync(malo.TerceroId)).ShouldBeNull();
        var sinMigrar = (await EsperarRelacionesAsync(malo.TerceroId, r => r.Count == 1)).Single();
        (sinMigrar.Id, sinMigrar.DeFicha, sinMigrar.Estado).ShouldBe((relacionMala, false, EstadoDeRelacion.Confirmada));
        registro.Entradas.ShouldContain(e => e.Nivel == LogLevel.Warning && e.Mensaje.Contains(malo.TerceroId.ToString()) && e.Mensaje.Contains("no admite el formato"));

        (await SeccionLegalAsync(bueno.TerceroId))!.Versiones.Count.ShouldBe(1);
        var migrada = (await EsperarRelacionesAsync(bueno.TerceroId, r => r.Count == 1 && r[0].DeFicha)).Single();
        (migrada.Id, migrada.Principal).ShouldBe((relacionBuena, true));
    }

    [Fact]
    public async Task Pedir_la_migracion_al_bus_la_ejecuta_y_deja_su_marca_para_no_repetirla_al_arrancar()
    {
        using (var alcance = Host.Services.CreateScope())
            await alcance.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(new MigrarPersonasEnLaFicha());

        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession();
        (await MigracionDePersonasEnLaFicha.YaCorrioAsync(consulta, CancellationToken.None)).ShouldBeTrue();
        (await consulta.LoadAsync<MigracionDeDatosEjecutada>(MigracionDePersonasEnLaFicha.Nombre))!.Resumen.ShouldContain("terceros con personas declaradas a mano revisados");
    }
}
