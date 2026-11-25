import { Box, Stack, Typography } from '@mui/material';
import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, textoDelPorQue } from '@validalo/ui';
import { ClipboardList, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BotonDeAccion } from './BotonDeAccion';
import { ConfirmarRatificacion } from './ConfirmarRatificacion';
import { MarcoDeRequisito } from './MarcoDeRequisito';
import { Observacion } from './Observacion';
import { accionDeRequisito, enlaceDeSeccion, observacionesDeRequisito, tonoDeRequisito } from './requisitos';

/**
 * Una sección de «Mi información» que pide la empresa (F2), con la misma tarjeta que los documentos (`MarcoDeRequisito`): su estado y, si
 * le toca al tercero, lo que le falta para esa empresa (pendiente) o lo que observó con los datos señalados (observada), con el botón que lleva
 * al wizard de la sección. Aquí no se sube nada: la información se diligencia una vez y le llega a cada empresa.
 */
export function TarjetaRequisitoSeccion({ requisito, expediente, conAccion }: { requisito: RequisitoPublicoDto; expediente: ExpedientePublicoDto; conAccion: boolean }) {
  const { t } = useTranslation();
  const empresa = expediente.empresa.nombre;
  const accion = accionDeRequisito(requisito, expediente);
  const version = requisito.versionActual;
  const faltantes = requisito.estado === 'Pendiente' ? (requisito.seccion?.completitud?.faltantes ?? []) : [];
  const observaciones = requisito.estado === 'Observado' ? observacionesDeRequisito(requisito, expediente) : [];
  const boton = conAccion && (accion === 'subir' || accion === 'corregir') ? accion : null;
  // Renovación periódica (VV-3): la sección que la empresa ya aceptó se ratifica (sigue igual) o se actualiza.
  const porRatificar = requisito.puedeRatificar && conAccion;

  return (
    <MarcoDeRequisito
      icono={ClipboardList}
      tono={tonoDeRequisito(requisito)}
      titulo={requisito.tipoDocumento.nombre}
      chip={<ChipEstado estado={requisito.estado} size="medium" />}
      meta={
        requisito.ratificadoEn
          ? t('expediente.seccion.ratificada', { fecha: formatearFecha(requisito.ratificadoEn) })
          : version
            ? t('expediente.seccion.version', { n: String(version.n), fecha: formatearFecha(version.cargadaEn) })
            : t('expediente.seccion.sinVersion')
      }
      cuerpo={
        <>
          {/* Por qué se le pide esta sección: lo que declaró en su ficha y la hizo aplicar (EF-6). */}
          {(requisito.porQue?.length ?? 0) > 0 && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} data-por-que="">
              {t('expediente.documentos.porQue', { empresa, motivos: textoDelPorQue(requisito.porQue ?? []) })}
            </Typography>
          )}
          {faltantes.length > 0 && (
            <Box sx={(th) => ({ py: 1, px: 1.5, borderRadius: `${String(th.radio.sm)}px`, bgcolor: 'superficie.nivel2' })}>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 0.25 }}>
                {t('expediente.seccion.faltanTitulo', { empresa })}
              </Typography>
              <Stack component="ul" spacing={0.5} sx={{ p: 0, m: 0, listStyle: 'none' }}>
                {faltantes.map((f, i) => (
                  <Typography component="li" key={`${f.campo ?? f.regla ?? ''}-${String(i)}`}>
                    {f.mensaje}
                  </Typography>
                ))}
              </Stack>
            </Box>
          )}
          {observaciones.map((o) => (
            <Observacion key={o.fecha} observacion={o} />
          ))}
          {porRatificar && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('expediente.seccion.ratificarAyuda', { empresa })}
            </Typography>
          )}
          {boton && !requisito.puedeRatificar && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('expediente.seccion.ayuda')}
            </Typography>
          )}
        </>
      }
      acciones={
        <>
          {boton && !requisito.puedeRatificar && (
            <BotonDeAccion to={enlaceDeSeccion(requisito)} icono={PencilLine}>
              {boton === 'corregir' ? t('expediente.seccion.corregir') : t('expediente.seccion.completar')}
            </BotonDeAccion>
          )}
          {porRatificar && (
            <>
              {/* Actualizar es la salida si algo cambió; ratificar, la acción que le toca si no cambió. */}
              <BotonDeAccion to={enlaceDeSeccion(requisito)} icono={PencilLine} variant="outlined">
                {t('expediente.seccion.actualizar')}
              </BotonDeAccion>
              <ConfirmarRatificacion
                tipo="seccion"
                compacto
                variante="contained"
                expedienteId={expediente.id}
                requisitoId={requisito.id}
                documento={requisito.tipoDocumento.nombre}
                empresa={empresa}
              />
            </>
          )}
        </>
      }
    />
  );
}
