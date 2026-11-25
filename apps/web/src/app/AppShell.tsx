import { Box, GlobalStyles, IconButton, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import { SCOPES } from '@validalo/api-client';
import { Logo, SelectorEmpresa, VARIABLE_TOPE, visualmenteOculto } from '@validalo/ui';
import { Link2, Menu as IconoMenu, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet, useLocation, useNavigate } from 'react-router';
import { aOpcion, useEmpresaActiva, type ContextoEmpresa } from '../features/empresas/useEmpresas';
import { AvisoDePasskey } from '../features/cuenta/AvisoDePasskey';
import { MenuDeCuenta } from '../features/cuenta/MenuDeCuenta';
import { Campana } from '../features/notificaciones/Campana';
import { useConteoExcepciones } from '../features/revisionAutomatica/api';
import { textoDeConteo } from '../features/revisionAutomatica/modelo';
import { useAlturaFija } from '../sesion/alturaFija';
import { CajonNavegacion } from './CajonNavegacion';
import type { Pestana } from './navegacion';
import { RielNavegacion } from './RielNavegacion';
import { ANCHO_LIMITADO, RELLENO_CONTENIDO, rellenoAlineadoAlMarco } from './rellenoContenido';
import { useSesion } from '../sesion/sesionStore';
import { useYo } from '../sesion/useYo';
import { usePreferencias } from '../shared/preferencias';
import { usePermisos } from '../shared/usePermisos';
import { SECCIONES_CONFIGURACION } from './secciones';

/**
 * AppShell de la web de empresa: a la izquierda, el riel fijo con las secciones (ícono + rótulo) y Configuración abajo;
 * a la derecha, una barra de 48 px con la empresa activa, la sesión, la campana, la cuenta y el tema, y debajo el contenido
 * (donde cada sección abre su propia barra lateral, si la tiene). En el celular (por debajo de `sm`) no hay riel: la barra lleva el botón de menú
 * y el logo, y un cajón con la empresa activa, las secciones en filas, Configuración y el tema.
 */
export function AppShell() {
  const { t } = useTranslation();
  const contexto = useEmpresaActiva();
  const { empresa, empresas } = contexto;
  const permisos = usePermisos(empresa.id);
  const sistema = useSesion((s) => s.sesion?.sistema);
  // Quién soy (`GET /yo`, RQ-9): el nombre de la persona junto al sistema desde el que entró.
  const yo = useYo();
  const persona = yo.data?.usuario?.nombre ?? null;
  const { modo, temaDelContenedor, fijarModo } = usePreferencias();
  const navegar = useNavigate();
  const { pathname } = useLocation();
  // Embebida en una página de edición: alto fijo y `main` con scroll propio, para que el encabezado de la página se
  // pegue arriba de él (ver `sesion/alturaFija.ts`). Si no, desplaza la ventana y se pega bajo esta barra.
  const alturaFija = useAlturaFija((s) => s.altura);
  const [cajonAbierto, setCajonAbierto] = useState(false);
  const temaMui = useTheme();
  // Al ensanchar la ventana hasta donde aparece el riel, el cajón (y su bloqueo de la página) no debe quedar abierto.
  const conRiel = useMediaQuery(temaMui.breakpoints.up('sm'));
  useEffect(() => {
    if (conRiel) setCajonAbierto(false);
  }, [conRiel]);

  // Cuántas excepciones de la revisión automática esperan a una persona: el contador de su pestaña.
  const excepciones = useConteoExcepciones(empresa.id, permisos.puede(SCOPES.expedientesLeer));
  const configuracion = SECCIONES_CONFIGURACION.filter((s) => permisos.puede(s.scope));
  const pestanas: Pestana[] = [];
  if (permisos.puede(SCOPES.expedientesLeer)) {
    pestanas.push({ clave: 'inicio', ruta: 'inicio', prefijos: ['inicio'] });
    pestanas.push({ clave: 'bandeja', ruta: 'bandeja', prefijos: ['bandeja', 'expedientes'] });
    pestanas.push({ clave: 'excepciones', ruta: 'excepciones', prefijos: ['excepciones'], conteo: excepciones ? textoDeConteo(excepciones) : undefined });
    pestanas.push({ clave: 'revalidaciones', ruta: 'revalidaciones', prefijos: ['revalidaciones'] });
  }
  if (permisos.puede(SCOPES.documentosLeer)) pestanas.push({ clave: 'vencimientos', ruta: 'vencimientos', prefijos: ['vencimientos'] });
  // La pantalla del oficial: quien consulta listas o decide como Cumplimiento (H7).
  if (permisos.puede(SCOPES.cumplimientoDecidir) || permisos.puede(SCOPES.verificacionesEscribir)) {
    pestanas.push({ clave: 'cumplimiento', ruta: 'cumplimiento', prefijos: ['cumplimiento'] });
  }
  // Evaluaciones de proveedores (CE-3): las que debe responder el evaluador interno y las que ya se calificaron.
  if (permisos.puede(SCOPES.evaluacionesLeer)) pestanas.push({ clave: 'evaluaciones', ruta: 'evaluaciones', prefijos: ['evaluaciones'] });
  if (permisos.puede(SCOPES.certificadosLeer)) pestanas.push({ clave: 'certificados', ruta: 'certificados', prefijos: ['certificados'] });
  if (permisos.puede(SCOPES.vinculosLeer)) pestanas.push({ clave: 'vinculos', ruta: 'vinculos', prefijos: ['vinculos', 'terceros', 'invitaciones'] });
  if (permisos.puede(SCOPES.expedientesLeer) || permisos.puede(SCOPES.vinculosLeer))
    pestanas.push({ clave: 'informes', ruta: permisos.puede(SCOPES.expedientesLeer) ? 'informes/estado-expedientes' : 'informes/vinculos', prefijos: ['informes'] });
  if (permisos.puede(SCOPES.auditoriaLeer)) pestanas.push({ clave: 'auditoria', ruta: 'auditoria', prefijos: ['auditoria'] });
  // Configuración no es una pestaña: es el engranaje de la derecha, activo en cualquiera de sus secciones.
  const primeraConfiguracion = configuracion[0];

  const relativa = pathname.slice(`/e/${empresa.id}/`.length);
  const enRuta = (prefijo: string) => relativa === prefijo || relativa.startsWith(`${prefijo}/`);
  const activa = pestanas.find((p) => p.prefijos.some(enRuta));
  const enConfiguracion = SECCIONES_CONFIGURACION.some((s) => enRuta(s.ruta));
  // Al cambiar de empresa se conserva la sección, no el recurso (el expediente o flujo es de la otra empresa).
  const primerSegmento = relativa.split('/')[0] ?? '';
  // La ficha del tercero cuelga de Vínculos (no hay lista de terceros).
  const seccionActual =
    primerSegmento === 'expedientes' ? 'bandeja' : primerSegmento === 'terceros' ? 'vinculos' : primerSegmento === 'invitaciones' ? (enRuta('invitaciones/por-aprobar') ? 'invitaciones/por-aprobar' : 'invitaciones/lotes') : primerSegmento || 'vinculos';

  // Las secciones, sus permisos y su estado: una sola fuente para el riel de escritorio y el cajón del celular.
  const propsNavegacion = {
    pestanas,
    rutaBase: `/e/${empresa.id}`,
    activa: activa?.clave ?? null,
    nombreDe: (clave: Pestana['clave']) => t(`nav.${clave}`),
    configuracion: primeraConfiguracion ? { destino: `/e/${empresa.id}/${primeraConfiguracion.ruta}`, activo: enConfiguracion } : undefined,
  };

  // La empresa activa: en la barra (escritorio) o a todo el ancho en el cajón (celular); al cambiarla se cierra el cajón.
  const selectorEmpresa = (completo: boolean) => (
    <SelectorEmpresa
      etiqueta={t('empresas.etiqueta')}
      empresas={empresas.map(aOpcion)}
      actual={empresa.id}
      completo={completo}
      onCambiar={(id) => {
        setCajonAbierto(false);
        void navegar(`/e/${id}/${seccionActual}`);
      }}
    />
  );

  return (
    <Box sx={{ display: 'flex', bgcolor: 'background.default', ...(alturaFija === null ? { minHeight: '100vh' } : { height: alturaFija, overflow: 'hidden' }) }}>
      {/* El canal reservado para la barra de scroll (`scrollbar-gutter: stable` del tema) pinta el fondo del lienzo: arriba,
          a la altura de la barra superior, va del color de la barra y con su borde, para que esta parezca llegar hasta el borde. */}
      {alturaFija === null && (
        <GlobalStyles
          styles={(th) => ({
            html: {
              background: `linear-gradient(${th.palette.background.paper} 0 ${String(th.densidad.cabeceraEmbebida - 1)}px, ${th.palette.divider} ${String(th.densidad.cabeceraEmbebida - 1)}px ${String(th.densidad.cabeceraEmbebida)}px, ${th.palette.background.default} ${String(th.densidad.cabeceraEmbebida)}px) fixed`,
            },
          })}
        />
      )}
      {/* El riel queda fijo mientras el contenido desplaza la ventana (o, con alto fijo, ocupa todo el alto). */}
      <RielNavegacion
        {...propsNavegacion}
        sx={{ display: { xs: 'none', sm: 'flex' }, position: 'sticky', top: 0, alignSelf: 'flex-start', height: alturaFija === null ? '100dvh' : '100%', zIndex: (th) => th.zIndex.appBar + 1 }}
      />
      <CajonNavegacion
        {...propsNavegacion}
        abierto={cajonAbierto}
        onCerrar={() => setCajonAbierto(false)}
        empresa={selectorEmpresa(true)}
        tema={temaDelContenedor ? undefined : { oscuro: modo === 'dark', onAlternar: () => fijarModo(modo === 'dark' ? 'light' : 'dark') }}
      />
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minWidth: 0,
        ...(alturaFija !== null && { height: '100%', overflow: 'hidden' }),
        // Con scroll de ventana, bajo esta barra; con scroll propio de `main`, el sticky se mide desde el borde del
        // contenido, así que se resta el relleno de `main` (`RELLENO_CONTENIDO`) para que la franja quede pegada a la barra.
        [VARIABLE_TOPE]: (t) => (alturaFija === null ? `${String(t.densidad.cabeceraEmbebida)}px` : `-${t.spacing(RELLENO_CONTENIDO.y)}`),
      }}
    >
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: (t) => t.zIndex.appBar,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          height: (t) => t.densidad.cabeceraEmbebida,
          // La barra va a todo el ancho (fondo y borde), pero su contenido se alinea con el marco limitado en pantallas muy anchas.
          // Mismo relleno que `main`: la empresa queda alineada con el borde izquierdo de las barras laterales y del contenido.
          pl: (th) => rellenoAlineadoAlMarco(Number.parseFloat(th.spacing(RELLENO_CONTENIDO.x))),
          pr: rellenoAlineadoAlMarco(12),
          borderBottom: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          minWidth: 0,
        }}
      >
        <IconButton
          aria-label={t('nav.abrirMenu')}
          aria-haspopup="dialog"
          aria-expanded={cajonAbierto}
          onClick={() => setCajonAbierto(true)}
          // Alto táctil (44 px): el botón sobresale del relleno de la barra, el ícono queda alineado con el borde del contenido.
          sx={{ display: { sm: 'none' }, flex: 'none', ml: -1.5, width: (th) => th.densidad.objetivoTactil, height: (th) => th.densidad.objetivoTactil }}
        >
          <IconoMenu size={20} strokeWidth={1.75} />
        </IconButton>
        <Box component={RouterLink} to={`/e/${empresa.id}/inicio`} sx={{ display: { xs: 'inline-flex', sm: 'none' }, flex: 'none' }}>
          <Logo tamano={17} titulo={t('app.nombre')} />
        </Box>
        {/* En el celular la empresa va en el cajón: la barra queda con el menú, el logo, la campana y la cuenta. */}
        <Box sx={{ display: { xs: 'none', sm: 'contents' } }}>{selectorEmpresa(false)}</Box>
        <Box sx={{ flex: 1, minWidth: 0 }} />
        {sistema && (
          // El texto completo solo cabe en pantallas anchas: en las demás queda el ícono con el texto en un tooltip (y
          // oculto solo a la vista, para los lectores de pantalla), así caben más pestañas antes de pasar a «Más».
          <Tooltip title={persona ? t('app.sesionDePersona', { persona, sistema }) : t('app.sesionDe', { sistema })}>
            <Typography variant="caption"
              component="span"
              sx={{ color: 'text.secondary', display: { xs: 'none', md: 'inline-flex' }, flex: 'none', alignItems: 'center', gap: 0.5, whiteSpace: 'nowrap' }}
            >
              <Link2 size={14} strokeWidth={1.75} aria-hidden />
              <Box component="span" sx={{ display: 'inline', '@media (max-width: 1535.95px)': visualmenteOculto }}>
                {persona ? t('app.sesionDePersona', { persona, sistema }) : t('app.sesionDe', { sistema })}
              </Box>
            </Typography>
          </Tooltip>
        )}
        <Campana empresaId={empresa.id} />
        <MenuDeCuenta rutaMiCuenta={`/e/${empresa.id}/mi-cuenta`} />
        {!temaDelContenedor && (
          <Tooltip title={modo === 'dark' ? t('app.tema.claro') : t('app.tema.oscuro')}>
            <IconButton
              aria-label={modo === 'dark' ? t('app.tema.claro') : t('app.tema.oscuro')}
              onClick={() => fijarModo(modo === 'dark' ? 'light' : 'dark')}
              sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {modo === 'dark' ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <AvisoDePasskey rutaMiCuenta={`/e/${empresa.id}/mi-cuenta`} />
      <Box component="main" sx={{ flex: 1, py: RELLENO_CONTENIDO.y, px: RELLENO_CONTENIDO.x, minWidth: 0, ...(alturaFija !== null && { minHeight: 0, overflowY: 'auto', scrollbarGutter: 'stable' }) }}>
        <Box sx={ANCHO_LIMITADO}>
          <Outlet context={contexto satisfies ContextoEmpresa} />
        </Box>
      </Box>
    </Box>
    </Box>
  );
}
