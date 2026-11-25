import { Box, FormControlLabel, MenuItem, Radio, RadioGroup, Stack, Switch, TextField, Typography } from '@mui/material';
import { CampoNumero } from '@validalo/ui';
import type { AreaDto, AtributoPermitidoDto, CuestionarioDto, PoliticaDevolucion, TipoDocumentoTenantDto, TipoVinculoDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../../shared/componentes';
import { limpiarAreasDeRequisitos, type BorradorFlujo, type ErrorFlujo } from '../editor';
import { EditorEtapas } from './EditorEtapas';
import { EditorEvaluacionesDelFlujo } from './EditorEvaluacionesDelFlujo';
import { EditorResponsablesDeSector } from './EditorResponsablesDeSector';
import { EditorRecordatorioFlujo } from './EditorRecordatorioFlujo';
import { EditorRequisitos } from './EditorRequisitos';
import { EditorSeleccionFlujo } from './EditorSeleccionFlujo';
import { EditorVerificaciones } from './EditorVerificaciones';
import { EditorVigenciaVinculo } from './EditorVigenciaVinculo';

export interface FormularioFlujoProps {
  borrador: BorradorFlujo;
  onCambiar: (borrador: BorradorFlujo) => void;
  areas: readonly AreaDto[];
  /** Tipos de vínculo para elegir al crear; `null` = flujo existente (código y tipo fijos). */
  tipos: readonly TipoVinculoDto[] | null;
  /** Tipos de documento del tenant, para los requisitos. */
  tiposDocumento: readonly TipoDocumentoTenantDto[];
  /** Cuestionarios de evaluación de la empresa, para elegir cuáles pide el flujo (CE-7). */
  cuestionarios?: readonly CuestionarioDto[];
  /** Los atributos permitidos del tipo de vínculo del flujo, para las condiciones «según un atributo del vínculo» (vacío si no se pudieron leer). */
  atributos?: readonly AtributoPermitidoDto[];
  errores: readonly ErrorFlujo[];
  soloLectura: boolean;
}

const POLITICAS: readonly PoliticaDevolucion[] = ['Inmediata', 'AlCerrarArea'];

/** Datos generales del flujo, política de devolución, separación de funciones, etapas y documentos que pide. */
export function FormularioFlujo({ borrador, onCambiar, areas, tipos, tiposDocumento, cuestionarios = [], atributos = [], errores, soloLectura }: FormularioFlujoProps) {
  const { t } = useTranslation();
  const error = (campo: string) => {
    const e = errores.find((x) => x.campo === campo);
    return e ? t(`flujos.editor.errores.${e.codigo}`) : null;
  };
  const nuevo = tipos !== null;

  return (
    <Stack spacing={2}>
      <Tarjeta titulo={t('flujos.editor.general')}>
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: nuevo ? '200px minmax(0,1fr) 220px' : 'minmax(0,1fr)' }, gap: 2 }}>
            {nuevo && (
              <TextField
                label={t('flujos.editor.codigo')}
                value={borrador.codigo}
                onChange={(e) => onCambiar({ ...borrador, codigo: e.target.value.toUpperCase() })}
                required
                error={Boolean(error('codigo'))}
                helperText={error('codigo') ?? t('flujos.editor.codigoAyuda')}
                slotProps={{ htmlInput: { spellCheck: false } }}
              />
            )}
            <TextField
              label={t('flujos.editor.nombre')}
              value={borrador.nombre}
              onChange={(e) => onCambiar({ ...borrador, nombre: e.target.value })}
              required
              disabled={soloLectura}
              error={Boolean(error('nombre'))}
              helperText={error('nombre') ?? ' '}
            />
            {nuevo && (
              <TextField
                select
                label={t('flujos.editor.tipo')}
                value={borrador.tipoVinculo}
                onChange={(e) => onCambiar({ ...borrador, tipoVinculo: e.target.value })}
                required
                error={Boolean(error('tipoVinculo'))}
                helperText={error('tipoVinculo') ?? t('flujos.editor.tipoAyuda')}
              >
                {tipos.filter((tipo) => tipo.activo).map((tipo) => (
                  <MenuItem key={tipo.id} value={tipo.codigo}>
                    {tipo.nombre}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>

          <Box component="fieldset" disabled={soloLectura} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <Typography variant="subtitle2" component="legend" sx={{ mb: 0.5 }}>
              {t('flujos.editor.politica')}
            </Typography>
            <RadioGroup value={borrador.politicaDevolucion} onChange={(e) => onCambiar({ ...borrador, politicaDevolucion: e.target.value as PoliticaDevolucion })}>
              {POLITICAS.map((p) => (
                <FormControlLabel
                  key={p}
                  value={p}
                  disabled={soloLectura}
                  control={<Radio size="small" />}
                  sx={{ alignItems: 'flex-start', mx: 0 }}
                  label={
                    <Box sx={{ pt: '5px' }}>
                      <Typography variant="subtitle1" component="span" sx={{ display: 'block' }}>
                        {t(`flujos.editor.politicas.${p}.titulo`)}
                      </Typography>
                      <Typography variant="caption" component="span" sx={{ color: 'text.secondary', display: 'block' }}>
                        {t(`flujos.editor.politicas.${p}.ayuda`)}
                      </Typography>
                    </Box>
                  }
                />
              ))}
            </RadioGroup>
          </Box>

          <FormControlLabel
            control={<Switch checked={borrador.separacionDeFunciones} onChange={(e) => onCambiar({ ...borrador, separacionDeFunciones: e.target.checked })} />}
            disabled={soloLectura}
            sx={{ alignItems: 'flex-start', mx: 0 }}
            label={
              <Box sx={{ pt: '6px' }}>
                <Typography variant="subtitle1" component="span" sx={{ display: 'block' }}>
                  {t('flujos.editor.separacion')}
                </Typography>
                <Typography variant="caption" component="span" sx={{ color: 'text.secondary', display: 'block' }}>
                  {t('flujos.editor.separacionAyuda')}
                </Typography>
              </Box>
            }
          />

          <Box component="fieldset" disabled={soloLectura} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <Typography variant="subtitle2" component="legend" sx={{ mb: 0.5 }}>
              {t('flujoPlazo.titulo')}
            </Typography>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1.5 }}>{t('flujoPlazo.ayuda')}</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '160px minmax(0,320px)' }, gap: 2 }}>
              <CampoNumero etiqueta={t('flujoPlazo.dias')} valor={borrador.plazoDias} onCambiar={(texto) => onCambiar({ ...borrador, plazoDias: texto })} />
              <TextField
                size="small"
                label={t('flujoPlazo.recordatorios')}
                value={borrador.plazoRecordatorios}
                disabled={soloLectura || borrador.plazoDias.trim() === '0'}
                onChange={(e) => onCambiar({ ...borrador, plazoRecordatorios: e.target.value })}
              />
            </Box>
          </Box>

          <EditorRecordatorioFlujo borrador={borrador} onCambiar={onCambiar} errores={errores} soloLectura={soloLectura} />

          <Box component="fieldset" disabled={soloLectura} sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
            <Typography variant="subtitle2" component="legend" sx={{ mb: 0.5 }}>
              {t('flujoReintento.titulo')}
            </Typography>
            <FormControlLabel
              control={<Switch checked={borrador.reintentoPermitido} onChange={(e) => onCambiar({ ...borrador, reintentoPermitido: e.target.checked })} />}
              disabled={soloLectura}
              sx={{ alignItems: 'flex-start', mx: 0 }}
              label={
                <Box sx={{ pt: '6px' }}>
                  <Typography variant="subtitle1" component="span" sx={{ display: 'block' }}>
                    {t('flujoReintento.permitir')}
                  </Typography>
                  <Typography variant="caption" component="span" sx={{ color: 'text.secondary', display: 'block' }}>
                    {t('flujoReintento.ayuda')}
                  </Typography>
                </Box>
              }
            />
            {borrador.reintentoPermitido && (
              <TextField
                size="small"
                label={t('flujoReintento.dias')}
                helperText={t('flujoReintento.diasAyuda')}
                value={borrador.reintentoDias}
                disabled={soloLectura}
                onChange={(e) => onCambiar({ ...borrador, reintentoDias: e.target.value.replace(/\D/g, '').slice(0, 3) })}
                slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 3, autoComplete: 'off' } }}
                sx={{ mt: 1.5, width: { xs: '100%', md: 160 } }}
              />
            )}
          </Box>
          <EditorVigenciaVinculo borrador={borrador} onCambiar={onCambiar} errores={errores} soloLectura={soloLectura} />
        </Stack>
      </Tarjeta>

      <Tarjeta titulo={t('flujoSeleccion.titulo')}>
        <EditorSeleccionFlujo borrador={borrador} onCambiar={onCambiar} errores={errores} soloLectura={soloLectura} atributos={atributos} />
      </Tarjeta>

      <Tarjeta titulo={t('flujos.editor.etapas')}>
        <EditorEtapas
          etapas={borrador.etapas}
          areas={areas}
          onCambiar={(etapas) => onCambiar(limpiarAreasDeRequisitos({ ...borrador, etapas }))}
          errores={errores}
          soloLectura={soloLectura}
        />
      </Tarjeta>

      <Tarjeta titulo={t('flujoRequisitos.titulo')}>
        <EditorRequisitos
          requisitos={borrador.requisitos}
          etapas={borrador.etapas}
          areas={areas}
          tiposDocumento={tiposDocumento}
          onCambiar={(requisitos) => onCambiar({ ...borrador, requisitos })}
          errores={errores}
          soloLectura={soloLectura}
          atributos={atributos}
        />
      </Tarjeta>

      <Tarjeta titulo={t('responsablesPorSector.titulo')}>
        <EditorResponsablesDeSector
          responsables={borrador.responsablesDeSector}
          etapas={borrador.etapas}
          areas={areas}
          onCambiar={(responsablesDeSector) => onCambiar({ ...borrador, responsablesDeSector })}
          soloLectura={soloLectura}
        />
      </Tarjeta>

      <Tarjeta titulo={t('flujos.editor.verificaciones.titulo')}>
        <EditorVerificaciones
          verificaciones={borrador.verificaciones}
          onCambiar={(verificaciones) => onCambiar({ ...borrador, verificaciones })}
          errores={errores}
          soloLectura={soloLectura}
        />
      </Tarjeta>

      <Tarjeta titulo={t('evaluaciones.flujo.titulo')}>
        <EditorEvaluacionesDelFlujo
          evaluaciones={borrador.evaluaciones}
          cuestionarios={cuestionarios}
          onCambiar={(evaluaciones) => onCambiar({ ...borrador, evaluaciones })}
          soloLectura={soloLectura}
        />
      </Tarjeta>
    </Stack>
  );
}
