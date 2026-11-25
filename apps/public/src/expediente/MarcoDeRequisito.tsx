import { Box, Typography } from '@mui/material';
import type { TonoEstado } from '@validalo/ui';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** Lado del cuadro del ícono y su separación del texto (12 px): el cuerpo se sangra lo mismo, para alinearse con el título. */
const LADO_ICONO = 36;
const SANGRIA_DEL_CUERPO = 6; // 6 × 8 px = 36 (cuadro) + 12 (separación)

interface Props {
  /** El ícono del requisito (un documento, una sección), dentro de un cuadro tintado con el tono del estado. */
  icono: LucideIcon;
  /** El tono del estado (`tonoDeRequisito`): tiñe el cuadro del ícono y, si es de advertencia (lo que le toca al tercero), el borde. */
  tono: TonoEstado;
  titulo: ReactNode;
  /** El chip de estado, a la derecha del título (en el celular, a la derecha del ícono y sobre el título). */
  chip: ReactNode;
  /** Una línea bajo el título que dice de quién es (la persona relacionada). */
  persona?: ReactNode;
  /** La línea de metadatos: «Aún no lo subes · PDF o JPG de hasta 20 MB». */
  meta?: ReactNode;
  /** Lo que sigue al título: vigencia, por qué se pide, ayuda, plantilla, avisos y observaciones. */
  cuerpo?: ReactNode;
  /** El pie: las acciones, abajo a la derecha. */
  acciones?: ReactNode;
}

/**
 * Un requisito que pide la empresa como **tarjeta propia** (borde sutil y radio del tema; la lista las separa con un hueco, no con
 * divisores): el ícono en un cuadro del color del estado para distinguir de un vistazo qué falta, el título con su chip a la derecha,
 * una sola línea de metadatos, el cuerpo y las acciones al pie. Es el cascarón común de `TarjetaRequisito` y `TarjetaRequisitoSeccion`.
 */
export function MarcoDeRequisito({ icono: Icono, tono, titulo, chip, persona, meta, cuerpo, acciones }: Props) {
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
        borderColor: tono === 'advertencia' ? th.palette.estado.advertencia.borde : 'divider',
        borderRadius: `${String(th.radio.md)}px`,
        bgcolor: 'background.paper',
        boxShadow: th.sombra.suave,
      })}
    >
      {/* Escritorio: ícono | título | chip. Celular: ícono y chip en una franja y el título debajo, con todo el ancho de la tarjeta. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: `${String(LADO_ICONO)}px minmax(0, 1fr)`, sm: `${String(LADO_ICONO)}px minmax(0, 1fr) auto` },
          columnGap: 1.5,
          rowGap: 1,
          alignItems: 'start',
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
            bgcolor: th.palette.estado[tono].fondo,
            color: th.palette.estado[tono].texto,
          })}
        >
          <Icono size={18} strokeWidth={1.75} />
        </Box>
        <Box sx={{ gridColumn: { xs: '1 / -1', sm: 2 }, gridRow: { xs: 2, sm: 1 }, minWidth: 0 }}>
          <Typography variant="subtitle1" component="h4">
            {titulo}
          </Typography>
          {persona && <Typography variant="body2">{persona}</Typography>}
          {meta && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.25 }}>
              {meta}
            </Typography>
          )}
        </Box>
        <Box sx={{ gridColumn: { xs: 2, sm: 3 }, gridRow: 1, justifySelf: 'end' }}>{chip}</Box>
      </Box>

      {/* Sangrado hasta alinearse con el título; en el celular ocupa todo el ancho de la tarjeta. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, pl: { xs: 0, sm: SANGRIA_DEL_CUERPO }, '&:empty': { display: 'none' } }}>{cuerpo}</Box>

      {/* Las acciones, abajo a la derecha de la tarjeta (con tarjetas de distinto alto en una misma fila quedan alineadas al pie). */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 1, mt: 'auto', '&:empty': { display: 'none' } }}>{acciones}</Box>
    </Box>
  );
}
