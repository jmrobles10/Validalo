import type { TipoDocumentoTenantDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { SECTORES_DE_REQUISITO, sectorDeDocumento, sectorDeSeccion, type SectorDeRequisito } from '../vinculos/ficha/sectores';
import type { ErrorFlujo, RequisitoEnEditor } from './editor';
import { seccionesQueRespalda } from './requisitosDeSeccion';

/**
 * «Lo que pide el flujo» por sector, como el menú lateral de la ficha del vínculo: cada requisito cae en el sector donde el revisor lo ve en la
 * ficha (`sectorDeRequisito` / `sectorDeSeccion` de `vinculos/ficha/sectores`, el mismo mapeo); los documentos de un tipo propio sin sector van al
 * final, en «Otros documentos», y el documento recién agregado que aún no tiene tipo, en «Por completar», al principio. Una sección siempre está en el
 * sector de su código. Es solo una forma de mostrar: el borrador conserva sus requisitos en el orden en que se guardan y los errores siguen
 * apuntando a su posición.
 */

/** El grupo transitorio del documento nuevo al que aún no se le elige el tipo: sin tipo no hay sector. */
export const POR_COMPLETAR = 'porCompletar';

/** Donde se ve un requisito: un sector de la ficha o «Por completar». */
export type SectorEnVista = SectorDeRequisito | typeof POR_COMPLETAR;

/** Dónde se muestra, mientras no tengan tipo, los documentos recién agregados desde un sector (clave del requisito → sector). */
export type UbicacionesProvisionales = Readonly<Record<string, SectorDeRequisito>>;

/** Un requisito con su posición en el borrador (los errores y los cambios van por posición). */
export interface EntradaDeRequisito {
  indice: number;
  requisito: RequisitoEnEditor;
}

/** Los requisitos de un sector: primero las secciones de la información y después los documentos, cada uno en el orden del borrador. */
export interface GrupoDeSector {
  sector: SectorEnVista;
  secciones: EntradaDeRequisito[];
  documentos: EntradaDeRequisito[];
}

/** El sector de un tipo de documento (el de su canónico; uno propio, el de la primera sección que respalda o «sin sector»). */
export function sectorDelTipo(tipo: Pick<TipoDocumentoTenantDto, 'tipoCanonico'>): SectorDeRequisito {
  return sectorDeDocumento(tipo.tipoCanonico, seccionesQueRespalda(tipo.tipoCanonico)[0]);
}

/**
 * El sector de un requisito del editor: una sección, el de su código (nunca «sin sector»); un documento de una persona relacionada, Información legal;
 * un documento, el de su tipo. Un documento sin tipo aún se queda en el sector donde se agregó (`provisionales`) o, si no se agregó desde uno, en
 * «Por completar»; con un tipo que no se encuentra (inactivo, o la lista aún no llega), en «sin sector».
 */
export function sectorDelRequisito(requisito: RequisitoEnEditor, tipos: readonly TipoDocumentoTenantDto[], provisionales: UbicacionesProvisionales = {}): SectorEnVista {
  if (requisito.seccion !== null) return sectorDeSeccion(requisito.seccion);
  if (requisito.dePersonaRelacionada !== null) return 'legal';
  const tipo = tipos.find((x) => x.id === requisito.tipoDocumentoTenantId);
  if (tipo) return sectorDelTipo(tipo);
  return provisionales[requisito.clave] ?? (requisito.tipoDocumentoTenantId === '' ? POR_COMPLETAR : 'documentos');
}

/** Los requisitos agrupados: «Por completar» primero y después los sectores en el orden del menú lateral; los grupos sin requisitos no salen. */
export function agruparPorSector(requisitos: readonly RequisitoEnEditor[], tipos: readonly TipoDocumentoTenantDto[], provisionales: UbicacionesProvisionales = {}): GrupoDeSector[] {
  const orden: readonly SectorEnVista[] = [POR_COMPLETAR, ...SECTORES_DE_REQUISITO];
  const grupos = new Map<SectorEnVista, GrupoDeSector>(orden.map((sector) => [sector, { sector, secciones: [], documentos: [] }]));
  requisitos.forEach((requisito, indice) => {
    const grupo = grupos.get(sectorDelRequisito(requisito, tipos, provisionales));
    if (grupo) (requisito.seccion !== null ? grupo.secciones : grupo.documentos).push({ indice, requisito });
  });
  return [...grupos.values()].filter((g) => g.secciones.length + g.documentos.length > 0);
}

/** Los requisitos en el orden en que se ven: sector por sector, con la sección primero. */
export const entradasEnOrdenVisual = (grupos: readonly GrupoDeSector[]): EntradaDeRequisito[] => grupos.flatMap((g) => [...g.secciones, ...g.documentos]);

/** El nombre del sector como en el menú lateral de la ficha; los documentos sin sector, «Otros documentos», y el grupo del documento nuevo, «Por completar». */
export function nombreDelSector(sector: SectorEnVista, t: TFunction): string {
  if (sector === POR_COMPLETAR) return t('flujoRequisitos.porCompletar');
  return sector === 'documentos' ? t('flujoRequisitos.otros') : t(`vinculos.ficha.sector.${sector}`);
}

export interface ConteoDeRequisitos {
  documentos: number;
  secciones: number;
  /** Los que no se piden a todos: una condición («Se pide a» distinto de «Todos»). */
  conCondicion: number;
}

export function contarRequisitos(requisitos: readonly Pick<RequisitoEnEditor, 'seccion' | 'condicion'>[]): ConteoDeRequisitos {
  const secciones = requisitos.filter((r) => r.seccion !== null).length;
  return { documentos: requisitos.length - secciones, secciones, conCondicion: requisitos.filter((r) => r.condicion !== null).length };
}

/** «14 documentos · 2 secciones · 3 con condición»: solo lo que hay (sin ceros) y, las condiciones, si se piden. */
export function textoDelConteo(conteo: ConteoDeRequisitos, t: TFunction, conCondicion = false): string {
  return [
    conteo.documentos > 0 ? t('flujoRequisitos.resumen.documentos', { count: conteo.documentos }) : '',
    conteo.secciones > 0 ? t('flujoRequisitos.resumen.secciones', { count: conteo.secciones }) : '',
    conCondicion && conteo.conCondicion > 0 ? t('flujoRequisitos.resumen.conCondicion', { count: conteo.conCondicion }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

const PATRON_DE_REQUISITO = /^requisito\.(\d+)(?:\.|$)/;

/** Las posiciones de los requisitos que tienen algún error (`requisito.<k>`, `requisito.<k>.periodos`…), de menor a mayor. */
export function posicionesConError(errores: readonly Pick<ErrorFlujo, 'campo'>[]): number[] {
  const posiciones = new Set<number>();
  for (const { campo } of errores) {
    const encontrado = PATRON_DE_REQUISITO.exec(campo);
    if (encontrado?.[1] !== undefined) posiciones.add(Number(encontrado[1]));
  }
  return [...posiciones].sort((a, b) => a - b);
}

/**
 * Los tipos que se pueden ofrecer al agregar un documento a un sector: los de ese sector que el flujo aún no pide (el mismo tipo no se pide
 * dos veces al mismo destinatario; el de una persona relacionada es otro requisito).
 */
export function tiposPorPedirEnSector(sector: SectorDeRequisito, requisitos: readonly RequisitoEnEditor[], elegibles: readonly TipoDocumentoTenantDto[]): TipoDocumentoTenantDto[] {
  const pedidos = new Set(requisitos.filter((r) => r.seccion === null && r.dePersonaRelacionada === null).map((r) => r.tipoDocumentoTenantId));
  return elegibles.filter((tipo) => sectorDelTipo(tipo) === sector && !pedidos.has(tipo.id));
}
