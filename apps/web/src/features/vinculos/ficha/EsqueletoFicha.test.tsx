import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { EsqueletoDeSector, EsqueletoFicha } from './EsqueletoFicha';
import { ANCHO_BARRA_SECTORES, REJILLA_DE_LA_FICHA } from './medidasDeLaFicha';
import { SECTORES, type Sector } from './sectores';

/** jsdom no trae `matchMedia`: `ancho` dice si la pantalla alcanza el punto de corte `lg` (con barra lateral) o no (selector desplegable). */
function conPantalla(ancha: boolean) {
  window.matchMedia = (consulta: string) =>
    ({
      matches: ancha,
      media: consulta,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

function montar(sector: Sector, ancha: boolean) {
  conPantalla(ancha);
  return render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <MemoryRouter>
        <EsqueletoFicha sector={sector} volver={<a href="#/vinculos">Vínculos</a>} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => {
  // @ts-expect-error se restaura el estado de jsdom (sin matchMedia)
  delete window.matchMedia;
});

describe('Esqueleto de la ficha del vínculo', () => {
  it('tiene el encabezado de la ficha: la miga «‹ Vínculos /», la silueta del nombre, del NIT, del tipo y del estado, y el botón «⋯»', () => {
    const { container } = montar('documentos', true);

    const encabezado = container.querySelector('[data-encabezado-fijo]')!;
    expect(encabezado).not.toBeNull();
    expect(within(encabezado as HTMLElement).getByRole('link', { name: 'Vínculos' })).toBeInTheDocument();
    expect(within(encabezado as HTMLElement).getByRole('heading', { level: 1 })).toBeInTheDocument();
    // La silueta del nombre y de los datos (nombre, NIT, tipo y estado) y la del botón de acciones: barras grises, no texto.
    expect(encabezado.querySelectorAll('.MuiSkeleton-root').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument();
  });

  it('en pantallas anchas tiene el riel de sectores con sus tres grupos (Proceso, Información, Registro) y un ítem por sector, con la medida de la barra real', () => {
    const { container } = montar('legal', true);

    const riel = container.querySelector('[data-esqueleto="riel"]')!;
    expect(riel).not.toBeNull();
    expect(screen.getByRole('status', { name: 'Cargando los sectores de la ficha' })).toBe(riel);
    expect(riel.querySelectorAll('ul')).toHaveLength(3);
    // Un ítem por sector menos «Evaluación»… todos: 1 + 9 + 4.
    expect(riel.querySelectorAll('li')).toHaveLength(14);
    expect(riel.querySelectorAll('li .MuiSkeleton-root').length).toBeGreaterThanOrEqual(28);
    // Las medidas son las de la ficha real (una sola fuente): la columna del riel es la que usa la rejilla.
    expect(ANCHO_BARRA_SECTORES).toBe(272);
    expect(REJILLA_DE_LA_FICHA.gridTemplateColumns.lg).toBe('272px minmax(0,1fr)');
  });

  it('en pantallas angostas el riel pasa a ser el selector de una línea (la estructura del celular real), no la barra', () => {
    const { container } = montar('legal', false);

    expect(container.querySelector('[data-esqueleto="riel"]')).toBeNull();
    expect(container.querySelector('[data-esqueleto="contenido"]')).not.toBeNull();
    expect(container.querySelector('[data-encabezado-fijo]')).not.toBeNull();
  });

  it('a la derecha va el contenido del sector pedido, con su nombre accesible', () => {
    const { container } = montar('cuenta', true);

    const contenido = container.querySelector('[data-esqueleto="contenido"]')!;
    expect(screen.getByRole('status', { name: 'Cargando Cuenta bancaria' })).toBe(contenido);
    // «Lo que pide» y la tarjeta de la cuenta: dos tarjetas con encabezado.
    expect(contenido.querySelectorAll('.MuiSkeleton-rounded').length).toBeGreaterThan(8);
  });

  it('cada sector tiene su silueta: los que declaran información llevan el título de «Lo que declaró el tercero» y los sin expediente, solo tarjetas', () => {
    const conTitulo = render(
      <ThemeProvider theme={createValidaloTheme('light')}>
        <EsqueletoDeSector sector="legal" />
      </ThemeProvider>,
    );
    const tarjetasLegal = conTitulo.container.querySelectorAll('.MuiBox-root').length;
    conTitulo.unmount();
    const historial = render(
      <ThemeProvider theme={createValidaloTheme('light')}>
        <EsqueletoDeSector sector="historial" />
      </ThemeProvider>,
    );
    expect(tarjetasLegal).toBeGreaterThan(historial.container.querySelectorAll('.MuiBox-root').length);
    // Todos los sectores tienen silueta.
    for (const sector of SECTORES) {
      const { container, unmount } = render(
        <ThemeProvider theme={createValidaloTheme('light')}>
          <EsqueletoDeSector sector={sector} />
        </ThemeProvider>,
      );
      expect(container.querySelector('.MuiSkeleton-root')).not.toBeNull();
      unmount();
    }
  });
});
