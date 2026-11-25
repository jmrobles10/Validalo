using Validalo.Dominio.Comun;
using Validalo.Dominio.Identificaciones;

namespace Validalo.Dominio.Identidad;

/// <summary>Roles del tenant (docs/07 §3.1). Se asignan en Valídalo, iguales para todos los sistemas (ID-2).</summary>
public enum Rol
{
    Administrador,
    Revisor,
    OficialCumplimiento,
    Auditor
}

/// <summary>Rol en una empresa interna o, con <see cref="EmpresaId"/> nulo, en todo el tenant (ADR-0008).</summary>
public sealed record RolAsignado(Rol Rol, Guid? EmpresaId);

/// <summary>Quién es la persona en un sistema integrado: <c>(sistema, sub)</c> de la aserción delegada.</summary>
public sealed record IdentidadExterna(Guid SistemaId, string IdExterno);

/// <summary>
/// Persona que revisa, aprueba o administra (ADR-0011). Valídalo no guarda contraseñas: la autentica el sistema
/// integrado y la reconoce por sus identidades externas. Esquema <c>identidad</c>, multi-tenant.
/// </summary>
public sealed class Usuario
{
    public Guid Id { get; set; }

    /// <summary>
    /// Grupo al que pertenece (copia del <c>tenant_id</c> de Marten): el ingreso directo busca la cuenta por correo en todos los
    /// grupos y necesita saber de cuál es cada una. Nulo en los usuarios anteriores al ingreso directo, que se completan al
    /// habilitar ese modo en su grupo.
    /// </summary>
    public Guid? TenantId { get; set; }

    public string Nombre { get; set; } = string.Empty;

    /// <summary>Normalizado (minúsculas, sin espacios); único en el tenant.</summary>
    public string Correo { get; set; } = string.Empty;

    /// <summary>Opcional; sirve para detectar conflicto de intereses con terceros.</summary>
    public Identificacion? Identificacion { get; set; }

    public bool Activo { get; set; } = true;

    public List<IdentidadExterna> Identidades { get; set; } = [];

    public List<RolAsignado> Roles { get; set; } = [];

    /// <summary>
    /// Grupos de acceso propios del tenant que tiene la persona (además de los roles, que son los grupos predefinidos). Lo que puede es la unión de sus roles y de lo
    /// que dan estos grupos mientras estén activos.
    /// </summary>
    public List<AsignacionDeGrupo> Grupos { get; set; } = [];

    public DateTimeOffset CreadoEn { get; set; }

    public DateTimeOffset? UltimoAcceso { get; set; }

    /// <summary>Cuándo se le envió la última invitación a ingresar con su correo (ING-5).</summary>
    public DateTimeOffset? InvitadoEn { get; set; }

    public static Usuario Crear(string nombre, string correo, Identificacion? identificacion, DateTimeOffset ahora, Guid? tenantId = null)
    {
        return new Usuario
        {
            Id = Guid.CreateVersion7(),
            TenantId = tenantId,
            Nombre = ValidarNombre(nombre),
            Correo = NormalizarCorreo(correo),
            Identificacion = identificacion,
            CreadoEn = ahora
        };
    }

    /// <summary>
    /// Corrige el nombre y el correo con los que se dio de alta a la persona (la consola de Plataforma lo ofrece sin condiciones, también con la cuenta
    /// desactivada), con las mismas reglas que <see cref="Crear"/>: nombre obligatorio y correo válido, que se normaliza (minúsculas, sin espacios).
    /// Devuelve si algo cambió. Que el correo no lo tenga otra persona del grupo lo decide quien tiene a las demás.
    /// </summary>
    public bool CorregirDatos(string nombre, string correo)
    {
        var nombreLimpio = ValidarNombre(nombre);
        var correoNormalizado = NormalizarCorreo(correo);

        var cambio = nombreLimpio != Nombre || correoNormalizado != Correo;
        Nombre = nombreLimpio;
        Correo = correoNormalizado;
        return cambio;
    }

    private static string ValidarNombre(string? nombre)
    {
        if (string.IsNullOrWhiteSpace(nombre))
            throw ReglaDeNegocioException.Validacion("nombre-requerido", "El nombre del usuario es obligatorio.");
        return nombre.Trim();
    }

    /// <summary>Alta automática desde una aserción delegada: nace <b>sin roles</b> (ID-2).</summary>
    public static Usuario CrearDesdeSistema(Guid sistemaId, string idExterno, string nombre, string correo, DateTimeOffset ahora, Guid? tenantId = null)
    {
        var usuario = Crear(nombre, correo, null, ahora, tenantId);
        usuario.EnlazarIdentidad(sistemaId, idExterno);
        usuario.UltimoAcceso = ahora;
        return usuario;
    }

    public static string NormalizarCorreo(string? correo)
    {
        var normalizado = (correo ?? string.Empty).Trim().ToLowerInvariant();
        if (normalizado.Length is < 3 or > 254 || normalizado.Count(c => c == '@') != 1 || normalizado.StartsWith('@') ||
            normalizado.EndsWith('@') || normalizado.Any(char.IsWhiteSpace))
            throw ReglaDeNegocioException.Validacion("correo-invalido", "El correo del usuario no es válido.");
        return normalizado;
    }

    /// <summary>Una sola identidad por sistema: el mismo <c>sub</c> es idempotente; otro distinto es conflicto.</summary>
    public void EnlazarIdentidad(Guid sistemaId, string idExterno)
    {
        if (string.IsNullOrWhiteSpace(idExterno))
            throw ReglaDeNegocioException.Validacion("identidad-externa-invalida", "La identidad externa necesita el id del usuario en el sistema.");

        var id = idExterno.Trim();
        var existente = Identidades.FirstOrDefault(i => i.SistemaId == sistemaId);
        if (existente is not null && existente.IdExterno != id)
            throw ReglaDeNegocioException.Conflicto("identidad-en-conflicto",
                "El usuario ya está enlazado a otra identidad de ese sistema.");

        if (existente is null)
            Identidades.Add(new IdentidadExterna(sistemaId, id));
    }

    /// <summary>
    /// Reemplaza las identidades externas por las indicadas (a lo más una por sistema; el id se recorta y no puede quedar vacío): así Plataforma corrige
    /// el <c>sub</c> con que el sistema integrado reconoce a la persona, o lo quita. Devuelve si algo cambió. Que el <c>sub</c> no lo tenga otra persona del
    /// grupo y que el sistema exista lo decide quien tiene el contexto (el índice <see cref="IndiceIdentidadExterna"/>).
    /// </summary>
    public bool ReemplazarIdentidades(IEnumerable<IdentidadExterna> nuevas)
    {
        var lista = new List<IdentidadExterna>();
        foreach (var identidad in nuevas)
        {
            if (string.IsNullOrWhiteSpace(identidad.IdExterno))
                throw ReglaDeNegocioException.Validacion("identidad-externa-invalida", "La identidad externa necesita el id del usuario en el sistema.");
            if (lista.Any(i => i.SistemaId == identidad.SistemaId))
                throw ReglaDeNegocioException.Validacion("identidades-repetidas", "Solo puede haber una identidad por sistema.");
            lista.Add(new IdentidadExterna(identidad.SistemaId, identidad.IdExterno.Trim()));
        }

        var cambio = lista.Count != Identidades.Count || lista.Any(i => !Identidades.Contains(i));
        Identidades = lista;
        return cambio;
    }

    /// <summary>Reemplaza los roles. Un rol de todo el tenant hace redundante el mismo rol por empresa.</summary>
    public void AsignarRoles(IEnumerable<RolAsignado> roles)
    {
        if (!Activo)
            throw ReglaDeNegocioException.Conflicto("usuario-inactivo", "No se asignan roles a un usuario desactivado.");

        var lista = roles.Distinct().ToList();
        var deTenant = lista.Where(r => r.EmpresaId is null).Select(r => r.Rol).ToHashSet();
        Roles = [.. lista.Where(r => r.EmpresaId is null || !deTenant.Contains(r.Rol))];
    }

    /// <summary>Reemplaza las asignaciones de grupos propios. Un grupo asignado a todo el tenant hace redundante el mismo grupo por empresa.</summary>
    public void AsignarGrupos(IEnumerable<AsignacionDeGrupo> grupos)
    {
        if (!Activo)
            throw ReglaDeNegocioException.Conflicto("usuario-inactivo", "No se asignan grupos a un usuario desactivado.");

        var lista = grupos.Distinct().ToList();
        var deTenant = lista.Where(g => g.EmpresaId is null).Select(g => g.GrupoId).ToHashSet();
        Grupos = [.. lista.Where(g => g.EmpresaId is null || !deTenant.Contains(g.GrupoId))];
    }

    public void Desactivar()
    {
        if (!Activo)
            throw ReglaDeNegocioException.Conflicto("usuario-inactivo", "El usuario ya está desactivado.");
        Activo = false;
    }

    /// <summary>Si tiene algún rol o grupo de acceso en la empresa, directamente o para todo el tenant.</summary>
    public bool TieneRolEn(Guid empresaId) =>
        Roles.Any(r => r.EmpresaId is null || r.EmpresaId == empresaId) || Grupos.Any(g => g.EmpresaId is null || g.EmpresaId == empresaId);
}

/// <summary>
/// Índice único <c>(sistema, sub) → usuario</c> por tenant. Su id es <c>{sistemaId:N}:{sub}</c>: insertarlo dos veces
/// falla, lo que hace única la identidad externa aun con altas concurrentes. Esquema <c>identidad</c>, multi-tenant.
/// </summary>
public sealed class IndiceIdentidadExterna
{
    public string Id { get; set; } = string.Empty;

    public Guid UsuarioId { get; set; }

    public static string Clave(Guid sistemaId, string idExterno) => $"{sistemaId:N}:{idExterno.Trim()}";
}
