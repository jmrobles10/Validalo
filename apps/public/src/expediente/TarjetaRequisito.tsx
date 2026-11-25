import { Typography } from '@mui/material';
import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, textoDelPorQue } from '@validalo/ui';
import { FileText, PencilLine, Upload, UsersRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { enlaceDeSolicitud, type SolicitudDeSubida } from '../boveda/solicitudDeSubida';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { modoDe, reglasDe, textoAntiguedad, textoReglas } from '../tipoDocumento/reglas';
import { Plantilla } from '../tipoDocumento/Plantilla';
import { esRol } from '../personas/modelo';
import { enlaceParaRegistrarPersona } from '../ficha/legal/personas';
import { requiereAtencion } from '../vigencia/vigencia';
import { AvisoVigencia, LineaVigencia } from '../vigencia/ChipVigencia';
import { ConfirmarRatificacion } from './ConfirmarRatificacion';
import { AvisoAntiguedad } from './AvisoAntiguedad';
import { Observacion } from './Observacion';
import { AccionCertificacionBancaria } from './AccionCertificacionBancaria';
import { esRequisitoDeCertificacionBancaria } from './certificacionBancaria';
import { BotonDeAccion } from './BotonDeAccion';
import { MarcoDeRequisito } from './MarcoDeRequisito';
import { accionDeRequisito, observacionesDeRequisito, tonoDeRequisito } from './requisitos';

/**
 * Un documento que pide la empresa, como tarjeta de la lista de su grupo (`MarcoDeRequisito`): el título con su estado, una línea con la
 * versión (o que aún no lo sube) y, si le toca al tercero, qué admite (formatos, tamaño, páginas); debajo la vigencia, la ayuda del tipo
 * y la plantilla, y al pie la acción para subirlo o llenar el formulario. Subir abre el diálogo de subida (no saca al tercero de su revisión);
 * llenar un formulario sí lleva a su página. `subida` es lo que pide el requisito (`solicitudDeRequisito`); sin ella (solo lectura o falta el
 * vínculo) no hay acción. La certificación bancaria no se sube suelta: su acción lleva a la cuenta a la que pertenece
 * (`AccionCertificacionBancaria`, CB-8). Reemplazar una versión vigente es la acción menos urgente: va con borde, no rellena.
 */
export function TarjetaRequisito({ requisito, expediente, subida }: { requisito: RequisitoPublicoDto; expediente: ExpedientePublicoDto; subida: SolicitudDeSubida | null }) {
  const { t } = useTranslation();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const empresa = expediente.empresa.nombre;
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
  // Reemplazar una versión vigente (o renovar cuando ya puede ratificarla) es lo menos urgente: acción de borde; las demás, rellenas.
  const variante = accion === 'reemplazar' && (!teToca || requisito.puedeRatificar) ? 'outlined' : 'contained';

  const estadoDeLaVersion = requisito.ratificadoEn
    ? t('expediente.ratificar.ratificado', { fecha: formatearFecha(requisito.ratificadoEn) })
    : version
      ? t(version.clase === 'Formulario' ? 'expediente.documentos.versionFormulario' : 'expediente.documentos.version', {
          n: String(version.n),
          fecha: formatearFecha(version.cargadaEn),
        })
      : requisito.obligatorio
        ? t('expediente.documentos.faltaObligatorio')
        : t('expediente.documentos.faltaOpcional');
  // Una sola línea de metadatos: el estado de la versión y, si le toca subirlo, lo que admite el archivo y qué tan reciente debe ser (antigüedad máxima, TD-10).
  const meta = [estadoDeLaVersion, teToca && modo !== 'Formulario' ? textoReglas(reglasDe(tipo.archivo), t) : null, teToca ? textoAntiguedad(tipo, t) : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <MarcoDeRequisito
      icono={FileText}
      tono={tonoDeRequisito(requisito)}
      titulo={tipo.nombre}
      chip={<ChipEstado estado={requisito.estado} size="medium" />}
      persona={
        persona &&
        (persona.sinPersona
          ? t('personas.expediente.sinPersona', { rol: rolDePersona.toLowerCase() })
          : t('personas.expediente.de', { nombre: persona.nombre ?? '', rol: rolDePersona }))
      }
      meta={meta}
      cuerpo={
        <>
          <LineaVigencia vigencia={version?.vigencia} empresa={empresa} />
          {/* Por qué se le pide este documento: lo que declaró en su ficha y lo hizo aplicar (EF-6). */}
          {(requisito.porQue?.length ?? 0) > 0 && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} data-por-que="">
              {t('expediente.documentos.porQue', { empresa, motivos: textoDelPorQue(requisito.porQue ?? []) })}
            </Typography>
          )}
          {teToca && bancaria && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('expediente.documentos.bancaria.ayuda', { empresa })}
            </Typography>
          )}
          {teToca && tipo.textoAyuda && (
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {tipo.textoAyuda}
            </Typography>
          )}
          {teToca && tipo.tienePlantilla && <Plantilla expedienteId={expediente.id} requisitoId={requisito.id} empresa={empresa} />}
          <AvisoVigencia vigencia={version?.vigencia} />
          <AvisoAntiguedad antiguedad={version?.antiguedad} decidido={requisito.estado === 'Observado' || requisito.estado === 'Aprobado'} />
          {observaciones.map((o) => (
            <Observacion key={o.fecha} observacion={o} />
          ))}
        </>
      }
      acciones={
        <>
          {accion && subida && modo === 'Formulario' && (
            // Llenar un formulario es una página (con su propio regreso a la revisión)…
            <BotonDeAccion to={enlaceDeSolicitud(subida)} icono={PencilLine} variant={variante}>
              {t(`expediente.documentos.accionesFormulario.${accion}`)}
            </BotonDeAccion>
          )}
          {accion && subida && bancaria && <AccionCertificacionBancaria accion={accion} vinculoId={subida.vinculoId ?? null} empresa={empresa} variant={variante} />}
          {accion && subida && !bancaria && modo !== 'Formulario' && (
            // …y subir un archivo, un diálogo: el tercero no sale de su revisión.
            <BotonDeAccion onClick={() => abrirSubida(subida)} icono={Upload} variant={variante}>
              {t(`expediente.documentos.acciones.${accion}`)}
            </BotonDeAccion>
          )}
          {persona?.sinPersona && (
            <BotonDeAccion to={enlaceParaRegistrarPersona(persona.rol)} icono={UsersRound}>
              {t('personas.expediente.agregarPersona')}
            </BotonDeAccion>
          )}
          {requisito.puedeRatificar && subida && (
            <ConfirmarRatificacion variante="contained" compacto expedienteId={expediente.id} requisitoId={requisito.id} documento={tipo.nombre} empresa={empresa} />
          )}
        </>
      }
    />
  );
}
