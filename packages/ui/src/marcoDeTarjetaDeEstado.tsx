import { Box, Typography } from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { TonoEstado } from './estados';

/** El tono de una tarjeta de estado: los del tema (`estado.<tono>`) y el acento de la marca (lo que le toca hacer a quien mira). */
export type TonoDeTarjeta = TonoEstado | 'acento';

/** Lado del cuadro del ícono y su separación del texto (12 px): el cuerpo se sangra lo mismo, para alinearse con el título. */
const LADO_ICONO = 36;
const SANGRIA_DEL_CUERPO = 6; // 6 × 8 px = 36 (cuadro) + 12 (separación)

export interface MarcoDeTarjetaDeEstadoProps {
  /** El ícono (un documento, una sección…), dentro de un cuadro tintado con el tono. */
  icono: LucideIcon;
  /** El tono: tiñe el cuadro del ícono y, si `resaltar`, el borde. */
  tono: TonoDeTarjeta;
  /** Borde del color del tono: lo que requiere atención. Por omisión solo el de advertencia, como en el portal del tercero. */
  resaltar?: boolean;
  /** Lo opcional o secundario: el cuadro del ícono va gris y sin tinte, más tenue que el neutro. */
  tenue?: boolean;
  titulo: ReactNode;
  /** El chip de estado, a la derecha del título (en el celular, a la derecha del ícono y sobre el título). */
  chip?: ReactNode;
  /** Acciones de la cabecera (Ver, Eximir…), junto al chip y alineadas con él. */
  accionesDeCabecera?: ReactNode;
  /** Una línea bajo el título que dice de quién es (la persona relacionada). */
  persona?: ReactNode;
  /** La línea de metadatos («Obligatorio · Versión 1 · 24/11/2026»). */
  meta?: ReactNode;
  /** Lo que sigue al título, sangrado hasta alinearse con él. */
  cuerpo?: ReactNode;
  /** El pie de la tarjeta, separado por un filete (las etapas por área, por ejemplo). */
  pie?: ReactNode;
  /** Las acciones, abajo a la derecha. */
  acciones?: ReactNode;
  /**
   * Tarjeta de una sola línea de cabecera (lo que solo espera algo): también en el celular el título va junto al ícono y el chip y las acciones a su derecha, centrados
   * frente al bloque del título, en vez de bajar el título a su propia fila. Sin cuerpo ni pie ni acciones al pie, la tarjeta mide solo lo que mide su título.
   */
  compacta?: boolean;
}

/**
 * Una tarjeta de estado: un elemento de lista (`li`) con borde sutil, radio y sombra suave del tema, separado de las demás por un hueco de la lista (no por divisores). El
 * ícono va en un cuadro del color del estado para distinguir de un vistazo qué pide atención; el título con su chip (y sus acciones) a la derecha, una línea de metadatos, el
 * cuerpo sangrado, un pie con filete y las acciones abajo a la derecha. Es el cascarón común de las tarjetas de requisito del portal del tercero y de la web de la empresa.
 */
export function MarcoDeTarjetaDeEstado({ icono: Icono, tono, resaltar, tenue = false, titulo, chip, accionesDeCabecera, persona, meta, cuerpo, pie, acciones, compacta = false }: MarcoDeTarjetaDeEstadoProps) {
  const conBorde = resaltar ?? tono === 'advertencia';
  // Sin chip ni acciones en la cabecera no hace falta la franja del celular: el título va junto al ícono.
  const conCabecera = Boolean(chip) || Boolean(accionesDeCabecera);
  // En la compacta la cabecera es una sola fila (ícono | título | chip y acciones) en todos los anchos.
  const apilarEnCelular = conCabecera && !compacta;
  return (
    <Box
      component="li"
      sx={(th) => ({
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        minWidth: 0,
        p: { xs: 1.5, sm: 2 },
        border: 1,
        borderColor: conBorde ? (tono === 'acento' ? th.palette.acento.borde : th.palette.estado[tono].borde) : 'divider',
        borderRadius: `${String(th.radio.md)}px`,
        bgcolor: 'background.paper',
        boxShadow: th.sombra.suave,
      })}
    >
      {/* Escritorio: ícono | título | chip y acciones. Celular: ícono y chip en una franja y el título debajo, con todo el ancho de la tarjeta. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: compacta ? `${String(LADO_ICONO)}px minmax(0, 1fr) auto` : `${String(LADO_ICONO)}px minmax(0, 1fr)`, sm: `${String(LADO_ICONO)}px minmax(0, 1fr) auto` },
          columnGap: 1.5,
          rowGap: 1,
          alignItems: compacta ? 'center' : 'start',
        }}
      >
        <Box
          aria-hidden
          sx={(th) => ({
            display: 'grid',
            placeItems: 'center',
            width: LADO_ICONO,
            height: LADO_ICONO,
            borderRadius: `${String(th.radio.sm + 2)}px`,
            bgcolor: tenue ? th.palette.superficie.nivel2 : tono === 'acento' ? th.palette.acento.tinte : th.palette.estado[tono].fondo,
            color: tenue ? th.palette.text.disabled : tono === 'acento' ? th.palette.acento.main : th.palette.estado[tono].texto,
          })}
        >
          <Icono size={18} strokeWidth={1.75} />
        </Box>
        <Box sx={{ gridColumn: { xs: apilarEnCelular ? '1 / -1' : 2, sm: 2 }, gridRow: { xs: apilarEnCelular ? 2 : 1, sm: 1 }, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h4">
            {titulo}
          </Typography>
          {persona && <Typography variant="body2">{persona}</Typography>}
          {meta && (
            <Typography variant="caption" component="div" sx={{ color: 'text.secondary', mt: 0.25 }}>
              {meta}
            </Typography>
          )}
        </Box>
        {conCabecera && (
          <Box sx={{ gridColumn: { xs: compacta ? 3 : 2, sm: 3 }, gridRow: 1, justifySelf: 'end', alignSelf: 'center', display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 1 }}>
            {chip}
            {accionesDeCabecera}
          </Box>
        )}
      </Box>

      {/* Sangrado hasta alinearse con el título; en el celular ocupa todo el ancho de la tarjeta. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, pl: { xs: 0, sm: SANGRIA_DEL_CUERPO }, '&:empty': { display: 'none' } }}>{cuerpo}</Box>

      {pie && <Box sx={{ pt: 1.25, borderTop: 1, borderColor: 'divider', minWidth: 0, '&:empty': { display: 'none' } }}>{pie}</Box>}

      {/* Las acciones, abajo a la derecha de la tarjeta (con tarjetas de distinto alto en una misma fila quedan alineadas al pie). */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mt: 'auto', '&:empty': { display: 'none' } }}>{acciones}</Box>
    </Box>
  );
}
