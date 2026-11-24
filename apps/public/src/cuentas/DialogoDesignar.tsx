import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, FormControlLabel, FormLabel, Radio, RadioGroup, Stack, Typography } from '@mui/material';
import type { CuentaBancariaPublicaDto, VinculoPublicoDto } from '@validalo/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDesignarCuenta } from '../shared/api';
import { mensajeDeError } from '../shared/errores';
import { useAvisos } from '../shared/useAvisos';
import { designacionesDelVinculo, esActiva, esDesignable, esTipoCuenta, nombreCuenta } from './cuentas';

/**
 * Elegir la cuenta en la que te paga una empresa (CB-2), entre las activas (`cuentas` trae todas para saber cuál tiene
 * hoy la empresa). La aprobada y la que ya espera aprobación no se pueden volver a elegir (la API diría `cuenta-ya-designada` o no
 * haría nada), y una cuenta sin su certificación bancaria tampoco (CB-1: cada cuenta lleva la suya; la API respondería 422
 * `certificacion-requerida`): aparece con el aviso de que la suba en su tarjeta.
 */
export function DialogoDesignar({ vinculo, cuentas, onCerrar }: { vinculo: VinculoPublicoDto; cuentas: readonly CuentaBancariaPublicaDto[]; onCerrar: () => void }) {
  const { t } = useTranslation();
  const mostrar = useAvisos((s) => s.mostrar);
  const designacion = useDesignarCuenta(vinculo.id);
  const empresa = vinculo.empresa.nombre;
  const actuales = designacionesDelVinculo(vinculo.id, cuentas);
  const activas = cuentas.filter(esActiva);
  const bloqueadas = new Set(
    [actuales.Aprobada?.cuenta.id, actuales.Propuesta?.cuenta.id, ...activas.filter((c) => !esDesignable(c)).map((c) => c.id)].filter((id): id is string => Boolean(id)),
  );
  const elegibles = activas.filter((c) => !bloqueadas.has(c.id));
  const [elegida, setElegida] = useState<string>(elegibles.length === 1 ? (elegibles.at(0)?.id ?? '') : '');

  const confirmar = () => {
    const cuenta = elegibles.find((c) => c.id === elegida);
    if (!cuenta) return;
    designacion.mutate(cuenta.id, {
      onSuccess: () => {
        mostrar(t('cuentas.designar.exito', { cuenta: nombreCuenta(cuenta), empresa }));
        onCerrar();
      },
    });
  };

  const detalle = (c: CuentaBancariaPublicaDto) =>
    c.id === actuales.Aprobada?.cuenta.id
      ? t('cuentas.designar.yaDesignada', { empresa })
      : c.id === actuales.Propuesta?.cuenta.id
        ? t('cuentas.designar.yaPropuesta')
        : c.faltaCertificacion
          ? t('cuentas.designar.sinCertificacion')
          : t('cuentas.titularCon', { titular: c.titular, identificacion: c.identificacionTitular });

  return (
    <Dialog open onClose={designacion.isPending ? undefined : onCerrar} fullWidth maxWidth="xs" aria-labelledby="titulo-designar">
      <DialogTitle id="titulo-designar">{t('cuentas.designar.titulo', { empresa })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography sx={{ color: 'text.secondary' }}>{t('cuentas.designar.ayuda', { empresa })}</Typography>
          {designacion.isError && <Alert severity="error">{mensajeDeError(designacion.error, t)}</Alert>}
          <FormControl>
            <FormLabel id="cuentas-para-designar">{t('cuentas.designar.opciones')}</FormLabel>
            <RadioGroup aria-labelledby="cuentas-para-designar" value={elegida} onChange={(e) => setElegida(e.target.value)}>
              {activas.map((c) => (
                <FormControlLabel
                  key={c.id}
                  value={c.id}
                  disabled={bloqueadas.has(c.id)}
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
      <DialogActions>
        <Button variant="text" onClick={onCerrar} disabled={designacion.isPending} sx={{ color: 'text.primary' }}>
          {t('comun.cancelar')}
        </Button>
        <Button variant="contained" onClick={confirmar} disabled={designacion.isPending || !elegida || bloqueadas.has(elegida)}>
          {t('cuentas.designar.confirmar')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
