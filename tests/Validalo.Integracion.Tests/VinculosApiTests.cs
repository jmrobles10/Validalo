using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Text.Json;
using Alba;
using JasperFx.CommandLine;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Validalo.Aplicacion.Comun;
using Validalo.Contratos;

namespace Validalo.Integracion.Tests;

/// <summary>
/// Levanta PostgreSQL 17 y MinIO en Docker (Testcontainers) y la API completa en memoria (Alba). Los correos no salen: los
/// captura <see cref="CorreosCapturados"/>. El límite de peticiones públicas es bajo (20 por minuto y por IP) y el tamaño
/// máximo de archivo también (<see cref="TamanoMaximo"/>, 3 MB) para probar el 413 sin subir 20 MB y dejar espacio a un tipo
/// de 1 MB (TD-1). El reloj de la aplicación es <see cref="Reloj"/>: el real, salvo que una prueba lo adelante.
/// </summary>
public sealed class ApiFixture : IAsyncLifetime
{
    public const string ClavePlataforma = "dev-plataforma-solo-local-cambiar-0001";
    public const string UrlPublica = "https://publico.validalo.test";
    public const int LimitePublico = 20;

    /// <summary>Peticiones por minuto y por IP de <c>/api/v1/ingreso</c> en las pruebas (ING-1).</summary>
    public const int LimiteIngreso = 25;

    /// <summary>Sitio (<c>rp.id</c>) y origen de la app web que declaran las passkeys de las pruebas (ING-2).</summary>
    public const string SitioDePasskeys = "validalo.test";

    public const string OrigenDeLaApp = "https://app.validalo.test";
    public const long TamanoMaximo = 3 * 1024 * 1024;

    /// <summary>Origen de un frontend en otro dominio con CORS habilitado (SE-5).</summary>
    public const string OrigenCors = "https://app.cliente.test";

    /// <summary>Proxy confiable (IP suelta) y red confiable para <c>X-Forwarded-For</c> (SE-6).</summary>
    public const string ProxyConfiable = "10.20.30.40";

    public const string RedConfiable = "10.99.0.0/16";

    /// <summary>Fallos seguidos que deshabilitan una suscripción de webhook en las pruebas (NW-7).</summary>
    public const int FallosParaDeshabilitarWebhook = 3;

    /// <summary>Carpeta temporal con un <c>dist/</c> mínimo de cada app para servirlas desde la API (SE-3).</summary>
    public string CarpetaApps { get; } = Path.Combine(Path.GetTempPath(), "validalo-apps-" + Guid.NewGuid().ToString("N"));

    /// <summary>JSON del Portal que lee el sincronizador de coexistencia (origen configurado <c>Archivo</c>, F4); lo escriben las pruebas.</summary>
    public string ArchivoPortal { get; } = Path.Combine(Path.GetTempPath(), "validalo-portal-" + Guid.NewGuid().ToString("N") + ".json");

    private ServiciosCompartidos _servicios = null!;
    private string _cadenaDeConexion = null!;
    private bool _serviciosAdquiridos;

    public IAlbaHost Host { get; private set; } = null!;

    public CorreosCapturados Correos { get; } = new();

    /// <summary>Proveedor de identidad OIDC/WorkOS simulado, en proceso (SSO, PI-3): nunca se llega a uno real.</summary>
    public IdpSimulado Idp { get; private set; } = null!;

    /// <summary>Qué dominios «publicaron» su token de verificación (PI-2): el comprobador real busca un archivo por https y aquí nunca se sale a la red.</summary>
    public ComprobadorDeDominiosDePrueba Dominios { get; } = new();

    /// <summary>Cadena de conexión de la base de las pruebas (para leer y escribir como lo haría otro servidor).</summary>
    public string CadenaDeConexion => _cadenaDeConexion;

    public RelojDePruebas Reloj { get; } = new();

    /// <summary>Analizador de IA falso (ADR-0012): las pruebas nunca llaman a OpenAI.</summary>
    public AnalizadorFalso Analizador { get; } = new();

    public async Task InitializeAsync()
    {
        _servicios = await ServiciosCompartidos.AdquirirAsync();
        _serviciosAdquiridos = true;
        _cadenaDeConexion = await _servicios.CrearBaseAsync();
        Idp = await IdpSimulado.IniciarAsync();
        CrearApps();
        // Program termina con `app.RunJasperFxCommands(args)`: sin esto JasperFx corre su comando `run`, que también vigila el host y lo detiene
        // cuando empieza el cierre. Al cerrar el fixture el host tenía entonces DOS dueños llamando a Host.StopAsync a la vez (Alba y el comando
        // run); el que llegaba segundo encontraba los servicios ya liberados y el cierre fallaba con un AggregateException («Test Collection
        // Cleanup Failure») con 568 de 568 verdes pero exit 1, casi siempre con pocos núcleos. Con AutoStartHost JasperFx solo arranca el host y
        // vuelve: el cierre queda en manos de Alba. Es lo que JasperFx documenta para las pruebas con WebApplicationFactory.
        JasperFxEnvironment.AutoStartHost = true;
        Host = await AlbaHost.For<Program>(b =>
        {
            b.UseEnvironment("Development");
            b.UseSetting("ConnectionStrings:Validalo", _cadenaDeConexion);
            b.UseSetting("Validalo:Almacen:Endpoint", _servicios.EndpointMinio);
            b.UseSetting("Validalo:Almacen:EndpointPublico", "");
            b.UseSetting("Validalo:Almacen:AccessKey", _servicios.ClaveDeAccesoMinio);
            b.UseSetting("Validalo:Almacen:SecretKey", _servicios.ClaveSecretaMinio);
            b.UseSetting("Validalo:Almacen:CrearBucketsAlIniciar", "true");
            b.UseSetting("Validalo:Boveda:TamanoMaximoBytes", TamanoMaximo.ToString(System.Globalization.CultureInfo.InvariantCulture));
            b.UseSetting("Validalo:Correo:UrlPublica", UrlPublica);
            b.UseSetting("Validalo:LimitePublico:Peticiones", LimitePublico.ToString(System.Globalization.CultureInfo.InvariantCulture));
            b.UseSetting("Validalo:LimitePublico:VentanaSegundos", "60");
            b.UseSetting("Validalo:SesionTercero:CookieSegura", "true"); // como producción: se verifica el atributo Secure
            b.UseSetting("Validalo:Ingreso:Passkeys:RpId", SitioDePasskeys);
            b.UseSetting("Validalo:Ingreso:Passkeys:Origenes:0", OrigenDeLaApp);
            b.UseSetting("Validalo:LimiteIngreso:Peticiones", LimiteIngreso.ToString(System.Globalization.CultureInfo.InvariantCulture));
            b.UseSetting("Validalo:LimiteIngreso:VentanaSegundos", "60");
            // SSO (PI-3, PI-6): el proveedor simulado vive en 127.0.0.1; el adaptador de WorkOS apunta a sus puntos simulados.
            b.UseSetting("Validalo:Ingreso:Sso:PermitirHttpLocal", "true");
            b.UseSetting("Validalo:Ingreso:Sso:WorkOs:ApiKey", IdpSimulado.ApiKeyDeWorkOs);
            b.UseSetting("Validalo:Ingreso:Sso:WorkOs:ClientId", IdpSimulado.ClientIdDeWorkOs);
            b.UseSetting("Validalo:Ingreso:Sso:WorkOs:UrlBase", Idp.UrlDeWorkOs);
            b.UseSetting("Validalo:Apps:Web", Path.Combine(CarpetaApps, "web"));
            b.UseSetting("Validalo:Apps:Publica", Path.Combine(CarpetaApps, "public"));
            b.UseSetting("Validalo:Cors:OrigenesPermitidos:0", OrigenCors);
            b.UseSetting("Validalo:Proxies:Confiables:0", ProxyConfiable);
            b.UseSetting("Validalo:Proxies:Confiables:1", RedConfiable);
            b.UseSetting("Validalo:Importacion:Portal:Archivo", ArchivoPortal); // sincronizador del Portal sin red (F4)
            b.UseSetting("Validalo:Certificados:SegundosProceso", "1"); // PDF de los certificados casi al instante
            b.UseSetting("Validalo:Verificadores:SegundosProceso", "1"); // consultas automáticas de listas casi al instante
            b.UseSetting("Validalo:RevisionAutomatica:SegundosProceso", "1"); // revisión automática con IA casi al instante
            // Webhooks (NW): receptor local por http, reintentos de segundos y deshabilitación tras 3 fallos seguidos.
            b.UseSetting("Validalo:Webhooks:PermitirHttpLocal", "true");
            b.UseSetting("Validalo:Webhooks:Reintentos:0", "00:00:01");
            b.UseSetting("Validalo:Webhooks:Reintentos:1", "00:00:01");
            b.UseSetting("Validalo:Webhooks:FallosParaDeshabilitar", FallosParaDeshabilitarWebhook.ToString(System.Globalization.CultureInfo.InvariantCulture));
            b.UseSetting("Validalo:Webhooks:TimeoutSegundos", "3");
            // Plazos de cargue (LT-4): sin barrido periódico; las pruebas lo disparan con el reloj o la fecha que necesitan.
            b.UseSetting("Validalo:PlazosDeCargue:Intervalo", "00:00:00");
            // Invitación masiva (LT-8): tandas pequeñas para ver el avance, la pausa y la reanudación.
            b.UseSetting("Validalo:Lotes:TamanoTanda", "5");
            // Plan del grupo (OD-14…OD-17): el conteo de llamadas se vuelca cada segundo, el almacenamiento se mide en cada lectura y los barridos
            // periódicos del plan y del habeas data se apagan (las pruebas los disparan con los endpoints de Plataforma).
            b.UseSetting("Validalo:Plan:SegundosDeVolcado", "1");
            b.UseSetting("Validalo:Plan:MinutosMedicionAlmacenamiento", "0");
            b.UseSetting("Validalo:Plan:Intervalo", "00:00:00");
            b.UseSetting("Validalo:Habeas:Intervalo", "00:00:00");
            // La migración de los vínculos aceptados antes del acceso aislado no corre sola al arrancar: las pruebas de la migración la ejecutan a mano sobre sus datos.
            b.UseSetting("Validalo:Migraciones:AccesoAislado:Habilitada", "false");
            // Tampoco la de la certificación bancaria por cuenta: su prueba la ejecuta a mano sobre sus datos.
            b.UseSetting("Validalo:Migraciones:CertificacionPorCuenta:Habilitada", "false");
            // Ni la liga por número de las certificaciones generales ya leídas: su prueba la ejecuta a mano sobre sus datos.
            b.UseSetting("Validalo:Migraciones:CertificacionPorNumero:Habilitada", "false");
            // Ni la de las personas declaradas a mano a la ficha legal: su prueba la ejecuta a mano sobre sus datos.
            b.UseSetting("Validalo:Migraciones:PersonasEnLaFicha:Habilitada", "false");
            // Ni la de las reglas de frescura de los tipos (TD-10): su prueba la ejecuta a mano sobre sus datos.
            b.UseSetting("Validalo:Migraciones:ReglasDeFrescura:Habilitada", "false");
            // La aprobación de un documento pide recalcular su vigencia por un barrido corto (TD-10): casi al instante.
            b.UseSetting("Validalo:VigenciasDeDocumentos:SegundosProceso", "1");
            b.ConfigureTestServices(s =>
            {
                // El transporte SMTP se reemplaza, no el enviador: el aislamiento del sandbox (SB-4) sigue activo en las pruebas y lo que
                // llega a Correos es solo lo que de verdad saldría a un destinatario.
                s.RemoveAll<ITransporteDeCorreo>();
                s.AddSingleton<ITransporteDeCorreo>(Correos);
                s.RemoveAll<TimeProvider>();
                s.AddSingleton<TimeProvider>(Reloj);
                s.RemoveAll<Validalo.Aplicacion.Identidad.IComprobadorDeDominios>();
                s.AddSingleton<Validalo.Aplicacion.Identidad.IComprobadorDeDominios>(Dominios);
                s.RemoveAll<Validalo.Aplicacion.Ia.IAnalizadorDeDocumentos>();
                s.AddSingleton<Validalo.Aplicacion.Ia.IAnalizadorDeDocumentos>(Analizador);
            });
        });
    }

    public async Task DisposeAsync()
    {
        if (Host is not null)
            await Host.DisposeAsync();
        if (Idp is not null)
            await Idp.DisposeAsync();
        if (_serviciosAdquiridos)
            await ServiciosCompartidos.LiberarAsync();
        if (Directory.Exists(CarpetaApps))
            Directory.Delete(CarpetaApps, recursive: true);
    }

    private void CrearApps()
    {
        Directory.CreateDirectory(Path.Combine(CarpetaApps, "web", "assets"));
        Directory.CreateDirectory(Path.Combine(CarpetaApps, "public", "assets"));
        File.WriteAllText(Path.Combine(CarpetaApps, "web", "index.html"), "<!doctype html><title>web</title><script src=\"./assets/web.js\"></script>");
        File.WriteAllText(Path.Combine(CarpetaApps, "web", "assets", "web-abc123.js"), "console.log('web');");
        File.WriteAllText(Path.Combine(CarpetaApps, "public", "index.html"), "<!doctype html><title>public</title>");
        File.WriteAllText(Path.Combine(CarpetaApps, "public", "assets", "public-abc123.js"), "console.log('public');");
    }
}

/// <summary>Reloj real desplazado <see cref="Desfase"/> (las pruebas de vigencias lo adelantan y lo devuelven a cero).</summary>
public sealed class RelojDePruebas : TimeProvider
{
    public TimeSpan Desfase { get; set; }

    public override DateTimeOffset GetUtcNow() => base.GetUtcNow() + Desfase;
}

/// <summary>Enviador falso: guarda los correos para leer el enlace o el código; el envío real ocurre tras el commit (outbox).</summary>
public sealed class CorreosCapturados : ITransporteDeCorreo, IEnviadorDeCorreo
{
    private readonly ConcurrentQueue<MensajeDeCorreo> _mensajes = new();

    public Task EnviarAsync(MensajeDeCorreo mensaje, CancellationToken ct)
    {
        _mensajes.Enqueue(mensaje);
        return Task.CompletedTask;
    }

    /// <summary>Cuántos correos han salido (para medir el avance de un envío masivo).</summary>
    public int Total => _mensajes.Count;

    public IReadOnlyList<MensajeDeCorreo> Para(string correo) =>
        [.. _mensajes.Where(m => string.Equals(m.Para, correo, StringComparison.OrdinalIgnoreCase))];

    /// <summary>Espera hasta que haya <paramref name="cuantos"/> correos a <paramref name="para"/> que cumplan la condición; devuelve el último.</summary>
    public async Task<MensajeDeCorreo> EsperarAsync(string para, Func<MensajeDeCorreo, bool>? condicion = null, int cuantos = 1)
    {
        var limite = DateTime.UtcNow.AddSeconds(20);
        while (true)
        {
            var encontrados = Para(para).Where(condicion ?? (_ => true)).ToList();
            if (encontrados.Count >= cuantos)
                return encontrados[cuantos - 1];
            if (DateTime.UtcNow > limite)
                throw new TimeoutException($"No llegaron {cuantos} correos a {para} (hay {encontrados.Count}).");
            await Task.Delay(50);
        }
    }
}

[Collection(Colecciones.Api3)]
[Trait("Requiere", "Docker")]
public sealed class VinculosApiTests(ApiFixture fixture)
{
    private IAlbaHost Host => fixture.Host;

    private sealed record Escenario(string ApiKey, EmpresaDto EmpresaA, EmpresaDto EmpresaB);

    private async Task<Escenario> PrepararAsync()
    {
        var slug = "t" + Guid.NewGuid().ToString("N")[..10];
        var tenant = await PostAsync<TenantCreadoDto>("/api/v1/plataforma/tenants", ApiFixture.ClavePlataforma, null,
            new CrearTenantDto(slug, "Constructora Demo", "co", "America/Bogota"));
        var clave = tenant.ApiKeyAdministrador.Valor!;

        var a = await PostAsync<EmpresaDto>("/api/v1/empresas", clave, null,
            new CrearEmpresaDto(new IdentificacionDto("CO", "NIT", "800197268-4"), "Norte S.A.S.", "NORTE", null, null));
        var b = await PostAsync<EmpresaDto>("/api/v1/empresas", clave, null,
            new CrearEmpresaDto(new IdentificacionDto("CO", "NIT", "899999068"), "Sur S.A.S.", "SUR", null, null));
        return new Escenario(clave, a, b);
    }

    /// <summary>La llave de administración no pertenece a un sistema integrado: no envía referencia externa (ADR-0011).</summary>
    private static CrearVinculoDto Proveedor(string nit) => new(
        TerceroId: null,
        Tercero: new CrearTerceroDto(new IdentificacionDto("CO", "NIT", nit), "Juridica", "Aceros del Norte S.A.S.", null,
            [new ContactoDto("Ana Gómez", "ana@aceros.co", null, "Comercial")]),
        TipoVinculo: "PROVEEDOR",
        Atributos: null,
        CorreoInvitacion: "ana@aceros.co",
        ReferenciaExterna: null);

    [Fact]
    public async Task Crea_un_vinculo_con_identificador_invitacion_e_historial()
    {
        var e = await PrepararAsync();

        var vinculo = await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaA.Id, Proveedor("900123456"));

        vinculo.Id.ShouldNotBe(Guid.Empty);
        vinculo.Estado.ShouldBe("Invitado");
        vinculo.TipoVinculo.Codigo.ShouldBe("PROVEEDOR");
        vinculo.Invitacion!.Envios.ShouldBe(1);

        var leido = await GetAsync<VinculoDto>($"/api/v1/vinculos/{vinculo.Id}", e.ApiKey, e.EmpresaA.Id);
        leido.Id.ShouldBe(vinculo.Id);

        var historial = await GetAsync<List<EventoHistorialDto>>($"/api/v1/vinculos/{vinculo.Id}/historial", e.ApiKey, e.EmpresaA.Id);
        historial.Select(h => h.Tipo).ShouldBe(["vinculo_creado", "invitacion_enviada"]);
        historial[0].ActorTipo.ShouldBe("Integracion");
    }

    [Fact]
    public async Task No_permite_dos_vinculos_del_mismo_tipo_con_el_mismo_tercero_en_la_empresa()
    {
        var e = await PrepararAsync();
        await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaA.Id, Proveedor("900555111"));

        var respuesta = await Host.Scenario(s =>
        {
            s.Post.Json(Proveedor("900555111")).ToUrl("/api/v1/vinculos");
            Cabeceras(s, e.ApiKey, e.EmpresaA.Id, Guid.NewGuid().ToString());
            s.StatusCodeShouldBe(409);
        });
        (await respuesta.ReadAsTextAsync()).ShouldContain("vinculo-duplicado");
    }

    [Fact]
    public async Task Una_llave_sin_sistema_integrado_no_registra_referencias_externas()
    {
        var e = await PrepararAsync();

        var respuesta = await Host.Scenario(s =>
        {
            s.Post.Json(Proveedor("900555222") with { ReferenciaExterna = new ReferenciaExternaDto("SRM", "ADP-00123") }).ToUrl("/api/v1/vinculos");
            Cabeceras(s, e.ApiKey, e.EmpresaA.Id, Guid.NewGuid().ToString());
            s.StatusCodeShouldBe(422);
        });
        (await respuesta.ReadAsTextAsync()).ShouldContain("referencia-sin-sistema");
    }

    [Fact]
    public async Task Otra_empresa_del_mismo_tenant_no_ve_el_vinculo_y_puede_crear_el_suyo()
    {
        var e = await PrepararAsync();
        var deA = await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaA.Id, Proveedor("900777222"));

        await Host.Scenario(s =>
        {
            s.Get.Url($"/api/v1/vinculos/{deA.Id}");
            Cabeceras(s, e.ApiKey, e.EmpresaB.Id);
            s.StatusCodeShouldBe(404);
        });

        var deB = await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaB.Id, Proveedor("900777222"));
        deB.TerceroId.ShouldBe(deA.TerceroId); // mismo tercero en la bóveda
        deB.Id.ShouldNotBe(deA.Id);            // vínculos distintos por empresa
    }

    [Fact]
    public async Task Idempotency_key_repite_la_respuesta_y_rechaza_otro_cuerpo()
    {
        var e = await PrepararAsync();
        var clave = Guid.NewGuid().ToString();

        var primero = await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaA.Id, Proveedor("900888333"), clave);
        var repetido = await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaA.Id, Proveedor("900888333"), clave);
        repetido.Id.ShouldBe(primero.Id);

        await Host.Scenario(s =>
        {
            s.Post.Json(Proveedor("900888444")).ToUrl("/api/v1/vinculos");
            Cabeceras(s, e.ApiKey, e.EmpresaA.Id, clave);
            s.StatusCodeShouldBe(422);
        });
    }

    [Fact]
    public async Task Bloquear_y_desbloquear_restituye_el_estado()
    {
        var e = await PrepararAsync();
        var vinculo = await PostAsync<VinculoDto>("/api/v1/vinculos", e.ApiKey, e.EmpresaA.Id, Proveedor("900999444"));

        var bloqueado = await PostAsync<VinculoDto>($"/api/v1/vinculos/{vinculo.Id}/bloquear", e.ApiKey, e.EmpresaA.Id,
            new BloquearVinculoDto("Sanción contractual", null), esperado: 200);
        bloqueado.Estado.ShouldBe("Bloqueado");

        // El historial usa las convenciones JSON de la API: camelCase y enums como texto.
        var historial = await GetAsync<List<EventoHistorialDto>>($"/api/v1/vinculos/{vinculo.Id}/historial", e.ApiKey, e.EmpresaA.Id);
        var datos = historial.Single(h => h.Tipo == "vinculo_bloqueado").Datos;
        datos.GetProperty("estadoPrevio").ValueKind.ShouldBe(JsonValueKind.String);
        datos.GetProperty("estadoPrevio").GetString().ShouldBe("Invitado");
        datos.GetProperty("motivo").GetString().ShouldBe("Sanción contractual");

        var desbloqueado = await PostAsync<VinculoDto>($"/api/v1/vinculos/{vinculo.Id}/desbloquear", e.ApiKey, e.EmpresaA.Id,
            new JustificacionDto("Sanción levantada"), esperado: 200);
        desbloqueado.Estado.ShouldBe("Invitado");
    }

    [Fact]
    public async Task Sin_credencial_responde_401() =>
        await Host.Scenario(s =>
        {
            s.Get.Url("/api/v1/vinculos");
            s.StatusCodeShouldBe(401);
        });

    // ---------- utilidades ----------

    private async Task<T> PostAsync<T>(string url, string apiKey, Guid? empresa, object cuerpo, string? idempotencia = null, int esperado = 201)
    {
        var resultado = await Host.Scenario(s =>
        {
            s.Post.Json(cuerpo).ToUrl(url);
            Cabeceras(s, apiKey, empresa, idempotencia ?? Guid.NewGuid().ToString());
            s.StatusCodeShouldBe(esperado);
        });
        return (await resultado.ReadAsJsonAsync<T>())!;
    }

    private async Task<T> GetAsync<T>(string url, string apiKey, Guid? empresa)
    {
        var resultado = await Host.Scenario(s =>
        {
            s.Get.Url(url);
            Cabeceras(s, apiKey, empresa);
            s.StatusCodeShouldBeOk();
        });
        return (await resultado.ReadAsJsonAsync<T>())!;
    }

    private static void Cabeceras(Scenario s, string apiKey, Guid? empresa, string? idempotencia = null)
    {
        s.WithRequestHeader("X-Api-Key", apiKey);
        if (empresa is not null)
            s.WithRequestHeader("X-Empresa", empresa.Value.ToString());
        if (idempotencia is not null)
            s.WithRequestHeader("Idempotency-Key", idempotencia);
    }
}
