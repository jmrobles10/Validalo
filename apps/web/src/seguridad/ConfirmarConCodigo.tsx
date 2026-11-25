import { Alert, Box, Button, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { confirmarReautenticacionConCodigo, enviarCodigoDeReautenticacion, type CodigoSolicitadoDto } from '@validalo/api-client';
import { CampoCodigo, formatearHora } from '@validalo/ui';
import { Fingerprint } from 'lucide-react';
import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { exigeEmpezarDeNuevo, intentosRestantesDe, segundosParaReenviar } from '../ingreso/estado';
import { mensajeDeIngreso } from '../ingreso/mensajes';
import { IconoCarga } from '../shared/componentes';

const SIN_EMPRESA = { empresa: null } as const;

export interface ConfirmarConCodigoProps {
  /** La acción con palabras («rotar una API key»). */
  accion: string;
  minutos: number;
  alConfirmar: () => void;
  alCancelar: () => void;
  /** Quien también tiene passkey puede volver a confirmar con ella. */
  alUsarPasskey?: () => void;
}

/**
 * Confirmar una acción sensible con un código de 6 dígitos que llega al correo de la cuenta, como alternativa a la passkey (PI-20). Al abrirse pide el código solo
 * (se llega aquí a propósito) y lo verifica al completar los seis dígitos; si es incorrecto dice cuántos intentos quedan y, si venció o se agotó, ofrece pedir otro.
 */
export function ConfirmarConCodigo({ accion, minutos, alConfirmar, alCancelar, alUsarPasskey }: ConfirmarConCodigoProps) {
  const { t } = useTranslation();
  const [solicitado, setSolicitado] = useState<CodigoSolicitadoDto | null>(null);
  const [codigo, setCodigo] = useState('');
  // Cada intento fallido o código nuevo remonta las casillas: así vuelven a enfocarse y se puede escribir de seguido.
  const [ronda, setRonda] = useState(0);
  const [pedidoEn, setPedidoEn] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  const enviado = useRef('');
  const pedido = useRef(false);

  useEffect(() => {
    const reloj = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(reloj);
  }, []);

  const verificar = useMutation({
    mutationFn: (digitos: string) => {
      if (solicitado === null) throw new Error('Aún no se pidió el código.');
      return confirmarReautenticacionConCodigo({ desafio: solicitado.desafio, codigo: digitos }, SIN_EMPRESA);
    },
    onSuccess: alConfirmar,
    onError: () => {
      enviado.current = '';
      setCodigo('');
      setRonda((r) => r + 1);
    },
  });

  const reiniciarVerificacion = verificar.reset;
  const enviar = useMutation({
    mutationFn: () => enviarCodigoDeReautenticacion(SIN_EMPRESA),
    onSuccess: (respuesta) => {
      reiniciarVerificacion();
      enviado.current = '';
      setCodigo('');
      setSolicitado(respuesta);
      setRonda((r) => r + 1);
      setPedidoEn(Date.now());
    },
  });

  const pedirCodigo = enviar.mutate;
  useEffect(() => {
    // Un solo envío al abrir (React puede montar dos veces en desarrollo): reenviar es una acción de la persona.
    if (pedido.current) return;
    pedido.current = true;
    pedirCodigo();
  }, [pedirCodigo]);

  const verificarDigitos = (digitos: string) => {
    if (digitos.length !== 6 || verificar.isPending || solicitado === null || enviado.current === digitos) return;
    enviado.current = digitos;
    verificar.mutate(digitos);
  };

  const alCambiar = (nuevo: string) => {
    setCodigo(nuevo);
    if (nuevo.length === 6) verificarDigitos(nuevo);
  };

  const alEnviarFormulario = (evento: SubmitEvent) => {
    evento.preventDefault();
    verificarDigitos(codigo);
  };

  const terminado = exigeEmpezarDeNuevo(verificar.error);
  const restantes = intentosRestantesDe(verificar.error);
  const puedeReenviar = terminado || enviar.isError || segundosParaReenviar(pedidoEn, ahora) === 0;
  const error = verificar.error ?? enviar.error;

  return (
    <Box component="form" onSubmit={alEnviarFormulario} noValidate>
      <DialogTitle id="titulo-reautenticacion">{t('reautenticacion.titulo')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>{t('reautenticacion.codigoTexto', { accion })}</Typography>
          {error !== null && (
            <Alert severity="error" role="alert">
              {mensajeDeIngreso(error, t)}
            </Alert>
          )}
          <CampoCodigo
            key={ronda}
            valor={codigo}
            onCambiar={alCambiar}
            deshabilitado={verificar.isPending || terminado}
            error={restantes !== null}
            etiqueta={t('ingreso.codigoCampo')}
            etiquetaDigito={(n) => t('ingreso.codigoDigito', { n: String(n) })}
            enfocarAlMontar
          />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {solicitado === null
              ? t('reautenticacion.enviandoCodigo')
              : `${t('reautenticacion.codigoEnviado', { hora: formatearHora(new Date(solicitado.expira)) })} ${t('reautenticacion.ayuda', { count: minutos })}`}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', ml: -1 }}>
            <Button
              variant="text"
              size="small"
              disabled={enviar.isPending || verificar.isPending || !puedeReenviar}
              onClick={() => enviar.mutate()}
              startIcon={enviar.isPending ? <IconoCarga /> : undefined}
            >
              {puedeReenviar ? t('ingreso.reenviar') : t('ingreso.reenviarEn', { segundos: segundosParaReenviar(pedidoEn, ahora) })}
            </Button>
            {alUsarPasskey && (
              <Button variant="text" size="small" onClick={alUsarPasskey} disabled={verificar.isPending} startIcon={<Fingerprint size={16} aria-hidden />}>
                {t('reautenticacion.confirmar')}
              </Button>
            )}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button variant="text" onClick={alCancelar} disabled={verificar.isPending} sx={{ color: 'text.primary' }}>
          {t('comun.cancelar')}
        </Button>
        <Button type="submit" variant="contained" disabled={codigo.length !== 6 || solicitado === null || verificar.isPending || terminado} startIcon={verificar.isPending ? <IconoCarga /> : undefined}>
          {t('ingreso.verificar')}
        </Button>
      </DialogActions>
    </Box>
  );
}
