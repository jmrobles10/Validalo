import { Box, Stack, Typography } from '@mui/material';
import { Dato, RejillaDatos } from '@validalo/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { esObjeto, etiquetaCampo, formatearValor, SIN_DATO, tieneValor, tituloDeFila } from './formato';
import { ordenarPares, ordenDeLoAnidado } from './ordenDeCampos';

/** Un bloque con el fondo de las superficies secundarias del tema, su radio y relleno: lo que agrupa datos dentro de la tarjeta de una sección. */
export function Bloque({ children, component = 'div', ...resto }: { children: ReactNode; component?: 'section' | 'li' | 'div'; 'aria-label'?: string }) {
  return (
    <Box component={component} {...resto} sx={{ p: 1.5, minWidth: 0, bgcolor: 'superficie.nivel2', borderRadius: (th) => `${String(th.radio.md)}px` }}>
      {children}
    </Box>
  );
}

/** Un grupo del esquema (la dirección por partes, una resolución, la moneda extranjera): su título y sus pares etiqueta/valor, en un bloque. */
export function BloqueDeGrupo({ clave, valor }: { clave: string; valor: Record<string, unknown> }) {
  const { t } = useTranslation();
  const titulo = etiquetaCampo(clave, t);
  return (
    <Bloque component="section" aria-label={titulo}>
      <Typography variant="subtitle2" component="h5" sx={{ mb: 1 }}>
        {titulo}
      </Typography>
      <Rejilla datos={valor} orden={ordenDeLoAnidado(clave)} />
    </Bloque>
  );
}

/** Las filas de una lista que no son personas (los municipios de ICA): cada una en su bloque, con sus pares en el orden del esquema. */
export function ListaDeFilas({ clave, filas }: { clave: string; filas: readonly Record<string, unknown>[] }) {
  const { t } = useTranslation();
  const titulo = etiquetaCampo(clave, t);
  return (
    <Stack component="section" aria-label={titulo} spacing={1}>
      <Typography variant="subtitle2" component="h5">
        {titulo}
      </Typography>
      <Stack component="ol" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
        {filas.map((fila, i) => {
          const nombre = tituloDeFila(clave, fila, i, t);
          return (
            <Bloque key={`${clave}-${String(i)}`} component="li" aria-label={nombre}>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.5 }}>
                {nombre}
              </Typography>
              <Rejilla datos={fila} orden={ordenDeLoAnidado(clave)} />
            </Bloque>
          );
        })}
      </Stack>
    </Stack>
  );
}

/** Rejilla de pares etiqueta/valor (un nivel; un grupo anidado se muestra en una línea), en el orden de `orden`; lo que ese orden no nombra, al final. */
export function Rejilla({ datos, orden = [] }: { datos: Record<string, unknown>; orden?: readonly string[] }) {
  const { t } = useTranslation();
  const pares = ordenarPares(
    Object.entries(datos).filter(([, v]) => v === SIN_DATO || tieneValor(v)),
    orden,
  );
  return (
    <RejillaDatos columnas={2}>
      {pares.map(([clave, valor]) => (
        <Dato key={clave} etiqueta={etiquetaCampo(clave, t)}>
          {valor === SIN_DATO ? (
            <Typography component="span" variant="body2" sx={{ color: 'estado.advertencia.texto' }}>
              {t('fichaMaestra.sinDato')}
            </Typography>
          ) : esObjeto(valor) ? (
            Object.entries(valor)
              .filter(([, v]) => tieneValor(v))
              .map(([k, v]) => `${etiquetaCampo(k, t)}: ${formatearValor(k, v, t)}`)
              .join(' · ')
          ) : (
            formatearValor(clave, valor, t)
          )}
        </Dato>
      ))}
    </RejillaDatos>
  );
}
