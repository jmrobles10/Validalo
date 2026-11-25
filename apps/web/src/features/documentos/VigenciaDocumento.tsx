import { Alert, Box, Stack, Tooltip, Typography } from '@mui/material';
import type { VigenciaDto } from '@validalo/api-client';
import { ChipEstado, visualmenteOculto } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { CHIP_VIGENCIA, estaPorAprobar, estadoVigencia, etiquetaVigencia, explicacionVigencia, severidadAviso, textoAvisoVigencia, textoVencimiento } from './vigencia';

/**
 * Chip compacto de la vigencia («Por vencer · 30/11/2026»): ícono y tono del estado canónico, y en el tooltip de dónde
 * sale la fecha. Para listas apretadas (decisión por área, documentos del vínculo).
 */
export function ChipVigencia({ vigencia }: { vigencia: VigenciaDto }) {
  const { t } = useTranslation();
  const estado = estadoVigencia(vigencia);
  if (!estado) return null;
  const detalle = [textoVencimiento(vigencia, t), explicacionVigencia(vigencia, t)].filter(Boolean).join('. ');
  return (
    <Tooltip title={detalle} describeChild>
      <Box component="span" sx={{ display: 'inline-flex' }}>
        <ChipEstado estado={CHIP_VIGENCIA[estado]} etiqueta={etiquetaVigencia(vigencia, t)} />
        <Box component="span" sx={visualmenteOculto}>
          {detalle}
        </Box>
      </Box>
    </Tooltip>
  );
}

/**
 * Vigencia completa de un documento: el estado, «Vence el …» y, como texto secundario, de dónde sale la fecha (desde la
 * expedición declarada, la carga o el vencimiento propio) y los días de gracia. Si está por vencer, en gracia o vencido, todo va
 * en un solo aviso (el texto del aviso ya dice el estado y la fecha: no se repiten en un chip ni en otra línea).
 */
export function VigenciaDocumento({ vigencia }: { vigencia: VigenciaDto }) {
  const { t } = useTranslation();
  const estado = estadoVigencia(vigencia);
  if (!estado) return null;
  const explicacion = explicacionVigencia(vigencia, t);
  const aviso = textoAvisoVigencia(vigencia, t);
  if (aviso) {
    return (
      <Alert severity={severidadAviso(vigencia)} sx={{ typography: 'body2', py: 0.25 }}>
        {aviso}
        {explicacion && (
          <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
            {explicacion}
          </Typography>
        )}
      </Alert>
    );
  }
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
      <ChipEstado estado={CHIP_VIGENCIA[estado]} etiqueta={estaPorAprobar(vigencia) ? t('expedientes.vigencia.porAprobar') : t(`expedientes.vigencia.estados.${estado}`)} />
      {(estado !== 'SinVencimiento' || estaPorAprobar(vigencia)) && <Typography>{textoVencimiento(vigencia, t)}</Typography>}
      {explicacion && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
          {explicacion}
        </Typography>
      )}
    </Stack>
  );
}
