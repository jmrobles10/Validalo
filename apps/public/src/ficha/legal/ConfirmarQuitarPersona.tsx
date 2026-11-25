import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useTranslation } from 'react-i18next';

interface Props {
  nombre: string;
  /** Los roles que se quitan con ella, ya traducidos (una persona con dos filas pierde las dos). */
  roles: string;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/** Confirma quitar a una persona que figura con más de un rol: se quitan todos, y el diálogo dice cuáles. */
export function ConfirmarQuitarPersona({ nombre, roles, onConfirmar, onCancelar }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open onClose={onCancelar} aria-labelledby="titulo-quitar-persona">
      <DialogTitle id="titulo-quitar-persona">{t('ficha.legal.quitarConfirmar.titulo', { nombre })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('ficha.legal.quitarConfirmar.mensaje', { roles })}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={onCancelar} sx={{ color: 'text.primary' }}>
          {t('comun.cancelar')}
        </Button>
        <Button variant="contained" color="error" onClick={onConfirmar}>
          {t('ficha.legal.quitarConfirmar.quitar')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
