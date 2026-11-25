import { Box, Chip, Stack, Typography } from '@mui/material';
import { SCOPES, type VinculoDto } from '@validalo/api-client';
import { EstadoVacio, formatearFecha, MarcoTabla } from '@validalo/ui';
import { UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../shared/componentes';
import { usePermisos } from '../../shared/usePermisos';
import { versionVisible } from '../documentos/api';
import { agruparRelaciones, type PersonaDelVinculoAgrupada } from './agrupacion';
import { usePersonasDelVinculo } from './api';
import { textoDelRol } from './modelo';

/** Una persona (con todas sus relaciones juntas): su nombre y su documento, sus roles como chips (con la participación del socio), «Principal» si lo es en alguna y sus documentos una sola vez. */
function FilaDePersona({ persona }: { persona: PersonaDelVinculoAgrupada }) {
  const { t } = useTranslation();
  const etiquetaDelRol = (relacion: PersonaDelVinculoAgrupada['relaciones'][number]) => {
    const rol = textoDelRol(relacion.tipo, t);
    const participacion = relacion.participacion === null ? NaN : Number(relacion.participacion);
    return Number.isFinite(participacion) ? t('personasRelacionadas.rolConParticipacion', { rol, valor: participacion.toLocaleString('es-CO') }) : rol;
  };
  const cargos = [...new Set(persona.relaciones.map((r) => r.cargo).filter((c): c is string => Boolean(c)))];
  return (
    <Box component="li" sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.25, listStyle: 'none' }} aria-label={persona.nombre}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" component="p" sx={{ overflowWrap: 'anywhere' }}>{persona.nombre}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {persona.identificacion.tipo} {persona.identificacion.numero}
            {cargos.length > 0 && ` · ${t('personasRelacionadas.cargo', { cargo: cargos.join(', ') })}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {persona.relaciones.map((relacion) => (
            <Chip key={relacion.relacionId} size="small" variant="outlined" label={etiquetaDelRol(relacion)} />
          ))}
          {persona.principal && <Chip size="small" color="primary" variant="outlined" label={t('personasRelacionadas.principal')} />}
        </Stack>
      </Stack>
      {persona.documentos.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.75 }}>
          {t('personasRelacionadas.sinDocumentos')}
        </Typography>
      ) : (
        <Box component="ul" sx={{ m: 0, mt: 0.75, p: 0, listStyle: 'none' }}>
          {persona.documentos.map((d) => {
            const version = versionVisible(d);
            return (
              <Stack component="li" key={d.documentoId} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.25 }}>
                <Typography component="p" variant="subtitle2">
                  {d.tipo.nombre}
                </Typography>
                {version && (
                  <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                    {t('personasRelacionadas.version', { n: String(version.n), fecha: formatearFecha(version.cargadaEn) })}
                  </Typography>
                )}
                <Chip size="small" variant="outlined" label={t('personasRelacionadas.versionesCompartidas', { count: d.versionesCompartidas.length })} />
              </Stack>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

/**
 * Personas relacionadas del tercero que el flujo de esta empresa involucra (ADR-0010): quién es cada una, cómo se relaciona y los documentos de su bóveda que
 * se compartieron con el vínculo. Es solo lectura; la empresa no ve nada más de la bóveda de la persona. Sin `documentos:leer`, la tarjeta no aparece.
 */
export function TarjetaPersonasRelacionadas({ vinculo, empresaId }: { vinculo: VinculoDto; empresaId: string }) {
  const { t } = useTranslation();
  const permisos = usePermisos(empresaId);
  const puede = permisos.puede(SCOPES.documentosLeer) && Boolean(vinculo.invitacionAceptadaEn);
  const consulta = usePersonasDelVinculo(empresaId, vinculo.id, puede);
  if (!puede || consulta.isPending || consulta.isError) return null;

  return (
    <Tarjeta titulo={t('personasRelacionadas.titulo')}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1 }}>
        {t('personasRelacionadas.ayuda')}
      </Typography>
      {consulta.data.length === 0 ? (
        <MarcoTabla>
          <EstadoVacio compacto icono={UsersRound} titulo={t('personasRelacionadas.vacio')} texto={t('personasRelacionadas.vacioAyuda')} />
        </MarcoTabla>
      ) : (
        <Stack component="ul" spacing={1} sx={{ m: 0, p: 0 }}>
          {agruparRelaciones(consulta.data).map((p) => (
            <FilaDePersona key={p.relaciones.map((r) => r.relacionId).join('-')} persona={p} />
          ))}
        </Stack>
      )}
    </Tarjeta>
  );
}
