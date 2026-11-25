import { Box, ButtonBase, type SxProps, type Theme } from '@mui/material';
import { Logo, sxComoLista } from '@validalo/ui';
import { Settings, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { ICONO_SECCION, type PropsNavegacion } from './navegacion';

/** Ancho del riel (px): cabe el rótulo más largo («Revalidaciones») en una línea y el logotipo completo arriba. */
const ANCHO_RIEL = 96;

interface ItemRiel {
  clave: string;
  texto: string;
  icono: LucideIcon;
  destino: string;
  activo: boolean;
  /** Pendientes de la sección (texto: «3», «200+»): una insignia sobre el ícono. */
  conteo?: string;
}

/** Un ítem del riel: el ícono en una píldora (con el tinte del acento si es la sección activa) y su rótulo corto debajo. */
function ElementoRiel({ texto, icono: Icono, destino, activo, conteo }: ItemRiel) {
  const { t } = useTranslation();
  return (
    <ButtonBase
      component={RouterLink}
      to={destino}
      aria-current={activo ? 'page' : undefined}
      aria-label={conteo ? t('nav.conConteo', { nombre: texto, conteo }) : undefined}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        width: '100%',
        py: 0.75,
        borderRadius: '10px',
        color: activo ? 'text.primary' : 'text.secondary',
        '&:hover': { color: 'text.primary', '& .riel-pildora': { bgcolor: activo ? 'acento.tinte' : 'superficie.nivel2' } },
        '&:focus-visible': { outlineOffset: -2 },
      }}
    >
      <Box
        className="riel-pildora"
        aria-hidden
        sx={{
          position: 'relative',
          display: 'grid',
          placeItems: 'center',
          width: 44,
          height: 30,
          borderRadius: '15px',
          bgcolor: activo ? 'acento.tinte' : 'transparent',
          color: activo ? 'acento.main' : 'inherit',
          transition: 'background-color 120ms',
        }}
      >
        <Icono size={19} strokeWidth={activo ? 2 : 1.75} />
        {conteo && (
          <Box
            component="span"
            sx={{
              position: 'absolute',
              top: -4,
              right: -2,
              minWidth: 16,
              height: 16,
              px: 0.5,
              borderRadius: '8px',
              display: 'grid',
              placeItems: 'center',
              typography: 'caption',
              lineHeight: '16px',
              bgcolor: 'warning.main',
              color: 'warning.contrastText',
            }}
          >
            {conteo}
          </Box>
        )}
      </Box>
      {/* El rótulo no cambia de variante al activarse (no salta ni se recorta): solo de color. */}
      <Box component="span" sx={{ typography: 'caption', lineHeight: '14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
        {texto}
      </Box>
    </ButtonBase>
  );
}

/**
 * Menú principal de la web de empresa en pantallas desde `sm` como riel lateral fijo (a la izquierda, todo el alto): el logo, una opción por
 * sección (ícono + rótulo corto) y, abajo, Configuración. Compacto para que las secciones quepan sin desplazamiento; si no
 * caben (pantallas muy bajas), la lista desplaza en vertical. La barra propia de cada sección (Configuración, la ficha
 * del vínculo) se abre a la derecha del riel, dentro del contenido.
 */
export function RielNavegacion({
  pestanas,
  rutaBase,
  activa,
  nombreDe,
  configuracion,
  sx,
}: PropsNavegacion & { sx?: SxProps<Theme> }) {
  const { t } = useTranslation();
  return (
    <Box
      component="nav"
      aria-label={t('nav.principal')}
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          width: ANCHO_RIEL,
          flex: 'none',
          boxSizing: 'border-box',
          bgcolor: 'background.paper',
          borderRight: 1,
          borderColor: 'divider',
        },
        ...sxComoLista(sx),
      ]}
    >
      <Box sx={{ display: 'grid', placeItems: 'center', flex: 'none', height: (th) => th.densidad.cabeceraEmbebida, borderBottom: 1, borderColor: 'divider' }}>
        <RouterLink to={`${rutaBase}/inicio`} style={{ display: 'inline-flex' }}>
          <Logo tamano={17} titulo={t('app.nombre')} />
        </RouterLink>
      </Box>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          px: 0.75,
          py: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 0.75,
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          scrollbarWidth: 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        }}
      >
        {pestanas.map((p) => (
          <Box component="li" key={p.clave}>
            <ElementoRiel
              clave={p.clave}
              texto={nombreDe(p.clave)}
              icono={ICONO_SECCION[p.clave]}
              destino={`${rutaBase}/${p.ruta}`}
              activo={activa === p.clave}
              conteo={p.conteo}
            />
          </Box>
        ))}
      </Box>
      {configuracion && (
        <Box sx={{ flex: 'none', px: 0.75, py: 1, borderTop: 1, borderColor: 'divider' }}>
          <ElementoRiel clave="configuracion" texto={t('nav.configuracion')} icono={Settings} destino={configuracion.destino} activo={configuracion.activo} />
        </Box>
      )}
    </Box>
  );
}
