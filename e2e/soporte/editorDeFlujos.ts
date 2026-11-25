import type { FrameLocator } from '@playwright/test';

/**
 * «Lo que pide el flujo» en el editor de flujos: los requisitos van agrupados por sector (el documento nuevo sin tipo, en «Por completar», al principio),
 * cada uno en una fila cerrada con su resumen, y solo una fila está abierta a la vez (la recién agregada). Por eso los campos de una fila (`Tipo de documento`, `Se pide a`, `Lo revisan`, `Periodos`…)
 * son únicos en la página mientras esa fila esté abierta: no hace falta `.nth()`.
 */

/** «Agregar» › «Documento»: suma un documento, que queda abierto en «Por completar», y le elige el tipo (al elegirlo la fila pasa a su sector sin cerrarse). */
export async function agregarDocumento(app: FrameLocator, tipo: string | RegExp): Promise<void> {
  await app.getByRole('button', { name: 'Agregar', exact: true }).click();
  await app.getByRole('menuitem', { name: 'Documento', exact: true }).click();
  await app.getByRole('combobox', { name: 'Tipo de documento' }).click();
  await app.getByRole('option', { name: tipo }).click();
}

/**
 * «Agregar» › «Sección de la información» › la sección (`Información financiera`, `Información legal`…): el submenú ofrece las que el flujo aún no pide.
 * La sección nace con su código puesto, aparece dentro de su sector y queda abierta (no hay paso intermedio para elegirla en la fila).
 */
export async function agregarSeccion(app: FrameLocator, seccion: string): Promise<void> {
  await app.getByRole('button', { name: 'Agregar', exact: true }).click();
  await app.getByRole('menuitem', { name: 'Sección de la información', exact: true }).click();
  await app.getByRole('menuitem', { name: seccion, exact: true }).click();
}

/** Abre la fila de un requisito (su botón se llama como el requisito y sigue con su resumen); cierra la que estuviera abierta. */
export async function abrirRequisito(app: FrameLocator, nombre: string): Promise<void> {
  await app.getByRole('button', { name: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).click();
}
