import type { SxProps, Theme } from '@mui/material';

/**
 * Las medidas de la ficha del vínculo, en un solo lugar para que la ficha y su esqueleto de carga no puedan separarse: el ancho de la columna de la barra de sectores, la rejilla
 * (barra a la izquierda y contenido a la derecha desde `lg`; una sola columna por debajo) con su hueco y el estilo de la barra pegada bajo el encabezado fijo.
 */

/** Ancho de la columna de la barra en la rejilla de la ficha (`FichaVinculo`): cabe «Autorización y declaración» con su contador. */
export const ANCHO_BARRA_SECTORES = 272;

/** La rejilla de la ficha: la barra de sectores (o el selector, en pantallas angostas) y el contenido del sector. */
export const REJILLA_DE_LA_FICHA = {
  display: 'grid',
  gridTemplateColumns: { xs: 'minmax(0,1fr)', lg: `${String(ANCHO_BARRA_SECTORES)}px minmax(0,1fr)` },
  gap: { xs: 1.5, lg: 3 },
  alignItems: 'start',
} as const;

/**
 * La barra de sectores: pegada a la misma distancia del encabezado fijo que su lugar natural (el margen de 4 px del encabezado), siempre del alto disponible bajo él y, en
 * pantallas muy bajas, sin fijarse (un solo scroll, el de la página).
 */
export const ESTILO_BARRA_SECTORES: SxProps<Theme> = {
  width: '100%',
  position: 'sticky',
  top: 'calc(var(--vs-tope, 0px) + var(--vs-alto-encabezado, 96px) + 4px)',
  alignSelf: 'start',
  height: 'calc(100dvh - var(--vs-tope, 0px) - var(--vs-alto-encabezado, 96px) - 4px - 16px)',
  '@media (max-height: 640px)': { position: 'static', height: 'auto' },
};
