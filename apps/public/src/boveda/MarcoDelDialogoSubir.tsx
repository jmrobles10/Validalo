import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * El marco del diálogo de subida: título, ayuda opcional, el contenido y «Cerrar». Se cierra con Esc, el fondo o «Cerrar», salvo mientras sube
 * (ahí se cancela la subida desde el contenido). En el celular ocupa toda la pantalla.
 */
export function MarcoDelDialogoSubir({
  titulo,
  sub,
  ocupado = false,
  onCerrar,
  children,
}: {
  titulo: string;
  sub?: string;
  ocupado?: boolean;
  onCerrar: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const tema = useTheme();
  const pantallaCompleta = useMediaQuery(tema.breakpoints.down('sm'));

  return (
    <Dialog open onClose={ocupado ? undefined : onCerrar} fullWidth maxWidth="sm" fullScreen={pantallaCompleta} aria-labelledby="titulo-subir">
      <DialogTitle id="titulo-subir">{titulo}</DialogTitle>
      <DialogContent>
        {sub && <Typography sx={{ color: 'text.secondary', mb: 2 }}>{sub}</Typography>}
        {children}
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCerrar} disabled={ocupado} sx={{ color: 'text.primary' }}>
          {t('comun.cerrar')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
