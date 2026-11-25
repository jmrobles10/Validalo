import type { CondicionDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { atajoDe, condicionDeAtributoSimple, condicionDeFichaSimple, describirCondicion, modoLlevaValores, type ModoDeAtributo } from './condiciones';

/**
 * «Se pide a» en una frase corta y legible, para la fila de un requisito: «Si en Especialidades declara G3 · Gestión de Residuos y es persona natural».
 * Una sola forma de decirlo para la condición simple y para la compuesta (Y / O / No): cada comparación es un fragmento que sigue a «Si» (o a «y» / «o»),
 * con el nombre del campo, los valores con el nombre que les da su catálogo y lo que es un código o un enum, traducido (persona jurídica, sí/no, el país).
 */

type Conector = 'o' | 'y' | 'ni';

/** Une una lista en español: «a», «a o b», «a, b o c» (el conector es «o», «y» o «ni»). */
export function unirEnFrase(elementos: readonly string[], conector: Conector, t: TFunction): string {
  const palabra = t(`flujoRequisitos.condicion.conectores.${conector}`);
  if (elementos.length <= 1) return elementos.join('');
  return `${elementos.slice(0, -1).join(', ')} ${palabra} ${elementos.at(-1) ?? ''}`;
}

export interface ContextoDeFrase {
  t: TFunction;
  /** El nombre que la API le pone a un campo de la ficha («Especialidades»); sin él, el de las condiciones. */
  etiquetaDeCampo?: (ruta: string) => string | undefined;
  /** El nombre que el catálogo del campo le pone a un valor («Gestión de Residuos» para el código `G3`); sin él, el código solo. */
  nombreDeValor?: (ruta: string, codigo: string) => string | undefined;
}

/** Un campo de la ficha que mira una condición y los valores con que lo compara (para pedir sus nombres al catálogo). */
export interface CampoDeFichaEnCondicion {
  ruta: string;
  valores: string[];
}

/** Los campos de la ficha que mira una condición, simple o compuesta. */
export function camposDeFichaEnCondicion(condicion: CondicionDto): CampoDeFichaEnCondicion[] {
  const simple = condicionDeFichaSimple(condicion);
  if (simple) return [{ ruta: simple.campo, valores: simple.valores }];
  return (condicion.nodos ?? []).flatMap(camposDeFichaEnCondicion);
}

const MODO_DE_OPERADOR: Readonly<Record<string, ModoDeAtributo>> = {
  Igual: 'es',
  Distinto: 'noEs',
  En: 'esUnoDe',
  NoEn: 'noEsNingunoDe',
  ContieneAlguno: 'alguno',
  ContieneTodos: 'todos',
  Existe: 'declarado',
  Mayor: 'mayor',
  Menor: 'menor',
  Entre: 'entre',
};

const CONECTOR_DEL_MODO: Partial<Record<ModoDeAtributo, Conector>> = { todos: 'y', ninguno: 'ni', noEsNingunoDe: 'ni' };

const TIPO_DE_PERSONA = 'tercero.tipoPersona';
const ES_EXTRANJERO = 'tercero.esExtranjero';
const PAIS_DEL_TERCERO = 'tercero.pais';
const PERSONAS: Readonly<Record<string, 'Juridica' | 'Natural' | 'Consorcio'>> = { juridica: 'Juridica', natural: 'Natural', consorcio: 'Consorcio' };

const esVerdadero = (valor: string | undefined) => valor?.toLowerCase() === 'true';
const esBooleano = (valor: string) => ['true', 'false'].includes(valor.toLowerCase());

/** El país por su nombre («CO» → «Colombia»); lo que no sea un código de país queda como viene. */
function nombreDePais(codigo: string): string {
  if (!/^[A-Za-z]{2}$/.test(codigo)) return codigo;
  try {
    return new Intl.DisplayNames(['es-CO'], { type: 'region' }).of(codigo.toUpperCase()) ?? codigo;
  } catch {
    return codigo;
  }
}

/** Cómo se llama un campo de la ficha cuando la API no lo dio: su nombre de siempre en las condiciones o el último tramo de su ruta. */
function etiquetaPorOmision(ruta: string, t: TFunction): string {
  const conocida: string = t(`flujos.condicion.atributos.${ruta}`, { defaultValue: '' });
  return conocida || (ruta.split('.').at(-1) ?? ruta);
}

/** Una comparación sobre un campo o un atributo en una frase: «en Especialidades declara G1 o G7», «es persona natural». */
function fraseDeModo(modo: ModoDeAtributo, campo: string, valores: readonly string[], t: TFunction): string {
  if (modoLlevaValores(modo) && valores.length === 0) return t('flujoRequisitos.condicion.sinValores', { campo });
  return t(`flujoRequisitos.condicion.${modo}`, {
    campo,
    valores: unirEnFrase(valores, CONECTOR_DEL_MODO[modo] ?? 'o', t),
    desde: valores[0] ?? '…',
    hasta: valores[1] ?? '…',
  });
}

/** «es persona jurídica o natural», «no es persona natural»: el tipo de persona sin el enum (y sin repetir «persona»). */
function frasePersona(condicion: CondicionDto, t: TFunction): string | null {
  const modo = MODO_DE_OPERADOR[condicion.operador ?? ''];
  if (modo !== 'es' && modo !== 'noEs' && modo !== 'esUnoDe' && modo !== 'noEsNingunoDe') return null;
  const nombres = (condicion.valores ?? []).map((v) => {
    const persona = PERSONAS[v.toLowerCase()];
    return persona ? t(`flujoRequisitos.condicion.personas.${persona}`) : v;
  });
  if (nombres.length === 0) return null;
  // «persona jurídica o persona natural» se dice «persona jurídica o natural».
  const prefijo = 'persona ';
  const lista = nombres.length > 1 && nombres.every((n) => n.startsWith(prefijo)) ? nombres.map((n, i) => (i === 0 ? n : n.slice(prefijo.length))) : nombres;
  const negado = modo === 'noEs' || modo === 'noEsNingunoDe';
  return t(negado ? 'flujoRequisitos.condicion.personaNoEs' : 'flujoRequisitos.condicion.personaEs', { valores: unirEnFrase(lista, negado ? 'ni' : 'o', t) });
}

interface Fragmento {
  texto: string;
  /** `y` u `o` si el fragmento es un grupo de varios (va entre paréntesis dentro de otro); `null` si es una comparación. */
  grupo: 'y' | 'o' | null;
}

const comparacion = (texto: string): Fragmento => ({ texto, grupo: null });
const enParentesis = (f: Fragmento) => (f.grupo ? `(${f.texto})` : f.texto);

/** Un predicado que no es de la ficha ni un atributo del vínculo: el tipo de persona, el país, «es extranjero»… con sus valores traducidos. */
function fragmentoDelPredicado(condicion: CondicionDto, { t }: ContextoDeFrase): Fragmento {
  const atributo = condicion.atributo ?? '';
  const valores = condicion.valores ?? [];
  if (atributo === TIPO_DE_PERSONA) {
    const persona = frasePersona(condicion, t);
    if (persona) return comparacion(persona);
  }
  if (atributo === ES_EXTRANJERO && valores.length === 1 && (condicion.operador === 'Igual' || condicion.operador === 'Distinto')) {
    const extranjero = esVerdadero(valores[0]) === (condicion.operador === 'Igual');
    return comparacion(t(extranjero ? 'flujoRequisitos.condicion.extranjeroEs' : 'flujoRequisitos.condicion.extranjeroNoEs'));
  }
  const modo = MODO_DE_OPERADOR[condicion.operador ?? ''];
  if (!modo) return comparacion(describirCondicion(condicion, t));
  const legibles = valores.map((v) => (atributo === PAIS_DEL_TERCERO ? nombreDePais(v) : esBooleano(v) ? t(`flujos.condicion.valor${esVerdadero(v) ? 'Si' : 'No'}`) : v));
  return comparacion(fraseDeModo(modo, etiquetaPorOmision(atributo, t), legibles, t));
}

function fragmento(condicion: CondicionDto, contexto: ContextoDeFrase): Fragmento {
  const { t } = contexto;
  const ficha = condicionDeFichaSimple(condicion);
  if (ficha) {
    const campo = contexto.etiquetaDeCampo?.(ficha.campo) ?? etiquetaPorOmision(ficha.campo, t);
    const legibles = ficha.valores.map((v) => {
      if (esBooleano(v)) return t(`flujos.condicion.valor${esVerdadero(v) ? 'Si' : 'No'}`);
      const nombre = contexto.nombreDeValor?.(ficha.campo, v);
      return nombre ? `${v} · ${nombre}` : v;
    });
    return comparacion(fraseDeModo(ficha.modo, campo, legibles, t));
  }
  const atributo = condicionDeAtributoSimple(condicion);
  if (atributo) {
    const legibles = atributo.valores.map((v) => (esBooleano(v) ? t(`flujos.condicion.valor${esVerdadero(v) ? 'Si' : 'No'}`) : v));
    return comparacion(fraseDeModo(atributo.modo, atributo.clave, legibles, t));
  }
  const tipo = condicion.tipo.toLowerCase();
  const hijos = condicion.nodos ?? [];
  if ((tipo === 'y' || tipo === 'o') && hijos.length > 0) {
    const partes = hijos.map((h) => fragmento(h, contexto));
    const [unica] = partes;
    if (partes.length === 1 && unica) return unica;
    const conector = tipo === 'y' ? 'y' : 'o';
    return { texto: partes.map(enParentesis).join(` ${t(`flujoRequisitos.condicion.conectores.${conector}`)} `), grupo: conector };
  }
  const negada = hijos[0];
  if (tipo === 'no' && negada) return comparacion(t('flujoRequisitos.condicion.noSeCumple', { condicion: enParentesis(fragmento(negada, contexto)) }));
  if (tipo === 'predicado') return fragmentoDelPredicado(condicion, contexto);
  return comparacion(describirCondicion(condicion, t));
}

/**
 * «Se pide a» en una frase: «Todos», «Solo personas jurídicas» y «Solo personas naturales» para los atajos y, para cualquier otra condición (de la ficha, de
 * un atributo del vínculo, compuesta), «Si …» con sus comparaciones legibles.
 */
export function fraseDeCondicion(condicion: CondicionDto | null, contexto: ContextoDeFrase): string {
  const { t } = contexto;
  if (condicion === null) return t('flujos.editor.requisitos.atajos.siempre');
  const atajo = atajoDe(condicion);
  if (atajo === 'siempre' || atajo === 'juridica' || atajo === 'natural') return t(`flujos.editor.requisitos.atajos.${atajo}`);
  return t('flujoRequisitos.condicion.si', { condicion: fragmento(condicion, contexto).texto });
}
