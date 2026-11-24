import { Box, Button, Stack, Typography } from '@mui/material';
import type { CuentaBancariaPublicaDto } from '@validalo/api-client';
import { ChipEstado } from '@validalo/ui';
import { Archive, Landmark } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FilaEmpresa } from '../shared/componentes';
import { CertificacionDeCuenta } from './CertificacionDeCuenta';
import { designacionesVisibles, esActiva, esTipoCuenta, nombreCuenta } from './cuentas';
import { DialogoRetirarCuenta } from './DialogoRetirarCuenta';

/**
 * Una cuenta del tercero (misma anatomía que la tarjeta de un documento de la bóveda): cabecera con banco, tipo, número
 * enmascarado y titular, debajo su certificación bancaria (CB-1) y una fila por empresa con el estado de la designación.
 */
export function TarjetaCuenta({ cuenta }: { cuenta: CuentaBancariaPublicaDto }) {
  const { t } = useTranslation();
  const [retirando, setRetirando] = useState(false);
  const activa = esActiva(cuenta);
  const designaciones = designacionesVisibles(cuenta);
  const tipo = esTipoCuenta(cuenta.tipoCuenta) ? t(`cuentas.tipos.${cuenta.tipoCuenta}`) : cuenta.tipoCuenta;

  return (
    <Box component="article" aria-labelledby={`cuenta-${cuenta.id}`} sx={{ py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
        <Box aria-hidden sx={(th) => ({ display: 'grid', placeItems: 'center', flex: 'none', width: 32, height: 32, borderRadius: '9px', bgcolor: th.palette.acento.tinte, color: th.palette.acento.main })}>
          <Landmark size={17} strokeWidth={1.75} />
        </Box>
        <Box sx={{ minWidth: 0, flex: '1 1 180px' }}>
          <Typography variant="subtitle1" id={`cuenta-${cuenta.id}`} component="h2">
            {cuenta.banco}
          </Typography>
          <Typography variant="mono" component="p" sx={{ color: 'text.secondary' }}>
            {t('cuentas.resumen', { tipo, numero: cuenta.numeroEnmascarado, moneda: cuenta.moneda })}
          </Typography>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {t('cuentas.titularCon', { titular: cuenta.titular, identificacion: cuenta.identificacionTitular })}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', ml: 'auto', flex: 'none' }}>
          {activa ? <ChipEstado estado="Activo" etiqueta={t('cuentas.estados.Activa')} /> : <ChipEstado estado="Retirada" etiqueta={t('cuentas.estados.Retirada')} />}
          {activa && (
            <Button variant="text" size="small" onClick={() => setRetirando(true)} startIcon={<Archive size={16} aria-hidden />} aria-label={`${t('cuentas.retirar')}: ${nombreCuenta(cuenta)}`} sx={{ color: 'text.secondary' }}>
              {t('cuentas.retirar')}
            </Button>
          )}
        </Stack>
      </Stack>

      <CertificacionDeCuenta cuenta={cuenta} />

      <Box component="ul" aria-label={t('cuentas.empresas')} sx={{ p: 0, m: 0, mt: 0.75, pl: { sm: 6 } }}>
        {designaciones.length === 0 ? (
          <Typography component="li" sx={{ color: 'text.secondary', listStyle: 'none' }}>
            {t('cuentas.sinEmpresas')}
          </Typography>
        ) : (
          designaciones.map((d) => (
            <FilaEmpresa
              key={`${d.vinculoId}-${d.estado}`}
              nombre={d.empresa}
              estado={<ChipEstado estado={d.estado} etiqueta={t(`cuentas.designacion.chip.${d.estado}`)} />}
              detalle={
                d.estado === 'Rechazada' && !d.motivoRechazo
                  ? t('cuentas.designacion.RechazadaSinMotivo', { empresa: d.empresa })
                  : t(`cuentas.designacion.${d.estado}`, { empresa: d.empresa, motivo: d.motivoRechazo ?? '' })
              }
            />
          ))
        )}
      </Box>
      {retirando && <DialogoRetirarCuenta cuenta={cuenta} onCerrar={() => setRetirando(false)} />}
    </Box>
  );
}
