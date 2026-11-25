import { alpha, Box, ButtonBase, Chip, IconButton, Tooltip, Typography } from '@mui/material';
import { ChevronDown, ChevronUp, CircleAlert, ClipboardList, FileText, Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { nombreSeccion, seccionFicha } from '../../terceros/ficha/secciones';
import { resumenDelRequisito } from '../resumenDelRequisito';
import type { SectorEnVista } from '../requisitosPorSector';
import { ChipDeCondicion } from './ChipDeCondicion';
import { CHIP_QUE_BAJA_DE_LINEA, focoVisible } from './estiloDeFilas';
import { FormularioDeRequisito, type FormularioDeRequisitoProps } from './FormularioDeRequisito';

export interface FilaDeRequisitoProps extends FormularioDeRequisitoProps {
  abierto: boolean;
  /** El sector donde se ve: si cambia con la fila abierta (se eligió su tipo), la fila lo sigue a su nueva posición. */
  sector: SectorEnVista;
  /** El requisito tiene algún error de validación: la fila lo marca. */
  conError: boolean;
  onAlternar: () => void;
  onQuitar: () => void;
}

const ICONO_FILA = 32;

/**
 * Un requisito (documento o sección de la información) en una fila compacta, cerrada por defecto: ícono y nombre, una línea con lo de siempre
 * (obligatorio, a quién se pide, quién lo revisa) y etiquetas con lo que se sale de lo común (una condición, el soporte de secciones, el documento
 * de una persona). Al abrirla, debajo van todos los controles del requisito. Una sección de la información se ve distinta de un documento: su
 * ícono, su etiqueta y un fondo y una marca lateral en el acento.
 */
export function FilaDeRequisito({ abierto, sector, conError, onAlternar, onQuitar, ...formulario }: FilaDeRequisitoProps) {
  const { t } = useTranslation();
  const { requisito: r, tipo, nombreArea, soloLectura, mensajes } = formulario;
  const idFormulario = useId();
  const fila = useRef<HTMLElement>(null);
  const esSeccion = r.seccion !== null;
  const seccion = seccionFicha(r.seccion);
  const nombre = esSeccion ? (seccion ? nombreSeccion(seccion.codigo, t) : t('fichaEmpresa.editor.nueva')) : (tipo?.nombre ?? t('flujos.editor.requisitos.nuevo'));
  const quitar = esSeccion ? t('fichaEmpresa.editor.quitar') : t('flujos.editor.requisitos.quitar');
  const { linea, etiquetas } = resumenDelRequisito(r, { t, tipo, nombreArea });
  const Icono = esSeccion ? ClipboardList : FileText;
  const Alternador = soloLectura ? (abierto ? ChevronUp : ChevronDown) : abierto ? ChevronUp : Pencil;

  // Al abrirse (o al cambiar de sector con la fila abierta) la fila se deja a la vista, sin saltos si ya lo está.
  useEffect(() => {
    if (abierto && typeof fila.current?.scrollIntoView === 'function') fila.current.scrollIntoView({ block: 'nearest' });
  }, [abierto, sector]);

  return (
    <Box
      component="section"
      ref={fila}
      aria-label={nombre}
      data-seccion-de-informacion={esSeccion ? '' : undefined}
      sx={(th) => ({
        position: 'relative',
        scrollMarginBlock: 8,
        bgcolor: esSeccion ? alpha(th.palette.acento.main, abierto ? 0.1 : 0.06) : abierto ? 'superficie.nivel2' : 'transparent',
        boxShadow: conError ? `inset 3px 0 0 ${th.palette.error.main}` : esSeccion ? `inset 3px 0 0 ${th.palette.acento.main}` : 'none',
      })}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
        <ButtonBase
          onClick={onAlternar}
          aria-expanded={abierto}
          aria-controls={abierto ? idFormulario : undefined}
          sx={(th) => ({
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'flex-start',
            gap: 1.5,
            py: 1.25,
            pl: 1.75,
            pr: 1,
            textAlign: 'left',
            '&:hover': { bgcolor: esSeccion ? alpha(th.palette.acento.main, 0.06) : th.palette.superficie.nivel2 },
            ...focoVisible(th),
          })}
        >
          <Box
            aria-hidden
            sx={(th) => ({
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              width: ICONO_FILA,
              height: ICONO_FILA,
              borderRadius: '50%',
              bgcolor: esSeccion ? th.palette.acento.tinte : th.palette.estado.neutro.fondo,
              color: esSeccion ? th.palette.acento.main : th.palette.estado.neutro.texto,
            })}
          >
            <Icono size={16} strokeWidth={1.75} />
          </Box>
          <Box component="span" sx={{ flex: 1, minWidth: 0, display: 'block' }}>
            <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.5 }}>
              <Typography variant="subtitle1" component="span" sx={{ overflowWrap: 'anywhere' }}>
                {nombre}
              </Typography>
              {esSeccion && (
                <Chip
                  component="span"
                  size="small"
                  label={t('flujoRequisitos.seccionDeLaInformacion')}
                  sx={(th) => ({ bgcolor: th.palette.acento.tinte, color: th.palette.acento.main, border: 1, borderColor: th.palette.acento.borde })}
                />
              )}
              {conError && (
                <Chip
                  component="span"
                  size="small"
                  color="error"
                  icon={<CircleAlert size={14} aria-hidden />}
                  label={t('flujoRequisitos.fila.conError')}
                  title={mensajes.general ?? mensajes.periodos ?? mensajes.vigencia ?? mensajes.revalidacion ?? undefined}
                />
              )}
            </Box>
            <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary', mt: 0.25 }}>
              {linea}
            </Typography>
            {(r.condicion !== null || etiquetas.length > 0) && (
              <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
                {r.condicion !== null && <ChipDeCondicion condicion={r.condicion} />}
                {etiquetas.map((e) => (
                  <Chip key={e.clave} component="span" size="small" label={e.texto} title={e.texto} sx={CHIP_QUE_BAJA_DE_LINEA} />
                ))}
              </Box>
            )}
          </Box>
          <Box component="span" aria-hidden sx={{ display: 'inline-flex', flex: 'none', alignSelf: 'center', color: 'text.secondary' }}>
            <Alternador size={16} strokeWidth={1.75} />
          </Box>
        </ButtonBase>
        {!soloLectura && (
          <Tooltip title={quitar}>
            <IconButton size="small" aria-label={quitar} onClick={onQuitar} sx={(th) => ({ flex: 'none', alignSelf: 'center', mr: 1, ...focoVisible(th, 0) })}>
              <Trash2 size={16} strokeWidth={1.75} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      {abierto && (
        <Box id={idFormulario} sx={{ px: 1.75, pb: 1.75, pt: 0.5 }}>
          <FormularioDeRequisito {...formulario} />
        </Box>
      )}
    </Box>
  );
}
