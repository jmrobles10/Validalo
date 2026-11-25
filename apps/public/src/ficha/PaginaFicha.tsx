import { Alert, AlertTitle, Box, Button, Chip, LinearProgress, Stack, Typography } from '@mui/material';
import type { EstadoSeccionFichaDto } from '@validalo/api-client';
import { AnimacionExitoUnaVez, formatearFecha } from '@validalo/ui';
import { ArrowRight, CheckCircle2, ChevronRight, CircleAlert, Circle, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { CabeceraPagina, ErrorRecuperable, EsqueletoTarjetas } from '../shared/componentes';
import { useEstadoFicha } from './api';
import { ConfirmarRatificacion } from '../expediente/ConfirmarRatificacion';
import { PropuestasEnResumen } from './PropuestasEnResumen';
import { enlaceSeccion, estadoDeSeccion, filasDelResumen, periodoPorOmision } from './secciones';
import { deLaSeccion, useRatificacionesPendientes, type RatificacionPendiente } from './useRatificacionesPendientes';

/**
 * Mi información (docs/14 §4.1): las secciones en el orden de la API con el estado que calculó el servidor (completa,
 * con sus faltantes o sin diligenciar) y «Continuar», que lleva a la siguiente sección incompleta (`siguienteSeccion`).
 */
export function PaginaFicha() {
  const { t } = useTranslation();
  const consulta = useEstadoFicha();
  const ratificaciones = useRatificacionesPendientes();

  if (consulta.isPending) {
    return (
      <>
        <CabeceraPagina titulo={t('ficha.titulo')} sub={t('ficha.sub')} />
        <EsqueletoTarjetas cantidad={3} />
      </>
    );
  }
  if (consulta.isError) {
    return (
      <>
        <CabeceraPagina titulo={t('ficha.titulo')} sub={t('ficha.sub')} />
        <ErrorRecuperable error={consulta.error} onReintentar={() => void consulta.refetch()} />
      </>
    );
  }

  const estado = consulta.data;
  const filas = filasDelResumen(estado);
  const completas = filas.filter((f) => estadoDeSeccion(f) === 'completa').length;
  const siguiente = estado.siguienteSeccion;
  const continuar = siguiente && (
    <Button
      component={RouterLink}
      to={enlaceSeccion(siguiente, siguiente === 'FICHA_FINANCIERA' ? periodoPorOmision(estado) : null)}
      variant="contained"
      endIcon={<ArrowRight size={18} aria-hidden />}
      sx={{ width: { xs: '100%', sm: 'auto' } }}
    >
      {t('ficha.continuar')}
    </Button>
  );

  return (
    <>
      <CabeceraPagina titulo={t('ficha.titulo')} sub={t('ficha.sub')} accion={continuar} />
      {estado.completa && (
        // La primera vez que la persona ve su información completa en la sesión, el ícono hace la animación de éxito de marca.
        <Alert severity="success" icon={<AnimacionExitoUnaVez clave="ficha-completa" tamano={20} decorativa />} sx={{ mb: 2, alignItems: 'center' }}>
          <AlertTitle sx={{ display: 'inline', mr: 0.75 }}>{t('ficha.completaTitulo')}</AlertTitle>
          {t('ficha.completaTexto')}
        </Alert>
      )}
      <PropuestasEnResumen />
      <AvisoDeRatificaciones pendientes={ratificaciones} />
      {/* La lista, en un solo nivel: el avance en una línea con su barra delgada y cada sección como una fila con divisores finos. */}
      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography component="h2" variant="h6">
          {t('ficha.secciones')}
        </Typography>
        <Typography sx={{ color: 'text.secondary' }}>{t('ficha.avance', { completas: String(completas), total: String(filas.length) })}</Typography>
      </Stack>
      <LinearProgress variant="determinate" value={filas.length > 0 ? (completas / filas.length) * 100 : 0} aria-label={t('ficha.avance', { completas: String(completas), total: String(filas.length) })} sx={{ height: 3 }} />
      <Box component="ol" aria-label={t('ficha.titulo')} sx={{ p: 0, m: 0, listStyle: 'none' }}>
        {filas.map((fila) => (
          <FilaSeccion key={`${fila.seccion}-${String(fila.periodo)}`} fila={fila} porRatificar={deLaSeccion(ratificaciones, fila.seccion, fila.periodo ?? null)} />
        ))}
      </Box>
      {/* Los representantes, socios y beneficiarios finales son personas con su propia bóveda (ADR-0010): su cédula y antecedentes se suben ahí. */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.5}
        sx={(th) => ({ mt: 2, px: { xs: 1.5, sm: 2.5 }, py: 1.5, alignItems: { sm: 'center' }, borderRadius: `${String(th.radio.md)}px`, bgcolor: th.palette.superficie.nivel2 })}
      >
        <Box sx={{ flex: 1 }}>
          <Typography component="h2" variant="h6">
            {t('personas.enlaceDesdeFicha')}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>{t('personas.enlaceDesdeFichaTexto')}</Typography>
        </Box>
        <Button component={RouterLink} to="/personas" variant="outlined" endIcon={<ChevronRight size={18} aria-hidden />}>
          {t('personas.enlaceDesdeFicha')}
        </Button>
      </Stack>
    </>
  );
}

/**
 * Renovación periódica del vínculo (VV-3): las empresas que le piden al tercero confirmar su información. Cada sección se ratifica
 * (sigue igual) o se actualiza desde su fila.
 */
function AvisoDeRatificaciones({ pendientes }: { pendientes: readonly RatificacionPendiente[] }) {
  const { t } = useTranslation();
  const empresas = [...new Set(pendientes.map((p) => p.empresa))];
  if (empresas.length === 0) return null;
  return (
    <Alert severity="info" sx={{ mb: 2 }}>
      <AlertTitle>{t('expediente.ratificar.seccion.bannerTitulo', { count: empresas.length })}</AlertTitle>
      {t('expediente.ratificar.seccion.bannerTexto', { empresas: empresas.join(', ') })}
    </Alert>
  );
}

/**
 * Una sección del resumen como **una fila** alineada en columnas: estado (ícono), nombre, el chip de estado con «Actualizada el …» y el
 * botón para abrirla; debajo, si hace falta, el soporte que retiró o lo que alguna empresa pide ratificar. En el celular se apila.
 */
function FilaSeccion({ fila, porRatificar }: { fila: EstadoSeccionFichaDto; porRatificar: readonly RatificacionPendiente[] }) {
  const { t } = useTranslation();
  const estado = estadoDeSeccion(fila);
  const nombre = fila.periodo ? t('ficha.nombreConPeriodo', { nombre: fila.nombre, periodo: String(fila.periodo) }) : fila.nombre;
  const chip =
    estado === 'completa' ? (
      <Chip size="small" color="success" variant="outlined" label={t('ficha.estados.completa')} />
    ) : estado === 'incompleta' ? (
      <Chip size="small" color="warning" variant="outlined" label={t('ficha.estados.incompleta', { count: fila.faltantes.length })} />
    ) : (
      <Chip size="small" variant="outlined" label={t('ficha.estados.sin-diligenciar')} />
    );
  const retirados = fila.soportesRetirados ?? [];

  return (
    <Box
      component="li"
      aria-label={nombre}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '20px minmax(0, 1fr) auto', sm: '20px minmax(0, 1.2fr) minmax(0, 1.4fr) auto' },
        columnGap: 1.5,
        rowGap: 0.5,
        alignItems: 'center',
        py: 1,
        minHeight: 52,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box aria-hidden sx={{ display: 'inline-flex', color: estado === 'completa' ? 'success.main' : estado === 'incompleta' ? 'warning.main' : 'text.disabled' }}>
        {estado === 'completa' ? <CheckCircle2 size={20} strokeWidth={1.75} /> : estado === 'incompleta' ? <CircleAlert size={20} strokeWidth={1.75} /> : <Circle size={20} strokeWidth={1.75} />}
      </Box>
      <Typography variant="subtitle1" component="p" sx={{ minWidth: 0 }}>{nombre}</Typography>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gridColumn: { xs: '2 / 3', sm: 'auto' }, gridRow: { xs: 2, sm: 'auto' }, minWidth: 0 }}>
        {chip}
        {fila.actualizada && (
          <Typography component="span" sx={{ color: 'text.secondary' }}>
            {t('ficha.actualizada', { fecha: formatearFecha(fila.actualizada) })}
          </Typography>
        )}
      </Stack>
      <Button
        component={RouterLink}
        to={enlaceSeccion(fila.seccion, fila.periodo)}
        variant="text"
        size="small"
        endIcon={<ChevronRight size={18} aria-hidden />}
        aria-label={t('ficha.abrirSeccion', { seccion: nombre })}
        sx={{ flex: 'none', gridColumn: { xs: 3, sm: 4 }, gridRow: { xs: '1 / span 2', sm: 'auto' } }}
      >
        {estado === 'sin-diligenciar' ? t('ficha.diligenciar') : t('ficha.abrir')}
      </Button>
      {/* El tercero retiró un documento que respaldaba la sección: sus datos siguen guardados; se le dice que elija otro soporte. */}
      {retirados.length > 0 && (
        <Box sx={{ gridColumn: '2 / -1' }}>
          {retirados.map((r) => (
            <Stack key={`${r.documentoId}-${String(r.version)}`} direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'warning.main' }}>
              <TriangleAlert size={16} aria-hidden />
              <Typography component="span" sx={{ color: 'text.primary' }}>
                {t('ficha.soporte.retirado', { tipo: r.nombre ?? r.tipoDocumento ?? '', n: String(r.version) })}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
      {porRatificar.length > 0 && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', gridColumn: '2 / -1' }}>
          {porRatificar.map((p) => (
            <ConfirmarRatificacion
              key={p.requisitoId}
              tipo="seccion"
              compacto
              expedienteId={p.expedienteId}
              requisitoId={p.requisitoId}
              documento={p.nombre}
              empresa={p.empresa}
              etiqueta={t('expediente.ratificar.seccion.paraEmpresa', { empresa: p.empresa })}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
