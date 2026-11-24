using System.Net;
using System.Net.Http.Headers;
using Marten;
using Microsoft.Extensions.DependencyInjection;
using Validalo.Aplicacion.Comun;
using Validalo.Contratos;
using Validalo.Dominio.Terceros;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// Personas relacionadas con bóveda propia (ADR-0010, PR-1…PR-8) con PostgreSQL y MinIO reales: las personas de la ficha legal son terceros con sus relaciones (idempotente), el
/// requisito <c>DePersonaRelacionada</c> se resuelve contra la relación principal vigente y se cubre con el documento de la bóveda de la persona, la misma persona en dos
/// terceros reutiliza su cédula, una empresa cuyo flujo no la pide no la recibe, y nadie abre la bóveda de una persona con la que no se relaciona.
/// </summary>
[Collection(Colecciones.Api3)]
[Trait("Requiere", "Docker")]
public sealed partial class RequisitosPersonasApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    private static string Cedula() => Random.Shared.NextInt64(1_000_000_000, 9_999_999_999).ToString(System.Globalization.CultureInfo.InvariantCulture);

    private static string FilaLegal(string rol, string numero, string nombres, string? representacion = null, decimal? porcentaje = null) =>
        $$"""
        { "rol": "{{rol}}", "tipo_identificacion": "CC", "numero": "{{numero}}", "nombres": "{{nombres}}", "apellidos": "Prueba", "pep": false, "vinculo_pep": false
          {{(representacion is null ? string.Empty : $", \"tipo_representacion\": \"{representacion}\"")}}
          {{(porcentaje is null ? string.Empty : $", \"porcentaje\": {porcentaje.Value.ToString(System.Globalization.CultureInfo.InvariantCulture)}")}} }
        """;

    private static string LegalCon(params string[] filas) => $$"""{ "personas": [ {{string.Join(", ", filas)}} ] }""";

    private async Task<IReadOnlyList<RelacionEntreTerceros>> EsperarRelacionesAsync(Guid terceroId, Func<IReadOnlyList<RelacionEntreTerceros>, bool> condicion)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda);
            var relaciones = await consulta.Query<RelacionEntreTerceros>().Where(r => r.DestinoId == terceroId).ToListAsync();
            if (condicion(relaciones))
                return relaciones;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"El tercero {terceroId} no llegó a las relaciones esperadas (tiene {relaciones.Count}).");
            await Task.Delay(100);
        }
    }

    private Task<IReadOnlyList<RelacionEntreTercerosDto>> RelacionesAsync(SesionTerceroDto sesion) =>
        TerceroAsync<IReadOnlyList<RelacionEntreTercerosDto>>("GET", "/public/v1/tercero/relaciones", sesion.AccessToken, null, 200);

    /// <summary>Carga en dos pasos del documento de una persona relacionada (va a la bóveda de la persona, no a la del tercero que lo sube).</summary>
    private async Task<ConfirmacionCargaDto> SubirDePersonaAsync(SesionTerceroDto sesion, Guid personaId, string canonico, byte[] contenido)
    {
        var carga = await TerceroAsync<CargaPrefirmadaDto>("POST", "/public/v1/boveda/documentos", sesion.AccessToken,
            new IniciarCargaDto(canonico.ToLowerInvariant() + ".pdf", contenido.Length, "application/pdf", TipoCanonico: canonico, TerceroRelacionadoId: personaId), 201);
        using var put = new HttpRequestMessage(HttpMethod.Put, carga.Carga!.Url) { Content = new ByteArrayContent(contenido) };
        put.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(carga.Carga.Cabeceras["Content-Type"]);
        using var respuesta = await Http.SendAsync(put);
        respuesta.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await TerceroAsync<ConfirmacionCargaDto>("POST", $"/public/v1/boveda/documentos/{carga.DocumentoId}/versiones/{carga.Version}/confirmar",
            sesion.AccessToken, null, 200);
    }

    /// <summary>Empresa nueva cuyo flujo PROVEEDOR pide la cédula del representante legal (y nada más): lo mínimo para probar el requisito de persona.</summary>
    private async Task<Empresa> EmpresaQuePideLaCedulaDelRepresentanteAsync(string nombre, string prefijo, bool todas = false, string rol = "RepresentanteLegal")
    {
        var empresa = await EmpresaNuevaAsync(nombre, prefijo);
        var flujo = await FlujoConAsync(empresa, "PROVEEDOR", [new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", DePersonaRelacionada: rol, TodasLasRelaciones: todas)]);
        var pedido = flujo.Publicada!.Requisitos.ShouldHaveSingleItem();
        (pedido.DePersonaRelacionada, pedido.TodasLasRelaciones).ShouldBe((rol, todas));
        return empresa;
    }

    private async Task<(VinculoDto Vinculo, SesionTerceroDto Sesion, Guid ExpedienteId)> ProveedorAceptadoAsync(Empresa empresa, string? nit = null)
    {
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(empresa, "PROVEEDOR", correo, nit);
        var sesion = await SesionAsync(correo);
        await AceptarAsync(sesion, vinculo.Id);
        var expedienteId = (await ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{vinculo.Id}", Admin(empresa), null, 200)).ExpedienteAbiertoId!.Value;
        return (vinculo, sesion, expedienteId);
    }

    // ---------- PR-2: de la ficha a terceros y relaciones ----------

    [Fact]
    public async Task Las_personas_de_la_ficha_legal_se_vuelven_terceros_con_relaciones_y_repetir_la_sincronizacion_no_duplica_nada()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Sincroniza S.A.S.", "SINC");
        var (vinculo, sesion, expedienteId) = await ProveedorAceptadoAsync(empresa);
        var (juan, maria, pedro) = (Cedula(), Cedula(), Cedula());

        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", juan, "Juan", "Principal"), FilaLegal("Suplente", maria, "María"),
            FilaLegal("Socio", pedro, "Pedro", porcentaje: 100)));

        // El guardado publica la sincronización por el outbox: sin que nadie pregunte, aparecen las tres relaciones.
        var relaciones = await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 3);
        relaciones.ShouldAllBe(r => r.Estado == EstadoDeRelacion.Confirmada && r.DeFicha && r.Fuente == FuenteDeRelacion.Declarada);
        relaciones.Select(r => r.Tipo).ShouldBe([TipoRelacionTerceros.RepresentanteLegal, TipoRelacionTerceros.Suplente, TipoRelacionTerceros.Socio], ignoreOrder: true);
        relaciones.ShouldAllBe(r => r.Principal);
        relaciones.Single(r => r.Tipo == TipoRelacionTerceros.Socio).Participacion.ShouldBe(100m);

        // Cada persona es un tercero persona natural único por su identificación, sin contactos ni vínculos propios.
        await using (var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession())
        {
            var persona = await consulta.Query<Tercero>().SingleAsync(t => t.ClaveIdentificacion == $"CO|CC|{juan}");
            persona.TipoPersona.ShouldBe(TipoPersona.Natural);
            persona.Contactos.ShouldBeEmpty();
            persona.Nombre.ShouldBe("Juan Prueba");
            relaciones.Single(r => r.Tipo == TipoRelacionTerceros.RepresentanteLegal).OrigenId.ShouldBe(persona.Id);
        }

        // Lo ve el tercero (con los documentos de la bóveda de cada persona sin cargar) y repetir no cambia nada: ni versiones ni personas.
        await EsperarAsync(empresa, expedienteId, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var lista = await RelacionesAsync(sesion);
        lista.Count.ShouldBe(3);
        var representante = lista.Single(r => r.Tipo == "RepresentanteLegal");
        (representante.Nombre, representante.Principal, representante.Estado, representante.DeFicha).ShouldBe(("Juan Prueba", true, "Confirmada", true));
        representante.Documentos.Select(d => d.TipoCanonico).ShouldBe(["CEDULA", "PASAPORTE", "CERTIFICADO_ANTECEDENTES"]);
        representante.Documentos.ShouldAllBe(d => d.DocumentoId == null);
        representante.Documentos.Single(d => d.TipoCanonico == "CEDULA").Pedido.ShouldBeTrue(); // el flujo de la empresa la pide
        (await RelacionesAsync(sesion)).Select(r => r.Id).ShouldBe(lista.Select(r => r.Id));
        var versiones = relaciones.ToDictionary(r => r.Id, r => r.Version);
        (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count == 3)).ToDictionary(r => r.Id, r => r.Version).ShouldBe(versiones);

        // Si una persona sale de la ficha, su relación termina; la de las demás sigue.
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", juan, "Juan", "Principal"), FilaLegal("Suplente", maria, "María")));
        var despues = await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Count(x => x.Estado == EstadoDeRelacion.Finalizada) == 1);
        despues.Single(r => r.Estado == EstadoDeRelacion.Finalizada).Tipo.ShouldBe(TipoRelacionTerceros.Socio);
        (await RelacionesAsync(sesion)).Select(r => r.Tipo).ShouldBe(["RepresentanteLegal", "Suplente"]);
    }

    [Fact]
    public async Task El_tercero_declara_confirma_y_termina_personas_relacionadas_por_su_cuenta()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Declara S.A.S.", "DECL");
        var (vinculo, sesion, _) = await ProveedorAceptadoAsync(empresa);
        var numero = Cedula();

        var creada = await (await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "CC", numero), "Beatriz Beneficiaria", "BeneficiarioFinal", false, 35, "Accionista"), 201)).ReadAsJsonAsync<RelacionEntreTercerosDto>();
        (creada!.Tipo, creada.Estado, creada.Fuente, creada.DeFicha, creada.Participacion).ShouldBe(("BeneficiarioFinal", "Confirmada", "Declarada", false, 35m));
        await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "CC", numero), "Beatriz Beneficiaria", "BeneficiarioFinal"), 409);

        // Reglas: tipo, persona natural y nombre.
        (await CodigoAsync(await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "CC", Cedula()), "X", "Dueño"), 422))).ShouldBe("tipo-relacion-invalido");
        (await CodigoAsync(await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "NIT", Nit()), "Sociedad", "BeneficiarioFinal"), 422))).ShouldBe("persona-no-natural");
        (await CodigoAsync(await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "CC", Cedula()), " ", "BeneficiarioFinal"), 422))).ShouldBe("nombre-requerido");

        // Terminarla: la declarada a mano termina; la que viene de la ficha no (se quita de la ficha).
        await TerceroAsync("DELETE", $"/public/v1/tercero/relaciones/{creada.Id}", sesion.AccessToken, null, 204);
        (await RelacionesAsync(sesion)).ShouldBeEmpty();
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", Cedula(), "Rita", "Principal")));
        var deFicha = (await EsperarRelacionesAsync(vinculo.TerceroId, r => r.Any(x => x.DeFicha))).Single(r => r.DeFicha);
        (await CodigoAsync(await TerceroAsync("DELETE", $"/public/v1/tercero/relaciones/{deFicha.Id}", sesion.AccessToken, null, 409))).ShouldBe("relacion-de-la-ficha");

        // Vuelve a declararla y queda vigente de nuevo.
        var otra = await (await TerceroAsync("POST", "/public/v1/tercero/relaciones", sesion.AccessToken,
            new DeclararRelacionDto(new IdentificacionDto("CO", "CC", numero), "Beatriz Beneficiaria", "BeneficiarioFinal"), 201)).ReadAsJsonAsync<RelacionEntreTercerosDto>();
        otra!.Id.ShouldBe(creada.Id);
    }

    // ---------- PR-3: el requisito de persona relacionada ----------

    [Fact]
    public async Task El_flujo_valida_el_requisito_de_persona_relacionada()
    {
        var empresa = await EmpresaNuevaAsync("Valida S.A.S.", "VALI");
        await ApiAsync("POST", "/api/v1/areas", Admin(empresa), new CrearAreaDto("REVISION", "Revisión"), 201);

        async Task<string?> CrearAsync(RequisitoDelFlujoDto requisito, string codigo) => await CodigoAsync(await ApiAsync("POST", "/api/v1/flujos", Admin(empresa),
            new CrearFlujoDto(codigo, codigo, "PROVEEDOR", Requisitos: [requisito, new RequisitoDelFlujoDto(TipoDocumento: "RUT")]), 422));

        (await CrearAsync(new RequisitoDelFlujoDto(TipoDocumento: "CAMARA_COMERCIO", DePersonaRelacionada: "RepresentanteLegal"), "FLUJO_A")).ShouldBe("persona-no-aplica");
        (await CrearAsync(new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", DePersonaRelacionada: "Dueño"), "FLUJO_B")).ShouldBe("rol-invalido");
        (await CrearAsync(new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", TodasLasRelaciones: true), "FLUJO_C")).ShouldBe("todas-sin-rol");
        (await CrearAsync(new RequisitoDelFlujoDto(Seccion: "FICHA_LEGAL", DePersonaRelacionada: "Socio"), "FLUJO_D")).ShouldBe("persona-no-aplica");

        // La misma cédula para dos roles es válida; repetirla para el mismo rol no.
        await ApiAsync<FlujoDto>("POST", "/api/v1/flujos", Admin(empresa), new CrearFlujoDto("FLUJO_OK", "Flujo OK", "PROVEEDOR", Requisitos:
        [
            new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", DePersonaRelacionada: "RepresentanteLegal"),
            new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", DePersonaRelacionada: "Socio", TodasLasRelaciones: true),
            new RequisitoDelFlujoDto(TipoDocumento: "CEDULA")
        ]), 201);
        (await CodigoAsync(await ApiAsync("POST", "/api/v1/flujos", Admin(empresa), new CrearFlujoDto("FLUJO_DUP", "Flujo DUP", "PROVEEDOR", Requisitos:
        [
            new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", DePersonaRelacionada: "Socio"),
            new RequisitoDelFlujoDto(TipoDocumento: "CEDULA", DePersonaRelacionada: "Socio", TodasLasRelaciones: true),
            new RequisitoDelFlujoDto(TipoDocumento: "RUT")
        ]), 422))).ShouldBe("requisito-duplicado");
    }

    [Fact]
    public async Task El_requisito_de_cedula_del_representante_espera_a_la_persona_y_el_documento_de_su_boveda_lo_cubre()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Cubre S.A.S.", "CUBR");
        var (vinculo, sesion, expedienteId) = await ProveedorAceptadoAsync(empresa);

        // Nadie cumple el rol todavía: el requisito nace pendiente y sin persona, y frena el expediente.
        var abierto = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Admin(empresa), null, 200);
        var cedula = Requisito(abierto, "CEDULA");
        (cedula.Estado, cedula.Persona!.SinPersona, cedula.Persona.Rol).ShouldBe(("Pendiente", true, "RepresentanteLegal"));
        abierto.Estado.ShouldBe("Abierto");

        // El tercero declara a su representante en la ficha: el expediente abierto la recalcula y el requisito pasa a pedir la cédula de Juan.
        var numero = Cedula();
        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", numero, "Juan", "Principal")));
        var conPersona = await EsperarAsync(empresa, expedienteId, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var pedida = Requisito(conPersona, "CEDULA");
        (pedida.Persona!.Nombre, pedida.Persona.Identificacion, pedida.Estado).ShouldBe(("Juan Prueba", $"CO CC {numero}", "Pendiente"));
        var juan = (await RelacionesAsync(sesion)).Single();
        pedida.Persona.PersonaId.ShouldBe(juan.PersonaId);
        pedida.Id.ShouldBe(cedula.Id); // conserva su id

        // El documento se sube a la bóveda de Juan (no a la del tercero) y se comparte con el vínculo que lo pide.
        var contenido = Pdf("Cédula de Juan");
        var subida = await SubirDePersonaAsync(sesion, juan.PersonaId, "CEDULA", contenido);
        subida.Compartidos.ShouldHaveSingleItem().VinculoId.ShouldBe(vinculo.Id);
        var enRevision = await EsperarAsync(empresa, expedienteId, x => x.Estado == "EnRevision");
        var cubierto = Requisito(enRevision, "CEDULA");
        cubierto.VersionActual!.Sha256.ShouldBe(Sha256(contenido));
        cubierto.VersionActual.DocumentoId.ShouldBe(subida.Version.DocumentoId);

        // La bóveda del tercero no recibió nada: el documento es de la persona.
        var boveda = await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", sesion.AccessToken, null, 200);
        boveda.Documentos.ShouldBeEmpty();
        (await RelacionesAsync(sesion)).Single().Documentos.Single(d => d.TipoCanonico == "CEDULA").Estado.ShouldBe("Actual");

        // La empresa ve a la persona con su cédula compartida y la descarga; el tercero no descarga lo de la persona desde su bóveda.
        var personas = await ApiAsync<IReadOnlyList<PersonaDelVinculoDto>>("GET", $"/api/v1/vinculos/{vinculo.Id}/personas-relacionadas", Admin(empresa), null, 200);
        var persona = personas.ShouldHaveSingleItem();
        (persona.Nombre, persona.Tipo, persona.Principal).ShouldBe(("Juan Prueba", "RepresentanteLegal", true));
        persona.Documentos.ShouldHaveSingleItem().Tipo.Codigo.ShouldBe("CEDULA");
        await ApiAsync<DescargaDto>("POST", $"/api/v1/vinculos/{vinculo.Id}/documentos/{subida.Version.DocumentoId}/versiones/1/descarga", Admin(empresa), null, 200);
        await ApiAsync("GET", $"/api/v1/vinculos/{vinculo.Id}/documentos/{subida.Version.DocumentoId}", Admin(empresa), null, 200);
        await TerceroAsync("GET", $"/public/v1/boveda/documentos/{subida.Version.DocumentoId}", sesion.AccessToken, null, 404);
    }

    [Fact]
    public async Task La_misma_persona_en_dos_terceros_reutiliza_su_cedula_sin_volver_a_subirla()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Reutiliza S.A.S.", "REUT");
        var numero = Cedula();

        // El primer tercero declara a Juan y sube su cédula.
        var (vinculoA, sesionA, expedienteA) = await ProveedorAceptadoAsync(empresa);
        await GuardarSeccionAsync(sesionA, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", numero, "Juan", "Principal")));
        await EsperarAsync(empresa, expedienteA, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var juan = (await RelacionesAsync(sesionA)).Single();
        var subida = await SubirDePersonaAsync(sesionA, juan.PersonaId, "CEDULA", Pdf("Cédula de Juan"));
        await EsperarAsync(empresa, expedienteA, x => x.Estado == "EnRevision");

        // El segundo tercero (otro NIT) tiene a la misma persona como representante: su expediente la encuentra ya compartida y no pide subir nada.
        var (vinculoB, sesionB, expedienteB) = await ProveedorAceptadoAsync(empresa);
        await GuardarSeccionAsync(sesionB, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", numero, "Juan", "Principal")));
        var cubierto = await EsperarAsync(empresa, expedienteB, x => Requisito(x, "CEDULA").VersionActual is not null);
        Requisito(cubierto, "CEDULA").VersionActual!.DocumentoId.ShouldBe(subida.Version.DocumentoId);
        (await RelacionesAsync(sesionB)).Single().PersonaId.ShouldBe(juan.PersonaId);
        cubierto = await EsperarAsync(empresa, expedienteB, x => x.Estado == "EnRevision");

        // Una sola persona y una sola cédula en la plataforma, compartida con los dos vínculos.
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda);
        (await consulta.Query<Validalo.Dominio.Documentos.Documento>().Where(d => d.TerceroId == juan.PersonaId).ToListAsync()).ShouldHaveSingleItem()
            .Comparticiones.Select(c => c.VinculoId).Distinct().ShouldBe([vinculoA.Id, vinculoB.Id], ignoreOrder: true);
    }

    [Fact]
    public async Task Una_empresa_cuyo_flujo_no_pide_la_cedula_de_la_persona_no_la_recibe_ni_la_ve()
    {
        var norte = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Pide S.A.S.", "PIDE");
        var sur = await EmpresaNuevaAsync("No pide S.A.S.", "NOPI");
        await FlujoConAsync(sur, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT")]);
        var nit = Nit();
        var correo = CorreoNuevo();
        var vinculoNorte = await CrearVinculoAsync(norte, "PROVEEDOR", correo, nit);
        var sesion = await SesionAsync(correo, norte.Datos.Nombre);
        await AceptarAsync(sesion, vinculoNorte.Id);
        var vinculoSur = await CrearVinculoAsync(sur, "CLIENTE", correo, nit);
        await AceptarAsync(await SesionAsync(correo, sur.Datos.Nombre), vinculoSur.Id);

        await GuardarSeccionAsync(sesion, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", Cedula(), "Juan", "Principal")));
        var expedienteNorte = (await ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{vinculoNorte.Id}", Admin(norte), null, 200)).ExpedienteAbiertoId!.Value;
        await EsperarAsync(norte, expedienteNorte, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var juan = (await RelacionesAsync(sesion)).Single();
        var subida = await SubirDePersonaAsync(sesion, juan.PersonaId, "CEDULA", Pdf("Cédula de Juan"));

        // Solo el vínculo de Norte recibió el documento.
        subida.Compartidos.ShouldHaveSingleItem().VinculoId.ShouldBe(vinculoNorte.Id);
        await ApiAsync("GET", $"/api/v1/vinculos/{vinculoSur.Id}/documentos/{subida.Version.DocumentoId}", Admin(sur), null, 404);
        await ApiAsync("POST", $"/api/v1/vinculos/{vinculoSur.Id}/documentos/{subida.Version.DocumentoId}/versiones/1/descarga", Admin(sur), null, 404);
        // Y tampoco la ve como persona del tercero: su flujo no la involucra.
        (await ApiAsync<IReadOnlyList<PersonaDelVinculoDto>>("GET", $"/api/v1/vinculos/{vinculoSur.Id}/personas-relacionadas", Admin(sur), null, 200)).ShouldBeEmpty();
        (await ApiAsync<IReadOnlyList<PersonaDelVinculoDto>>("GET", $"/api/v1/vinculos/{vinculoNorte.Id}/personas-relacionadas", Admin(norte), null, 200)).ShouldHaveSingleItem();
        // Ni Norte ve el documento a través de otro vínculo suyo (el de Sur es de otro tenant: se comprobó arriba).
        await ApiAsync("GET", $"/api/v1/vinculos/{vinculoNorte.Id}/documentos/{subida.Version.DocumentoId}", Admin(norte), null, 200);
    }

    [Fact]
    public async Task Nadie_abre_la_boveda_de_una_persona_con_la_que_su_tercero_no_se_relaciona()
    {
        var empresa = await EmpresaQuePideLaCedulaDelRepresentanteAsync("Ajena S.A.S.", "AJEN");
        var (_, sesionA, expedienteA) = await ProveedorAceptadoAsync(empresa);
        await GuardarSeccionAsync(sesionA, "FICHA_LEGAL", LegalCon(FilaLegal("RepresentanteLegal", Cedula(), "Juan", "Principal")));
        await EsperarAsync(empresa, expedienteA, x => !Requisito(x, "CEDULA").Persona!.SinPersona);
        var juan = (await RelacionesAsync(sesionA)).Single();
        var subida = await SubirDePersonaAsync(sesionA, juan.PersonaId, "CEDULA", Pdf("Cédula de Juan"));

        // Otro tercero, sin relación con Juan, no puede subirle documentos ni confirmarle cargas ni verlos.
        var (_, sesionB, _) = await ProveedorAceptadoAsync(empresa);
        var contenido = Pdf("Otra cédula");
        var iniciar = await TerceroAsync("POST", "/public/v1/boveda/documentos", sesionB.AccessToken,
            new IniciarCargaDto("cedula.pdf", contenido.Length, "application/pdf", TipoCanonico: "CEDULA", TerceroRelacionadoId: juan.PersonaId), 404);
        (await CodigoAsync(iniciar)).ShouldBe("persona-no-encontrada");
        await TerceroAsync("POST", $"/public/v1/boveda/documentos/{subida.Version.DocumentoId}/versiones/2/confirmar", sesionB.AccessToken, null, 404);
        await TerceroAsync("GET", $"/public/v1/boveda/documentos/{subida.Version.DocumentoId}", sesionB.AccessToken, null, 404);
        (await RelacionesAsync(sesionB)).ShouldBeEmpty();

        // Solo los documentos de persona (cédula, pasaporte, antecedentes) y solo con un contacto: ni un RUT, ni un token que no es de un contacto.
        (await CodigoAsync(await TerceroAsync("POST", "/public/v1/boveda/documentos", sesionA.AccessToken,
            new IniciarCargaDto("rut.pdf", contenido.Length, "application/pdf", TipoCanonico: "RUT", TerceroRelacionadoId: juan.PersonaId), 422))).ShouldBe("documento-no-es-de-persona");
    }
}
