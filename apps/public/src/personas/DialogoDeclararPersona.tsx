import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { ArrowRight } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { enlaceParaRegistrarPersona } from '../ficha/legal/personas';
import { mensajeDeError } from '../shared/errores';
import { useAvisos } from '../shared/useAvisos';
import { useDeclararRelacion } from './api';
import { CamposDePersona } from './CamposDePersona';
import { cuerpoDeDeclaracion, DATOS_DE_PERSONA_VACIOS, ROLES, seRegistraEnLaFicha, validarPersona, esRol, type DatosDePersona } from './modelo';

/**
 * Agregar una persona relacionada (ADR-0010). Los errores aparecen al intentar guardar. Si la persona ya tiene bóveda por otra empresa se reutiliza:
 * el servidor la reconoce por su documento. En el celular ocupa toda la pantalla. Aquí solo se declaran los roles que la ficha no maneja (beneficiario
 * final y miembro de consorcio): con un rol de la ficha (representante legal, suplente, socio) el diálogo lleva a la información legal, que es el único
 * lugar donde se registran, con el rol ya elegido.
 */
export function DialogoDeclararPersona({ onCerrar }: { onCerrar: () => void }) {
  const { t } = useTranslation();
  const tema = useTheme();
  const pantallaCompleta = useMediaQuery(tema.breakpoints.down('sm'));
  const mostrar = useAvisos((s) => s.mostrar);
  const declarar = useDeclararRelacion();
  const [datos, setDatos] = useState<DatosDePersona>({ ...DATOS_DE_PERSONA_VACIOS, rol: 'BeneficiarioFinal' });
  const [intentado, setIntentado] = useState(false);
  const errores = validarPersona(datos);
  const cambiar = <K extends keyof DatosDePersona>(campo: K, valor: DatosDePersona[K]) => setDatos((d) => ({ ...d, [campo]: valor }));
  const enLaFicha = seRegistraEnLaFicha(datos.rol);
  const conParticipacion = datos.rol === 'Socio' || datos.rol === 'BeneficiarioFinal' || datos.rol === 'MiembroDe';

  const enviar = (evento: SubmitEvent) => {
    evento.preventDefault();
    if (enLaFicha) return;
    setIntentado(true);
    if (Object.keys(errores).length > 0) return;
    declarar.mutate(cuerpoDeDeclaracion({ ...datos, participacion: conParticipacion ? datos.participacion : '' }), {
      onSuccess: () => {
        mostrar(t('personas.nueva.exito', { nombre: datos.nombre.trim(), rol: t(`personas.roles.${datos.rol}`).toLowerCase() }));
        onCerrar();
      },
    });
  };

  return (
    <Dialog open onClose={declarar.isPending ? undefined : onCerrar} fullWidth maxWidth="sm" fullScreen={pantallaCompleta} aria-labelledby="titulo-nueva-persona">
      <form onSubmit={enviar} noValidate>
        <DialogTitle id="titulo-nueva-persona">{t('personas.nueva.titulo')}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Typography sx={{ color: 'text.secondary' }}>
              {enLaFicha ? t('personas.nueva.enLaFicha', { rol: t(`personas.roles.${datos.rol}`).toLowerCase() }) : t('personas.nueva.ayuda')}
            </Typography>
            {declarar.isError && <Alert severity="error">{mensajeDeError(declarar.error, t)}</Alert>}
            <TextField select label={t('personas.nueva.rol')} value={datos.rol} onChange={(e) => esRol(e.target.value) && cambiar('rol', e.target.value)} required>
              {ROLES.map((rol) => (
                <MenuItem key={rol} value={rol}>
                  {t(`personas.roles.${rol}`)}
                </MenuItem>
              ))}
            </TextField>
            {!enLaFicha && <CamposDePersona datos={datos} errores={errores} intentado={intentado} onCambiar={cambiar} />}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onCerrar} disabled={declarar.isPending}>
            {t('comun.cancelar')}
          </Button>
          {enLaFicha ? (
            <Button component={RouterLink} to={enlaceParaRegistrarPersona(datos.rol)} variant="contained" endIcon={<ArrowRight size={18} aria-hidden />}>
              {t('personas.nueva.irALaFicha')}
            </Button>
          ) : (
            <Button type="submit" variant="contained" disabled={declarar.isPending}>
              {t('personas.nueva.guardar')}
            </Button>
          )}
        </DialogActions>
      </form>
    </Dialog>
  );
}
