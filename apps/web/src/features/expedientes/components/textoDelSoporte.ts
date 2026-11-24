import type { SeccionRespaldadaDto, SoporteDeSeccionesDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';

/** Las cuentas no son una sección con versiones: su nombre ya dice cuál es («Cuenta de Bancolombia ****5678», FD-5). */
export function nombreDeSeccionRespaldada(respaldada: SeccionRespaldadaDto, t: TFunction, corto = false): string {
  if (respaldada.seccion === 'CUENTAS_BANCARIAS') return respaldada.nombre;
  return respaldada.version === null
    ? t(corto ? 'cruce.soporte.seccionSinDiligenciarCorta' : 'cruce.soporte.seccionSinDiligenciar', { seccion: respaldada.nombre })
    : t('cruce.soporte.seccion', { seccion: respaldada.nombre, n: String(respaldada.version) });
}

/** «Respalda: Información general (versión 3) · …»: qué respalda el documento, en una línea; `null` si no respalda ninguna sección. */
export function textoDeRespaldo(soporte: SoporteDeSeccionesDto | null | undefined, t: TFunction): string | null {
  if (!soporte || soporte.secciones.length === 0) return null;
  return t('cruce.soporte.respalda', { secciones: soporte.secciones.map((s) => nombreDeSeccionRespaldada(s, t, true)).join(' · ') });
}
