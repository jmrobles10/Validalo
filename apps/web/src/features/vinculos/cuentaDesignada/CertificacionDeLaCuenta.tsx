import { Alert, Stack, Typography } from '@mui/material';
import type { CuentaDesignadaDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, type Estado } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { TablaCruce } from '../../expedientes/components/CruceSeccion';
import { camposCriticosQueDifieren, esVerificacionDeCuenta, type VerificacionDeCuenta } from './modelo';

/** El estado del chip de cada resultado de la lectura (la etiqueta sale de `cuentas.certificacion.chip`). */
const ESTADO: Record<VerificacionDeCuenta, Estado> = {
  SinAnalisis: 'Pendiente',
  Coincide: 'Aprobado',
  Discrepa: 'Rechazado',
  NoVerificable: 'Observado',
  NoSeLee: 'Observado',
};

/**
 * La certificación bancaria de la cuenta, junto a ella, para quien la aprueba (CB-1): cuál versión recibió la empresa y qué leyó la IA frente a lo que declaró el tercero,
 * campo por campo. Una diferencia en lo crítico (el número, el titular, que el titular sea el tercero o el estado de la cuenta) va destacada: es evidencia para decidir,
 * nada se bloquea solo. Sin lectura para la empresa, el aviso de cotejar a mano; sin certificación propia (una cuenta designada antes de este cambio), el aviso de que no hay
 * con qué cotejarla.
 */
export function CertificacionDeLaCuenta({ cuenta }: { cuenta: CuentaDesignadaDto }) {
  const { t } = useTranslation();
  const certificacion = cuenta.certificacion ?? null;
  if (!certificacion) {
    return cuenta.sinCertificacion ? <Alert severity="warning">{t('cuentas.certificacion.sin')}</Alert> : null;
  }

  const verificacion = esVerificacionDeCuenta(certificacion.verificacion) ? certificacion.verificacion : 'SinAnalisis';
  const criticos = camposCriticosQueDifieren(certificacion);
  return (
    <Stack component="section" aria-label={t('cuentas.certificacion.titulo')} spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" component="h4">
          {t('cuentas.certificacion.titulo')}
        </Typography>
        <ChipEstado estado={ESTADO[verificacion]} etiqueta={t(`cuentas.certificacion.chip.${verificacion}`)} />
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('cuentas.certificacion.version', { n: String(certificacion.version), fecha: formatearFecha(certificacion.cargadaEn) })}
        </Typography>
      </Stack>
      {certificacion.discrepanciaCritica && (
        <Alert severity="error" role="alert">
          {t('cuentas.certificacion.criticas', { campos: criticos.join(', ') })}
        </Alert>
      )}
      {certificacion.sinAnalisis && <Alert severity="info">{t('cuentas.certificacion.sinAnalisis', { n: String(certificacion.version) })}</Alert>}
      {certificacion.cruce && (
        <>
          <TablaCruce cruce={certificacion.cruce} />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('cruce.evidencia')}
          </Typography>
        </>
      )}
    </Stack>
  );
}
