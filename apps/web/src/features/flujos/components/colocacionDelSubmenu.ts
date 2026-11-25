/** Cuánto mide el submenú de las secciones (cabe su texto más largo, «Seguridad y salud en el trabajo», con su ícono). */
export const ANCHO_DEL_SUBMENU = 280;
/** Cuánto mide como mínimo el menú principal: «Sección de la información» con su ícono y su flecha se lee completo. */
export const ANCHO_DEL_MENU = 264;
const SEPARACION = 4;
const MARGEN_DE_PANTALLA = 8;
/** El relleno de arriba de la lista de un menú: restado, la primera sección queda a la altura del ítem que la abre. */
const RELLENO_DE_LA_LISTA = 8;

/**
 * Dónde se abre el submenú de las secciones respecto del menú principal, sin taparlo: a la derecha, pegado a su borde y a la altura de su ítem; si a la derecha
 * no cabe (cerca del borde de la pantalla), a la izquierda, pegado a su otro borde; y si tampoco cabe a la izquierda (un celular), `debajo`: sus ítems van dentro
 * del mismo menú, bajo el que los abre.
 */
export type ColocacionDelSubmenu = { lado: 'derecha' | 'izquierda'; top: number; left: number } | { lado: 'debajo' };

export function colocarSubmenu({ menu, itemTop, anchoDePantalla }: { menu: { left: number; right: number }; itemTop: number; anchoDePantalla: number }): ColocacionDelSubmenu {
  const top = itemTop - RELLENO_DE_LA_LISTA;
  const necesita = ANCHO_DEL_SUBMENU + SEPARACION + MARGEN_DE_PANTALLA;
  if (anchoDePantalla - menu.right >= necesita) return { lado: 'derecha', top, left: menu.right + SEPARACION };
  if (menu.left >= necesita) return { lado: 'izquierda', top, left: menu.left - SEPARACION };
  return { lado: 'debajo' };
}
