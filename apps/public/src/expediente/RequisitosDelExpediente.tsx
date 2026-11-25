import { Box, Stack, Typography } from '@mui/material';
import type { ExpedientePublicoDto } from '@validalo/api-client';
import type { TonoEstado } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { esRequisitoDeSeccion, requisitosPorGrupo, solicitudDeRequisito, type GrupoRequisito } from './requisitos';
import { TarjetaRequisito } from './TarjetaRequisito';
import { TarjetaRequisitoSeccion } from './TarjetaRequisitoSeccion';

const GRUPOS: readonly GrupoRequisito[] = ['te-toca', 'en-revision', 'listo'];

/** El tono del contador de cada grupo: lo que le toca en ámbar, lo que revisa la empresa en «en curso» (como su chip) y lo listo en verde. */
const TONO_DEL_GRUPO: Readonly<Record<GrupoRequisito, TonoEstado>> = { 'te-toca': 'advertencia', 'en-revision': 'encurso', listo: 'exito' };

/** Cuántos requisitos tiene el grupo, en una píldora del color del grupo junto a su título. */
function ConteoDelGrupo({ cantidad, tono }: { cantidad: number; tono: TonoEstado }) {
  return (
    <Typography
      component="span"
      variant="caption"
      sx={(th) => ({
        minWidth: 20,
        px: 0.75,
        borderRadius: `${String(th.radio.pill)}px`,
        textAlign: 'center',
        letterSpacing: 0,
        border: 1,
        borderColor: th.palette.estado[tono].borde,
        bgcolor: th.palette.estado[tono].fondo,
        color: th.palette.estado[tono].texto,
      })}
    >
      {cantidad}
    </Typography>
  );
}

/**
 * Los documentos que pide la empresa, agrupados en «Te toca», «Lo revisa la empresa» y «Listo» (cada título con cuántos hay): cada
 * requisito es una tarjeta propia (`MarcoDeRequisito`), separada de las demás por un hueco, en una columna y, en pantallas anchas, en dos
 * para que la lista no se estire a todo el ancho con la acción perdida a la derecha. Una sección de «Mi información» (F2) se completa o
 * corrige en el wizard, no se sube aquí.
 */
export function RequisitosDelExpediente({ expediente, vinculoId, soloLectura = false }: { expediente: ExpedientePublicoDto; vinculoId: string | null; soloLectura?: boolean }) {
  const { t } = useTranslation();
  const grupos = requisitosPorGrupo(expediente);
  const empresa = expediente.empresa.nombre;

  return (
    <Box component="section" aria-labelledby="titulo-documentos" sx={{ mb: 2 }}>
      <Typography id="titulo-documentos" component="h2" variant="h6" sx={{ mb: 1 }}>
        {t('expediente.documentos.titulo', { empresa })}
      </Typography>
      <Stack spacing={2}>
        {GRUPOS.filter((g) => grupos[g].length > 0).map((grupo) => (
          <Box key={grupo}>
            <Typography variant="overline" component="h3" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary', mb: 1 }}>
              {t(`expediente.documentos.grupos.${grupo}`, { empresa })}
              <ConteoDelGrupo cantidad={grupos[grupo].length} tono={TONO_DEL_GRUPO[grupo]} />
            </Typography>
            <Box
              component="ul"
              sx={{
                p: 0,
                m: 0,
                listStyle: 'none',
                display: 'grid',
                gap: 1.25,
                gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' },
              }}
            >
              {grupos[grupo].map((r) =>
                esRequisitoDeSeccion(r) ? (
                  <TarjetaRequisitoSeccion key={r.id} requisito={r} expediente={expediente} conAccion={!soloLectura} />
                ) : (
                  <TarjetaRequisito key={r.id} requisito={r} expediente={expediente} subida={soloLectura ? null : solicitudDeRequisito(r, vinculoId, expediente.id)} />
                ),
              )}
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
