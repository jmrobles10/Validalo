import { Stack, Typography } from '@mui/material';
import type { CuentaDesignadaDto } from '@validalo/api-client';
import { ChipEstado, Dato, RejillaDatos } from '@validalo/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { esEstadoCuenta, numeroVisible, textoTipoCuenta } from './modelo';

/** Cada parte de la tarjeta («Designada», «Por aprobar», «Última rechazada»): una región con su nombre y, arriba, una sola línea de encabezado. */
export function SeccionCuenta({ titulo, encabezado, children }: { titulo: string; encabezado: ReactNode; children: ReactNode }) {
  return (
    <Stack component="section" aria-label={titulo} spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {encabezado}
      </Stack>
      {children}
    </Stack>
  );
}

/** El estado de la cuenta como chip (con `etiqueta` el texto de la sección, p. ej. «Por aprobar») y, en secundario, lo que lo acompaña («Propuesta el 08/11/2026»). */
export function EncabezadoCuenta({ cuenta, etiqueta, nota }: { cuenta: CuentaDesignadaDto; etiqueta: string; nota?: string }) {
  return (
    <>
      {esEstadoCuenta(cuenta.estado) && <ChipEstado estado={cuenta.estado} etiqueta={etiqueta} />}
      {nota && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {nota}
        </Typography>
      )}
    </>
  );
}

/** Datos de la cuenta; el número va en mono para cotejarlo dígito a dígito con la certificación bancaria. */
export function DatosCuenta({ cuenta }: { cuenta: CuentaDesignadaDto }) {
  const { t } = useTranslation();
  return (
    <>
      <RejillaDatos>
        <Dato etiqueta={t('cuentas.campos.banco')}>{cuenta.banco}</Dato>
        <Dato etiqueta={t('cuentas.campos.tipo')}>{textoTipoCuenta(cuenta.tipoCuenta, t)}</Dato>
        <Dato etiqueta={t('cuentas.campos.numero')}>
          <Typography component="span" variant="mono">
            {numeroVisible(cuenta)}
          </Typography>
        </Dato>
        <Dato etiqueta={t('cuentas.campos.titular')}>{cuenta.titular}</Dato>
        <Dato etiqueta={t('cuentas.campos.identificacionTitular')}>
          <Typography component="span" variant="mono">
            {cuenta.identificacionTitular}
          </Typography>
        </Dato>
        <Dato etiqueta={t('cuentas.campos.moneda')}>{cuenta.moneda}</Dato>
      </RejillaDatos>
      {cuenta.numero === null && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('cuentas.numeroOculto')}
        </Typography>
      )}
    </>
  );
}

/** La última propuesta rechazada, en tono secundario: qué cuenta era y por qué no se aceptó. */
export function CuentaRechazada({ cuenta }: { cuenta: CuentaDesignadaDto }) {
  const { t } = useTranslation();
  return (
    <SeccionCuenta
      titulo={t('cuentas.secciones.rechazada')}
      encabezado={
        <>
          <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
            {t('cuentas.secciones.rechazada')}
          </Typography>
          {esEstadoCuenta(cuenta.estado) && <ChipEstado estado={cuenta.estado} />}
        </>
      }
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('cuentas.rechazadaResumen', { banco: cuenta.banco, tipo: textoTipoCuenta(cuenta.tipoCuenta, t), numero: numeroVisible(cuenta) })}
      </Typography>
      {cuenta.motivoRechazo && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('cuentas.motivo', { motivo: cuenta.motivoRechazo })}
        </Typography>
      )}
    </SeccionCuenta>
  );
}
