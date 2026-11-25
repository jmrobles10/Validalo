import { expect, test, type FrameLocator, type Locator } from '@playwright/test';
import { abrirEmbebido } from '../soporte/embebido';
import { irASeccion } from '../soporte/empresa';
import { crearEscenario } from '../soporte/semilla';

/**
 * Menú principal de la web de empresa: a partir de 600 px (`sm`) es un riel lateral fijo con una opción por sección (ícono y rótulo) y Configuración abajo; por debajo
 * de 600 px no hay riel: la barra lleva el botón «Abrir el menú» y las mismas secciones están en un cajón. A cualquier ancho ni el menú ni la página se desplazan en
 * horizontal y todas las secciones quedan a un clic (en el celular, a dos: abrir el cajón y elegir).
 */

const SECCIONES = ['Inicio', 'Bandeja', 'Excepciones', 'Revalidaciones', 'Vencimientos', 'Cumplimiento', 'Certificados', 'Vínculos', 'Informes', 'Auditoría'];
/** Alto de la ventana: el riel muestra las 10 secciones y Configuración sin desplazarse (necesita unos 800 px, y la página anfitriona le quita 48 de su banner); más bajo, su lista desplaza en vertical. */
const ALTO = 900;
/** El ancho de un celular (por debajo de `sm`) y el de una tableta, con riel. */
const CELULAR = 390;

/** El menú de secciones: el riel o, con el cajón abierto, el del cajón (los dos se llaman «Secciones»). */
const menu = (app: FrameLocator) => app.getByRole('navigation', { name: 'Secciones' });
const cajon = (app: FrameLocator) => app.getByRole('dialog', { name: 'Menú principal' });
const abrirMenu = (app: FrameLocator) => app.getByRole('button', { name: 'Abrir el menú' });
/** El mismo botón con el cajón abierto: MUI oculta entonces el resto de la página a los lectores de pantalla, así que se busca por CSS. */
const botonDelMenu = (app: FrameLocator) => app.locator('button[aria-label="Abrir el menú"]');

/** Los nombres de las secciones del menú, en orden (sin el logo ni Configuración, que van aparte); un contador pendiente («Excepciones (3)») no es parte del nombre. */
async function seccionesDelMenu(raiz: Locator): Promise<string[]> {
  const nombres = await raiz.getByRole('listitem').getByRole('link').evaluateAll((enlaces) => enlaces.map((e) => (e.getAttribute('aria-label') ?? e.textContent).trim()));
  return nombres.map((n) => n.replace(/ \(.+\)$/, ''));
}

/** El menú visible cabe en su caja y la página del iframe no tiene scroll horizontal. */
async function sinDesplazamientoHorizontal(app: FrameLocator) {
  const medidas = await app.locator('body').evaluate((cuerpo) => {
    const raiz = cuerpo.ownerDocument.documentElement;
    const caja = cuerpo.ownerDocument.querySelector('nav[aria-label="Secciones"]');
    const limite = (caja?.getBoundingClientRect().right ?? 0) + 0.5;
    const desbordados = caja
      ? Array.from(caja.querySelectorAll('a'))
          .filter((enlace) => enlace.getClientRects().length > 0 && enlace.getBoundingClientRect().right > limite)
          .map((enlace) => enlace.textContent)
      : [];
    return { desbordados, paginaDesborda: raiz.scrollWidth > raiz.clientWidth };
  });
  expect(medidas.desbordados).toEqual([]);
  expect(medidas.paginaDesborda).toBe(false);
}

/** Abre el cajón del celular y espera a verlo. */
async function abrirElCajon(app: FrameLocator) {
  await abrirMenu(app).click();
  await expect(cajon(app)).toBeVisible();
  await expect(botonDelMenu(app)).toHaveAttribute('aria-expanded', 'true');
}

for (const ancho of [1536, 1100, 700]) {
  test(`a ${String(ancho)} px el riel no desplaza, todas las secciones están a un clic y Configuración queda abajo`, async ({ page }) => {
    const e = await crearEscenario();
    await page.setViewportSize({ width: ancho, height: ALTO });
    const ana = await abrirEmbebido(page, e, e.ana, e.norte, 'inicio');
    await expect(ana.getByRole('heading', { level: 1, name: 'Inicio' })).toBeVisible();

    // Con riel no hay botón de menú ni cajón: todas las secciones están siempre a la vista, y a ningún ancho se parten ni desbordan.
    await expect(abrirMenu(ana)).toBeHidden();
    await expect(menu(ana)).toBeVisible();
    await sinDesplazamientoHorizontal(ana);
    // La lista se vuelve a medir cuando llega el contador de Excepciones: se espera a que se asiente.
    await expect.poll(() => seccionesDelMenu(menu(ana)), { timeout: 10_000 }).toEqual(SECCIONES);

    // Configuración no es una sección más: queda abajo del riel, debajo de la última.
    const configuracion = menu(ana).getByRole('link', { name: 'Configuración', exact: true });
    await expect(configuracion).toBeVisible();
    await expect(configuracion).not.toHaveAttribute('aria-current', 'page');
    const ultima = (await menu(ana).getByRole('link', { name: 'Auditoría', exact: true }).boundingBox())!;
    expect((await configuracion.boundingBox())!.y).toBeGreaterThan(ultima.y + ultima.height);
    await page.screenshot({ path: `test-results/navegacion-${String(ancho)}-inicio.png` });

    // La última sección queda marcada como activa (una sola) y Configuración no.
    await irASeccion(ana, 'Auditoría');
    await expect(ana.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
    const activa = menu(ana).getByRole('listitem').locator('[aria-current="page"]');
    await expect(activa).toHaveCount(1);
    await expect(activa).toHaveText('Auditoría');
    await expect(configuracion).not.toHaveAttribute('aria-current', 'page');
    await sinDesplazamientoHorizontal(ana);
    await page.screenshot({ path: `test-results/navegacion-${String(ancho)}-activa.png` });

    // Configuración: el ítem queda activo y ninguna sección lo está; su barra lateral se abre a la derecha del riel.
    await configuracion.click();
    await expect(ana.getByRole('navigation', { name: 'Configuración' })).toBeVisible();
    await expect(configuracion).toHaveAttribute('aria-current', 'page');
    await expect(menu(ana).getByRole('listitem').locator('[aria-current="page"]')).toHaveCount(0);
    await sinDesplazamientoHorizontal(ana);
    await page.screenshot({ path: `test-results/navegacion-${String(ancho)}-configuracion.png` });
  });
}

test('al cruzar el ancho del celular el riel pasa a un cajón y vuelve, sin recargar y sin dejar nada abierto', async ({ page }) => {
  const e = await crearEscenario();
  await page.setViewportSize({ width: 1100, height: ALTO });
  const ana = await abrirEmbebido(page, e, e.ana, e.norte, 'bandeja');
  await expect(ana.getByRole('heading', { level: 1, name: 'Bandeja de revisión' })).toBeVisible();
  // Una marca en la ventana: si la página se recargara al cambiar el ancho, se perdería.
  await page.evaluate(() => {
    (window as unknown as { marcaDeNavegacion?: boolean }).marcaDeNavegacion = true;
  });
  await expect(menu(ana)).toBeVisible();
  await expect(abrirMenu(ana)).toBeHidden();

  // Celular: sin riel; la barra lleva el botón de menú y las mismas secciones, más Configuración y el tema, están en el cajón.
  await page.setViewportSize({ width: CELULAR, height: ALTO });
  await expect(abrirMenu(ana)).toBeVisible();
  await expect(menu(ana)).toBeHidden();
  await expect(abrirMenu(ana)).toHaveAttribute('aria-haspopup', 'dialog');
  await sinDesplazamientoHorizontal(ana);
  await abrirElCajon(ana);
  await expect.poll(() => seccionesDelMenu(menu(ana)), { timeout: 10_000 }).toEqual(SECCIONES);
  await expect(menu(ana).getByRole('link', { name: 'Configuración', exact: true })).toBeVisible();
  await expect(cajon(ana).getByText('Empresa activa')).toBeVisible();
  await expect(cajon(ana).getByRole('button', { name: 'Usar tema oscuro' })).toBeVisible();
  // La sección de la página es la activa; Esc cierra el cajón.
  await expect(menu(ana).getByRole('link', { name: 'Bandeja', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.keyboard.press('Escape');
  await expect(cajon(ana)).toBeHidden();
  await expect(abrirMenu(ana)).toHaveAttribute('aria-expanded', 'false');

  // Elegir una sección navega y cierra el cajón.
  await abrirElCajon(ana);
  await menu(ana).getByRole('link', { name: 'Auditoría', exact: true }).click();
  await expect(cajon(ana)).toBeHidden();
  await expect(ana.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
  await sinDesplazamientoHorizontal(ana);

  // Al volver a un ancho con riel, el cajón no queda abierto y el riel marca la sección activa.
  await abrirElCajon(ana);
  await page.setViewportSize({ width: 1100, height: ALTO });
  await expect(cajon(ana)).toBeHidden();
  await expect(abrirMenu(ana)).toBeHidden();
  await expect(menu(ana).getByRole('link', { name: 'Auditoría', exact: true })).toHaveAttribute('aria-current', 'page');
  await sinDesplazamientoHorizontal(ana);
  expect(await page.evaluate(() => (window as unknown as { marcaDeNavegacion?: boolean }).marcaDeNavegacion)).toBe(true);
});

test('en modo oscuro el cajón del celular se ve bien y lleva a la sección elegida', async ({ page }) => {
  const e = await crearEscenario();
  await page.setViewportSize({ width: CELULAR, height: ALTO });
  const ana = await abrirEmbebido(page, e, e.ana, e.norte, 'bandeja');
  await expect(ana.getByRole('heading', { level: 1, name: 'Bandeja de revisión' })).toBeVisible();

  // En el celular el tema se cambia desde el cajón (la barra no lo lleva).
  await abrirElCajon(ana);
  await cajon(ana).getByRole('button', { name: 'Usar tema oscuro' }).click();
  await expect(cajon(ana).getByRole('button', { name: 'Usar tema claro' })).toBeVisible();
  await page.screenshot({ path: 'test-results/navegacion-celular-oscuro-cajon.png', animations: 'disabled' });

  // Una sección del cajón es un enlace de verdad: navega y el cajón se cierra.
  await menu(ana).getByRole('link', { name: 'Auditoría', exact: true }).click();
  await expect(cajon(ana)).toBeHidden();
  await expect(ana.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
  await abrirElCajon(ana);
  await expect(menu(ana).getByRole('link', { name: 'Auditoría', exact: true })).toHaveAttribute('aria-current', 'page');
  await page.screenshot({ path: 'test-results/navegacion-celular-oscuro-activa.png', animations: 'disabled' });
});
