import { Box, ButtonBase, Drawer, IconButton, Typography, type SxProps, type Theme } from '@mui/material';
import { Logo } from '@validalo/ui';
import { Moon, Settings, Sun, X, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ICONO_SECCION, type PropsNavegacion } from './navegacion';

/** Ancho del cajón: casi todo el celular, sin pasar de 320 px (deja ver el contenido detrás y cierra con un toque fuera). */
const ANCHO_CAJON = 'min(85vw, 320px)';

/** Una fila del cajón: ícono a la izquierda y rótulo, de alto táctil; la de la sección activa va con el tinte y el color del acento. */
const sxFila = (activo: boolean): SxProps<Theme> => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.5,
  width: '100%',
  minHeight: (th) => th.densidad.objetivoTactil,
  px: 1.5,
  borderRadius: '10px',
  textAlign: 'left',
  typography: 'subtitle1',
  color: activo ? 'acento.main' : 'text.primary',
  bgcolor: activo ? 'acento.tinte' : 'transparent',
  transition: 'background-color 120ms',
  '& .fila-icono': { display: 'flex', flex: 'none', color: activo ? 'acento.main' : 'text.secondary' },
  '&:hover': { bgcolor: activo ? 'acento.tinte' : 'superficie.nivel2' },
  '&:focus-visible': { outlineOffset: -2 },
});

interface FilaProps {
  texto: string;
  icono: LucideIcon;
  activo?: boolean;
}

function Contenido({ texto, icono: Icono, activo = false, conteo }: FilaProps & { conteo?: string }) {
  return (
    <>
      <Box component="span" className="fila-icono" aria-hidden>
        <Icono size={20} strokeWidth={activo ? 2 : 1.75} />
      </Box>
      <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {texto}
      </Box>
      {conteo && (
        <Box
          component="span"
          aria-hidden
          sx={{ flex: 'none', minWidth: 20, height: 20, px: 0.75, boxSizing: 'border-box', borderRadius: '10px', display: 'grid', placeItems: 'center', typography: 'caption', lineHeight: '20px', bgcolor: 'warning.main', color: 'warning.contrastText' }}
        >
          {conteo}
        </Box>
      )}
    </>
  );
}

/** Una sección del cajón: un enlace en fila; al elegirlo se cierra el cajón. */
function FilaEnlace({ texto, icono, destino, activo, conteo, onNavegar }: FilaProps & { destino: string; conteo?: string; onNavegar: () => void }) {
  const { t } = useTranslation();
  return (
    <ButtonBase
      component={RouterLink}
      to={destino}
      onClick={onNavegar}
      aria-current={activo ? 'page' : undefined}
      aria-label={conteo ? t('nav.conConteo', { nombre: texto, conteo }) : undefined}
      sx={sxFila(Boolean(activo))}
    >
      <Contenido texto={texto} icono={icono} activo={activo} conteo={conteo} />
    </ButtonBase>
  );
}

/**
 * Menú principal de la web de empresa en el celular (por debajo de `sm`): un cajón temporal con el logo y el botón de cerrar arriba, la empresa
 * activa como bloque tocable (si hay varias, cambia de empresa), las mismas secciones del riel como filas (ícono y rótulo, alto táctil),
 * Configuración y el tema al pie, tras un divisor. Toma las secciones, sus permisos y su estado de `PropsNavegacion`, la misma fuente
 * del riel de escritorio; se cierra al elegir una opción, con Esc o tocando fuera.
 */
export function CajonNavegacion({
  abierto,
  onCerrar,
  pestanas,
  rutaBase,
  activa,
  nombreDe,
  configuracion,
  empresa,
  tema,
}: PropsNavegacion & {
  abierto: boolean;
  onCerrar: () => void;
  /** El selector de la empresa activa (un bloque a todo el ancho). */
  empresa?: ReactNode;
  /** Alternar entre tema claro y oscuro; sin él (el contenedor lo impone) no se muestra. */
  tema?: { oscuro: boolean; onAlternar: () => void };
}) {
  const { t } = useTranslation();
  return (
    <Drawer
      open={abierto}
      onClose={onCerrar}
      slotProps={{
        paper: {
          role: 'dialog',
          'aria-modal': true,
          'aria-label': t('nav.menuPrincipal'),
          sx: { width: ANCHO_CAJON, maxWidth: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'background.paper', borderLeft: 0 },
        },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 'none', height: (th) => th.densidad.cabeceraEmbebida, pl: 3, pr: 1, borderBottom: 1, borderColor: 'divider' }}>
        <RouterLink to={`${rutaBase}/inicio`} onClick={onCerrar} style={{ display: 'inline-flex' }}>
          <Logo tamano={17} titulo={t('app.nombre')} />
        </RouterLink>
        <IconButton aria-label={t('nav.cerrarMenu')} onClick={onCerrar} sx={{ width: (th) => th.densidad.objetivoTactil, height: (th) => th.densidad.objetivoTactil }}>
          <X size={20} strokeWidth={1.75} />
        </IconButton>
      </Box>
      {empresa && (
        <Box sx={{ flex: 'none', px: 1.5, pt: 1.5, pb: 0.5 }}>
          <Typography variant="caption" component="p" sx={{ m: 0, mb: 0.5, px: 1.5, color: 'text.secondary' }}>
            {t('nav.empresaActiva')}
          </Typography>
          {empresa}
        </Box>
      )}
      <Box component="nav" aria-label={t('nav.principal')} sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1, minHeight: 0, overflowY: 'auto' }}>
          {pestanas.map((p) => (
            <Box component="li" key={p.clave}>
              <FilaEnlace texto={nombreDe(p.clave)} icono={ICONO_SECCION[p.clave]} destino={`${rutaBase}/${p.ruta}`} activo={activa === p.clave} conteo={p.conteo} onNavegar={onCerrar} />
            </Box>
          ))}
        </Box>
        {(configuracion !== undefined || tema !== undefined) && (
          <Box sx={{ flex: 'none', display: 'flex', flexDirection: 'column', gap: 0.5, px: 1.5, pt: 1.5, pb: 'max(12px, env(safe-area-inset-bottom))', borderTop: 1, borderColor: 'divider' }}>
            {configuracion && <FilaEnlace texto={t('nav.configuracion')} icono={Settings} destino={configuracion.destino} activo={configuracion.activo} onNavegar={onCerrar} />}
            {tema && (
              <ButtonBase onClick={tema.onAlternar} sx={sxFila(false)}>
                <Contenido texto={tema.oscuro ? t('app.tema.claro') : t('app.tema.oscuro')} icono={tema.oscuro ? Sun : Moon} />
              </ButtonBase>
            )}
          </Box>
        )}
      </Box>
    </Drawer>
  );
}
