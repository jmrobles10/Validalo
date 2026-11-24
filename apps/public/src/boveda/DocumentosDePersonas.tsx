import { Box, Link, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { useRelaciones } from '../personas/api';
import { FilaDeDocumento } from '../personas/FilaDeDocumento';
import { esRol, personasConDocumentosCargados } from '../personas/modelo';
import { useSesionTercero } from '../sesion/sesionTercero';

/**
 * «De tus personas relacionadas», debajo de los documentos de «Mi bóveda»: la cédula de un representante legal vive en la bóveda de la persona
 * (ADR-0010), no en la del tercero, y sin esto el tercero cree que no la subió. Cada persona con sus roles y lo que ya tiene cargado (versión,
 * fecha y estado) con la acción de subir otra versión, que abre el diálogo de subida. No aparece sin personas ni documentos cargados, ni con acceso
 * aislado (que no alcanza este grupo), ni mientras carga o si la consulta falla: «Mi bóveda» no depende de ella.
 */
export function DocumentosDePersonas() {
  const { t } = useTranslation();
  const completa = useSesionTercero((s) => s.estado === 'activa' && s.sesion?.aislada !== true);
  const consulta = useRelaciones(completa);
  const personas = consulta.data ? personasConDocumentosCargados(consulta.data) : [];
  if (!completa || personas.length === 0) return null;

  return (
    <Box component="section" aria-labelledby="boveda-personas" sx={{ mt: 4 }}>
      <Typography id="boveda-personas" component="h2" variant="h6">
        {t('boveda.personas.titulo')}
      </Typography>
      <Typography sx={{ color: 'text.secondary', mb: 1 }}>
        {t('boveda.personas.sub')}{' '}
        <Link component={RouterLink} to="/personas">
          {t('boveda.personas.ver')}
        </Link>
      </Typography>
      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {personas.map((persona) => (
          <Box key={persona.personaId} component="li" sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}>
            <Typography component="h3" variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
              {persona.nombre}
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
              {persona.roles.map((rol) => (esRol(rol) ? t(`personas.roles.${rol}`) : rol)).join(' · ')}
            </Typography>
            <Stack component="ul" aria-label={t('personas.documentos.titulo', { nombre: persona.nombre })} sx={{ listStyle: 'none', m: 0, mt: 0.5, p: 0 }}>
              {persona.documentos.map((documento) => (
                <FilaDeDocumento key={documento.tipoCanonico} documento={documento} personaId={persona.personaId} />
              ))}
            </Stack>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
