import { Box, Button, Collapse, Stack, Typography } from '@mui/material';
import type { RequisitoExpedienteDto } from '@validalo/api-client';
import type { TonoEstado } from '@validalo/ui';
import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { agruparRequisitos, esFilaCompacta, GRUPOS_DE_REQUISITOS, GRUPOS_RESUELTOS, type GrupoDeRequisitos } from '../requisitosAgrupados';

/**
 * El tono de la píldora de cada grupo: lo que decide la empresa en «en curso» (el color con el que se ven esas tarjetas), lo observado en ámbar, lo que toca al tercero en gris y lo
 * resuelto en verde o gris.
 */
const TONO: Readonly<Record<GrupoDeRequisitos, TonoEstado>> = { porRevisar: 'encurso', observados: 'advertencia', leTocaAlTercero: 'neutro', aprobados: 'exito', eximidos: 'neutro' };

/** Lo que va a dos columnas desde `lg`: las tarjetas compactas (lo pendiente del tercero y lo eximido); las que traen revisión, áreas y acciones llevan todo el ancho. */
const DOS_COLUMNAS: readonly GrupoDeRequisitos[] = ['leTocaAlTercero', 'eximidos'];

/** Cuántos requisitos tiene el grupo, en una píldora del color del grupo junto a su título. */
function Conteo({ cantidad, tono }: { cantidad: number; tono: TonoEstado }) {
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

interface Props {
  requisitos: readonly RequisitoExpedienteDto[];
  /** La tarjeta completa de un requisito (con lo que decide la empresa). */
  tarjeta: (requisito: RequisitoExpedienteDto) => ReactNode;
  /** La tarjeta compacta de un requisito que solo espera al tercero. */
  tarjetaPendiente: (requisito: RequisitoExpedienteDto) => ReactNode;
}

/**
 * Los requisitos agrupados por situación, cada grupo con su título y cuántos tiene en una píldora de su tono (los vacíos no se muestran), como en el portal del tercero:
 * «Por revisar» primero, luego «Observados», «Le toca al tercero» (tarjetas compactas, a dos columnas desde `lg`) y, al final, «Aprobados» y «Eximidos», plegados mientras haya
 * algo más que atender. Cada requisito es una tarjeta propia, separada de las demás por un hueco.
 */
export function GruposDeRequisitos({ requisitos, tarjeta, tarjetaPendiente }: Props) {
  const grupos = agruparRequisitos(requisitos);
  const visibles = GRUPOS_DE_REQUISITOS.filter((g) => grupos[g].length > 0);
  const hayQueAtender = visibles.some((g) => !GRUPOS_RESUELTOS.includes(g));
  return (
    <Stack spacing={2.5}>
      {visibles.map((grupo) => (
        <Grupo
          key={grupo}
          grupo={grupo}
          requisitos={grupos[grupo]}
          plegable={GRUPOS_RESUELTOS.includes(grupo) && hayQueAtender}
          tarjeta={tarjeta}
          tarjetaPendiente={tarjetaPendiente}
        />
      ))}
    </Stack>
  );
}

function Grupo({ grupo, requisitos, plegable, tarjeta, tarjetaPendiente }: Props & { grupo: GrupoDeRequisitos; plegable: boolean }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);
  const id = useId();
  const titulo = t(`expedientes.requisitos.grupos.${grupo}`);
  const lista = (
    <Box
      component="ul"
      id={id}
      sx={{
        p: 0,
        m: 0,
        listStyle: 'none',
        display: 'grid',
        gap: 1.25,
        gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: DOS_COLUMNAS.includes(grupo) ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)' },
      }}
    >
      {requisitos.map((r) => (grupo === 'leTocaAlTercero' && esFilaCompacta(r) ? tarjetaPendiente(r) : tarjeta(r)))}
    </Box>
  );
  return (
    <Box component="section" aria-label={titulo}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', mb: 1, minHeight: 28 }}>
        <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
          {titulo}
        </Typography>
        <Conteo cantidad={requisitos.length} tono={TONO[grupo]} />
        {plegable && (
          <Button
            variant="text"
            aria-expanded={abierto}
            aria-controls={id}
            onClick={() => setAbierto((v) => !v)}
            endIcon={<ChevronDown size={16} aria-hidden style={{ transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform 150ms' }} />}
            sx={{ ml: 'auto', color: 'text.secondary' }}
          >
            {abierto ? t('expedientes.requisitos.ocultarGrupo') : t('expedientes.requisitos.mostrarGrupo')}
          </Button>
        )}
      </Stack>
      {plegable ? <Collapse in={abierto} unmountOnExit>{lista}</Collapse> : lista}
    </Box>
  );
}
