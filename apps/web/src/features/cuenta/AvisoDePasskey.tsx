import { Alert, Button } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSesion } from '../../sesion/sesionStore';

/**
 * Tras entrar solo con el código (un factor), invita a registrar una passkey —es opcional— a quien aún no tiene ninguna: un aviso compacto y descartable bajo la barra,
 * con la acción a Mi cuenta. No aparece si la cuenta ya tiene una ni con la identidad delegada. `flotante`: con esquinas redondeadas y margen,
 * para ir sobre el lienzo de la consola de Plataforma.
 */
export function AvisoDePasskey({ rutaMiCuenta, flotante = false }: { rutaMiCuenta: string; flotante?: boolean }) {
  const { t } = useTranslation();
  const navegar = useNavigate();
  const sugerir = useSesion((s) => s.sugerirPasskey);
  const descartar = useSesion((s) => s.descartarSugerenciaDePasskey);
  if (!sugerir) return null;

  return (
    <Alert
      severity="info"
      sx={flotante ? { mx: { xs: 1, md: 2 }, mb: 1, py: 0, alignItems: 'center' } : { borderRadius: 0, py: 0, alignItems: 'center' }}
      action={
        <>
          <Button
            size="small"
            color="inherit"
            onClick={() => {
              descartar();
              void navegar(rutaMiCuenta);
            }}
          >
            {t('ingreso.avisoPasskeyRegistrar')}
          </Button>
          <Button size="small" color="inherit" onClick={descartar}>
            {t('ingreso.avisoPasskeyDespues')}
          </Button>
        </>
      }
    >
      <strong>{t('ingreso.avisoPasskeyTitulo')}.</strong> {t('ingreso.avisoPasskeyTexto')}
    </Alert>
  );
}
