import type { CondicionDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { condicionDesdeAtributo, condicionDesdeFicha } from './condiciones';
import { camposDeFichaEnCondicion, fraseDeCondicion, unirEnFrase, type ContextoDeFrase } from './fraseDeCondicion';

const t = i18n.t.bind(i18n);
const predicado = (atributo: string, operador: string, ...valores: string[]): CondicionDto => ({ tipo: 'Predicado', nodos: null, atributo, operador, valores });
const grupo = (tipo: 'Y' | 'O' | 'No', ...nodos: CondicionDto[]): CondicionDto => ({ tipo, nodos, atributo: null, operador: null, valores: null });
const ESPECIALIDADES = 'ficha.especialidades.especialidades';

const NOMBRES: Readonly<Record<string, string>> = {
  G1: 'Asesores Técnicos y Diseñadores',
  G7: 'Obras civiles',
  'SRM-G3': 'Gestión de Residuos',
};
const conCatalogo: ContextoDeFrase = {
  t,
  etiquetaDeCampo: (ruta) => (ruta === ESPECIALIDADES ? 'Especialidades' : undefined),
  nombreDeValor: (ruta, codigo) => (ruta === ESPECIALIDADES ? NOMBRES[codigo] : undefined),
};
const frase = (c: CondicionDto | null, contexto: ContextoDeFrase = conCatalogo) => fraseDeCondicion(c, contexto);
const ficha = (modo: Parameters<typeof condicionDesdeFicha>[0]['modo'], ...valores: string[]) => condicionDesdeFicha({ campo: ESPECIALIDADES, modo, valores });

describe('«Se pide a» en una frase corta: la condición simple', () => {
  it('sin condición y con los atajos, dice a quién (también si la API trae el valor en minúscula)', () => {
    expect(frase(null)).toBe('Todos');
    expect(frase(predicado('tercero.tipoPersona', 'Igual', 'Juridica'))).toBe('Solo personas jurídicas');
    expect(frase(predicado('tercero.tipoPersona', 'Igual', 'natural'))).toBe('Solo personas naturales');
    expect(frase(grupo('Y'))).toBe('Todos');
  });

  it('una condición sobre la ficha nombra el campo como la API y cada valor con el nombre de su catálogo', () => {
    expect(frase(ficha('alguno', 'G1', 'G7'))).toBe('Si en Especialidades declara G1 · Asesores Técnicos y Diseñadores o G7 · Obras civiles');
    expect(frase(ficha('alguno', 'G1', 'SRM-G3', 'G7'))).toBe('Si en Especialidades declara G1 · Asesores Técnicos y Diseñadores, SRM-G3 · Gestión de Residuos o G7 · Obras civiles');
    expect(frase(ficha('todos', 'G1', 'G7'))).toBe('Si en Especialidades declara G1 · Asesores Técnicos y Diseñadores y G7 · Obras civiles');
    expect(frase(ficha('ninguno', 'G1', 'G7'))).toBe('Si en Especialidades no declara G1 · Asesores Técnicos y Diseñadores ni G7 · Obras civiles');
    expect(frase(ficha('declarado'))).toBe('Si Especialidades está declarado');
    expect(frase(ficha('noDeclarado'))).toBe('Si Especialidades no está declarado');
  });

  it('un valor que el catálogo aún no trae se queda con su código, y sin el nombre de la API usa el de las condiciones', () => {
    expect(frase(ficha('alguno', 'G1', 'ZZ'))).toBe('Si en Especialidades declara G1 · Asesores Técnicos y Diseñadores o ZZ');
    expect(frase(ficha('alguno', 'G7'), { t })).toBe('Si en especialidades declaradas declara G7');
    expect(frase(condicionDesdeFicha({ campo: 'ficha.general.ciiu', modo: 'alguno', valores: ['41'] }), { t })).toBe('Si en actividad económica (CIIU) declara 41');
    expect(frase(ficha('alguno'))).toBe('Si Especialidades: falta elegir los valores');
  });

  it('los sí y no de un booleano se dicen en español', () => {
    expect(frase(condicionDesdeFicha({ campo: 'ficha.tributaria.responsable_ica', modo: 'es', valores: ['true'] }), { t })).toBe('Si responsable de ICA es sí');
    expect(frase(condicionDesdeAtributo({ clave: 'critico', modo: 'es', valores: ['false'] }), { t })).toBe('Si critico es no');
  });

  it('una condición sobre un atributo del vínculo usa su clave y sus modos', () => {
    expect(frase(condicionDesdeAtributo({ clave: 'montoEstimado', modo: 'mayor', valores: ['500000000'] }))).toBe('Si montoEstimado es mayor que 500000000');
    expect(frase(condicionDesdeAtributo({ clave: 'montoEstimado', modo: 'entre', valores: ['1', '9'] }))).toBe('Si montoEstimado está entre 1 y 9');
    expect(frase(condicionDesdeAtributo({ clave: 'categorias', modo: 'ninguno', valores: ['Servicios', 'Obra'] }))).toBe('Si en categorias no declara Servicios ni Obra');
  });
});

describe('«Se pide a» en una frase corta: lo que no es de la ficha', () => {
  it('el tipo de persona se dice con palabras, sin el enum y sin repetir «persona»', () => {
    expect(frase(predicado('tercero.tipoPersona', 'En', 'Juridica', 'Natural'))).toBe('Si es persona jurídica o natural');
    expect(frase(predicado('tercero.tipoPersona', 'En', 'juridica', 'natural'))).toBe('Si es persona jurídica o natural');
    expect(frase(predicado('tercero.tipoPersona', 'En', 'Juridica', 'Consorcio'))).toBe('Si es persona jurídica o consorcio');
    expect(frase(predicado('tercero.tipoPersona', 'Distinto', 'Natural'))).toBe('Si no es persona natural');
    expect(frase(predicado('tercero.tipoPersona', 'NoEn', 'Natural', 'Consorcio'))).toBe('Si no es persona natural ni consorcio');
  });

  it('el país va por su nombre y «es extranjero» y los sí/no, en español', () => {
    expect(frase(predicado('tercero.pais', 'Distinto', 'CO'))).toBe('Si país no es Colombia');
    expect(frase(predicado('tercero.pais', 'En', 'PE', 'EC'))).toBe('Si país es Perú o Ecuador');
    expect(frase(predicado('tercero.esExtranjero', 'Igual', 'true'))).toBe('Si es extranjero');
    expect(frase(predicado('tercero.esExtranjero', 'Igual', 'false'))).toBe('Si no es extranjero');
    expect(frase(predicado('tercero.esExtranjero', 'Distinto', 'false'))).toBe('Si es extranjero');
  });

  it('un operador que no conoce se describe con las palabras de siempre y no deja una frase vacía', () => {
    expect(frase(predicado('tercero.pais', 'Raro', 'CO'))).toBe('Si país Raro CO');
  });
});

describe('«Se pide a» en una frase corta: la condición compuesta usa las mismas frases', () => {
  const natural = predicado('tercero.tipoPersona', 'Igual', 'Natural');

  it('«Y» junta las frases de cada comparación', () => {
    expect(frase(grupo('Y', ficha('alguno', 'SRM-G3'), natural))).toBe('Si en Especialidades declara SRM-G3 · Gestión de Residuos y es persona natural');
    expect(frase(grupo('Y', natural, predicado('tercero.pais', 'Igual', 'CO'), ficha('declarado')))).toBe('Si es persona natural y país es Colombia y Especialidades está declarado');
  });

  it('«O» las junta con «o»', () => {
    expect(frase(grupo('O', ficha('alguno', 'G1'), ficha('alguno', 'G7')))).toBe('Si en Especialidades declara G1 · Asesores Técnicos y Diseñadores o en Especialidades declara G7 · Obras civiles');
  });

  it('un grupo dentro de otro va entre paréntesis y «No» dice que no se cumple', () => {
    expect(frase(grupo('Y', natural, grupo('O', ficha('alguno', 'G1'), ficha('alguno', 'G7'))))).toBe(
      'Si es persona natural y (en Especialidades declara G1 · Asesores Técnicos y Diseñadores o en Especialidades declara G7 · Obras civiles)',
    );
    expect(frase(grupo('No', grupo('Y', natural, predicado('tercero.pais', 'Igual', 'CO'))))).toBe('Si no se cumple que (es persona natural y país es Colombia)');
    // Un «No» sobre una comparación de la ficha es su modo «no declara» y no necesita explicación.
    expect(frase(grupo('No', ficha('alguno', 'G1')))).toBe('Si en Especialidades no declara G1 · Asesores Técnicos y Diseñadores');
  });

  it('un grupo de un solo elemento se dice como ese elemento', () => {
    expect(frase(grupo('Y', natural))).toBe('Si es persona natural');
    expect(frase(grupo('O', ficha('alguno', 'G7')))).toBe('Si en Especialidades declara G7 · Obras civiles');
  });

  it('encuentra los campos de la ficha de una condición compuesta para pedir sus nombres', () => {
    expect(camposDeFichaEnCondicion(grupo('Y', ficha('alguno', 'G1', 'G7'), natural, grupo('O', condicionDesdeFicha({ campo: 'ficha.general.ciudad', modo: 'es', valores: ['Cali'] }))))).toEqual([
      { ruta: ESPECIALIDADES, valores: ['G1', 'G7'] },
      { ruta: 'ficha.general.ciudad', valores: ['Cali'] },
    ]);
    expect(camposDeFichaEnCondicion(natural)).toEqual([]);
  });

  it('une una lista en español', () => {
    expect(unirEnFrase(['a'], 'o', t)).toBe('a');
    expect(unirEnFrase(['a', 'b'], 'o', t)).toBe('a o b');
    expect(unirEnFrase(['a', 'b', 'c'], 'ni', t)).toBe('a, b ni c');
  });
});
