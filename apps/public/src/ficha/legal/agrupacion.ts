import type { PersonaRelacionada, RolPersona } from '../tipos';

/**
 * Una persona, una tarjeta. La información legal guarda **una fila por rol** (así la leen los requisitos por persona, el cruce con los
 * documentos, la declaración PEP, las listas y el revisor), pero para el tercero quien es representante legal y además socio es UNA persona:
 * el diálogo la maneja con su rol y «¿También es socio o accionista?», y estas funciones mantienen sincronizadas las dos filas (la del rol y
 * la de Socio, con los mismos datos de identidad y el porcentaje solo en la de Socio). Ver «PS-1» del registro de decisiones.
 */

/** Dónde está cada fila de una persona dentro de `personas`. */
export interface TarjetaDePersona {
  /** La fila de la tarjeta: la del rol elegido o, si solo es socio, la de Socio. */
  indice: number;
  /** La fila de Socio de la misma persona (la propia si solo es socio); `null` si no es socio. */
  indiceSocio: number | null;
}

/** Tipo y número sin puntos, guiones ni espacios y en mayúsculas: lo que identifica a la persona. Sin número no hay clave (la fila no se une a otra). */
export function clavePersona(p: Pick<PersonaRelacionada, 'tipo_identificacion' | 'numero'>): string | null {
  const numero = (p.numero ?? '').toUpperCase().replace(/[\s.-]/g, '');
  return numero === '' ? null : `${(p.tipo_identificacion ?? '').trim().toUpperCase()}|${numero}`;
}

const esSocio = (p: PersonaRelacionada) => p.rol === 'Socio';

/** ¿La tarjeta es de alguien que solo es socio (su fila de Socio es la propia)? */
export const esSoloSocio = (t: TarjetaDePersona) => t.indiceSocio === t.indice;

/** Las posiciones de las filas de la tarjeta (una o dos). */
export const indicesDeLaTarjeta = (t: TarjetaDePersona): number[] => (t.indiceSocio === null || esSoloSocio(t) ? [t.indice] : [t.indice, t.indiceSocio]);

/** ¿La tarjeta junta dos filas (un rol y la de Socio)? */
export const tieneDosFilas = (t: TarjetaDePersona) => indicesDeLaTarjeta(t).length > 1;

/**
 * Las tarjetas de la lista, en el orden de sus filas: cada fila que no es de Socio, con la fila de Socio de la misma persona (mismo tipo y número); y los
 * socios que no tienen otra fila, solos. Una fila de Socio de una persona con varios roles se muestra en cada una de sus tarjetas.
 */
export function tarjetasDePersonas(personas: readonly PersonaRelacionada[]): TarjetaDePersona[] {
  const claves = personas.map(clavePersona);
  const socioDe = new Map<string, number>();
  personas.forEach((p, i) => {
    const clave = claves[i];
    if (esSocio(p) && clave !== null && clave !== undefined && !socioDe.has(clave)) socioDe.set(clave, i);
  });

  const absorbidas = new Set<number>();
  const tarjetas: TarjetaDePersona[] = [];
  personas.forEach((p, i) => {
    if (esSocio(p)) return;
    const clave = claves[i];
    const socio = clave === null || clave === undefined ? undefined : socioDe.get(clave);
    if (socio !== undefined) absorbidas.add(socio);
    tarjetas.push({ indice: i, indiceSocio: socio ?? null });
  });
  personas.forEach((p, i) => {
    if (esSocio(p) && !absorbidas.has(i)) tarjetas.push({ indice: i, indiceSocio: i });
  });
  return tarjetas.sort((a, b) => a.indice - b.indice);
}

/** Lo que abre el diálogo al editar una tarjeta: la persona (con su porcentaje, que vive en la fila de Socio) y si también es socio. */
export interface PersonaParaEditar {
  persona: PersonaRelacionada;
  tambienSocio: boolean;
}

export function personaParaEditar(personas: readonly PersonaRelacionada[], tarjeta: TarjetaDePersona): PersonaParaEditar {
  const fila = personas[tarjeta.indice] ?? {};
  if (esSoloSocio(tarjeta)) return { persona: fila, tambienSocio: false };
  const socio = tarjeta.indiceSocio === null ? undefined : personas[tarjeta.indiceSocio];
  // Con una fila de Socio, el porcentaje es el suyo. Sin ella, un porcentaje en la fila del rol (de antes: el diálogo lo pedía a todos) es una
  // participación declarada que nunca se guardó como socio: se ofrece como «también es socio» para que quede donde la cuenta el servidor.
  const persona: PersonaRelacionada = { ...fila };
  if (socio) {
    persona.porcentaje = socio.porcentaje ?? null;
    if (!persona.declaracion_pep && socio.declaracion_pep) persona.declaracion_pep = socio.declaracion_pep;
  }
  return { persona, tambienSocio: socio !== undefined || (fila.porcentaje !== null && fila.porcentaje !== undefined) };
}

/** La fila del rol elegido: el porcentaje solo vive en la fila de Socio. */
function filaDelRol(editada: PersonaRelacionada): PersonaRelacionada {
  const fila: PersonaRelacionada = { ...editada };
  if (!esSocio(editada)) delete fila.porcentaje;
  return fila;
}

/** La fila de Socio de una persona que además tiene otro rol: sus mismos datos de identidad y el porcentaje; sin lo propio del otro rol. */
function filaDeSocio(editada: PersonaRelacionada, porcentaje: number | null | undefined): PersonaRelacionada {
  const fila: PersonaRelacionada = { ...editada, rol: 'Socio', porcentaje: porcentaje ?? null };
  delete fila.tipo_representacion;
  delete fila.cargo;
  return fila;
}

/**
 * La lista con la persona del diálogo guardada. `tarjeta` es la que se editó (`null` = persona nueva) y `tambienSocio` lo que respondió.
 * - Con otro rol y «también es socio», quedan dos filas: la del rol y la de Socio (justo después), con el porcentaje en la de Socio.
 * - Sin «también es socio», la fila de Socio de esa persona se quita (solo al editar: al agregar no se borra nada que no se haya visto).
 * - Si elige el rol Socio, queda una sola fila (la de Socio) y se quita la que tenía de Socio aparte.
 * Una fila de Socio que ya existía con la misma identificación se reutiliza en vez de duplicarla.
 */
export function guardarPersona(personas: readonly PersonaRelacionada[], tarjeta: TarjetaDePersona | null, editada: PersonaRelacionada, tambienSocio: boolean): PersonaRelacionada[] {
  const filas = personas.map((fila) => ({ fila, quitar: false }));
  const nuevaFila = filaDelRol(editada);
  let posicion: number;
  if (tarjeta === null) {
    filas.push({ fila: nuevaFila, quitar: false });
    posicion = filas.length - 1;
  } else {
    filas[tarjeta.indice] = { fila: nuevaFila, quitar: false };
    posicion = tarjeta.indice;
  }

  // La fila de Socio de antes: la de la tarjeta o, si la persona es nueva en la lista, otra con su misma identificación.
  const clave = clavePersona(editada);
  const deLaTarjeta = tarjeta !== null && !esSoloSocio(tarjeta) ? tarjeta.indiceSocio : null;
  const porClave = clave === null ? -1 : personas.findIndex((p, i) => i !== tarjeta?.indice && esSocio(p) && clavePersona(p) === clave);
  const previa = deLaTarjeta ?? (porClave >= 0 ? porClave : null);

  if (esSocio(editada)) {
    if (deLaTarjeta !== null) filas[deLaTarjeta] = { fila: filas[deLaTarjeta]?.fila ?? {}, quitar: true };
  } else if (tambienSocio) {
    const socio = filaDeSocio(editada, editada.porcentaje);
    if (previa !== null) filas[previa] = { fila: socio, quitar: false };
    else filas.splice(posicion + 1, 0, { fila: socio, quitar: false });
  } else if (tarjeta !== null && previa !== null) {
    filas[previa] = { fila: filas[previa]?.fila ?? {}, quitar: true };
  }
  return filas.filter((f) => !f.quitar).map((f) => f.fila);
}

/** La lista sin la persona: su fila y la de Socio (salvo que otro de sus roles siga en la lista y la necesite). */
export function quitarPersona(personas: readonly PersonaRelacionada[], tarjeta: TarjetaDePersona): PersonaRelacionada[] {
  const quitar = new Set<number>([tarjeta.indice]);
  const clave = clavePersona(personas[tarjeta.indice] ?? {});
  const otraFilaDeLaPersona = clave !== null && personas.some((p, i) => i !== tarjeta.indice && !esSocio(p) && clavePersona(p) === clave);
  if (tarjeta.indiceSocio !== null && (esSoloSocio(tarjeta) || !otraFilaDeLaPersona)) quitar.add(tarjeta.indiceSocio);
  return personas.filter((_p, i) => !quitar.has(i));
}

/** Los roles de la tarjeta, en el orden en que se muestran: el de su fila y, si también es socio, Socio. */
export function rolesDeLaTarjeta(personas: readonly PersonaRelacionada[], tarjeta: TarjetaDePersona): RolPersona[] {
  const roles: RolPersona[] = [];
  const rol = personas[tarjeta.indice]?.rol;
  if (rol) roles.push(rol);
  if (tarjeta.indiceSocio !== null && !esSoloSocio(tarjeta)) roles.push('Socio');
  return roles;
}

/** Combina el mensaje de una ruta de las filas de la tarjeta: el de la primera fila que tenga uno (el de la identidad sale de las dos filas por igual). */
export function mensajeDeLaTarjeta(mensaje: (ruta: string) => string | null, tarjeta: TarjetaDePersona, campo = ''): string | null {
  for (const i of indicesDeLaTarjeta(tarjeta)) {
    const texto = mensaje(campo === '' ? `personas[${String(i)}]` : `personas[${String(i)}].${campo}`);
    if (texto) return texto;
  }
  return null;
}

/** ¿Hay un error o faltante del servidor bajo el prefijo (`declaracion_pep`) en alguna de las filas de la tarjeta? */
export const hayEnLaTarjeta = (hayEnRuta: (prefijo: string) => boolean, tarjeta: TarjetaDePersona, prefijo: string): boolean =>
  indicesDeLaTarjeta(tarjeta).some((i) => hayEnRuta(`personas[${String(i)}].${prefijo}`));
