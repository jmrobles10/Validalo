import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { CuentaBancariaPublicaDto } from '@validalo/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAvisos } from '../shared/useAvisos';
import { nombreCuenta } from './cuentas';
import { SelectorDeCertificacion } from './SelectorDeCertificacion';
import { SubidaDeCertificacion } from './SubidaDeCertificacion';

/**
 * Sube (o reemplaza) la certificación bancaria de una cuenta ya registrada (CB-1): elige el archivo y lo sube apenas se elige. Si ya hay una, la nueva es una versión más de
 * <b>esa</b> cuenta: las empresas con las que está designada reciben la nueva y la IA la vuelve a leer.
 */
export function DialogoCertificacion({ cuenta, reemplaza, onCerrar }: { cuenta: CuentaBancariaPublicaDto; reemplaza: boolean; onCerrar: () => void }) {
  const { t } = useTranslation();
  const mostrar = useAvisos((s) => s.mostrar);
  const [archivo, setArchivo] = useState<File | null>(null);
  const nombre = nombreCuenta(cuenta);

  return (
    <Dialog open onClose={onCerrar} fullWidth maxWidth="sm" aria-labelledby="titulo-certificacion">
      <DialogTitle id="titulo-certificacion">
        {t(reemplaza ? 'cuentas.certificacion.dialogo.tituloReemplazar' : 'cuentas.certificacion.dialogo.tituloSubir', { cuenta: nombre })}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography sx={{ color: 'text.secondary' }}>{t(reemplaza ? 'cuentas.certificacion.dialogo.ayudaReemplazar' : 'cuentas.certificacion.dialogo.ayudaSubir')}</Typography>
          {archivo ? (
            <SubidaDeCertificacion
              key={`${archivo.name}-${String(archivo.size)}-${String(archivo.lastModified)}`}
              cuentaId={cuenta.id}
              archivo={archivo}
              onLista={(version) => {
                mostrar(t('cuentas.certificacion.dialogo.exito', { cuenta: nombre, n: String(version) }));
                onCerrar();
              }}
              onOtroArchivo={() => setArchivo(null)}
            />
          ) : (
            <SelectorDeCertificacion archivo={null} onArchivo={setArchivo} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCerrar} sx={{ color: 'text.primary' }}>
          {t('cuentas.certificacion.dialogo.cerrar')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
