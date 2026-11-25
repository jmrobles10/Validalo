import { describe, expect, it } from 'vitest';
import { ANCHO_DEL_SUBMENU, colocarSubmenu } from './colocacionDelSubmenu';

describe('dónde se abre el submenú de las secciones respecto del menú principal', () => {
  const menu = { left: 100, right: 364 };

  it('a la derecha, pegado al borde del menú y a la altura de su ítem (menos el relleno de la lista)', () => {
    expect(colocarSubmenu({ menu, itemTop: 500, anchoDePantalla: 1440 })).toEqual({ lado: 'derecha', top: 492, left: 368 });
  });

  it('si a la derecha no cabe, a la izquierda, pegado al otro borde del menú', () => {
    expect(colocarSubmenu({ menu: { left: 700, right: 964 }, itemTop: 300, anchoDePantalla: 1000 })).toEqual({ lado: 'izquierda', top: 292, left: 696 });
  });

  it('si no cabe a ningún lado (un celular), debajo: dentro del mismo menú y sin tapar nada', () => {
    expect(colocarSubmenu({ menu: { left: 16, right: 310 }, itemTop: 400, anchoDePantalla: 375 })).toEqual({ lado: 'debajo' });
  });

  it('cabe a la derecha justo cuando le sobra el ancho del submenú, la separación y el margen de la pantalla', () => {
    const sobra = ANCHO_DEL_SUBMENU + 4 + 8;
    expect(colocarSubmenu({ menu, itemTop: 0, anchoDePantalla: menu.right + sobra }).lado).toBe('derecha');
    expect(colocarSubmenu({ menu, itemTop: 0, anchoDePantalla: menu.right + sobra - 1 }).lado).toBe('debajo');
  });
});
