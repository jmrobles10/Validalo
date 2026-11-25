import { Box, Button, Typography } from '@mui/material';
import { CircleDashed, Plus } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { focoVisible } from './estiloDeFilas';
import { contarRequisitos, nombreDelSector, POR_COMPLETAR, textoDelConteo, type GrupoDeSector as Grupo } from '../requisitosPorSector';
import { ICONO_SECTOR } from '../../vinculos/ficha/sectores';

export interface GrupoDeSectorProps {
  grupo: Grupo;
  /** Las filas del grupo, la sección primero y después los documentos. */
  children: ReactNode;
  /** «Agregar documento a {sector}»; sin él (solo lectura) el grupo no ofrece agregar. */
  onAgregar?: () => void;
}

/**
 * Los requisitos de un sector de la ficha: un encabezado con el ícono y el nombre del sector (los del menú lateral) y cuántos documentos y
 * secciones tiene, y debajo sus filas separadas por líneas finas. Al pie, un «Agregar documento a …» discreto. «Por completar» (el documento nuevo sin tipo)
 * lleva en su lugar la indicación de elegir el tipo.
 */
export function GrupoDeSector({ grupo, children, onAgregar }: GrupoDeSectorProps) {
  const { t } = useTranslation();
  const idTitulo = useId();
  const nombre = nombreDelSector(grupo.sector, t);
  const Icono = grupo.sector === POR_COMPLETAR ? CircleDashed : ICONO_SECTOR[grupo.sector];
  return (
    <Box role="group" aria-labelledby={idTitulo} sx={(th) => ({ border: 1, borderColor: 'divider', borderRadius: `${String(th.radio.sm)}px`, overflow: 'hidden', minWidth: 0 })}>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1.25, rowGap: 0.25, px: 1.75, py: 1, bgcolor: 'superficie.nivel2', borderBottom: 1, borderColor: 'divider' }}>
        <Box aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: (th) => th.palette.acento.main }}>
          <Icono size={16} strokeWidth={1.75} />
        </Box>
        <Typography id={idTitulo} variant="subtitle2" component="h3">
          {nombre}
        </Typography>
        <Typography variant="caption" component="span" sx={{ color: 'text.secondary' }}>
          {[textoDelConteo(contarRequisitos([...grupo.secciones, ...grupo.documentos].map((e) => e.requisito)), t), grupo.sector === POR_COMPLETAR ? t('flujoRequisitos.porCompletarAyuda') : '']
            .filter(Boolean)
            .join(' · ')}
        </Typography>
      </Box>
      <Box component="ul" sx={{ m: 0, p: 0, listStyle: 'none', '& > li + li': { borderTop: 1, borderColor: 'divider' } }}>
        {children}
      </Box>
      {onAgregar && (
        <Box sx={{ borderTop: 1, borderColor: 'divider', px: 1, py: 0.5 }}>
          <Button variant="text" size="small" startIcon={<Plus size={14} aria-hidden />} onClick={onAgregar} sx={(th) => ({ color: 'text.secondary', height: 'auto', py: 0.5, textAlign: 'left', whiteSpace: 'normal', justifyContent: 'flex-start', ...focoVisible(th) })}>
            {t('flujoRequisitos.agregarAlSector', { sector: nombre })}
          </Button>
        </Box>
      )}
    </Box>
  );
}
