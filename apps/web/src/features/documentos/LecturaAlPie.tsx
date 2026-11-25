import { Box, Stack, Typography } from '@mui/material';
import type { HechosIaDto } from '@validalo/api-client';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CamposIa } from './CamposIa';
import type { CampoIa } from './revisionIa';

/**
 * Los detalles de la lectura de la IA al pie del bloque «Revisión automática», en una zona secundaria y compacta, en gris: «Legible: Sí · Tipo detectado: Cédula de
 * ciudadanía» en una línea, lo que respalda el documento (`pie`), la nota del análisis, y el enlace «Ver lo que leyó la IA» que despliega los datos extraídos. Lo importante (la
 * conclusión, lo que difiere) va arriba; esto es consulta.
 */
export function LecturaAlPie({
  ia,
  nombreDelTipo,
  campos,
  limite,
  pie,
  recortado,
}: {
  ia: HechosIaDto;
  nombreDelTipo: string;
  campos: readonly CampoIa[];
  limite?: number;
  /** Lo que respalda el documento y la nota de que no hay con qué cruzarlo (`PieDelRequisito`). */
  pie?: ReactNode;
  recortado: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Stack spacing={0.5} sx={{ pt: 1, borderTop: 1, borderColor: 'borde.sutil', color: 'text.secondary' }} data-lectura-al-pie="">
      <Typography variant="caption" component="p" data-lectura-resumen="">
        <Box component="span" sx={ia.legible ? undefined : { color: 'estado.advertencia.texto' }}>
          {t('ia.revision.legibleLinea', { valor: ia.legible ? t('ia.revision.legibleSi') : t('ia.revision.legibleNo') })}
        </Box>
        {' · '}
        {t('ia.revision.tipoDetectadoLinea', { valor: nombreDelTipo })}
      </Typography>
      {pie}
      {ia.observaciones && (
        <Typography variant="caption" component="p">
          {t('ia.revision.observaciones', { texto: ia.observaciones })}
        </Typography>
      )}
      {recortado && (
        <Typography variant="caption" component="p">
          {t('ia.revision.paginasOmitidas', { count: ia.paginasEnviadas ?? 0 })}
        </Typography>
      )}
      {campos.length > 0 ? (
        <CamposIa campos={campos} titulo={t('ia.revision.campos')} limite={limite} plegados alPie />
      ) : (
        <Typography variant="caption" component="p">
          {t('ia.revision.sinCampos')}
        </Typography>
      )}
    </Stack>
  );
}
