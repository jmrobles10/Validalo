import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import type { CuentaBancariaPublicaDto } from '@validalo/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { esTipoCuenta } from '../cuentas/cuentas';

/**
 * Primer paso de la certificación bancaria que pide una empresa (CB-8): de cuál de tus cuentas es. La certificación se sube con la cuenta (cada cuenta lleva la suya), así que se
 * elige entre las activas o se agrega otra. La cuenta que la empresa ya tiene viene elegida y avisa que lo es; cada cuenta dice si ya tiene su certificación o falta.
 */
export function ElegirCuentaDelRequisito({
  empresa,
  activas,
  deLaEmpresa,
  onElegir,
  onAgregar,
  onCerrar,
}: {
  empresa: string;
  activas: readonly CuentaBancariaPublicaDto[];
  /** La cuenta que la empresa ya tiene (aprobada o por aprobar), si la hay: viene elegida. */
  deLaEmpresa: CuentaBancariaPublicaDto | null;
  onElegir: (cuenta: CuentaBancariaPublicaDto) => void;
  onAgregar: () => void;
  onCerrar: () => void;
}) {
  const { t } = useTranslation();
  const [elegida, setElegida] = useState<string>(deLaEmpresa?.id ?? (activas.length === 1 ? (activas.at(0)?.id ?? '') : ''));
  const cuenta = activas.find((c) => c.id === elegida);

  const detalle = (c: CuentaBancariaPublicaDto) =>
    c.id === deLaEmpresa?.id
      ? t('expediente.documentos.bancaria.elegir.deLaEmpresa', { empresa })
      : c.faltaCertificacion
        ? t('expediente.documentos.bancaria.elegir.sinCertificacion')
        : t('expediente.documentos.bancaria.elegir.conCertificacion');

  return (
    <Dialog open onClose={onCerrar} fullWidth maxWidth="xs" aria-labelledby="titulo-elegir-cuenta-requisito">
      <DialogTitle id="titulo-elegir-cuenta-requisito">{t('expediente.documentos.bancaria.elegir.titulo', { empresa })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography sx={{ color: 'text.secondary' }}>{t('expediente.documentos.bancaria.elegir.ayuda')}</Typography>
          <FormControl>
            <FormLabel id="cuentas-del-requisito">{t('expediente.documentos.bancaria.elegir.opciones')}</FormLabel>
            <RadioGroup aria-labelledby="cuentas-del-requisito" value={elegida} onChange={(e) => setElegida(e.target.value)}>
              {activas.map((c) => (
                <FormControlLabel
                  key={c.id}
                  value={c.id}
                  control={<Radio />}
                  sx={{ alignItems: 'flex-start', py: 0.5, '& .MuiRadio-root': { mt: -0.75 } }}
                  label={
                    <>
                      <Typography component="span" sx={{ display: 'block' }}>
                        {t('cuentas.designar.opcion', { banco: c.banco, tipo: esTipoCuenta(c.tipoCuenta) ? t(`cuentas.tipos.${c.tipoCuenta}`) : c.tipoCuenta, numero: c.numeroEnmascarado })}
                      </Typography>
                      <Typography component="span" sx={{ color: 'text.secondary', display: 'block' }}>
                        {detalle(c)}
                      </Typography>
                    </>
                  }
                />
              ))}
            </RadioGroup>
          </FormControl>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap' }}>
        <Button variant="text" onClick={onAgregar} sx={{ mr: 'auto' }}>
          {t('expediente.documentos.bancaria.elegir.otraCuenta')}
        </Button>
        <Button variant="text" onClick={onCerrar} sx={{ color: 'text.primary' }}>
          {t('comun.cancelar')}
        </Button>
        <Button variant="contained" disabled={!cuenta} onClick={() => cuenta && onElegir(cuenta)}>
          {t('expediente.documentos.bancaria.elegir.continuar')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
