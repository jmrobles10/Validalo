import { expect, test } from '@playwright/test';
import { abrirDesdeBandeja, aprobarArea, irASeccion, irASector } from '../soporte/empresa';
import { aprobarUltimaArea, enRevision, esperarListas, pedirVerificaciones, personaEmbebida } from '../soporte/cumplimiento';
import { esperarEstadoDelTercero } from '../soporte/proveedor';
import { crearEscenario } from '../soporte/semilla';

/**
 * Verificaciones de cumplimiento (H7) con el proveedor de listas simulado de desarrollo: un nombre con «coincidencia»
 * aparece en OFAC. El flujo de proveedores de Norte pide además listas restrictivas (y, en la primera prueba, el estudio
 * del oficial): aunque Compras y Cumplimiento aprueben, el expediente no se aprueba hasta que la verificación se satisface.
 * Las verificaciones viven en el sector «Oficial de cumplimiento» de la ficha y la decisión de las áreas en «Aprobaciones».
 */

test('sin coincidencias: las áreas aprueban y el expediente espera el estudio del oficial de cumplimiento', async ({ page, browser }) => {
  const e = await crearEscenario();
  await pedirVerificaciones(e, [
    { tipo: 'ListasRestrictivas', bloqueante: true },
    { tipo: 'EstudioDeCumplimiento', bloqueante: true },
  ]);
  const nombre = 'Aceros del Norte S.A.S.';
  await enRevision(page, e, nombre);

  const ruben = await personaEmbebida(browser, e, e.ruben);
  await abrirDesdeBandeja(ruben, nombre, 'Compras');
  await aprobarArea(ruben, 'Compras');

  const olga = await personaEmbebida(browser, e, e.olga);
  await esperarListas(olga, nombre, 'Cumplimiento', 'Satisfecha');
  const listas = olga.getByRole('region', { name: 'Listas restrictivas' });
  await expect(listas).toContainText('Ninguna persona aparece en las listas consultadas.');
  await expect(listas.getByRole('button', { name: 'Evidencia (PDF)' })).toBeVisible();
  // Todas las áreas aprueban, pero el estudio bloquea: sigue en revisión y lo dice.
  await aprobarUltimaArea(olga, 'Cumplimiento', /Estudio de cumplimiento \(pendiente\)/);
  await esperarEstadoDelTercero(page, 'EnRevision');

  // El estudio con riesgo alto exige debida diligencia intensificada.
  await irASector(olga, 'Oficial de cumplimiento');
  await olga.getByRole('button', { name: 'Registrar estudio' }).click();
  const dialogo = olga.getByRole('dialog', { name: /Estudio de cumplimiento/ });
  await dialogo.getByRole('button', { name: '3 · Alto' }).click();
  await dialogo.getByRole('combobox', { name: 'Concepto' }).click();
  await olga.getByRole('option', { name: 'Favorable', exact: true }).click();
  await dialogo.getByRole('button', { name: 'Registrar estudio' }).click();
  await expect(dialogo.getByText('Con riesgo alto la debida diligencia debe ser intensificada.')).toBeVisible();
  await dialogo.getByRole('combobox', { name: 'Debida diligencia' }).click();
  await olga.getByRole('option', { name: 'Intensificada' }).click();
  await dialogo.getByRole('textbox', { name: 'Observaciones' }).fill('Sector de alto riesgo; sin hallazgos en listas ni prensa.');
  await dialogo.getByRole('button', { name: 'Registrar estudio' }).click();
  await expect(dialogo).toBeHidden();

  await expect(olga.getByRole('region', { name: 'Estudio de cumplimiento' })).toContainText('3 · Alto');
  await irASector(olga, 'Aprobaciones');
  await expect(olga.getByText(/Todas las áreas aprobaron el .* y el vínculo quedó activo\./)).toBeVisible();
  await esperarEstadoDelTercero(page, 'Aprobado');
});

test('con coincidencia: el oficial la ve en su bandeja, la descarta con justificación y el expediente se aprueba', async ({ page, browser }) => {
  const e = await crearEscenario();
  await pedirVerificaciones(e, [{ tipo: 'ListasRestrictivas', bloqueante: true }]);
  const nombre = 'Ferretería Coincidencia S.A.S.';
  await enRevision(page, e, nombre);

  const ruben = await personaEmbebida(browser, e, e.ruben);
  await abrirDesdeBandeja(ruben, nombre, 'Compras');
  await aprobarArea(ruben, 'Compras');
  // Rubén es revisor: ve las verificaciones pero no decide como Cumplimiento.
  await esperarListas(ruben, nombre, 'Compras', 'Coincidencia por analizar');
  await expect(ruben.getByRole('button', { name: 'Descartar' })).toHaveCount(0);

  const olga = await personaEmbebida(browser, e, e.olga);
  await esperarListas(olga, nombre, 'Cumplimiento', 'Coincidencia por analizar');
  await aprobarUltimaArea(olga, 'Cumplimiento', /Listas restrictivas \(coincidencia por analizar\)/);
  await esperarEstadoDelTercero(page, 'EnRevision');

  // Su bandeja de cumplimiento lo muestra como lo único que falta.
  await irASeccion(olga, 'Cumplimiento');
  const fila = olga.getByRole('row').filter({ hasText: nombre });
  await expect(fila).toContainText('Solo falta esto para aprobar');
  await fila.getByRole('link', { name: 'Abrir' }).click();

  // «Abrir» lleva a la ficha del vínculo: la coincidencia está en el sector «Oficial de cumplimiento».
  await irASector(olga, 'Oficial de cumplimiento');
  // Con el vínculo activo, «Monitoreo de listas» repite la misma coincidencia en el sector: se decide la de las listas del expediente.
  const coincidencia = olga.getByRole('region', { name: 'Listas restrictivas' }).getByRole('listitem', { name: `${nombre} · OFAC (SDN)` });
  await expect(coincidencia).toContainText(nombre.toUpperCase());
  await coincidencia.getByRole('button', { name: 'Descartar' }).click();
  const dialogo = olga.getByRole('dialog', { name: 'Descartar coincidencia' });
  await dialogo.getByRole('button', { name: 'Guardar decisión' }).click();
  await expect(dialogo.getByText('Escribe la justificación.')).toBeVisible();
  await dialogo.getByRole('textbox', { name: /Justificación/ }).fill('Homónimo: el NIT del listado es otro.');
  await dialogo.getByRole('button', { name: 'Guardar decisión' }).click();
  await expect(dialogo).toBeHidden();

  await expect(coincidencia).toContainText('Homónimo: el NIT del listado es otro.');
  await irASector(olga, 'Aprobaciones');
  await expect(olga.getByText(/Todas las áreas aprobaron el .* y el vínculo quedó activo\./)).toBeVisible();
  await esperarEstadoDelTercero(page, 'Aprobado');

  // El informe SAGRILAFT lo cuenta y se exporta a Excel.
  await irASeccion(olga, 'Cumplimiento');
  await olga.getByRole('tab', { name: 'Informe SAGRILAFT' }).click();
  await expect(olga.getByRole('table', { name: 'Informe SAGRILAFT' })).toContainText(nombre);
  const pagina = olga.owner().page();
  const [descarga] = await Promise.all([pagina.waitForEvent('download'), olga.getByRole('button', { name: 'Descargar Excel' }).click()]);
  expect(descarga.suggestedFilename()).toMatch(/\.xlsx$/);
});
