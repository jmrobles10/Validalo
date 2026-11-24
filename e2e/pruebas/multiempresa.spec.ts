import { expect, test, type Browser } from '@playwright/test';
import { pdf } from '../soporte/archivos';
import { abrirEmbebido } from '../soporte/embebido';
import { abrirDesdeBandeja, aprobarArea, observar } from '../soporte/empresa';
import { aceptarInvitacion, completarInvitacion, entrarPorInvitacion, esperarEstadoDelTercero, subirDocumento, tarjeta } from '../soporte/proveedor';
import { crearEscenario, invitar, nuevoTercero, SST, type Empresa, type Escenario, type Persona } from '../soporte/semilla';

/**
 * Un mismo tercero con varias empresas: su bóveda es una sola (cada documento se sube una vez y se comparte al aceptar
 * cada invitación), pero cada empresa decide en privado y el tercero ve el estado con cada una.
 */

const RUT = 'Registro Único Tributario';
const CAMARA = 'Certificado de existencia y representación legal';

/** Fecha `YYYY-MM-DD` de hace `dias` días (zona de Bogotá, como la del navegador de las pruebas). */
function haceDias(dias: number): string {
  const fecha = new Date(Date.now() - dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(fecha);
}

async function embebido(browser: Browser, e: Escenario, persona: Persona, empresa: Empresa) {
  return abrirEmbebido(await (await browser.newContext()).newPage(), e, persona, empresa);
}

test('Norte y Sur invitan al mismo proveedor: un solo RUT, decisiones privadas y estado distinto con cada empresa', async ({ page, browser }) => {
  const e = await crearEscenario();
  const tercero = nuevoTercero('Ferretería La Esquina S.A.S.');
  const enNorte = await invitar(e, e.norte, tercero);
  const enSur = await invitar(e, e.sur, tercero);

  await completarInvitacion(page, enNorte, [
    { nombre: RUT, archivo: pdf('RUT Ferreteria v1') },
    { nombre: CAMARA, archivo: pdf('Camara Ferreteria v1') },
  ]);

  // Sur todavía no tiene la aceptación del tercero: no ve sus documentos ni tiene nada que revisar.
  const sofia = await embebido(browser, e, e.sofia, e.sur);
  await expect(sofia.getByRole('heading', { level: 1, name: 'Bandeja de revisión' })).toBeVisible();
  await expect(sofia.getByRole('row', { name: new RegExp(tercero.nombre) })).toHaveCount(0);

  // El tercero acepta Sur: el RUT ya está en su bóveda y le llega a Sur sin subirlo otra vez; solo falta el certificado propio de Sur.
  await entrarPorInvitacion(page, enSur);
  await aceptarInvitacion(page, enSur);
  await expect(tarjeta(page, RUT)).toContainText('Versión 1');
  await expect(tarjeta(page, RUT).getByRole('button', { name: 'Subir documento' })).toHaveCount(0);
  await subirDocumento(page, SST.nombre, pdf('SST Ferreteria'), { campos: { 'Fecha de expedición': haceDias(3) } });
  await esperarEstadoDelTercero(page, 'EnRevision');

  // Norte observa el RUT; Sur aprueba ese mismo RUT.
  const ruben = await embebido(browser, e, e.ruben, e.norte);
  await abrirDesdeBandeja(ruben, tercero.nombre, 'Compras');
  await observar(ruben, 'Compras', [{ documento: `${RUT} · v1`, motivos: ['Ilegible'] }], 'No se lee el NIT.');

  await abrirDesdeBandeja(sofia, tercero.nombre, 'Revisión');
  // Lo que decidió Norte es privado: Sur no ve su observación.
  await expect(sofia.getByRole('main')).not.toContainText('No se lee el NIT.');
  await expect(sofia.getByRole('main')).not.toContainText('Compras');
  await aprobarArea(sofia, 'Revisión');

  // El tercero ve una revisión por empresa: observada en Norte, aprobada en Sur.
  await page.goto('/empresas');
  const empresa = (nombre: string) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name: nombre }) });
  await expect(empresa(e.norte.nombre)).toContainText('Tienes observaciones');
  await expect(empresa(e.norte.nombre).getByRole('link', { name: 'Ver observaciones' })).toBeVisible();
  await expect(empresa(e.sur.nombre)).toContainText('Aprobado');
  await expect(empresa(e.sur.nombre)).toContainText(`${e.sur.nombre} aprobó tu información. Tu vínculo está activo.`);
});
