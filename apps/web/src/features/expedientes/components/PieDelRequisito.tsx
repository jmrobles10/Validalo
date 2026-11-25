import { Stack, Typography } from '@mui/material';
import type { SoporteDeSeccionesDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { textoDeRespaldo } from './textoDelSoporte';

export interface PieDelRequisitoProps {
  soporte?: SoporteDeSeccionesDto | null;
  /** El cruce con lo que respalda no tiene con qué compararse (ver `soporteSinCruce`). */
  sinCruce: boolean;
  /** Las cuentas con cruce ya van en su línea de resumen (con su nombre): no se repiten en «Respalda». */
  cuentasEnSuTarjeta?: boolean;
}

/**
 * Lo que el documento respalda de la ficha, en texto secundario («Respalda: …»). Si el cruce con eso no tiene con qué compararse, lo dice debajo, con lo que de verdad pasa: el
 * archivo puede estar leído y aun así no haber una cuenta o sección contra la cual cruzarlo. Cuándo y con qué modelo se leyó va en el encabezado de la revisión automática.
 */
export function PieDelRequisito({ soporte, sinCruce, cuentasEnSuTarjeta = false }: PieDelRequisitoProps) {
  const { t } = useTranslation();
  const respalda = textoDeRespaldo(soporte, t, cuentasEnSuTarjeta);
  if (respalda === null && !sinCruce) return null;
  return (
    <Stack spacing={0.25}>
      {respalda !== null && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} data-pie-del-requisito="">
          {respalda}
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
