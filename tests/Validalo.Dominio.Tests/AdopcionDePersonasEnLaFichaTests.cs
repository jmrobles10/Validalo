using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identificaciones;
using Validalo.Dominio.Terceros;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La migración de las personas declaradas a mano antes de que la ficha legal fuera el único lugar donde se registran (decisión de Producto del 2026-11-24, ADR-0010, PR-17): qué
/// queda escrito en la sección (la ficha manda, lo que ya figura no se toca), quién queda como principal y qué pasa con lo que la sección no puede leer.
/// </summary>
public sealed class AdopcionDePersonasEnLaFichaTests
{
    private static readonly Identificacion Empresa = Identificacion.Crear("CO", "NIT", "900123456");

    private static PersonaRelacionada Fila(RolPersonaRelacionada rol, string numero, string nombres, string? representacion = null, string? cargo = null, decimal? porcentaje = null) =>
        new() { Rol = rol, TipoIdentificacion = "CC", Numero = numero, Nombres = nombres, Apellidos = "Prueba", TipoRepresentacion = representacion, Cargo = cargo, Porcentaje = porcentaje,
            Pep = false, VinculoPep = false, Correo = "persona@correo.co" };

    private static PersonaDeclarada Persona(string numero, string nombre, TipoRelacionTerceros tipo, bool principal = false, decimal? participacion = null, string? cargo = null) =>
        new(Identificacion.Crear("CO", "CC", numero), nombre, tipo, principal, participacion, cargo);

    [Fact]
    public void Las_personas_declaradas_a_mano_se_agregan_a_una_ficha_vacia_con_la_principal_del_representante_marcada()
    {
        var resultado = AdopcionDePersonasEnLaFicha.Escribir(null,
            [
                Persona("1000", "Juan Pérez", TipoRelacionTerceros.RepresentanteLegal, principal: true, cargo: "Gerente"),
                Persona("2000", "María Gómez", TipoRelacionTerceros.Suplente),
                Persona("3000", "Pedro Socio", TipoRelacionTerceros.Socio, participacion: 40m)
            ], Empresa);

        resultado.HuboCambios.ShouldBeTrue();
        resultado.Escritas.Count.ShouldBe(3);
        resultado.SinLugar.ShouldBeEmpty();
        var filas = resultado.Datos.Personas!;
        filas.Select(f => (f.Rol, f.Numero, f.Nombres, f.Apellidos)).ShouldBe(
        [
            (RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan Pérez", null),
            (RolPersonaRelacionada.Suplente, "2000", "María Gómez", null),
            (RolPersonaRelacionada.Socio, "3000", "Pedro Socio", null)
        ]);
        (filas[0].TipoRepresentacion, filas[0].Cargo, filas[2].Porcentaje).ShouldBe(("Principal", "Gerente", 40m));

        // Lo que lee la sincronización es lo mismo que lo declarado: el representante es el principal y las relaciones se adoptan sin diferencias.
        var leidas = PersonasDeLaFicha.Leer(resultado.Datos, Empresa);
        leidas.Select(p => (p.Tipo, p.Clave, p.Principal)).ShouldBe(
        [
            (TipoRelacionTerceros.RepresentanteLegal, "CO|CC|1000", true),
            (TipoRelacionTerceros.Suplente, "CO|CC|2000", true),
            (TipoRelacionTerceros.Socio, "CO|CC|3000", true)
        ]);
    }

    [Fact]
    public void La_ficha_manda_la_persona_que_ya_figura_no_se_toca_aunque_lo_declarado_diga_otro_cargo_o_participacion()
    {
        var legal = new DatosLegales
        {
            Personas =
            [
                Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan", "Principal", cargo: "Gerente general"),
                Fila(RolPersonaRelacionada.Socio, "3000", "Pedro", porcentaje: 60m)
            ]
        };

        var resultado = AdopcionDePersonasEnLaFicha.Escribir(legal,
            [
                Persona("1000", "Juan Pérez", TipoRelacionTerceros.RepresentanteLegal, principal: true, cargo: "Otro cargo"),
                Persona("3000", "Pedro Socio", TipoRelacionTerceros.Socio, participacion: 10m)
            ], Empresa);

        resultado.HuboCambios.ShouldBeFalse();
        resultado.Escritas.ShouldBeEmpty();
        resultado.Datos.ShouldBe(legal);
    }

    [Fact]
    public void Un_representante_declarado_a_mano_no_desplaza_al_que_ya_figura_en_la_ficha_y_se_agrega_sin_la_marca_de_principal()
    {
        var legal = new DatosLegales { Personas = [Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan", "Principal")] };

        var resultado = AdopcionDePersonasEnLaFicha.Escribir(legal, [Persona("2000", "Luis Legado", TipoRelacionTerceros.RepresentanteLegal, principal: true)], Empresa);

        resultado.Escritas.Count.ShouldBe(1);
        resultado.Datos.Personas!.Select(f => (f.Numero, f.TipoRepresentacion)).ShouldBe([("1000", "Principal"), ("2000", null)]);
        PersonasDeLaFicha.Leer(resultado.Datos, Empresa).Single(p => p.Principal).Clave.ShouldBe("CO|CC|1000");
    }

    [Fact]
    public void Entre_varios_representantes_a_migrar_solo_el_primero_queda_como_principal_y_lo_que_ya_figuraba_no_cambia()
    {
        var resultado = AdopcionDePersonasEnLaFicha.Escribir(null,
            [
                Persona("1000", "Juan Pérez", TipoRelacionTerceros.RepresentanteLegal, principal: true),
                Persona("2000", "Luis Legado", TipoRelacionTerceros.RepresentanteLegal, principal: true),
                Persona("3000", "Ana Tercera", TipoRelacionTerceros.RepresentanteLegal)
            ], Empresa);

        resultado.Datos.Personas!.Select(f => (f.Numero, f.TipoRepresentacion)).ShouldBe([("1000", "Principal"), ("2000", null), ("3000", null)]);
        PersonasDeLaFicha.Leer(resultado.Datos, Empresa).Where(p => p.Principal).Select(p => p.Clave).ShouldBe(["CO|CC|1000"]);
    }

    [Fact]
    public void Repetirla_sobre_el_resultado_no_cambia_nada()
    {
        var declaradas = new[]
        {
            Persona("1000", "Juan Pérez", TipoRelacionTerceros.RepresentanteLegal, principal: true),
            Persona("2000", "María Gómez", TipoRelacionTerceros.Suplente),
            Persona("3000", "Pedro Socio", TipoRelacionTerceros.Socio, participacion: 40m)
        };
        var primera = AdopcionDePersonasEnLaFicha.Escribir(null, declaradas, Empresa);

        var segunda = AdopcionDePersonasEnLaFicha.Escribir(primera.Datos, declaradas, Empresa);

        segunda.HuboCambios.ShouldBeFalse();
        segunda.Datos.ShouldBe(primera.Datos);
    }

    [Fact]
    public void Lo_que_la_ficha_no_maneja_se_ignora()
    {
        var resultado = AdopcionDePersonasEnLaFicha.Escribir(null,
            [Persona("1000", "Benito Beneficiario", TipoRelacionTerceros.BeneficiarioFinal, participacion: 25m), Persona("2000", "Miguel Miembro", TipoRelacionTerceros.MiembroDe)], Empresa);

        resultado.HuboCambios.ShouldBeFalse();
        resultado.SinLugar.ShouldBeEmpty();
        resultado.Datos.Personas.ShouldBeNull();
    }

    [Fact]
    public void Un_pasaporte_de_otro_pais_se_escribe_con_su_nacionalidad_para_que_la_ficha_lo_lea_igual_que_la_relacion()
    {
        var extranjera = new PersonaDeclarada(Identificacion.Crear("ES", "PASAPORTE", "AB123456"), "Carmen Extranjera", TipoRelacionTerceros.Suplente, false, null, null);

        var resultado = AdopcionDePersonasEnLaFicha.Escribir(null, [extranjera], Empresa);

        resultado.Escritas.ShouldHaveSingleItem();
        var fila = resultado.Datos.Personas!.ShouldHaveSingleItem();
        (fila.TipoIdentificacion, fila.Numero, fila.Nacionalidad).ShouldBe(("PASAPORTE", "AB123456", "ES"));
        PersonasDeLaFicha.Leer(resultado.Datos, Empresa).ShouldHaveSingleItem().Clave.ShouldBe(extranjera.Clave);

        // Con la nacionalidad ya puesta, repetirla no agrega otra fila.
        AdopcionDePersonasEnLaFicha.Escribir(resultado.Datos, [extranjera], Empresa).HuboCambios.ShouldBeFalse();
    }

    [Fact]
    public void La_persona_que_la_ficha_no_puede_leer_ni_con_nacionalidad_queda_sin_lugar_y_la_ficha_no_cambia()
    {
        // Un NIT es de una sociedad: la sección no lo lee como persona natural.
        var sociedad = new PersonaDeclarada(Identificacion.Crear("CO", "NIT", "900999888"), "Inversiones S.A.S.", TipoRelacionTerceros.Socio, false, 50m, null);
        var normal = Persona("1000", "Juan Pérez", TipoRelacionTerceros.RepresentanteLegal, principal: true);

        var resultado = AdopcionDePersonasEnLaFicha.Escribir(null, [sociedad, normal], Empresa);

        resultado.SinLugar.ShouldBe([sociedad]);
        resultado.Escritas.ShouldBe([normal]);
        resultado.Datos.Personas!.Select(f => f.Numero).ShouldBe(["1000"]);
    }
}
