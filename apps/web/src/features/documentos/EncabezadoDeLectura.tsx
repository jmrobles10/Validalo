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
 * título, todo en gris y con un separador fino: el color del bloque es solo de la conclusión. La confianza es un dato, no un estado: va en texto, y solo toma el tono de advertencia si está bajo el umbral (`umbral`: el de la conclusión de la IA, que manda el servidor; sin él, el 0,85 por omisión). Un divisor lo separa del contenido.
 */
export function EncabezadoDeLectura({ ia, confianza, umbral = UMBRAL_CONFIANZA }: { ia: HechosIaDto; confianza: number | null; umbral?: number }) {
  const { t } = useTranslation();
  const alta = confianza !== null && confianza >= umbral;
  return (
    <>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}>
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center' }}>
          <Box component="span" aria-hidden sx={{ display: 'inline-flex', color: 'text.secondary' }}>
            <Sparkles size={16} strokeWidth={1.75} />
          </Box>
          <Typography variant="subtitle2" component="h3" sx={{ color: 'text.secondary' }}>
            {t('ia.revision.titulo')}
          </Typography>
          {ia.escalado && <Chip size="small" variant="outlined" label={t('ia.revision.escalado')} />}
        </Stack>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
          {textoDelAnalisis(ia, t)}
          {confianza !== null && (
            <>
              {' · '}
              <Tooltip title={t('ia.revision.confianzaAyuda', { umbral: PORCENTAJE.format(umbral) })} describeChild>
                <Box component="span" sx={alta ? undefined : { color: 'estado.advertencia.texto' }}>
                  {t('ia.revision.confianza', { porcentaje: PORCENTAJE.format(confianza) })}
                </Box>
              </Tooltip>
            </>
          )}
        </Typography>
      </Stack>
      <Divider sx={{ my: 1, borderColor: 'borde.sutil' }} />
    </>
  );
}
