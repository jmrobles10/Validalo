import type { ComparticionPublicaDto, DocumentoBovedaDto, VersionDocumentoDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { formatearDiaCivil } from '@validalo/ui';
import { estadoDeVigencia, textoVigencia } from '../vigencia/vigencia';
import type { SolicitudDeSubida } from './solicitudDeSubida';
import { MAXIMO_PAGINAS } from './subida';

/** Por qué se devolvió una versión, en lenguaje del tercero y con qué hacer (BO-4). */
export function mensajeDevolucion(version: Pick<VersionDocumentoDto, 'motivoDevolucion' | 'detalleDevolucion'>, t: TFunction): string {
  switch (version.motivoDevolucion) {
    case 'pdf-con-contenido-activo':
      return t('boveda.devolucion.pdf-con-contenido-activo');
    case 'demasiadas-paginas':
      // Con un tipo que limita sus páginas, el detalle de la API dice el límite del tipo y cuántas trae el PDF.
      return version.detalleDevolucion ?? t('boveda.devolucion.demasiadas-paginas', { max: String(MAXIMO_PAGINAS) });
    default:
      return version.detalleDevolucion ?? t('boveda.devolucion.otro');
  }
}

const SITUACIONES = [
  'NoRecibe',
  'SinVigente',
  'TieneVigente',
  'AproboVigente',
  'Revisando',
  'Observada',
  'RevalidaRetirada',
  'Revalida',
  'PorRevalidar',
  'TieneOtra',
] as const;

export type Situacion = (typeof SITUACIONES)[number];

/** Una situación que la API agregue después se lee por lo que ya se sabe: la tiene o no la tiene. */
function situacionDe(c: Pick<ComparticionPublicaDto, 'situacion' | 'compartido'>): Situacion {
  return SITUACIONES.find((s) => s === c.situacion) ?? (c.compartido ? 'TieneVigente' : 'NoRecibe');
}

const BASES = ['Aprobacion', 'FechaExpedicion', 'FechaCarga', 'Ratificacion', 'VencimientoPropio'] as const;

/**
 * Qué tiene cada empresa de este documento y qué falta, en una sola frase que no contradice la versión vigente de la cabecera
 * (RT-5): «Aprobó la versión 8, que retiraste. Debe revisar la versión 7: revalidación abierta.», «Tiene la versión 7, la
 * vigente.», «Revisando la versión 7.». Su propio vencimiento solo se dice si difiere del de la cabecera
 * (`venceEnCabecera`) y siempre con su porqué: cada empresa cuenta la vigencia con su regla (TD-6).
 */
export function detalleComparticion(c: ComparticionPublicaDto, t: TFunction, venceEnCabecera: string | null = null): string {
  const texto = t(`boveda.situacion.${situacionDe(c)}`, { version: String(c.version ?? ''), otra: String(c.otraVersion ?? '') });
  const vence = venceAparte(c, venceEnCabecera, t);
  return vence ? `${texto} ${vence}` : texto;
}

/** Cómo se pinta lo que tiene una empresa de un documento: el tono del chip y si hay algo que hacer (entonces se explica en una línea). */
export type TonoDeComparticion = 'exito' | 'advertencia' | 'neutro';

const TONO_DE_SITUACION: Record<Situacion, TonoDeComparticion> = {
  NoRecibe: 'neutro',
  SinVigente: 'advertencia',
  TieneVigente: 'neutro',
  AproboVigente: 'exito',
  Revisando: 'advertencia',
  Observada: 'advertencia',
  RevalidaRetirada: 'advertencia',
  Revalida: 'advertencia',
  PorRevalidar: 'advertencia',
  TieneOtra: 'neutro',
};

/** Situaciones que piden algo del tercero (subir, corregir o esperar una revalidación): solo ahí se muestra la frase larga bajo el chip. */
const PIDEN_ACCION: readonly Situacion[] = ['SinVigente', 'Observada', 'RevalidaRetirada', 'Revalida', 'PorRevalidar'];

/** En qué situación está una empresa con este documento, con qué tono se pinta y si pide algo del tercero (lo comparten el chip y los resúmenes). */
export function clasificarComparticion(c: Pick<ComparticionPublicaDto, 'situacion' | 'compartido'>): { situacion: Situacion; tono: TonoDeComparticion; pideAccion: boolean } {
  const situacion = situacionDe(c);
  return { situacion, tono: TONO_DE_SITUACION[situacion], pideAccion: PIDEN_ACCION.includes(situacion) };
}

/**
 * Lo que tiene una empresa de este documento en pocas palabras para su chip («aprobada v1», «revisa v2», «no la exige»), con el tono que
 * le toca, y si hay algo que hacer. La frase completa sigue siendo {@link detalleComparticion}.
 */
export function resumenCorto(c: ComparticionPublicaDto, t: TFunction): { texto: string; tono: TonoDeComparticion; pideAccion: boolean } {
  const { situacion, tono, pideAccion } = clasificarComparticion(c);
  return { texto: t(`boveda.corto.${situacion}`, { version: String(c.version ?? ''), otra: String(c.otraVersion ?? '') }), tono, pideAccion };
}

/** El vencimiento propio de la empresa para la versión vigente, solo si ya pasó o difiere del de la cabecera. */
function venceAparte(c: ComparticionPublicaDto, venceEnCabecera: string | null, t: TFunction): string | null {
  const vigencia = c.vigencia;
  if (!c.versionActualCompartida || !vigencia?.vigenteHasta) return null;
  const estado = estadoDeVigencia(vigencia);
  if (estado === 'EnGracia' || estado === 'Vencida') return `${textoVigencia(vigencia, t) ?? ''}.`;
  if (estado === 'SinVencimiento' || vigencia.vigenteHasta === venceEnCabecera) return null;
  const fecha = formatearDiaCivil(vigencia.vigenteHasta);
  const base = BASES.find((b) => b === vigencia.base);
  return base ? t(`boveda.vence.${base}`, { fecha }) : t('boveda.vence.otra', { fecha });
}

/** La fecha de vencimiento que dice la cabecera (la más próxima entre las empresas); nula si la versión no vence. */
export function venceEnCabecera(documento: Pick<DocumentoBovedaDto, 'versionActual'>): string | null {
  return documento.versionActual?.vigencia?.vigenteHasta ?? null;
}

/**
 * Si las empresas que tienen la versión vigente la vencen en fechas distintas, la empresa cuya fecha es la más próxima (la de la
 * cabecera); nulo si todas coinciden. Explica por qué la cabecera y alguna fila no dicen lo mismo.
 */
export function empresaConLaFechaMasProxima(documento: Pick<DocumentoBovedaDto, 'porEmpresa'>): string | null {
  const conFecha = documento.porEmpresa.filter((c) => c.versionActualCompartida && c.vigencia?.vigenteHasta);
  const fechas = new Set(conFecha.map((c) => c.vigencia?.vigenteHasta));
  if (fechas.size < 2) return null;
  const primera = [...conFecha].sort((a, b) => (a.vigencia?.vigenteHasta ?? '').localeCompare(b.vigencia?.vigenteHasta ?? ''))[0];
  return primera?.empresa.nombre ?? null;
}

/** Se puede retirar la vigente o una superada (BO-8); devueltas y retiradas no. */
export function sePuedeRetirar(version: Pick<VersionDocumentoDto, 'estado'>): boolean {
  return version.estado === 'Actual' || version.estado === 'Superada';
}

/**
 * Se puede descargar lo que quedó en la bóveda (no lo devuelto, que está en cuarentena, ni lo retirado). Un formulario
 * no tiene archivo (la API respondería 409 `version-sin-archivo`).
 */
export function sePuedeDescargar(version: Pick<VersionDocumentoDto, 'estado'> & Partial<Pick<VersionDocumentoDto, 'clase'>>): boolean {
  return (version.estado === 'Actual' || version.estado === 'Superada') && version.clase !== 'Formulario';
}

/**
 * Se sube una versión nueva desde la bóveda. Un formulario se actualiza desde la revisión de la empresa, que sabe qué
 * campos pide. La API marca la clase en la versión (el documento llega como `Archivo`).
 */
export function sePuedeSubirVersion(documento: Pick<DocumentoBovedaDto, 'clase' | 'versionActual'>): boolean {
  return documento.clase !== 'Formulario' && documento.versionActual?.clase !== 'Formulario';
}

/** Lo que se le pide al diálogo de subida para subir la versión nueva de un documento de la bóveda. */
export function solicitudDeNuevaVersion(documento: Pick<DocumentoBovedaDto, 'id' | 'tipo'>): SolicitudDeSubida {
  return { documento: documento.id, tipo: documento.tipo.codigo };
}
