import { expect, test, type Browser, type Page } from '@playwright/test';
import { pdf } from '../soporte/archivos';
import { esperarCorreo, textoSinEnlaces } from '../soporte/correo';
import { abrirEmbebido } from '../soporte/embebido';
import { abrirDesdeBandeja, aprobarArea, observar, regionDeArea } from '../soporte/empresa';
import { completarInvitacion, esperarEstadoDelTercero, esperarTarjeta, responder, subirDocumento, tarjeta } from '../soporte/proveedor';
import { crearEscenario, invitar, nuevoTercero, type Escenario, type Invitacion, type Persona } from '../soporte/semilla';

/**
 * Decisiones de las áreas sobre un expediente de proveedor de Constructora Norte: Compras (Rubén) revisa el RUT;
 * Cumplimiento (Olga, puede rechazar) revisa el RUT y la Cámara de comercio. Política de devolución inmediata.
 */

const RUT = 'Registro Único Tributario';
const CAMARA = 'Certificado de existencia y representación legal';

interface Caso {
  e: Escenario;
  invitacion: Invitacion;
  tercero: Page;
}

/** Grupo nuevo, proveedor invitado por Norte que ya aceptó y subió RUT y Cámara: el expediente está en revisión. */
async function expedienteEnRevision(page: Page): Promise<Caso> {
  const e = await crearEscenario();
  const invitacion = await invitar(e, e.norte, nuevoTercero());
  await completarInvitacion(page, invitacion, [
    { nombre: RUT, archivo: pdf(`RUT ${invitacion.nombre} v1`) },
    { nombre: CAMARA, archivo: pdf(`Camara ${invitacion.nombre} v1`) },
  ]);
  return { e, invitacion, tercero: page };
}

/** Ventana aparte (otra persona, otro navegador) con Valídalo embebido en el expediente del caso. */
async function revisor(browser: Browser, c: Caso, persona: Persona, area: string) {
  const ventana = await (await browser.newContext()).newPage();
  const app = await abrirEmbebido(ventana, c.e, persona);
  await abrirDesdeBandeja(app, c.invitacion.nombre, area);
  return app;
}

test('Compras observa el RUT, el tercero sube la versión corregida y la aprobación previa de Cumplimiento sobre ese documento se invalida', async ({ page, browser }) => {
  const c = await expedienteEnRevision(page);

  // Cumplimiento aprueba primero sus dos documentos (RUT v1 y Cámara v1).
  const olga = await revisor(browser, c, c.e.olga, 'Cumplimiento');
  await aprobarArea(olga, 'Cumplimiento');

  const ruben = await revisor(browser, c, c.e.ruben, 'Compras');
  await observar(ruben, 'Compras', [{ documento: `${RUT} · v1`, motivos: ['Ilegible', 'Incompleto'] }], 'La página 2 está cortada.');

  // Un solo correo con los motivos tal como se le comunican al tercero, sin nombres de revisores ni de áreas.
  const correo = await esperarCorreo(c.invitacion.correo, /tiene observaciones sobre tu validación/);
  expect(correo.texto).toContain('El documento no se puede leer con claridad.');
  expect(correo.texto).toContain('La información o el documento está incompleto.');
  expect(correo.texto).toContain('La página 2 está cortada.');
  for (const interno of ['Rubén', 'Compras', 'Olga', 'Cumplimiento']) expect(textoSinEnlaces(correo.texto)).not.toContain(interno);

  await esperarEstadoDelTercero(page, 'Observado');
  await expect(tarjeta(page, RUT)).toContainText('El documento no se puede leer con claridad.');
  await expect(tarjeta(page, RUT)).toContainText('“La página 2 está cortada.”');
  // La Cámara no se observó: no se le pide corregirla.
  await expect(tarjeta(page, CAMARA).getByRole('button', { name: 'Subir versión corregida' })).toHaveCount(0);

  await subirDocumento(page, RUT, pdf(`RUT ${c.invitacion.nombre} corregido`), { version: 2 });
  await esperarTarjeta(page, RUT, 'Versión 2');
  await responder(page, 'Adjunto el RUT completo.');
  await esperarEstadoDelTercero(page, 'EnRevision');

  // La versión 2 invalida lo decidido sobre el RUT en las dos áreas (RQ-8); la Cámara de Cumplimiento sigue aprobada.
  await abrirDesdeBandeja(olga, c.invitacion.nombre, 'Cumplimiento');
  await expect(regionDeArea(olga, 'Cumplimiento').getByRole('button', { name: 'Aprobar área (1 documento)' })).toBeVisible();
  await expect(regionDeArea(olga, 'Cumplimiento')).toContainText(`${RUT} · v2`);
  await aprobarArea(olga, 'Cumplimiento');

  await abrirDesdeBandeja(ruben, c.invitacion.nombre, 'Compras');
  await expect(regionDeArea(ruben, 'Compras')).toContainText(`${RUT} · v2`);
  await aprobarArea(ruben, 'Compras');

  await esperarEstadoDelTercero(page, 'Aprobado');
});
