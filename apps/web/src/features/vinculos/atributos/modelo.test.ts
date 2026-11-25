import type { AtributoPermitidoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { cuerpoDeAtributos, etiquetaDeAtributo, validarAtributos, valoresIniciales } from './modelo';

const ATRIBUTOS: AtributoPermitidoDto[] = [
  { clave: 'nivelRiesgo', tipo: 'Opcion', obligatorio: true, opciones: ['Bajo', 'Medio', 'Alto'] },
  { clave: 'categorias', tipo: 'ListaOpciones', obligatorio: false, opciones: ['Materiales', 'Servicios'] },
  { clave: 'montoEstimado', tipo: 'Numero', obligatorio: false, opciones: null },
  { clave: 'vigencia', tipo: 'Fecha', obligatorio: false, opciones: null },
  { clave: 'critico', tipo: 'Booleano', obligatorio: false, opciones: null },
  { clave: 'nota', tipo: 'Texto', obligatorio: false, opciones: null },
];

describe('atributos del vínculo en un formulario', () => {
  it('los valores iniciales son los del vínculo, en el control de cada tipo, y vacíos donde no hay (lo que el tipo ya no admite no se muestra)', () => {
    expect(valoresIniciales(ATRIBUTOS, { nivelRiesgo: 'Alto', categorias: ['Servicios', 7], montoEstimado: 1500000, critico: false, viejo: 'x' })).toEqual({
      nivelRiesgo: 'Alto',
      categorias: ['Servicios'],
      montoEstimado: '1500000',
      vigencia: '',
      critico: 'false',
      nota: '',
    });
    expect(valoresIniciales(ATRIBUTOS)).toEqual({ nivelRiesgo: '', categorias: [], montoEstimado: '', vigencia: '', critico: '', nota: '' });
  });

  it('valida lo que la API rechazaría: obligatorio sin valor, número con coma, fecha incompleta y opción fuera de la lista', () => {
    expect(validarAtributos(ATRIBUTOS, valoresIniciales(ATRIBUTOS))).toEqual({ nivelRiesgo: 'requerido' });
    expect(
      validarAtributos(ATRIBUTOS, { nivelRiesgo: 'Altísimo', categorias: ['Servicios', 'Otra'], montoEstimado: '12,5', vigencia: '2026-1-5', critico: 'true', nota: '' }),
    ).toEqual({ nivelRiesgo: 'opcion-invalida', categorias: 'opcion-invalida', montoEstimado: 'numero-invalido', vigencia: 'fecha-invalida' });
    expect(validarAtributos(ATRIBUTOS, { nivelRiesgo: 'Alto', categorias: ['Materiales'], montoEstimado: '-1500.25', vigencia: '2026-12-31', critico: 'false', nota: 'x' })).toEqual({});
  });

  it('el cuerpo lleva cada valor con el tipo de su atributo y deja fuera lo vacío (que quita el atributo)', () => {
    expect(
      cuerpoDeAtributos(ATRIBUTOS, { nivelRiesgo: 'Alto', categorias: ['Servicios'], montoEstimado: ' 1500000.5 ', vigencia: '2026-12-31', critico: 'false', nota: '  Revisar  ' }),
    ).toEqual({ nivelRiesgo: 'Alto', categorias: ['Servicios'], montoEstimado: 1500000.5, vigencia: '2026-12-31', critico: false, nota: 'Revisar' });
    expect(cuerpoDeAtributos(ATRIBUTOS, { nivelRiesgo: 'Bajo', categorias: [], montoEstimado: '', vigencia: '', critico: '', nota: '   ' })).toEqual({ nivelRiesgo: 'Bajo' });
    // Un atributo que el formulario no conoce no viaja.
    expect(cuerpoDeAtributos(ATRIBUTOS, { nivelRiesgo: 'Bajo', otro: 'x' })).toEqual({ nivelRiesgo: 'Bajo' });
  });

  it('la etiqueta es el código del atributo en texto legible: separa las palabras, respeta las siglas y capitaliza la primera', () => {
    expect(etiquetaDeAtributo('montoEstimado')).toBe('Monto estimado');
    expect(etiquetaDeAtributo('nivelRiesgo')).toBe('Nivel riesgo');
    expect(etiquetaDeAtributo('categorias')).toBe('Categorias');
    expect(etiquetaDeAtributo('nivel_riesgo')).toBe('Nivel riesgo');
    expect(etiquetaDeAtributo('nivel-de-riesgo')).toBe('Nivel de riesgo');
    expect(etiquetaDeAtributo('MONTO_ESTIMADO')).toBe('Monto estimado');
    expect(etiquetaDeAtributo('valorCOP')).toBe('Valor COP');
    expect(etiquetaDeAtributo('NITProveedor')).toBe('NIT proveedor');
    expect(etiquetaDeAtributo('plazo30Dias')).toBe('Plazo30 dias');
    expect(etiquetaDeAtributo('  nota ')).toBe('Nota');
    expect(etiquetaDeAtributo('')).toBe('');
  });
});
