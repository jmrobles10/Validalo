import { Button, Stack, Typography } from '@mui/material';
import type { CuentaDesignadaDto } from '@validalo/api-client';
import { formatearFecha } from '@validalo/ui';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CertificacionDeLaCuenta } from './CertificacionDeLaCuenta';
import { DatosCuenta, EncabezadoCuenta, SeccionCuenta } from './DatosCuenta';
import { nombresDe } from './modelo';

interface PropuestaCuentaProps {
  cuenta: CuentaDesignadaDto;
  aprobadoresRequeridos: number;
  /** Hay una cuenta designada que sigue vigente mientras se aprueba esta. */
  hayDesignada: boolean;
  /** `cuentas:aprobar` y la API dice que esta persona aún puede aprobar (no lo ha hecho). */
  puedeAprobar: boolean;
  /** Tiene el permiso pero ya aprobó: falta otra persona. */
  yaAprobo: boolean;
  ocupado: boolean;
  onAprobar: () => void;
  onRechazar: () => void;
}

/**
 * Cuenta que propuso el tercero, para decidir si coincide con su certificación: el estado y cuándo la propuso, sus datos, la certificación en una línea y, en una sola fila,
 * las acciones de quien puede aprobar junto a cuántas aprobaciones lleva (el porqué de las dos personas va en el `title`).
 */
export function PropuestaCuenta({ cuenta, aprobadoresRequeridos, hayDesignada, puedeAprobar, yaAprobo, ocupado, onAprobar, onRechazar }: PropuestaCuentaProps) {
  const { t } = useTranslation();
  const n = String(cuenta.aprobaciones.length);
  const total = String(aprobadoresRequeridos);
  const van = cuenta.aprobaciones.length > 0 ? t('cuentas.vanConNombres', { n, nombres: nombresDe(cuenta.aprobaciones, t) }) : t('cuentas.van', { n });
  const progreso = `${t('cuentas.necesita', { count: aprobadoresRequeridos })} · ${van}`;

  return (
    <SeccionCuenta
      titulo={t('cuentas.secciones.porAprobar')}
      encabezado={<EncabezadoCuenta cuenta={cuenta} etiqueta={t('cuentas.secciones.porAprobar')} nota={t('cuentas.propuestaEl', { fecha: formatearFecha(cuenta.propuestaEn) })} />}
    >
      <DatosCuenta cuenta={cuenta} />
      <CertificacionDeLaCuenta cuenta={cuenta} />
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {puedeAprobar && (
          <>
            <Button variant="contained" startIcon={<Check size={16} aria-hidden />} disabled={ocupado} onClick={onAprobar}>
              {t('cuentas.aprobar')}
            </Button>
            <Button variant="text" color="error" startIcon={<X size={16} aria-hidden />} disabled={ocupado} onClick={onRechazar} sx={{ color: 'estado.error.texto' }}>
              {t('cuentas.rechazar')}
            </Button>
          </>
        )}
        <Typography variant="body2" title={t(hayDesignada ? 'cuentas.cuatroOjos' : 'cuentas.cuatroOjosSinAnterior', { total })} sx={{ color: 'text.secondary', px: puedeAprobar ? 0.5 : 0 }}>
          {progreso}
        </Typography>
        {yaAprobo && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('cuentas.yaAprobaste')}
          </Typography>
        )}
      </Stack>
    </SeccionCuenta>
  );
}
