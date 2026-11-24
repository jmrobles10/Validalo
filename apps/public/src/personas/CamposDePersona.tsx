import { Checkbox, FormControlLabel, MenuItem, Stack, TextField } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { TIPOS_DE_DOCUMENTO, type CampoDePersona, type DatosDePersona, type TipoDeDocumento } from './modelo';

const esTipoDeDocumento = (valor: string): valor is TipoDeDocumento => (TIPOS_DE_DOCUMENTO as readonly string[]).includes(valor);

interface Props {
  datos: DatosDePersona;
  /** Los errores se muestran solo después de intentar guardar. */
  errores: Partial<Record<CampoDePersona, true>>;
  intentado: boolean;
  onCambiar: <K extends keyof DatosDePersona>(campo: K, valor: DatosDePersona[K]) => void;
}

/** Los datos de la persona que se declara en Personas (beneficiario final o miembro de consorcio): nombre, documento, participación, cargo y si es la principal. */
export function CamposDePersona({ datos, errores, intentado, onCambiar }: Props) {
  const { t } = useTranslation();
  const conParticipacion = datos.rol === 'Socio' || datos.rol === 'BeneficiarioFinal' || datos.rol === 'MiembroDe';
  return (
    <>
      <TextField
        label={t('personas.nueva.nombre')}
        value={datos.nombre}
        onChange={(e) => onCambiar('nombre', e.target.value)}
        required
        error={intentado && errores.nombre === true}
        helperText={intentado && errores.nombre ? t('personas.nueva.errores.nombre') : undefined}
        slotProps={{ htmlInput: { maxLength: 250, autoComplete: 'off' } }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label={t('personas.nueva.tipoIdentificacion')}
          value={datos.tipoDocumento}
          onChange={(e) => esTipoDeDocumento(e.target.value) && onCambiar('tipoDocumento', e.target.value)}
          required
          sx={{ minWidth: { sm: 240 } }}
        >
          {TIPOS_DE_DOCUMENTO.map((tipo) => (
            <MenuItem key={tipo} value={tipo}>
              {t(`personas.nueva.tipos.${tipo}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label={t('personas.nueva.numero')}
          value={datos.numero}
          onChange={(e) => onCambiar('numero', e.target.value)}
          required
          fullWidth
          error={intentado && errores.numero === true}
          helperText={intentado && errores.numero ? t('personas.nueva.errores.numero') : undefined}
          slotProps={{ htmlInput: { inputMode: 'text', autoComplete: 'off', maxLength: 30 } }}
        />
      </Stack>
      {conParticipacion && (
        <TextField
          label={t('personas.nueva.participacion')}
          value={datos.participacion}
          onChange={(e) => onCambiar('participacion', e.target.value)}
          error={intentado && errores.participacion === true}
          helperText={intentado && errores.participacion ? t('personas.nueva.errores.participacion') : t('personas.nueva.participacionAyuda')}
          slotProps={{ htmlInput: { inputMode: 'decimal', autoComplete: 'off', maxLength: 8 } }}
        />
      )}
      <TextField
        label={t('personas.nueva.cargo')}
        value={datos.cargo}
        onChange={(e) => onCambiar('cargo', e.target.value)}
        slotProps={{ htmlInput: { maxLength: 150, autoComplete: 'off' } }}
      />
      <FormControlLabel
        control={<Checkbox checked={datos.principal} onChange={(e) => onCambiar('principal', e.target.checked)} />}
        label={t('personas.nueva.principal')}
      />
    </>
  );
}
