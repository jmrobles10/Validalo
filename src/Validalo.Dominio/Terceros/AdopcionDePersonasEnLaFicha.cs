using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identificaciones;

namespace Validalo.Dominio.Terceros;

/// <summary>
/// Lo que queda de la sección legal al escribir en ella a las personas que el tercero había declarado a mano: los datos nuevos, las personas que se agregaron (o completaron) y las que
/// la sección no puede leer con su identificación, que quedan como estaban.
/// </summary>
public sealed record PersonasAdoptadasEnLaFicha(DatosLegales Datos, IReadOnlyList<PersonaDeclarada> Escritas, IReadOnlyList<PersonaDeclarada> SinLugar)
{
    /// <summary>¿La sección cambió? Si no, no hay versión nueva que escribir.</summary>
    public bool HuboCambios => Escritas.Count > 0;
}

/// <summary>
/// Escribe en la sección legal a las personas que el tercero declaró a mano en «Personas relacionadas» antes de que la ficha fuera el único lugar donde se registran (decisión de
/// Producto del 2026-11-24, ADR-0010). Reglas, todas en favor de lo que la ficha ya dice (la ficha manda; lo declarado a mano solo se suma):
/// <list type="bullet">
/// <item>la persona que <b>ya figura</b> con ese rol (misma identificación normalizada) no se toca: ni su cargo, ni su participación, ni su representación;</item>
/// <item>una persona nueva se agrega con <see cref="PersonasDeLaFicha.ConPersona"/> (el nombre completo en <c>Nombres</c>; lo demás queda por completar en la sección);</item>
/// <item>la representación «Principal» de un representante legal solo se marca si la ficha <b>no tiene ningún representante legal</b>: lo que ya figura no se desplaza, y entre varios a
/// migrar solo el primero (los principales van antes) queda como principal;</item>
/// <item>la persona que la sección no lee con la identificación que tiene como tercero (la ficha toma el país de un pasaporte o de una identificación fiscal genérica de la
/// nacionalidad y, sin ella, del tercero) se escribe con esa nacionalidad; si aun así no la lee, no se escribe y queda en <see cref="PersonasAdoptadasEnLaFicha.SinLugar"/> (agregarla
/// dejaría una fila que la sincronización no reconoce y se repetiría en cada pasada);</item>
/// <item>los tipos que la ficha no maneja (<see cref="PersonasDeLaFicha.LaFichaManeja"/>) se ignoran.</item>
/// </list>
/// Idempotente: repetirla sobre el resultado no cambia nada. Función pura.
/// </summary>
public static class AdopcionDePersonasEnLaFicha
{
    /// <param name="legal">La sección legal vigente (nula si no tiene).</param>
    /// <param name="declaradasAMano">Las personas con su relación vigente declarada a mano, en el orden en que se escriben (la principal de cada tipo primero).</param>
    /// <param name="delTercero">La identificación del tercero dueño de la ficha.</param>
    public static PersonasAdoptadasEnLaFicha Escribir(DatosLegales? legal, IEnumerable<PersonaDeclarada> declaradasAMano, Identificacion delTercero)
    {
        var datos = legal ?? new DatosLegales();
        var escritas = new List<PersonaDeclarada>();
        var sinLugar = new List<PersonaDeclarada>();
        foreach (var persona in declaradasAMano.Where(p => PersonasDeLaFicha.LaFichaManeja(p.Tipo)))
        {
            if (Figura(datos, persona, delTercero))
                continue; // la ficha ya la tiene: se queda como está y la sincronización la adopta

            var rol = PersonasDeLaFicha.RolDe(persona.Tipo);
            var principal = persona.Principal && rol == RolPersonaRelacionada.RepresentanteLegal && !(datos.Personas ?? []).Any(f => f.Rol == rol);
            var candidata = PersonasDeLaFicha.ConPersona(datos, persona with { Principal = principal }, delTercero);
            if (!Figura(candidata, persona, delTercero) && ConNacionalidad(candidata, persona) is { } conNacionalidad && Figura(conNacionalidad, persona, delTercero))
                candidata = conNacionalidad;
            if (!Figura(candidata, persona, delTercero))
            {
                sinLugar.Add(persona);
                continue;
            }

            datos = candidata;
            escritas.Add(persona);
        }

        return new PersonasAdoptadasEnLaFicha(datos, escritas, sinLugar);
    }

    /// <summary>¿La sección ya la tiene con ese rol y esa identificación, tal como la lee la sincronización de las relaciones?</summary>
    private static bool Figura(DatosLegales datos, PersonaDeclarada persona, Identificacion delTercero) =>
        PersonasDeLaFicha.Leer(datos, delTercero).Any(p => p.Tipo == persona.Tipo && p.Clave == persona.Clave);

    /// <summary>La sección con la fila de la persona marcada con la nacionalidad de su identificación; nulo si la fila no está o ya tiene una nacionalidad.</summary>
    private static DatosLegales? ConNacionalidad(DatosLegales datos, PersonaDeclarada persona)
    {
        var rol = PersonasDeLaFicha.RolDe(persona.Tipo);
        var filas = (datos.Personas ?? []).ToList();
        var indice = filas.FindIndex(f => f.Rol == rol && f.Numero == persona.Identificacion.Numero &&
                                          string.Equals(f.TipoIdentificacion, persona.Identificacion.Tipo, StringComparison.OrdinalIgnoreCase));
        if (indice < 0 || !string.IsNullOrWhiteSpace(filas[indice].Nacionalidad))
            return null;
        filas[indice] = filas[indice] with { Nacionalidad = persona.Identificacion.Pais };
        return datos with { Personas = filas };
    }
}
