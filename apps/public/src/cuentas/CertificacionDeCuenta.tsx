import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import type { CertificacionDeCuentaDto, CuentaBancariaPublicaDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, type Estado } from '@validalo/ui';
import { FileUp, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { camposQueNoCoinciden, camposSinVerificar, esActiva, verificacionDe, type VerificacionDeCertificacion } from './cuentas';
import { DialogoCertificacion } from './DialogoCertificacion';

/** El estado del chip y el tono de cada resultado de la lectura. */
const ESTADO_DEL_CHIP: Record<VerificacionDeCertificacion, Estado> = {
  SinAnalisis: 'Pendiente',
  Coincide: 'Aprobado',
  Discrepa: 'Rechazado',
  NoVerificable: 'Observado',
  NoSeLee: 'Observado',
  Devuelta: 'Devuelta',
};

/**
 * La certificación bancaria de una cuenta en su tarjeta (CB-1): cuál es (versión y fecha), qué leyó la IA frente a lo que declaraste y qué hacer si no coincide, con
 * «Reemplazar». Sin certificación, el aviso de que falta y «Subir certificación»: sin ella la cuenta no se designa con ninguna empresa.
 */
export function CertificacionDeCuenta({ cuenta }: { cuenta: CuentaBancariaPublicaDto }) {
  const { t } = useTranslation();
  const [subiendo, setSubiendo] = useState(false);
  const certificacion = cuenta.certificacion ?? null;
  if (!esActiva(cuenta) && !certificacion) return null;

  const falta = cuenta.faltaCertificacion;
  return (
    <Box component="section" aria-label={t('cuentas.certificacion.titulo')} sx={{ mt: 0.75, pl: { sm: 6 } }}>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', columnGap: 1, rowGap: 0.5 }}>
        <Typography variant="subtitle2" component="h3">
          {t('cuentas.certificacion.titulo')}
        </Typography>
        {certificacion && !falta && <Resultado certificacion={certificacion} />}
        {falta && <ChipEstado estado="Pendiente" etiqueta={t('cuentas.certificacion.chip.Falta')} />}
        {esActiva(cuenta) && (
          <Button
            variant="text"
            size="small"
            onClick={() => setSubiendo(true)}
            startIcon={falta ? <FileUp size={16} aria-hidden /> : <RefreshCw size={16} aria-hidden />}
            aria-label={`${falta ? t('cuentas.certificacion.subir') : t('cuentas.certificacion.reemplazar')}: ${cuenta.banco} ${cuenta.numeroEnmascarado}`}
            sx={{ ml: { sm: 'auto' } }}
          >
            {falta ? t('cuentas.certificacion.subir') : t('cuentas.certificacion.reemplazar')}
          </Button>
        )}
      </Stack>
      {falta && !certificacion && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('cuentas.certificacion.faltaAyuda')}
        </Typography>
      )}
      {certificacion && <Detalle certificacion={certificacion} />}
      {subiendo && <DialogoCertificacion cuenta={cuenta} reemplaza={!falta} onCerrar={() => setSubiendo(false)} />}
    </Box>
  );
}

function Resultado({ certificacion }: { certificacion: CertificacionDeCuentaDto }) {
  const { t } = useTranslation();
  const verificacion = verificacionDe(certificacion);
  return <ChipEstado estado={ESTADO_DEL_CHIP[verificacion]} etiqueta={t(`cuentas.certificacion.chip.${verificacion}`)} />;
}

/** Versión y fecha, lo que dice la lectura y el siguiente paso cuando algo no coincide, no se lee o se devolvió. */
function Detalle({ certificacion }: { certificacion: CertificacionDeCuentaDto }) {
  const { t } = useTranslation();
  const verificacion = verificacionDe(certificacion);
  const sinCoincidir = camposQueNoCoinciden(certificacion);
  const sinVerificar = camposSinVerificar(certificacion);
  const vacio = t('cuentas.certificacion.sinDato');
  const diferencias = sinCoincidir.map((c) => t('cuentas.certificacion.diferencia', { etiqueta: c.etiqueta, declarado: c.declarado ?? vacio, extraido: c.extraido ?? vacio }));
  const texto =
    verificacion === 'Devuelta'
      ? t('cuentas.certificacion.verificacion.Devuelta', { motivo: certificacion.motivoDevolucion ?? '' })
      : verificacion === 'Discrepa'
        ? t('cuentas.certificacion.verificacion.Discrepa', { campos: sinCoincidir.map((c) => c.etiqueta).join(', ') })
        : verificacion === 'NoVerificable'
          ? t('cuentas.certificacion.verificacion.NoVerificable', { campos: sinVerificar.map((c) => c.etiqueta).join(', ') })
          : t(`cuentas.certificacion.verificacion.${verificacion}`);
  const hayProblema = verificacion === 'Discrepa' || verificacion === 'NoVerificable' || verificacion === 'NoSeLee' || verificacion === 'Devuelta';

  return (
    <Stack spacing={0.5} sx={{ mt: 0.25 }}>
      {certificacion.estado !== 'Devuelta' && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('cuentas.certificacion.version', { n: String(certificacion.version), fecha: formatearFecha(certificacion.cargadaEn) })}
        </Typography>
      )}
      {hayProblema ? (
        <Alert severity={certificacion.discrepanciaCritica || verificacion === 'Devuelta' ? 'error' : 'warning'}>
          <Typography variant="body2" component="p">
            {texto}
          </Typography>
          {diferencias.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {diferencias.map((d) => (
                <Typography key={d} variant="body2" component="li">
                  {d}
                </Typography>
              ))}
            </Box>
          )}
          <Typography variant="body2" component="p" sx={{ mt: 0.5 }}>
            {t(`cuentas.certificacion.siguientePaso.${verificacion === 'Discrepa' || verificacion === 'NoVerificable' || verificacion === 'NoSeLee' ? verificacion : 'Devuelta'}`)}
          </Typography>
        </Alert>
      ) : (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {texto}
        </Typography>
      )}
    </Stack>
  );
}
