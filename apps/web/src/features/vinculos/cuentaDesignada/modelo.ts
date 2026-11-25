import { esErrorApi, type AprobacionDeCuentaDto, type CertificacionDeCuentaDelVinculoDto, type CuentaDesignadaDto } from '@validalo/api-client';
import type { EstadoCuentaDesignada } from '@validalo/ui';
import type { TFunction } from 'i18next';
import { cuentas } from '../../../i18n/es-CO-cuentas';
import { mensajeDeError } from '../../../shared/errores';
import { resumirCruce, textoDelResumen, tonoDelResumen, type ResumenDeCruce, type TonoDelResumen } from '../../expedientes/resumenDeCruce';

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

/** Las etiquetas de los campos críticos que difieren entre la cuenta y su certificación (número, titular, su identificación, que el titular sea el tercero). */
export function camposCriticosQueDifieren(certificacion: Pick<CertificacionDeCuentaDelVinculoDto, 'cruce'>): string[] {
  return (certificacion.cruce?.campos ?? []).filter((c) => c.critico && c.resultado === 'Discrepa').map((c) => c.etiqueta);
}

/** Lo que dice la certificación de la cuenta, en una línea: no hay lectura que cotejar, o lo que concluyó el cruce con lo declarado (por lo crítico). */
export type ResumenDeCertificacion = { tipo: 'sinLectura' } | { tipo: 'cruce'; cruce: ResumenDeCruce };

/**
 * Resume la certificación de la cuenta a partir de su cruce campo por campo (no del `verificacion` de la API, que cuenta como diferencia también lo que no es crítico):
 * sin lectura de la empresa, nada que resumir; con ella, ver {@link resumirCruce}.
 */
export function resumirCertificacion(certificacion: Pick<CertificacionDeCuentaDelVinculoDto, 'verificacion' | 'sinAnalisis' | 'cruce'>): ResumenDeCertificacion {
  const { cruce } = certificacion;
  if (certificacion.sinAnalisis || !cruce) return { tipo: 'sinLectura' };
  return { tipo: 'cruce', cruce: resumirCruce({ campos: cruce.campos, legible: cruce.legible && certificacion.verificacion !== 'NoSeLee' }) };
}

/** Error si un crítico difiere; advertencia si algo crítico quedó sin verificar, no se lee o no hay lectura; éxito si todo lo crítico coincide. */
export const tonoDeCertificacion = (resumen: ResumenDeCertificacion): TonoDelResumen => (resumen.tipo === 'sinLectura' ? 'advertencia' : tonoDelResumen(resumen.cruce.resultado));

/** La comparación campo por campo se abre sola solo cuando un campo crítico no coincide: es lo que quien aprueba no puede pasar por alto. */
export const debeAbrirLaComparacion = (resumen: ResumenDeCertificacion): boolean => resumen.tipo === 'cruce' && resumen.cruce.resultado === 'Discrepa';

/** La frase del resumen: «coincide en número y titular · falta verificar: identificación». */
export const textoDeCertificacion = (resumen: ResumenDeCertificacion, t: TFunction): string =>
  resumen.tipo === 'sinLectura' ? t('cuentas.certificacion.sinLectura') : textoDelResumen(resumen.cruce, t);
