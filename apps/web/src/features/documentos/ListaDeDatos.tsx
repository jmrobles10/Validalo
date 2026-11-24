import { Box } from '@mui/material';
import { Fragment, type ReactNode } from 'react';

/** Una fila de la lista: etiqueta y valor ya listos para mostrar. */
export interface FilaDeDato {
  clave: string;
  etiqueta: string;
  valor: ReactNode;
  /** Un valor largo (lista u objeto) ocupa todo el ancho junto a su etiqueta, en lugar de compartir fila con otro par. */
  ancho?: boolean;
  /** Cifras con ancho fijo, para que se alineen entre filas. */
  numerico?: boolean;
  /** Pinta el valor con el tono de advertencia. */
  advertencia?: boolean;
}

/** Ancho del contenedor desde el cual la lista pasa a dos pares etiqueta/valor por fila. */
const ANCHO_DOS_PARES = '720px';

/**
 * Lista de definiciones (etiqueta y valor) de una versión: los datos que declaró el tercero y lo que leyó la IA. Una sola grilla
 * alinea las etiquetas de todas las filas; en un contenedor angosto (el panel del visor) va un par por fila y en uno ancho (la tarjeta
 * del requisito) dos, para no dejar vacío todo el lado derecho. El ancho que cuenta es el del contenedor, no el de la ventana.
 */
export function ListaDeDatos({ filas, etiqueta }: { filas: readonly FilaDeDato[]; etiqueta?: string }) {
  return (
    <Box sx={{ containerType: 'inline-size', containerName: 'datos-de-version' }}>
      <Box
        component="dl"
        aria-label={etiqueta}
        sx={{
          typography: 'body2',
          m: 0,
          display: 'grid',
          gridTemplateColumns: 'fit-content(40%) minmax(0, 1fr)',
          columnGap: 1.5,
          rowGap: 0.5,
          [`@container datos-de-version (min-width: ${ANCHO_DOS_PARES})`]: {
            gridTemplateColumns: 'fit-content(26%) minmax(0, 1fr) fit-content(26%) minmax(0, 1fr)',
            columnGap: 1.5,
            '& > dd': { pr: 2 },
          },
        }}
      >
        {filas.map((fila) => (
          <Fragment key={fila.clave}>
            <Box component="dt" sx={{ color: 'text.secondary', ...(fila.ancho && { gridColumnStart: 1 }) }}>
              {fila.etiqueta}
            </Box>
            <Box
              component="dd"
              sx={{
                m: 0,
                overflowWrap: 'anywhere',
                ...(fila.ancho && { gridColumn: '2 / -1' }),
                ...(fila.numerico && { fontVariantNumeric: 'tabular-nums' }),
                ...(fila.advertencia && { color: 'estado.advertencia.texto' }),
              }}
            >
              {fila.valor}
            </Box>
          </Fragment>
        ))}
      </Box>
    </Box>
  );
}
