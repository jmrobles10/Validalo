import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dropzone } from '../boveda/Dropzone';
import { mensajeProblema } from '../boveda/mensajesSubida';
import { formatearTamano, validarArchivo } from '../boveda/subida';

/**
 * Elige el archivo de la certificación bancaria de una cuenta (CB-1): la zona de subida de la bóveda mientras no hay archivo y, con uno elegido, su nombre con
 * «Cambiar archivo». Revisa en el navegador formato y tamaño antes de aceptarlo. No sube nada: quien lo usa sube cuando corresponde (al guardar la cuenta o al confirmar).
 */
export function SelectorDeCertificacion({
  archivo,
  onArchivo,
  deshabilitado = false,
  error = null,
}: {
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
  deshabilitado?: boolean;
  /** Lo que falta o falló, ya redactado (p. ej. «Adjunta la certificación…»). */
  error?: string | null;
}) {
  const { t } = useTranslation();
  const [problema, setProblema] = useState<string | null>(null);

  const elegir = (elegido: File) => {
    const encontrado = validarArchivo(elegido);
    setProblema(encontrado ? mensajeProblema(encontrado, t) : null);
    if (!encontrado) onArchivo(elegido);
  };

  const mensaje = problema ?? error;
  return (
    <Stack spacing={1} component="section" aria-label={t('cuentas.certificacion.nueva.campo')}>
      <Box>
        <Typography variant="subtitle2" component="h3">
          {t('cuentas.certificacion.nueva.campo')}
        </Typography>
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
          {t('cuentas.certificacion.nueva.ayuda')}
        </Typography>
      </Box>
      {archivo ? (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }} useFlexGap>
          <Box aria-hidden sx={{ color: 'text.secondary', display: 'flex' }}>
            <FileText size={20} />
          </Box>
          <Box sx={{ minWidth: 0, flex: '1 1 160px' }}>
            <Typography variant="subtitle2" component="p" sx={{ wordBreak: 'break-word' }}>
              {t('cuentas.certificacion.nueva.elegido', { archivo: archivo.name })}
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
              {formatearTamano(archivo.size)}
            </Typography>
          </Box>
          <Button variant="text" size="small" disabled={deshabilitado} onClick={() => onArchivo(null)} sx={{ color: 'text.secondary' }}>
            {t('cuentas.certificacion.nueva.cambiar')}
          </Button>
        </Stack>
      ) : (
        <Dropzone titulo={t('cuentas.certificacion.nueva.zona')} deshabilitado={deshabilitado} onArchivo={elegir} />
      )}
      {mensaje && (
        <Alert severity="error" role="alert">
          {mensaje}
        </Alert>
      )}
    </Stack>
  );
}
