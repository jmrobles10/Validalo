import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { mensajeFallo, mensajeProblema } from '../boveda/mensajesSubida';
import { useSubida } from '../boveda/useSubida';
import { MODO_EMBEBIDO } from '../embebido/modo';
import { useSesionTercero } from '../sesion/sesionTercero';
import { mensajeDevolucion } from '../boveda/versiones';
import { destinoDeCertificacion } from './cuentas';

/**
 * Sube la certificación de una cuenta apenas se monta (el archivo ya está elegido) y dice cómo va: progreso, o el siguiente paso si falla, el archivo se devuelve o es el
 * mismo de una versión anterior. Al terminar bien avisa con `onLista` y la lista de cuentas se refresca sola (la subida refresca todo lo del tercero).
 * `textoFallo` redacta el fallo con lo que aclara qué pasa con la cuenta (p. ej. «tu cuenta quedó guardada»).
 */
export function SubidaDeCertificacion({
  cuentaId,
  archivo,
  onLista,
  onOtroArchivo,
  onDespues,
  textoFallo,
}: {
  cuentaId: string;
  archivo: File;
  onLista: (version: number) => void;
  /** Volver a elegir el archivo (cuando se devolvió o es un duplicado). */
  onOtroArchivo: () => void;
  /** Dejarlo para después (solo al agregar la cuenta: ya quedó registrada). */
  onDespues?: () => void;
  /** Cómo se presenta un fallo: recibe el motivo ya redactado. */
  textoFallo?: (motivo: string) => string;
}) {
  const { t } = useTranslation();
  const { estado, subir } = useSubida();
  // Un token embebido de un expediente solo sube para el vínculo con el que se emitió: se le dice cuál.
  const vinculoDelToken = useSesionTercero((s) => (MODO_EMBEBIDO ? (s.sesion?.vinculoOrigen ?? null) : null));
  const destino = destinoDeCertificacion(cuentaId, vinculoDelToken);

  // Se sube al montarse; reintentar la repite con el mismo archivo. Sin marca de «ya empezó»: en desarrollo (StrictMode) React monta, desmonta y vuelve
  // a montar, y el desmontaje cancela la primera subida (`useSubida` aborta al salir); con la marca, la segunda no arrancaba y quedaba en «Preparando…».
  // La primera se cancela antes de pedir nada a la API (después del hash), así que no hay doble carga.
  useEffect(() => {
    subir(archivo, destino);
    // `subir` cambia en cada render y la subida no debe reiniciarse por eso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (estado.fase === 'resultado' && estado.resultado.tipo === 'lista') onLista(estado.resultado.version.n);
    // Solo importa el cambio de fase: `onLista` cierra el diálogo y no debe volver a dispararse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.fase]);

  if (estado.fase === 'inicio') return null;

  if (estado.fase === 'problema') {
    return (
      <Alert severity="error" role="alert">
        {mensajeProblema(estado.problema, t)}
      </Alert>
    );
  }

  if (estado.fase === 'en-curso') {
    const pct = Math.round(estado.progreso * 100);
    return (
      <Box>
        <LinearProgress variant={estado.etapa === 'subiendo' ? 'determinate' : 'indeterminate'} value={pct} aria-label={t('subir.progreso')} sx={{ height: 6 }} />
        <Typography aria-live="polite" sx={{ color: 'text.secondary', mt: 1 }}>
          {t(`subir.fases.${estado.etapa}`, { pct: String(pct) })}
        </Typography>
      </Box>
    );
  }

  if (estado.fase === 'fallo') {
    const motivo = mensajeFallo(estado.fallo, estado.error, t);
    return (
      <Alert severity="error" role="alert">
        {textoFallo ? textoFallo(motivo) : motivo}
        <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
          <Button variant="contained" onClick={() => subir(archivo, destino)}>
            {t('cuentas.certificacion.nueva.reintentar')}
          </Button>
          {onDespues && (
            <Button variant="outlined" onClick={onDespues}>
              {t('cuentas.certificacion.nueva.despues')}
            </Button>
          )}
        </Stack>
      </Alert>
    );
  }

  const resultado = estado.resultado;
  if (resultado.tipo === 'lista') return null;
  return (
    <Alert severity={resultado.tipo === 'duplicado' ? 'info' : 'error'} role={resultado.tipo === 'duplicado' ? undefined : 'alert'}>
      {resultado.tipo === 'duplicado' ? t('cuentas.certificacion.dialogo.duplicado', { n: String(resultado.numero) }) : mensajeDevolucion(resultado.version, t)}
      <Box>
        <Button variant="outlined" onClick={onOtroArchivo} sx={{ mt: 1.5 }}>
          {t('subir.otroArchivo')}
        </Button>
      </Box>
    </Alert>
  );
}
