import { Alert, Box, Button, Stack, Typography } from '@mui/material';
import type { AreaExpedienteDto, DocumentoVistaEmpresaDto, ExpedienteDto, HechosDto, RequisitoExpedienteDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, textoDelPorQue } from '@validalo/ui';
import { ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { textoDelRequisito } from '../../personas/modelo';
import { RevisionesAutomaticasDelRequisito } from '../../revisionAutomatica/components/RevisionesAutomaticasDelRequisito';
import { ResumenVersion } from '../../documentos/ResumenVersion';
import type { DocumentoEnVisor } from '../../documentos/VisorDocumento';
import { ChipVigencia } from '../../documentos/VigenciaDocumento';
import type { ContextoRevisor, DialogoExpediente } from '../reglas';
import { documentoEnVisor, puedeEximir } from '../requisitos';
import { AreasDelRequisito } from './AreaDelRequisito';
import { avisoDelRequisito, soporteSinCruce } from './avisoDelRequisito';
import { BotonVerVersion } from './BotonVerVersion';
import { DetalleSeccionRequisito } from './DetalleSeccionRequisito';
import { PieDelRequisito } from './PieDelRequisito';
import { SoporteDeSecciones } from './SoporteDeSecciones';

export interface TarjetaRequisitoProps {
  expediente: ExpedienteDto;
  requisito: RequisitoExpedienteDto;
  areas: ReadonlyMap<string, AreaExpedienteDto>;
  contexto: (area: AreaExpedienteDto | null) => ContextoRevisor;
  nombres: ReadonlyMap<string, string>;
  puedeVer: boolean;
  onVer: (documento: DocumentoEnVisor) => void;
  onAccion: (dialogo: DialogoExpediente) => void;
  /** Muestra «Aprobar u observar» por documento (acción secundaria; la principal es la decisión del área). */
  decidirPorDocumento?: boolean;
  /** Hechos de la versión vigente (de los documentos del vínculo): la revisión automática (IA-11). */
  hechos?: HechosDto | null;
  /** Documentos compartidos con el vínculo: abren en el visor los soportes de una sección. */
  documentos?: readonly DocumentoVistaEmpresaDto[];
}

/**
 * Un documento (o sección de la información del tercero, F2) que pide el flujo: estado, versión vigente (con «Ver» en el visor si trae archivo), su vigencia, los
 * datos que declaró el tercero, la revisión automática, su pie (cuándo se leyó y qué respalda) y, por cada área que lo revisa, su
 * estado, sus veredictos sobre la versión y «Aprobar u observar» cuando le toca a quien mira (RQ-4). Una sección muestra
 * en su lugar la completitud para la empresa, los cambios, sus datos y sus soportes (DetalleSeccionRequisito).
 */
export function TarjetaRequisito({ expediente, requisito, areas, contexto, nombres, puedeVer, onVer, onAccion, decidirPorDocumento = false, hechos, documentos = [] }: TarjetaRequisitoProps) {
  const { t } = useTranslation();
  const version = requisito.versionActual;
  const seccion = requisito.seccion ?? null;
  const visor = seccion ? null : documentoEnVisor(requisito, hechos);
  const Icono = seccion ? ClipboardList : FileText;
  const documento = requisito.tipoDocumento.nombre;
  const eximir = puedeEximir(expediente, requisito, contexto(null).scopes);

  const aviso = avisoDelRequisito(requisito, visor, t);
  const vigencia = visor?.vigencia ?? null;
  // La lectura del archivo (no la de un formulario) para el pie: el aviso de «sin lectura» solo sale si de verdad no se leyó.
  const lectura = visor && !visor.sinArchivo ? (visor.hechos?.ia ?? null) : null;

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        py: 1.5,
        '&:first-of-type': { pt: 0.5 },
        '&:not(:first-of-type)': { borderTop: 1, borderColor: 'divider' },
        ...(requisito.estado === 'Observado' && { pl: 1.25, boxShadow: (th) => `inset 3px 0 0 ${th.palette.warning.main}` }),
      }}
    >
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Icono size={18} strokeWidth={1.75} aria-hidden style={{ flex: 'none', marginTop: 2, opacity: 0.7 }} />
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle1" component="h4">
            {documento}
          </Typography>
          {/* El documento de una persona relacionada (ADR-0010): de quién es, o que nadie cumple todavía el rol. */}
          {textoDelRequisito(requisito.persona, t) && (
            <Typography variant="subtitle2" component="p" data-persona-del-requisito="">
              {textoDelRequisito(requisito.persona, t)}
            </Typography>
          )}
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.25 }}>
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} title={version ? t('expedientes.requisitos.hash', { hash: version.sha256 }) : undefined}>
              {requisito.obligatorio ? t('expedientes.requisitos.obligatorio') : t('expedientes.requisitos.opcional')}
              {version && ` · ${t('expedientes.requisitos.version', { n: String(version.n), fecha: formatearFecha(version.cargadaEn) })}`}
              {visor?.sinArchivo && ` · ${t('expedientes.datosDeclarados.formulario')}`}
            </Typography>
            {vigencia && <ChipVigencia vigencia={vigencia} />}
          </Stack>
        </Box>
        <ChipEstado estado={requisito.estado} />
        {/* Una versión de solo formulario no tiene archivo que ver: sus datos van abajo, en la misma tarjeta. */}
        {visor && !visor.sinArchivo && <BotonVerVersion documento={visor} puedeVerArchivo={puedeVer} onVer={onVer} />}
        {eximir && (
          <Button size="small" variant="text" onClick={() => onAccion({ tipo: 'eximir', requisito })} sx={{ color: 'text.secondary' }}>
            {t('expedientes.requisitos.eximirAccion')}
          </Button>
        )}
      </Stack>

      {/* Un solo aviso, el más importante: retiro de la versión, discrepancia crítica, vencimiento o archivo sin lectura automática. */}
      {aviso && (
        <Alert severity={aviso.severidad} sx={{ typography: 'body2', mt: 1, py: 0 }}>
          {aviso.texto}
        </Alert>
      )}
      {visor && (
        <Box sx={{ mt: 1, '&:empty': { display: 'none' } }}>
          <ResumenVersion datos={visor.datosDeclarados ?? []} vigencia={visor.vigencia} limite={6} hechos={visor.sinArchivo ? null : visor.hechos} tipoEsperado={visor.tipoEsperado} compacto />
        </Box>
      )}
      {/* El pie del documento, en una línea: cuándo se leyó, qué respalda y, si no hay con qué cruzarlo, que se compare a mano. */}
      {!seccion && <PieDelRequisito ia={lectura} soporte={requisito.soporteDeSecciones} sinCruce={soporteSinCruce(requisito, visor)} />}
      {/* Lo que decidió la revisión automática en cada área (ADR-0012): sugerencia, aprobación del sistema o pase a una persona. */}
      {!seccion && <RevisionesAutomaticasDelRequisito expediente={expediente} requisito={requisito} areas={areas} contexto={contexto} nombres={nombres} />}
      {seccion && <DetalleSeccionRequisito requisito={requisito} seccion={seccion} documentos={documentos} puedeVer={puedeVer} onVer={onVer} empresaId={expediente.empresaId} terceroId={expediente.tercero.id} />}
      {/* Un documento que respalda secciones de la ficha («Usar como soporte», F5): el resultado de su cruce con cada una. */}
      {!seccion && requisito.soporteDeSecciones && (
        <Box sx={{ mt: 1, '&:empty': { display: 'none' } }}>
          <SoporteDeSecciones soporte={requisito.soporteDeSecciones} compacto />
        </Box>
      )}
      {!seccion && !version && requisito.estado === 'Pendiente' && (
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>
          {t('expedientes.requisitos.sinVersion')}
        </Typography>
      )}
      {requisito.reenvios > 0 && (
        <Typography sx={{ color: 'text.secondary', mt: 1 }}>
          {t('expedientes.requisitos.versionesNuevas', { count: requisito.reenvios })}
        </Typography>
      )}
      {/* Lo que de la ficha del tercero hizo que se pida (EF-6), o que ya no aplica porque lo declarado cambió (EF-5). */}
      {requisito.estado !== 'NoAplica' && (requisito.porQue?.length ?? 0) > 0 && (
        <Typography sx={{ color: 'text.secondary', mt: 1 }} data-por-que="">
          {t('expedientes.requisitos.porQue', { motivos: textoDelPorQue(requisito.porQue ?? []) })}
        </Typography>
      )}
      {requisito.estado === 'NoAplica' && (
        <Typography sx={{ color: 'text.secondary', mt: 1 }} data-no-aplica="">
          {t('expedientes.requisitos.noAplica')}
        </Typography>
      )}
      {requisito.exencion && (
        <Typography sx={{ mt: 1 }}>
          {t('expedientes.requisitos.eximido', {
            persona: nombres.get(requisito.exencion.por) ?? t('expedientes.requisitos.persona'),
            fecha: formatearFecha(requisito.exencion.fecha),
            justificacion: requisito.exencion.justificacion,
          })}
        </Typography>
      )}

      <AreasDelRequisito expediente={expediente} requisito={requisito} areas={areas} contexto={contexto} nombres={nombres} onAccion={onAccion} decidirPorDocumento={decidirPorDocumento} />
    </Box>
  );
}
