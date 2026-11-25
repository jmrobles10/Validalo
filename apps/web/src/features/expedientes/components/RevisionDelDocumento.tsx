import { Stack } from '@mui/material';
import type { HechosDto, SoporteDeSeccionesDto, VersionRequisitoDto } from '@validalo/api-client';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { estadoRevision } from '../../documentos/revisionIa';
import { RevisionAutomatica, type TipoEsperado } from '../../documentos/RevisionAutomatica';
import { LineaDeAntiguedad } from './LineaDeAntiguedad';
import { PieDelRequisito } from './PieDelRequisito';
import { SoporteDeSecciones } from './SoporteDeSecciones';

export interface RevisionDelDocumentoProps {
  /** Hechos de la versión con archivo (la revisión automática); una versión de solo formulario no los pasa. */
  hechos?: HechosDto | null;
  tipoEsperado?: TipoEsperado | null;
  soporte?: SoporteDeSeccionesDto | null;
  /** La antigüedad del documento frente al máximo de su tipo (`versionActual.antiguedad`); sin regla de antigüedad, nada. */
  antiguedad?: VersionRequisitoDto['antiguedad'];
  /** El cruce con lo que respalda no tiene con qué compararse. */
  sinCruce: boolean;
  /** La tarjeta de la cuenta designada ya trae el cruce de la certificación: aquí queda solo su línea de resumen. */
  cuentasEnSuTarjeta?: boolean;
  /** La conclusión de la IA (`ConclusionDeLaIa`): abre el contenido del bloque, antes de sus razones. Con ella, lo que leyó la IA queda plegado como detalle. */
  conclusion?: ReactNode;
  /** El umbral de confianza de la conclusión (`conclusionDeRevision.umbral`): el color de la confianza del encabezado usa el mismo. */
  umbral?: number;
}

/**
 * Todo lo que la máquina dice de un documento exigido, en un bloque propio neutro (gris suave del tema con un borde fino: el color es solo de la conclusión de la IA y de lo que difiere). Con la lectura de la IA:
 * un encabezado («Revisión automática» y, a la derecha, cuándo se leyó, con qué modelo y con qué confianza), un divisor y, primero, la conclusión de la IA (aprobar, revisar o sin
 * análisis), luego el resumen del cruce con lo que respalda (lo importante) y la antigüedad del documento, y por último lo que leyó la IA, plegado si hay conclusión o un cruce que ya
 * cuenta lo importante. Sin lectura, solo la conclusión («sin análisis») y ese resumen. Sin nada de eso, no se pinta. La antigüedad también es una fila más de la tabla de comparación
 * cuando esa tabla se muestra.
 */
export function RevisionDelDocumento({ hechos, tipoEsperado, soporte, antiguedad, sinCruce, cuentasEnSuTarjeta = false, conclusion = null, umbral }: RevisionDelDocumentoProps) {
  const { t } = useTranslation();
  const hayCruce = soporte?.secciones.some((s) => s.cruce !== null) ?? false;
  const resumen = (
    <>
      {soporte && <SoporteDeSecciones soporte={soporte} compacto cuentasEnSuTarjeta={cuentasEnSuTarjeta} campoExtra={antiguedad?.campo ?? null} />}
      <LineaDeAntiguedad antiguedad={antiguedad} />
    </>
  );
  // Lo que respalda el documento y la nota de que no hay con qué cruzarlo: en la zona de detalles del pie, en gris.
  const pie = <PieDelRequisito soporte={soporte} sinCruce={sinCruce} cuentasEnSuTarjeta={cuentasEnSuTarjeta} />;
  return (
    <Stack
      role="group"
      aria-label={t('expedientes.requisitos.lecturaDelDocumento')}
      spacing={1}
      sx={{ px: 2, py: 1.5, bgcolor: 'superficie.nivel2', border: 1, borderColor: 'borde.sutil', borderRadius: (th) => `${String(th.radio.md)}px`, '&:empty': { display: 'none' } }}
    >
      {estadoRevision(hechos) === 'conIa' ? (
        <RevisionAutomatica hechos={hechos} tipoEsperado={tipoEsperado} limite={6} enBloque plegarCampos={hayCruce || conclusion !== null} resumen={resumen} conclusion={conclusion} pie={pie} umbral={umbral} />
      ) : (
        <>
          {conclusion}
          {resumen}
          {pie}
        </>
      )}
    </Stack>
  );
}
