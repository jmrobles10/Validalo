using System.Security.Claims;
using Marten;
using Microsoft.AspNetCore.Http;
using Validalo.Aplicacion.Comun;
using Validalo.Contratos;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Identidad;
using Wolverine;

namespace Validalo.Aplicacion.Identidad;

/// <summary>
/// Seguridad de la cuenta de quien entró directo (PI-13, PI-18, PI-20): confirmar una acción sensible (step-up) con la passkey o con un código enviado al correo, y
/// los códigos de recuperación que respaldan la passkey cuando se pierde el dispositivo.
/// </summary>
public sealed partial class ServicioDeIngreso
{
    // ---------- reautenticación (step-up) ----------

    /// <summary>
    /// Exige que la persona haya confirmado con su passkey o con un código del correo en los últimos <see cref="SesionDeUsuario.VentanaDeReautenticacion"/> antes de una
    /// acción sensible (rotar o revocar llaves, cambiar roles, desactivar sistemas, personas u operadores, configurar el SSO…). Solo aplica a quien entró directo (reclamo
    /// <c>validalo:sesion-id</c>): una API key o la identidad delegada de un sistema no tienen a una persona delante de un navegador. 403
    /// <c>reautenticacion-requerida</c> (con <c>minutos</c>, <c>accion</c>, <c>tienePasskey</c> y <c>puedeConCodigo</c>); la persona sin ninguna passkey que entró por un
    /// SSO con varios factores ya está reautenticada.
    /// </summary>
    public async Task ExigirReautenticacionAsync(ClaimsPrincipal usuario, string accion, CancellationToken ct)
    {
        if (!Guid.TryParse(usuario.FindFirstValue(ReclamosDeIngreso.SesionId), out var sesionId))
            return;

        var ahora = reloj.GetUtcNow();
        await using var consulta = sesiones.ConsultaGlobal();
        var sesion = await consulta.LoadAsync<SesionDeUsuario>(sesionId, ct);
        if (sesion is null || !sesion.VigenteEn(ahora))
            throw ReglaDeNegocioException.NoAutenticado("sesion-revocada", "Tu sesión se cerró. Ingresa de nuevo.");
        if (sesion.ReautenticadaVigente(ahora))
            return;

        var cuentaDeIngreso = new CuentaDeIngreso(sesion.Propietario, sesion.TenantId, sesion.SujetoId);
        var tienePasskey = (await cuentas.PasskeysAsync(cuentaDeIngreso, ct)).Count > 0;
        if (!tienePasskey && sesion.Metodo == MetodoDeIngreso.Sso)
            return;

        var puedeConCodigo = await PuedeConfirmarConCodigoAsync(cuentaDeIngreso, ct);
        throw new ReglaDeNegocioException(TipoFalla.Prohibido, "reautenticacion-requerida",
            (tienePasskey, puedeConCodigo) switch
            {
                (true, true) => "Confirma con tu passkey o con un código que te enviamos al correo para continuar con esta acción.",
                (false, true) => "Confirma con un código que te enviamos al correo para continuar con esta acción.",
                (true, false) => "Confirma con tu passkey para continuar con esta acción.",
                _ => "Esta acción exige una passkey: registra una en Mi cuenta."
            })
        {
            Datos = new Dictionary<string, object?>
            {
                ["accion"] = accion,
                ["minutos"] = (int)SesionDeUsuario.VentanaDeReautenticacion.TotalMinutes,
                ["tienePasskey"] = tienePasskey,
                ["puedeConCodigo"] = puedeConCodigo
            }
        };
    }

    /// <summary>
    /// El código del correo sirve para confirmar una acción sensible a quien no tiene que confirmar con la passkey: una persona de un grupo que no exige passkey a todos.
    /// Los operadores de Plataforma y los grupos con «passkey para todos» siguen confirmando solo con la passkey (PI-20).
    /// </summary>
    private async Task<bool> PuedeConfirmarConCodigoAsync(CuentaDeIngreso cuenta, CancellationToken ct) =>
        cuenta.Tipo == TipoDePropietario.Usuario && await cuentas.CargarAsync(cuenta, ct) is { ExigePasskey: false };

    /// <summary>Si la sesión de la persona está reautenticada ahora y hasta cuándo.</summary>
    public EstadoDeReautenticacionDto EstadoDeReautenticacion(SesionDeUsuario sesion)
    {
        var ahora = reloj.GetUtcNow();
        var vigente = sesion.ReautenticadaVigente(ahora);
        return new EstadoDeReautenticacionDto(vigente, vigente ? sesion.ReautenticadaEn + SesionDeUsuario.VentanaDeReautenticacion : null,
            (int)SesionDeUsuario.VentanaDeReautenticacion.TotalMinutes);
    }

    /// <summary>Opciones de WebAuthn para confirmar con una de las passkeys de la cuenta. 409 <c>sin-passkey</c> si no tiene ninguna.</summary>
    public async Task<OpcionesDePasskeyDto> OpcionesDeReautenticacionAsync(CuentaResuelta cuenta, SesionDeUsuario actual, ContextoDeCliente cliente, CancellationToken ct)
    {
        var registradas = await cuentas.PasskeysAsync(cuenta.Cuenta, ct);
        if (registradas.Count == 0)
            throw ReglaDeNegocioException.Conflicto("sin-passkey", "Registra una passkey en Mi cuenta para confirmar acciones sensibles.");

        var ahora = reloj.GetUtcNow();
        var desafio = DesafioDeIngreso.ParaReautenticacion(cuenta.Cuenta, cuenta.Correo, actual.Id, ahora, cliente.Ip, cliente.Dispositivo);
        var opciones = passkeys.OpcionesDeAutenticacion([.. registradas.Select(p => p.CredencialId)]);
        desafio.GuardarOpciones(opciones, ahora);
        await using var sesion = sesiones.Global();
        sesion.Store(desafio);
        await sesion.SaveChangesAsync(ct);
        return new OpcionesDePasskeyDto(desafio.Id, MapeosDeIngreso.AJson(opciones));
    }

    /// <summary>
    /// Verifica la aserción de la passkey y deja la sesión reautenticada por <see cref="SesionDeUsuario.VentanaDeReautenticacion"/>. La passkey debe ser de la misma
    /// cuenta y activa. 401 <c>passkey-invalida</c>, <c>passkey-revocada</c>, <c>passkey-clonada</c>; 410 <c>desafio-usado</c>.
    /// </summary>
    public async Task<ReautenticacionDto> ConfirmarReautenticacionAsync(CuentaResuelta cuenta, SesionDeUsuario actual, VerificarPasskeyDto dto, ContextoDeCliente cliente,
        CancellationToken ct)
    {
        var ahora = reloj.GetUtcNow();
        await using var sesion = sesiones.Global();
        var desafio = await CargarAsync(sesion, dto.Desafio, ct);
        if (!desafio.EsReautenticacion || desafio.SesionId != actual.Id || desafio.Cuenta != cuenta.Cuenta || desafio.Etapa != EtapaDeIngreso.PasskeyPendiente ||
            desafio.OpcionesDePasskey is null)
            throw ReglaDeNegocioException.Expirado("desafio-usado", "Esta confirmación ya se usó o no es de tu sesión. Empieza de nuevo.");
        desafio.AsegurarVigente(ahora);

        Passkey? usada = null;
        try
        {
            var aserto = await passkeys.VerificarAsertoAsync(desafio.OpcionesDePasskey, dto.Respuesta.GetRawText(),
                async (credencial, c) => usada = await sesion.Query<Passkey>().FirstOrDefaultAsync(p => p.CredencialId == credencial, c), ct);
            var passkey = aserto.Passkey;
            passkey.AsegurarActiva();
            if (passkey.Propietario != cuenta.Cuenta.Tipo || passkey.SujetoId != cuenta.Cuenta.SujetoId || passkey.TenantId != cuenta.Cuenta.TenantId)
                throw ReglaDeNegocioException.NoAutenticado("passkey-invalida", "Esa passkey no es de tu cuenta.");

            passkey.Usar(aserto.Contador, ahora, cliente.Ip);
            sesion.Store(passkey);
            desafio.Consumir(ahora);
            sesion.Store(desafio);
            var documento = await sesion.LoadAsync<SesionDeUsuario>(actual.Id, ct)
                            ?? throw ReglaDeNegocioException.NoAutenticado("sesion-revocada", "Tu sesión se cerró. Ingresa de nuevo.");
            documento.Reautenticar(ahora);
            sesion.Store(documento);
            RegistroDeIngresos.Agregar(sesion, RegistroDeIngresos.Crear(EventoDeIngreso.ReautenticacionExitosa, true, cliente, ahora, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo,
                cuenta.Cuenta.SujetoId, cuenta.Correo, actual.Metodo, sesionId: actual.Id, passkeyId: passkey.Id, detalle: passkey.Nombre));
            await sesion.SaveChangesAsync(ct);
            return new ReautenticacionDto(ahora + SesionDeUsuario.VentanaDeReautenticacion, (int)SesionDeUsuario.VentanaDeReautenticacion.TotalMinutes);
        }
        catch (ReglaDeNegocioException e)
        {
            await registro.RegistrarAsync(EventoDeIngreso.ReautenticacionFallida, false, cliente, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo, cuenta.Cuenta.SujetoId,
                cuenta.Correo, actual.Metodo, e.Codigo, sesionId: actual.Id, passkeyId: usada?.Id, ct: ct);
            throw;
        }
    }

    /// <summary>
    /// Envía al correo de la cuenta un código de 6 dígitos para confirmar una acción sensible, como alternativa a la passkey (PI-20). Tiene la mecánica del código de
    /// ingreso: se guarda solo su hash, vence a los 5 minutos y admite 5 intentos; se pueden pedir 5 por hora y correo (cupo propio, aparte del de ingreso). 403
    /// <c>reautenticacion-solo-con-passkey</c> si la cuenta debe confirmar con la passkey (operador de Plataforma, grupo con «passkey para todos»); 429
    /// <c>limite-de-envios</c>.
    /// </summary>
    public async Task<CodigoSolicitadoDto> EnviarCodigoDeReautenticacionAsync(CuentaResuelta cuenta, SesionDeUsuario actual, ContextoDeCliente cliente, IMessageBus mensajes,
        CancellationToken ct)
    {
        AsegurarConfirmacionConCodigo(cuenta);
        var ahora = reloj.GetUtcNow();
        await using var sesion = sesiones.Global(mensajes);
        if (!await RegistrarEnvioAsync(sesion, cuenta.Correo, "reautenticacion", ahora, ct))
        {
            await registro.RegistrarAsync(EventoDeIngreso.ReautenticacionFallida, false, cliente, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo, cuenta.Cuenta.SujetoId,
                cuenta.Correo, actual.Metodo, "limite-de-envios", sesionId: actual.Id, ct: ct);
            throw ReglaDeNegocioException.DemasiadosIntentos("limite-de-envios", "Ya pediste varios códigos en la última hora. Espera un poco o confirma con tu passkey.");
        }

        var (desafio, codigo) = DesafioDeIngreso.ParaCodigoDeReautenticacion(cuenta.Cuenta, cuenta.Correo, actual.Id, ahora, cliente.Ip, cliente.Dispositivo);
        sesion.Store(desafio);
        await mensajes.PublishAsync(new CorreoDeAccesoPendiente(PlantillaCorreo.CodigoDeReautenticacion, cuenta.Correo, protector.Proteger(codigo), desafio.Expira, null, null));
        RegistroDeIngresos.Agregar(sesion, RegistroDeIngresos.Crear(EventoDeIngreso.CodigoEnviado, true, cliente, ahora, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo,
            cuenta.Cuenta.SujetoId, cuenta.Correo, actual.Metodo, detalle: "Para confirmar una acción sensible", sesionId: actual.Id));
        await sesion.SaveChangesAsync(ct);
        return new CodigoSolicitadoDto(desafio.Id, desafio.Expira, $"Te enviamos un código de 6 dígitos a {cuenta.Correo}. Vence en 5 minutos.");
    }

    /// <summary>
    /// Verifica el código del correo y deja la sesión reautenticada por <see cref="SesionDeUsuario.VentanaDeReautenticacion"/>. Incorrecto ⇒ 422 <c>codigo-invalido</c>
    /// con <c>intentosRestantes</c>; vencido ⇒ 410 <c>codigo-vencido</c>; agotado ⇒ 429 <c>codigo-bloqueado</c>; un código que no es de esta sesión o ya se usó ⇒ 410
    /// <c>desafio-usado</c>. Cada fallo y el éxito quedan en la auditoría de identidad.
    /// </summary>
    public async Task<ReautenticacionDto> ConfirmarReautenticacionConCodigoAsync(CuentaResuelta cuenta, SesionDeUsuario actual, VerificarCodigoDto dto, ContextoDeCliente cliente,
        CancellationToken ct)
    {
        AsegurarConfirmacionConCodigo(cuenta);
        var ahora = reloj.GetUtcNow();
        await using var sesion = sesiones.Global();
        var desafio = await CargarAsync(sesion, dto.Desafio, ct);
        if (!desafio.EsReautenticacion || desafio.SesionId != actual.Id || desafio.Cuenta != cuenta.Cuenta || desafio.Etapa != EtapaDeIngreso.CodigoEnviado)
            throw ReglaDeNegocioException.Expirado("desafio-usado", "Esta confirmación ya se usó o no es de tu sesión. Pide un código nuevo.");

        Task Fallo(string motivo) => registro.RegistrarAsync(EventoDeIngreso.ReautenticacionFallida, false, cliente, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo,
            cuenta.Cuenta.SujetoId, cuenta.Correo, actual.Metodo, motivo, sesionId: actual.Id, ct: ct);

        bool correcto;
        try
        {
            correcto = desafio.VerificarCodigoDeReautenticacion(dto.Codigo, ahora);
        }
        catch (ReglaDeNegocioException e)
        {
            await Fallo(e.Codigo);
            throw;
        }

        sesion.Store(desafio);
        if (!correcto)
        {
            // El intento fallido se guarda antes de responder, como en el ingreso.
            await sesion.SaveChangesAsync(ct);
            await Fallo("codigo-incorrecto");
            throw new ReglaDeNegocioException(TipoFalla.Validacion, "codigo-invalido", $"El código no es correcto. Te quedan {Plural.Intentos(desafio.IntentosRestantes)}.")
            {
                Datos = new Dictionary<string, object?> { ["intentosRestantes"] = desafio.IntentosRestantes }
            };
        }

        var documento = await sesion.LoadAsync<SesionDeUsuario>(actual.Id, ct)
                        ?? throw ReglaDeNegocioException.NoAutenticado("sesion-revocada", "Tu sesión se cerró. Ingresa de nuevo.");
        documento.Reautenticar(ahora);
        sesion.Store(documento);
        RegistroDeIngresos.Agregar(sesion, RegistroDeIngresos.Crear(EventoDeIngreso.ReautenticacionExitosa, true, cliente, ahora, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo,
            cuenta.Cuenta.SujetoId, cuenta.Correo, actual.Metodo, sesionId: actual.Id, detalle: "Código del correo"));
        await sesion.SaveChangesAsync(ct);
        return new ReautenticacionDto(ahora + SesionDeUsuario.VentanaDeReautenticacion, (int)SesionDeUsuario.VentanaDeReautenticacion.TotalMinutes);
    }

    private static void AsegurarConfirmacionConCodigo(CuentaResuelta cuenta)
    {
        if (cuenta.ExigePasskey)
            throw ReglaDeNegocioException.Prohibido("reautenticacion-solo-con-passkey", "Tu cuenta confirma las acciones sensibles solo con una passkey.");
    }

    // ---------- códigos de recuperación ----------

    public async Task<EstadoDeRecuperacionDto> EstadoDeRecuperacionAsync(CuentaResuelta cuenta, CancellationToken ct)
    {
        await using var consulta = sesiones.ConsultaGlobal();
        var documento = await consulta.LoadAsync<CodigosDeRecuperacion>(CodigosDeRecuperacion.IdDe(cuenta.Cuenta), ct);
        return new EstadoDeRecuperacionDto(documento?.Disponibles ?? 0, CodigosDeRecuperacion.Cantidad, documento?.GeneradosEn);
    }

    /// <summary>
    /// Genera un juego nuevo de códigos de recuperación (los anteriores dejan de valer) y los devuelve <b>una sola vez</b>. Solo para cuentas con al menos una
    /// passkey: es su respaldo. 409 <c>sin-passkey</c>. Quien llama exige antes la reautenticación.
    /// </summary>
    public async Task<CodigosDeRecuperacionDto> GenerarCodigosDeRecuperacionAsync(CuentaResuelta cuenta, ContextoDeCliente cliente, IMessageBus mensajes, CancellationToken ct)
    {
        if ((await cuentas.PasskeysAsync(cuenta.Cuenta, ct)).Count == 0)
            throw ReglaDeNegocioException.Conflicto("sin-passkey", "Los códigos de recuperación respaldan tu passkey: registra una primero.");

        var ahora = reloj.GetUtcNow();
        var (documento, claros) = CodigosDeRecuperacion.Generar(cuenta.Cuenta, ahora);
        await using var sesion = sesiones.Global();
        _ = await sesion.LoadAsync<CodigosDeRecuperacion>(documento.Id, ct); // para que la concurrencia optimista vea la versión que reemplaza
        sesion.Store(documento);
        RegistroDeIngresos.Agregar(sesion, RegistroDeIngresos.Crear(EventoDeIngreso.CodigosDeRecuperacionGenerados, true, cliente, ahora, cuenta.Cuenta.TenantId,
            cuenta.Cuenta.Tipo, cuenta.Cuenta.SujetoId, cuenta.Correo));
        await sesion.SaveChangesAsync(ct);
        await AvisosDeSeguridad.CodigosGeneradosAsync(mensajes, cuenta, cliente, ahora);
        return new CodigosDeRecuperacionDto(claros, ahora);
    }

    /// <summary>
    /// Con el código del correo ya verificado y la cuenta elegida, usa un código de recuperación en lugar de la passkey que se perdió: el código se gasta y sigue el
    /// registro de una passkey nueva (<c>RegistrarPasskey</c>), que abre la sesión. 422 <c>codigo-de-recuperacion-invalido</c> (con <c>intentosRestantes</c>); 429
    /// <c>recuperacion-bloqueada</c>.
    /// </summary>
    public async Task<PasoDeIngresoDto> UsarCodigoDeRecuperacionAsync(UsarCodigoDeRecuperacionDto dto, ContextoDeCliente cliente, IMessageBus mensajes, CancellationToken ct)
    {
        var ahora = reloj.GetUtcNow();
        await using var sesion = sesiones.Global();
        var desafio = await CargarAsync(sesion, dto.Desafio, ct);
        desafio.AsegurarEtapa(EtapaDeIngreso.CodigoVerificado, ahora);
        var cuenta = desafio.Cuenta is null || desafio.EsReautenticacion ? null : await cuentas.CargarAsync(desafio.Cuenta, ct);
        if (cuenta is null)
            throw ReglaDeNegocioException.Expirado("desafio-usado", "Este ingreso no espera un código de recuperación. Empieza de nuevo.");
        desafio.AsegurarRecuperacionDisponible();

        var documento = await sesion.LoadAsync<CodigosDeRecuperacion>(CodigosDeRecuperacion.IdDe(cuenta.Cuenta), ct);
        if (documento is null || !documento.Consumir(dto.Codigo, ahora))
        {
            desafio.ContarFalloDeRecuperacion();
            sesion.Store(desafio);
            await sesion.SaveChangesAsync(ct);
            await registro.RegistrarAsync(EventoDeIngreso.IngresoFallido, false, cliente, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo, cuenta.Cuenta.SujetoId, cuenta.Correo,
                motivo: "recuperacion-incorrecta", ct: ct);
            var quedan = Math.Max(0, DesafioDeIngreso.IntentosMaximos - desafio.IntentosDeRecuperacion);
            throw new ReglaDeNegocioException(TipoFalla.Validacion, "codigo-de-recuperacion-invalido", $"Ese código de recuperación no es válido o ya se usó. Te quedan {Plural.Intentos(quedan)}.")
            {
                Datos = new Dictionary<string, object?> { ["intentosRestantes"] = quedan }
            };
        }

        sesion.Store(documento);
        var opciones = passkeys.OpcionesDeRegistro(ManejadorDe(cuenta.Cuenta), cuenta.Correo, cuenta.Nombre, []);
        desafio.GuardarOpciones(opciones, ahora);
        sesion.Store(desafio);
        RegistroDeIngresos.Agregar(sesion, RegistroDeIngresos.Crear(EventoDeIngreso.CodigoDeRecuperacionUsado, true, cliente, ahora, cuenta.Cuenta.TenantId, cuenta.Cuenta.Tipo,
            cuenta.Cuenta.SujetoId, cuenta.Correo, detalle: $"Quedan {documento.Disponibles}"));
        try
        {
            await sesion.SaveChangesAsync(ct);
        }
        catch (Exception e) when (Peticiones.EsCarrera(e))
        {
            // Dos usos simultáneos del mismo código: solo gana uno.
            throw ReglaDeNegocioException.Validacion("codigo-de-recuperacion-invalido", "Ese código de recuperación ya se usó.");
        }

        await AvisosDeSeguridad.RecuperacionUsadaAsync(mensajes, cuenta, documento.Disponibles, cliente, ahora);
        return new PasoDeIngresoDto("RegistrarPasskey", desafio.Id, Opciones: MapeosDeIngreso.AJson(opciones));
    }
}
