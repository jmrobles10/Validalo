using Validalo.Dominio.Ficha;

namespace Validalo.Dominio.Documentos;

/// <summary>
/// Una cuenta activa del tercero tal como la mira la liga de la certificación general (CB-8): su número en claro (solo en memoria; nulo si no se pudo descifrar, y entonces no
/// participa) y si ya tiene su propia certificación.
/// </summary>
public sealed record CuentaParaLigar(Guid CuentaId, string? Numero, bool TieneCertificacionPropia);

/// <summary>Qué se decidió con la certificación general frente a las cuentas del tercero.</summary>
public enum ResultadoDeLiga
{
    /// <summary>El número coincide con una sola cuenta activa sin certificación propia: se liga a ella.</summary>
    Ligar,

    /// <summary>La certificación no trae un número de cuenta utilizable.</summary>
    SinNumero,

    /// <summary>Ninguna cuenta activa del tercero tiene ese número.</summary>
    SinCoincidencia,

    /// <summary>El número coincide con más de una cuenta activa: no se adivina.</summary>
    Ambigua,

    /// <summary>El número es de una cuenta que ya tiene la suya: no se pisa.</summary>
    YaTienePropia
}

/// <summary>La decisión y, con <see cref="ResultadoDeLiga.Ligar"/>, la cuenta a la que se liga.</summary>
public sealed record DecisionDeLiga(ResultadoDeLiga Resultado, Guid? CuentaId = null);

/// <summary>
/// Liga automática de la certificación bancaria general a su cuenta (CB-8): un tercero sube la certificación desde el requisito del expediente (sin cuenta), la IA la lee y,
/// si el número de cuenta que trae es el de <b>una sola</b> cuenta activa suya que aún no tiene certificación, esa certificación pasa a ser la de la cuenta
/// (<see cref="Documento.LigarACuenta"/>: conserva versiones y comparticiones). Función pura: no toca nada, solo decide. Con dos coincidencias, o con una cuenta que ya tiene la
/// suya, no adivina.
/// </summary>
public static class LigaDeCertificacionPorNumero
{
    /// <summary>Un número de cuenta real tiene 6 dígitos o más (el mismo mínimo con que se registra una cuenta): menos no identifica nada.</summary>
    public const int MinimoDeDigitos = 6;

    /// <summary>Solo los dígitos y sin ceros a la izquierda, como compara el cruce (<see cref="CruceConDocumento.CruzarCuenta"/>): «007469997097» y «7469997097» son el mismo.</summary>
    public static string Normalizar(string? numero) => Normalizacion.Identificacion(new string((numero ?? string.Empty).Where(char.IsDigit).ToArray()));

    /// <summary>
    /// El documento es una certificación bancaria global sin cuenta (la que el tercero sube desde un requisito), no está en cuarentena y su versión actual es la que puede
    /// ligarse. Nada de lo que ya es de una cuenta, ni de otro tipo, ni de una empresa, se liga.
    /// </summary>
    public static bool EsCandidata(Documento documento) =>
        documento is { Ambito: AmbitoDocumento.Global, CuentaBancariaId: null, EnCuarentena: false } &&
        string.Equals(documento.TipoCanonico, CatalogoCanonico.CertificacionBancaria, StringComparison.Ordinal);

    /// <summary>
    /// El número de cuenta que la IA leyó de la versión actual de la certificación, normalizado; nulo si el documento no es candidato, no hay versión actual, la IA no la leyó
    /// con seguridad (sin lectura, fallida o ilegible) o el número no tiene los dígitos de una cuenta.
    /// </summary>
    public static string? NumeroLeido(Documento documento)
    {
        if (!EsCandidata(documento) || documento.VersionActual is not { } actual || documento.Buscar(actual)?.Ia is not { Legible: true } ia)
            return null;
        var numero = Normalizar(LecturaDeHechos.Texto(ia.Campos, "numeroCuenta"));
        return numero.Length >= MinimoDeDigitos ? numero : null;
    }

    /// <summary>
    /// Decide a qué cuenta se liga la certificación cuyo número leído es <paramref name="numeroLeido"/> (ya normalizado, o nulo): entre las cuentas <b>activas</b>, la que tenga ese
    /// número, si es una sola y no tiene certificación propia.
    /// </summary>
    public static DecisionDeLiga Decidir(string? numeroLeido, IEnumerable<CuentaParaLigar> cuentasActivas)
    {
        if (string.IsNullOrEmpty(numeroLeido))
            return new DecisionDeLiga(ResultadoDeLiga.SinNumero);

        var iguales = cuentasActivas.Where(c => c.Numero is not null && Normalizar(c.Numero) == numeroLeido).ToList();
        return iguales.Count switch
        {
            0 => new DecisionDeLiga(ResultadoDeLiga.SinCoincidencia),
            > 1 => new DecisionDeLiga(ResultadoDeLiga.Ambigua),
            _ when iguales[0].TieneCertificacionPropia => new DecisionDeLiga(ResultadoDeLiga.YaTienePropia),
            _ => new DecisionDeLiga(ResultadoDeLiga.Ligar, iguales[0].CuentaId)
        };
    }
}
