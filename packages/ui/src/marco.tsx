import { Box, ButtonBase, Divider, IconButton, Skeleton, Tooltip, Typography, type SxProps, type Theme } from '@mui/material';
import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';
import type { ComponentProps, ElementType, MouseEvent, ReactNode, Ref } from 'react';
import { sxComoLista } from './sx';
import { AvatarIniciales, Sobretitulo } from './tarjetas';

/**
 * Piezas del marco de las apps del rework visual: un lienzo gris claro sobre el que **flotan** paneles blancos de radio grande (la barra
 * lateral y el contenido), una barra superior sin fondo propio (logo, «píldoras» de contexto y el chip del usuario) y la navegación
 * agrupada con el ítem activo como una píldora blanca con sombra suave. Los dos shells (Plataforma y el portal del tercero) las
 * componen; el logotipo sigue siendo el `Logo` de siempre.
 */

/** Panel flotante sobre el lienzo: superficie de panel, borde muy sutil, radio grande y sombra mínima. */
export function PanelFlotante({ children, sx, component = 'div', ...resto }: { children: ReactNode; sx?: SxProps<Theme>; component?: ElementType } & Omit<ComponentProps<'div'>, 'color' | 'children'>) {
  return (
    <Box
      component={component}
      {...resto}
      sx={[
        (t: Theme) => ({
          minWidth: 0,
          bgcolor: t.palette.superficie.panel,
          border: 1,
          borderColor: 'divider',
          borderRadius: `${String(t.radio.lg)}px`,
          boxShadow: t.sombra.suave,
        }),
        ...sxComoLista(sx),
      ]}
    >
      {children}
    </Box>
  );
}

/** Barra superior sin fondo propio: el contenido va sobre el lienzo. */
export function BarraSuperior({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      component="header"
      sx={[{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 1.5 }, minWidth: 0, minHeight: (t: Theme) => t.densidad.barraSuperior, px: { xs: 1.5, md: 2.5 } }, ...sxComoLista(sx)]}
    >
      {children}
    </Box>
  );
}

/** «Píldora» de la barra superior: ícono y texto dentro de un recuadro con borde (la empresa o el grupo, la fecha). Con `onClick` o `componente` es un botón o un enlace. */
export function PildoraContexto({
  icono: Icono,
  children,
  componente,
  sx,
  ...resto
}: {
  icono?: LucideIcon;
  children: ReactNode;
  componente?: ElementType;
  sx?: SxProps<Theme>;
  to?: string;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  const interactiva = Boolean(componente ?? resto.onClick);
  return (
    <ButtonBase
      component={interactiva ? (componente ?? 'button') : 'div'}
      {...resto}
      sx={[
        (t: Theme) => ({
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          flex: 'none',
          maxWidth: '100%',
          height: 36,
          px: 1.5,
          border: 1,
          borderColor: 'divider',
          borderRadius: '10px',
          bgcolor: 'background.paper',
          boxShadow: t.sombra.suave,
          typography: 'subtitle2',
          cursor: interactiva ? 'pointer' : 'default',
          ...(interactiva && { '&:hover': { bgcolor: t.palette.superficie.nivel2 } }),
        }),
        ...sxComoLista(sx),
      ]}
    >
      {Icono && (
        <Box aria-hidden sx={{ display: 'inline-flex', color: (t) => t.palette.acento.main }}>
          <Icono size={18} strokeWidth={1.75} />
        </Box>
      )}
      <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {children}
      </Box>
    </ButtonBase>
  );
}

/** Chip del usuario: su nombre, el rol debajo en pequeño y el avatar de iniciales en verde azulado. Con `onClick` abre el menú de la cuenta. */
export function ChipUsuario({
  nombre,
  rol,
  onClick,
  ref,
  ...resto
}: {
  nombre: string;
  rol?: string;
  onClick?: (evento: MouseEvent<HTMLElement>) => void;
  ref?: Ref<HTMLButtonElement>;
  'aria-label'?: string;
  'aria-haspopup'?: 'menu' | 'dialog';
  'aria-expanded'?: boolean;
}) {
  const contenido = (
    <>
      <Box sx={{ minWidth: 0, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
        <Typography variant="subtitle1" component="span" noWrap sx={{ display: 'block', maxWidth: 220 }}>
          {nombre}
        </Typography>
        {rol && (
          <Typography variant="caption" component="span" noWrap sx={{ display: 'block', color: 'text.secondary', maxWidth: 220 }}>
            {rol}
          </Typography>
        )}
      </Box>
      <AvatarIniciales nombre={nombre} tamano={32} solido />
    </>
  );
  const estilos = (t: Theme) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 1.25,
    flex: 'none',
    minWidth: 0,
    maxWidth: '100%',
    height: 44,
    pl: { xs: 0.75, sm: 1.75 },
    pr: 0.75,
    border: 1,
    borderColor: 'divider',
    borderRadius: '12px',
    bgcolor: 'background.paper',
    boxShadow: t.sombra.suave,
  });
  if (!onClick) {
    return (
      <Box sx={estilos}>{contenido}</Box>
    );
  }
  return (
    <ButtonBase ref={ref} onClick={onClick} {...resto} sx={[estilos, (t: Theme) => ({ '&:hover': { bgcolor: t.palette.superficie.nivel2 } })]}>
      {contenido}
    </ButtonBase>
  );
}

export interface ItemNavegacion {
  clave: string;
  texto: string;
  icono: LucideIcon;
  /** Destino (con `enlace`: el `to` del enrutador). Sin destino el ítem es un botón (navegación por estado) y avisa con `onSeleccionar`. */
  a?: string;
  /** Lo que hace el ítem al elegirlo cuando no tiene destino (cambiar de sector sin salir de la página, por ejemplo). */
  onSeleccionar?: () => void;
  activo: boolean;
  /** Contador a la derecha (pendientes, avisos…); no se dibuja en 0. Con la barra colapsada queda como un punto sobre el ícono. */
  contador?: number;
  /** `advertencia` pinta el contador en ámbar (hay algo observado o rechazado). */
  tonoContador?: 'neutro' | 'advertencia';
  /** Nombre accesible cuando el texto solo no lo dice («Aprobaciones: 1 pendiente»); el contador es decorativo. */
  etiquetaAccesible?: string;
}

export interface GrupoNavegacion {
  clave: string;
  /** Título pequeño y gris del grupo («Inicio», «Comercial»…); sin título, el grupo solo se separa con la línea. */
  titulo?: string;
  items: readonly ItemNavegacion[];
}

/**
 * Navegación lateral: panel flotante con el rótulo «NAVEGACIÓN» y el control de colapsar, grupos con su título separados por una línea fina
 * e ítems de ícono de trazo fino y texto; el activo es una píldora blanca con sombra suave (sin barras de color). Colapsada muestra solo
 * los íconos (con el texto en un tooltip).
 *
 * Colapsar es suave: el panel anima solo su **ancho** y nunca cambia de estructura. Cada ítem lleva el ícono en una caja fija de 40 × 40 que no
 * se mueve; el texto, los títulos de grupo y el rótulo se quedan montados (sin saltar de línea, recortados por el panel) y solo hacen un
 * fundido de opacidad. El área de contenido que va al lado acompaña el cambio de ancho porque comparte la fila (flex). Con «reducir movimiento»
 * el tema deja las transiciones sin duración.
 */
export function NavegacionLateral({
  etiqueta,
  rotulo,
  grupos,
  enlace,
  colapsada = false,
  onAlternarColapso,
  textoColapsar,
  textoExpandir,
  iconoCierre,
  onNavegar,
  densidad = 'normal',
  sx,
}: {
  /** Nombre accesible del `nav`. */
  etiqueta: string;
  /** Rótulo en versalitas («NAVEGACIÓN»). Sin rótulo ni control de colapsar, el panel no dibuja la fila superior. */
  rotulo?: string;
  grupos: readonly GrupoNavegacion[];
  /** Componente de enlace del enrutador (recibe `to`); sin él, un `<a href>`. */
  enlace?: ElementType;
  colapsada?: boolean;
  /** Colapsar/expandir (escritorio) o cerrar (cajón del celular). Sin él no hay control. */
  onAlternarColapso?: () => void;
  textoColapsar?: string;
  textoExpandir?: string;
  /** Ícono del control cuando es un cierre (cajón) en vez de colapsar. */
  iconoCierre?: ReactNode;
  /** Se llama al elegir un ítem (para cerrar el cajón). */
  onNavegar?: () => void;
  /** `compacta` baja los ítems de 40 a 34 px: para listas largas que deben caber enteras en una barra fija (los sectores de una ficha). */
  densidad?: 'normal' | 'compacta';
  sx?: SxProps<Theme>;
}) {
  const textoControl = colapsada ? (textoExpandir ?? 'Expandir') : (textoColapsar ?? 'Colapsar');
  return (
    <PanelFlotante
      component="nav"
      aria-label={etiqueta}
      sx={[
        {
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          width: colapsada ? ANCHO_COLAPSADA : ANCHO_EXPANDIDA,
          p: 1,
          // Sin scroll horizontal durante la animación del ancho: el texto no baja de línea y lo recorta el panel.
          overflow: 'hidden',
          transition: TRANSICION_ANCHO,
        },
        ...sxComoLista(sx),
      ]}
    >
      {/* El control de colapsar vive en una caja fija de 40: conserva su posición y solo cambia de ícono. */}
      {(rotulo !== undefined || onAlternarColapso !== undefined) && (
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', height: 40, mb: 0.5, overflow: 'hidden', flex: 'none' }}>
          {onAlternarColapso && (
            <Tooltip title={textoControl} placement="right">
              <IconButton aria-label={textoControl} aria-expanded={!colapsada} onClick={onAlternarColapso} sx={{ flex: 'none', width: 40, height: 40, borderRadius: '10px' }}>
                {iconoCierre ?? (colapsada ? <PanelLeftOpen size={18} strokeWidth={1.75} aria-hidden /> : <PanelLeftClose size={18} strokeWidth={1.75} aria-hidden />)}
              </IconButton>
            </Tooltip>
          )}
          {rotulo && (
            <Sobretitulo sx={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', opacity: colapsada ? 0 : 1, transition: TRANSICION_OPACIDAD, pointerEvents: 'none' }}>{rotulo}</Sobretitulo>
          )}
        </Box>
      )}
      {/* Zona de ítems: si no caben, desplaza en vertical (nunca en horizontal). */}
      {/* La zona con scroll recorta lo que se sale de ella: se extiende sobre el relleno del panel (margen negativo + relleno igual) para que la
          sombra del ítem activo no se corte a los lados ni arriba y abajo. */}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', mx: -0.75, px: 0.75, my: -0.5, py: 0.5 }}>
        {grupos.map((grupo, i) => (
          <Box key={grupo.clave}>
            {i > 0 && <Divider sx={{ my: 1 }} />}
            {/* El título del grupo no se desmonta: se desvanece y ocupa el mismo alto, así no salta nada. */}
            {grupo.titulo && (
              <Typography variant="caption"
                component="p"
                sx={{ m: 0, px: 1.25, pb: 0.5, color: 'text.secondary', whiteSpace: 'nowrap', overflow: 'hidden', opacity: colapsada ? 0 : 1, transition: TRANSICION_OPACIDAD }}
              >
                {grupo.titulo}
              </Typography>
            )}
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {grupo.items.map((item) => (
                <Box component="li" key={item.clave}>
                  <ElementoNavegacion item={item} enlace={enlace} colapsada={colapsada} onNavegar={onNavegar} alto={ALTO_ITEM[densidad]} />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </PanelFlotante>
  );
}

/**
 * La `NavegacionLateral` mientras carga lo que la rodea: el mismo panel (mismo relleno, bordes, divisores entre grupos y alto de ítem) con la silueta de sus grupos, un título
 * pequeño y, por ítem, la caja del ícono y una barra de texto. `grupos` dice cuántos ítems tiene cada grupo; el texto varía de ancho con la posición, sin azar. Es una región
 * `status` ocupada con nombre accesible (no visible).
 */
export function EsqueletoNavegacionLateral({
  etiqueta = 'Cargando',
  grupos,
  densidad = 'normal',
  sx,
  ...resto
}: {
  etiqueta?: string;
  /** Cuántos ítems tiene cada grupo. */
  grupos: readonly number[];
  densidad?: 'normal' | 'compacta';
  sx?: SxProps<Theme>;
} & Omit<ComponentProps<'div'>, 'color' | 'children' | 'ref' | 'role' | 'aria-label'>) {
  const alto = ALTO_ITEM[densidad];
  return (
    <PanelFlotante {...resto} role="status" aria-busy="true" aria-label={etiqueta} sx={[{ boxSizing: 'border-box', display: 'flex', flexDirection: 'column', width: ANCHO_EXPANDIDA, p: 1, overflow: 'hidden' }, ...sxComoLista(sx)]}>
      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {grupos.map((cantidad, g) => (
          <Box key={g}>
            {g > 0 && <Divider sx={{ my: 1 }} />}
            <Box sx={{ px: 1.25, pb: 0.5, height: 20, display: 'flex', alignItems: 'center' }}>
              <Skeleton variant="rounded" width={56 + ((g * 3) % 3) * 12} height={9} />
            </Box>
            <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {Array.from({ length: cantidad }, (_, i) => (
                <Box component="li" key={i} sx={{ display: 'flex', alignItems: 'center', height: alto }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', width: 40, height: alto }}>
                    <Skeleton variant="rounded" width={18} height={18} />
                  </Box>
                  <Skeleton variant="rounded" height={11} width={`${String(48 + ((g * 5 + i * 7) % 5) * 9)}%`} />
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </PanelFlotante>
  );
}

const ANCHO_EXPANDIDA = 244;
/** 40 de la caja del ícono + 8 de relleno a cada lado + 1 de borde a cada lado: el contenido mide exactamente la caja del ícono. */
const ANCHO_COLAPSADA = 58;
/** Alto de cada ítem según la densidad: el ícono vive en una caja de 40 de ancho y este alto, así que el ancho colapsado no cambia. */
const ALTO_ITEM = { normal: 40, compacta: 34 } as const;
const TRANSICION_ANCHO = 'width 180ms ease';
const TRANSICION_OPACIDAD = 'opacity 180ms ease';

function ElementoNavegacion({
  item,
  enlace,
  colapsada,
  onNavegar,
  alto,
}: {
  item: ItemNavegacion;
  enlace?: ElementType;
  colapsada: boolean;
  onNavegar?: () => void;
  alto: number;
}) {
  const Icono = item.icono;
  // Con destino es un enlace del enrutador (o un `<a href>`); sin él, un botón que avisa su elección (navegación por estado).
  const conDestino = item.a !== undefined;
  const destino = !conDestino ? {} : enlace ? { to: item.a } : { href: item.a };
  const contador = item.contador ?? 0;
  const advertencia = item.tonoContador === 'advertencia';
  const alElegir = () => {
    item.onSeleccionar?.();
    onNavegar?.();
  };
  // Con el panel colapsado el texto está oculto y se ofrece en el tooltip; expandido, el tooltip no dice nada (mismo árbol en los dos estados).
  return (
    <Tooltip title={colapsada ? item.texto : ''} placement="right">
      <ButtonBase
        component={conDestino ? (enlace ?? 'a') : 'button'}
        {...destino}
        onClick={alElegir}
        aria-current={item.activo ? 'page' : undefined}
        aria-label={item.etiquetaAccesible}
        sx={(t: Theme) => ({
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          height: alto,
          justifyContent: 'flex-start',
          borderRadius: '10px',
          overflow: 'hidden',
          textAlign: 'left',
          typography: item.activo ? 'subtitle2' : 'body2',
          color: item.activo ? 'text.primary' : 'text.secondary',
          bgcolor: item.activo ? t.palette.background.paper : 'transparent',
          boxShadow: item.activo ? t.sombra.pildora : 'none',
          '&:hover': { bgcolor: item.activo ? t.palette.background.paper : t.palette.superficie.nivel2, color: 'text.primary' },
        })}
      >
        <Box aria-hidden sx={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none', width: 40, height: alto }}>
          <Icono size={alto < 40 ? 18 : 19} strokeWidth={1.5} />
          {/* Colapsada, el contador no cabe: queda un punto en la esquina del ícono (con el texto visible se desvanece). */}
          {contador > 0 && (
            <Box
              component="span"
              data-testid="punto-contador"
              sx={{
                position: 'absolute',
                top: 6,
                right: 7,
                width: 8,
                height: 8,
                borderRadius: '50%',
                bgcolor: advertencia ? 'warning.main' : 'text.secondary',
                opacity: colapsada ? 1 : 0,
                transition: TRANSICION_OPACIDAD,
              }}
            />
          )}
        </Box>
        <Box component="span" sx={{ flex: 1, minWidth: 0, pr: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: colapsada ? 0 : 1, transition: TRANSICION_OPACIDAD }}>
          {item.texto}
        </Box>
        {contador > 0 && (
          <Box
            component="span"
            aria-hidden
            data-testid="contador"
            sx={{
              typography: 'caption',
              // El número centrado en la píldora (sin esto el interlineado del caption lo dejaba corrido hacia arriba).
              lineHeight: 1,
              display: 'inline-grid',
              placeItems: 'center',
              flex: 'none',
              minWidth: 20,
              height: 20,
              mr: 1,
              px: 0.75,
              borderRadius: '10px',
              boxSizing: 'border-box',
              fontVariantNumeric: 'tabular-nums',
              bgcolor: advertencia ? 'estado.advertencia.fondo' : 'action.hover',
              color: advertencia ? 'estado.advertencia.texto' : 'text.secondary',
              opacity: colapsada ? 0 : 1,
              transition: TRANSICION_OPACIDAD,
            }}
          >
            {contador}
          </Box>
        )}
      </ButtonBase>
    </Tooltip>
  );
}
