import { declaracionActiva, esObjeto, tieneValor } from './formato';

/** Una fila de `personas` de la información legal. */
export type FilaPersona = Record<string, unknown>;

/** Las filas de una misma persona (la misma identificación), cada una con su posición dentro de `personas`. */
export interface PersonaAgrupada {
  filas: readonly { indice: number; fila: FilaPersona }[];
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor.trim() : '');

/** Tipo y número sin puntos, guiones ni espacios y en mayúsculas: lo que identifica a la persona. Sin número no hay clave (el elemento no se une a ningún otro). */
export function claveDeIdentificacion(tipo: unknown, numero: unknown): string | null {
  const limpio = texto(numero).toUpperCase().replace(/[\s.-]/g, '');
  return limpio === '' ? null : `${texto(tipo).toUpperCase()}|${limpio}`;
}

export const clavePersona = (fila: FilaPersona): string | null => claveDeIdentificacion(fila.tipo_identificacion, fila.numero);

const esSocio = (fila: FilaPersona) => fila.rol === 'Socio';

/** Un elemento de una lista con su posición en ella. */
export interface ElementoConPosicion<T> {
  indice: number;
  elemento: T;
}

/**
 * Agrupa por identificación lo que la ficha guarda **una vez por rol** (las filas de la información legal, las relaciones de la persona con el vínculo): quien es representante legal
 * y además socio ocupa dos y es UNA persona. Dentro de cada grupo van primero los elementos de rol y al final los de Socio; los grupos, en el orden de su primer elemento; un elemento sin
 * clave queda solo. Es la regla que comparten la ficha del tercero y las personas relacionadas del vínculo.
 */
export function agruparPorIdentificacion<T>(elementos: readonly T[], claveDe: (elemento: T) => string | null, esDeSocio: (elemento: T) => boolean): ElementoConPosicion<T>[][] {
  const grupos: ElementoConPosicion<T>[][] = [];
  const porClave = new Map<string, ElementoConPosicion<T>[]>();
  elementos.forEach((elemento, indice) => {
    const clave = claveDe(elemento);
    const existente = clave === null ? undefined : porClave.get(clave);
    if (existente) {
      existente.push({ indice, elemento });
      return;
    }
    const grupo = [{ indice, elemento }];
    grupos.push(grupo);
    if (clave !== null) porClave.set(clave, grupo);
  });
  return grupos
    .map((g) => [...g.filter((x) => !esDeSocio(x.elemento)), ...g.filter((x) => esDeSocio(x.elemento))])
    .sort((a, b) => (a[0]?.indice ?? 0) - (b[0]?.indice ?? 0));
}

/**
 * Una persona, una tarjeta. La información legal guarda **una fila por rol**: quien es representante legal y además socio ocupa dos filas con los mismos datos de
 * identidad. El portal del tercero ya las junta (`tarjetasDePersonas`, «PS-1»: cada fila que no es de Socio con la de Socio de la misma identificación, y los socios que no
 * tienen otra fila, solos); aquí, para leerlas, se junta además todo lo que comparta identificación (un representante que también es suplente es la misma persona). Las
 * filas de una persona van con las de rol primero y la de Socio al final; las personas, en el orden de su primera fila. Una fila sin número queda sola.
 */
export function agruparPersonas(personas: readonly FilaPersona[]): PersonaAgrupada[] {
  return agruparPorIdentificacion(personas, clavePersona, esSocio).map((filas) => ({ filas: filas.map((f) => ({ indice: f.indice, fila: f.elemento })) }));
}

/** ¿Lo guardado en la sección son solo personas (y nada más que mostrar)? Entonces el título «Datos» sobra: «Personas relacionadas» ya lo dice. */
export const soloTienePersonas = (datos: Record<string, unknown>): boolean => {
  const claves = Object.entries(datos).filter(([, v]) => tieneValor(v)).map(([k]) => k);
  return claves.length > 0 && claves.every((k) => k === 'personas');
};

/** Un dato de la persona: su clave, su valor y, si es propio de un rol (tipo de representación, cargo, participación), de cuál; `sinDato` si es obligatorio y está vacío. */
export interface DatoDePersona {
  clave: string;
  valor: unknown;
  /** El rol de la fila de la que sale, solo para lo que es propio de cada rol. */
  rol: string | null;
  sinDato: boolean;
}

/** Un rol de la persona (el de cada una de sus filas). */
export interface RolDePersona {
  rol: string;
}

/** Lo que la tarjeta de una persona muestra, ya reunido de todas sus filas. */
export interface ResumenDePersona {
  /** Nombres y apellidos (o la razón social de una sociedad); vacío si ninguna fila los trae. */
  nombre: string;
  /** «CC 1073250322»; `null` sin número. El DV va en los datos. */
  identificacion: string | null;
  roles: RolDePersona[];
  /** TODO lo que tiene valor (y lo obligatorio que falta) en el orden del formulario del portal. */
  datos: DatoDePersona[];
  /** La declaración jurada PEP activa (una por persona: la de la primera fila que la tiene) y la posición de esa fila en `personas`, para descargar su PDF. */
  declaracion: { indice: number; datos: Record<string, unknown> } | null;
}

/** Lo propio de cada rol: si la persona tiene dos, cada uno se rotula con su rol. */
const POR_ROL = new Set(['tipo_representacion', 'porcentaje', 'cargo']);

/** El orden del formulario del portal («Agregar persona») de lo que no va arriba de la tarjeta (nombre, identificación y rol). */
const ORDEN_DE_DATOS = ['tipo_representacion', 'porcentaje', 'dv', 'cargo', 'pep', 'vinculo_pep', 'fecha_expedicion', 'lugar_expedicion', 'fecha_nacimiento', 'nacionalidad', 'residencia', 'correo', 'telefono'];

/** Lo que va arriba de la tarjeta (o aparte): no se repite como dato, salvo que falte. */
const ARRIBA = ['rol', 'tipo_identificacion', 'numero', 'nombres', 'apellidos'];
const ORDEN_COMPLETO = [...ARRIBA, ...ORDEN_DE_DATOS];

/** Los campos de una persona que la API marca como faltantes (`personas[2].pep` ⇒ de la fila 2: `pep`), por posición en `personas`. */
export function faltantesPorFila(rutas: readonly (string | null | undefined)[]): Map<number, Set<string>> {
  const porFila = new Map<number, Set<string>>();
  for (const ruta of rutas) {
    const coincide = /^personas\[(\d+)\]\.([a-z_]+)$/.exec(ruta ?? '');
    if (!coincide) continue;
    const indice = Number(coincide[1]);
    porFila.set(indice, (porFila.get(indice) ?? new Set<string>()).add(coincide[2] ?? ''));
  }
  return porFila;
}

export function resumirPersona(persona: PersonaAgrupada, faltantes: ReadonlyMap<number, ReadonlySet<string>> = new Map()): ResumenDePersona {
  const filas = persona.filas.map((f) => f.fila);
  const algun = (clave: string): unknown => filas.map((f) => f[clave]).find(tieneValor);
  const tipo = texto(algun('tipo_identificacion'));
  const numero = texto(algun('numero'));
  const conDeclaracion = persona.filas.find((f) => declaracionActiva(f.fila) !== null);

  const datos: DatoDePersona[] = [];
  const agregar = (dato: DatoDePersona) => {
    if (!datos.some((d) => d.clave === dato.clave && d.rol === dato.rol)) datos.push(dato);
  };
  // Lo que trae valor: lo compartido sale una vez (el de la primera fila que lo trae); lo propio de un rol, una vez por rol.
  for (const clave of ORDEN_DE_DATOS) {
    if (POR_ROL.has(clave)) {
      for (const { fila } of persona.filas) if (tieneValor(fila[clave])) agregar({ clave, valor: fila[clave], rol: texto(fila.rol) || null, sinDato: false });
    } else if (clave === 'pep' || clave === 'vinculo_pep') {
      // Un «Sí» en cualquiera de las filas es «Sí»; el «No» de las demás no lo pisa.
      const respuestas = filas.map((f) => f[clave]).filter((v) => v === true || v === false);
      if (respuestas.length > 0) agregar({ clave, valor: respuestas.includes(true), rol: null, sinDato: false });
    } else if (tieneValor(algun(clave))) {
      agregar({ clave, valor: algun(clave), rol: null, sinDato: false });
    }
  }
  // Una clave que el esquema agregue y aquí no esté también se muestra, al final: «todo lo llenado».
  for (const { fila } of persona.filas) {
    for (const [clave, valor] of Object.entries(fila)) {
      if (ORDEN_COMPLETO.includes(clave) || clave === 'declaracion_pep' || !tieneValor(valor) || esObjeto(valor)) continue;
      agregar({ clave, valor, rol: null, sinDato: false });
    }
  }
  // Lo obligatorio que está vacío (lo dice la API): «Sin dato».
  for (const { indice, fila } of persona.filas) {
    for (const clave of faltantes.get(indice) ?? []) {
      if (tieneValor(fila[clave]) || (!POR_ROL.has(clave) && tieneValor(algun(clave)))) continue;
      agregar({ clave, valor: null, rol: POR_ROL.has(clave) ? texto(fila.rol) || null : null, sinDato: true });
    }
  }

  const posicion = (clave: string) => {
    const i = ORDEN_COMPLETO.indexOf(clave);
    return i === -1 ? ORDEN_COMPLETO.length : i;
  };
  return {
    nombre: [texto(algun('nombres')), texto(algun('apellidos'))].filter(Boolean).join(' '),
    identificacion: numero === '' ? null : `${tipo ? `${tipo} ` : ''}${numero}`,
    roles: persona.filas.flatMap(({ fila }) => (typeof fila.rol === 'string' && fila.rol !== '' ? [{ rol: fila.rol }] : [])),
    datos: datos.map((d, llegada) => ({ d, llegada })).sort((a, b) => posicion(a.d.clave) - posicion(b.d.clave) || a.llegada - b.llegada).map((x) => x.d),
    declaracion: conDeclaracion ? { indice: conDeclaracion.indice, datos: declaracionActiva(conDeclaracion.fila) ?? {} } : null,
  };
}
