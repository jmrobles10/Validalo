import { Box, Chip, Divider, Stack, Tooltip, Typography } from '@mui/material';
import type { HechosIaDto } from '@validalo/api-client';
import { LOCALE } from '@validalo/ui';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { textoDelAnalisis, UMBRAL_CONFIANZA } from './revisionIa';

const PORCENTAJE = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });

/**
 * El encabezado de la revisión automática dentro de un bloque: a la izquierda el título (con el aviso de que lo revisó un modelo mayor, si fue así) y a la derecha, en texto
 * secundario, cuándo y con qué modelo se leyó y con qué confianza («Analizado el 24/11/2026 · gpt-6-luna · Confianza 98 %»); en pantallas angostas esa línea baja debajo del
 * título. La confianza es un dato, no un estado: va en texto, y solo toma el tono de advertencia si está bajo el umbral. Un divisor lo separa del contenido.
 */
export function EncabezadoDeLectura({ ia, confianza }: { ia: HechosIaDto; confianza: number | null }) {
  const { t } = useTranslation();
  const alta = confianza !== null && confianza >= UMBRAL_CONFIANZA;
  return (
    <>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center' }}>
          <Sparkles size={16} strokeWidth={1.75} aria-hidden />
          <Typography variant="subtitle2" component="h3">
            {t('ia.revision.titulo')}
          </Typography>
          {ia.escalado && <Chip size="small" variant="outlined" label={t('ia.revision.escalado')} />}
        </Stack>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
          {textoDelAnalisis(ia, t)}
          {confianza !== null && (
            <>
              {' · '}
              <Tooltip title={t('ia.revision.confianzaAyuda', { umbral: PORCENTAJE.format(UMBRAL_CONFIANZA) })} describeChild>
                <Box component="span" sx={alta ? undefined : { color: 'estado.advertencia.texto' }}>
                  {t('ia.revision.confianza', { porcentaje: PORCENTAJE.format(confianza) })}
                </Box>
              </Tooltip>
            </>
          )}
        </Typography>
      </Stack>
      <Divider sx={{ my: 1 }} />
    </>
  );
}
