import { Box, Button, Stack, Typography } from '@mui/material';
import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, textoDelPorQue } from '@validalo/ui';
import { FileText, PencilLine, Upload, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { enlaceDeSolicitud, type SolicitudDeSubida } from '../boveda/solicitudDeSubida';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { modoDe, reglasDe, textoReglas } from '../tipoDocumento/reglas';
import { Plantilla } from '../tipoDocumento/Plantilla';
import { esRol } from '../personas/modelo';
import { enlaceParaRegistrarPersona } from '../ficha/legal/personas';
import { requiereAtencion } from '../vigencia/vigencia';
import { AvisoVigencia, LineaVigencia } from '../vigencia/ChipVigencia';
import { ConfirmarRatificacion } from './ConfirmarRatificacion';
import { Observacion } from './Observacion';
import { AccionCertificacionBancaria } from './AccionCertificacionBancaria';
import { esRequisitoDeCertificacionBancaria } from './certificacionBancaria';
import { accionDeRequisito, observacionesDeRequisito, propiedadesDeLaAccion } from './requisitos';

/**
 * Un documento que pide la empresa, como fila de la lista de su grupo: nombre y estado, la versión con su vigencia y, si
 * le toca al tercero, qué admite (formatos, tamaño, páginas), la plantilla y la acción de tamaño natural para subirlo o
 * llenar el formulario. Subir abre el diálogo de subida (no saca al tercero de su revisión); llenar un formulario sí lleva a su página.
 * `subida` es lo que pide el requisito (`solicitudDeRequisito`); sin ella (solo lectura o falta el vínculo) no hay acción. La certificación bancaria no se sube suelta: su acción
 * lleva a la cuenta a la que pertenece (`AccionCertificacionBancaria`, CB-8).
 */
export function TarjetaRequisito({ requisito, expediente, subida }: { requisito: RequisitoPublicoDto; expediente: ExpedientePublicoDto; subida: SolicitudDeSubida | null }) {
  const { t } = useTranslation();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const accion = accionDeRequisito(requisito, expediente);
  const observaciones = requisito.estado === 'Observado' ? observacionesDeRequisito(requisito, expediente) : [];
  const version = requisito.versionActual;
  const tipo = requisito.tipoDocumento;
  const modo = modoDe(tipo);
  // La certificación bancaria no es un documento suelto: pertenece a una cuenta del tercero (CB-8) y se sube con ella.
  const bancaria = esRequisitoDeCertificacionBancaria(requisito);
  // El documento de una persona relacionada (ADR-0010): de quién es, o que aún no hay quien cumpla el rol y toca registrarla.
  const persona = requisito.persona ?? null;
  const rolDePersona = persona ? (esRol(persona.rol) ? t(`personas.roles.${persona.rol}`) : persona.rol) : '';
  // Le toca subirlo (o renovarlo porque vence): entonces se dice qué admite y se ofrece la plantilla.
  const teToca = Boolean(accion && subida) && (accion !== 'reemplazar' || requiereAtencion(version?.vigencia));

  return (
    <Box component="li" sx={{ py: 1, px: { xs: 1.5, sm: 2 }, minHeight: 44 }}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ color: 'text.secondary', pt: '2px', display: 'flex' }} aria-hidden>
          <FileText size={16} />
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" component="h4">
            {tipo.nombre}
          </Typography>
          {persona && (
            <Typography>
              {persona.sinPersona
                ? t('personas.expediente.sinPersona', { rol: rolDePersona.toLowerCase() })
                : t('personas.expediente.de', { nombre: persona.nombre ?? '', rol: rolDePersona })}
            </Typography>
          )}
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {requisito.ratificadoEn
              ? t('expediente.ratificar.ratificado', { fecha: formatearFecha(requisito.ratificadoEn) })
              : version
              ? t(version.clase === 'Formulario' ? 'expediente.documentos.versionFormulario' : 'expediente.documentos.version', {
                  n: String(version.n),
                  fecha: formatearFecha(version.cargadaEn),
                })
              : requisito.obligatorio
                ? t('expediente.documentos.faltaObligatorio')
                : t('expediente.documentos.faltaOpcional')}
          </Typography>
          <LineaVigencia vigencia={version?.vigencia} />
          {/* Por qué se le pide este documento: lo que declaró en su ficha y lo hizo aplicar (EF-6). */}
          {(requisito.porQue?.length ?? 0) > 0 && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.25 }} data-por-que="">
              {t('expediente.documentos.porQue', { empresa: expediente.empresa.nombre, motivos: textoDelPorQue(requisito.porQue ?? []) })}
            </Typography>
          )}
        </Box>
        <ChipEstado estado={requisito.estado} size="medium" />
      </Stack>

      <AvisoVigencia vigencia={version?.vigencia} />

      {observaciones.map((o) => (
        <Observacion key={o.fecha} observacion={o} />
      ))}

      {teToca && (Boolean(tipo.textoAyuda) || modo !== 'Formulario') && (
        <Box sx={{ mt: 0.75, pl: 3.25 }}>
          {bancaria && <Typography>{t('expediente.documentos.bancaria.ayuda', { empresa: expediente.empresa.nombre })}</Typography>}
          {tipo.textoAyuda && <Typography>{tipo.textoAyuda}</Typography>}
          {modo !== 'Formulario' && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: tipo.textoAyuda ? 0.25 : 0 }}>
              {textoReglas(reglasDe(tipo.archivo), t)}
            </Typography>
          )}
        </Box>
      )}

      {teToca && tipo.tienePlantilla && (
        <Box sx={{ mt: 1, pl: 3.25 }}>
          <Plantilla expedienteId={expediente.id} requisitoId={requisito.id} empresa={expediente.empresa.nombre} />
        </Box>
      )}

      {accion && subida && modo === 'Formulario' && (
        // Llenar un formulario es una página (con su propio regreso a la revisión)…
        <Button component={RouterLink} to={enlaceDeSolicitud(subida)} {...propiedadesDeLaAccion(accion)} startIcon={<PencilLine size={16} aria-hidden />}>
          {t(`expediente.documentos.accionesFormulario.${accion}`)}
        </Button>
      )}
      {accion && subida && bancaria && <AccionCertificacionBancaria accion={accion} vinculoId={subida.vinculoId ?? null} empresa={expediente.empresa.nombre} />}
      {accion && subida && !bancaria && modo !== 'Formulario' && (
        // …y subir un archivo, un diálogo: el tercero no sale de su revisión.
        <Button onClick={() => abrirSubida(subida)} {...propiedadesDeLaAccion(accion)} startIcon={<Upload size={16} aria-hidden />}>
          {t(`expediente.documentos.acciones.${accion}`)}
        </Button>
      )}

      {persona?.sinPersona && (
        <Button component={RouterLink} to={enlaceParaRegistrarPersona(persona.rol)} variant="contained" startIcon={<UsersRound size={16} aria-hidden />} sx={{ mt: 1, ml: 3.25 }}>
          {t('personas.expediente.agregarPersona')}
        </Button>
      )}

      {requisito.puedeRatificar && subida && (
        <ConfirmarRatificacion expedienteId={expediente.id} requisitoId={requisito.id} documento={tipo.nombre} empresa={expediente.empresa.nombre} />
      )}
    </Box>
  );
}
