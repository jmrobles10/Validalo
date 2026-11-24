import { esErrorApi, type AprobacionDeCuentaDto, type CertificacionDeCuentaDelVinculoDto, type CuentaDesignadaDto } from '@validalo/api-client';
import type { EstadoCuentaDesignada } from '@validalo/ui';
import type { TFunction } from 'i18next';
import { cuentas } from '../../../i18n/es-CO-cuentas';
import { mensajeDeError } from '../../../shared/errores';

type CodigoCuenta = keyof typeof cuentas.errores;
const esCodigoCuenta = (codigo: string): codigo is CodigoCuenta => codigo in cuentas.errores;

/**
 * Los códigos que comparte con expedientes (`aprobador-repetido`, `usuario-delegado-requerido`…) tienen aquí su texto
 * propio de cuentas; el resto lo resuelve el ErrorMapper general.
 */
export function mensajeErrorCuenta(error: unknown, t: TFunction): string {
  if (esErrorApi(error) && esCodigoCuenta(error.codigo)) return t(`cuentas.errores.${error.codigo}`);
  return mensajeDeError(error, t);
}

const ESTADOS: readonly EstadoCuentaDesignada[] = ['Propuesta', 'Aprobada', 'Rechazada', 'Reemplazada'];
export const esEstadoCuenta = (valor: string): valor is EstadoCuentaDesignada => ESTADOS.some((e) => e === valor);

const TIPOS = ['Ahorros', 'Corriente'] as const;
type TipoCuenta = (typeof TIPOS)[number];
const esTipoCuenta = (valor: string): valor is TipoCuenta => TIPOS.some((e) => e === valor);

/** «Ahorros» / «Corriente»; un tipo nuevo de la API se muestra tal cual. */
export const textoTipoCuenta = (tipo: string, t: TFunction) => (esTipoCuenta(tipo) ? t(`cuentas.tipos.${tipo}`) : tipo);

/** El número completo solo viene a quien tiene `cuentas:aprobar`; a los demás, los últimos 4 dígitos. */
export const numeroVisible = (cuenta: Pick<CuentaDesignadaDto, 'numero' | 'numeroEnmascarado'>) => cuenta.numero ?? cuenta.numeroEnmascarado;

/** «Carlos Cumplimiento y Diana Tesorería»; quien ya no existe en la empresa aparece sin nombre. */
export function nombresDe(aprobaciones: readonly AprobacionDeCuentaDto[], t: TFunction): string {
  const nombres = aprobaciones.map((a) => a.nombre ?? t('cuentas.personaSinNombre'));
  return new Intl.ListFormat('es-CO', { style: 'long', type: 'conjunction' }).format(nombres);
}

/** Si quien consulta ya aprobó la propuesta (la API no le deja aprobar dos veces). */
export const yaAprobo = (cuenta: CuentaDesignadaDto, usuarioId: string | null) =>
  usuarioId !== null && cuenta.aprobaciones.some((a) => a.usuarioId.toLowerCase() === usuarioId.toLowerCase());

const VERIFICACIONES = ['SinAnalisis', 'Coincide', 'Discrepa', 'NoVerificable', 'NoSeLee'] as const;

/** Lo que concluyó la lectura de la certificación frente a la cuenta (el resumen de `CertificacionDeCuentaDelVinculoDto.verificacion`). */
export type VerificacionDeCuenta = (typeof VERIFICACIONES)[number];

export const esVerificacionDeCuenta = (valor: string): valor is VerificacionDeCuenta => VERIFICACIONES.some((v) => v === valor);

/** Las etiquetas de los campos críticos que difieren entre la cuenta y su certificación (número, titular, que el titular sea el tercero, estado de la cuenta). */
export function camposCriticosQueDifieren(certificacion: Pick<CertificacionDeCuentaDelVinculoDto, 'cruce'>): string[] {
  return (certificacion.cruce?.campos ?? []).filter((c) => c.critico && c.resultado === 'Discrepa').map((c) => c.etiqueta);
}
