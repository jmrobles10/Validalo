import type { UsoIaDiaDto, UsoIaDto } from '@validalo/api-client';
import { claveDia, LOCALE, ZONA_HORARIA_POR_DEFECTO } from '@validalo/ui';

/** El panel de uso de OpenAI, donde la empresa ve lo que de verdad se le cobra y el saldo y el límite de su llave. */
export const URL_USO_OPENAI = 'https://platform.openai.com/usage';

/** Meses que ofrece el selector: el actual y los 11 anteriores. */
export const MESES_SELECTOR = 12;
/** Desde aquí la barra de las incluidas pasa a ámbar (el backend avisa al 80 % y al 100 %, IA-4). */
export const UMBRAL_ALERTA = 80;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Mes calendario `aaaa-mm` de hoy en la zona dada (la del tenant; Bogotá por omisión). */
export function mesActual(ahora: Date = new Date(), zona = ZONA_HORARIA_POR_DEFECTO): string {
  return claveDia(ahora, zona).slice(0, 7);
}

/** `2026-11` → `[2026, 11]`. */
function partesMes(mes: string): [number, number] {
  return [Number(mes.slice(0, 4)), Number(mes.slice(5, 7))];
}

/** El mes y los `cantidad - 1` anteriores, del más reciente al más antiguo. */
export function ultimosMeses(actual: string, cantidad = MESES_SELECTOR): string[] {
  const [anio, mes] = partesMes(actual);
  return Array.from({ length: cantidad }, (_, i) => {
    const fecha = new Date(Date.UTC(anio, mes - 1 - i, 1));
    return `${String(fecha.getUTCFullYear())}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

/** Mes de la URL (`?mes=`) si es uno de los que ofrece el selector; si no, `null` (el actual). */
export function leerMes(params: URLSearchParams, opciones: readonly string[]): string | null {
  const mes = params.get('mes');
  return mes && MES.test(mes) && opciones.includes(mes) ? mes : null;
}

/** `2026-11` → «Noviembre de 2026». */
export function etiquetaMes(mes: string): string {
  const texto = new Intl.DateTimeFormat(LOCALE, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${mes}-01T00:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** El contrato admite los decimales de .NET como número o texto; un campo opcional que falta vale cero. */
export function aNumero(valor: number | string | null | undefined): number {
  if (valor === null || valor === undefined) return 0;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * Costo de IA de todas las validaciones del mes (IA-15): el de los análisis de cada validación, sea cual sea el origen del análisis. Es un solo total (lo pagado con la
 * llave de la empresa más lo atribuido por las validaciones que recibió ya analizadas); la empresa no ve el desglose, solo la consola de Plataforma.
 */
export function costoAtribuido(uso: UsoIaDto): number {
  return aNumero(uso.costoUsd) + aNumero(uso.costoReutilizadoUsd);
}

export interface TokensAtribuidos {
  entrada: number;
  enCache: number;
  salida: number;
}

/** Tokens de todas las validaciones del mes (entrada, entrada en caché y salida), en un solo total cada uno. */
export function tokensAtribuidos(uso: UsoIaDto): TokensAtribuidos {
  return {
    entrada: aNumero(uso.tokensEntrada) + aNumero(uso.tokensEntradaReutilizados),
    enCache: aNumero(uso.tokensEntradaEnCache) + aNumero(uso.tokensEntradaEnCacheReutilizados),
    salida: aNumero(uso.tokensSalida) + aNumero(uso.tokensSalidaReutilizados),
  };
}

/** Porcentaje usado de las incluidas (sin incluidas, cualquier consumo ya es el 100 %). */
export function porcentajeUsado(usadas: number, incluidas: number): number {
  if (incluidas <= 0) return usadas > 0 ? 100 : 0;
  return (usadas / incluidas) * 100;
}

export type NivelUso = 'normal' | 'alerta' | 'agotado';

export function nivelDeUso(porcentaje: number): NivelUso {
  if (porcentaje >= 100) return 'agotado';
  return porcentaje >= UMBRAL_ALERTA ? 'alerta' : 'normal';
}

const ENTERO = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const PORCENTAJE = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });
const USD_CENTAVOS = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const USD_FINO = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'USD', minimumFractionDigits: 4, maximumFractionDigits: 4 });

export function formatearConteo(valor: number): string {
  return ENTERO.format(valor);
}

/** `92` → «92 %» (es-CO). */
export function formatearPorcentaje(porcentaje: number): string {
  return PORCENTAJE.format(porcentaje / 100);
}

/** Dólares en es-CO; bajo 1 USD con 4 decimales para que no se vea «US$ 0,00». */
export function formatearUsd(valor: number | string): string {
  const numero = aNumero(valor);
  return Math.abs(numero) < 1 ? USD_FINO.format(numero) : USD_CENTAVOS.format(numero);
}

export interface DiaDeUso {
  dia: number;
  incluidas: number;
  adicionales: number;
}

/** Todos los días del mes con lo consumido (la API solo trae los días con uso). */
export function serieDelMes(mes: string, porDia: readonly UsoIaDiaDto[]): DiaDeUso[] {
  const [anio, numeroMes] = partesMes(mes);
  const dias = new Date(Date.UTC(anio, numeroMes, 0)).getUTCDate();
  const porFecha = new Map(porDia.map((d) => [d.fecha.slice(0, 10), d]));
  return Array.from({ length: dias }, (_, i) => {
    const dato = porFecha.get(`${mes}-${String(i + 1).padStart(2, '0')}`);
    return { dia: i + 1, incluidas: dato?.incluidas ?? 0, adicionales: dato?.adicionales ?? 0 };
  });
}

/** Total de validaciones de un día. */
export const totalDelDia = (d: DiaDeUso): number => d.incluidas + d.adicionales;

/** Validaciones del mes y cuántos días tuvieron al menos una: lo que se dice junto al título de la serie. */
export function resumenDeLaSerie(serie: readonly DiaDeUso[]): { validaciones: number; diasConUso: number } {
  return { validaciones: serie.reduce((suma, d) => suma + totalDelDia(d), 0), diasConUso: serie.filter((d) => totalDelDia(d) > 0).length };
}

/** `2026-11` + `5` → «5 nov»: la fecha corta del eje y del tooltip (sin el punto con que algunos meses abrevian). */
export function fechaCorta(mes: string, dia: number): string {
  const [anio, numeroMes] = partesMes(mes);
  const abreviado = new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(anio, numeroMes - 1, 1))).replace('.', '');
  return `${String(dia)} ${abreviado}`;
}

/** `2026-11` → «noviembre de 2026» (en minúscula: va dentro del título de la serie). */
export function mesEnTitulo(mes: string): string {
  return etiquetaMes(mes).toLocaleLowerCase(LOCALE);
}

/** Dónde queda cada día del mes respecto de hoy: ya pasó, es hoy o aún no llega. Un mes que no es el actual es entero del pasado (el selector no ofrece meses futuros). */
export type MomentoDelDia = 'pasado' | 'hoy' | 'futuro';

export function momentosDelMes(mes: string, dias: number, ahora: Date = new Date(), zona = ZONA_HORARIA_POR_DEFECTO): MomentoDelDia[] {
  const hoy = claveDia(ahora, zona);
  const delMesActual = hoy.slice(0, 7) === mes;
  const dia = Number(hoy.slice(8, 10));
  return Array.from({ length: dias }, (_, i) => (!delMesActual ? 'pasado' : i + 1 < dia ? 'pasado' : i + 1 === dia ? 'hoy' : 'futuro'));
}

/** Marcas enteras del eje de las validaciones por día: 0 y el máximo, y la mitad si es un entero y hay espacio para que se lea (máximo par de 4 o más). */
export function marcasDelEje(maximo: number): number[] {
  const tope = Math.max(1, Math.ceil(maximo));
  return tope >= 4 && tope % 2 === 0 ? [0, tope / 2, tope] : [0, tope];
}

/**
 * Etiquetas de fecha del eje de los días: el 1 y los múltiplos de 5 como fecha corta («1 nov», «5 nov»…). La columna de hoy no lleva fecha (lleva «Hoy», que pone quien dibuja)
 * y las marcas a menos de dos días de hoy se omiten para que no se encimen. `null` = el día no lleva etiqueta de fecha.
 */
export function etiquetasDelEje(mes: string, momentos: readonly MomentoDelDia[]): (string | null)[] {
  const indiceHoy = momentos.indexOf('hoy');
  return momentos.map((momento, i) => {
    const dia = i + 1;
    if (momento === 'hoy') return null;
    if (dia !== 1 && dia % 5 !== 0) return null;
    return indiceHoy >= 0 && Math.abs(i - indiceHoy) < 2 ? null : fechaCorta(mes, dia);
  });
}

/** Sin plan configurado o con el plan inactivo la revisión automática no está contratada. */
export function tienePlanActivo(uso: UsoIaDto): boolean {
  return uso.plan.configurado && uso.plan.activo;
}
