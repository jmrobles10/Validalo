import { Stack, Typography } from '@mui/material';
import type { HechosIaDto, SoporteDeSeccionesDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { textoDelAnalisis } from '../../documentos/revisionIa';
import { textoDeRespaldo } from './textoDelSoporte';

export interface PieDelRequisitoProps {
  /** La lectura del archivo, si la empresa la recibió. */
  ia?: HechosIaDto | null;
  soporte?: SoporteDeSeccionesDto | null;
  /** El cruce con lo que respalda no tiene con qué compararse (ver `soporteSinCruce`). */
  sinCruce: boolean;
}

/**
 * El pie de un documento exigido, en texto secundario: cuándo y con qué modelo se leyó el archivo y qué secciones de la ficha respalda, en
 * una sola línea («Analizado el … · modelo · Respalda: …»). Si el cruce con eso no tiene con qué compararse, lo dice debajo, junto a lo que
 * respalda, con lo que de verdad pasa: el archivo puede estar leído y aun así no haber una cuenta o sección contra la cual cruzarlo.
 */
export function PieDelRequisito({ ia, soporte, sinCruce }: PieDelRequisitoProps) {
  const { t } = useTranslation();
  const partes = [ia ? textoDelAnalisis(ia, t) : null, textoDeRespaldo(soporte, t)].filter((parte): parte is string => parte !== null);
  if (partes.length === 0 && !sinCruce) return null;
  return (
    <Stack spacing={0.25} sx={{ mt: 1 }}>
      {partes.length > 0 && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} data-pie-del-requisito="">
          {partes.join(' · ')}
        </Typography>
      )}
      {sinCruce && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} data-sin-cruce="">
          {t('cruce.soporte.sinCruceAutomatico')}
        </Typography>
      )}
    </Stack>
  );
}
