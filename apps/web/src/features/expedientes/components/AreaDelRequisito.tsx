import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { SCOPES, type AreaDeRequisitoDto, type AreaExpedienteDto, type ExpedienteDto, type RequisitoExpedienteDto } from '@validalo/api-client';
import { ChipEstado } from '@validalo/ui';
import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { etiquetaDeRuta } from '../../terceros/ficha/secciones';
import type { ContextoRevisor, DialogoExpediente } from '../reglas';
import { bloqueoRequisito, veredictosInvalidados, veredictosRevertidos, veredictosVigentesDeRequisito, type BloqueoRequisito } from '../requisitos';

/** Bloqueos que se explican a quien revisa (los demás no dicen nada útil: sin permiso, cerrado). */
const BLOQUEOS_EXPLICADOS = ['expediente-en-carga', 'expediente-observado', 'vinculo-bloqueado', 'sin-version', 'area-esperando', 'no-es-miembro', 'ya-voto'] as const;
type BloqueoExplicado = (typeof BLOQUEOS_EXPLICADOS)[number];

function seExplica(bloqueo: BloqueoRequisito | null): bloqueo is BloqueoExplicado {
  return (BLOQUEOS_EXPLICADOS as readonly string[]).includes(bloqueo ?? '');
}

export interface AreasDelRequisitoProps {
  expediente: ExpedienteDto;
  requisito: RequisitoExpedienteDto;
  areas: ReadonlyMap<string, AreaExpedienteDto>;
  contexto: (area: AreaExpedienteDto | null) => ContextoRevisor;
  nombres: ReadonlyMap<string, string>;
  onAccion: (dialogo: DialogoExpediente) => void;
  /** Muestra «Aprobar u observar» por documento (acción secundaria; la principal es la decisión del área). */
  decidirPorDocumento: boolean;
}

/**
 * Las áreas que revisan el requisito, en una grilla que las pone de a varias por fila: cada una con su nombre, su estado y sus aprobaciones
 * («Acceso Total · En espera · 0 de 1»). Un área con veredictos, una explicación o «Aprobar u observar» ocupa la fila completa para que
 * su detalle tenga espacio.
 */
export function AreasDelRequisito({ areas, ...resto }: AreasDelRequisitoProps) {
  const { requisito } = resto;
  return (
    <Box
      component="ul"
      sx={{ p: 0, m: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 17rem), 1fr))', columnGap: 3, rowGap: 0.75 }}
    >
      {requisito.areas.map((areaRequisito) => (
        <AreaDelRequisito key={areaRequisito.areaId} {...resto} areaRequisito={areaRequisito} area={areas.get(areaRequisito.areaId) ?? null} />
      ))}
    </Box>
  );
}

function AreaDelRequisito({
  expediente,
  requisito,
  areaRequisito,
  area,
  contexto,
  nombres,
  onAccion,
  decidirPorDocumento,
}: Omit<AreasDelRequisitoProps, 'areas'> & {
  areaRequisito: AreaDeRequisitoDto;
  area: AreaExpedienteDto | null;
}) {
  const { t } = useTranslation();
  const ctx = contexto(area);
  const nombreArea = area?.nombre ?? areaRequisito.codigo;
  const bloqueo = bloqueoRequisito(expediente, requisito, areaRequisito, ctx);
  const explicar = decidirPorDocumento && seExplica(bloqueo) && ctx.scopes.has(SCOPES.expedientesRevisar) ? bloqueo : null;
  const nombre = (id: string | null | undefined) =>
    id && id === ctx.usuarioId ? t('expedientes.veredictos.tu') : ((id && nombres.get(id)) ?? t('expedientes.requisitos.persona'));
  // Quién decidió: el sistema (área automática o aprobación que la empresa ya dio en otro expediente, RQ-11), el
  // administrador en nombre del área o la persona. Antes un veredicto del sistema aparecía como «Persona del área».
  const autor = (v: { origen: string; usuario?: string | null }) =>
    v.origen === 'Sistema'
      ? t('expedientes.veredictos.sistema')
      : !v.usuario && v.origen === 'Administrador'
        ? t('expedientes.veredictos.administrador')
        : nombre(v.usuario);
  const vigentes = veredictosVigentesDeRequisito(areaRequisito);
  const invalidados = veredictosInvalidados(areaRequisito);
  const revertidos = veredictosRevertidos(areaRequisito);
  const conDecision = bloqueo === null && decidirPorDocumento;
  const ancha = conDecision || explicar !== null || vigentes.length + invalidados.length + revertidos.length > 0;

  return (
    <Box component="li" sx={{ listStyle: 'none', minWidth: 0, ...(ancha && { gridColumn: '1 / -1' }) }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" component="p">{nombreArea}</Typography>
        {areaRequisito.estado === 'Esperando' ? (
          <Chip size="small" variant="outlined" icon={<Clock size={14} aria-hidden />} label={t('expedientes.requisitos.areaEsperando')} sx={{ color: 'text.secondary' }} />
        ) : (
          <ChipEstado estado={areaRequisito.estado} />
        )}
        <Typography component="span" variant="monoTabla" sx={{ color: 'text.secondary' }}>
          {t('bandeja.aprobaciones', { aprobaciones: String(areaRequisito.aprobaciones), requeridas: String(areaRequisito.aprobadoresRequeridos) })}
        </Typography>
        {conDecision && (
          <Button
            size="small"
            variant="contained"
            onClick={() => onAccion({ tipo: 'veredictoRequisito', requisito, areaRequisito, nombreArea })}
            aria-label={t('expedientes.requisitos.decidirAccesible', { documento: requisito.tipoDocumento.nombre, area: nombreArea })}
            sx={{ ml: 'auto' }}
          >
            {t('expedientes.requisitos.decidir')}
          </Button>
        )}
      </Stack>
      {vigentes.map((v) => (
        <Typography key={v.id} sx={{ mt: 0.5 }}>
          {autor(v)} · {t(`expedientes.veredictos.${v.veredicto}`).toLowerCase()} · {t('expedientes.requisitos.sobreVersion', { n: String(v.sobreVersion ?? '—') })}
          {v.observacion ? ` · “${v.observacion}”` : ''}
          {v.justificacion ? ` · ${v.justificacion}` : ''}
          {v.campos?.length ? ` · ${t('fichaEmpresa.requisito.campos', { campos: v.campos.map((c) => etiquetaDeRuta(c, t)).join(', ') })}` : ''}
        </Typography>
      ))}
      {invalidados.map((v) => (
        <Typography variant="caption" component="p" key={v.id} sx={{ color: 'text.secondary', mt: 0.5, textDecoration: 'line-through' }}>
          {autor(v)} · {t(`expedientes.veredictos.${v.veredicto}`).toLowerCase()} · {t('expedientes.requisitos.invalidado', { n: String(v.sobreVersion ?? '—') })}
        </Typography>
      ))}
      {revertidos.map((v) => (
        <Typography variant="caption" component="p" key={v.id} sx={{ color: 'text.secondary', mt: 0.5, textDecoration: 'line-through' }}>
          {autor(v)} · {t(`expedientes.veredictos.${v.veredicto}`).toLowerCase()} · {t('expedientes.requisitos.revertido')}
        </Typography>
      ))}
      {explicar && (
        <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {t(`expedientes.requisitos.bloqueos.${explicar}`)}
        </Typography>
      )}
    </Box>
  );
}
