import type { CondicionDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { requisitoDeSeccionNuevo, requisitoNuevo } from './editor';
import { resumenDelRequisito } from './resumenDelRequisito';

const t = i18n.t.bind(i18n);
const nombreArea = (id: string) => ({ compras: 'Compras', juridica: 'Jurídica', sst: 'SST', tesoreria: 'Tesorería' })[id] ?? id;
const predicado = (atributo: string, operador: string, ...valores: string[]): CondicionDto => ({ tipo: 'Predicado', nodos: null, atributo, operador, valores });

describe('el resumen de una fila cerrada', () => {
  const rut = { tipoCanonico: 'RUT' };
  const contexto = { t, tipo: undefined, nombreArea };

  it('dice obligatorio, a quién se pide y quién lo revisa', () => {
    expect(resumenDelRequisito(requisitoNuevo('x'), contexto).linea).toBe('Obligatorio · Se pide a todos · Lo revisan todas las áreas');
    expect(resumenDelRequisito({ ...requisitoNuevo('x'), obligatorio: false, areasQueRevisan: ['juridica'] }, contexto).linea).toBe('Opcional · Se pide a todos · Lo revisa Jurídica');
    expect(resumenDelRequisito({ ...requisitoNuevo('x'), areasQueRevisan: ['compras', 'juridica'] }, contexto).linea).toBe('Obligatorio · Se pide a todos · Lo revisan Compras y Jurídica');
    expect(resumenDelRequisito({ ...requisitoNuevo('x'), areasQueRevisan: ['compras', 'juridica', 'sst'] }, contexto).linea).toBe('Obligatorio · Se pide a todos · Lo revisan Compras, Jurídica y SST');
    expect(resumenDelRequisito({ ...requisitoNuevo('x'), areasQueRevisan: ['compras', 'juridica', 'sst', 'tesoreria'] }, contexto).linea).toBe(
      'Obligatorio · Se pide a todos · Lo revisan Compras, Jurídica y 2 más',
    );
  });

  it('con condición no repite «Se pide a todos»: la condición va aparte, en su etiqueta', () => {
    const condicion = predicado('tercero.tipoPersona', 'Igual', 'Juridica');
    expect(resumenDelRequisito({ ...requisitoNuevo('x'), condicion }, contexto).linea).toBe('Obligatorio · Lo revisan todas las áreas');
  });

  it('marca el soporte de secciones solo si el tipo respalda secciones y no está apagado ni es de una persona', () => {
    const etiquetas = (cambio = {}, tipo: { tipoCanonico: string | null } = rut) => resumenDelRequisito({ ...requisitoNuevo('x'), ...cambio }, { ...contexto, tipo }).etiquetas.map((e) => e.texto);
    expect(etiquetas()).toEqual(['Soporte de secciones']);
    expect(etiquetas({ usarComoSoporte: false })).toEqual([]);
    expect(etiquetas({}, { tipoCanonico: 'AUTORIZACION_TRATAMIENTO_DATOS' })).toEqual([]);
    expect(resumenDelRequisito(requisitoNuevo('x'), contexto).etiquetas).toEqual([]); // sin tipo (aún no se elige)
  });

  it('dice de quién es el documento de una persona relacionada', () => {
    const cedula = { tipoCanonico: 'CEDULA' };
    const etiquetas = (cambio = {}) => resumenDelRequisito({ ...requisitoNuevo('x'), ...cambio }, { ...contexto, tipo: cedula }).etiquetas.map((e) => e.texto);
    expect(etiquetas({ dePersonaRelacionada: 'RepresentanteLegal' })).toEqual(['Del representante legal']);
    expect(etiquetas({ dePersonaRelacionada: 'Socio', todasLasRelaciones: true })).toEqual(['Del socio o accionista (todas)']);
  });

  it('una sección con «Exige soporte» lo dice', () => {
    expect(resumenDelRequisito({ ...requisitoDeSeccionNuevo('FICHA_FINANCIERA'), exigeSoporte: true }, contexto).etiquetas).toEqual([{ clave: 'exigeSoporte', texto: 'Exige soporte' }]);
    expect(resumenDelRequisito(requisitoDeSeccionNuevo('FICHA_FINANCIERA'), contexto).etiquetas).toEqual([]);
  });
});
