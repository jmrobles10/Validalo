using System.Text.Json;
using Alba;
using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Contratos;
using Validalo.Dominio.Auditoria;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Identidad;
using Validalo.Dominio.Plataforma;

namespace Validalo.Integracion.Tests;

public sealed partial class IngresoApiTests
{
    // ---------- la ficha del grupo: Plataforma corrige el grupo y a quien lo administra ----------

    private IDocumentStore Almacen => Host.Services.GetRequiredService<IDocumentStore>();

    private static string RutaDeGrupo(Guid grupo, string resto = "") => $"/api/v1/plataforma/tenants/{grupo}{resto}";

    /// <summary>Una petición de la consola con la clave de Plataforma, o con la que se indique (<c>"sin"</c>: sin credencial).</summary>
    private Task<IScenarioResult> DeLaConsolaAsync(string metodo, string url, object? cuerpo, int esperado, string? credencial = null) =>
        Anonimo(url, cuerpo, esperado, metodo: metodo, apiKey: credencial == "sin" ? null : credencial ?? ApiFixture.ClavePlataforma);

    private async Task<List<RegistroDeCambioDeConfiguracion>> AuditoriaDelGrupoAsync(Guid tenantId, string entidad, string entidadId)
    {
        await using var consulta = Almacen.QuerySession(tenantId.ToString("N"));
        return [.. await consulta.Query<RegistroDeCambioDeConfiguracion>().Where(r => r.Entidad == entidad && r.EntidadId == entidadId && r.Accion == AccionConfiguracion.Modificado).ToListAsync()];
    }

    [Fact]
    public async Task Plataforma_corrige_nombre_region_y_zona_del_grupo_con_su_auditoria_alinea_su_sandbox_y_nunca_toca_el_identificador()
    {
        var g = await GrupoAsync();
        var sandbox = await ApiAsync<SandboxDto>("POST", "/api/v1/sandbox", g.Admin, null, null, 201);
        var slug = (await ApiAsync<GrupoDto>("GET", $"/api/v1/plataforma/grupos/{g.TenantId}", ApiFixture.ClavePlataforma, null, null, 200)).Tenant.Slug;

        var corregido = await ApiAsync<TenantDto>("PUT", RutaDeGrupo(g.TenantId), ApiFixture.ClavePlataforma, null, new CorregirGrupoDto("  Grupo Andino Constructores ", " PA ", "America/Panama"), 200);
        (corregido.Id, corregido.Slug, corregido.Nombre, corregido.Region, corregido.ZonaHoraria, corregido.Activo).ShouldBe((g.TenantId, slug, "Grupo Andino Constructores", "pa", "America/Panama", true));

        // La consola y la API del grupo ven lo nuevo; las llaves del grupo (que llevan el identificador) siguen sirviendo.
        var enLaConsola = (await ApiAsync<GrupoDto>("GET", $"/api/v1/plataforma/grupos/{g.TenantId}", ApiFixture.ClavePlataforma, null, null, 200)).Tenant;
        (enLaConsola.Nombre, enLaConsola.Slug, enLaConsola.ZonaHoraria).ShouldBe(("Grupo Andino Constructores", slug, "America/Panama"));
        (await ApiAsync<List<EmpresaDto>>("GET", "/api/v1/empresas", g.Admin, null, null, 200)).ShouldHaveSingleItem();

        // Su sandbox lo sigue en la misma transacción: nombre con « (sandbox)», región y zona; su identificador no cambia.
        await using (var consulta = Almacen.QuerySession())
        {
            var copia = (await consulta.LoadAsync<Tenant>(sandbox.TenantId!.Value))!;
            (copia.Nombre, copia.Region, copia.ZonaHoraria, copia.Slug).ShouldBe(("Grupo Andino Constructores (sandbox)", "pa", "America/Panama", slug + "~sandbox"));
        }

        // Quedó en la auditoría del grupo con el antes y el después, a nombre de Plataforma.
        var registro = (await AuditoriaDelGrupoAsync(g.TenantId, "Tenant", g.TenantId.ToString())).ShouldHaveSingleItem();
        registro.ActorTipo.ShouldBe(ActorTipo.Plataforma);
        JsonSerializer.Serialize(registro.Antes).ShouldContain("\"zonaHoraria\":\"America/Bogota\"");
        JsonSerializer.Serialize(registro.Despues).ShouldContain("\"nombre\":\"Grupo Andino Constructores\"");

        // Enviar lo mismo (o solo el nombre, que conserva la región y la zona) no escribe ni audita.
        await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto("Grupo Andino Constructores", "pa", "America/Panama"), 200);
        var soloElNombre = await (await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto("Grupo Andino Constructores"), 200)).ReadAsJsonAsync<TenantDto>();
        (soloElNombre!.Region, soloElNombre.ZonaHoraria).ShouldBe(("pa", "America/Panama"));
        (await AuditoriaDelGrupoAsync(g.TenantId, "Tenant", g.TenantId.ToString())).Count.ShouldBe(1);

        // Las mismas reglas del alta.
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto(" "), 422))).ShouldBe("nombre-requerido");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto("Otro", "pa", "Marte/Olimpo"), 422))).ShouldBe("zona-horaria-invalida");
        (await ApiAsync<GrupoDto>("GET", $"/api/v1/plataforma/grupos/{g.TenantId}", ApiFixture.ClavePlataforma, null, null, 200)).Tenant.Nombre.ShouldBe("Grupo Andino Constructores");

        // El grupo existe (un sandbox no es un grupo de la consola) y solo Plataforma corrige.
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(Guid.NewGuid()), new CorregirGrupoDto("X"), 404))).ShouldBe("tenant-no-encontrado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(sandbox.TenantId!.Value), new CorregirGrupoDto("X"), 404))).ShouldBe("tenant-no-encontrado");
        await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto("X"), 403, g.Admin);
        await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto("X"), 401, "sin");

        // «Siempre»: también con el grupo desactivado.
        await CambiarActivoAsync(g.TenantId, false);
        try
        {
            (await (await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId), new CorregirGrupoDto("Grupo Andino Inactivo", "pa", "America/Panama"), 200)).ReadAsJsonAsync<TenantDto>())!
                .Nombre.ShouldBe("Grupo Andino Inactivo");
        }
        finally
        {
            await CambiarActivoAsync(g.TenantId, true);
        }
    }

    private async Task CambiarActivoAsync(Guid tenantId, bool activo)
    {
        await using var sesion = Almacen.LightweightSession();
        var tenant = (await sesion.LoadAsync<Tenant>(tenantId))!;
        tenant.Activo = activo;
        sesion.Store(tenant);
        await sesion.SaveChangesAsync();
    }

    [Fact]
    public async Task Plataforma_lista_a_los_administradores_y_corrige_su_nombre_correo_e_identidad_externa_con_su_auditoria()
    {
        var (g, sistema) = await GrupoConSistemaAsync(["Delegado", "Directo"]);
        var datosDelSistema = await SistemaDelGrupoAsync(g, sistema.Codigo);
        var ana = await UsuarioAsync(g, "Administrador", deTodoElGrupo: true);
        var bruno = await UsuarioAsync(g, "Administrador", deTodoElGrupo: true);
        var revisor = await UsuarioAsync(g, "Revisor");

        // Solo salen quienes administran, con lo que la consola muestra de cada uno.
        var lista = await ApiAsync<List<UsuarioDto>>("GET", RutaDeGrupo(g.TenantId, "/administradores"), ApiFixture.ClavePlataforma, null, null, 200);
        lista.Select(u => u.Id).ShouldBe([ana.Id, bruno.Id], ignoreOrder: true);
        var deAna = lista.Single(u => u.Id == ana.Id);
        (deAna.Correo, deAna.Activo, deAna.ExigePasskey, deAna.Passkeys).ShouldBe((ana.Correo, true, false, 0)); // ningún rol exige passkey: solo la pide el grupo si lo activa
        deAna.Identidades.ShouldBeEmpty();

        // Corrige nombre, correo (en mayúsculas: se normaliza) y el id con que el sistema integrado la reconoce.
        var correoNuevo = CorreoNuevo();
        var corregida = await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), ApiFixture.ClavePlataforma, null,
            new CorregirUsuarioDto("  Ana Rojas ", correoNuevo.ToUpperInvariant(), [new IdentidadExternaDto(datosDelSistema.Id, " ana.rojas ")]), 200);
        (corregida.Nombre, corregida.Correo).ShouldBe(("Ana Rojas", correoNuevo));
        corregida.Roles.ShouldBe(ana.Roles);
        corregida.Identidades.ShouldBe([new IdentidadExternaDto(datosDelSistema.Id, "ana.rojas")]);
        var delGrupo = await ApiAsync<UsuarioDto>("GET", $"/api/v1/usuarios/{ana.Id}", g.Admin, null, null, 200);
        (delGrupo.Nombre, delGrupo.Correo).ShouldBe(("Ana Rojas", correoNuevo));

        // Quedó en la auditoría del grupo con el antes y el después, a nombre de Plataforma, y el índice de identidades la reconoce.
        var registro = (await AuditoriaDelGrupoAsync(g.TenantId, "Usuario", ana.Id.ToString())).ShouldHaveSingleItem();
        registro.ActorTipo.ShouldBe(ActorTipo.Plataforma);
        JsonSerializer.Serialize(registro.Antes).ShouldContain(ana.Correo);
        JsonSerializer.Serialize(registro.Despues).ShouldContain(correoNuevo);
        await using (var consulta = Almacen.QuerySession(g.TenantId.ToString("N")))
            (await consulta.LoadAsync<IndiceIdentidadExterna>(IndiceIdentidadExterna.Clave(datosDelSistema.Id, "ana.rojas")))!.UsuarioId.ShouldBe(ana.Id);

        // Enviar lo mismo, o sin identidades (que las conserva), no escribe ni audita.
        await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), new CorregirUsuarioDto("Ana Rojas", correoNuevo, [new IdentidadExternaDto(datosDelSistema.Id, "ana.rojas")]), 200);
        var conservada = await (await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), new CorregirUsuarioDto("Ana Rojas", correoNuevo), 200)).ReadAsJsonAsync<UsuarioDto>();
        conservada!.Identidades.ShouldHaveSingleItem();
        (await AuditoriaDelGrupoAsync(g.TenantId, "Usuario", ana.Id.ToString())).Count.ShouldBe(1);

        // Cambiar el id externo: el anterior deja de reconocerla y el nuevo la reconoce; otra persona no puede quedarse con el mismo.
        await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), ApiFixture.ClavePlataforma, null,
            new CorregirUsuarioDto("Ana Rojas", correoNuevo, [new IdentidadExternaDto(datosDelSistema.Id, "ana.nueva")]), 200);
        await using (var consulta = Almacen.QuerySession(g.TenantId.ToString("N")))
        {
            (await consulta.LoadAsync<IndiceIdentidadExterna>(IndiceIdentidadExterna.Clave(datosDelSistema.Id, "ana.rojas"))).ShouldBeNull();
            (await consulta.LoadAsync<IndiceIdentidadExterna>(IndiceIdentidadExterna.Clave(datosDelSistema.Id, "ana.nueva")))!.UsuarioId.ShouldBe(ana.Id);
        }

        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"),
            new CorregirUsuarioDto(bruno.Nombre, bruno.Correo, [new IdentidadExternaDto(datosDelSistema.Id, "ana.nueva")]), 409))).ShouldBe("identidad-duplicada");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"),
            new CorregirUsuarioDto(bruno.Nombre, bruno.Correo, [new IdentidadExternaDto(Guid.NewGuid(), "bruno")]), 422))).ShouldBe("sistema-invalido");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"),
            new CorregirUsuarioDto(bruno.Nombre, bruno.Correo, [new IdentidadExternaDto(datosDelSistema.Id, "a"), new IdentidadExternaDto(datosDelSistema.Id, "b")]), 422))).ShouldBe("identidades-repetidas");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"),
            new CorregirUsuarioDto(bruno.Nombre, bruno.Correo, [new IdentidadExternaDto(datosDelSistema.Id, " ")]), 422))).ShouldBe("identidad-externa-invalida");

        // Una lista vacía las quita todas (y su índice).
        (await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), ApiFixture.ClavePlataforma, null, new CorregirUsuarioDto("Ana Rojas", correoNuevo, []), 200))
            .Identidades.ShouldBeEmpty();
        await using (var consulta = Almacen.QuerySession(g.TenantId.ToString("N")))
            (await consulta.LoadAsync<IndiceIdentidadExterna>(IndiceIdentidadExterna.Clave(datosDelSistema.Id, "ana.nueva"))).ShouldBeNull();

        // El correo sigue único en el grupo contra las demás personas (sin distinguir mayúsculas) y se valida como en el alta; nada cambia si falla.
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"),
            new CorregirUsuarioDto(bruno.Nombre, correoNuevo.ToUpperInvariant()), 409))).ShouldBe("usuario-duplicado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"), new CorregirUsuarioDto(bruno.Nombre, "sin-arroba"), 422))).ShouldBe("correo-invalido");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"), new CorregirUsuarioDto(" ", bruno.Correo), 422))).ShouldBe("nombre-requerido");
        (await ApiAsync<UsuarioDto>("GET", $"/api/v1/usuarios/{bruno.Id}", g.Admin, null, null, 200)).Correo.ShouldBe(bruno.Correo);

        // Lo que no existe, lo de otro grupo y quien no es Plataforma.
        var otro = await GrupoAsync();
        var deOtro = await UsuarioAsync(otro, "Administrador", deTodoElGrupo: true);
        var sandbox = await ApiAsync<SandboxDto>("POST", "/api/v1/sandbox", g.Admin, null, null, 201);
        var cuerpo = new CorregirUsuarioDto("X", CorreoNuevo());
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{Guid.NewGuid()}"), cuerpo, 404))).ShouldBe("usuario-no-encontrado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{deOtro.Id}"), cuerpo, 404))).ShouldBe("usuario-no-encontrado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(Guid.NewGuid(), $"/usuarios/{ana.Id}"), cuerpo, 404))).ShouldBe("tenant-no-encontrado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(sandbox.TenantId!.Value, $"/usuarios/{ana.Id}"), cuerpo, 404))).ShouldBe("tenant-no-encontrado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("GET", RutaDeGrupo(Guid.NewGuid(), "/administradores"), null, 404))).ShouldBe("tenant-no-encontrado");
        await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), cuerpo, 403, g.Admin);
        await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{ana.Id}"), cuerpo, 401, "sin");
        await DeLaConsolaAsync("GET", RutaDeGrupo(g.TenantId, "/administradores"), null, 403, g.Admin);
        await DeLaConsolaAsync("GET", RutaDeGrupo(g.TenantId, "/administradores"), null, 401, "sin");
        _ = revisor;

        // «Siempre»: también con la cuenta y el grupo desactivados.
        await ApiAsync<UsuarioDto>("POST", $"/api/v1/usuarios/{bruno.Id}/desactivar", g.Admin, null, null, 200);
        await CambiarActivoAsync(g.TenantId, false);
        try
        {
            var inactivo = await (await DeLaConsolaAsync("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{bruno.Id}"), new CorregirUsuarioDto("Bruno Inactivo", bruno.Correo), 200)).ReadAsJsonAsync<UsuarioDto>();
            (inactivo!.Nombre, inactivo.Activo).ShouldBe(("Bruno Inactivo", false));
        }
        finally
        {
            await CambiarActivoAsync(g.TenantId, true);
        }
    }

    [Fact]
    public async Task Corregir_el_correo_de_un_administrador_corta_el_acceso_del_correo_anterior_y_con_invitar_avisa_al_correo_nuevo()
    {
        var a = await AdministradorConPasskeyAsync();
        var g = a.Grupo;
        (await ObtenerAsync<YoDto>("/api/v1/yo", a.Token)).ActorId.ShouldBe(a.Usuario.Id.ToString());

        var correoNuevo = CorreoNuevo();
        var corregido = await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{a.Usuario.Id}"), ApiFixture.ClavePlataforma, null,
            new CorregirUsuarioDto(a.Usuario.Nombre, correoNuevo, Invitar: true), 200);
        (corregido.Correo, corregido.Passkeys, corregido.ExigePasskey).ShouldBe((correoNuevo, 0, false));
        corregido.InvitadoEn.ShouldNotBeNull();

        // La sesión que ya tenía deja de valer, su passkey queda revocada por Plataforma y no vuelve a entrar con ella.
        await Anonimo("/api/v1/yo", null, 401, metodo: "GET", bearer: a.Token);
        var passkey = (await ApiAsync<List<PasskeyDto>>("GET", $"/api/v1/usuarios/{a.Usuario.Id}/passkeys", g.Admin, null, null, 200)).ShouldHaveSingleItem();
        (passkey.Activa, passkey.MotivoRevocacion).ShouldBe((false, SesionDeUsuario.MotivoCorreoCambiado));
        passkey.RevocadaPor.ShouldNotBeNull().ShouldStartWith("Plataforma:");
        var opciones = (await (await Anonimo("/api/v1/ingreso/passkey/opciones", null, 200)).ReadAsJsonAsync<OpcionesDePasskeyDto>())!;
        (await CodigoDeErrorAsync(await Anonimo("/api/v1/ingreso/passkey/verificar", new VerificarPasskeyDto(opciones.Desafio, a.Autenticador.Firmar(opciones.Opciones)), 401))).ShouldBe("passkey-revocada");

        // La persona del correo nuevo recibe la invitación y entra con su código (la passkey es opcional: solo se le sugiere registrar una).
        var invitacion = await Correos.EsperarAsync(correoNuevo, c => c.Asunto.Contains("te invitó a Valídalo"));
        invitacion.Texto.ShouldContain("Administrador");
        var nueva = (await IngresarConCodigoAsync(correoNuevo)).Paso;
        (nueva.Estado, nueva.Sesion!.SugerirPasskey).ShouldBe(("Sesion", true));

        // Quedó todo a nombre de Plataforma en la auditoría de identidad.
        await using var consulta = Almacen.QuerySession();
        var sujeto = a.Usuario.Id.ToString();
        var eventos = await consulta.Query<RegistroDeIngreso>().Where(r => r.SujetoId == sujeto).ToListAsync();
        eventos.ShouldContain(r => r.Evento == EventoDeIngreso.PasskeyRevocada && r.ActorTipo == ActorTipo.Plataforma && r.Motivo == SesionDeUsuario.MotivoCorreoCambiado);
        eventos.ShouldContain(r => r.Evento == EventoDeIngreso.SesionRevocada && r.ActorTipo == ActorTipo.Plataforma && r.Motivo == SesionDeUsuario.MotivoCorreoCambiado);
        eventos.ShouldContain(r => r.Evento == EventoDeIngreso.UsuarioInvitado && r.ActorTipo == ActorTipo.Plataforma && r.Correo == correoNuevo);
    }

    [Fact]
    public async Task Un_correo_mal_digitado_que_cayo_en_otro_buzon_deja_de_servir_al_corregirlo_aunque_tuviera_un_ingreso_a_medias()
    {
        var g = await GrupoAsync(passkeyParaTodos: true); // en un grupo que exige passkey el ingreso queda a mitad de registrarla
        var admin = await UsuarioAsync(g, "Administrador", deTodoElGrupo: true);
        var correoMalo = admin.Correo;

        // Alguien con el correo equivocado pidió un código, lo verificó y quedó a mitad de registrar su passkey cuando Plataforma corrige.
        var aMedias = (await VerificarCodigoAsync(await PedirCodigoAsync(correoMalo), await CodigoDelCorreoAsync(correoMalo))).Paso;
        aMedias.Estado.ShouldBe("RegistrarPasskey");

        var correoBueno = CorreoNuevo();
        var sinInvitar = await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{admin.Id}"), ApiFixture.ClavePlataforma, null,
            new CorregirUsuarioDto(admin.Nombre, correoBueno), 200);
        sinInvitar.Correo.ShouldBe(correoBueno);
        sinInvitar.InvitadoEn.ShouldBeNull();

        // Lo que ese intruso tenía a medias ya no se completa: no registra passkey ni abre sesión.
        var intruso = new AutenticadorVirtual(ApiFixture.OrigenDeLaApp);
        (await CodigoDeErrorAsync(await Anonimo("/api/v1/ingreso/passkey/registro",
            new RegistrarPasskeyDto(aMedias.Desafio, intruso.Registrar(aMedias.Opciones!.Value), "Intruso"), 410))).ShouldBe("desafio-usado");

        // Sin «invitar» solo se corrige: no sale ninguna invitación. Y el correo malo ya no abre la cuenta: no recibe código (responde igual, sin revelar nada).
        var codigosDelMalo = Correos.Para(correoMalo).Count(c => c.Asunto == AsuntoCodigo);
        await PedirCodigoAsync(correoMalo);
        await Task.Delay(800);
        Correos.Para(correoMalo).Count(c => c.Asunto == AsuntoCodigo).ShouldBe(codigosDelMalo);
        Correos.Para(correoBueno).Count(c => c.Asunto.Contains("te invitó a Valídalo")).ShouldBe(0);
        (await IngresarConCodigoAsync(correoBueno)).Paso.Estado.ShouldBe("RegistrarPasskey");
    }

    [Fact]
    public async Task Un_operador_con_sesion_directa_confirma_con_su_passkey_para_cambiar_el_correo_o_el_usuario_del_sistema_pero_no_para_el_nombre()
    {
        var (g, sistema) = await GrupoConSistemaAsync(["Delegado", "Directo"]);
        var datosDelSistema = await SistemaDelGrupoAsync(g, sistema.Codigo);
        var admin = await UsuarioAsync(g, "Administrador", deTodoElGrupo: true);
        var (token, autenticador, _) = await CrearOperadorAsync();
        var url = RutaDeGrupo(g.TenantId, $"/usuarios/{admin.Id}");

        // El nombre solo no lo pide.
        (await (await ComoPersonaAsync("PUT", url, new CorregirUsuarioDto("Ana Rojas", admin.Correo), token, 200)).ReadAsJsonAsync<UsuarioDto>())!.Nombre.ShouldBe("Ana Rojas");

        // El correo y el usuario del sistema deciden quién entra como esa persona: sin confirmar, 403 con la acción, y no cambia nada.
        var correoNuevo = CorreoNuevo();
        foreach (var cuerpo in new[]
                 {
                     new CorregirUsuarioDto("Ana Rojas", correoNuevo),
                     new CorregirUsuarioDto("Ana Rojas", admin.Correo, [new IdentidadExternaDto(datosDelSistema.Id, "ana")])
                 })
        {
            var rechazada = await (await ComoPersonaAsync("PUT", url, cuerpo, token, 403)).ReadAsJsonAsync<JsonElement>();
            (rechazada.GetProperty("codigo").GetString(), rechazada.GetProperty("accion").GetString()).ShouldBe(("reautenticacion-requerida", "corregir-usuario-de-grupo"));
        }

        var intacta = await ApiAsync<UsuarioDto>("GET", $"/api/v1/usuarios/{admin.Id}", g.Admin, null, null, 200);
        (intacta.Correo, intacta.Identidades.Count).ShouldBe((admin.Correo, 0));

        // Confirmada la passkey, se acepta (cinco minutos); la clave de arranque nunca lo pide.
        await ReautenticarAsync(autenticador, token);
        (await (await ComoPersonaAsync("PUT", url, new CorregirUsuarioDto("Ana Rojas", correoNuevo), token, 200)).ReadAsJsonAsync<UsuarioDto>())!.Correo.ShouldBe(correoNuevo);
        await ApiAsync<UsuarioDto>("PUT", url, ApiFixture.ClavePlataforma, null, new CorregirUsuarioDto("Ana Rojas", CorreoNuevo()), 200);
    }

    [Fact]
    public async Task Cambiar_solo_el_nombre_no_toca_las_sesiones_ni_las_passkeys_y_pedir_invitar_sin_ingreso_directo_se_rechaza_sin_cambiar_nada()
    {
        var a = await AdministradorConPasskeyAsync();
        var g = a.Grupo;

        var conOtroNombre = await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(g.TenantId, $"/usuarios/{a.Usuario.Id}"), ApiFixture.ClavePlataforma, null,
            new CorregirUsuarioDto("Nombre corregido", a.Usuario.Correo, Invitar: true), 200);
        (conOtroNombre.Nombre, conOtroNombre.Passkeys).ShouldBe(("Nombre corregido", 1));
        conOtroNombre.InvitadoEn.ShouldBeNull();
        (await ObtenerAsync<YoDto>("/api/v1/yo", a.Token)).ActorId.ShouldBe(a.Usuario.Id.ToString());
        (await EntrarConPasskeyAsync(a.Autenticador)).Metodo.ShouldBe("Passkey");

        var (soloDelegado, _) = await GrupoConSistemaAsync(["Delegado"]);
        var admin = await UsuarioAsync(soloDelegado, "Administrador", deTodoElGrupo: true);
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("PUT", RutaDeGrupo(soloDelegado.TenantId, $"/usuarios/{admin.Id}"),
            new CorregirUsuarioDto(admin.Nombre, CorreoNuevo(), Invitar: true), 422))).ShouldBe("ingreso-directo-apagado");
        (await ApiAsync<UsuarioDto>("GET", $"/api/v1/usuarios/{admin.Id}", soloDelegado.Admin, null, null, 200)).Correo.ShouldBe(admin.Correo);

        // Sin invitar sí se corrige (el sistema integrado la reconoce por su id, no por el correo).
        var correoNuevo = CorreoNuevo();
        (await ApiAsync<UsuarioDto>("PUT", RutaDeGrupo(soloDelegado.TenantId, $"/usuarios/{admin.Id}"), ApiFixture.ClavePlataforma, null,
            new CorregirUsuarioDto(admin.Nombre, correoNuevo), 200)).Correo.ShouldBe(correoNuevo);
    }

    [Fact]
    public async Task Plataforma_reenvia_la_invitacion_a_un_administrador_del_grupo_con_ingreso_directo()
    {
        var g = await GrupoAsync();
        var admin = await UsuarioAsync(g, "Administrador", deTodoElGrupo: true);

        var invitada = await ApiAsync<UsuarioDto>("POST", RutaDeGrupo(g.TenantId, $"/usuarios/{admin.Id}/invitar"), ApiFixture.ClavePlataforma, null, null, 200);
        invitada.InvitadoEn.ShouldNotBeNull();
        (await Correos.EsperarAsync(admin.Correo, c => c.Asunto.Contains("te invitó a Valídalo"))).Texto.ShouldContain("Administrador");
        await ApiAsync<UsuarioDto>("POST", RutaDeGrupo(g.TenantId, $"/usuarios/{admin.Id}/invitar"), ApiFixture.ClavePlataforma, null, null, 200);
        await Correos.EsperarAsync(admin.Correo, c => c.Asunto.Contains("te invitó a Valídalo"), cuantos: 2);
        await using (var consulta = Almacen.QuerySession())
        {
            var sujeto = admin.Id.ToString();
            (await consulta.Query<RegistroDeIngreso>().Where(r => r.SujetoId == sujeto && r.Evento == EventoDeIngreso.UsuarioInvitado).ToListAsync())
                .ShouldAllBe(r => r.ActorTipo == ActorTipo.Plataforma && r.TenantId == g.TenantId);
        }

        // Una cuenta desactivada no se invita; el grupo sin ingreso directo tampoco; lo que no existe y quien no es Plataforma, no.
        var inactivo = await UsuarioAsync(g, "Administrador", deTodoElGrupo: true);
        await ApiAsync<UsuarioDto>("POST", $"/api/v1/usuarios/{inactivo.Id}/desactivar", g.Admin, null, null, 200);
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("POST", RutaDeGrupo(g.TenantId, $"/usuarios/{inactivo.Id}/invitar"), null, 409))).ShouldBe("usuario-inactivo");
        var (soloDelegado, _) = await GrupoConSistemaAsync(["Delegado"]);
        var deDelegado = await UsuarioAsync(soloDelegado, "Administrador", deTodoElGrupo: true);
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("POST", RutaDeGrupo(soloDelegado.TenantId, $"/usuarios/{deDelegado.Id}/invitar"), null, 409))).ShouldBe("ingreso-directo-apagado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("POST", RutaDeGrupo(g.TenantId, $"/usuarios/{Guid.NewGuid()}/invitar"), null, 404))).ShouldBe("usuario-no-encontrado");
        (await CodigoDeErrorAsync(await DeLaConsolaAsync("POST", RutaDeGrupo(Guid.NewGuid(), $"/usuarios/{admin.Id}/invitar"), null, 404))).ShouldBe("tenant-no-encontrado");
        await DeLaConsolaAsync("POST", RutaDeGrupo(g.TenantId, $"/usuarios/{admin.Id}/invitar"), null, 403, g.Admin);
        await DeLaConsolaAsync("POST", RutaDeGrupo(g.TenantId, $"/usuarios/{admin.Id}/invitar"), null, 401, "sin");
    }
}
