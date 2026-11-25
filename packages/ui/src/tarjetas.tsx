import { Box, ButtonBase, Stack, Typography, type SxProps, type Theme } from '@mui/material';
import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ElementType, ReactNode } from 'react';
import { iniciales } from './datos';
import { sxComoLista } from './sx';

/**
 * Tarjeta por bloque del rework visual: encabezado con ícono en el acento, título (16 px, peso medio) y ayuda corta en gris **en la misma
 * línea**, un divisor fino y el cuerpo con relleno generoso. Va sobre el panel (superficie nivel 1, borde sutil y sombra mínima). Con
 * `filete` lleva arriba un filete de 3 px del acento (tarjeta de resumen).
 */
export interface TarjetaBloqueProps {
  titulo?: ReactNode;
  /** Frase corta que acompaña al título, en gris y en su misma línea. */
  ayuda?: ReactNode;
  icono?: LucideIcon;
  /** A la derecha del encabezado (botones, contadores…). */
  acciones?: ReactNode;
  /** Nivel del encabezado del título (`h3` si la tarjeta va dentro de otra sección). */
  nivel?: 'h2' | 'h3';
  /** Nombre accesible de la región. */
  etiqueta?: string;
  /** Filete superior de 3 px del acento. */
  filete?: boolean;
  /** Cuerpo sin relleno (una tabla que llega a los bordes de la tarjeta). */
  sinRelleno?: boolean;
  children?: ReactNode;
  sx?: SxProps<Theme>;
}

export function TarjetaBloque({ titulo, ayuda, icono: Icono, acciones, nivel = 'h2', etiqueta, filete = false, sinRelleno = false, children, sx }: TarjetaBloqueProps) {
  const conEncabezado = Boolean(titulo ?? acciones);
  const conCuerpo = children !== undefined && children !== null && children !== false;
  return (
    <Box
      component="section"
      aria-label={etiqueta}
      sx={[
        (t: Theme) => ({
          position: 'relative',
          minWidth: 0,
          overflow: 'hidden',
          border: 1,
          borderColor: 'divider',
          borderRadius: `${String(t.radio.md)}px`,
          bgcolor: 'background.paper',
          boxShadow: t.sombra.suave,
        }),
        ...sxComoLista(sx),
      ]}
    >
      {filete && <Box aria-hidden sx={{ position: 'absolute', insetInline: 0, top: 0, height: 3, bgcolor: (t) => t.palette.acento.main }} />}
      {conEncabezado && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            columnGap: 1.5,
            rowGap: 1,
            minHeight: 54,
            px: { xs: 2, sm: 2.5 },
            py: 1.25,
            borderBottom: conCuerpo ? 1 : 0,
            borderColor: 'divider',
          }}
        >
          <Stack direction="row" sx={{ alignItems: 'baseline', flex: '1 1 auto', minWidth: 0, columnGap: 1.25, rowGap: 0.25, flexWrap: 'wrap' }}>
            {Icono && (
              <Box aria-hidden sx={{ display: 'inline-flex', alignSelf: 'center', flex: 'none', color: (t) => t.palette.acento.main }}>
                <Icono size={20} strokeWidth={1.75} />
              </Box>
            )}
            {titulo && (
              <Typography variant="h6" component={nivel} sx={{ minWidth: 0 }}>
                {titulo}
              </Typography>
            )}
            {ayuda && (
              <Typography component="span" variant="body2" sx={{ color: 'text.secondary', minWidth: 0 }}>
                {ayuda}
              </Typography>
            )}
          </Stack>
          {acciones && <Box sx={{ display: 'flex', alignItems: 'center', flex: 'none', maxWidth: '100%' }}>{acciones}</Box>}
        </Box>
      )}
      {conCuerpo && <Box sx={sinRelleno ? undefined : { px: { xs: 2, sm: 2.5 }, py: { xs: 2, sm: 2.25 } }}>{children}</Box>}
    </Box>
  );
}

/** Rótulo pequeño en versalitas grises (el «RESUMEN» de la tarjeta de resumen, el «NAVEGACIÓN» de la barra lateral). */
export function Sobretitulo({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Typography variant="overline" component="p" sx={[{ color: 'text.secondary', m: 0 }, ...sxComoLista(sx)]}>
      {children}
    </Typography>
  );
}

/** Un total destacado: recuadro con el tinte del acento y la cifra grande a la derecha. */
export function TotalDestacado({ etiqueta, valor }: { etiqueta: ReactNode; valor: ReactNode }) {
  return (
    <Stack
      direction="row"
      sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, px: 1.5, py: 1.25, borderRadius: (t) => `${String(t.radio.sm + 2)}px`, bgcolor: (t) => t.palette.acento.tinte }}
    >
      <Typography component="span" variant="subtitle2">
        {etiqueta}
      </Typography>
      <Typography component="span" variant="h4" sx={{ color: (t) => t.palette.acento.main }}>
        {valor}
      </Typography>
    </Stack>
  );
}

/** Avatar de iniciales en círculo: `solido` (verde azulado con la inicial en blanco, el del usuario en la barra) o con el tinte del acento (listas). */
export function AvatarIniciales({ nombre, tamano = 32, solido = false }: { nombre: string; tamano?: number; solido?: boolean }) {
  return (
    <Box
      aria-hidden
      sx={{
        display: 'grid',
        placeItems: 'center',
        flex: 'none',
        width: tamano,
        height: tamano,
        borderRadius: '50%',
        typography: 'subtitle2',
        fontSize: Math.round(tamano * 0.4),
        lineHeight: 1,
        bgcolor: (t) => (solido ? t.palette.primary.main : t.palette.acento.tinte),
        color: (t) => (solido ? t.palette.primary.contrastText : t.palette.acento.main),
      }}
    >
      {iniciales(nombre)}
    </Box>
  );
}

/** `rojo` es el tono de alerta (algo vencido, incumplido o fallido): la tarjeta lleva borde y cifra en rojo, no solo el ícono. */
export type TonoKpi = 'cian' | 'violeta' | 'verde' | 'ambar' | 'rojo';

const PALETA_KPI = { cian: 'encurso', verde: 'exito', ambar: 'advertencia', rojo: 'error' } as const;

/** Los cuatro colores de un tono del tablero (`solido`, `texto`, `fondo`, `borde`): los usan las tarjetas, las barras y las listas. */
export function coloresDeKpi(t: Theme, tono: TonoKpi) {
  return tono === 'violeta' ? t.palette.violeta : t.palette.estado[PALETA_KPI[tono]];
}

/** El tono de una cifra que es una alerta cuando es mayor que cero (lo vencido, lo incumplido, lo bloqueado): rojo si hay, verde si no. */
export function tonoDeAlerta(cantidad: number): TonoKpi {
  return cantidad > 0 ? 'rojo' : 'verde';
}

/**
 * Tarjeta del tablero: ícono dentro de un cuadrado redondeado de color suave (cian, violeta, verde, ámbar o rojo), el rótulo, la cifra grande,
 * un detalle opcional y, si hay datos que dibujar, una mini gráfica (`grafica`). Es un grupo con el nombre del rótulo (`etiqueta`, o el
 * `titulo` si es texto): el lector de pantalla lee el rótulo con su cifra. En `rojo` el borde y la cifra también se pintan de alerta.
 *
 * `barra` (opcional) es una barra fina a todo el ancho de la tarjeta, debajo de la cifra y antes del detalle (p. ej. lo consumido de un cupo); `grafica` es
 * la mini gráfica a la derecha de la cifra.
 *
 * Con `to` la tarjeta entera es un enlace (`componente`, p. ej. el `Link` del enrutador; sin él, un `<a href>`): lleva un chevron junto al
 * rótulo, el borde se marca al pasar el cursor y su nombre accesible es su contenido (o `etiqueta`, si se da).
 */
export function TarjetaKpi({
  icono: Icono,
  tono,
  titulo,
  valor,
  detalle,
  grafica,
  barra,
  etiqueta,
  componente,
  to,
}: {
  icono: LucideIcon;
  tono: TonoKpi;
  titulo: ReactNode;
  valor: ReactNode;
  detalle?: ReactNode;
  grafica?: ReactNode;
  barra?: ReactNode;
  etiqueta?: string;
  componente?: ElementType;
  to?: string;
}) {
  const alerta = tono === 'rojo';
  const enlazada = to !== undefined;
  const estilo: SxProps<Theme> = (t) => ({
    display: 'block',
    width: '100%',
    minWidth: 0,
    px: 1.75,
    py: 1.25,
    textAlign: 'left',
    border: 1,
    borderColor: alerta ? t.palette.estado.error.borde : 'divider',
    borderRadius: `${String(t.radio.md)}px`,
    bgcolor: 'background.paper',
    boxShadow: t.sombra.suave,
    ...(enlazada && { '&:hover': { borderColor: alerta ? t.palette.estado.error.texto : t.palette.acento.borde } }),
  });
  const textoDetalle = detalle && (
    <Typography component="p" variant="caption" sx={{ m: 0, mt: barra ? 0.75 : 0, color: 'text.secondary' }}>
      {detalle}
    </Typography>
  );
  const cuerpo = (
    <>
      <Stack direction="row" sx={{ alignItems: 'center', gap: 1, mb: 0.75 }}>
        <Box
          aria-hidden
          sx={(t) => ({ display: 'grid', placeItems: 'center', flex: 'none', width: 26, height: 26, borderRadius: '7px', bgcolor: coloresDeKpi(t, tono).fondo, color: coloresDeKpi(t, tono).texto })}
        >
          <Icono size={14} strokeWidth={1.75} />
        </Box>
        <Typography component="span" variant="body2" sx={{ flex: 1, minWidth: 0, color: 'text.secondary' }}>
          {titulo}
        </Typography>
        {enlazada && (
          <Box aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: 'text.secondary' }}>
            <ChevronRight size={16} strokeWidth={1.75} />
          </Box>
        )}
      </Stack>
      <Stack direction="row" sx={{ alignItems: 'flex-end', justifyContent: 'space-between', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography
            component="p"
            variant="h4"
            sx={{ m: 0, color: alerta ? (t) => t.palette.estado.error.texto : undefined }}
          >
            {valor}
          </Typography>
          {!barra && textoDetalle}
        </Box>
        {grafica && <Box sx={{ flex: 'none' }}>{grafica}</Box>}
      </Stack>
      {barra && <Box sx={{ mt: 0.75 }}>{barra}</Box>}
      {barra && textoDetalle}
    </>
  );

  if (enlazada) {
    return (
      <ButtonBase component={componente ?? 'a'} {...(componente ? { to } : { href: to })} aria-label={etiqueta} sx={estilo}>
        {cuerpo}
      </ButtonBase>
    );
  }
  return (
    <Box role="group" aria-label={etiqueta ?? (typeof titulo === 'string' ? titulo : undefined)} sx={estilo}>
      {cuerpo}
    </Box>
  );
}

/**
 * Cuántas columnas da en pantallas anchas la rejilla a un grupo de `cantidad` tarjetas, para no dejar filas a medias donde se pueda evitar:
 * 3 o menos en una fila de 3; de 4 a 6 en una sola fila; 7 o más en filas de 4.
 */
export function columnasKpi(cantidad: number): ColumnasKpi {
  if (cantidad <= 3) return 3;
  if (cantidad <= 6) return cantidad as 4 | 5 | 6;
  return 4;
}

export type ColumnasKpi = 3 | 4 | 5 | 6;

/**
 * Rejilla de las tarjetas del tablero: 1 columna en el celular, 2 desde `sm` y, en pantallas anchas, 3, 4 o 5 columnas (las tarjetas no se
 * angostan hasta partir sus rótulos; `columnasKpi` elige según cuántas hay). Nunca queda una tarjeta suelta en una fila a medias de dos columnas:
 * la última ocupa la fila entera (con 5, la quinta en `sm`, y en `md` se reparten 3 y 2, las de la segunda fila a medio ancho cada una).
 * Con `etiqueta` es una región con nombre; `ocupada` la marca como actualizándose.
 */
export function GrillaKpi({ columnas = 4, etiqueta, ocupada = false, children, sx }: { columnas?: ColumnasKpi; etiqueta?: string; ocupada?: boolean; children: ReactNode; sx?: SxProps<Theme> }) {
  const n = (cantidad: number) => `repeat(${String(cantidad)}, minmax(0, 1fr))`;
  return (
    <Box
      component={etiqueta ? 'section' : 'div'}
      aria-label={etiqueta}
      aria-busy={ocupada || undefined}
      sx={[
        (t: Theme) => ({
          display: 'grid',
          gap: 1.5,
          // Con 6, en `md` van en dos filas de 3 antes de caber las 6 en una sola.
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: n(2), ...(columnas === 6 && { md: n(3) }), lg: n(columnas) },
          ...(columnas === 5
            ? {
                [t.breakpoints.only('sm')]: { '& > :nth-child(5)': { gridColumn: '1 / -1' } },
                [t.breakpoints.between('md', 'lg')]: { gridTemplateColumns: n(6), '& > :nth-child(-n+3)': { gridColumn: 'span 2' }, '& > :nth-child(n+4)': { gridColumn: 'span 3' } },
              }
            : // En dos columnas, una última tarjeta que quedaría sola en su fila ocupa la fila entera.
              { [t.breakpoints.between('sm', 'lg')]: { '& > :last-child:nth-child(odd)': { gridColumn: '1 / -1' } } }),
        }),
        ...sxComoLista(sx),
      ]}
    >
      {children}
    </Box>
  );
}

/** Mini gráfica de proporción (`valor` de `total`) para una tarjeta del tablero: una barra de 6 px, no un dato inventado. */
export function MiniBarra({ valor, total, tono = 'cian', etiqueta }: { valor: number; total: number; tono?: TonoKpi; etiqueta: string }) {
  const porcentaje = total > 0 ? Math.max(0, Math.min(100, (valor / total) * 100)) : 0;
  return (
    <Box
      role="img"
      aria-label={etiqueta}
      sx={(t) => ({ width: 72, height: 6, borderRadius: 3, bgcolor: coloresDeKpi(t, tono).fondo, overflow: 'hidden', mb: 0.75 })}
    >
      <Box sx={(t) => ({ width: `${String(porcentaje)}%`, height: '100%', borderRadius: 3, bgcolor: coloresDeKpi(t, tono).solido })} />
    </Box>
  );
}

/**
 * Fila de una lista de atención («Necesita atención», «Lo que te toca»): ícono en círculo suave, título y subtítulo, un chip (el estado, el
 * conteo o la cifra) y un chevron. Es un enlace (`componente` + `to`, p. ej. el `Link` del enrutador) o un botón (`onClick`); sin ninguno de
 * los dos es una fila informativa, sin chevron ni efecto al pasar el cursor.
 *
 * El título y el subtítulo se truncan en una línea (`truncar`); con `truncar={false}` se envuelven, para frases que no deben cortarse. `notas`
 * añade debajo líneas de apoyo (un aviso en rojo, una ayuda).
 */
export function FilaAtencion({
  icono: Icono,
  titulo,
  subtitulo,
  notas,
  chip,
  tono = 'cian',
  truncar = true,
  componente,
  ...resto
}: {
  icono: LucideIcon;
  titulo: ReactNode;
  subtitulo?: ReactNode;
  notas?: ReactNode;
  chip?: ReactNode;
  tono?: TonoKpi;
  truncar?: boolean;
  componente?: ElementType;
  to?: string;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  const interactiva = resto.to !== undefined || resto.onClick !== undefined;
  const estilo: SxProps<Theme> = (t) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    width: '100%',
    px: 1.5,
    py: 1.25,
    textAlign: 'left',
    borderRadius: `${String(t.radio.sm + 2)}px`,
    ...(interactiva && { '&:hover': { bgcolor: 'superficie.nivel2' } }),
  });
  const contenido = (
    <>
      <Box
        aria-hidden
        sx={(t) => ({ display: 'grid', placeItems: 'center', flex: 'none', width: 36, height: 36, borderRadius: '50%', bgcolor: coloresDeKpi(t, tono).fondo, color: coloresDeKpi(t, tono).texto })}
      >
        <Icono size={17} strokeWidth={1.75} />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="subtitle1" component="span" noWrap={truncar} sx={{ display: 'block' }}>
          {titulo}
        </Typography>
        {subtitulo && (
          <Typography component="span" noWrap={truncar} variant="body2" sx={{ display: 'block', color: 'text.secondary' }}>
            {subtitulo}
          </Typography>
        )}
        {notas && <Box component="span" sx={{ display: 'block' }}>{notas}</Box>}
      </Box>
      {chip}
      {interactiva && (
        <Box aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: 'text.secondary' }}>
          <ChevronRight size={18} strokeWidth={1.75} />
        </Box>
      )}
    </>
  );
  if (!interactiva) return <Box sx={estilo}>{contenido}</Box>;
  return (
    <ButtonBase component={componente ?? 'button'} {...resto} sx={estilo}>
      {contenido}
    </ButtonBase>
  );
}

/**
 * Sección plana de un formulario: sin caja ni sombra. Un título pequeño con su ícono en el acento y la ayuda en la misma línea; las
 * secciones consecutivas se separan con espacio y una línea fina. Es lo que va **dentro de un panel** (una tarjeta dentro del panel sería
 * un marco dentro de otro marco).
 */
export function SeccionPlana({
  titulo,
  ayuda,
  icono: Icono,
  nivel = 'h2',
  etiqueta,
  children,
}: {
  titulo: ReactNode;
  ayuda?: ReactNode;
  icono?: LucideIcon;
  nivel?: 'h2' | 'h3';
  etiqueta?: string;
  children: ReactNode;
}) {
  return (
    <Box
      component="section"
      data-seccion=""
      aria-label={etiqueta ?? (typeof titulo === 'string' ? titulo : undefined)}
      sx={{ minWidth: 0, '[data-seccion] + &': { mt: 3, pt: 3, borderTop: 1, borderColor: 'divider' } }}
    >
      <Stack direction="row" useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.25, rowGap: 0.25, mb: 2 }}>
        {Icono && (
          <Box aria-hidden sx={{ display: 'inline-flex', alignSelf: 'center', flex: 'none', color: (t) => t.palette.acento.main }}>
            <Icono size={18} strokeWidth={1.75} />
          </Box>
        )}
        <Typography variant="subtitle1" component={nivel} sx={{ minWidth: 0 }}>
          {titulo}
        </Typography>
        {ayuda && (
          <Typography component="span" variant="body2" sx={{ color: 'text.secondary', minWidth: 0 }}>
            {ayuda}
          </Typography>
        )}
      </Stack>
      {children}
    </Box>
  );
}
