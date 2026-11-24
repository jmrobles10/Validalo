import type { CuentaBancariaPublicaDto, RequisitoPublicoDto } from '@validalo/api-client';
import { designacionesDelVinculo, esActiva, TIPO_CERTIFICACION } from '../cuentas/cuentas';

/**
 * El requisito «Certificación bancaria» del expediente (CB-8): no se sube a un documento suelto sino a la cuenta a la que pertenece. Cada cuenta lleva la suya; la empresa la recibe
 * cuando el tercero designa esa cuenta con ella, y de ahí sale lo que cubre el requisito. Solo el documento de la propia bóveda: el de una persona relacionada es de otro.
 */
export function esRequisitoDeCertificacionBancaria(requisito: Pick<RequisitoPublicoDto, 'tipoDocumento' | 'persona'>): boolean {
  return requisito.tipoDocumento.tipoCanonico === TIPO_CERTIFICACION && requisito.tipoDocumento.ambito === 'Global' && !requisito.persona;
}

/** Lo que sigue después de elegir una cuenta: subir su certificación o, si ya la tiene y la empresa aún no tiene cuenta, proponerla. */
export type PasoDeCertificacion = 'subir' | 'proponer';

/** La empresa del vínculo aún no tiene cuenta designada ni por aprobar (una rechazada no cuenta): hay que proponerle una. */
export function vinculoSinCuenta(vinculoId: string | null, cuentas: readonly CuentaBancariaPublicaDto[]): boolean {
  if (!vinculoId) return false;
  const { Aprobada: aprobada, Propuesta: propuesta } = designacionesDelVinculo(vinculoId, cuentas);
  return !aprobada && !propuesta;
}

/**
 * Qué toca tras elegir la cuenta: sin certificación, subirla; con ella, proponerla a la empresa si todavía no tiene cuenta, y si ya tiene una, subir una versión
 * nueva (la que corrige la observación de la empresa o reemplaza la anterior).
 */
export function pasoAlElegir(cuenta: CuentaBancariaPublicaDto, vinculoId: string | null, cuentas: readonly CuentaBancariaPublicaDto[]): PasoDeCertificacion {
  return !cuenta.faltaCertificacion && vinculoSinCuenta(vinculoId, cuentas) ? 'proponer' : 'subir';
}

/** Tras subir la certificación, se propone la cuenta a la empresa solo si aún no tiene una (la que ya tiene recibe la versión nueva sola). */
export function debeProponerTrasSubir(vinculoId: string | null, cuentas: readonly CuentaBancariaPublicaDto[]): boolean {
  return vinculoSinCuenta(vinculoId, cuentas);
}

/** La cuenta que la empresa ya tiene (aprobada o, si no, por aprobar): la que se sugiere al elegir. */
export function cuentaDeLaEmpresa(vinculoId: string | null, cuentas: readonly CuentaBancariaPublicaDto[]): CuentaBancariaPublicaDto | null {
  if (!vinculoId) return null;
  const { Aprobada: aprobada, Propuesta: propuesta } = designacionesDelVinculo(vinculoId, cuentas);
  const elegida = aprobada ?? propuesta ?? null;
  return elegida && cuentas.some((c) => c.id === elegida.cuenta.id && esActiva(c)) ? elegida.cuenta : null;
}
