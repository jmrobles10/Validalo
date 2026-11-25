import { Box, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import type { AtributoPermitidoDto, TipoDocumentoTenantDto } from '@validalo/api-client';
import { AlineadoConCampo, CampoNumero } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { resumenTipo } from '../../configuracion/tiposDocumento/resumen';
import { nombreSeccion } from '../../terceros/ficha/secciones';
import { atajoDe, describirCondicion } from '../condiciones';
import { admitePersona, ROLES_DE_PERSONA, type RequisitoEnEditor } from '../editor';
import { seccionesQueRespalda } from '../requisitosDeSeccion';
import { OpcionesSeccion, SelectorSeccion } from './CamposRequisitoSeccion';
import { CondicionDeAtributo } from './CondicionDeAtributo';
import { CondicionDeFicha } from './CondicionDeFicha';
import { SelectorAreasRequisito } from './SelectorAreasRequisito';
import { SelectorDeCondicion } from './SelectorDeCondicion';

/** Los textos de los errores de un requisito, por campo (`null` = sin error). */
export interface MensajesDelRequisito {
  general: string | null;
  periodos: string | null;
  vigencia: string | null;
  revalidacion: string | null;
}

export interface FormularioDeRequisitoProps {
  requisito: RequisitoEnEditor;
  onCambiar: (cambio: Partial<RequisitoEnEditor>) => void;
  /** El tipo de documento que pide (`undefined` en una sección o mientras no se elige). */
  tipo: TipoDocumentoTenantDto | undefined;
  /** Los tipos que se pueden elegir. */
  elegibles: readonly TipoDocumentoTenantDto[];
  areasDelFlujo: readonly string[];
  nombreArea: (id: string) => string;
  atributos: readonly AtributoPermitidoDto[];
  mensajes: MensajesDelRequisito;
  soloLectura: boolean;
}

/**
 * Todos los controles de un requisito (documento o sección de la información), los de siempre: tipo o sección, quién lo revisa, a quién se pide
 * (con su constructor de condición), aprobadores, obligatorio, lo propio de una sección, el documento de una persona relacionada y «Usar como
 * soporte». Es lo que se ve al abrir la fila.
 */
export function FormularioDeRequisito({ requisito: r, onCambiar, tipo, elegibles, areasDelFlujo, nombreArea, atributos, mensajes, soloLectura }: FormularioDeRequisitoProps) {
  const { t } = useTranslation();
  const esSeccion = r.seccion !== null;
  const respalda = tipo ? seccionesQueRespalda(tipo.tipoCanonico) : [];
  return (
    <>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: 'minmax(0,1fr)',
            sm: 'minmax(180px,1fr) minmax(180px,1fr)',
            lg: 'minmax(180px,1.2fr) minmax(180px,1.2fr) minmax(170px,1fr) 120px auto',
          },
          columnGap: 1.5,
          rowGap: 1,
          alignItems: 'start',
        }}
      >
        {esSeccion ? (
          <SelectorSeccion requisito={r} onCambiar={onCambiar} deshabilitado={soloLectura} />
        ) : (
          <TextField
            select
            size="small"
            label={t('flujos.editor.requisitos.tipo')}
            value={r.tipoDocumentoTenantId}
            onChange={(ev) => onCambiar({ tipoDocumentoTenantId: ev.target.value })}
            disabled={soloLectura}
          >
            {(tipo && !elegibles.includes(tipo) ? [tipo, ...elegibles] : elegibles).map((x) => (
              <MenuItem key={x.id} value={x.id}>
                {x.nombre}
              </MenuItem>
            ))}
          </TextField>
        )}
        <SelectorAreasRequisito areasDelFlujo={areasDelFlujo} elegidas={r.areasQueRevisan} nombreArea={nombreArea} onCambiar={(areasQueRevisan) => onCambiar({ areasQueRevisan })} deshabilitado={soloLectura} />
        <SelectorDeCondicion
          etiqueta={t('flujos.editor.requisitos.sePideA')}
          condicion={r.condicion}
          onCambiar={(condicion) => onCambiar({ condicion })}
          deshabilitado={soloLectura}
          textoDe={(a) => t(`flujos.editor.requisitos.atajos.${a}`)}
          atributos={atributos}
        />
        <CampoNumero
          etiqueta={t('flujos.editor.requisitos.aprobadores')}
          valor={r.aprobadoresRequeridos}
          placeholder={t('flujos.editor.requisitos.losDelArea')}
          onCambiar={(texto) => onCambiar({ aprobadoresRequeridos: texto === '' ? null : Number(texto) })}
          deshabilitado={soloLectura}
        />
        <AlineadoConCampo desde="sm">
          <FormControlLabel
            control={<Switch checked={r.obligatorio} onChange={(ev) => onCambiar({ obligatorio: ev.target.checked })} disabled={soloLectura} />}
            label={t('flujos.editor.requisitos.obligatorio')}
            sx={{ mx: 0, flex: 'none' }}
          />
        </AlineadoConCampo>
      </Box>
      {r.condicion && atajoDe(r.condicion) === 'ficha' && <CondicionDeFicha condicion={r.condicion} onCambiar={(condicion) => onCambiar({ condicion })} deshabilitado={soloLectura} />}
      {r.condicion && atajoDe(r.condicion) === 'atributo' && (
        <CondicionDeAtributo
          condicion={r.condicion}
          atributos={atributos}
          onCambiar={(condicion) => onCambiar({ condicion })}
          deshabilitado={soloLectura}
          resumen={(condicion) => t('flujos.editor.requisitos.personalizada', { condicion })}
        />
      )}
      {esSeccion && (
        <OpcionesSeccion requisito={r} onCambiar={onCambiar} deshabilitado={soloLectura} errorPeriodos={mensajes.periodos} errorVigencia={mensajes.vigencia} errorRevalidacion={mensajes.revalidacion} />
      )}
      {tipo && admitePersona(tipo.tipoCanonico) && (
        <Box sx={{ mt: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <TextField
              select
              size="small"
              label={t('personasRelacionadas.editor.documentoDe')}
              value={r.dePersonaRelacionada ?? ''}
              onChange={(ev) => onCambiar({ dePersonaRelacionada: ev.target.value === '' ? null : ev.target.value, todasLasRelaciones: ev.target.value === '' ? false : r.todasLasRelaciones })}
              disabled={soloLectura}
              sx={{ minWidth: 260 }}
            >
              <MenuItem value="">{t('personasRelacionadas.editor.delTercero')}</MenuItem>
              {ROLES_DE_PERSONA.map((rol) => (
                <MenuItem key={rol} value={rol}>
                  {t(`personasRelacionadas.roles.${rol}`)}
                </MenuItem>
              ))}
            </TextField>
            {r.dePersonaRelacionada !== null && (
              <FormControlLabel
                control={<Switch checked={r.todasLasRelaciones} onChange={(ev) => onCambiar({ todasLasRelaciones: ev.target.checked })} disabled={soloLectura} />}
                label={t('personasRelacionadas.editor.todas')}
                sx={{ mx: 0 }}
              />
            )}
          </Stack>
          {r.dePersonaRelacionada !== null && (
            <Typography component="p" variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>
              {t('personasRelacionadas.editor.ayuda')}
            </Typography>
          )}
        </Box>
      )}
      {tipo && respalda.length > 0 && r.dePersonaRelacionada === null && (
        <Box sx={{ mt: 0.5 }}>
          <FormControlLabel
            control={<Switch checked={r.usarComoSoporte !== false} onChange={(ev) => onCambiar({ usarComoSoporte: ev.target.checked })} disabled={soloLectura} />}
            label={t('cruce.editor.usarComoSoporte')}
            sx={{ mx: 0 }}
          />
          <Typography component="p" variant="caption" sx={{ color: 'text.secondary' }}>
            {t('cruce.editor.ayuda', { secciones: respalda.map((c) => nombreSeccion(c, t)).join(', ') })}
          </Typography>
        </Box>
      )}
      {tipo && (
        <Typography component="p" variant="caption" sx={{ color: 'text.secondary', mt: 0.75 }} data-resumen-tipo="">
          {resumenTipo(tipo, t)}
        </Typography>
      )}
      {r.condicion && atajoDe(r.condicion) === 'personalizada' && (
        <Typography component="p" variant="caption" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {t('flujos.editor.requisitos.personalizada', { condicion: describirCondicion(r.condicion, t) })}
        </Typography>
      )}
      {mensajes.general && (
        <Typography variant="caption" component="p" color="error" sx={{ mt: 1 }}>
          {mensajes.general}
        </Typography>
      )}
    </>
  );
}
