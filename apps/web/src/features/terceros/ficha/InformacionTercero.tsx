import { Box, Stack, Typography } from '@mui/material';
import type { SeccionFichaDto, VinculoEnFichaDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha } from '@validalo/ui';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../../shared/componentes';
import { SeccionFicha } from '../SeccionesVinculo';
import { AceptacionesSeccion } from './AceptacionesSeccion';
import { DatosDeSeccion } from './DatosDeSeccion';
import { esObjeto } from './formato';
import { soloTienePersonas } from './personas';
import { SoportesDeSeccion } from './SoportesDeSeccion';

interface Props {
  empresaId: string;
  /** El tercero de la ficha: con él se descarga el PDF de la declaración PEP de sus personas. */
  terceroId?: string;
  secciones: readonly SeccionFichaDto[];
  vinculos: readonly VinculoEnFichaDto[];
}

/**
 * «Información del tercero» en Tercero 360 (docs/14 §7): una tarjeta por sección vigente de la ficha maestra con su
 * estado (completa o lo que falta), versión y fecha, lo que la empresa activa tiene aceptado (F2, FM-29), los datos en
 * solo lectura y sus soportes. Sin acciones: la sección se acepta u observa en el expediente.
 */
export function InformacionTercero({ empresaId, terceroId, secciones, vinculos }: Props) {
  const { t } = useTranslation();
  const titulo = t('fichaMaestra.titulo');
  return (
    <Stack component="section" aria-label={titulo} spacing={1.5} sx={{ minWidth: 0 }}>
      <Box>
        <Typography variant="h6" component="h2">
          {titulo}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('fichaMaestra.ayuda')}
        </Typography>
      </Box>
      {secciones.length === 0 ? (
        <Tarjeta>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('fichaMaestra.vacia')}
          </Typography>
        </Tarjeta>
      ) : (
        secciones.map((s) => <TarjetaSeccion key={`${s.seccion}-${String(s.periodo)}`} empresaId={empresaId} terceroId={terceroId} seccion={s} vinculos={vinculos} />)
      )}
    </Stack>
  );
}

/**
 * Una sección de la ficha maestra (también en los sectores de la ficha del vínculo): el encabezado con el título, su completitud como chip y, a la derecha, la versión y
 * su fecha; la validación de la empresa en una franja con el tono de su estado; lo que falta; los datos en el orden del esquema (las personas, una tarjeta cada una) y los soportes.
 */
export function TarjetaSeccion({ empresaId, terceroId, seccion, vinculos }: { empresaId: string; terceroId?: string; seccion: SeccionFichaDto; vinculos: readonly VinculoEnFichaDto[] }) {
  const { t } = useTranslation();
  const nombre = seccion.periodo ? t('fichaMaestra.nombreConPeriodo', { nombre: seccion.nombre, periodo: String(seccion.periodo) }) : seccion.nombre;
  const completitud = seccion.completitud;
  const chip = completitud?.completa ? (
    <ChipEstado estado="Aprobado" etiqueta={t('fichaMaestra.completa')} />
  ) : (
    <ChipEstado estado="ConPendientes" etiqueta={t('fichaMaestra.faltan', { count: completitud?.faltantes.length ?? 0 })} />
  );

  const datos = esObjeto(seccion.datos) ? seccion.datos : {};
  const datosDeLaSeccion = (
    <DatosDeSeccion
      datos={datos}
      empresaId={empresaId}
      terceroId={terceroId}
      seccion={seccion.seccion}
      version={seccion.version}
      faltantes={completitud?.faltantes.map((f) => f.campo)}
    />
  );

  return (
    <Tarjeta
      nivel="h3"
      etiqueta={nombre}
      titulo={
        <Stack direction="row" spacing={1} component="span" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span>{nombre}</span>
          {chip}
        </Stack>
      }
      acciones={
        seccion.version !== null ? (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('fichaMaestra.version', { n: String(seccion.version), fecha: seccion.fecha ? formatearFecha(seccion.fecha) : '—' })}
          </Typography>
        ) : undefined
      }
    >
      <Stack spacing={2}>
        {seccion.aceptaciones && seccion.aceptaciones.length > 0 && (
          <AceptacionesSeccion empresaId={empresaId} codigo={seccion.seccion} periodo={seccion.periodo} seccion={seccion.nombre} aceptaciones={seccion.aceptaciones} vinculos={vinculos} />
        )}
        {completitud && completitud.faltantes.length > 0 && (
          <Box
            component="section"
            aria-label={t('fichaMaestra.faltantes')}
            sx={{ p: 1.5, border: 1, borderColor: 'estado.advertencia.borde', bgcolor: 'estado.advertencia.fondo', borderRadius: (th) => `${String(th.radio.md)}px` }}
          >
            <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', mb: 0.5, color: 'estado.advertencia.texto' }}>
              <TriangleAlert size={16} strokeWidth={1.75} aria-hidden />
              <Typography variant="subtitle2" component="h4">
                {t('fichaMaestra.faltantes')}
              </Typography>
            </Stack>
            <Box component="ul" sx={{ m: 0, pl: 3.5 }}>
              {completitud.faltantes.map((f, i) => (
                <Typography component="li" variant="body2" key={`${f.campo ?? f.regla ?? ''}-${String(i)}`}>
                  {f.mensaje}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
        {/* Si lo guardado son solo personas, «Personas relacionadas» ya es el título: «Datos» sobraría. */}
        {soloTienePersonas(datos) ? (
          datosDeLaSeccion
        ) : (
          <SeccionFicha titulo={t('fichaMaestra.datos')}>{datosDeLaSeccion}</SeccionFicha>
        )}
        <SoportesDeSeccion empresaId={empresaId} soportes={seccion.soportes} vinculos={vinculos} />
      </Stack>
    </Tarjeta>
  );
}
