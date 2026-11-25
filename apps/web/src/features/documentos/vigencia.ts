import type { VigenciaDto } from '@validalo/api-client';
import type { Estado } from '@validalo/ui';
import type { TFunction } from 'i18next';
import { plazoEnPalabras } from '../configuracion/tiposDocumento/resumen';
import { formatearFechaDeclarada } from './formatoDatos';

/** Estados de la vigencia de una versión para un vínculo (TD-6; calculados hoy, en UTC). */
export const ESTADOS_VIGENCIA = ['Vigente', 'PorVencer', 'EnGracia', 'Vencida', 'SinVencimiento'] as const;
export type EstadoVigencia = (typeof ESTADOS_VIGENCIA)[number];

/** De dónde sale la fecha de vencimiento. */
export const BASES_VIGENCIA = ['Aprobacion', 'Ratificacion', 'FechaExpedicion', 'FechaCarga', 'VencimientoPropio', 'SinVencimiento', 'PeriodoNoCalculado'] as const;
export type BaseVigencia = (typeof BASES_VIGENCIA)[number];

/** El cliente generado tipa `estado` y `base` como texto: se estrechan aquí y lo desconocido se ignora. */
function esUnoDe<T extends string>(valores: readonly T[], valor: string): valor is T {
  return (valores as readonly string[]).includes(valor);
}

export function estadoVigencia(vigencia: Pick<VigenciaDto, 'estado'>): EstadoVigencia | null {
  return esUnoDe(ESTADOS_VIGENCIA, vigencia.estado) ? vigencia.estado : null;
}

export function baseVigencia(vigencia: Pick<VigenciaDto, 'base'>): BaseVigencia | null {
  return esUnoDe(BASES_VIGENCIA, vigencia.base) ? vigencia.base : null;
}

/**
 * Estado canónico del design system que pinta cada estado de vigencia (ícono y tono; el texto va en `etiqueta`).
 * `EnGracia` ya venció pero aún se acepta: advertencia con un ícono distinto al de «Por vencer» para leerse sin color.
 */
export const CHIP_VIGENCIA: Readonly<Record<EstadoVigencia, Estado>> = {
  Vigente: 'Vigente',
  PorVencer: 'PorVencer',
  EnGracia: 'ConPendientes',
  Vencida: 'Vencida',
  SinVencimiento: 'NoAplica',
};

/** Estados que piden un aviso visible a quien revisa. */
export function requiereAviso(vigencia: Pick<VigenciaDto, 'estado'>): boolean {
  const estado = estadoVigencia(vigencia);
  return estado === 'PorVencer' || estado === 'EnGracia' || estado === 'Vencida';
}

/** Severidad del aviso: vencida es error; por vencer y en gracia, advertencia. */
export function severidadAviso(vigencia: Pick<VigenciaDto, 'estado'>): 'warning' | 'error' {
  return estadoVigencia(vigencia) === 'Vencida' ? 'error' : 'warning';
}

/** Las fechas de la vigencia son días calendario (`aaaa-mm-dd`): no se corren por la zona del tenant. */
const fecha = (valor: string) => formatearFechaDeclarada(valor);

/**
 * «Vence el 30/11/2026», «Venció el 30/11/2026»; sin fecha, «Vence 1 año después de que la apruebes» si el tipo se revalida cada N días y aún no la aprobaste
 * (TD-10), o «Sin fecha de vencimiento».
 */
export function textoVencimiento(vigencia: VigenciaDto, t: TFunction): string {
  if (!vigencia.vigenteHasta)
    return vigencia.revalidarCadaDias ? t('expedientes.vigencia.sinFechaPorAprobar', { plazo: plazoEnPalabras(vigencia.revalidarCadaDias, t) }) : t('expedientes.vigencia.sinFecha');
  const estado = estadoVigencia(vigencia);
  return estado === 'EnGracia' || estado === 'Vencida'
    ? t('expedientes.vigencia.vencio', { fecha: fecha(vigencia.vigenteHasta) })
    : t('expedientes.vigencia.vence', { fecha: fecha(vigencia.vigenteHasta) });
}

/**
 * Aún sin fecha porque el tipo se revalida cada N días y la empresa todavía no aprueba el documento (TD-10): la API lo manda como «sin vencimiento», pero sí vence, un
 * plazo después de la aprobación. No se debe decir «Sin vencimiento» ni «Este tipo de documento no vence».
 */
export function estaPorAprobar(vigencia: Pick<VigenciaDto, 'estado' | 'vigenteHasta' | 'revalidarCadaDias'>): boolean {
  return estadoVigencia(vigencia) === 'SinVencimiento' && !vigencia.vigenteHasta && Boolean(vigencia.revalidarCadaDias);
}

/** Texto corto del chip: el estado y, si la hay, la fecha que importa (en gracia, hasta cuándo se acepta). */
export function etiquetaVigencia(vigencia: VigenciaDto, t: TFunction): string {
  const estado = estadoVigencia(vigencia);
  if (!estado) return textoVencimiento(vigencia, t);
  if (estaPorAprobar(vigencia)) return t('expedientes.vigencia.porAprobar');
  const nombre = t(`expedientes.vigencia.estados.${estado}`);
  if (estado === 'EnGracia' && vigencia.finDeGracia) return `${nombre} · ${t('expedientes.vigencia.hasta', { fecha: fecha(vigencia.finDeGracia) })}`;
  if (estado === 'SinVencimiento' || !vigencia.vigenteHasta) return nombre;
  return `${nombre} · ${fecha(vigencia.vigenteHasta)}`;
}

/** Explicación de la fecha (tooltip o texto secundario): su base y los días de gracia. */
export function explicacionVigencia(vigencia: VigenciaDto, t: TFunction): string {
  const base = baseVigencia(vigencia);
  const partes: string[] = [];
  if (estaPorAprobar(vigencia)) partes.push(t('expedientes.vigencia.base.PorAprobar'));
  else if (base) partes.push(t(`expedientes.vigencia.base.${base}`));
  if (vigencia.diasGracia > 0 && vigencia.vigenteHasta) partes.push(t('expedientes.vigencia.gracia', { count: vigencia.diasGracia }));
  return partes.join(' ');
}

/** Texto del aviso visible (`null` si la vigencia no lo pide). */
export function textoAvisoVigencia(vigencia: VigenciaDto, t: TFunction): string | null {
  const hasta = vigencia.vigenteHasta ? fecha(vigencia.vigenteHasta) : null;
  switch (estadoVigencia(vigencia)) {
    case 'PorVencer':
      return hasta ? t('expedientes.vigencia.avisoPorVencer', { fecha: hasta }) : null;
    case 'EnGracia':
      return hasta && vigencia.finDeGracia
        ? t('expedientes.vigencia.avisoEnGracia', { fecha: hasta, finDeGracia: fecha(vigencia.finDeGracia) })
        : t('expedientes.vigencia.estados.EnGracia');
    case 'Vencida':
      return hasta ? t('expedientes.vigencia.avisoVencida', { fecha: hasta }) : t('expedientes.vigencia.avisoVencidaSinFecha');
    default:
      return null;
  }
}
