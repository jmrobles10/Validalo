import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { CuentaBancariaPublicaDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { nombreCuenta } from '../cuentas/cuentas';
import { useAlTerminarSubida, useDesignarCuenta } from '../shared/api';
import { mensajeDeError } from '../shared/errores';
import { useAvisos } from '../shared/useAvisos';

/**
 * Último paso de la certificación bancaria que pide una empresa (CB-8): la cuenta ya tiene su certificación y la empresa aún no tiene cuenta, así que se propone esa cuenta. La
 * empresa recibe la certificación al designar la cuenta con ella (y la aprueba antes de usarla); sin esto, el documento no le llega y el requisito sigue pendiente. «Ahora no»
 * deja la cuenta con su certificación: se puede designar después desde «Mis cuentas».
 */
export function DialogoProponerCuenta({ cuenta, vinculoId, empresa, onCerrar }: { cuenta: CuentaBancariaPublicaDto; vinculoId: string; empresa: string; onCerrar: () => void }) {
  const { t } = useTranslation();
  const mostrar = useAvisos((s) => s.mostrar);
  const designacion = useDesignarCuenta(vinculoId);
  // La empresa recibe la certificación por una cola: el expediente se vuelve a pedir rápido unos segundos hasta que el requisito la muestre.
  const alTerminar = useAlTerminarSubida();
  const nombre = nombreCuenta(cuenta);

  const confirmar = () =>
    designacion.mutate(cuenta.id, {
      onSuccess: () => {
        mostrar(t('expediente.documentos.bancaria.proponer.exito', { cuenta: nombre, empresa }));
        alTerminar();
        onCerrar();
      },
    });

  return (
    <Dialog open onClose={designacion.isPending ? undefined : onCerrar} fullWidth maxWidth="xs" aria-labelledby="titulo-proponer-cuenta">
      <DialogTitle id="titulo-proponer-cuenta">{t('expediente.documentos.bancaria.proponer.titulo', { empresa })}</DialogTitle>
      <DialogContent>
        <Typography sx={{ color: 'text.secondary' }}>{t('expediente.documentos.bancaria.proponer.texto', { empresa, cuenta: nombre })}</Typography>
        {designacion.isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {mensajeDeError(designacion.error, t)}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCerrar} disabled={designacion.isPending} sx={{ color: 'text.primary' }}>
          {t('expediente.documentos.bancaria.proponer.ahoraNo')}
        </Button>
        <Button variant="contained" onClick={confirmar} disabled={designacion.isPending}>
          {t('expediente.documentos.bancaria.proponer.confirmar', { empresa })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
