using Validalo.Dominio.Ficha;
using Validalo.Dominio.Identificaciones;
using Validalo.Dominio.Terceros;

namespace Validalo.Dominio.Tests;

/// <summary>
/// La ficha legal es el único lugar donde se registran los representantes legales, suplentes y socios (decisión de Producto del 2026-11-24, ADR-0010): qué tipos de relación maneja,
/// cómo queda la sección cuando el tercero confirma lo que detectó la IA (agregar, actualizar solo lo que trae, quitar al saliente) y que, con esos datos, la conciliación de las
/// relaciones queda al día y una segunda pasada no emite nada.
/// </summary>
public sealed class PersonasEnLaFichaTests
{
    private static readonly DateTimeOffset Ahora = new(2026, 11, 24, 9, 0, 0, TimeSpan.FromHours(-5));
    private static readonly DateOnly Hoy = new(2026, 11, 24);
    private static readonly Identificacion Empresa = Identificacion.Crear("CO", "NIT", "900123456");

    private static PersonaRelacionada Fila(RolPersonaRelacionada rol, string numero, string nombres, string? apellidos = "Prueba", string? representacion = null, string? cargo = null,
        decimal? porcentaje = null) =>
        new() { Rol = rol, TipoIdentificacion = "CC", Numero = numero, Nombres = nombres, Apellidos = apellidos, TipoRepresentacion = representacion, Cargo = cargo, Porcentaje = porcentaje,
            Pep = false, VinculoPep = false, Correo = "persona@correo.co" };

    private static PersonaDeclarada Persona(string numero, string nombre, TipoRelacionTerceros tipo, bool principal = false, decimal? participacion = null, string? cargo = null) =>
        new(Identificacion.Crear("CO", "CC", numero), nombre, tipo, principal, participacion, cargo);

    [Fact]
    public void La_ficha_maneja_representante_suplente_y_socio_y_no_beneficiario_final_ni_miembro()
    {
        PersonasDeLaFicha.LaFichaManeja(TipoRelacionTerceros.RepresentanteLegal).ShouldBeTrue();
        PersonasDeLaFicha.LaFichaManeja(TipoRelacionTerceros.Suplente).ShouldBeTrue();
        PersonasDeLaFicha.LaFichaManeja(TipoRelacionTerceros.Socio).ShouldBeTrue();
        PersonasDeLaFicha.LaFichaManeja(TipoRelacionTerceros.BeneficiarioFinal).ShouldBeFalse();
        PersonasDeLaFicha.LaFichaManeja(TipoRelacionTerceros.MiembroDe).ShouldBeFalse();
        PersonasDeLaFicha.RolDe(TipoRelacionTerceros.MiembroDe).ShouldBeNull();
    }

    [Fact]
    public void Cada_tipo_de_la_ficha_tiene_el_rol_que_le_corresponde_y_el_viaje_de_ida_y_vuelta_coincide()
    {
        foreach (var tipo in Enum.GetValues<TipoRelacionTerceros>().Where(PersonasDeLaFicha.LaFichaManeja))
            PersonasDeLaFicha.TipoDe(PersonasDeLaFicha.RolDe(tipo)).ShouldBe(tipo);

        // Apoderado, junta directiva, revisor fiscal y contador son datos de la ficha, no una relación.
        foreach (var rol in new[] { RolPersonaRelacionada.Apoderado, RolPersonaRelacionada.JuntaDirectiva, RolPersonaRelacionada.RevisorFiscal, RolPersonaRelacionada.Contador })
            PersonasDeLaFicha.TipoDe(rol).ShouldBeNull();
    }

    [Fact]
    public void Una_persona_nueva_se_agrega_a_la_ficha_con_lo_que_se_sabe_y_el_resto_queda_por_completar()
    {
        var legal = new DatosLegales { Personas = [Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan", representacion: "Principal")] };

        var nueva = PersonasDeLaFicha.ConPersona(legal, Persona("2000", "María Gómez Nueva", TipoRelacionTerceros.Suplente, cargo: "Suplente del representante legal"), Empresa);

        nueva.Personas!.Count.ShouldBe(2);
        nueva.Personas[0].ShouldBe(legal.Personas![0]); // lo que ya estaba queda intacto
        var fila = nueva.Personas[1];
        (fila.Rol, fila.TipoIdentificacion, fila.Numero, fila.Nombres, fila.Cargo).ShouldBe(
            (RolPersonaRelacionada.Suplente, "CC", "2000", "María Gómez Nueva", "Suplente del representante legal"));
        (fila.Apellidos, fila.Pep, fila.VinculoPep, fila.TipoRepresentacion).ShouldBe((null, null, null, null));
    }

    [Fact]
    public void El_representante_principal_nuevo_queda_primero_de_su_rol_y_es_el_que_elige_la_regla_del_erp()
    {
        var legal = new DatosLegales
        {
            Personas =
            [
                Fila(RolPersonaRelacionada.Contador, "5000", "Contadora"),
                Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Ana", representacion: "Principal"),
                Fila(RolPersonaRelacionada.RepresentanteLegal, "2000", "Beto")
            ]
        };

        var nueva = PersonasDeLaFicha.ConPersona(legal, Persona("3000", "Carla Nueva", TipoRelacionTerceros.RepresentanteLegal, principal: true), Empresa);

        var personas = nueva.Personas.ShouldNotBeNull();
        personas.Select(p => p.Numero).ShouldBe(["5000", "3000", "1000", "2000"]);
        personas[1].TipoRepresentacion.ShouldBe(PersonasDeLaFicha.PrincipalComoRepresentacion);
        RepresentanteLegalPrincipal.Elegir(TipoPersona.Juridica, null, nueva)!.Persona.Numero.ShouldBe("3000");
        PersonasDeLaFicha.Leer(nueva, Empresa).Where(p => p.Principal && p.Tipo == TipoRelacionTerceros.RepresentanteLegal).Select(p => p.Identificacion.Numero).ShouldBe(["3000"]);
    }

    [Fact]
    public void Si_la_persona_ya_figura_con_ese_rol_solo_se_actualiza_lo_que_la_propuesta_trae()
    {
        var existente = Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan Carlos", "Pérez Soto", cargo: "Gerente") with
        {
            Nacionalidad = "CO", Telefono = "3001234567", Pep = true, FechaExpedicion = new DateOnly(2010, 5, 3)
        };
        var legal = new DatosLegales { Personas = [Fila(RolPersonaRelacionada.Socio, "9000", "Otro", porcentaje: 50), existente] };

        // La IA la lee como «Juan Pérez» (sin cargo ni representación): trae el principal y poco más; el nombre curado por el tercero no se pisa.
        var nueva = PersonasDeLaFicha.ConPersona(legal, Persona("1000", "Juan Pérez", TipoRelacionTerceros.RepresentanteLegal, principal: true), Empresa);

        nueva.Personas!.Count.ShouldBe(2);
        var fila = nueva.Personas.Single(p => p.Rol == RolPersonaRelacionada.RepresentanteLegal);
        fila.ShouldBe(existente with { TipoRepresentacion = PersonasDeLaFicha.PrincipalComoRepresentacion }); // nombres, apellidos, cargo, PEP, teléfono… intactos
        nueva.Personas.Single(p => p.Rol == RolPersonaRelacionada.Socio).ShouldBe(legal.Personas![0]);
    }

    [Fact]
    public void Una_fila_sin_nombre_recibe_el_de_la_propuesta_y_un_cargo_o_una_participacion_que_trae_se_actualizan()
    {
        var legal = new DatosLegales
        {
            Personas =
            [
                new PersonaRelacionada { Rol = RolPersonaRelacionada.Socio, TipoIdentificacion = "CC", Numero = "4000", Porcentaje = 10, Cargo = "Accionista" }
            ]
        };

        var nueva = PersonasDeLaFicha.ConPersona(legal, Persona("4000", "Dani Socio", TipoRelacionTerceros.Socio, participacion: 35.5m, cargo: "Presidente de la junta"), Empresa);

        var fila = nueva.Personas.ShouldHaveSingleItem();
        (fila.Nombres, fila.Porcentaje, fila.Cargo).ShouldBe(("Dani Socio", 35.5m, "Presidente de la junta"));
    }

    [Fact]
    public void Agregar_a_la_misma_persona_dos_veces_deja_la_seccion_igual()
    {
        var legal = new DatosLegales { Personas = [Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan", representacion: "Principal")] };
        var maria = Persona("2000", "María Gómez Nueva", TipoRelacionTerceros.RepresentanteLegal, principal: true, cargo: "Representante legal principal");

        var una = PersonasDeLaFicha.ConPersona(legal, maria, Empresa);
        var dos = PersonasDeLaFicha.ConPersona(una, maria, Empresa);

        dos.Personas.ShouldBe(una.Personas!);
        una.Personas!.Count(p => p.Numero == "2000").ShouldBe(1);
    }

    [Fact]
    public void La_misma_persona_con_otro_rol_es_otra_fila()
    {
        var legal = new DatosLegales { Personas = [Fila(RolPersonaRelacionada.Socio, "1000", "Juan", porcentaje: 40)] };

        var nueva = PersonasDeLaFicha.ConPersona(legal, Persona("1000", "Juan", TipoRelacionTerceros.RepresentanteLegal, principal: true), Empresa);

        nueva.Personas!.Select(p => (p.Rol, p.Numero)).ShouldBe([(RolPersonaRelacionada.RepresentanteLegal, "1000"), (RolPersonaRelacionada.Socio, "1000")], ignoreOrder: true);
    }

    [Fact]
    public void Quitar_a_la_saliente_saca_solo_esa_persona_con_ese_rol_y_si_no_figura_no_cambia_nada()
    {
        var legal = new DatosLegales
        {
            Personas =
            [
                Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan", representacion: "Principal"),
                Fila(RolPersonaRelacionada.Socio, "1000", "Juan", porcentaje: 40),
                Fila(RolPersonaRelacionada.RepresentanteLegal, "2000", "Beto")
            ]
        };
        var juan = Identificacion.Crear("CO", "CC", "1000").Clave;

        var sin = PersonasDeLaFicha.SinPersonas(legal, [(TipoRelacionTerceros.RepresentanteLegal, juan)], Empresa);

        sin.Personas!.Select(p => (p.Rol, p.Numero)).ShouldBe([(RolPersonaRelacionada.Socio, "1000"), (RolPersonaRelacionada.RepresentanteLegal, "2000")]);
        PersonasDeLaFicha.SinPersonas(sin, [(TipoRelacionTerceros.RepresentanteLegal, juan)], Empresa).ShouldBeSameAs(sin);
        PersonasDeLaFicha.SinPersonas(null, [(TipoRelacionTerceros.RepresentanteLegal, juan)], Empresa).Personas.ShouldBeNull();
    }

    [Fact]
    public void Confirmar_a_quien_reemplaza_a_la_principal_deja_la_ficha_y_las_relaciones_de_acuerdo_y_una_segunda_conciliacion_no_emite_nada()
    {
        var (destino, juan, maria) = (Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var delJuan = Identificacion.Crear("CO", "CC", "1000").Clave;

        // Hoy: Juan, representante principal de la ficha, con su relación de la ficha; la IA propuso a María (principal).
        var relacionDeJuan = RelacionEntreTerceros.Create(RelacionEntreTerceros.Registrar(juan, destino, TipoRelacionTerceros.RepresentanteLegal, true, null, null, Hoy.AddDays(-30),
            FuenteDeRelacion.Declarada, true, "t", Ahora));
        var propuesta = RelacionEntreTerceros.Create(RelacionEntreTerceros.Detectar(maria, destino, TipoRelacionTerceros.RepresentanteLegal, true, null, "Representante legal principal",
            0.93m, Guid.NewGuid(), 1, Ahora));
        var legal = new DatosLegales { Personas = [Fila(RolPersonaRelacionada.RepresentanteLegal, "1000", "Juan", representacion: "Principal")] };

        // Confirmar: la ficha pierde a Juan y gana a María, y las relaciones se concilian con esa ficha.
        var nueva = PersonasDeLaFicha.ConPersona(PersonasDeLaFicha.SinPersonas(legal, [(TipoRelacionTerceros.RepresentanteLegal, delJuan)], Empresa),
            Persona("2000", "María Gómez Nueva", TipoRelacionTerceros.RepresentanteLegal, principal: true, cargo: "Representante legal principal"), Empresa);
        var declaradas = PersonasDeLaFicha.Leer(nueva, Empresa);
        var personaDe = new Dictionary<string, Guid> { [Identificacion.Crear("CO", "CC", "2000").Clave] = maria, [delJuan] = juan };
        var cambios = ConciliacionDeRelaciones.Calcular(destino, declaradas, personaDe, [relacionDeJuan, propuesta], Hoy, Ahora, "t");

        cambios.Count.ShouldBe(2);
        var deMaria = cambios.Single(c => c.RelacionId == propuesta.Id);
        deMaria.Eventos.ShouldHaveSingleItem().ShouldBeOfType<RelacionConfirmada>().DeFicha.ShouldBe(true); // la confirma la ficha: vigente y de la ficha
        cambios.Single(c => c.RelacionId == relacionDeJuan.Id).Eventos.ShouldHaveSingleItem().ShouldBeOfType<RelacionTerminada>().Motivo.ShouldBe(ConciliacionDeRelaciones.MotivoDeSalida);

        // Con esos eventos aplicados, la conciliación de la ficha (lo que hace después el mensaje del guardado) no tiene nada que hacer.
        var despues = new[]
        {
            propuesta.Proyectar(deMaria.Eventos),
            relacionDeJuan.Proyectar(cambios.Single(c => c.RelacionId == relacionDeJuan.Id).Eventos)
        };
        despues[0].Estado.ShouldBe(EstadoDeRelacion.Confirmada);
        despues[0].DeFicha.ShouldBeTrue();
        despues[0].Principal.ShouldBeTrue();
        ConciliacionDeRelaciones.Calcular(destino, declaradas, personaDe, despues, Hoy, Ahora, "t").ShouldBeEmpty();
    }

    [Fact]
    public void La_relacion_declarada_a_mano_que_ahora_figura_en_la_ficha_pasa_a_ser_de_la_ficha_y_si_sale_de_ella_termina()
    {
        var (destino, maria) = (Guid.NewGuid(), Guid.NewGuid());
        var aMano = RelacionEntreTerceros.Create(RelacionEntreTerceros.Registrar(maria, destino, TipoRelacionTerceros.RepresentanteLegal, true, null, null, Hoy.AddDays(-5),
            FuenteDeRelacion.Declarada, false, "t", Ahora));
        var legal = PersonasDeLaFicha.ConPersona(null, Persona("2000", "María Gómez", TipoRelacionTerceros.RepresentanteLegal, principal: true), Empresa);
        var declaradas = PersonasDeLaFicha.Leer(legal, Empresa);
        var personaDe = new Dictionary<string, Guid> { [Identificacion.Crear("CO", "CC", "2000").Clave] = maria };

        // Antes la ficha no la tocaba: quedaba fuera de ella aunque la persona figurara en la sección. Ahora la ficha la adopta, una sola vez.
        var cambios = ConciliacionDeRelaciones.Calcular(destino, declaradas, personaDe, [aMano], Hoy, Ahora, "t");
        cambios.ShouldHaveSingleItem().Eventos.ShouldHaveSingleItem().ShouldBeOfType<RelacionActualizada>().DeFicha.ShouldBe(true);
        var adoptada = aMano.Proyectar(cambios[0].Eventos);
        adoptada.DeFicha.ShouldBeTrue();
        adoptada.EsVigente(Hoy).ShouldBeTrue();
        ConciliacionDeRelaciones.Calcular(destino, declaradas, personaDe, [adoptada], Hoy, Ahora, "t").ShouldBeEmpty();

        // Y como ya es de la ficha, si la persona sale de la sección la relación termina.
        var salida = ConciliacionDeRelaciones.Calcular(destino, [], new Dictionary<string, Guid>(), [adoptada], Hoy, Ahora, "t");
        salida.ShouldHaveSingleItem().Eventos.ShouldHaveSingleItem().ShouldBeOfType<RelacionTerminada>().Motivo.ShouldBe(ConciliacionDeRelaciones.MotivoDeSalida);

        // Una relación declarada a mano que la ficha no trae (un beneficiario final) no se toca ni termina.
        var beneficiaria = RelacionEntreTerceros.Create(RelacionEntreTerceros.Registrar(Guid.NewGuid(), destino, TipoRelacionTerceros.BeneficiarioFinal, false, 30m, null, Hoy.AddDays(-5),
            FuenteDeRelacion.Declarada, false, "t", Ahora));
        ConciliacionDeRelaciones.Calcular(destino, [], new Dictionary<string, Guid>(), [beneficiaria], Hoy, Ahora, "t").ShouldBeEmpty();
    }

    [Fact]
    public void Confirmar_a_un_suplente_nuevo_hace_que_la_conciliacion_ajuste_su_principal_a_lo_que_dice_la_ficha_y_despues_no_emite_nada()
    {
        var (destino, maria) = (Guid.NewGuid(), Guid.NewGuid());
        var propuesta = RelacionEntreTerceros.Create(RelacionEntreTerceros.Detectar(maria, destino, TipoRelacionTerceros.Suplente, false, null, "Suplente", 0.9m, null, null, Ahora));
        var nueva = PersonasDeLaFicha.ConPersona(null, Persona("2000", "María Suplente", TipoRelacionTerceros.Suplente, cargo: "Suplente"), Empresa);
        var declaradas = PersonasDeLaFicha.Leer(nueva, Empresa);
        var personaDe = new Dictionary<string, Guid> { [Identificacion.Crear("CO", "CC", "2000").Clave] = maria };

        var cambios = ConciliacionDeRelaciones.Calcular(destino, declaradas, personaDe, [propuesta], Hoy, Ahora, "t");

        // El único suplente de la ficha es el principal de su tipo: la relación se confirma y se marca principal en el mismo paso.
        var eventos = cambios.ShouldHaveSingleItem().Eventos;
        eventos.OfType<RelacionConfirmada>().ShouldHaveSingleItem().DeFicha.ShouldBe(true);
        eventos.OfType<RelacionMarcadaPrincipal>().ShouldHaveSingleItem().Principal.ShouldBeTrue();
        ConciliacionDeRelaciones.Calcular(destino, declaradas, personaDe, [propuesta.Proyectar(eventos)], Hoy, Ahora, "t").ShouldBeEmpty();
    }
}
