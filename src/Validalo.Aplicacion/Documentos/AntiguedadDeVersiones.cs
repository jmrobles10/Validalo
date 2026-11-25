using Marten;
using Validalo.Aplicacion.Ia;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ia;

namespace Validalo.Aplicacion.Documentos;

/// <summary>
/// Evalúa la antigüedad máxima al subir (TD-10) de una versión de la bóveda con la regla del tipo del tenant: junta lo que se sabe de la versión (la fecha de
/// carga, lo que leyó la IA y lo que declaró el tercero) y deja la decisión a <see cref="AntiguedadDelDocumento"/>. Es un hecho que se calcula al leer (la regla
/// es de cada empresa y puede cambiar): no se guarda en el stream del documento.
/// </summary>
public static class AntiguedadDeVersiones
{
    /// <summary>
    /// Nulo si el tipo no exige antigüedad. <paramref name="conLecturaDeIa"/>: quien consulta puede usar el análisis de IA de la versión (la empresa que lo
    /// consumió; el tercero, siempre, porque es su propio documento). La fecha que sale de ahí manda; la declarada solo cuenta en un tipo que no se lee.
    /// </summary>
    public static ResultadoDeAntiguedad? Evaluar(TipoDocumentoTenant tipo, VersionDocumento version, bool conLecturaDeIa)
    {
        if (tipo.Frescura.AntiguedadMaximaDias is not { } maximo)
            return null;

        var analisis = conLecturaDeIa ? version.Ia : null;
        var cargada = CalculadoraDeVigencia.Fecha(version.CargadaEn);
        var declarada = EsquemaDeFormulario.Fecha(version.Datos, EsquemaDeFormulario.FechaExpedicion);
        var leida = analisis is null ? null : AntiguedadDelDocumento.FechaLeida(analisis.Campos);
        var tipoSeLee = version.Clase == ClaseDocumento.Archivo && EsquemasDeAnalisis.Para(tipo.TipoCanonico) is not null;
        return AntiguedadDelDocumento.Evaluar(maximo, cargada, analisis is not null, leida, declarada, tipoSeLee);
    }

    /// <summary>
    /// Las versiones del tercero cuyo análisis de IA la empresa consumió (<see cref="ValidacionIaConsumida"/>), de entre las de los documentos indicados: con
    /// ellas la empresa ve lo que leyó la IA (IA-3). Va con la sesión del tenant de la empresa.
    /// </summary>
    public static async Task<IReadOnlySet<(Guid DocumentoId, int Numero)>> ConsumidasAsync(IQuerySession consulta, Guid empresaId, IReadOnlyCollection<Guid> documentoIds,
        CancellationToken ct)
    {
        if (documentoIds.Count == 0)
            return new HashSet<(Guid, int)>();
        var ids = documentoIds.ToArray();
        return (await consulta.Query<ValidacionIaConsumida>().Where(v => v.EmpresaId == empresaId && v.DocumentoId.IsOneOf(ids)).ToListAsync(ct))
            .Select(v => (v.DocumentoId, v.Numero)).ToHashSet();
    }
}
