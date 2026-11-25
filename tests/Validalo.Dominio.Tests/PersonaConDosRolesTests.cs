using System.Text.Json;
using Validalo.Aplicacion.Ficha;
using Validalo.Aplicacion.Informes;
using Validalo.Contratos;
using Validalo.Dominio.Ficha;

namespace Validalo.Dominio.Tests;

/// <summary>
/// PS-1: quien es representante legal y además socio tiene una fila por rol en la información legal, las dos con los mismos datos y la misma declaración PEP. Lo que
/// cuenta o lista personas no la cuenta dos veces: el informe SAGRILAFT (cifras de la fila de cada tercero) y los PDF de declaraciones del expediente.
/// </summary>
public sealed class PersonaConDosRolesTests
{
    private static PersonaInformeDto Fila(string rol, string tipo, string numero, bool pep, bool declaracion, int indice, decimal? participacion = null) =>
        new(rol, tipo, numero, "Joel Mateo Robles", participacion, pep, false, rol == "Socio" && participacion >= 5m, declaracion, indice);

    [Fact]
    public void El_informe_cuenta_personas_y_no_filas()
    {
        PersonaInformeDto[] filas =
        [
            Fila("RepresentanteLegal", "CC", "1020304050", pep: true, declaracion: true, indice: 0),
            Fila("Socio", "CC", "1020304050", pep: true, declaracion: true, indice: 1, participacion: 100),
            Fila("Contador", "CC", "52123456", pep: false, declaracion: false, indice: 2)
        ];

        var resumen = InformeSagrilaftEndpoints.ResumirPersonas(filas);

        Assert.Equal(new InformeSagrilaftEndpoints.ResumenDePersonas(Personas: 2, Pep: 1, PepSinDeclaracion: 0), resumen);
    }

    [Fact]
    public void La_persona_con_dos_roles_sin_declaracion_cuenta_una_sola_vez_como_pep_sin_declaracion()
    {
        PersonaInformeDto[] filas =
        [
            Fila("RepresentanteLegal", "CC", "1020304050", pep: true, declaracion: false, indice: 0),
            Fila("Socio", "CC", "1020304050", pep: true, declaracion: false, indice: 1, participacion: 40)
        ];

        Assert.Equal(new InformeSagrilaftEndpoints.ResumenDePersonas(1, 1, 1), InformeSagrilaftEndpoints.ResumirPersonas(filas));
    }

    [Fact]
    public void Si_alguna_de_las_filas_trae_la_declaracion_la_persona_la_tiene()
    {
        PersonaInformeDto[] filas =
        [
            Fila("RepresentanteLegal", "CC", "1020304050", pep: true, declaracion: false, indice: 0),
            Fila("Socio", "CC", "1020304050", pep: true, declaracion: true, indice: 1, participacion: 40)
        ];

        Assert.Equal(new InformeSagrilaftEndpoints.ResumenDePersonas(1, 1, 0), InformeSagrilaftEndpoints.ResumirPersonas(filas));
    }

    [Fact]
    public void Dos_personas_distintas_o_filas_sin_numero_no_se_juntan()
    {
        PersonaInformeDto[] filas =
        [
            Fila("Socio", "CC", "1020304050", pep: true, declaracion: true, indice: 0, participacion: 30),
            Fila("Socio", "CE", "1020304050", pep: false, declaracion: false, indice: 1, participacion: 30),
            Fila("Socio", string.Empty, string.Empty, pep: false, declaracion: false, indice: 2),
            Fila("Contador", string.Empty, string.Empty, pep: false, declaracion: false, indice: 3)
        ];

        Assert.Equal(new InformeSagrilaftEndpoints.ResumenDePersonas(4, 1, 0), InformeSagrilaftEndpoints.ResumirPersonas(filas));
    }

    private sealed class GeneradorFalso : IGeneradorDePdfDeDeclaracionPep
    {
        public List<DatosDelPdfDeDeclaracionPep> Pedidos { get; } = [];

        public byte[] Generar(DatosDelPdfDeDeclaracionPep datos)
        {
            Pedidos.Add(datos);
            return [1, 2, 3];
        }
    }

    private static DeclaracionPep Declaracion(string numero, RelacionConLaEmpresa relacion) => new()
    {
        RelacionEmpresa = relacion,
        Nombre = "Joel Mateo Robles",
        TipoIdentificacion = "CC",
        Numero = numero,
        Cargo = "Alcalde"
    };

    private static PersonaRelacionada Persona(RolPersonaRelacionada rol, string numero, DeclaracionPep? declaracion, decimal? porcentaje = null) => new()
    {
        Rol = rol,
        TipoIdentificacion = "CC",
        Numero = numero,
        Nombres = "Joel Mateo",
        Apellidos = "Robles",
        Porcentaje = porcentaje,
        Pep = declaracion is not null,
        VinculoPep = false,
        DeclaracionPep = declaracion
    };

    private static VersionDeSeccion Version(params PersonaRelacionada[] personas) => new()
    {
        Numero = 3,
        Datos = JsonSerializer.SerializeToElement(new DatosLegales { Personas = personas }, JsonDeFicha.Canonica),
        Fecha = new DateTimeOffset(2026, 11, 24, 10, 0, 0, TimeSpan.Zero)
    };

    [Fact]
    public void El_zip_del_expediente_lleva_un_solo_pdf_para_la_persona_con_dos_roles_y_su_rol_dice_los_dos()
    {
        var generador = new GeneradorFalso();
        var version = Version(
            Persona(RolPersonaRelacionada.RepresentanteLegal, "1020304050", Declaracion("1020304050", RelacionConLaEmpresa.Proveedor)),
            Persona(RolPersonaRelacionada.Socio, "1020304050", Declaracion("1020304050", RelacionConLaEmpresa.Socio), porcentaje: 100),
            Persona(RolPersonaRelacionada.Suplente, "52123456", Declaracion("52123456", RelacionConLaEmpresa.Proveedor)),
            Persona(RolPersonaRelacionada.Contador, "80111222", declaracion: null));

        var pdfs = DeclaracionesPepEndpoints.PdfsDeLaVersion(CodigosDeSeccion.Legal, "Información legal", version, "Sinco OK", "Proveedor SAS", generador,
            new DateTimeOffset(2026, 11, 25, 9, 0, 0, TimeSpan.Zero));

        Assert.Equal(2, pdfs.Count);
        Assert.Equal(pdfs.Count, pdfs.Select(p => p.Nombre).Distinct().Count());
        Assert.Equal(2, generador.Pedidos.Count);
        Assert.Equal("Representante legal y Socio o accionista", generador.Pedidos[0].Rol);
        Assert.Equal("1020304050", generador.Pedidos[0].Declaracion.Numero);
        Assert.Equal("Suplente del representante legal", generador.Pedidos[1].Rol);
    }

    [Fact]
    public void Una_persona_con_un_solo_rol_sigue_dando_su_pdf_con_su_rol()
    {
        var generador = new GeneradorFalso();
        var version = Version(Persona(RolPersonaRelacionada.Socio, "1020304050", Declaracion("1020304050", RelacionConLaEmpresa.Socio), porcentaje: 60));

        var pdfs = DeclaracionesPepEndpoints.PdfsDeLaVersion(CodigosDeSeccion.Legal, "Información legal", version, "Sinco OK", "Proveedor SAS", generador,
            new DateTimeOffset(2026, 11, 25, 9, 0, 0, TimeSpan.Zero));

        Assert.Single(pdfs);
        Assert.Equal("Socio o accionista", generador.Pedidos[0].Rol);
    }
}
