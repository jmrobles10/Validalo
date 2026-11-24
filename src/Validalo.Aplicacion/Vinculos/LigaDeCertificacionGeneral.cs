using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Terceros;

namespace Validalo.Aplicacion.Vinculos;

/// <summary>
/// Una certificación bancaria general (sin cuenta) acaba de leerse con IA: si el número que trae es el de una sola cuenta activa del tercero que aún no tiene certificación, se liga
/// a ella (CB-8). Lo publica el análisis de la IA cuando registra la lectura; el manejador es idempotente.
/// </summary>
public sealed record LigarCertificacionGeneralPorNumero(Guid DocumentoId);

public static class LigarCertificacionGeneralPorNumeroHandler
{
    public static Task Handle(LigarCertificacionGeneralPorNumero mensaje, ISesiones sesiones, IProtectorDeSecretos protector, TimeProvider reloj, CancellationToken ct) =>
        LigaDeCertificacionGeneral.IntentarAsync(sesiones, protector, mensaje.DocumentoId, reloj.GetUtcNow(), ct);
}

/// <summary>Cómo terminó el intento de ligar una certificación general a su cuenta.</summary>
public enum ResultadoDeLigaGeneral
{
    /// <summary>Quedó ligada a su cuenta.</summary>
    Ligada,

    /// <summary>El documento ya es de una cuenta (o dejó de ser candidato): no hay nada que hacer.</summary>
    NoAplica,

    /// <summary>La certificación no tiene una lectura de IA con número de cuenta.</summary>
    SinNumero,

    /// <summary>Ninguna cuenta activa del tercero tiene ese número.</summary>
    SinCoincidencia,

    /// <summary>El número es de varias cuentas activas: no se adivina.</summary>
    Ambigua,

    /// <summary>La cuenta con ese número ya tiene su certificación: no se pisa.</summary>
    YaTienePropia
}

/// <summary>
/// Liga la certificación bancaria general (sin cuenta) del tercero a su cuenta por el número que la IA leyó (CB-8, 2026-11-24). Complementa la migración de CB-7 (que solo ligaba con
/// <b>una</b> cuenta activa, sin mirar el documento): aquí el número decide, así que sirve con varias cuentas. La regla es <see cref="LigaDeCertificacionPorNumero"/>; esto la aplica:
/// <list type="bullet">
/// <item>compara contra el número de cada cuenta activa (se descifra con el protector solo en memoria, y se normaliza a dígitos sin ceros a la izquierda, como el cruce);</item>
/// <item>liga con <see cref="Documento.LigarACuenta"/> (evento <see cref="DocumentoLigadoACuenta"/>): el documento conserva sus versiones y las comparticiones, así que la empresa
/// que ya la recibió por el requisito sigue viéndola y cubriendo ese requisito (<c>RequisitosDeExpediente.Cubre</c> mira lo compartido con el vínculo, sea o no de una cuenta);</item>
/// <item>es idempotente: lo que ya es de una cuenta no es candidato, y repetirlo no cambia nada. Con el stream bloqueado la decisión se toma con las cuentas y certificaciones de ese
/// momento; si otra escritura se cruza (alguien sube la certificación de esa cuenta), se vuelve a decidir y la propia manda.</item>
/// </list>
/// </summary>
public static class LigaDeCertificacionGeneral
{
    /// <summary>Quién figura como autor de los eventos (bitácora): es el sistema, no una persona.</summary>
    public const string Actor = "liga-certificacion-por-numero";

    public static Task<ResultadoDeLigaGeneral> IntentarAsync(ISesiones sesiones, IProtectorDeSecretos protector, Guid documentoId, DateTimeOffset ahora, CancellationToken ct) =>
        Peticiones.ConReintentosAsync(() => IntentarUnaVezAsync(sesiones, protector, documentoId, ahora, ct));

    private static async Task<ResultadoDeLigaGeneral> IntentarUnaVezAsync(ISesiones sesiones, IProtectorDeSecretos protector, Guid documentoId, DateTimeOffset ahora, CancellationToken ct)
    {
        // Camino corto, sin bloquear nada: casi toda lectura de IA es de otro documento.
        await using (var consulta = sesiones.ConsultaBoveda())
        {
            var visto = await consulta.LoadAsync<Documento>(documentoId, ct);
            if (visto is null || !LigaDeCertificacionPorNumero.EsCandidata(visto))
                return ResultadoDeLigaGeneral.NoAplica;
            if (LigaDeCertificacionPorNumero.NumeroLeido(visto) is null)
                return ResultadoDeLigaGeneral.SinNumero;
        }

        await using var sesion = sesiones.Boveda();
        sesion.SetHeader("actorTipo", ActorTipo.Sistema.ToString());
        sesion.SetHeader("actorId", Actor);
        var stream = await sesion.Events.FetchForExclusiveWriting<Documento>(documentoId, ct);
        if (stream.Aggregate is not { } documento || !LigaDeCertificacionPorNumero.EsCandidata(documento))
            return ResultadoDeLigaGeneral.NoAplica;

        var numero = LigaDeCertificacionPorNumero.NumeroLeido(documento);
        var terceroId = documento.TerceroId;
        var cuentas = await sesion.Query<CuentaBancaria>().Where(c => c.TerceroId == terceroId && c.Estado == EstadoCuentaBancaria.Activa).ToListAsync(ct);
        var conCertificacion = (await CertificacionesDeCuentas.DelTerceroAsync(sesion, terceroId, ct)).Keys.ToHashSet();
        var decision = LigaDeCertificacionPorNumero.Decidir(numero,
            cuentas.Select(c => new CuentaParaLigar(c.Id, CertificacionesDeCuentas.NumeroParaCotejar(() => protector.Desproteger(c.NumeroProtegido)), conCertificacion.Contains(c.Id))));

        switch (decision.Resultado)
        {
            case ResultadoDeLiga.SinNumero:
                return ResultadoDeLigaGeneral.SinNumero;
            case ResultadoDeLiga.SinCoincidencia:
                return ResultadoDeLigaGeneral.SinCoincidencia;
            case ResultadoDeLiga.Ambigua:
                return ResultadoDeLigaGeneral.Ambigua;
            case ResultadoDeLiga.YaTienePropia:
                return ResultadoDeLigaGeneral.YaTienePropia;
        }

        var cuenta = cuentas.Single(c => c.Id == decision.CuentaId);
        var nombreDelTipo = CatalogoCanonico.Requerido(CatalogoCanonico.CertificacionBancaria).Nombre;
        if (documento.LigarACuenta(cuenta.Id, Documento.NombreDeCertificacion(nombreDelTipo, cuenta.Banco, cuenta.NumeroEnmascarado), ahora) is not { } evento)
            return ResultadoDeLigaGeneral.NoAplica;

        stream.AppendOne(evento);
        await sesion.SaveChangesAsync(ct);
        return ResultadoDeLigaGeneral.Ligada;
    }
}
