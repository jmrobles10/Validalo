using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Identidad;
using Validalo.Dominio.Identificaciones;

namespace Validalo.Dominio.Plataforma;

/// <summary>
/// Cliente del SaaS = grupo empresarial (ADR-0008). Esquema <c>plataforma</c>. Su <see cref="Id"/> es el
/// identificador de tenant que usa Marten (<c>tenant_id</c> en el esquema <c>validacion</c>).
/// </summary>
public sealed class Tenant
{
    public Guid Id { get; set; }

    /// <summary>
    /// Inmutable: forma parte de cada API key del grupo (<c>vsk_{entorno}_{slug}_…</c>) y es con lo que se encuentra al grupo al autenticarla;
    /// cambiarlo invalidaría todas las llaves emitidas. Tampoco lo corrige Plataforma. El sandbox lleva el suyo, con <c>~sandbox</c>.
    /// </summary>
    public string Slug { get; set; } = string.Empty;

    public string Nombre { get; set; } = string.Empty;

    public string Region { get; set; } = "co";

    public string ZonaHoraria { get; set; } = "America/Bogota";

    public string Idioma { get; set; } = "es-CO";

    public string Plan { get; set; } = "Inicial";

    public bool Activo { get; set; } = true;

    public DateTimeOffset CreadoEn { get; set; }

    /// <summary>
    /// Si es el sandbox de un grupo (SB-1): el tenant de producción del que es hermano. Nulo en todo tenant real. Un sandbox
    /// es un tenant más —con sus propias empresas, datos y eventos—, así que nada suyo se mezcla con producción.
    /// </summary>
    public Guid? TenantDeProduccionId { get; set; }

    /// <summary>Última vez que se reinició el sandbox (SB-5); nulo si nunca.</summary>
    public DateTimeOffset? ReiniciadoEn { get; set; }

    [JsonIgnore]
    public bool EsSandbox => TenantDeProduccionId is not null;

    /// <summary>
    /// Cómo entran las personas del grupo (ING-1). Por omisión solo la identidad delegada del sistema integrado, como antes del
    /// ingreso directo (los grupos existentes no cambian).
    /// </summary>
    public ModoDeIngreso ModosDeIngreso { get; set; } = ModoDeIngreso.Delegado;

    /// <summary>Duración máxima (horas) de una sesión de ingreso directo; no se extiende al renovarla.</summary>
    public int SesionHoras { get; set; } = SesionHorasPorDefecto;

    /// <summary>Minutos sin renovar tras los cuales una sesión de ingreso directo se cierra.</summary>
    public int InactividadMinutos { get; set; } = InactividadMinutosPorDefecto;

    /// <summary>
    /// Opción explícita del grupo, apagada por omisión: si la activa, todas sus personas deben tener passkey y el código del correo solo les sirve para registrar la primera.
    /// Ningún rol la exige por sí mismo: sin esta opción el código del correo basta para entrar y para confirmar acciones sensibles (PI-20).
    /// </summary>
    public bool PasskeyParaTodos { get; set; }

    public const int SesionHorasPorDefecto = 8;
    public const int InactividadMinutosPorDefecto = 30;
    public const int MinimoSesionHoras = 1;
    public const int MaximoSesionHoras = 24;
    public const int MinimoInactividadMinutos = 5;
    public const int MaximoInactividadMinutos = 480;

    public string IdentificadorMarten => Id.ToString("N");

    /// <summary>
    /// El sandbox de <paramref name="produccion"/> (SB-1): mismo grupo, región y zona horaria. Su slug lleva <c>~sandbox</c>,
    /// carácter que ningún slug real puede tener, así nunca choca con el de otro grupo. Las API keys de prueba no llevan este
    /// slug sino el del grupo de producción (<c>vsk_test_{slug}_…</c>).
    /// </summary>
    public static Tenant CrearSandbox(Tenant produccion, DateTimeOffset ahora)
    {
        if (produccion.EsSandbox)
            throw ReglaDeNegocioException.Validacion("sandbox-de-sandbox", "Un sandbox no tiene sandbox propio.");

        return new Tenant
        {
            Id = Guid.CreateVersion7(),
            Slug = produccion.Slug + AislamientoDeSandbox.SufijoDeSlug,
            Nombre = produccion.Nombre + AislamientoDeSandbox.SufijoDeNombre,
            Region = produccion.Region,
            ZonaHoraria = produccion.ZonaHoraria,
            Idioma = produccion.Idioma,
            Plan = produccion.Plan,
            TenantDeProduccionId = produccion.Id,
            CreadoEn = ahora
        };
    }

    /// <summary>
    /// Política de ingreso del grupo: al menos un modo, sesión de 1 a 24 horas e inactividad de 5 a 480 minutos (sin pasar de la
    /// duración de la sesión).
    /// </summary>
    public void FijarIngreso(ModoDeIngreso modos, int sesionHoras, int inactividadMinutos, bool passkeyParaTodos)
    {
        if (modos == ModoDeIngreso.Ninguno || (modos & ~(ModoDeIngreso.Delegado | ModoDeIngreso.Directo)) != 0)
            throw ReglaDeNegocioException.Validacion("modos-de-ingreso-invalidos", "Elige al menos un modo de ingreso: Delegado, Directo o ambos.");
        if (sesionHoras is < MinimoSesionHoras or > MaximoSesionHoras)
            throw ReglaDeNegocioException.Validacion("sesion-invalida", $"La sesión dura entre {MinimoSesionHoras} y {MaximoSesionHoras} horas.");
        if (inactividadMinutos is < MinimoInactividadMinutos or > MaximoInactividadMinutos || inactividadMinutos > sesionHoras * 60)
            throw ReglaDeNegocioException.Validacion("inactividad-invalida",
                $"El cierre por inactividad va de {MinimoInactividadMinutos} a {MaximoInactividadMinutos} minutos y no puede superar la duración de la sesión.");

        ModosDeIngreso = modos;
        SesionHoras = sesionHoras;
        InactividadMinutos = inactividadMinutos;
        PasskeyParaTodos = passkeyParaTodos;
    }

    public static Tenant Crear(string slug, string nombre, string? region, string? zonaHoraria, DateTimeOffset ahora)
    {
        var slugNormalizado = (slug ?? string.Empty).Trim().ToLowerInvariant();
        if (!Regex.IsMatch(slugNormalizado, "^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$"))
            throw ReglaDeNegocioException.Validacion("slug-invalido",
                "El slug debe tener entre 3 y 30 caracteres: letras minúsculas, números y guiones, sin guion al inicio o al final.");

        return new Tenant
        {
            Id = Guid.CreateVersion7(),
            Slug = slugNormalizado,
            Nombre = ValidarNombre(nombre),
            Region = NormalizarRegion(region),
            ZonaHoraria = ValidarZonaHoraria(zonaHoraria),
            CreadoEn = ahora
        };
    }

    /// <summary>
    /// Corrige los datos con que se dio de alta el grupo —nombre, región y zona horaria— con las mismas reglas que <see cref="Crear"/>
    /// (nombre obligatorio, zona IANA válida; una región o una zona vacías son las del alta: <c>co</c> y <c>America/Bogota</c>); <c>null</c>
    /// conserva el valor actual. El slug no cambia (va en las API keys). Siempre se puede, también con el grupo desactivado. Devuelve si algo
    /// cambió. Un grupo sandbox no se corrige por su cuenta: sigue al de producción (<see cref="AlinearConProduccion"/>).
    /// </summary>
    public bool CorregirDatos(string nombre, string? region, string? zonaHoraria)
    {
        if (EsSandbox)
            throw ReglaDeNegocioException.Conflicto("copia-de-sandbox", "El sandbox sigue a su grupo de producción: corrige el de producción.");

        var nombreLimpio = ValidarNombre(nombre);
        var regionNueva = region is null ? Region : NormalizarRegion(region);
        var zonaNueva = zonaHoraria is null ? ZonaHoraria : ValidarZonaHoraria(zonaHoraria);

        var cambio = nombreLimpio != Nombre || regionNueva != Region || zonaNueva != ZonaHoraria;
        Nombre = nombreLimpio;
        Region = regionNueva;
        ZonaHoraria = zonaNueva;
        return cambio;
    }

    /// <summary>
    /// Pone este sandbox al día con su grupo de producción tras una corrección: el nombre con « (sandbox)», la región y la zona horaria.
    /// Devuelve si algo cambió.
    /// </summary>
    public bool AlinearConProduccion(Tenant produccion)
    {
        if (TenantDeProduccionId != produccion.Id)
            throw ReglaDeNegocioException.Conflicto("sandbox-ajeno", "Este sandbox no es el de ese grupo.");

        var nombre = produccion.Nombre + AislamientoDeSandbox.SufijoDeNombre;
        var cambio = nombre != Nombre || produccion.Region != Region || produccion.ZonaHoraria != ZonaHoraria;
        Nombre = nombre;
        Region = produccion.Region;
        ZonaHoraria = produccion.ZonaHoraria;
        return cambio;
    }

    private static string ValidarNombre(string nombre)
    {
        if (string.IsNullOrWhiteSpace(nombre))
            throw ReglaDeNegocioException.Validacion("nombre-requerido", "El nombre del tenant es obligatorio.");
        return nombre.Trim();
    }

    private static string NormalizarRegion(string? region) => string.IsNullOrWhiteSpace(region) ? "co" : region.Trim().ToLowerInvariant();

    private static string ValidarZonaHoraria(string? zonaHoraria)
    {
        var zona = string.IsNullOrWhiteSpace(zonaHoraria) ? "America/Bogota" : zonaHoraria.Trim();
        if (!TimeZoneInfo.TryFindSystemTimeZoneById(zona, out _))
            throw ReglaDeNegocioException.Validacion("zona-horaria-invalida", $"'{zona}' no es una zona horaria IANA válida.");
        return zona;
    }
}

/// <summary>Razón social dentro del tenant (ADR-0008). Las decisiones se aíslan por empresa.</summary>
public sealed class Empresa
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Identificacion Identificacion { get; set; } = null!;

    /// <summary>Copia de <see cref="Identificacion.Clave"/> para el índice único por tenant.</summary>
    public string ClaveIdentificacion { get; set; } = string.Empty;

    public string Nombre { get; set; } = string.Empty;

    /// <summary>Prefijo de folios de expediente y certificado (<c>{Prefijo}-E-…</c>, T-9). Único en el tenant.</summary>
    public string PrefijoFolio { get; set; } = string.Empty;

    /// <summary>Logo para el portal del tercero y el certificado: URL https o imagen SVG/PNG embebida (data URI, ≤ 200 KB).</summary>
    public string? LogoUrl { get; set; }

    /// <summary>Correo de soporte para terceros: aparece en el pie de sus pantallas y es el Reply-To de los correos.</summary>
    public string? ReplyTo { get; set; }

    /// <summary>Color de marca (#RRGGBB). El portal deriva de él una paleta que cumple contraste (marcaEmpresa).</summary>
    public string? ColorMarca { get; set; }

    public bool Activa { get; set; } = true;

    public DateTimeOffset CreadaEn { get; set; }

    /// <summary>Si es la copia de pruebas de una empresa real (SB-3): la empresa de producción que refleja. Nulo en las reales.</summary>
    public Guid? EmpresaDeProduccionId { get; set; }

    /// <summary>
    /// Copia de <paramref name="produccion"/> para el sandbox (SB-3): misma identificación y marca, nombre con «(sandbox)» y un
    /// prefijo de folio propio (<see cref="AislamientoDeSandbox.PrefijoDeFolio"/>) para que un folio de prueba nunca se confunda
    /// con uno real.
    /// </summary>
    public static Empresa CrearCopiaDeSandbox(Empresa produccion, Guid tenantSandboxId, string prefijoFolio, DateTimeOffset ahora) => new()
    {
        Id = Guid.CreateVersion7(),
        TenantId = tenantSandboxId,
        Identificacion = produccion.Identificacion,
        ClaveIdentificacion = produccion.ClaveIdentificacion,
        Nombre = produccion.Nombre + AislamientoDeSandbox.SufijoDeNombre,
        PrefijoFolio = prefijoFolio,
        LogoUrl = produccion.LogoUrl,
        ReplyTo = produccion.ReplyTo,
        ColorMarca = produccion.ColorMarca,
        Activa = produccion.Activa,
        EmpresaDeProduccionId = produccion.Id,
        CreadaEn = ahora
    };

    /// <summary>
    /// Alinea la copia de pruebas con su empresa real: identificación, nombre, marca y si está activa. El prefijo de folio de la copia
    /// no se copia (tiene su propia regla, <see cref="AislamientoDeSandbox.PrefijoDeFolio"/>): si el real cambia, se vuelve a derivar
    /// con <see cref="AjustarPrefijoDeCopiaDeSandbox"/>. Si otra empresa del sandbox (creada allá, sin real) ya tiene la identificación
    /// del real —<paramref name="clavesDeOtrasEmpresas"/>—, la copia conserva la suya: la unicidad del grupo no se rompe.
    /// </summary>
    public void SincronizarCopiaDeSandbox(Empresa produccion, IReadOnlySet<string>? clavesDeOtrasEmpresas = null)
    {
        if (clavesDeOtrasEmpresas is null || !clavesDeOtrasEmpresas.Contains(produccion.ClaveIdentificacion))
        {
            Identificacion = produccion.Identificacion;
            ClaveIdentificacion = produccion.ClaveIdentificacion;
        }

        Nombre = produccion.Nombre + AislamientoDeSandbox.SufijoDeNombre;
        LogoUrl = produccion.LogoUrl;
        ReplyTo = produccion.ReplyTo;
        ColorMarca = produccion.ColorMarca;
        Activa = produccion.Activa;
    }

    /// <summary>
    /// Vuelve a derivar el prefijo de folio de la copia de pruebas del real <paramref name="prefijoDeProduccion"/> (<c>T</c> + el real,
    /// sin chocar con <paramref name="ocupadosPorOtras"/>, los prefijos de las demás empresas del sandbox). Los folios de prueba ya
    /// emitidos conservan el prefijo con que salieron.
    /// </summary>
    public void AjustarPrefijoDeCopiaDeSandbox(string prefijoDeProduccion, IReadOnlySet<string> ocupadosPorOtras) =>
        PrefijoFolio = AislamientoDeSandbox.PrefijoDeFolio(prefijoDeProduccion, ocupadosPorOtras);

    public static Empresa Crear(Guid tenantId, Identificacion identificacion, string nombre, string prefijoFolio,
        string? logoUrl, string? replyTo, DateTimeOffset ahora)
    {
        var (nombreLimpio, prefijo) = ValidarDatosDeAlta(nombre, prefijoFolio);

        return new Empresa
        {
            Id = Guid.CreateVersion7(),
            TenantId = tenantId,
            Identificacion = identificacion,
            ClaveIdentificacion = identificacion.Clave,
            Nombre = nombreLimpio,
            PrefijoFolio = prefijo,
            LogoUrl = ValidarLogo(logoUrl),
            ReplyTo = ValidarSoporte(replyTo),
            CreadaEn = ahora
        };
    }

    /// <summary>
    /// Corrige los datos con que se dio de alta la empresa —identificación, razón social y prefijo de folio— con las mismas reglas
    /// que <see cref="Crear"/>; recalcula <see cref="ClaveIdentificacion"/>. Siempre se puede (la consola de Plataforma lo ofrece sin
    /// condiciones). Devuelve si algo cambió. La unicidad en el grupo (identificación y prefijo) la decide quien tiene a las demás
    /// empresas. Los folios y los certificados ya emitidos no se reescriben: conservan el prefijo, el nombre y la identificación con
    /// que se emitieron; los contadores de folio son por empresa (no por prefijo), así que la numeración sigue donde iba. Las copias
    /// de pruebas siguen a su empresa real, no se corrigen por su cuenta (409 <c>copia-de-sandbox</c>).
    /// </summary>
    public bool CorregirDatosDeAlta(Identificacion identificacion, string nombre, string prefijoFolio)
    {
        if (EmpresaDeProduccionId is not null)
            throw ReglaDeNegocioException.Conflicto("copia-de-sandbox", "La copia de pruebas sigue a su empresa real: corrige la real.");

        ArgumentNullException.ThrowIfNull(identificacion);
        var (nombreLimpio, prefijo) = ValidarDatosDeAlta(nombre, prefijoFolio);

        var cambio = identificacion != Identificacion || nombreLimpio != Nombre || prefijo != PrefijoFolio;
        Identificacion = identificacion;
        ClaveIdentificacion = identificacion.Clave;
        Nombre = nombreLimpio;
        PrefijoFolio = prefijo;
        return cambio;
    }

    /// <summary>Lo común del alta y de la corrección: razón social obligatoria y prefijo de 2 a 10 letras mayúsculas o números.</summary>
    private static (string Nombre, string Prefijo) ValidarDatosDeAlta(string nombre, string prefijoFolio)
    {
        if (string.IsNullOrWhiteSpace(nombre))
            throw ReglaDeNegocioException.Validacion("nombre-requerido", "La razón social es obligatoria.");

        var prefijo = (prefijoFolio ?? string.Empty).Trim().ToUpperInvariant();
        if (!Regex.IsMatch(prefijo, "^[A-Z0-9]{2,10}$"))
            throw ReglaDeNegocioException.Validacion("prefijo-folio-invalido",
                "El prefijo de folio debe tener entre 2 y 10 letras mayúsculas o números.");

        return (nombre.Trim(), prefijo);
    }

    public const int TamanoMaximoLogo = 200 * 1024;

    /// <summary>
    /// Datos y marca (P2ConfigEmpresa): contacto de soporte, color y logo. La razón social, la identificación y el prefijo de folio
    /// no se cambian aquí: los corrige Plataforma con <see cref="CorregirDatosDeAlta"/>. <c>null</c> conserva; cadena vacía quita.
    /// </summary>
    public void ActualizarMarca(string? contactoSoporte, string? colorMarca, string? logoUrl)
    {
        if (contactoSoporte is not null)
            ReplyTo = ValidarSoporte(contactoSoporte);
        if (colorMarca is not null)
            ColorMarca = ValidarColor(colorMarca);
        if (logoUrl is not null)
            LogoUrl = ValidarLogo(logoUrl);
    }

    private static string? ValidarSoporte(string? correo)
    {
        if (string.IsNullOrWhiteSpace(correo))
            return null;
        var limpio = correo.Trim();
        if (limpio.Length > 254 || !Regex.IsMatch(limpio, @"^[^@\s]+@[^@\s]+\.[^@\s]+$"))
            throw ReglaDeNegocioException.Validacion("contacto-soporte-invalido", "El contacto de soporte debe ser un correo válido.");
        return limpio;
    }

    private static string? ValidarColor(string color)
    {
        if (string.IsNullOrWhiteSpace(color))
            return null;
        var limpio = color.Trim().ToUpperInvariant();
        if (!Regex.IsMatch(limpio, "^#[0-9A-F]{6}$"))
            throw ReglaDeNegocioException.Validacion("color-marca-invalido", "El color de marca debe ser hexadecimal, como #E07A1F.");
        return limpio;
    }

    /// <summary>URL https o data URI de SVG/PNG en base64 de hasta <see cref="TamanoMaximoLogo"/> bytes.</summary>
    private static string? ValidarLogo(string? logo)
    {
        if (string.IsNullOrWhiteSpace(logo))
            return null;
        var limpio = logo.Trim();
        if (Uri.TryCreate(limpio, UriKind.Absolute, out var url) && url.Scheme == Uri.UriSchemeHttps && limpio.Length <= 2048)
            return limpio;

        var datos = Regex.Match(limpio, @"^data:(image/svg\+xml|image/png);base64,([A-Za-z0-9+/=]+)$");
        if (!datos.Success)
            throw ReglaDeNegocioException.Validacion("logo-invalido", "El logo debe ser una imagen SVG o PNG (o una URL https).");
        var bytes = datos.Groups[2].Value.Length / 4 * 3;
        if (bytes > TamanoMaximoLogo)
            throw ReglaDeNegocioException.Validacion("logo-demasiado-grande", "El logo pesa más de 200 KB.");
        return limpio;
    }
}
