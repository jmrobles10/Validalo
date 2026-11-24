import { BottomNavigation, BottomNavigationAction, Box, ButtonBase, Stack, Typography, type Theme } from '@mui/material';
import { BarraSuperior, Logo } from '@validalo/ui';
import { Building2, FolderCheck, IdCard, Landmark, LogOut, ShieldCheck, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Outlet, Link as RouterLink, useLocation } from 'react-router';
import { AvisoDeAccesoAislado, AvisoDeAccesosPorAprobar } from '../accesos/AvisosDeAcceso';
import { AnfitrionDeSubida } from '../boveda/AnfitrionDeSubida';
import { AvisoDePropuestasDePersonas } from '../personas/AvisoDePropuestas';
import { Campana } from '../notificaciones/Campana';
import { MODO_EMBEBIDO } from '../embebido/modo';
import { usePuenteEmbebido } from '../embebido/usePuenteEmbebido';
import { useSesionTercero } from '../sesion/sesionTercero';
import { PanelDelTercero } from '../shared/componentes';
import { ANCHO_PANEL, esSeccionDeFicha } from './anchos';

const SECCIONES = [
  { ruta: '/boveda', clave: 'nav.boveda', icono: FolderCheck },
  { ruta: '/empresas', clave: 'nav.empresas', icono: Building2 },
  { ruta: '/ficha', clave: 'nav.ficha', icono: IdCard },
  { ruta: '/cuentas', clave: 'nav.cuentas', icono: Landmark },
  { ruta: '/privacidad', clave: 'nav.privacidad', icono: ShieldCheck },
] as const;

/**
 * Cada acción de la barra inferior reparte el ancho según su rótulo (no por partes iguales) y el rótulo nunca baja de línea:
 * «Mi información» y «Mis empresas» no caben en 78 px (390 px entre cinco) con el tamaño por omisión de MUI (12 px, 14 px la
 * activa). El tamaño es el mismo activa o no (así el ancho no salta) y se achica con la pantalla hasta un mínimo legible.
 */
const TAMANO_ROTULO_INFERIOR = 'clamp(10px, 2.8vw, 12px)';
const ACCION_INFERIOR = {
  minWidth: 0,
  maxWidth: 'none',
  flex: '1 1 auto',
  px: 0.25,
  '& .MuiBottomNavigationAction-label, & .MuiBottomNavigationAction-label.Mui-selected': {
    fontSize: TAMANO_ROTULO_INFERIOR,
    lineHeight: '14px',
    whiteSpace: 'nowrap',
  },
} as const;

/** Sección de la barra superior: píldora con el ícono (desde lg) y el texto; la activa es blanca con sombra suave, las demás van en gris sobre el lienzo. */
function PildoraDeSeccion({ ruta, icono: Icono, activa, children }: { ruta: string; icono: LucideIcon; activa: boolean; children: string }) {
  return (
    <ButtonBase
      component={RouterLink}
      to={ruta}
      aria-current={activa ? 'page' : undefined}
      sx={(t: Theme) => ({
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        height: 36,
        px: 1.5,
        borderRadius: '10px',
        typography: activa ? 'subtitle2' : 'body2',
        whiteSpace: 'nowrap',
        color: activa ? 'text.primary' : 'text.secondary',
        bgcolor: activa ? t.palette.background.paper : 'transparent',
        boxShadow: activa ? t.sombra.pildora : 'none',
        '&:hover': { bgcolor: activa ? t.palette.background.paper : t.palette.superficie.nivel2, color: 'text.primary' },
      })}
    >
      <Box aria-hidden sx={{ display: { xs: 'none', lg: 'inline-flex' } }}>
        <Icono size={18} strokeWidth={1.5} />
      </Box>
      {children}
    </ButtonBase>
  );
}

/** Acción de la barra (`Salir`): el mismo estilo que una sección inactiva, sin caja propia. */
function AccionDeBarra({ icono: Icono, etiqueta, onClick }: { icono: LucideIcon; etiqueta: string; onClick: () => void }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={etiqueta}
      sx={(t: Theme) => ({
        typography: 'body2',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 1,
        flex: 'none',
        height: 36,
        px: 1.5,
        borderRadius: '10px',
        color: 'text.secondary',
        '&:hover': { bgcolor: t.palette.superficie.nivel2, color: 'text.primary' },
      })}
    >
      <Icono size={18} strokeWidth={1.5} aria-hidden />
      <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
        {etiqueta}
      </Box>
    </ButtonBase>
  );
}

/**
 * Shell del tercero, móvil primero (design system «Registro»): sobre el lienzo gris, la barra superior sin fondo propio (el logotipo, las
 * secciones como píldoras, la campana y «Salir»), el contenido en un panel blanco flotante (una sección de Mi información trae sus propios
 * paneles), el pie «con Valídalo» y, con sesión, la navegación inferior en el celular.
 */
export function Shell() {
  // Dentro del iframe de un sistema integrador: sin cabecera, navegación ni pie (el sistema pone su propio marco) y con el puente de mensajes.
  usePuenteEmbebido();
  return (
    <>
      {MODO_EMBEBIDO ? <ShellEmbebido /> : <ShellNormal />}
      {/* El diálogo de subida es de toda la app: lo abren los botones «Subir…» de las pantallas y no depende de la fila que lo abrió. */}
      <AnfitrionDeSubida />
    </>
  );
}

/** El contenido solo, a todo el ancho del iframe y sin saltos laterales. */
function ShellEmbebido() {
  return (
    <Box component="main" sx={{ bgcolor: 'background.default', px: { xs: 1.5, sm: 2 }, py: { xs: 1.5, sm: 2 }, maxWidth: ANCHO_PANEL, mx: 'auto' }}>
      <AvisoDeAccesoAislado />
      <Outlet />
    </Box>
  );
}

function ShellNormal() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // El enlace del correo (`/e/:token`) es una entrada: mientras se canjea y se pide el código la persona todavía no entró, aunque el navegador conserve la
  // sesión anterior (la cookie renueva sola la de otra visita, y el enlace puede ser de otro tercero). Sin esto el encabezado mostraba las secciones, la
  // campana y «Salir» de esa sesión vieja junto a «Escribe el código», y la campana y los avisos consultaban la API antes de verificar nada.
  const enEnlace = /^\/e\/[^/]+/.test(pathname);
  const sesionActiva = useSesionTercero((s) => s.estado === 'activa');
  const activa = sesionActiva && !enEnlace;
  // Con acceso aislado solo existe lo de la relación con la empresa: la bóveda, la información, las cuentas y la privacidad son del tercero entero.
  const aislada = useSesionTercero((s) => s.sesion?.aislada === true);
  const salir = useSesionTercero((s) => s.salir);
  const secciones = aislada ? SECCIONES.filter((s) => s.ruta === '/empresas') : SECCIONES;
  const actual = secciones.find((s) => pathname.startsWith(s.ruta))?.ruta ?? (pathname.startsWith('/expediente') ? '/empresas' : false);
  // La verificación del certificado es pública: quien escanea el QR no es el tercero.
  const verificando = pathname.startsWith('/verificar/');
  // Un solo ancho para barra y panel en todas las páginas (ver `anchos.ts`): al navegar nada se mueve. Una sección de Mi información lleva
  // a la izquierda su propio panel de secciones.
  const anchoMaximo = ANCHO_PANEL;
  const conPaneles = esSeccionDeFicha(pathname);

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      {/* Fija y sin fondo propio (el del lienzo): al desplazarse, el tercero sigue viendo dónde está. Las secciones son píldoras: la activa, blanca con sombra. */}
      <BarraSuperior sx={{ position: 'sticky', top: 0, zIndex: 20, bgcolor: 'background.default', px: { xs: 1, md: 2.5 } }}>
        <Stack direction="row" spacing={{ xs: 1, md: 2 }} sx={{ alignItems: 'center', width: '100%', maxWidth: anchoMaximo, mx: 'auto', minWidth: 0 }}>
          <Logo tamano={22} titulo={t('comun.marca')} />
          {/* Con sesión las secciones de la barra ya dicen dónde está la persona: el rótulo solo acompaña al logotipo en las pantallas de entrada y verificación. */}
          {!activa && (
            <Typography noWrap sx={{ color: 'text.secondary', borderLeft: 1, borderColor: 'divider', pl: 1.5, minWidth: 0 }}>
              {verificando ? t('verificacion.marca') : t('comun.misDocumentos')}
            </Typography>
          )}
          {activa && (
            <Stack component="nav" aria-label={t('nav.secciones')} direction="row" spacing={0.5} sx={{ display: { xs: 'none', md: 'flex' }, ml: 1.5 }}>
              {secciones.map((s) => (
                <PildoraDeSeccion key={s.ruta} ruta={s.ruta} icono={s.icono} activa={actual === s.ruta}>
                  {t(s.clave)}
                </PildoraDeSeccion>
              ))}
            </Stack>
          )}
          <Box sx={{ flex: 1 }} />
          {activa && <Campana />}
          {activa && <AccionDeBarra icono={LogOut} etiqueta={t('nav.salir')} onClick={() => void salir()} />}
        </Stack>
      </BarraSuperior>

      <Box component="main" sx={{ flex: 1, width: '100%', px: { xs: 1, md: 2.5 }, pb: activa ? { xs: 12, md: 3 } : 3 }}>
        {conPaneles ? (
          // Una sección de Mi información: la página pone su panel de secciones y el del formulario, separados sobre el lienzo (los avisos van arriba).
          <Box sx={{ maxWidth: anchoMaximo, mx: 'auto' }}>
            {activa && <AvisoDeAccesoAislado />}
            {activa && <AvisoDeAccesosPorAprobar />}
            {activa && <AvisoDePropuestasDePersonas />}
            <Outlet />
          </Box>
        ) : (
          <PanelDelTercero sx={{ maxWidth: anchoMaximo, mx: 'auto' }}>
            {activa && <AvisoDeAccesoAislado />}
            {activa && <AvisoDeAccesosPorAprobar />}
            {activa && <AvisoDePropuestasDePersonas />}
            <Outlet />
          </PanelDelTercero>
        )}
      </Box>

      <Box component="footer" sx={{ display: activa ? { xs: 'none', md: 'block' } : 'block' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 0.5, sm: 1 }} sx={{ typography: 'body2', alignItems: 'center', justifyContent: 'center', py: 2, px: 2, color: 'text.secondary', textAlign: 'center' }}>
          <span>{t('comun.pie')}</span>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
            <Logo variante="icono" tamano={14} decorativo />
            {t('comun.conValidalo')}
          </Box>
        </Stack>
      </Box>

      {activa && (
        <Box
          component="nav"
          aria-label={t('nav.secciones')}
          sx={{ display: { xs: 'block', md: 'none' }, position: 'fixed', insetInline: 0, bottom: 0, borderTop: 1, borderColor: 'divider', zIndex: 10, pb: 'env(safe-area-inset-bottom)', bgcolor: 'superficie.panel' }}
        >
          <BottomNavigation showLabels value={actual} sx={{ height: 64, bgcolor: 'transparent' }}>
            {secciones.map((s) => (
              <BottomNavigationAction
                key={s.ruta}
                component={RouterLink}
                to={s.ruta}
                value={s.ruta}
                label={t(s.clave)}
                icon={<s.icono size={22} strokeWidth={1.5} aria-hidden />}
                aria-current={actual === s.ruta ? 'page' : undefined}
                sx={ACCION_INFERIOR}
              />
            ))}
          </BottomNavigation>
        </Box>
      )}
    </Box>
  );
}
