using Validalo.Contratos;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// «Subir un soporte» en una sección de la ficha (FD-10): el tercero indica qué documento es y la carga es la de siempre de la bóveda, con ese tipo canónico.
/// Aquí se prueba lo que el portal da por hecho: un RUT subido así es el RUT de la bóveda (nombre, versión, expediente), lo lee la IA y la sección propone los
/// valores; lo que no es ninguno de los documentos de la sección es «Otro soporte»; y una lectura que no se pudo dice por qué.
/// </summary>
[Collection(Colecciones.Api2)]
[Trait("Requiere", "Docker")]
public sealed class RequisitosFichaSoporteApiTests(ApiFixture fixture, ITestOutputHelper salida) : RequisitosApiBase(fixture, salida)
{
    [Fact]
    public async Task Un_RUT_subido_como_soporte_de_la_general_es_el_RUT_de_la_boveda_lo_lee_la_IA_y_cubre_el_requisito_del_expediente()
    {
        var e = await PrepararAsync();
        await PlanIaAsync(e.Norte, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa()));
        await FlujoRutYGeneralAsync(e);
        var correo = CorreoNuevo();
        var nit = Nit();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo, nit);
        var sesion = await SesionAsync(correo);
        await GuardarSeccionAsync(sesion, "FICHA_GENERAL", GeneralCompleta);
        await AceptarAsync(sesion, vinculo.Id);

        // «Subir un soporte» con «Registro Único Tributario» elegido: la carga de la bóveda con el canónico RUT (no con SOPORTE_FICHA).
        var rut1 = (await SubirAsync(sesion, "RUT", RutCon(nit, "Calle 45 # 12-08"))).Version;
        var boveda = await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", sesion.AccessToken, null, 200);
        var enLaBoveda = boveda.Documentos.Single(d => d.Id == rut1.DocumentoId);
        (enLaBoveda.Tipo.Codigo, enLaBoveda.Tipo.Nombre, enLaBoveda.Ambito, enLaBoveda.VersionActual!.N).ShouldBe(("RUT", "Registro Único Tributario", "Global", 1));

        // El expediente que pide el RUT lo da por cargado, igual que si lo hubiera subido desde la bóveda.
        var expedienteId = await AbiertoEnAsync(e.Norte, vinculo.Id);
        var expediente = await EsperarAsync(e.Norte, expedienteId, x => Requisito(x, "RUT").VersionActual is not null);
        Requisito(expediente, "RUT").VersionActual!.N.ShouldBe(1);

        // Un RUT nuevo desde la sección: versión 2 del mismo documento (no otro), que la IA lee y la general propone sin guardar nada.
        var rut2 = (await SubirAsync(sesion, "RUT", RutCon(nit, "Cl 80 # 10-20"))).Version;
        (rut2.DocumentoId, rut2.N).ShouldBe((rut1.DocumentoId, 2));
        List<PropuestaDeSeccionDto> propuestas = [];
        await EsperarAsync(async () =>
        {
            propuestas = await TerceroAsync<List<PropuestaDeSeccionDto>>("GET", $"{RutaFicha}/FICHA_GENERAL/propuestas", sesion.AccessToken, null, 200);
            return propuestas.Any(p => p.Disponible);
        }, "la propuesta del RUT subido desde la sección");
        var propuesta = propuestas.ShouldHaveSingleItem();
        (propuesta.Documento.DocumentoId, propuesta.Documento.Version, propuesta.Documento.TipoDocumento, propuesta.Documento.NombreDocumento)
            .ShouldBe((rut1.DocumentoId, 2, "RUT", "Registro Único Tributario"));
        propuesta.Campos.ShouldBe([new CampoPropuestoDto("direccion", "Dirección", "Calle 45 # 12-08", "Cl 80 # 10-20")]);
        (await TerceroAsync<SeccionFichaDto>("GET", $"{RutaFicha}/FICHA_GENERAL", sesion.AccessToken, null, 200)).Version.ShouldBe(1);

        // «Usar estos valores» y guardar: el RUT queda como soporte de la sección, con su nombre real.
        var guardada = await GuardarSeccionAsync(sesion, "FICHA_GENERAL", propuesta.Datos!.Value.GetRawText(), new SoporteSeccionDto(rut2.DocumentoId, rut2.N));
        guardada.Seccion.Soportes.ShouldHaveSingleItem().ShouldBe(new SoporteSeccionDto(rut2.DocumentoId, rut2.N, "RUT", false, "Registro Único Tributario"));

        // La web de la empresa ve el nombre real de ese soporte en la ficha del tercero y puede abrirlo: el RUT está compartido con el vínculo en esa versión.
        var ficha = await ApiAsync<FichaTerceroDto>("GET", $"/api/v1/terceros/{vinculo.TerceroId}/ficha", Admin(e.Norte), null, 200);
        var soporte = ficha.Secciones!.Single(s => s.Seccion == "FICHA_GENERAL").Soportes.ShouldHaveSingleItem();
        (soporte.TipoDocumento, soporte.Nombre, soporte.Version).ShouldBe(("RUT", "Registro Único Tributario", 2));
        var compartido = ficha.Vinculos.Single().Documentos!.Single(d => d.DocumentoId == soporte.DocumentoId);
        compartido.Tipo.Nombre.ShouldBe("Registro Único Tributario");
        compartido.VersionesCompartidas.Select(v => v.N).ShouldContain(soporte.Version);
    }

    [Fact]
    public async Task Otro_soporte_se_llama_Otro_soporte_en_la_boveda_en_la_ficha_del_tercero_y_en_la_de_la_empresa()
    {
        var e = await PrepararAsync();
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "PROVEEDOR", correo, Nit());
        var sesion = await SesionAsync(correo);

        // «Otro documento»: lo que no es ninguno de los que respaldan la sección conserva el comportamiento genérico, con un nombre claro.
        var otro = (await SubirAsync(sesion, "SOPORTE_FICHA", Pdf("Contrato de arrendamiento de la bodega"))).Version;
        var boveda = await TerceroAsync<BovedaDto>("GET", "/public/v1/boveda", sesion.AccessToken, null, 200);
        var enLaBoveda = boveda.Documentos.Single(d => d.Id == otro.DocumentoId);
        (enLaBoveda.Tipo.Codigo, enLaBoveda.Tipo.Nombre).ShouldBe(("SOPORTE_FICHA", "Otro soporte"));

        var tributaria = await GuardarSeccionAsync(sesion, "FICHA_TRIBUTARIA",
            """{ "responsabilidades": ["5", "7", "48", "52"], "responsable_ica": true, "ica": [ { "municipio": "11001", "ciiu": "4663" } ] }""",
            new SoporteSeccionDto(otro.DocumentoId, otro.N));
        tributaria.Seccion.Soportes.ShouldHaveSingleItem().ShouldBe(new SoporteSeccionDto(otro.DocumentoId, otro.N, "SOPORTE_FICHA", false, "Otro soporte"));
        (await TerceroAsync<SeccionFichaDto>("GET", $"{RutaFicha}/FICHA_TRIBUTARIA", sesion.AccessToken, null, 200)).Soportes
            .ShouldHaveSingleItem().Nombre.ShouldBe("Otro soporte");

        // La empresa, aunque no recibió el documento, lee cuál es el tipo del soporte de la sección.
        var ficha = await ApiAsync<FichaTerceroDto>("GET", $"/api/v1/terceros/{vinculo.TerceroId}/ficha", Admin(e.Norte), null, 200);
        ficha.Secciones!.Single(s => s.Seccion == "FICHA_TRIBUTARIA").Soportes.ShouldHaveSingleItem()
            .ShouldSatisfyAllConditions(s => s.TipoDocumento.ShouldBe("SOPORTE_FICHA"), s => s.Nombre.ShouldBe("Otro soporte"));
    }

    [Fact]
    public async Task Una_lectura_que_no_se_pudo_dice_por_que_el_documento_es_ilegible_o_el_analisis_fallo_y_el_soporte_sigue_siendo_elegible()
    {
        // Ilegible: la IA lo leyó y dijo que no se alcanza (marca del analizador falso); el tercero lo sabe para subir una copia más clara.
        var ilegible = await RutSubidoAsync("ok", Pdf("RUT borroso [[legible=false]]"));
        await EsperarAsync(async () => (await DocumentoDeBovedaAsync(ilegible.Rut.DocumentoId))?.VersionRequerida(1).Ia is not null, "el análisis del RUT borroso");
        var sinLectura = (await PropuestasDeLaGeneralAsync(ilegible.Sesion)).ShouldHaveSingleItem();
        (sinLectura.Disponible, sinLectura.Motivo, sinLectura.Campos.Count, sinLectura.Datos).ShouldBe((false, "documento-ilegible", 0, (System.Text.Json.JsonElement?)null));

        // Fallida: el analizador falló (fail-closed) y la versión no se vuelve a analizar.
        var fallida = await RutSubidoAsync("falla", RutCon(Nit(), "Cl 80 # 10-20"));
        await EsperarAsync(async () => (await DocumentoDeBovedaAsync(fallida.Rut.DocumentoId))?.VersionRequerida(1).FalloIa is not null, "el fallo del análisis");
        var fallo = (await PropuestasDeLaGeneralAsync(fallida.Sesion)).ShouldHaveSingleItem();
        (fallo.Disponible, fallo.Motivo, fallo.Documento.DocumentoId).ShouldBe((false, "lectura-fallida", fallida.Rut.DocumentoId));

        // Al marcarlo como soporte y guardar, el aviso se va: sin propuesta, el soporte queda elegido.
        var guardada = await GuardarSeccionAsync(fallida.Sesion, "FICHA_GENERAL", GeneralCompleta, new SoporteSeccionDto(fallida.Rut.DocumentoId, fallida.Rut.N));
        guardada.Seccion.Soportes.ShouldHaveSingleItem().Nombre.ShouldBe("Registro Único Tributario");
        (await PropuestasDeLaGeneralAsync(fallida.Sesion)).ShouldBeEmpty();
    }

    /// <summary>Una empresa con la llave de IA <paramref name="marcador"/> que pide el RUT y la general, y su tercero con la general guardada y el RUT subido.</summary>
    private async Task<(SesionTerceroDto Sesion, VersionDocumentoDto Rut)> RutSubidoAsync(string marcador, byte[] contenido)
    {
        var empresa = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");
        await PlanIaAsync(empresa, new ActualizarPlanIaEmpresaDto(10, false, ApiKeyOpenAi: LlaveIa(marcador)));
        await FlujoConAsync(empresa, "CLIENTE", [new RequisitoDelFlujoDto(TipoDocumento: "RUT"), new RequisitoDelFlujoDto(Seccion: "FICHA_GENERAL")]);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(empresa, "CLIENTE", correo, Nit());
        var sesion = await SesionAsync(correo);
        await GuardarSeccionAsync(sesion, "FICHA_GENERAL", GeneralCompleta);
        await AceptarAsync(sesion, vinculo.Id);
        return (sesion, (await SubirAsync(sesion, "RUT", contenido)).Version);
    }

    private Task<List<PropuestaDeSeccionDto>> PropuestasDeLaGeneralAsync(SesionTerceroDto sesion) =>
        TerceroAsync<List<PropuestaDeSeccionDto>>("GET", $"{RutaFicha}/FICHA_GENERAL/propuestas", sesion.AccessToken, null, 200);
}
