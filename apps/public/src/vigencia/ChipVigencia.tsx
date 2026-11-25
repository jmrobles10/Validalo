import { Alert, Stack, Typography } from '@mui/material';
import type { VigenciaDto } from '@validalo/api-client';
import { ChipEstado } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { avisoDeVigencia, ESTADO_DEL_CHIP, estadoDeVigencia, textoPorAprobar, textoVigencia } from './vigencia';

/** Estado de la vigencia con el ícono del design system y el texto del tercero («Por vencer», «No vence»). */
export function ChipVigencia({ vigencia, size = 'small' }: { vigencia: VigenciaDto; size?: 'small' | 'medium' }) {
  const { t } = useTranslation();
  const estado = estadoDeVigencia(vigencia);
  if (!estado) return null;
  return <ChipEstado estado={ESTADO_DEL_CHIP[estado]} etiqueta={t(`vigencia.estados.${estado}`)} size={size} />;
}

/**
 * «Vence el 28/09/2026» junto a su estado. Mientras la empresa no apruebe el documento y su tipo se revalide cada N días no hay fecha: en vez de «No vence» dice
 * «Vence 1 año después de que {empresa} lo apruebe» (TD-10).
 */
export function LineaVigencia({ vigencia, empresa }: { vigencia: VigenciaDto | null | undefined; empresa?: string }) {
  const { t } = useTranslation();
  if (!vigencia || !estadoDeVigencia(vigencia)) return null;
  const porAprobar = textoPorAprobar(vigencia, empresa, t);
  if (porAprobar)
    return (
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
        {porAprobar}
      </Typography>
    );
  const texto = textoVigencia(vigencia, t);
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
      <ChipVigencia vigencia={vigencia} />
      {texto && (
        <Typography variant="caption" component="span" sx={{ color: 'text.secondary' }}>
          {texto}
        </Typography>
      )}
    </Stack>
  );
}

/** Qué hacer si está por vencer, en periodo de gracia o vencido; nada en los demás casos. */
export function AvisoVigencia({ vigencia }: { vigencia: VigenciaDto | null | undefined }) {
  const { t } = useTranslation();
  const aviso = vigencia ? avisoDeVigencia(vigencia, t) : null;
  if (!aviso) return null;
  return (
    <Alert severity={aviso.severidad} sx={{ mt: 1 }}>
      {aviso.texto}
    </Alert>
  );
}
