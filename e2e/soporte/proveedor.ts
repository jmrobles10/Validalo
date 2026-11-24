import { expect, type Page } from '@playwright/test';
import { codigo, enlace, esperarCorreo } from './correo';
import { escribirFecha, esFechaIso } from './fechas';
import type { Invitacion } from './semilla';

interface Archivo {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** Códigos ya usados por correo: cada entrada pide «el siguiente» código, no uno viejo. */
const codigosUsados = new Map<string, string[]>();

/**
 * El tercero abre el enlace de su invitación (el correo de esa empresa y tipo) y, si el tipo exige OTP, escribe el
 * código que le llega al mismo correo. Queda en la pantalla de aceptar la invitación.
 */
export async function entrarPorInvitacion(page: Page, invitacion: Invitacion): Promise<void> {
  // El asunto lleva el nombre del tipo en minúscula (Proveedor, Cliente, Aliado…): el código en mayúsculas lo da igual.
  const tipo = invitacion.tipo.toLowerCase();
  const correo = await esperarCorreo(invitacion.correo, new RegExp(`^${escapar(invitacion.empresa.nombre)} te invita a validar tu vínculo como ${tipo}$`));
  await page.goto(enlace(correo, '/e/'));
  const pideCodigo = page.getByRole('heading', { name: 'Escribe el código' });
  const invita = page.getByRole('heading', { level: 1, name: `${invitacion.empresa.nombre} te invita a validar tu información` });
  await expect(pideCodigo.or(invita)).toBeVisible();
  if (await pideCodigo.isVisible()) await escribirCodigo(page, invitacion.correo);
  // El enlace abre la invitación de esta empresa aunque el tercero tenga otras pendientes (no pasa por «Mis empresas»).
  await expect(invita).toBeVisible();
}

/** En «Mis empresas», abre la tarjeta de la empresa (y tipo de vínculo) con su acción: aceptar o ver la revisión. */
export async function abrirEmpresa(page: Page, empresa: string, tipo = 'PROVEEDOR'): Promise<void> {
  const nombreTipo = tipo === 'CLIENTE' ? 'Cliente' : 'Proveedor';
  const item = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 2, name: empresa, exact: true }) })
    .filter({ has: page.getByText(nombreTipo, { exact: true }) });
  // Si el clic cae mientras la lista se vuelve a pintar (se refresca sola), la página no cambia: se repite hasta salir.
  await expect(async () => {
    if (/\/empresas\/?$/.test(new URL(page.url()).pathname)) await item.getByRole('link').first().click({ timeout: 3000 });
    await expect(page).not.toHaveURL(/\/empresas\/?$/, { timeout: 3000 });
  }).toPass({ timeout: 20_000 });
}

/** Pantalla «Escribe el código»: lee el OTP nuevo de Mailpit y lo escribe dígito a dígito. */
export async function escribirCodigo(page: Page, correoDelTercero: string): Promise<void> {
  const usados = codigosUsados.get(correoDelTercero) ?? [];
  const mensaje = await esperarCorreo(correoDelTercero, /código de acceso/, { excluir: usados });
  codigosUsados.set(correoDelTercero, [...usados, mensaje.id]);
  await page.getByRole('textbox', { name: 'Dígito 1 de 6' }).click();
  await page.keyboard.type(codigo(mensaje));
  const continuar = page.getByRole('button', { name: 'Continuar' });
  if ((await continuar.isVisible()) && (await continuar.isEnabled())) await continuar.click().catch(() => undefined);
  await expect(page.getByRole('heading', { name: 'Escribe el código' })).toBeHidden();
}

/** Acepta los textos legales de la invitación; queda en «Tu revisión con {empresa}». */
export async function aceptarInvitacion(page: Page, invitacion: Invitacion): Promise<void> {
  for (const casilla of await page.getByRole('checkbox', { name: 'Leí y acepto este texto' }).all()) await casilla.check();
  await page.getByRole('button', { name: 'Aceptar' }).click();
  await expect(page.getByRole('heading', { level: 1, name: `Tu revisión con ${invitacion.empresa.nombre}` })).toBeVisible();
}

/** Tarjeta de un requisito en «Tu revisión con …». */
export function tarjeta(page: Page, nombre: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: nombre, exact: true }) });
}

export interface OpcionesSubida {
  /** Versión que debe quedar en la bóveda (1 para la primera). */
  version?: number;
  /** Campos del formulario del tipo (etiqueta → valor), p. ej. `{ 'Fecha de expedición': '2026-10-01' }`. */
  campos?: Record<string, string>;
}

/**
 * Desde «Tu revisión con …», sube el documento del requisito `nombre` (subir, otra versión o versión corregida) en el diálogo de subida,
 * llena los campos que pida y lo cierra con «Listo»: el tercero no sale de su revisión. Comprueba la versión que quedó en la bóveda.
 */
export async function subirDocumento(page: Page, nombre: string, archivo: Archivo, { version = 1, campos = {} }: OpcionesSubida = {}): Promise<void> {
  await tarjeta(page, nombre).getByRole('button', { name: /^Subir/ }).click();
  const dialogo = page.getByRole('dialog', { name: `Subir ${nombre}` });
  await expect(dialogo).toBeVisible();
  for (const [etiqueta, valor] of Object.entries(campos)) {
    // Una fecha (`aaaa-mm-dd`) se escribe en el selector de fecha por secciones; lo demás es texto.
    if (esFechaIso(valor)) await escribirFecha(page, new RegExp(escapar(etiqueta)), valor, dialogo);
    else await dialogo.getByLabel(new RegExp(escapar(etiqueta))).fill(valor);
  }
  await elegirArchivoEnElDialogo(page, archivo, `Es tu versión ${String(version)} de ${nombre}`);
}

/**
 * En el diálogo de subida abierto: elige el archivo, espera el resultado `resultado` («Es tu versión 2 de …») y lo cierra con «Listo».
 * Quien necesite fotografiar el resultado antes de cerrar usa `elegirArchivo` y cierra después con `cerrarDialogoDeSubida`.
 */
export async function elegirArchivoEnElDialogo(page: Page, archivo: Archivo, resultado: string): Promise<void> {
  await elegirArchivo(page, archivo, resultado);
  await cerrarDialogoDeSubida(page);
}

/** En el diálogo de subida abierto: elige el archivo y espera el resultado (el diálogo sigue abierto, mostrándolo). */
export async function elegirArchivo(page: Page, archivo: Archivo, resultado: string): Promise<void> {
  const dialogo = page.getByRole('dialog');
  const selector = page.waitForEvent('filechooser');
  await dialogo.getByRole('button', { name: 'Elegir archivo' }).click();
  await (await selector).setFiles(archivo);
  await expect(dialogo.getByText(resultado)).toBeVisible({ timeout: 30_000 });
}

/** Cierra el diálogo de subida con «Listo» (el resultado ya se vio) y espera a que desaparezca. */
export async function cerrarDialogoDeSubida(page: Page): Promise<void> {
  const dialogo = page.getByRole('dialog');
  await dialogo.getByRole('button', { name: 'Listo' }).click();
  await expect(dialogo).toBeHidden();
}

/** Desde «Mi bóveda», sube una versión nueva del documento `documento` en el diálogo de subida y lo cierra con «Listo». */
export async function subirVersionDesdeLaBoveda(page: Page, documento: string, archivo: Archivo, version: number): Promise<void> {
  await page.getByRole('article', { name: documento }).getByRole('button', { name: 'Subir versión' }).click();
  await expect(page.getByRole('dialog', { name: `Nueva versión de ${documento}` })).toBeVisible();
  await elegirArchivoEnElDialogo(page, archivo, `Es tu versión ${String(version)} de ${documento}`);
}

/** Nombre del requisito «Certificación bancaria» tal como lo ve el tercero en «Tu revisión con …». */
export const REQUISITO_CERTIFICACION_BANCARIA = 'Certificación bancaria';

/** Una cuenta bancaria como se escribe en «Agregar cuenta bancaria». */
export interface DatosDeCuenta {
  /** Nombre del banco en el catálogo (se busca y se elige de la lista). */
  banco: string;
  tipo: 'Ahorros' | 'Corriente';
  numero: string;
  titular: string;
  identificacion: string;
}

/** La cuenta con la que se prueba: sale como «Bancolombia ****5678» y su número completo es `03112345678`. */
export const CUENTA_DE_PRUEBA: DatosDeCuenta = {
  banco: 'Bancolombia',
  tipo: 'Ahorros',
  numero: '031-123456-78',
  titular: 'Ferretería El Tornillo S.A.S.',
  identificacion: 'NIT 900123456',
};

/** En el diálogo «Agregar cuenta bancaria» abierto: llena la cuenta, adjunta su certificación (cada cuenta se guarda con la suya, CB-5) y la guarda. */
async function guardarCuentaConCertificacion(page: Page, datos: DatosDeCuenta, certificacion: Archivo): Promise<void> {
  const dialogo = page.getByRole('dialog', { name: 'Agregar cuenta bancaria' });
  // El banco sale del catálogo (con su código de compensación y SWIFT, que viajan al ERP): se busca y se elige de la lista.
  await dialogo.getByRole('combobox', { name: 'Banco' }).fill(datos.banco);
  await page.getByRole('option', { name: datos.banco }).click();
  await dialogo.getByRole('radio', { name: datos.tipo }).check();
  await dialogo.getByLabel('Número de cuenta').fill(datos.numero);
  await dialogo.getByLabel('Titular de la cuenta').fill(datos.titular);
  await dialogo.getByLabel('Identificación del titular').fill(datos.identificacion);
  await dialogo.getByTestId('entrada-archivo').setInputFiles(certificacion);
  await dialogo.getByRole('button', { name: 'Guardar cuenta' }).click();
}

/**
 * Desde «Mis cuentas», registra una cuenta con su certificación bancaria y espera a que la tarjeta de la cuenta muestre su versión 1. No la designa para ninguna empresa:
 * la certificación se queda en el tercero (sin leer) hasta que una empresa la reciba al designar la cuenta con ella (CB-6).
 */
export async function registrarCuentaConCertificacion(page: Page, certificacion: Archivo, cuenta: Partial<DatosDeCuenta> = {}): Promise<void> {
  const datos = { ...CUENTA_DE_PRUEBA, ...cuenta };
  await page.goto('/cuentas');
  await page.getByRole('button', { name: 'Agregar cuenta' }).first().click();
  await guardarCuentaConCertificacion(page, datos, certificacion);
  const ultimos = datos.numero.replace(/\D/g, '').slice(-4);
  await expect(page.getByText(`· ****${ultimos} ·`)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('region', { name: 'Certificación bancaria' })).toContainText('Versión 1', { timeout: 30_000 });
}

export interface OpcionesCertificacionDeCuenta {
  /**
   * Una cuenta que el tercero ya tiene (texto o patrón de como se lista al elegir, p. ej. `/Bancolombia · Ahorros/`): se elige en vez de registrar otra. Si le falta su certificación
   * se sube `archivo`; si ya la tiene, pasa directo a proponerla a la empresa y `archivo` no se sube.
   */
  existente?: string | RegExp;
  /** Datos de la cuenta nueva; lo que no se indique sale de {@link CUENTA_DE_PRUEBA}. */
  cuenta?: Partial<DatosDeCuenta>;
  /** Propone la cuenta a la empresa («Designar con …»). Con `false` responde «Ahora no»: la cuenta queda con su certificación, sin designar. Por omisión, sí. */
  designar?: boolean;
}

/**
 * Desde «Tu revisión con …», cubre el requisito «Certificación bancaria»: ya no es un documento suelto sino la certificación de una cuenta (CB-8). Elige una cuenta que el
 * tercero ya tiene (`existente`) o registra una nueva (con la primera cuenta se arranca directo en «Agregar cuenta», que exige su certificación), sube la certificación de ESA
 * cuenta y propone designarla para la empresa: la empresa recibe el documento (y su IA lo lee, ADR-0012) al designarla, no antes. Pensada para una empresa que aún no tiene cuenta
 * con el tercero. El expediente pasa a «En revisión» cuando la empresa recibe la certificación, por una cola: quien necesite verlo espera con {@link esperarEstadoDelTercero}.
 */
export async function subirCertificacionDeCuenta(page: Page, archivo: Archivo, { existente, cuenta = {}, designar = true }: OpcionesCertificacionDeCuenta = {}): Promise<void> {
  await tarjeta(page, REQUISITO_CERTIFICACION_BANCARIA).getByRole('button', { name: /^Subir (certificación|otra versión)/ }).click();
  // Mientras se piden las cuentas, el diálogo tiene el mismo título con un esqueleto: «elegir» es el que ya trae su acción «Continuar».
  const elegir = page.getByRole('dialog', { name: /^Certificación bancaria para / }).filter({ has: page.getByRole('button', { name: 'Continuar' }) });
  const agregar = page.getByRole('dialog', { name: 'Agregar cuenta bancaria' });
  const subir = page.getByRole('dialog', { name: /^(Certificación|Reemplazar la certificación) de / });
  const proponer = page.getByRole('dialog', { name: /^¿Designar esta cuenta para / });

  // Con cuentas activas primero se elige de cuál es la certificación; sin ellas arranca directo en «Agregar cuenta».
  await expect(elegir.or(agregar)).toBeVisible();
  if (await elegir.isVisible()) {
    if (existente === undefined) {
      await elegir.getByRole('button', { name: 'Agregar otra cuenta' }).click();
    } else {
      await elegir.getByRole('radio', { name: existente }).check();
      await elegir.getByRole('button', { name: 'Continuar' }).click();
    }
    await expect(agregar.or(subir).or(proponer)).toBeVisible();
  }
  if (await agregar.isVisible()) {
    // Se guarda la cuenta y enseguida se le sube la certificación, en el mismo diálogo.
    await guardarCuentaConCertificacion(page, { ...CUENTA_DE_PRUEBA, ...cuenta }, archivo);
  } else if (await subir.isVisible()) {
    await subir.getByTestId('entrada-archivo').setInputFiles(archivo);
  }

  // La cuenta ya tiene su certificación: se propone designarla para esta empresa.
  await expect(proponer).toBeVisible({ timeout: 30_000 });
  await proponer.getByRole('button', { name: designar ? /^Designar con / : 'Ahora no' }).click();
  await expect(proponer).toBeHidden();
}

/**
 * Desde «Mis cuentas», sube una versión nueva de la certificación de la cuenta `cuenta` (texto o patrón de su tarjeta): las empresas con las que está designada la reciben y la IA la
 * vuelve a leer. Comprueba la versión que quedó en la tarjeta. Una certificación de cuenta no vive en la bóveda: allí no se reemplaza.
 */
export async function subirVersionDeCertificacionDeCuenta(page: Page, cuenta: string | RegExp, archivo: Archivo, version: number): Promise<void> {
  await page.goto('/cuentas');
  const tarjetaDeCuenta = page.getByRole('article').filter({ hasText: cuenta });
  await tarjetaDeCuenta.getByRole('button', { name: /^Reemplazar:/ }).click();
  const dialogo = page.getByRole('dialog', { name: /^Reemplazar la certificación de / });
  await dialogo.getByTestId('entrada-archivo').setInputFiles(archivo);
  await expect(dialogo).toBeHidden({ timeout: 30_000 });
  await expect(tarjetaDeCuenta.getByRole('region', { name: 'Certificación bancaria' })).toContainText(`Versión ${String(version)}`, { timeout: 30_000 });
}

export type EstadoDelTercero = 'Abierto' | 'EnRevision' | 'Observado' | 'Aprobado' | 'Rechazado';

/** Frase que explica el estado general en «Tu revisión con …» (los chips de cada documento repiten algunos nombres). */
const FRASES: Record<EstadoDelTercero, RegExp> = {
  Abierto: /^Te falta(n)? \d+ documentos?\. Súbel/,
  EnRevision: / está revisando tu información\./,
  Observado: / te pide corregir lo siguiente\./,
  Aprobado: / aprobó tu información\. Tu vínculo está activo\./,
  Rechazado: / cerró la revisión sin aprobarla\./,
};

/** Hay una frase de estado `estado` visible en la página (sin recargar). */
export function fraseDeEstado(page: Page, estado: EstadoDelTercero) {
  return page.getByRole('main').getByText(FRASES[estado]);
}

/**
 * Recarga «Tu revisión con …» hasta que el estado general sea `estado`: la bóveda adjunta las versiones al expediente
 * por una cola (RQ-2) y las decisiones de la empresa llegan sin que la página se entere.
 */
export async function esperarEstadoDelTercero(page: Page, estado: EstadoDelTercero): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /^Tu revisión con / })).toBeVisible();
    await expect(fraseDeEstado(page, estado)).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 45_000 });
}

/** Recarga hasta que la tarjeta del requisito `nombre` muestre `texto` (p. ej. «Versión 2»). */
export async function esperarTarjeta(page: Page, nombre: string, texto: string | RegExp): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(tarjeta(page, nombre)).toContainText(texto, { timeout: 1500 });
  }).toPass({ timeout: 45_000 });
}

/** «Enviar respuesta» a las observaciones, con una explicación opcional; la revisión vuelve a «En revisión». */
export async function responder(page: Page, explicacion?: string): Promise<void> {
  if (explicacion) await page.getByRole('textbox', { name: 'Tu respuesta (opcional)' }).fill(explicacion);
  await page.getByRole('button', { name: 'Enviar respuesta' }).click();
  const error = page.getByRole('alert').filter({ hasNotText: /Vence pronto|Aceptaste|Enviaste tu respuesta/ });
  await expect(fraseDeEstado(page, 'EnRevision').or(error).first()).toBeVisible();
  if (!(await fraseDeEstado(page, 'EnRevision').isVisible())) throw new Error(`No se pudo enviar la respuesta: ${await error.first().innerText()}`);
}

/** Un documento que pide el flujo: su requisito (`nombre`), el archivo y los campos de su formulario, si los tiene. */
export interface DocumentoDelRequisito {
  nombre: string;
  archivo: Archivo;
  campos?: Record<string, string>;
  /** Solo para «Certificación bancaria»: los datos de la cuenta que se registra con ella (lo que falte sale de {@link CUENTA_DE_PRUEBA}). */
  cuenta?: Partial<DatosDeCuenta>;
}

/**
 * Sube cada documento desde «Tu revisión con …», en orden. «Certificación bancaria» no es un documento suelto: se cubre registrando una cuenta con su certificación y
 * designándola para la empresa ({@link subirCertificacionDeCuenta}); los demás, con {@link subirDocumento}.
 */
export async function subirRequisitos(page: Page, documentos: readonly DocumentoDelRequisito[]): Promise<void> {
  for (const d of documentos) {
    if (d.nombre === REQUISITO_CERTIFICACION_BANCARIA) await subirCertificacionDeCuenta(page, d.archivo, { cuenta: d.cuenta });
    else await subirDocumento(page, d.nombre, d.archivo, { campos: d.campos ?? {} });
  }
}

/**
 * El tercero completa su lado de una invitación: entra por el correo, acepta y sube cada documento pedido (la certificación bancaria, con su cuenta: ver
 * {@link subirRequisitos}); espera a que el expediente quede «En revisión».
 */
export async function completarInvitacion(page: Page, invitacion: Invitacion, documentos: readonly DocumentoDelRequisito[]): Promise<void> {
  await entrarPorInvitacion(page, invitacion);
  await aceptarInvitacion(page, invitacion);
  await subirRequisitos(page, documentos);
  await esperarEstadoDelTercero(page, 'EnRevision');
}

/**
 * Como {@link completarInvitacion}, pero sin exigir que el tercero vea «En revisión»: con la revisión automática en nivel
 * Automático el expediente puede aprobarse al segundo de llegar a revisión (el procesador corre cada segundo), antes de que la
 * página alcance a mostrar «En revisión». Espera a que se vea «En revisión» o ya «Aprobado».
 */
export async function completarInvitacionYEsperarRevisionOAprobacion(page: Page, invitacion: Invitacion, documentos: readonly DocumentoDelRequisito[]): Promise<void> {
  await entrarPorInvitacion(page, invitacion);
  await aceptarInvitacion(page, invitacion);
  await subirRequisitos(page, documentos);
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: /^Tu revisión con / })).toBeVisible();
    await expect(fraseDeEstado(page, 'EnRevision').or(fraseDeEstado(page, 'Aprobado'))).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 45_000 });
}

function escapar(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
