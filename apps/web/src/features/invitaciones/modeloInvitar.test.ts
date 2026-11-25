import type { AtributoPermitidoDto, TipoIdentificacionDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { borradorInvitacionNuevo, correoValido, cuerpoInvitacion, erroresDeAtributosDeLaApi, erroresDeLaApi, validarInvitacion, type BorradorInvitacion } from './modeloInvitar';

const NIT: TipoIdentificacionDto = { pais: 'CO', codigo: 'NIT', nombre: 'Número de Identificación Tributaria', aplicaA: 'Ambas', patron: '^[0-9]{6,15}$', tieneDv: true };
const CC: TipoIdentificacionDto = { pais: 'CO', codigo: 'CC', nombre: 'Cédula de ciudadanía', aplicaA: 'Natural', patron: '^[0-9]{3,10}$', tieneDv: false };

const COMPLETO: BorradorInvitacion = {
  ...borradorInvitacionNuevo(),
  numero: '900.123.456-8',
  nombre: 'Aceros del Norte S.A.S.',
  correo: 'compras@aceros.co',
  tipoVinculo: 'PROVEEDOR',
};

describe('modelo de «Invitar tercero»', () => {
  it('arranca en Colombia con NIT, como el alta de una empresa', () => {
    expect(borradorInvitacionNuevo()).toMatchObject({ pais: 'CO', tipoIdentificacion: 'NIT', numero: '', tipoVinculo: '', flujo: '' });
    expect(borradorInvitacionNuevo()).not.toHaveProperty('tipoPersona'); // el tipo de persona no se elige: se deriva del tipo de identificación
  });

  it('valida lo mismo que una fila del lote y dice los errores en el orden del formulario', () => {
    expect(validarInvitacion(COMPLETO, NIT)).toEqual([]);
    expect(validarInvitacion(borradorInvitacionNuevo(), NIT).map((e) => `${e.campo}:${e.codigo}`)).toEqual([
      'numero:numero-requerido',
      'nombre:nombre-requerido',
      'correo:correo-requerido',
      'tipoVinculo:tipo-vinculo-requerido',
    ]);
    expect(validarInvitacion({ ...COMPLETO, numero: '12AB' }, NIT)).toEqual([{ campo: 'numero', codigo: 'numero-invalido' }]);
    expect(validarInvitacion({ ...COMPLETO, tipoIdentificacion: '' }, undefined)).toEqual([{ campo: 'tipoIdentificacion', codigo: 'tipo-identificacion-requerido' }]);
    expect(validarInvitacion({ ...COMPLETO, correo: 'no-es-un-correo' }, NIT)).toEqual([{ campo: 'correo', codigo: 'correo-invalido' }]);
    expect(validarInvitacion({ ...COMPLETO, nombre: 'x'.repeat(201), telefono: 'y'.repeat(201) }, NIT)).toEqual([
      { campo: 'nombre', codigo: 'texto-demasiado-largo' },
      { campo: 'telefono', codigo: 'texto-demasiado-largo' },
    ]);
    // Un número de un tipo sin patrón conocido lo decide la API; el flujo es opcional.
    expect(validarInvitacion({ ...COMPLETO, flujo: 'FLU' }, undefined)).toEqual([]);
  });

  it('el correo: algo, arroba, algo, punto y algo, sin espacios', () => {
    expect(correoValido('compras@empresa.co')).toBe(true);
    expect(correoValido('a@b.c')).toBe(true);
    expect(correoValido('compras@empresa')).toBe(false);
    expect(correoValido('compras empresa@x.co')).toBe(false);
    expect(correoValido(`${'a'.repeat(250)}@b.co`)).toBe(false);
  });

  it('arma el cuerpo de POST /invitaciones: lo vacío va como null y el DV solo viaja con un tipo que lo tiene', () => {
    expect(cuerpoInvitacion({ ...COMPLETO, digito: '8', nombreComercial: ' Aceros ', contacto: 'Laura', telefono: '3001234567', flujo: 'FLU-1' }, NIT)).toEqual({
      pais: 'CO',
      tipoIdentificacion: 'NIT',
      numeroIdentificacion: '900.123.456-8',
      digitoVerificacion: '8',
      tipoPersona: 'Juridica',
      nombre: 'Aceros del Norte S.A.S.',
      nombreComercial: 'Aceros',
      correo: 'compras@aceros.co',
      tipoVinculo: 'PROVEEDOR',
      flujo: 'FLU-1',
      contacto: 'Laura',
      telefono: '3001234567',
    });
    expect(cuerpoInvitacion({ ...COMPLETO, tipoIdentificacion: 'CC', numero: '1020304050', digito: '9' }, CC)).toMatchObject({
      tipoIdentificacion: 'CC',
      digitoVerificacion: null,
      tipoPersona: 'Natural',
      nombreComercial: null,
      flujo: null,
      contacto: null,
      telefono: null,
    });
  });

  it('el tipo de persona que viaja sale del tipo de identificación: Jurídica con NIT, Natural con la cédula; sin catálogo lo deduce la API', () => {
    expect(cuerpoInvitacion(COMPLETO, NIT)).toMatchObject({ tipoPersona: 'Juridica' });
    expect(cuerpoInvitacion({ ...COMPLETO, tipoIdentificacion: 'CC', numero: '1020304050' }, CC)).toMatchObject({ tipoPersona: 'Natural' });
    expect(cuerpoInvitacion(COMPLETO, undefined)).toMatchObject({ tipoPersona: null });
  });

  it('lleva los errores por campo de la API a los campos del formulario', () => {
    expect(
      erroresDeLaApi({
        numeroIdentificacion: ['El número no tiene el formato.'],
        digitoVerificacion: ['El dígito no corresponde.'],
        tipoVinculo: ['El tipo no existe.', 'otro'],
        tipoPersona: ['Cédula de ciudadanía no aplica a una persona jurídica.'],
        desconocido: ['ignorado'],
      }),
    ).toEqual({
      numero: 'El número no tiene el formato.',
      digito: 'El dígito no corresponde.',
      tipoVinculo: 'El tipo no existe.',
      // Sin campo de tipo de persona, lo que la API diga de él se ve junto al tipo de identificación.
      tipoIdentificacion: 'Cédula de ciudadanía no aplica a una persona jurídica.',
    });
  });

  it('los atributos del tipo elegido viajan con el tipo de cada uno y solo si alguno tiene valor', () => {
    const permitidos: AtributoPermitidoDto[] = [
      { clave: 'nivelRiesgo', tipo: 'Opcion', obligatorio: true, opciones: ['Bajo', 'Alto'] },
      { clave: 'montoEstimado', tipo: 'Numero', obligatorio: false, opciones: null },
      { clave: 'critico', tipo: 'Booleano', obligatorio: false, opciones: null },
    ];
    const conValores = { ...COMPLETO, atributos: { nivelRiesgo: 'Alto', montoEstimado: '1500000', critico: 'true' } };

    expect(cuerpoInvitacion(conValores, NIT, permitidos)).toMatchObject({ atributos: { nivelRiesgo: 'Alto', montoEstimado: 1500000, critico: true } });
    // Sin valores, o sin atributos del tipo, el cuerpo es el de siempre (la API lo lee como «no vinieron»).
    expect(cuerpoInvitacion(COMPLETO, NIT, permitidos)).not.toHaveProperty('atributos');
    expect(cuerpoInvitacion(conValores, NIT)).not.toHaveProperty('atributos');
    expect(borradorInvitacionNuevo().atributos).toEqual({});
  });

  it('lleva los errores por atributo de la API (atributos.{clave}) a su atributo', () => {
    expect(
      erroresDeAtributosDeLaApi({
        'atributos.nivelRiesgo': ['El valor no es válido.', 'otro'],
        'atributos.obra': ['El tipo no admite ese atributo.'],
        correo: ['ignorado'],
        'atributos.': ['sin clave'],
      }),
    ).toEqual({ nivelRiesgo: 'El valor no es válido.', obra: 'El tipo no admite ese atributo.' });
  });
});
