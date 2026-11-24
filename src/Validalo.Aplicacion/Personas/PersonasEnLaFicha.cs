using Marten;
using Validalo.Aplicacion.Comun;
using Validalo.Aplicacion.Ficha;
using Validalo.Contratos;
using Validalo.Dominio.Comun;
using Validalo.Dominio.Documentos;
using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identidad;
using Validalo.Dominio.Terceros;
using Wolverine;

namespace Validalo.Aplicacion.Personas;

/// <summary>
/// La ficha legal es el único lugar donde se registran los representantes legales, suplentes y socios (decisión de Producto del 2026-11-24, ADR-0010): «Personas relacionadas» es
/// una vista. Por eso lo que el tercero <b>confirma</b> de una propuesta de la IA (lo que leyó en la Cámara de comercio) no se queda solo en la relación: además se escribe en la
/// sección <c>FICHA_LEGAL</c> como una versión nueva, y la relación sale <c>DeFicha</c>.
/// </summary>
public static class PersonasEnLaFicha
{
    /// <summary>
    /// Confirma, en la sesión abierta y sin guardar, una propuesta de la IA para un tipo que la ficha maneja: escribe una versión nueva de la sección legal con la persona (agregada o
    /// actualizada solo en lo que la propuesta trae) y sin los <paramref name="salientes"/> (la principal a la que reemplaza), y concilia las relaciones con esa versión con la misma
    /// cuenta de la sincronización de la ficha. Todo va en la transacción del llamador: o quedan la versión de la ficha y las relaciones, o ninguna. La sincronización que la versión
    /// publica después ya no encuentra diferencias, así que no repite eventos. Devuelve si la ficha tuvo una versión nueva (entonces ya quedaron en el outbox los avisos a los
    /// vínculos, a las listas restrictivas y a los cruces).
    /// </summary>
    /// <remarks>
    /// Idempotente: si la persona ya figura en la ficha tal cual la propuesta, no hay versión nueva; confirmar dos veces no hace nada la segunda (la relación ya está vigente y quien
    /// llama no entra aquí). Origen y autor de la versión: el tercero que confirma (<see cref="OrigenDeSeccion.Tercero"/>, su id), con la Cámara de comercio de la propuesta como
    /// soporte si todavía sirve, igual que si la hubiera agregado a mano en el formulario. El formato de la sección sigue siendo el de siempre: si la ficha no lo admite, es 422.
    /// </remarks>
    internal static async Task<bool> ConfirmarAsync(IDocumentSession escritura, ISesiones sesiones, IMessageBus mensajes, Tercero tercero, RelacionEntreTerceros propuesta,
        RelacionConfirmada confirmada, IReadOnlyList<RelacionEntreTerceros> delTercero, IReadOnlyList<RelacionEntreTerceros> salientes, DateOnly hoy, DateTimeOffset ahora,
        CancellationToken ct)
    {
        var definicion = CatalogoDeSecciones.Requerida(CodigosDeSeccion.Legal);
        var autor = tercero.Id.ToString();
        var personaIds = salientes.Select(s => s.OrigenId).Append(propuesta.OrigenId).Distinct().ToArray();
        var personas = (await escritura.LoadManyAsync<Tercero>(ct, personaIds)).ToDictionary(p => p.Id);
        var persona = personas.GetValueOrDefault(propuesta.OrigenId)
                      ?? throw ReglaDeNegocioException.NoEncontrado("persona-no-encontrada", "Esa persona no está relacionada con tu información.");

        var actual = await escritura.LoadAsync<SeccionDeFicha>(SeccionDeFicha.IdPara(tercero.Id, definicion.Codigo, null), ct);
        var vigentes = actual?.Vigente is { } version ? JsonDeFicha.Deserializar<DatosLegales>(version.Datos) : null;
        var quitar = salientes.Where(s => personas.ContainsKey(s.OrigenId)).Select(s => (s.Tipo, personas[s.OrigenId].Identificacion.Clave));
        var declarada = new PersonaDeclarada(persona.Identificacion, persona.Nombre, propuesta.Tipo, propuesta.Principal, propuesta.Participacion, propuesta.Cargo);
        var nuevos = PersonasDeLaFicha.ConPersona(PersonasDeLaFicha.SinPersonas(vigentes, quitar, tercero.Identificacion), declarada, tercero.Identificacion);

        // Lo que la propuesta no trae (PEP, apellidos…) queda como faltante de la sección: el tercero lo completa en su ficha, no se inventa ni se bloquea la confirmación.
        var soportes = await SoportesAsync(escritura, actual, propuesta, definicion, ct);
        var (resultado, datos) = await RegistrarVersionAsync(escritura, sesiones, mensajes, tercero, definicion, nuevos, soportes, autor, (ActorTipo.Tercero.ToString(), autor), hoy, ahora, ct);

        var (_, cambios) = await SincronizacionDePersonas.ConciliarEnSesionAsync(escritura, tercero, datos, FuenteDeRelacion.Declarada, delTercero, hoy, ahora, ct);
        var tocadas = cambios.Select(c => c.RelacionId).ToHashSet();
        // La ficha confirma sola la propuesta que declara (vigente y DeFicha); si por algún motivo no la declara, se confirma como siempre.
        if (!tocadas.Contains(propuesta.Id))
            (await escritura.Events.FetchForWriting<RelacionEntreTerceros>(propuesta.Id, ct)).AppendOne(confirmada);
        // Las salientes que mantiene la ficha ya terminaron con ella (salieron de la sección); las que el tercero declaró a mano salen como siempre.
        await PersonasRelacionadasEndpoints.TerminarSalientesAsync(escritura, salientes.Where(s => !tocadas.Contains(s.Id) && !s.DeFicha), hoy,
            "Reemplazada por la persona que el tercero confirmó.", autor, ahora, ct);
        return resultado.Creada;
    }

    /// <summary>
    /// Escribe en la sección legal, en la sesión abierta y sin guardar, a las personas que el tercero declaró a mano antes de que la ficha fuera el único lugar donde se registran
    /// (relaciones vigentes de un tipo que la ficha maneja con <see cref="RelacionEntreTerceros.DeFicha"/> en falso): una sola versión nueva con todas ellas
    /// (<see cref="AdopcionDePersonasEnLaFicha"/>) y, enseguida, concilia las relaciones con la misma cuenta de la sincronización de la ficha para que queden de la ficha sin repetir
    /// eventos. Si todas ya figuran en la ficha no hay versión nueva: solo se adoptan las relaciones. Con cambios sin versión nueva, deja en el outbox los avisos a los vínculos y a las
    /// listas restrictivas (con la versión nueva ya salieron con ella). Todo va en la transacción del llamador. Idempotente: sin relaciones pendientes no hace nada.
    /// </summary>
    /// <remarks>
    /// Origen de la versión: <see cref="OrigenDeSeccion.Tercero"/>, igual que cuando el tercero confirma lo que leyó la IA: son personas que él declaró y la regla del soporte del
    /// cambio sigue siendo la de siempre. El modelo no tiene un origen «migración» (<see cref="OrigenDeSeccion"/> solo distingue al tercero, a un importador y a un sistema de origen,
    /// y los dos últimos significan otra cosa: el importador acepta solo lo importado en nombre de las empresas); lo que marca la migración es el <paramref name="autor"/> de la versión y
    /// el actor de los eventos.
    /// </remarks>
    internal static async Task<ResultadoDeAdopcion> AdoptarAsync(IDocumentSession escritura, ISesiones sesiones, IMessageBus mensajes, Tercero tercero,
        IReadOnlyList<RelacionEntreTerceros> delTercero, string autor, (string Tipo, string Id) actor, DateOnly hoy, DateTimeOffset ahora, CancellationToken ct)
    {
        var pendientes = RelacionesDeTercero.Vigentes(delTercero, hoy).Where(r => !r.DeFicha && PersonasDeLaFicha.LaFichaManeja(r.Tipo)).ToList();
        if (pendientes.Count == 0)
            return ResultadoDeAdopcion.Nada;

        var personas = (await escritura.LoadManyAsync<Tercero>(ct, pendientes.Select(r => r.OrigenId).Distinct().ToArray())).ToDictionary(p => p.Id);
        var declaradas = pendientes.Where(r => personas.ContainsKey(r.OrigenId))
            .Select(r => new PersonaDeclarada(personas[r.OrigenId].Identificacion, personas[r.OrigenId].Nombre, r.Tipo, r.Principal, r.Participacion, r.Cargo))
            .ToList();

        var definicion = CatalogoDeSecciones.Requerida(CodigosDeSeccion.Legal);
        var actual = await escritura.LoadAsync<SeccionDeFicha>(SeccionDeFicha.IdPara(tercero.Id, definicion.Codigo, null), ct);
        var vigentes = actual?.Vigente is { } version ? JsonDeFicha.Deserializar<DatosLegales>(version.Datos) : null;
        var adoptadas = AdopcionDePersonasEnLaFicha.Escribir(vigentes, declaradas, tercero.Identificacion);

        // Sin nada que escribir (todas ya figuran o ninguna cabe) no se pasa por el guardado: no hay versión nueva ni se normaliza lo que ya estaba.
        var versionNueva = false;
        var datos = vigentes;
        if (adoptadas.HuboCambios)
        {
            var (resultado, normalizados) = await RegistrarVersionAsync(escritura, sesiones, mensajes, tercero, definicion, adoptadas.Datos, [.. actual?.Vigente?.Soportes ?? []], autor, actor,
                hoy, ahora, ct);
            versionNueva = resultado.Creada;
            datos = normalizados;
        }

        var (_, cambios) = await SincronizacionDePersonas.ConciliarEnSesionAsync(escritura, tercero, datos, FuenteDeRelacion.Declarada, delTercero, hoy, ahora, ct);
        if (!versionNueva && cambios.Count > 0)
        {
            await GuardadoDeSecciones.PedirSincronizacionAsync(escritura, tercero.Id, mensajes, actor.Tipo, actor.Id, ct);
            await mensajes.PublishAsync(new Verificaciones.PersonasDeFichaCambiaron(tercero.Id));
        }

        var tocadas = cambios.Select(c => c.RelacionId).ToHashSet();
        return new ResultadoDeAdopcion(pendientes.Count, adoptadas.Escritas.Count, pendientes.Count(r => tocadas.Contains(r.Id)), versionNueva, cambios.Count > 0 || versionNueva,
            [.. pendientes.Where(r => !tocadas.Contains(r.Id)).Select(r => r.Id)]);
    }

    /// <summary>
    /// La versión de la sección legal con los datos dados (normalizados con el contexto del tercero) en la sesión abierta y sin guardar, con el mismo guardado de la ficha: agrega la
    /// versión si la huella cambió y publica lo que sigue en el outbox. Devuelve el resultado y los datos ya normalizados, que son los que concilian las relaciones.
    /// </summary>
    private static async Task<(GuardadoDeSecciones.Resultado Resultado, DatosLegales Datos)> RegistrarVersionAsync(IDocumentSession escritura, ISesiones sesiones, IMessageBus mensajes,
        Tercero tercero, DefinicionDeSeccion definicion, DatosLegales nuevos, IReadOnlyList<SoporteDeSeccion> soportes, string autor, (string Tipo, string Id) actor, DateOnly hoy,
        DateTimeOffset ahora, CancellationToken ct)
    {
        var contexto = new ContextoDeSeccion(tercero.TipoPersona, tercero.Identificacion, null, hoy);
        var datos = (DatosLegales)definicion.Esquema.Normalizar(nuevos, contexto);
        ICatalogosDeFicha catalogos;
        await using (var global = sesiones.ConsultaGlobal())
            catalogos = await ImportacionDeCatalogos.CargarAsync(global, definicion.Esquema.Referencias(datos), ct);

        var resultado = await GuardadoDeSecciones.RegistrarEnSesionAsync(escritura, tercero, definicion, null, datos, soportes, contexto, catalogos, OrigenDeSeccion.Tercero, autor, ahora, ct,
            mensajes, actor);
        return (resultado, datos);
    }

    /// <summary>
    /// Los soportes de la versión: los de la vigente y la Cámara de comercio (versión del documento) que sustenta la propuesta, si todavía es un soporte válido de la sección (de la bóveda
    /// del tercero, de un tipo que la respalda y en un estado utilizable). Si ya no sirve, la versión sale sin ese soporte en vez de fallar la confirmación.
    /// </summary>
    private static async Task<IReadOnlyList<SoporteDeSeccion>> SoportesAsync(IDocumentSession escritura, SeccionDeFicha? actual, RelacionEntreTerceros propuesta,
        DefinicionDeSeccion definicion, CancellationToken ct)
    {
        List<SoporteDeSeccion> soportes = [.. actual?.Vigente?.Soportes ?? []];
        if (propuesta.DocumentoId is not { } documentoId || propuesta.VersionDelDocumento is not { } numero || soportes.Count >= GuardadoDeSecciones.MaximoSoportes ||
            soportes.Any(s => s.DocumentoId == documentoId && s.Version == numero))
            return soportes;

        try
        {
            soportes.AddRange(await GuardadoDeSecciones.VerificarSoportesAsync(escritura, propuesta.DestinoId, definicion, [new SoporteSeccionDto(documentoId, numero)], ct));
        }
        catch (ReglaDeNegocioException)
        {
            // El documento ya no es un soporte utilizable (otro dueño, otro tipo o una versión retirada): la versión queda sin él.
        }

        return soportes;
    }
}

/// <summary>
/// Lo que hizo <see cref="PersonasEnLaFicha.AdoptarAsync"/> con las personas declaradas a mano de un tercero: cuántas relaciones tenía pendientes, cuántas personas se escribieron en la
/// ficha, cuántas relaciones pasaron a ser de la ficha y cuáles quedaron como estaban (la ficha no pudo leer a la persona o la persona ya no existe).
/// </summary>
internal sealed record ResultadoDeAdopcion(int Pendientes, int PersonasEscritas, int RelacionesAdoptadas, bool VersionNueva, bool HayQueGuardar, IReadOnlyList<Guid> SinMigrar)
{
    public static readonly ResultadoDeAdopcion Nada = new(0, 0, 0, false, false, []);
}
