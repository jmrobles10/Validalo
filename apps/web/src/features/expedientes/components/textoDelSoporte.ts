import type { SeccionRespaldadaDto, SoporteDeSeccionesDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';

export const SECCION_CUENTAS = 'CUENTAS_BANCARIAS';

/**
 * La cuenta que tiene su cruce se resume en una línea con su nombre (`cuentasEnSuTarjeta`: la tarjeta de la cuenta designada ya trae la comparación): no hace falta
 * repetirla en «Respalda: …».
 */
export const enLineaDeResumen = (respaldada: SeccionRespaldadaDto, cuentasEnSuTarjeta: boolean): boolean =>
  cuentasEnSuTarjeta && respaldada.seccion === SECCION_CUENTAS && respaldada.cruce !== null;

/** Las cuentas no son una sección con versiones: su nombre ya dice cuál es («Cuenta de Bancolombia ****5678», FD-5). */
export function nombreDeSeccionRespaldada(respaldada: SeccionRespaldadaDto, t: TFunction, corto = false): string {
  if (respaldada.seccion === SECCION_CUENTAS) return respaldada.nombre;
  return respaldada.version === null
    ? t(corto ? 'cruce.soporte.seccionSinDiligenciarCorta' : 'cruce.soporte.seccionSinDiligenciar', { seccion: respaldada.nombre })
    : t('cruce.soporte.seccion', { seccion: respaldada.nombre, n: String(respaldada.version) });
}

/**
 * «Respalda: Información general (versión 3) · …»: qué respalda el documento, en una línea; `null` si no respalda ninguna sección (o las que respalda ya van en su línea de
 * resumen, ver {@link enLineaDeResumen}).
 */
export function textoDeRespaldo(soporte: SoporteDeSeccionesDto | null | undefined, t: TFunction, cuentasEnSuTarjeta = false): string | null {
  const secciones = (soporte?.secciones ?? []).filter((s) => !enLineaDeResumen(s, cuentasEnSuTarjeta));
  if (secciones.length === 0) return null;
  return t('cruce.soporte.respalda', { secciones: secciones.map((s) => nombreDeSeccionRespaldada(s, t, true)).join(' · ') });
}
