import type { PropuestaDeSeccionDto, SoporteSeccionDto } from '@validalo/api-client';
import type { DocumentoDeSoporte } from './secciones';

/**
 * Actualizar desde el documento (F5, FM-14): lo que la versión vigente de un documento (RUT, Cámara…) propone para una sección.
 * La API ya trae los campos distintos y la sección con esos cambios; aquí solo se ordena para mostrarlo. Nada se guarda solo.
 */

/** Cómo se nombra el documento en «Actualizar desde mi …»; los demás usan su nombre. */
const NOMBRES_CORTOS: Readonly<Record<string, string>> = {
  RUT: 'RUT',
  CAMARA_COMERCIO: 'Cámara de Comercio',
  ESTADOS_FINANCIEROS: 'estados financieros',
  CEDULA: 'cédula',
};

export function nombreCortoDelDocumento(propuesta: Pick<PropuestaDeSeccionDto, 'documento'>): string {
  return NOMBRES_CORTOS[propuesta.documento.tipoDocumento.toUpperCase()] ?? propuesta.documento.nombreDocumento;
}

/** Los datos de la sección ya con lo propuesto (snake_case), listos para prellenar el formulario; nulo si la propuesta no los trae. */
export function datosDePropuesta(propuesta: Pick<PropuestaDeSeccionDto, 'datos'>): Record<string, unknown> | null {
  const datos = propuesta.datos;
  return datos !== null && typeof datos === 'object' && !Array.isArray(datos) ? (datos as Record<string, unknown>) : null;
}

/** El documento que se leyó queda como soporte de la versión que el tercero guarde (la API pone el tipo). */
export function soporteDePropuesta(propuesta: Pick<PropuestaDeSeccionDto, 'documento'>): SoporteSeccionDto {
  return { documentoId: propuesta.documento.documentoId, version: propuesta.documento.version };
}

export const mismoSoporte = (a: Pick<SoporteSeccionDto, 'documentoId' | 'version'>, b: Pick<SoporteSeccionDto, 'documentoId' | 'version'>) =>
  a.documentoId === b.documentoId && a.version === b.version;

/** Clave estable de una propuesta (documento, versión, sección y periodo). */
export const clavePropuesta = (p: PropuestaDeSeccionDto) => `${p.documento.documentoId}-${String(p.documento.version)}-${p.seccion}-${String(p.periodo ?? '')}`;

/** Las propuestas de un mismo documento (y versión): un aviso por documento, con las secciones que afecta. */
export interface PropuestasDeDocumento {
  clave: string;
  /** Cómo se nombra el documento («RUT», «Cámara de Comercio»). */
  documento: string;
  version: number;
  propuestas: PropuestaDeSeccionDto[];
  /** Datos distintos en total (suma de las secciones que sí se pudieron leer). */
  datosDistintos: number;
  /** Alguna sección no pudo leerse automáticamente. */
  hayNoLeidas: boolean;
}

/** Agrupa por documento y versión conservando el orden de la API (la primera aparición manda). */
export function agruparPorDocumento(propuestas: readonly PropuestaDeSeccionDto[]): PropuestasDeDocumento[] {
  const grupos = new Map<string, PropuestasDeDocumento>();
  for (const propuesta of propuestas) {
    const clave = `${propuesta.documento.documentoId}-${String(propuesta.documento.version)}`;
    const grupo = grupos.get(clave) ?? { clave, documento: nombreCortoDelDocumento(propuesta), version: propuesta.documento.version, propuestas: [], datosDistintos: 0, hayNoLeidas: false };
    grupo.propuestas.push(propuesta);
    if (propuesta.disponible) grupo.datosDistintos += propuesta.campos.length;
    else grupo.hayNoLeidas = true;
    grupos.set(clave, grupo);
  }
  return [...grupos.values()];
}

// ---------- Un documento que el tercero acaba de subir desde la sección (FD-10) ----------

/** Por qué no hay lectura de un documento (`PropuestaDeSeccionDto.motivo`). */
export const MOTIVO_SIN_LECTURA = 'sin-lectura-automatica';
export const MOTIVO_ILEGIBLE = 'documento-ilegible';

/**
 * Cuánto se espera la lectura de un documento. Es un objeto (y no constantes) para que las pruebas lo acorten: la lectura corre en segundo plano al
 * subirlo y, sin plan de IA o sin cupo, nunca llega.
 */
export const TIEMPOS_DE_LECTURA = {
  /** Cada cuánto se vuelve a preguntar mientras la IA lee un documento. */
  cadaMs: 3000,
  /** Cuántas veces se pregunta por un documento que ya estaba en la bóveda (≈ 30 s). */
  maximoDeEsperas: 10,
  /** Cuánto se espera la lectura de un documento que el tercero acaba de subir desde la sección, antes de decir que no se pudo. */
  trasSubirMs: 45_000,
};

/** El documento que el tercero acaba de subir como soporte de la sección y lo que se espera de su lectura. */
export interface SoporteSubido {
  documentoId: string;
  version: number;
  /** Canónico con el que se subió (`RUT`, `CAMARA_COMERCIO`…). */
  tipo: DocumentoDeSoporte;
  /** Cuándo terminó la subida (ms): una consulta anterior no dice nada de este documento. */
  desde: number;
  /** ¿Se espera que la IA lo lea? No si ninguna empresa lo recibió (no hay quien pague el análisis) ni si el tercero no es de Colombia. */
  esperaLectura: boolean;
}

/** Lo que la sección le dice al tercero de la lectura del documento que acaba de subir. */
export type LecturaDelSoporte =
  | { estado: 'leyendo' }
  | { estado: 'propuesta'; propuesta: PropuestaDeSeccionDto }
  /** La IA lo leyó y no se alcanza: conviene subir una copia más clara. */
  | { estado: 'ilegible' }
  /** Sin lectura automática (sin plan, sin cupo, falló o no terminó a tiempo): se diligencia con el documento a la vista. */
  | { estado: 'sin-lectura' }
  /** Se leyó y no trae nada distinto a lo que la sección ya tiene. */
  | { estado: 'sin-diferencias' };

export const esDelSoporte = (propuesta: Pick<PropuestaDeSeccionDto, 'documento'>, subido: Pick<SoporteSubido, 'documentoId' | 'version'>) =>
  propuesta.documento.documentoId === subido.documentoId && propuesta.documento.version === subido.version;

/** Cuánto lleva esperándose la lectura del documento subido, y si ya pasó el tiempo. */
export const lecturaVencida = (subido: Pick<SoporteSubido, 'desde'>, ahora: number) => ahora - subido.desde >= TIEMPOS_DE_LECTURA.trasSubirMs;

/**
 * Qué mostrar de la lectura del documento recién subido. La API solo propone lo que cambia, así que «no aparece» es «no hay nada distinto» solo cuando la
 * consulta ya es posterior a la subida (`actualizadaEn`); y una propuesta sin lectura (`sin-lectura-automatica`) es «leyendo» mientras corre el tiempo de espera
 * y alguien pueda pagar el análisis. Ilegible y fallida son definitivas: no se espera nada.
 */
export function lecturaDelSoporte(subido: SoporteSubido, propuestas: readonly PropuestaDeSeccionDto[] | undefined, actualizadaEn: number, ahora: number): LecturaDelSoporte {
  const propuesta = propuestas?.find((p) => esDelSoporte(p, subido));
  if (propuesta?.disponible) return { estado: 'propuesta', propuesta };
  const vencida = lecturaVencida(subido, ahora);
  if (!propuesta) {
    if (!subido.esperaLectura) return { estado: 'sin-lectura' };
    if (actualizadaEn < subido.desde) return vencida ? { estado: 'sin-lectura' } : { estado: 'leyendo' };
    return { estado: 'sin-diferencias' };
  }
  if (propuesta.motivo === MOTIVO_ILEGIBLE) return { estado: 'ilegible' };
  return propuesta.motivo === MOTIVO_SIN_LECTURA && subido.esperaLectura && !vencida ? { estado: 'leyendo' } : { estado: 'sin-lectura' };
}
