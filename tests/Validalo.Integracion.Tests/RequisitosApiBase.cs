using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Alba;
using Marten;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Expedientes;
using Validalo.Contratos;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Expedientes;
using Validalo.Dominio.Ficha;
using Validalo.Aplicacion.Ia;
using Validalo.Aplicacion.Vinculos;
using Wolverine;
using Wolverine.Tracking;
using Xunit.Abstractions;

namespace Validalo.Integracion.Tests;

/// <summary>
/// Ayudantes compartidos de las pruebas de requisitos y de todo lo que se apoya en ellas (escenario de Norte, llamadas con llave o con
/// delegado, sesiones del tercero, PDF de prueba). Las pruebas viven en clases hermanas (una por archivo <c>Requisitos*ApiTests.cs</c>) para que
/// xUnit las reparta entre colecciones y corran en paralelo, cada colección con su propio host y su propia base (decisión PV-1).
/// </summary>
public abstract partial class RequisitosApiBase(ApiFixture fixture, ITestOutputHelper salida)
{
    protected static readonly HttpClient Http = new();

    protected static readonly string[] ScopesDeSistema =
    [
        "configuracion:leer", "vinculos:leer", "flujos:leer", "expedientes:leer", "expedientes:revisar", "documentos:leer", "cuentas:aprobar"
    ];

    protected ApiFixture Fixture { get; } = fixture;

    protected ITestOutputHelper Salida { get; } = salida;

    protected IAlbaHost Host => Fixture.Host;

    [GeneratedRegex(@"/e/([A-Za-z0-9_-]{43})")]
    protected static partial Regex RegexToken();

    [GeneratedRegex(@"\b(\d{6})\b")]
    protected static partial Regex RegexCodigo();

    protected sealed record Credencial(string ApiKey, Guid? Empresa = null, string? Delegado = null);

    protected sealed record Persona(UsuarioDto Usuario, string Sub);

    protected sealed record Empresa(string Admin, EmpresaDto Datos, string LlaveSrm, RSA ClaveSrm);

    protected sealed record Descarga(HttpStatusCode Estado, string? Tipo, string? Nombre, byte[] Contenido);

    protected sealed record Escenario(Empresa Norte, AreaDto Compras, AreaDto Cumplimiento, Persona Laura, Persona Carlos, FlujoDto Flujo);

    protected sealed record Aprobado(Escenario E, VinculoDto Vinculo, SesionTerceroDto Sesion, Guid Expediente, int Emision);

    /// <summary>Proveedor de Norte con RUT y Cámara aprobados por Compras y Cumplimiento.</summary>
    protected async Task<Aprobado> ProveedorAprobadoAsync()
    {
        var e = await PrepararAsync();
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "PROVEEDOR", correo);
        var sesion = await SesionAsync(correo);
        await SubirAsync(sesion, "RUT", Pdf("RUT v1"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara v1"));
        await AceptarAsync(sesion, vinculo.Id);
        var inicial = await ExpedienteAbiertoAsync(e, vinculo.Id);
        await AprobarAreasAsync(e, inicial);
        (await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{inicial}", Admin(e.Norte), null, 200)).Estado.ShouldBe("Aprobado");
        var certificado = (await ApiAsync<CertificadoDelVinculoDto>("GET", $"/api/v1/vinculos/{vinculo.Id}/certificado", Admin(e.Norte), null, 200)).Actual!;
        // «Revalidar cada N días» cuenta desde la aprobación y la bóveda registra esa vigencia por un barrido corto, después de aprobar (TD-10): se espera a que quede
        // registrada para que lo que se lea enseguida (vencimientos, informes) no dependa de esa espera.
        foreach (var requisito in (await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{inicial}", Admin(e.Norte), null, 200)).Requisitos!)
            await EsperarVigenciaAsync(requisito.VersionActual!.DocumentoId, vinculo.Id, requisito.TipoDocumento.Codigo);
        return new Aprobado(e, vinculo, sesion, inicial, certificado.Emision);
    }

    protected async Task<Guid> ExpedienteAbiertoAsync(Escenario e, Guid vinculoId)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            if ((await ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{vinculoId}", Admin(e.Norte), null, 200)).ExpedienteAbiertoId is { } id)
                return id;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException("No se abrió el expediente.");
            await Task.Delay(200);
        }
    }

    /// <summary>
    /// Compras y Cumplimiento aprueban lo que les toca del expediente. Si el procesador de certificados escribe a la vez
    /// (con el reloj adelantado vence el certificado), la decisión pierde la carrera (412) y se repite, como al recargar.
    /// </summary>
    protected async Task AprobarAreasAsync(Escenario e, Guid expedienteId)
    {
        foreach (var (area, persona, codigo) in new[] { (e.Compras, e.Laura, "COMPRAS"), (e.Cumplimiento, e.Carlos, "CUMPLIMIENTO") })
        {
            for (var intento = 1; ; intento++)
            {
                var leido = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Delegado(e.Norte, persona), null, 200);
                var porDecidir = Area(leido, codigo).DocumentosPorDecidir ?? [];
                if (porDecidir.Count == 0)
                    break;
                try
                {
                    await AreaAsync<ExpedienteDto>(e, expedienteId, area, persona,
                        new VeredictoDto("Aprobado", Versiones: porDecidir.ToDictionary(d => d.RequisitoId, d => d.VersionVigente)));
                    break;
                }
                catch (Exception ex) when (intento < 5 && ex.Message.Contains("version-desactualizada"))
                {
                    await Task.Delay(200);
                }
            }
        }
    }

    /// <summary>
    /// La vigencia por revalidación llega después de la aprobación de la empresa (TD-10): la pide un barrido corto y la registra la bóveda. Espera (hasta 20 s)
    /// a que la versión del documento tenga fecha de vencimiento para el vínculo.
    /// </summary>
    protected async Task<VigenciaDeVersion> EsperarVigenciaAsync(Guid documentoId, Guid vinculoId, string nombre, int version = 1, Func<VigenciaDeVersion, bool>? condicion = null)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            VigenciaDeVersion? vigencia;
            await using (var boveda = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(TenantsTecnicos.Boveda))
                vigencia = (await boveda.LoadAsync<Documento>(documentoId))!.Buscar(version)!.VigenciaPara(vinculoId);
            if (vigencia?.VigenteHasta is not null && (condicion?.Invoke(vigencia) ?? true))
                return vigencia;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"{nombre} no tiene vigencia para el vínculo {vinculoId}.");
            await Task.Delay(200);
        }
    }

    /// <summary>
    /// Adelanta el reloj al día siguiente del fin de la gracia del documento para el vínculo y dispara su vencimiento (el
    /// mensaje programado, aquí invocado). Devuelve la vigencia que tenía y la renovación que abrió Norte.
    /// </summary>
    protected async Task<(VigenciaDeVersion Vigencia, Guid Renovacion)> VencerAsync(Aprobado a, string codigo)
    {
        var expediente = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{a.Expediente}", Admin(a.E.Norte), null, 200);
        var documentoId = expediente.Requisitos!.Single(r => r.TipoDocumento.Codigo == codigo).VersionActual!.DocumentoId;
        var vigencia = await EsperarVigenciaAsync(documentoId, a.Vinculo.Id, codigo);

        var hoy = CalculadoraDeVigencia.Fecha(DateTimeOffset.UtcNow);
        Fixture.Reloj.Desfase = TimeSpan.FromDays(vigencia.FinDeGracia!.Value.AddDays(1).DayNumber - hoy.DayNumber);
        using (var alcance = Host.Services.CreateScope())
            await alcance.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(
                new Validalo.Aplicacion.Documentos.VencerVersionDeDocumento(documentoId, 1, a.Vinculo.Id, vigencia.VigenteHasta!.Value, vigencia.DiasGracia));
        return (vigencia, await ExpedienteAbiertoAsync(a.E, a.Vinculo.Id));
    }

    // ---------- preparación ----------

    /// <summary>
    /// Empresa con Compras (Laura) y Cumplimiento (Carlos) en paralelo y el flujo PROVEEDOR que pide RUT (ambas áreas) y
    /// Cámara de comercio (solo Cumplimiento), publicado y por defecto; textos legales publicados.
    /// </summary>
    protected async Task<Escenario> PrepararAsync()
    {
        var norte = await EmpresaNuevaAsync("Norte S.A.S.", "NORTE");

        async Task<Persona> PersonaAsync(string nombre, string rol)
        {
            var correo = $"{nombre.Split(' ')[0].ToLowerInvariant()}.{Guid.NewGuid():N}@constructora.co";
            var usuario = await ApiAsync<UsuarioDto>("POST", "/api/v1/usuarios", new Credencial(norte.Admin),
                new CrearUsuarioDto(nombre, correo, null, [new RolAsignadoDto(rol, norte.Datos.Id)], null), 201);
            return new Persona(usuario, "srm-" + Guid.NewGuid().ToString("N")[..8]);
        }

        var laura = await PersonaAsync("Laura Compras", "Revisor");
        var carlos = await PersonaAsync("Carlos Cumplimiento", "OficialCumplimiento");
        var compras = await ApiAsync<AreaDto>("POST", "/api/v1/areas", Admin(norte), new CrearAreaDto("COMPRAS", "Compras"), 201);
        var cumplimiento = await ApiAsync<AreaDto>("POST", "/api/v1/areas", Admin(norte), new CrearAreaDto("CUMPLIMIENTO", "Cumplimiento"), 201);
        await ApiAsync<AreaDto>("PUT", $"/api/v1/areas/{compras.Id}/miembros", Admin(norte), new MiembrosAreaDto([laura.Usuario.Id]), 200);
        await ApiAsync<AreaDto>("PUT", $"/api/v1/areas/{cumplimiento.Id}/miembros", Admin(norte), new MiembrosAreaDto([carlos.Usuario.Id]), 200);

        var flujo = await FlujoConAsync(norte, "PROVEEDOR",
        [
            new RequisitoDelFlujoDto(TipoDocumento: "RUT", AreasQueRevisan: [compras.Id, cumplimiento.Id]),
            new RequisitoDelFlujoDto(TipoDocumento: "CAMARA_COMERCIO", AreasQueRevisan: [cumplimiento.Id])
        ]);
        flujo.Publicada!.Requisitos!.Select(r => r.TipoDocumento).ShouldBe(["RUT", "CAMARA_COMERCIO"]);
        return new Escenario(norte, compras, cumplimiento, laura, carlos, flujo);
    }

    protected async Task<Empresa> EmpresaNuevaAsync(string nombre, string prefijo)
    {
        var slug = "t" + Guid.NewGuid().ToString("N")[..10];
        var tenant = await ApiAsync<TenantCreadoDto>("POST", "/api/v1/plataforma/tenants", new Credencial(ApiFixture.ClavePlataforma),
            new CrearTenantDto(slug, "Grupo " + nombre, "co", "America/Bogota"), 201);
        var admin = tenant.ApiKeyAdministrador.Valor!;
        var datos = await ApiAsync<EmpresaDto>("POST", "/api/v1/empresas", new Credencial(admin),
            new CrearEmpresaDto(new IdentificacionDto("CO", "NIT", "800197268-4"), nombre, prefijo, null, null), 201);

        var rsa = RSA.Create(2048);
        var sistema = await ApiAsync<SistemaIntegradoDto>("POST", "/api/v1/sistemas", new Credencial(admin),
            new CrearSistemaIntegradoDto("SRM", "SRM del cliente", rsa.ExportSubjectPublicKeyInfoPem()), 201);
        var llave = await ApiAsync<ApiKeyDto>("POST", "/api/v1/api-keys", new Credencial(admin),
            new CrearApiKeyDto("Integración SRM", ScopesDeSistema, null, null, SistemaId: sistema.Id), 201);

        await ApiAsync<TextoLegalDto>("PUT", $"/api/v1/empresas/{datos.Id}/textos-legales/autorizacion", new Credencial(admin),
            new PublicarTextoLegalDto($"Autorizo a {nombre}"), 200);
        await ApiAsync<TextoLegalDto>("PUT", $"/api/v1/empresas/{datos.Id}/textos-legales/terminos", new Credencial(admin),
            new PublicarTextoLegalDto($"Términos de {nombre}"), 200);
        await ExigirCuentaDelProveedorAsync(admin, false);
        return new Empresa(admin, datos, llave.Valor!, rsa);
    }

    // ---------- importador del Portal (lo usan la importación y el acceso aislado) ----------

    protected const string RutaImportacion = "/api/v1/plataforma/importacion/portal";

    /// <summary>
    /// <c>CorreoJ</c> es el correo que el Portal tiene del jurídico: propio de cada fixture, para que los avisos que le lleguen no se crucen con los de otra prueba.
    /// Los catálogos del JSON se importan a los catálogos de plataforma, que son globales (los comparte toda la clase y el orden de las pruebas no está fijado): cada fila
    /// del JSON repite la de la semilla de desarrollo (importarla no cambia nada) o tiene un código propio, como las especialidades «(Portal)».
    /// </summary>
    protected sealed record FixturePortal(int TeridJ, int TeridN, int TeridE, string NitJ, string CcN, string NitE, string CorreoJ = "compras@aceros.co")
    {
        public string Json(string telefono = "6015551234", string direccion = "Calle 45 # 12-08") =>
            File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Fixtures", "portal-terceros.json"))
                .Replace("{{TERID_J}}", TeridJ.ToString(System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal)
                .Replace("{{TERID_N}}", TeridN.ToString(System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal)
                .Replace("{{TERID_E}}", TeridE.ToString(System.Globalization.CultureInfo.InvariantCulture), StringComparison.Ordinal)
                .Replace("{{NIT_J}}", NitJ, StringComparison.Ordinal)
                .Replace("{{CC_N}}", CcN, StringComparison.Ordinal)
                .Replace("{{NIT_E}}", NitE, StringComparison.Ordinal)
                .Replace("compras@aceros.co", CorreoJ, StringComparison.Ordinal)
                .Replace("{{TELEFONO_J}}", telefono, StringComparison.Ordinal)
                .Replace("{{DIRECCION_J}}", direccion, StringComparison.Ordinal);
    }

    protected static FixturePortal NuevoFixturePortal()
    {
        var baseId = Random.Shared.Next(1_000_000, 9_000_000);
        // El Portal trae DV 0 para el jurídico: se elige un NIT cuyo DV real no sea 0, así siempre hay DV que recalcular.
        var nitJ = Nit();
        while (Validalo.Dominio.Identificaciones.DigitoVerificacion.NitColombia(nitJ) == "0")
            nitJ = Nit();
        return new FixturePortal(baseId, baseId + 1, baseId + 2, nitJ, Random.Shared.Next(10_000_000, 99_999_999).ToString(System.Globalization.CultureInfo.InvariantCulture),
            Nit(), CorreoNuevo());
    }

    /// <summary>Encola una corrida con el JSON del Fixture y espera (hasta 60 s) a que termine.</summary>
    protected async Task<CorridaImportacionDto> ImportarPortalAsync(string json, bool dryRun, IReadOnlyList<UnidadEmpresaDto>? unidades = null)
    {
        var plataforma = new Credencial(ApiFixture.ClavePlataforma);
        var encolada = await ApiAsync<CorridaImportacionDto>("POST", RutaImportacion, plataforma,
            new ImportarTercerosDto(dryRun, "Archivo", JsonDocument.Parse(json).RootElement.Clone(), unidades, TamanoLote: 2), 202);
        encolada.Estado.ShouldBeOneOf("Encolada", "EnCurso", "Completada");
        var limite = DateTime.UtcNow.AddSeconds(60);
        while (true)
        {
            var corrida = await ApiAsync<CorridaImportacionDto>("GET", $"{RutaImportacion}/{encolada.Id}", plataforma, null, 200);
            if (corrida.Estado is "Completada" or "Fallida")
            {
                corrida.Error.ShouldBeNull();
                corrida.Estado.ShouldBe("Completada");
                return corrida;
            }

            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"La corrida {encolada.Id} no terminó (está {corrida.Estado}).");
            await Task.Delay(200);
        }
    }

    /// <summary>
    /// El tipo PROVEEDOR nace exigiendo cuenta designada: con ella, el expediente espera en revisión hasta que la empresa apruebe la cuenta (CB-4).
    /// Las pruebas que aprueban expedientes sin hablar de cuentas la quitan; las de la cuenta la vuelven a poner.
    /// </summary>
    protected async Task ExigirCuentaDelProveedorAsync(string admin, bool exige)
    {
        var tipos = await ApiAsync<List<TipoVinculoDto>>("GET", "/api/v1/tipos-vinculo", new Credencial(admin), null, 200);
        var proveedor = tipos.Single(t => t.Codigo == "PROVEEDOR");
        await ApiAsync<TipoVinculoDto>("PUT", $"/api/v1/tipos-vinculo/{proveedor.Id}", new Credencial(admin),
            new CrearTipoVinculoDto(proveedor.Codigo, proveedor.Nombre, proveedor.AtributosPermitidos, exige, proveedor.ExigeOtpEnEnlace), 200);
    }

    /// <summary>Crea y publica (queda por defecto) un flujo con todas las áreas activas en paralelo y los requisitos dados.</summary>
    protected async Task<FlujoDto> FlujoConAsync(Empresa empresa, string tipoVinculo, IReadOnlyList<RequisitoDelFlujoDto> requisitos)
    {
        var areas = await ApiAsync<List<AreaDto>>("GET", "/api/v1/areas", Admin(empresa), null, 200);
        if (areas.Count == 0)
            await ApiAsync<AreaDto>("POST", "/api/v1/areas", Admin(empresa), new CrearAreaDto("REVISION", "Revisión"), 201);

        var flujo = await ApiAsync<FlujoDto>("POST", "/api/v1/flujos", Admin(empresa),
            new CrearFlujoDto("HAB_" + tipoVinculo, "Habilitación " + tipoVinculo, tipoVinculo, Requisitos: requisitos), 201);
        flujo.Borrador!.Requisitos!.Count.ShouldBe(requisitos.Count);
        return await ApiAsync<FlujoDto>("POST", $"/api/v1/flujos/{flujo.Id}/publicar", Admin(empresa), new { }, 200);
    }

    protected Task<VinculoDto> CrearVinculoAsync(Empresa empresa, string tipo, string correo, string? nit = null)
    {
        nit ??= Nit();
        return ApiAsync<VinculoDto>("POST", "/api/v1/vinculos", Admin(empresa), new CrearVinculoDto(
            TerceroId: null,
            Tercero: new CrearTerceroDto(new IdentificacionDto("CO", "NIT", nit), "Juridica", "Tercero " + nit, null,
                [new ContactoDto("Ana Gómez", correo, null, "Comercial")]),
            TipoVinculo: tipo,
            Atributos: null,
            CorreoInvitacion: correo,
            ReferenciaExterna: null), 201);
    }

    /// <summary>
    /// Canjea el enlace del correo de invitación (de la empresa indicada, si hay varias) y devuelve la sesión del tercero;
    /// si el tipo de vínculo exige OTP (PROVEEDOR), lo verifica con el código que llega al mismo correo.
    /// </summary>
    protected async Task<SesionTerceroDto> SesionAsync(string correo, string? empresa = null)
    {
        var invitacion = await Fixture.Correos.EsperarAsync(correo, m => empresa is null || m.Asunto.Contains(empresa));
        var token = RegexToken().Match(invitacion.Texto).Groups[1].Value;
        var canje = await PublicoAsync($"/public/v1/enlaces/{token}/canjear", null);
        if (canje.Context.Response.StatusCode == StatusCodes.Status200OK)
            return (await canje.ReadAsJsonAsync<SesionTerceroDto>())!;

        canje.Context.Response.StatusCode.ShouldBe(StatusCodes.Status202Accepted);
        var codigo = RegexCodigo().Match((await Fixture.Correos.EsperarAsync(correo, m => m.Asunto.Contains("código"))).Texto).Groups[1].Value;
        var verificado = await PublicoAsync($"/public/v1/enlaces/{token}/otp", new VerificarOtpDto(codigo));
        verificado.Context.Response.StatusCode.ShouldBe(StatusCodes.Status200OK);
        return (await verificado.ReadAsJsonAsync<SesionTerceroDto>())!;
    }

    protected Task<IScenarioResult> PublicoAsync(string url, object? cuerpo) =>
        Host.Scenario(s =>
        {
            Preparar(s, "POST", url, cuerpo);
            IpAleatoria(s);
            s.IgnoreStatusCode();
        });

    protected async Task<InvitacionAceptadaDto> AceptarAsync(SesionTerceroDto sesion, Guid vinculoId)
    {
        var invitacion = await TerceroAsync<InvitacionPublicaDto>("GET", $"/public/v1/invitaciones/{vinculoId}", sesion.AccessToken, null, 200);
        return await TerceroAsync<InvitacionAceptadaDto>("POST", $"/public/v1/invitaciones/{vinculoId}/aceptar", sesion.AccessToken,
            new AceptarInvitacionDto([.. invitacion.TextosPorAceptar.Select(t => new ConsentimientoDto(t.Tipo, t.TextoVersion, true))]), 200);
    }

    /// <summary>Paso 1, PUT directo a MinIO con la URL prefirmada y paso 2 (documento global del canónico).</summary>
    protected Task<ConfirmacionCargaDto> SubirAsync(SesionTerceroDto sesion, string canonico, byte[] contenido) =>
        SubirAsync(sesion, new IniciarCargaDto(canonico.ToLowerInvariant() + ".pdf", contenido.Length, "application/pdf", TipoCanonico: canonico), contenido);

    /// <summary>La certificación bancaria <b>de una cuenta</b> (CB-1): el documento propio de la cuenta, con sus versiones (paso 1 con <c>cuentaBancariaId</c>, PUT y paso 2).</summary>
    protected Task<ConfirmacionCargaDto> SubirCertificacionAsync(SesionTerceroDto sesion, Guid cuentaId, byte[] contenido, Guid? vinculoId = null) =>
        SubirAsync(sesion, new IniciarCargaDto("certificacion-bancaria.pdf", contenido.Length, "application/pdf", VinculoId: vinculoId, CuentaBancariaId: cuentaId), contenido);

    /// <summary>Los dos pasos de la carga con el cuerpo del paso 1 que se indique.</summary>
    protected async Task<ConfirmacionCargaDto> SubirAsync(SesionTerceroDto sesion, IniciarCargaDto inicio, byte[] contenido, string? token = null)
    {
        var carga = await TerceroAsync<CargaPrefirmadaDto>("POST", "/public/v1/boveda/documentos", token ?? sesion.AccessToken, inicio, 201);
        using var put = new HttpRequestMessage(HttpMethod.Put, carga.Carga!.Url) { Content = new ByteArrayContent(contenido) };
        put.Content.Headers.ContentType = MediaTypeHeaderValue.Parse(carga.Carga.Cabeceras["Content-Type"]);
        using var respuesta = await Http.SendAsync(put);
        respuesta.StatusCode.ShouldBe(HttpStatusCode.OK);
        return await TerceroAsync<ConfirmacionCargaDto>("POST",
            $"/public/v1/boveda/documentos/{carga.DocumentoId}/versiones/{carga.Version}/confirmar", token ?? sesion.AccessToken, null, 200);
    }

    /// <summary>La adjunción de versiones llega por el outbox: espera (hasta 20 s) a que el expediente cumpla la condición.</summary>
    protected async Task<ExpedienteDto> EsperarAsync(Empresa empresa, Guid expedienteId, Func<ExpedienteDto, bool> condicion)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            var expediente = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Admin(empresa), null, 200);
            if (condicion(expediente))
                return expediente;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"El expediente {expedienteId} no llegó al estado esperado (está {expediente.Estado}).");
            await Task.Delay(100);
        }
    }

    protected async Task InvocarAsync(SincronizarRequisitosDelVinculo mensaje)
    {
        using var alcance = Host.Services.CreateScope();
        await alcance.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(mensaje);
    }

    protected async Task<IReadOnlyList<object>> EventosAsync(Guid tenantId, Guid streamId)
    {
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession(tenantId.ToString("N"));
        return [.. (await consulta.Events.FetchStreamAsync(streamId)).Select(x => x.Data)];
    }

    protected Task<T> VeredictoAsync<T>(Escenario e, Guid expedienteId, Guid requisitoId, AreaDto area, Persona persona, VeredictoDto dto) =>
        ApiAsync<T>("POST", $"/api/v1/expedientes/{expedienteId}/requisitos/{requisitoId}/areas/{area.Id}/veredicto", Delegado(e.Norte, persona), dto, 200);

    protected Task<IScenarioResult> VeredictoAsync(Escenario e, Guid expedienteId, Guid requisitoId, AreaDto area, Persona persona, VeredictoDto dto,
        int esperado) =>
        ApiAsync("POST", $"/api/v1/expedientes/{expedienteId}/requisitos/{requisitoId}/areas/{area.Id}/veredicto", Delegado(e.Norte, persona), dto,
            esperado);

    protected Task<T> AreaAsync<T>(Escenario e, Guid expedienteId, AreaDto area, Persona persona, VeredictoDto dto) =>
        ApiAsync<T>("POST", $"/api/v1/expedientes/{expedienteId}/areas/{area.Id}/veredicto", Delegado(e.Norte, persona), dto, 200);

    protected Task<IScenarioResult> AreaAsync(Escenario e, Guid expedienteId, AreaDto area, Persona persona, VeredictoDto dto, int esperado) =>
        ApiAsync("POST", $"/api/v1/expedientes/{expedienteId}/areas/{area.Id}/veredicto", Delegado(e.Norte, persona), dto, esperado);

    protected static RequisitoExpedienteDto Requisito(ExpedienteDto expediente, string codigo) =>
        expediente.Requisitos!.Single(r => r.TipoDocumento.Codigo == codigo);

    protected static AreaExpedienteDto Area(ExpedienteDto expediente, string codigo) =>
        expediente.Etapas.SelectMany(x => x.Areas).Single(a => a.Codigo == codigo);

    protected static Credencial Admin(Empresa empresa) => new(empresa.Admin, empresa.Datos.Id);

    /// <summary>La persona actúa desde el SRM con una aserción firmada por la clave privada del sistema (ADR-0011).</summary>
    protected static Credencial Delegado(Empresa empresa, Persona p)
    {
        var ahora = DateTime.UtcNow;
        var asercion = new JsonWebTokenHandler().CreateToken(new SecurityTokenDescriptor
        {
            Issuer = "SRM",
            Audience = "validalo",
            // jti de un solo uso (SE-4): cada petición lleva su propia aserción.
            Subject = new ClaimsIdentity([new Claim("sub", p.Sub), new Claim("name", p.Usuario.Nombre), new Claim("email", p.Usuario.Correo),
                new Claim("jti", Guid.NewGuid().ToString())]),
            IssuedAt = ahora.AddSeconds(-5),
            NotBefore = ahora.AddSeconds(-5),
            Expires = ahora.AddMinutes(2),
            SigningCredentials = new SigningCredentials(new RsaSecurityKey(empresa.ClaveSrm), SecurityAlgorithms.RsaSha256)
        });
        return new Credencial(empresa.LlaveSrm, empresa.Datos.Id, asercion);
    }

    protected static string CorreoNuevo() => $"t{Guid.NewGuid():N}@prueba.co";

    protected static string Nit() => "9" + Random.Shared.Next(10_000_000, 99_999_999).ToString(System.Globalization.CultureInfo.InvariantCulture);

    /// <summary>PDF mínimo válido de una página; el texto lo hace único (otro hash).</summary>
    protected static byte[] Pdf(string texto) => Encoding.Latin1.GetBytes(new StringBuilder()
        .Append("%PDF-1.4\n")
        .Append(System.Globalization.CultureInfo.InvariantCulture, $"% {texto} {Guid.NewGuid():N}\n")
        .Append("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n")
        .Append("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n")
        .Append("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\n")
        .Append("trailer\n<< /Root 1 0 R >>\n%%EOF\n")
        .ToString());

    protected static string Sha256(byte[] contenido) => Convert.ToHexStringLower(SHA256.HashData(contenido));

    protected static async Task<string?> CodigoAsync(IScenarioResult resultado) =>
        (await resultado.ReadAsJsonAsync<JsonElement>()).GetProperty("codigo").GetString();

    protected async Task<T> ApiAsync<T>(string metodo, string url, Credencial credencial, object? cuerpo, int esperado) =>
        (await (await ApiAsync(metodo, url, credencial, cuerpo, esperado)).ReadAsJsonAsync<T>())!;

    protected Task<IScenarioResult> ApiAsync(string metodo, string url, Credencial credencial, object? cuerpo, int esperado) =>
        Host.Scenario(s =>
        {
            Preparar(s, metodo, url, cuerpo);
            s.WithRequestHeader("X-Api-Key", credencial.ApiKey);
            if (credencial.Empresa is not null)
                s.WithRequestHeader("X-Empresa", credencial.Empresa.Value.ToString());
            if (credencial.Delegado is not null)
                s.WithRequestHeader("X-Usuario-Delegado", credencial.Delegado);
            if (metodo == "POST")
                s.WithRequestHeader("Idempotency-Key", Guid.NewGuid().ToString());
            s.StatusCodeShouldBe(esperado);
        });

    protected Task<IScenarioResult> TerceroAsync(string metodo, string url, string token, object? cuerpo, int esperado) =>
        Host.Scenario(s =>
        {
            Preparar(s, metodo, url, cuerpo);
            s.WithRequestHeader("Authorization", "Bearer " + token);
            IpAleatoria(s);
            s.StatusCodeShouldBe(esperado);
        });

    protected async Task<T> TerceroAsync<T>(string metodo, string url, string token, object? cuerpo, int esperado) =>
        (await (await TerceroAsync(metodo, url, token, cuerpo, esperado)).ReadAsJsonAsync<T>())!;

    protected static void IpAleatoria(Scenario s) =>
        s.ConfigureHttpContext(c => c.Connection.RemoteIpAddress =
            new IPAddress([10, (byte)Random.Shared.Next(256), (byte)Random.Shared.Next(256), (byte)Random.Shared.Next(1, 255)]));

    protected static void Preparar(Scenario s, string metodo, string url, object? cuerpo)
    {
        switch (metodo)
        {
            case "GET":
                s.Get.Url(url);
                break;
            case "PUT":
                s.Put.Json(cuerpo ?? new { }).ToUrl(url);
                break;
            case "DELETE":
                s.Delete.Url(url);
                break;
            case "POST" when cuerpo is null:
                s.Post.Url(url);
                break;
            default:
                s.Post.Json(cuerpo!).ToUrl(url);
                break;
        }
    }

    // ---------- F5: cruce sección ↔ documento, «usar como soporte» y actualización desde el documento ----------

    /// <summary>RUT con marcas que lee el analizador falso (como el simulado de la API): NIT del tercero y la razón social de <see cref="GeneralCompleta"/>.</summary>
    protected static byte[] RutCon(string nit, string direccion, string razonSocial = "ACEROS DEL NORTE SAS") =>
        Pdf($"RUT [[nit={nit}]][[razonSocial={razonSocial}]][[direccion={direccion}]][[codigoMunicipio=11001]][[actividadEconomicaPrincipal=4663]]");

    /// <summary>Flujo CLIENTE de Norte: el RUT lo revisa Compras y la general, Cumplimiento.</summary>
    protected Task<FlujoDto> FlujoRutYGeneralAsync(Escenario e) =>
        FlujoConAsync(e.Norte, "CLIENTE",
        [
            new RequisitoDelFlujoDto(TipoDocumento: "RUT", AreasQueRevisan: [e.Compras.Id]),
            new RequisitoDelFlujoDto(Seccion: "FICHA_GENERAL", AreasQueRevisan: [e.Cumplimiento.Id])
        ]);

    /// <summary>Otra persona de Norte con el rol de oficial de cumplimiento (aprueba cuentas).</summary>
    protected async Task<Persona> OficialAsync(Escenario e, string nombre)
    {
        var correo = $"{nombre.Split(' ')[0].ToLowerInvariant()}.{Guid.NewGuid():N}@constructora.co";
        var usuario = await ApiAsync<UsuarioDto>("POST", "/api/v1/usuarios", new Credencial(e.Norte.Admin),
            new CrearUsuarioDto(nombre, correo, null, [new RolAsignadoDto("OficialCumplimiento", e.Norte.Datos.Id)], null), 201);
        return new Persona(usuario, "srm-" + Guid.NewGuid().ToString("N")[..8]);
    }

    // ---------- declaración jurada PEP en la ficha (HU 49093, DP-1…DP-14) ----------

    /// <summary>Un PNG RGB de 8 bits de 60×20 con un trazo oscuro (el CRC no se comprueba): lo que el navegador envía, en pequeño.</summary>
    protected static string FirmaPngBase64()
    {
        const int ancho = 60, alto = 20;
        var crudo = new List<byte>();
        for (var y = 0; y < alto; y++)
        {
            crudo.Add(0);
            for (var x = 0; x < ancho; x++)
                crudo.AddRange(y is >= 8 and <= 11 && x is >= 5 and <= 50 ? [20, 20, 90] : [255, 255, 255]);
        }

        using var comprimido = new MemoryStream();
        using (var zlib = new ZLibStream(comprimido, CompressionLevel.Optimal, leaveOpen: true))
            zlib.Write([.. crudo]);

        using var png = new MemoryStream();
        png.Write([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
        void Trozo(string tipo, byte[] datos)
        {
            png.Write([(byte)(datos.Length >> 24), (byte)(datos.Length >> 16), (byte)(datos.Length >> 8), (byte)datos.Length]);
            png.Write(Encoding.ASCII.GetBytes(tipo));
            png.Write(datos);
            png.Write([0, 0, 0, 0]);
        }

        Trozo("IHDR", [0, 0, 0, ancho, 0, 0, 0, alto, 8, 2, 0, 0, 0]);
        Trozo("IDAT", comprimido.ToArray());
        Trozo("IEND", []);
        return Convert.ToBase64String(png.ToArray());
    }

    protected static byte[] Leer(ZipArchiveEntry entrada)
    {
        using var flujo = entrada.Open();
        using var memoria = new MemoryStream();
        flujo.CopyTo(memoria);
        return memoria.ToArray();
    }

    // ---------- ficha maestra del tercero (F1: FM-16…FM-23) ----------

    protected const string RutaFicha = "/public/v1/ficha";

    protected static JsonElement Datos(string json) => JsonDocument.Parse(json).RootElement.Clone();

    protected const string GeneralCompleta = """
        { "razon_social": "Aceros del Norte S.A.S.", "correo": "compras@aceros.co", "telefono": "+57 601 555 1234", "pais": "CO",
          "ciudad": "11001", "direccion": "Calle 45 # 12-08", "ciiu_principal": "4663" }
        """;

    protected async Task<SeccionGuardadaDto> GuardarSeccionAsync(SesionTerceroDto sesion, string seccion, string datos, params SoporteSeccionDto[] soportes) =>
        (await (await PutFichaAsync($"{RutaFicha}/{seccion}", sesion, new GuardarSeccionDto(Datos(datos), soportes), 200)).ReadAsJsonAsync<SeccionGuardadaDto>())!;

    /// <summary>PUT del tercero con la consulta (<c>?periodo=</c>) aparte: Alba no la toma de la URL en un PUT con cuerpo.</summary>
    protected Task<IScenarioResult> PutFichaAsync(string url, SesionTerceroDto sesion, GuardarSeccionDto cuerpo, int esperado) =>
        Host.Scenario(s =>
        {
            var partes = url.Split('?', 2);
            var envio = s.Put.Json(cuerpo).ToUrl(partes[0]);
            foreach (var par in partes.Length > 1 ? partes[1].Split('&') : [])
            {
                var (clave, valor) = (par.Split('=')[0], par.Split('=')[1]);
                envio.QueryString(clave, valor);
            }

            s.WithRequestHeader("Authorization", "Bearer " + sesion.AccessToken);
            IpAleatoria(s);
            s.StatusCodeShouldBe(esperado);
        });

    protected async Task<(string? Codigo, string? Campo)> ErrorDeSeccionAsync(SesionTerceroDto sesion, string ruta, string datos,
        params SoporteSeccionDto[] soportes)
    {
        var json = await (await PutFichaAsync(ruta, sesion, new GuardarSeccionDto(Datos(datos), soportes), 422)).ReadAsJsonAsync<JsonElement>();
        return (json.GetProperty("codigo").GetString(), json.TryGetProperty("campo", out var campo) ? campo.GetString() : null);
    }

    protected async Task<EstadoDeFicha?> EstadoGuardadoAsync(Guid terceroId)
    {
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession("boveda");
        return await consulta.LoadAsync<EstadoDeFicha>(terceroId);
    }

    // ---------- validación por empresa de la ficha maestra (F2: FM-25…) ----------

    protected const string TributariaCompleta =
        """{ "responsabilidades": ["5", "7", "48", "52"], "responsable_ica": true, "ica": [ { "municipio": "11001", "ciiu": "4663" } ] }""";

    protected static AceptacionDeSeccionDto Aceptacion(FichaTerceroDto ficha, string seccion) =>
        ficha.Secciones.ShouldNotBeNull().Single(s => s.Seccion == seccion).Aceptaciones.ShouldNotBeNull().ShouldHaveSingleItem();

    /// <summary>Expediente abierto del vínculo en la empresa (la apertura de una actualización llega por el outbox).</summary>
    protected async Task<Guid> AbiertoEnAsync(Empresa empresa, Guid vinculoId, Guid? distintoDe = null)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            if ((await ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{vinculoId}", Admin(empresa), null, 200)).ExpedienteAbiertoId is { } id && id != distintoDe)
                return id;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException("No se abrió el expediente.");
            await Task.Delay(200);
        }
    }

    protected static Credencial Plataforma() => new(ApiFixture.ClavePlataforma);

    /// <summary>Proveedor aprobado por Compras y Cumplimiento (RUT y Cámara referenciados por la aceptación y el certificado), con su correo.</summary>
    protected async Task<(Escenario E, VinculoDto Vinculo, SesionTerceroDto Sesion, string Correo)> TerceroConAprobacionAsync()
    {
        var e = await PrepararAsync();
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "PROVEEDOR", correo);
        var sesion = await SesionAsync(correo);
        await SubirAsync(sesion, "RUT", Pdf("RUT habeas"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara habeas"));
        await AceptarAsync(sesion, vinculo.Id);
        var inicial = await ExpedienteAbiertoAsync(e, vinculo.Id);
        await AprobarAreasAsync(e, inicial);
        (await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{inicial}", Admin(e.Norte), null, 200)).Estado.ShouldBe("Aprobado");
        return (e, vinculo, sesion, correo);
    }

    protected Task<SolicitudHabeasDto> SolicitarAsync(SesionTerceroDto sesion, string tipo, string? alcance = null, Guid? empresa = null, string? detalle = null) =>
        TerceroAsync<SolicitudHabeasDto>("POST", "/public/v1/solicitudes-habeas", sesion.AccessToken, new CrearSolicitudHabeasDto(tipo, alcance, empresa, detalle), 201);

    protected DateOnly Hoy() => CalculadoraDeVigencia.Fecha(Fixture.Reloj.GetUtcNow());

    /// <summary>
    /// Una Cámara de comercio expedida hoy: el tipo de Norte exige que tenga menos de 30 días (TD-10, lo que sugiere el catálogo) y la IA falsa lee la fecha de la
    /// marca; sin ella, en una prueba con IA, el documento no trae una fecha verificable (hallazgo crítico): no se aprueba solo ni sin justificación.
    /// </summary>
    protected byte[] CamaraReciente() => Pdf($"Cámara [[fechaExpedicion={Hoy():yyyy-MM-dd}]]");

    protected static ResumenSeccionImportadaDto Seccion(CorridaImportacionDto c, string seccion) => c.Resumen.Secciones.Single(s => s.Seccion == seccion);

    // ---------- Informes y exportaciones (IF-1…IF-7) ----------

    protected async Task<Descarga> DescargarAsync(string url, Credencial credencial)
    {
        using var cliente = Host.Server.CreateClient();
        using var pedido = new HttpRequestMessage(HttpMethod.Get, url);
        pedido.Headers.Add("X-Api-Key", credencial.ApiKey);
        if (credencial.Empresa is not null)
            pedido.Headers.Add("X-Empresa", credencial.Empresa.Value.ToString());
        if (credencial.Delegado is not null)
            pedido.Headers.Add("X-Usuario-Delegado", credencial.Delegado);
        using var respuesta = await cliente.SendAsync(pedido);
        return new Descarga(respuesta.StatusCode, respuesta.Content.Headers.ContentType?.MediaType,
            respuesta.Content.Headers.ContentDisposition?.FileNameStar ?? respuesta.Content.Headers.ContentDisposition?.FileName,
            await respuesta.Content.ReadAsByteArrayAsync());
    }

    protected static int Filas(string hoja) => hoja.Split("<row ").Length - 1;

    protected static (JsonElement Cabecera, JsonElement Cuerpo) LeerJwt(string token)
    {
        static JsonElement Parte(string base64Url) =>
            JsonDocument.Parse(Convert.FromBase64String(base64Url.Replace('-', '+').Replace('_', '/').PadRight((base64Url.Length + 3) / 4 * 4, '='))).RootElement.Clone();
        var partes = token.Split('.');
        return (Parte(partes[0]), Parte(partes[1]));
    }

    // ---------- integración de la ficha con el SRM (F3: FM-32…) ----------

    /// <summary>Aprueba con el administrador cada área que aún no aprobó, hasta que el expediente quede aprobado.</summary>
    protected async Task<ExpedienteDto> AprobarComoAdministradorAsync(Empresa empresa, Guid expedienteId)
    {
        var url = $"/api/v1/expedientes/{expedienteId}";
        var expediente = await ApiAsync<ExpedienteDto>("GET", url, Admin(empresa), null, 200);
        foreach (var area in expediente.Etapas.SelectMany(t => t.Areas).Select(a => a.AreaId).ToList())
        {
            expediente = await ApiAsync<ExpedienteDto>("GET", url, Admin(empresa), null, 200);
            if (expediente.Estado == "Aprobado")
                break;
            if (expediente.Etapas.SelectMany(t => t.Areas).Single(a => a.AreaId == area).Estado == "Aprobada")
                continue;
            expediente = await ApiAsync<ExpedienteDto>("POST", $"{url}/areas/{area}/aprobar-como-administrador", Admin(empresa),
                new JustificacionDto("Revisada con el área."), 200);
        }

        return expediente;
    }

    protected static ArchivoDeLoteDto Archivo(string csv) => new("proveedores.csv", Convert.ToBase64String(Encoding.UTF8.GetBytes(csv)));

    protected static async Task<byte[]> BytesAsync(Alba.IScenarioResult resultado)
    {
        var cuerpo = resultado.Context.Response.Body;
        if (cuerpo.CanSeek)
            cuerpo.Position = 0;
        using var memoria = new MemoryStream();
        await cuerpo.CopyToAsync(memoria);
        return memoria.ToArray();
    }

    protected async Task<LoteDto> EsperarLoteAsync(Empresa empresa, Guid loteId, Func<LoteDto, bool> condicion, int segundos = 30)
    {
        var limite = DateTime.UtcNow.AddSeconds(segundos);
        while (true)
        {
            var lote = await ApiAsync<LoteDto>("GET", $"/api/v1/invitaciones/lotes/{loteId}", Admin(empresa), null, 200);
            if (condicion(lote))
                return lote;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"El lote {loteId} no llegó al estado esperado (está {lote.Estado}, {lote.Totales}).");
            await Task.Delay(150);
        }
    }

    protected async Task<List<FilaLoteDto>> FilasAsync(Empresa empresa, Guid loteId, string? estado = null)
    {
        var filas = new List<FilaLoteDto>();
        string? cursor = null;
        do
        {
            var url = $"/api/v1/invitaciones/lotes/{loteId}/filas?limite=7" + (estado is null ? "" : $"&estado={estado}") + (cursor is null ? "" : $"&cursor={cursor}");
            var pagina = await ApiAsync<PaginaDto<FilaLoteDto>>("GET", url, Admin(empresa), null, 200);
            filas.AddRange(pagina.Datos);
            cursor = pagina.SiguienteCursor;
        } while (cursor is not null);

        return filas;
    }

    protected const string RutaCampanaTercero = "/public/v1/notificaciones";

    protected sealed record Observado(Escenario E, VinculoDto Vinculo, SesionTerceroDto Sesion, Guid Expediente, string Correo, RequisitoExpedienteDto Camara);

    /// <summary>
    /// Un proveedor de Norte con RUT y Cámara subidos y el expediente en revisión; con <paramref name="observar"/>, Cumplimiento
    /// observa la Cámara y el expediente queda devuelto al tercero.
    /// </summary>
    protected async Task<Observado> ProveedorObservadoAsync(Escenario? escenario = null, string? nit = null, bool observar = true)
    {
        var e = escenario ?? await PrepararAsync();
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "PROVEEDOR", correo, nit);
        var sesion = await SesionAsync(correo);
        await SubirAsync(sesion, "RUT", Pdf("RUT"));
        await SubirAsync(sesion, "CAMARA_COMERCIO", Pdf("Cámara"));
        await AceptarAsync(sesion, vinculo.Id);
        var expedienteId = await ExpedienteAbiertoAsync(e, vinculo.Id);
        var enRevision = await EsperarAsync(e.Norte, expedienteId, x => x.Estado == "EnRevision");
        var camara = Requisito(enRevision, "CAMARA_COMERCIO");
        if (observar)
            (await VeredictoAsync<ExpedienteDto>(e, expedienteId, camara.Id, e.Cumplimiento, e.Carlos,
                new VeredictoDto("Observado", ["ilegible"], "La cámara está cortada.", SobreVersion: 1))).Estado.ShouldBe("Observado");
        return new Observado(e, vinculo, sesion, expedienteId, correo, camara);
    }

    protected async Task<BandejaNotificacionesTerceroDto> EsperarBandejaAsync(SesionTerceroDto sesion, Func<BandejaNotificacionesTerceroDto, bool> condicion,
        string consulta = "")
    {
        var limite = DateTime.UtcNow.AddSeconds(30);
        while (true)
        {
            var bandeja = await TerceroAsync<BandejaNotificacionesTerceroDto>("GET", RutaCampanaTercero + consulta, sesion.AccessToken, null, 200);
            if (condicion(bandeja))
                return bandeja;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"La campana del tercero no recibió lo esperado (tiene: {string.Join(", ", bandeja.Datos.Select(n => n.Tipo))}).");
            await Task.Delay(200);
        }
    }

    protected async Task<BandejaNotificacionesDto> EsperarCampanaDeAsync(Escenario e, Persona persona, Func<BandejaNotificacionesDto, bool> condicion)
    {
        var limite = DateTime.UtcNow.AddSeconds(30);
        while (true)
        {
            var bandeja = await ApiAsync<BandejaNotificacionesDto>("GET", "/api/v1/notificaciones", Delegado(e.Norte, persona), null, 200);
            if (condicion(bandeja))
                return bandeja;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"La campana de {persona.Usuario.Nombre} no recibió lo esperado.");
            await Task.Delay(200);
        }
    }

    protected async Task<Persona> PersonaConRolAsync(Empresa empresa, string nombre, string rol)
    {
        var correo = $"{nombre.Split(' ')[0].ToLowerInvariant()}.{Guid.NewGuid():N}@constructora.co";
        var usuario = await ApiAsync<UsuarioDto>("POST", "/api/v1/usuarios", new Credencial(empresa.Admin),
            new CrearUsuarioDto(nombre, correo, null, [new RolAsignadoDto(rol, empresa.Datos.Id)], null), 201);
        return new Persona(usuario, "srm-" + Guid.NewGuid().ToString("N")[..8]);
    }

    protected const string UrlRevision = "/api/v1/configuracion/revision-automatica";

    protected Task<RevisionAutomaticaConfigDto> ConfigRevisionAsync(Empresa empresa, ActualizarRevisionAutomaticaDto dto) =>
        ApiAsync<RevisionAutomaticaConfigDto>("PUT", UrlRevision, Admin(empresa), dto, 200);

    protected static RevisionAutomaticaDto? RevisionDe(ExpedienteDto expediente, string codigoDelRequisito, string area) =>
        Requisito(expediente, codigoDelRequisito).RevisionesAutomaticas?.SingleOrDefault(r => r.AreaCodigo == area);

    /// <summary>Plan de IA con llave para la empresa; <paramref name="marcador"/> <c>baja</c> da confianza baja sin escalar (mismo modelo en ambos).</summary>
    protected Task<PlanIaEmpresaDto> PlanParaRevisionAsync(Empresa empresa, string marcador = "ok") =>
        PlanIaAsync(empresa, marcador == "baja"
            ? new ActualizarPlanIaEmpresaDto(50, false, ApiKeyOpenAi: LlaveIa("baja"), ModeloPorDefecto: "gpt-6-luna", ModeloEscalamiento: "gpt-6-luna")
            : new ActualizarPlanIaEmpresaDto(50, false, ApiKeyOpenAi: LlaveIa()));

    /// <summary>Tercero (jurídica) invitado con el flujo vigente del tipo que sube sus documentos; devuelve el vínculo, su sesión y el expediente abierto.</summary>
    protected async Task<(VinculoDto Vinculo, SesionTerceroDto Sesion, Guid ExpedienteId)> TerceroAceptaAsync(Empresa empresa, string tipoVinculo, string? nit = null)
    {
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(empresa, tipoVinculo, correo, nit);
        var sesion = await SesionAsync(correo, empresa.Datos.Nombre);
        await AceptarAsync(sesion, vinculo.Id);
        return (vinculo, sesion, await AbiertoEnAsync(empresa, vinculo.Id));
    }

    protected async Task<IReadOnlyList<NotificacionDto>> CampanaAsync(Escenario e, Persona persona) =>
        (await ApiAsync<BandejaNotificacionesDto>("GET", "/api/v1/notificaciones", Delegado(e.Norte, persona), null, 200)).Datos;

    protected static async Task EsperarAsync(Func<Task<bool>> condicion, int segundos = 20)
    {
        var limite = DateTime.UtcNow.AddSeconds(segundos);
        while (!await condicion())
        {
            if (DateTime.UtcNow > limite)
                throw new TimeoutException("La condición no se cumplió a tiempo.");
            await Task.Delay(200);
        }
    }

    /// <summary>Lleva el reloj de las pruebas a <paramref name="momento"/> (las pruebas lo devuelven a cero al terminar).</summary>
    protected void IrA(DateTimeOffset momento) => Fixture.Reloj.Desfase = momento - DateTimeOffset.UtcNow;

    protected Task<VinculoDto> VinculoAsync(Empresa empresa, Guid id) => ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{id}", Admin(empresa), null, 200);

    protected async Task<CertificadoDto> CertificadoActualAsync(Empresa empresa, Guid vinculoId) =>
        (await ApiAsync<CertificadoDelVinculoDto>("GET", $"/api/v1/vinculos/{vinculoId}/certificado", Admin(empresa), null, 200)).Actual!;

    /// <summary>Flujo CLIENTE publicado con los requisitos y la vigencia del vínculo indicados.</summary>
    protected async Task<FlujoDto> FlujoConVigenciaAsync(Empresa empresa, IReadOnlyList<RequisitoDelFlujoDto> requisitos, VigenciaVinculoDto? vigencia)
    {
        var flujo = await ApiAsync<FlujoDto>("POST", "/api/v1/flujos", Admin(empresa),
            new CrearFlujoDto("HAB_CLIENTE", "Habilitación CLIENTE", "CLIENTE", Requisitos: requisitos, VigenciaVinculo: vigencia), 201);
        return await ApiAsync<FlujoDto>("POST", $"/api/v1/flujos/{flujo.Id}/publicar", Admin(empresa), new { }, 200);
    }

    protected sealed record ClienteAprobado(VinculoDto Vinculo, SesionTerceroDto Sesion, string Correo, ConfirmacionCargaDto Rut);

    /// <summary>
    /// Cliente de Norte con su ficha general y el RUT aprobados (Compras decide la general y el RUT; Cumplimiento, el RUT) con el
    /// flujo CLIENTE que ya publicó la prueba.
    /// </summary>
    protected async Task<ClienteAprobado> ClienteAprobadoAsync(Escenario e)
    {
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await GuardarSeccionAsync(sesion, "FICHA_GENERAL", GeneralCompleta);
        await AceptarAsync(sesion, vinculo.Id);
        var rut = await SubirAsync(sesion, "RUT", Pdf("RUT v1"));

        var inicial = await AbiertoEnAsync(e.Norte, vinculo.Id);
        var revision = await EsperarAsync(e.Norte, inicial, x => x.Estado == "EnRevision" && x.Requisitos!.All(r => r.VersionActual is not null));
        await AreaAsync<ExpedienteDto>(e, inicial, e.Compras, e.Laura, new VeredictoDto("Aprobado", Versiones: new Dictionary<Guid, int>
        {
            [Requisito(revision, "RUT").Id] = 1, [Requisito(revision, "FICHA_GENERAL").Id] = 1
        }));
        (await AreaAsync<ExpedienteDto>(e, inicial, e.Cumplimiento, e.Carlos,
            new VeredictoDto("Aprobado", Versiones: new Dictionary<Guid, int> { [Requisito(revision, "RUT").Id] = 1 }))).Estado.ShouldBe("Aprobado");
        return new ClienteAprobado(vinculo, sesion, correo, rut);
    }

    protected RequisitoDelFlujoDto[] RutYGeneral(Escenario e, int? vigenciaGeneral = null, int? revalidacionGeneral = null) =>
    [
        new RequisitoDelFlujoDto(TipoDocumento: "RUT", AreasQueRevisan: [e.Compras.Id, e.Cumplimiento.Id]),
        new RequisitoDelFlujoDto(Seccion: "FICHA_GENERAL", AreasQueRevisan: [e.Compras.Id], VigenciaDias: vigenciaGeneral, DiasRevalidacion: revalidacionGeneral)
    ];

    protected static DateOnly Hoy(DateTimeOffset? ahora = null) => CalculadoraDeVigencia.Fecha(ahora ?? DateTimeOffset.UtcNow);

    // ---------- vínculo «En revisión» por una actualización (VR-1…VR-6) ----------

    protected Task<VinculoDto> VinculoDeAsync(Empresa empresa, Guid vinculoId) =>
        ApiAsync<VinculoDto>("GET", $"/api/v1/vinculos/{vinculoId}", Admin(empresa), null, 200);

    /// <summary>
    /// La actualización del vínculo en cualquier estado (con la revisión automática puede aprobarse al segundo de abrirse, antes de que
    /// una consulta del vínculo alcance a verla abierta).
    /// </summary>
    protected async Task<Guid> ActualizacionDeAsync(Empresa empresa, Guid vinculoId)
    {
        var limite = DateTime.UtcNow.AddSeconds(30);
        while (true)
        {
            var lista = await ApiAsync<PaginaDto<ExpedienteDto>>("GET", $"/api/v1/expedientes?vinculoId={vinculoId}", Admin(empresa), null, 200);
            if (lista.Datos.FirstOrDefault(x => x.Tipo == "Actualizacion") is { } actualizacion)
                return actualizacion.Id;
            if (DateTime.UtcNow > limite)
                throw new TimeoutException("No se abrió la actualización.");
            await Task.Delay(150);
        }
    }

    /// <summary>
    /// Norte con el flujo CLIENTE en una etapa (Compras y Cumplimiento, y Cumplimiento puede rechazar) que pide el RUT, y un tercero ya aprobado por las dos áreas.
    /// </summary>
    protected async Task<(Escenario E, VinculoDto Vinculo, SesionTerceroDto Sesion, string Correo, Guid Inicial)> AprobadoConRechazoPosibleAsync()
    {
        var e = await PrepararAsync();
        var flujo = await ApiAsync<FlujoDto>("POST", "/api/v1/flujos", Admin(e.Norte), new CrearFlujoDto("HAB_NR_" + Guid.NewGuid().ToString("N")[..4].ToUpperInvariant(),
            "Habilitación", "CLIENTE", [new EtapaDto(1, [new AreaDeEtapaDto(e.Compras.Id), new AreaDeEtapaDto(e.Cumplimiento.Id, PuedeRechazarExpediente: true)])],
            Requisitos: [new RequisitoDelFlujoDto(TipoDocumento: "RUT", AreasQueRevisan: [e.Compras.Id, e.Cumplimiento.Id])]), 201);
        await ApiAsync<FlujoDto>("POST", $"/api/v1/flujos/{flujo.Id}/publicar", Admin(e.Norte), new { }, 200);
        var correo = CorreoNuevo();
        var vinculo = await CrearVinculoAsync(e.Norte, "CLIENTE", correo);
        var sesion = await SesionAsync(correo);
        await SubirAsync(sesion, "RUT", Pdf("RUT v1"));
        await AceptarAsync(sesion, vinculo.Id);
        var inicial = await AbiertoEnAsync(e.Norte, vinculo.Id);
        var revision = await EsperarAsync(e.Norte, inicial, x => x.Estado == "EnRevision");
        var versiones = new Dictionary<Guid, int> { [Requisito(revision, "RUT").Id] = 1 };
        await AreaAsync<ExpedienteDto>(e, inicial, e.Compras, e.Laura, new VeredictoDto("Aprobado", Versiones: versiones));
        (await AreaAsync<ExpedienteDto>(e, inicial, e.Cumplimiento, e.Carlos, new VeredictoDto("Aprobado", Versiones: versiones))).Estado.ShouldBe("Aprobado");
        return (e, vinculo, sesion, correo, inicial);
    }

    // ---------- preparación ----------

    /// <summary>Llave de prueba única (≥ 20 caracteres); el marcador cambia lo que responde el analizador falso.</summary>
    protected static string LlaveIa(string marcador = "ok") => $"sk-prueba-{marcador}-{Guid.NewGuid():N}";

    protected Task<PlanIaEmpresaDto> PlanIaAsync(Empresa empresa, ActualizarPlanIaEmpresaDto plan) =>
        ApiAsync<PlanIaEmpresaDto>("PUT", $"/api/v1/plataforma/tenants/{empresa.Datos.TenantId}/empresas/{empresa.Datos.Id}/plan-ia",
            new Credencial(ApiFixture.ClavePlataforma), plan, 200);

    protected Task<UsoIaDto> UsoIaAsync(Empresa empresa) => ApiAsync<UsoIaDto>("GET", "/api/v1/ia/uso", Admin(empresa), null, 200);

    /// <summary>Otra empresa del mismo tenant (misma llave de administración y sistema), con sus textos legales publicados.</summary>
    protected async Task<Empresa> OtraEmpresaDelTenantAsync(Empresa primera, string nombre, string prefijo, string nit)
    {
        var datos = await ApiAsync<EmpresaDto>("POST", "/api/v1/empresas", new Credencial(primera.Admin),
            new CrearEmpresaDto(new IdentificacionDto("CO", "NIT", nit), nombre, prefijo, null, null), 201);
        await ApiAsync<TextoLegalDto>("PUT", $"/api/v1/empresas/{datos.Id}/textos-legales/autorizacion", new Credencial(primera.Admin),
            new PublicarTextoLegalDto($"Autorizo a {nombre}"), 200);
        await ApiAsync<TextoLegalDto>("PUT", $"/api/v1/empresas/{datos.Id}/textos-legales/terminos", new Credencial(primera.Admin),
            new PublicarTextoLegalDto($"Términos de {nombre}"), 200);
        return primera with { Datos = datos };
    }

    protected static async Task EsperarAsync(Func<Task<bool>> condicion, string que)
    {
        // 45 s: con varias colecciones corriendo a la vez (PV-1) la cola de IA o la de mensajes puede tardar más que con una sola.
        var limite = DateTime.UtcNow.AddSeconds(45);
        while (!await condicion())
        {
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"No se cumplió a tiempo: {que}.");
            await Task.Delay(100);
        }
    }

    /// <summary>El análisis llega por la cola <c>ia</c>: espera (hasta 45 s) a que la versión, vista por la empresa, cumpla la condición.</summary>
    protected async Task<VersionDocumentoDto> EsperarVersionAsync(Empresa empresa, Guid vinculoId, string codigo, int numero,
        Func<VersionDocumentoDto, bool> condicion)
    {
        VersionDocumentoDto? version = null;
        await EsperarAsync(async () =>
        {
            var documentos = await ApiAsync<List<DocumentoVistaEmpresaDto>>("GET", $"/api/v1/vinculos/{vinculoId}/documentos", Admin(empresa), null, 200);
            version = documentos.FirstOrDefault(d => d.Tipo.Codigo == codigo)?.VersionesCompartidas.FirstOrDefault(v => v.N == numero);
            return version is not null && condicion(version);
        }, $"la versión {numero} de {codigo}");
        return version!;
    }

    /// <summary>Muestrea la memoria del proceso mientras corre el lote: pico del conjunto de trabajo y del montón gestionado.</summary>
    protected sealed class MuestreoDeMemoria : IAsyncDisposable
    {
        private readonly CancellationTokenSource _cancelar = new();
        private readonly Task _tarea;
        public long LineaBaseTrabajo { get; }
        public long LineaBaseMontonGestionado { get; }
        public long PicoTrabajo { get; private set; }
        public long PicoMontonGestionado { get; private set; }
        public int Colecciones2 { get; private set; }
        private readonly int _colecciones2Iniciales = GC.CollectionCount(2);

        public MuestreoDeMemoria()
        {
            GC.Collect();
            GC.WaitForPendingFinalizers();
            LineaBaseTrabajo = PicoTrabajo = Process.GetCurrentProcess().WorkingSet64;
            LineaBaseMontonGestionado = PicoMontonGestionado = GC.GetTotalMemory(forceFullCollection: false);
            _tarea = Task.Run(async () =>
            {
                while (!_cancelar.IsCancellationRequested)
                {
                    PicoTrabajo = Math.Max(PicoTrabajo, Process.GetCurrentProcess().WorkingSet64);
                    PicoMontonGestionado = Math.Max(PicoMontonGestionado, GC.GetTotalMemory(false));
                    try
                    {
                        await Task.Delay(100, _cancelar.Token);
                    }
                    catch (OperationCanceledException)
                    {
                        return;
                    }
                }
            });
        }

        public double CrecimientoDeTrabajoMb => (PicoTrabajo - LineaBaseTrabajo) / 1048576.0;

        public double CrecimientoDeMontonMb => (PicoMontonGestionado - LineaBaseMontonGestionado) / 1048576.0;

        public async ValueTask DisposeAsync()
        {
            await _cancelar.CancelAsync();
            await _tarea;
            Colecciones2 = GC.CollectionCount(2) - _colecciones2Iniciales;
        }
    }

    /// <summary>Un stream SSE abierto contra la API en proceso: junta lo que llega para esperarlo o comprobar que no llegó.</summary>
    protected sealed class LectorSse : IAsyncDisposable
    {
        private readonly CancellationTokenSource _cancelar = new(TimeSpan.FromMinutes(4));
        private readonly HttpClient _cliente;
        private readonly HttpResponseMessage _respuesta;
        private readonly Task _lectura;
        private readonly ConcurrentQueue<(string Evento, string Datos)> _recibidos = new();

        private LectorSse(HttpClient cliente, HttpResponseMessage respuesta)
        {
            _cliente = cliente;
            _respuesta = respuesta;
            _lectura = LeerAsync();
        }

        public IReadOnlyList<(string Evento, string Datos)> Recibidos => [.. _recibidos];

        /// <summary>El stream terminó (el servidor lo cerró).</summary>
        public bool Termino => _lectura.IsCompleted;

        public static async Task<LectorSse> AbrirAsync(IAlbaHost host, string url, Action<HttpRequestMessage> cabeceras)
        {
            var cliente = host.Server.CreateClient();
            using var peticion = new HttpRequestMessage(HttpMethod.Get, url);
            cabeceras(peticion);
            var respuesta = await cliente.SendAsync(peticion, HttpCompletionOption.ResponseHeadersRead);
            respuesta.StatusCode.ShouldBe(HttpStatusCode.OK);
            respuesta.Content.Headers.ContentType!.MediaType.ShouldBe("text/event-stream");
            return new LectorSse(cliente, respuesta);
        }

        private async Task LeerAsync()
        {
            try
            {
                using var lector = new StreamReader(await _respuesta.Content.ReadAsStreamAsync(_cancelar.Token));
                string? evento = null;
                while (await lector.ReadLineAsync(_cancelar.Token) is { } linea)
                {
                    if (linea.StartsWith("event: ", StringComparison.Ordinal))
                        evento = linea[7..];
                    else if (linea.StartsWith("data: ", StringComparison.Ordinal))
                        _recibidos.Enqueue((evento ?? "message", linea[6..]));
                }
            }
            catch (Exception e) when (e is OperationCanceledException or IOException or ObjectDisposedException)
            {
                // Se cerró el stream (la prueba terminó o el servidor lo cortó).
            }
        }

        /// <summary>Espera (hasta 30 s) un evento que cumpla la condición y lo devuelve.</summary>
        public async Task<(string Evento, string Datos)> EsperarAsync(Func<string, string, bool> condicion, string descripcion)
        {
            var limite = DateTime.UtcNow.AddSeconds(30);
            while (true)
            {
                foreach (var recibido in _recibidos)
                    if (condicion(recibido.Evento, recibido.Datos))
                        return recibido;
                if (DateTime.UtcNow > limite)
                    throw new TimeoutException($"El stream no recibió {descripcion}. Recibió: {string.Join(" | ", _recibidos.Select(r => $"{r.Evento} {r.Datos}"))}");
                await Task.Delay(100);
            }
        }

        /// <summary>Que en <paramref name="espera"/> no llegue ningún evento que cumpla la condición (para comprobar lo que NO debe llegar).</summary>
        public async Task NoLlegaAsync(Func<string, string, bool> condicion, TimeSpan espera, string descripcion)
        {
            await Task.Delay(espera);
            _recibidos.Where(r => condicion(r.Evento, r.Datos)).ShouldBeEmpty($"El stream no debía recibir {descripcion}.");
        }

        public async ValueTask DisposeAsync()
        {
            await _cancelar.CancelAsync();
            await _lectura;
            _respuesta.Dispose();
            _cliente.Dispose();
            _cancelar.Dispose();
        }
    }

    // ---------- plantillas de notificación (PL-1) ----------

    protected const string RutaPlantillas = "/api/v1/plantillas-notificacion";

    protected static bool Cambio(string evento, string datos, string recurso, Guid id) =>
        evento == "cambio" && System.Text.Json.JsonDocument.Parse(datos).RootElement is var raiz &&
        raiz.GetProperty("recurso").GetString() == recurso && raiz.GetProperty("id").GetGuid() == id;

    // (desde RequisitosVigenciasApiTests)
    /// <summary>Corre el barrido del job de vigencias para el tenant (como lo pide el programador) y espera lo que encadene.</summary>
    protected Task BarrerVigenciasAsync(Guid tenantId) =>
        Host.TrackActivity().Timeout(TimeSpan.FromSeconds(30)).SendMessageAndWaitAsync(new RevisarVigenciasDeVinculos(tenantId));

    // (desde RequisitosOperacionApiTests)
    /// <summary>El veredicto de aprobación de lo que el área tiene por decidir, visto por <paramref name="como"/>.</summary>
    protected async Task<VeredictoDto> AprobarLoDeAsync(Escenario e, Guid expedienteId, string codigoArea, Persona como)
    {
        var leido = await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Delegado(e.Norte, como), null, 200);
        var porDecidir = Area(leido, codigoArea).DocumentosPorDecidir ?? [];
        return new VeredictoDto("Aprobado", Versiones: porDecidir.ToDictionary(d => d.RequisitoId, d => d.VersionVigente));
    }

    // (desde RequisitosVinculoEnRevisionApiTests)
    protected async Task<VinculoPublicoDto> VinculoPublicoAsync(SesionTerceroDto sesion, Guid vinculoId) =>
        (await TerceroAsync<List<VinculoPublicoDto>>("GET", "/public/v1/vinculos", sesion.AccessToken, null, 200)).Single(v => v.Id == vinculoId);

    // (desde RequisitosIntegracionAbiertaApiTests)
    protected const string OrigenAnfitrion = "https://anfitrion.ficticio.test";

    // (desde RequisitosIntegracionAbiertaApiTests)
    protected async Task<Credencial> SistemaNuevoConOrigenesAsync(Empresa empresa, string codigo, IReadOnlyList<string>? origenes, params string[] scopes)
    {
        var rsa = RSA.Create(2048);
        var sistema = await ApiAsync<SistemaIntegradoDto>("POST", "/api/v1/sistemas", new Credencial(empresa.Admin),
            new CrearSistemaIntegradoDto(codigo, "Sistema " + codigo, rsa.ExportSubjectPublicKeyInfoPem(), origenes), 201);
        var llave = await ApiAsync<ApiKeyDto>("POST", "/api/v1/api-keys", new Credencial(empresa.Admin),
            new CrearApiKeyDto("Integración " + codigo, scopes, null, null, SistemaId: sistema.Id), 201);
        return new Credencial(llave.Valor!, empresa.Datos.Id);
    }

    // (desde RequisitosIntegracionAbiertaApiTests)
    protected static readonly string[] ScopesDeReferencias = ["terceros:leer", "terceros:escribir", "vinculos:leer", "vinculos:escribir"];

    // (desde RequisitosIntegracionAbiertaApiTests)
    protected static readonly string[] ScopesDeEmbebido = [.. ScopesDeReferencias, "sesiones-tercero:crear"];

    // (desde RequisitosImportacionPortalApiTests)
    protected async Task<T?> CargarAsync<T>(object id, string? tenant = null) where T : class
    {
        await using var consulta = tenant is null
            ? Host.Services.GetRequiredService<IDocumentStore>().QuerySession()
            : Host.Services.GetRequiredService<IDocumentStore>().QuerySession(tenant);
        return id switch
        {
            Guid g => await consulta.LoadAsync<T>(g),
            string s => await consulta.LoadAsync<T>(s),
            _ => throw new ArgumentException("id")
        };
    }

    // (desde RequisitosInformesApiTests)
    protected static async Task<string> HojaAsync(byte[] libro, int numero)
    {
        using var zip = new ZipArchive(new MemoryStream(libro));
        using var lector = new StreamReader(zip.GetEntry($"xl/worksheets/sheet{numero}.xml")!.Open());
        return await lector.ReadToEndAsync();
    }

    // (desde RequisitosIaApiTests)
    protected async Task<Documento?> DocumentoDeBovedaAsync(Guid documentoId)
    {
        await using var consulta = Host.Services.GetRequiredService<IDocumentStore>().QuerySession("boveda");
        return await consulta.LoadAsync<Documento>(documentoId);
    }

    // (desde RequisitosIaApiTests)
    /// <summary>Ejecuta el manejador en línea (idempotente): deja asentado lo que la cola aún estuviera procesando.</summary>
    protected async Task AsentarIaAsync(Guid documentoId, int numero)
    {
        using var alcance = Host.Services.CreateScope();
        await alcance.ServiceProvider.GetRequiredService<IMessageBus>().InvokeAsync(new AnalizarVersionConIa(documentoId, numero));
    }

    // (desde RequisitosFichaPendientesApiTests)
    /// <summary>Las dos áreas del flujo (Compras y Cumplimiento) aprueban lo que les queda por decidir (con una justificación si el caso la pide).</summary>
    protected async Task<ExpedienteDto> AreasApruebanAsync(Escenario e, Guid expedienteId, string? justificacion = null)
    {
        ExpedienteDto? resultado = null;
        foreach (var (area, persona) in new[] { (e.Compras, e.Laura), (e.Cumplimiento, e.Carlos) })
        {
            var porDecidir = Area(await ApiAsync<ExpedienteDto>("GET", $"/api/v1/expedientes/{expedienteId}", Delegado(e.Norte, persona), null, 200), area.Codigo)
                .DocumentosPorDecidir!;
            resultado = await AreaAsync<ExpedienteDto>(e, expedienteId, area, persona,
                new VeredictoDto("Aprobado", Versiones: porDecidir.ToDictionary(d => d.RequisitoId, d => d.VersionVigente), Justificacion: justificacion));
        }

        return resultado!;
    }

    // (desde RequisitosLotesApiTests)
    protected static string CsvDeLote(IEnumerable<string> filas) =>
        "Tipo de identificación;Número de identificación;Razón social o nombres;Correo;Tipo de vínculo\r\n" + string.Join("\r\n", filas) + "\r\n";

}
