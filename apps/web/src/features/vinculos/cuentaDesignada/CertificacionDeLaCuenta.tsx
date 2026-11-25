import { Alert, Box, Button, Collapse, Stack, Typography } from '@mui/material';
import type { CuentaDesignadaDto } from '@validalo/api-client';
import { formatearFecha } from '@validalo/ui';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TablaCruce } from '../../expedientes/components/CruceSeccion';
import { IconoDelResumen } from '../../expedientes/components/IconoDelResumen';
import { debeAbrirLaComparacion, resumirCertificacion, textoDeCertificacion, tonoDeCertificacion } from './modelo';

/**
 * La certificación bancaria de la cuenta, junto a ella, para quien la aprueba (CB-1): una línea que dice qué versión recibió la empresa y qué concluyó la lectura frente a
 * lo declarado por el tercero («Coincide: número y titular · Sin verificar: identificación»). La comparación campo por campo está a un clic, y se abre sola si un
 * campo crítico no coincide: es evidencia para decidir, nada se bloquea solo. Sin certificación propia (una cuenta designada antes de este cambio), el aviso de que no hay
 * con qué cotejarla.
 */
export function CertificacionDeLaCuenta({ cuenta }: { cuenta: CuentaDesignadaDto }) {
  const { t } = useTranslation();
  // Lo que la persona eligió; mientras no elija, la comparación va abierta solo si hay una discrepancia crítica.
  const [elegida, setElegida] = useState<boolean | null>(null);
  const certificacion = cuenta.certificacion ?? null;
  if (!certificacion) {
    return cuenta.sinCertificacion ? <Alert severity="warning">{t('cuentas.certificacion.sin')}</Alert> : null;
  }

  const resumen = resumirCertificacion(certificacion);
  const tono = tonoDeCertificacion(resumen);
  const cruce = certificacion.cruce;
  const abierta = elegida ?? debeAbrirLaComparacion(resumen);
  const linea = t('cuentas.certificacion.linea', {
    n: String(certificacion.version),
    fecha: formatearFecha(certificacion.cargadaEn),
    resumen: textoDeCertificacion(resumen, t),
  });

  return (
    <Box component="section" aria-label={t('cuentas.certificacion.titulo')}>
      {/* Ícono, frase y botón centrados en la misma fila; si la frase ocupa dos líneas, el botón se centra frente al bloque; en pantallas angostas el botón baja debajo de la frase. */}
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <IconoDelResumen tono={tono} />
        <Typography variant="body2" role={tono === 'error' ? 'alert' : undefined} sx={{ flex: '1 1 14rem', minWidth: 0 }}>
          {linea}
        </Typography>
        {cruce && (
          <Button
            variant="text"
            sx={{ flex: 'none' }}
            aria-expanded={abierta}
            onClick={() => setElegida(!abierta)}
            endIcon={<ChevronDown size={16} aria-hidden style={{ transform: abierta ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />}
          >
            {abierta ? t('cuentas.certificacion.ocultarComparacion') : t('cuentas.certificacion.verComparacion')}
          </Button>
        )}
      </Stack>
      {cruce && (
        <Collapse in={abierta} unmountOnExit>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <TablaCruce cruce={cruce} />
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {t('cruce.evidencia')}
            </Typography>
          </Stack>
        </Collapse>
      )}
    </Box>
  );
}
