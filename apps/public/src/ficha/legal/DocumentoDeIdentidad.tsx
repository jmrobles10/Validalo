import { Box, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useRelaciones } from '../../personas/api';
import { FilaDeDocumento } from '../../personas/FilaDeDocumento';
import { esVigente } from '../../personas/modelo';
import { useSesionTercero } from '../../sesion/sesionTercero';
import type { PersonaRelacionada, RolPersona } from '../tipos';
import { esRelacionDe, esSociedad, ROLES_CON_BOVEDA, tipoCanonicoDeIdentidad } from './personas';

/**
 * El documento de identidad de una persona de la información legal, en su tarjeta. Es el de su bóveda (ADR-0010): el mismo que piden los requisitos por
 * persona de los expedientes («Fotocopia de la cédula del representante legal»), así que subirlo aquí lo da por cargado allá. Se sube con el diálogo de
 * subida de siempre (`FilaDeDocumento`: la persona y el tipo ya vienen en la solicitud). Es UN documento por persona aunque tenga dos roles (la relación
 * de representante y la de socio comparten bóveda). Antes de guardar la sección la persona aún no existe como relación: se dice cuándo se podrá subir.
 * No aparece para un rol que no es una relación (apoderado, junta directiva, revisor fiscal, contador), para una sociedad ni con acceso aislado.
 */
export function DocumentoDeIdentidad({ persona, roles }: { persona: PersonaRelacionada; roles: readonly RolPersona[] }) {
  const { t } = useTranslation();
  const completa = useSesionTercero((s) => s.sesion?.aislada !== true);
  const { data } = useRelaciones(completa);
  const aplica = completa && Boolean(persona.numero?.trim()) && !esSociedad(persona.tipo_identificacion, persona.numero) && roles.some((rol) => ROLES_CON_BOVEDA.includes(rol));
  if (!aplica || data === undefined) return null;

  const relacion = data.find((r) => esVigente(r) && esRelacionDe(r, persona));
  const documento = relacion?.documentos.find((d) => d.tipoCanonico === tipoCanonicoDeIdentidad(persona.tipo_identificacion));

  return (
    <Box sx={{ mt: 1, pt: 1, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
        {t('ficha.legal.documentoIdentidad.titulo')}
      </Typography>
      {relacion && documento ? (
        <Stack component="ul" aria-label={t('ficha.legal.documentoIdentidad.titulo')} sx={{ listStyle: 'none', m: 0, p: 0 }}>
          <FilaDeDocumento documento={documento} personaId={relacion.personaId} />
        </Stack>
      ) : (
        <Typography sx={{ color: 'text.secondary' }}>{t('ficha.legal.documentoIdentidad.despues')}</Typography>
      )}
    </Box>
  );
}
