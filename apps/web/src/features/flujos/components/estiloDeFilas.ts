import type { SxProps, Theme } from '@mui/material';
import { BORDE } from '@validalo/ui';

/** Una etiqueta del resumen de una fila: si su texto no cabe en el ancho (un celular), baja de línea en lugar de cortarse con puntos suspensivos. */
export const CHIP_QUE_BAJA_DE_LINEA: SxProps<Theme> = {
  minWidth: 0,
  maxWidth: '100%',
  height: 'auto',
  minHeight: 24,
  '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: '2px' },
};

/**
 * El anillo de foco del teclado en un botón de MUI: `ButtonBase` quita el contorno con su propia clase y le gana a la regla global de `:focus-visible`,
 * así que los controles de estas filas lo piden con la clase `Mui-focusVisible`. `separacion` negativa lo dibuja por dentro (la fila recorta lo que sobresale).
 */
export const focoVisible = (th: Theme, separacion = -2) => ({
  '&.Mui-focusVisible': { outline: `${String(BORDE.anilloFoco)}px solid ${th.palette.acento.main}`, outlineOffset: `${String(separacion)}px` },
});

/** La etiqueta de la condición de «Se pide a»: baja de línea como las demás. */
export const CHIP_DE_CONDICION: SxProps<Theme> = CHIP_QUE_BAJA_DE_LINEA;

/**
 * El texto de la condición dentro de su etiqueta: si pide más de dos líneas (varios valores con su nombre del catálogo) se corta con puntos suspensivos;
 * la frase completa va en el título de la etiqueta. Va en un contenedor aparte para que el relleno de la etiqueta no deje ver la tercera línea.
 */
export const TEXTO_DE_CONDICION: SxProps<Theme> = { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflow: 'hidden', overflowWrap: 'anywhere' };
