import { Alert, Button, Stack, Typography } from '@mui/material';
import type { AreaExpedienteDto, DocumentoVistaEmpresaDto, ExpedienteDto, HechosDto, RequisitoExpedienteDto } from '@validalo/api-client';
import { ChipEstado, formatearFecha, MarcoDeTarjetaDeEstado, textoDelPorQue } from '@validalo/ui';
import { ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { textoDelRequisito } from '../../personas/modelo';
import { RevisionesAutomaticasDelRequisito } from '../../revisionAutomatica/components/RevisionesAutomaticasDelRequisito';
import { ResumenVersion } from '../../documentos/ResumenVersion';
import type { DocumentoEnVisor } from '../../documentos/VisorDocumento';
import { ChipVigencia } from '../../documentos/VigenciaDocumento';
import type { ContextoRevisor, DialogoExpediente } from '../reglas';
import { documentoEnVisor, puedeEximir } from '../requisitos';
import { aparienciaParaElRevisor } from '../requisitosAgrupados';
import { AreasDelRequisito } from './AreaDelRequisito';
import { avisoDelRequisito, soporteSinCruce } from './avisoDelRequisito';
import { BotonVerVersion } from './BotonVerVersion';
import { DetalleSeccionRequisito } from './DetalleSeccionRequisito';
import { RevisionDelDocumento } from './RevisionDelDocumento';

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
  /** La tarjeta de la cuenta designada está en la misma pantalla y ya trae el cruce de la certificación con la cuenta: aquí queda su línea de resumen, sin la tabla. */
  cuentasEnSuTarjeta?: boolean;
  /** Los datos de una sección ya están en la misma pantalla («Lo que declaró el tercero» del sector): la tarjeta no los repite. */
  datosAparte?: boolean;
  /** Las áreas que lo revisan, con su avance. Sin ellas (un requisito que aún espera al tercero) todas dirían lo mismo: se dice una sola vez arriba del panel. */
  conAreas?: boolean;
}

/**
 * Un documento (o sección de la información del tercero, F2) que pide el flujo, como tarjeta propia (`MarcoDeTarjetaDeEstado`, el mismo marco del portal del tercero) con el tono
 * del estado para quien revisa: el título con su estado y sus acciones (Ver, Eximir) en la cabecera, una línea con su versión y su vigencia, los datos que declaró el tercero, el
 * bloque de la revisión automática (qué leyó la IA y cómo cruza con lo declarado) y, al pie, las áreas que lo revisan con su estado, sus veredictos sobre la versión y «Aprobar u
 * observar» cuando le toca a quien mira (RQ-4). Una sección muestra en su lugar la completitud para la empresa, los cambios, sus datos y sus soportes (DetalleSeccionRequisito).
 */
export function TarjetaRequisito({
  expediente,
  requisito,
  areas,
  contexto,
  nombres,
  puedeVer,
  onVer,
  onAccion,
  decidirPorDocumento = false,
  hechos,
  documentos = [],
  cuentasEnSuTarjeta = false,
  datosAparte = false,
  conAreas = true,
}: TarjetaRequisitoProps) {
  const { t } = useTranslation();
  const version = requisito.versionActual;
  const seccion = requisito.seccion ?? null;
  const visor = seccion ? null : documentoEnVisor(requisito, hechos);
  const eximir = puedeEximir(expediente, requisito, contexto(null).scopes);
  const aviso = avisoDelRequisito(requisito, visor, t);
  const vigencia = visor?.vigencia ?? null;
  const persona = textoDelRequisito(requisito.persona, t);
  const apariencia = aparienciaParaElRevisor(requisito);

  return (
    <MarcoDeTarjetaDeEstado
      icono={seccion ? ClipboardList : FileText}
      tono={apariencia.tono}
      resaltar={apariencia.resaltar}
      tenue={apariencia.tenue}
      titulo={requisito.tipoDocumento.nombre}
      // El documento de una persona relacionada (ADR-0010): de quién es, o que nadie cumple todavía el rol.
      persona={persona ? <span data-persona-del-requisito="">{persona}</span> : undefined}
      meta={
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <span title={version ? t('expedientes.requisitos.hash', { hash: version.sha256 }) : undefined}>
            {requisito.obligatorio ? t('expedientes.requisitos.obligatorio') : t('expedientes.requisitos.opcional')}
            {version && ` · ${t('expedientes.requisitos.version', { n: String(version.n), fecha: formatearFecha(version.cargadaEn) })}`}
            {visor?.sinArchivo && ` · ${t('expedientes.datosDeclarados.formulario')}`}
          </span>
          {vigencia && <ChipVigencia vigencia={vigencia} />}
        </Stack>
      }
      chip={<ChipEstado estado={requisito.estado} />}
      accionesDeCabecera={
        <>
          {/* Una versión de solo formulario no tiene archivo que ver: sus datos van abajo, en la misma tarjeta. */}
          {visor && !visor.sinArchivo && <BotonVerVersion documento={visor} puedeVerArchivo={puedeVer} onVer={onVer} />}
          {eximir && (
            <Button variant="text" onClick={() => onAccion({ tipo: 'eximir', requisito })} sx={{ color: 'text.secondary' }}>
              {t('expedientes.requisitos.eximirAccion')}
            </Button>
          )}
        </>
      }
      cuerpo={
        <>
          {/* Un solo aviso, el más importante: retiro de la versión, discrepancia crítica, vencimiento o, en una franja sutil, archivo sin lectura automática. */}
          {aviso && (
            <Alert
              severity={aviso.severidad}
              sx={[{ typography: 'body2', py: 0 }, aviso.severidad === 'info' && { bgcolor: 'superficie.nivel2', color: 'text.secondary', '& .MuiAlert-icon': { color: 'text.secondary' } }]}
            >
              {aviso.texto}
            </Alert>
          )}
          {/* Lo que el tercero declaró en la versión (un formulario); lo que dice la máquina del documento va en su propio bloque, más abajo. */}
          {visor && <ResumenVersion datos={visor.datosDeclarados ?? []} limite={6} compacto />}
          {/* La lectura del archivo (confianza, lo leído, cuándo y con qué modelo), lo que respalda y el resumen de su cruce: un bloque aparte, tintado como el encabezado de las tablas. */}
          {!seccion && (
            <RevisionDelDocumento
              hechos={visor && !visor.sinArchivo ? visor.hechos : null}
              tipoEsperado={visor?.tipoEsperado}
              soporte={requisito.soporteDeSecciones}
              antiguedad={version?.antiguedad}
              sinCruce={soporteSinCruce(requisito, visor)}
              cuentasEnSuTarjeta={cuentasEnSuTarjeta}
            />
          )}
          {/* Lo que decidió la revisión automática en cada área (ADR-0012): sugerencia, aprobación del sistema o pase a una persona. */}
          {!seccion && <RevisionesAutomaticasDelRequisito expediente={expediente} requisito={requisito} areas={areas} contexto={contexto} nombres={nombres} />}
          {seccion && (
            <DetalleSeccionRequisito
              requisito={requisito}
              seccion={seccion}
              documentos={documentos}
              puedeVer={puedeVer}
              onVer={onVer}
              empresaId={expediente.empresaId}
              terceroId={expediente.tercero.id}
              sinDatos={datosAparte}
            />
          )}
          {!seccion && !version && requisito.estado === 'Pendiente' && <Typography sx={{ color: 'text.secondary' }}>{t('expedientes.requisitos.sinVersion')}</Typography>}
          {requisito.reenvios > 0 && <Typography sx={{ color: 'text.secondary' }}>{t('expedientes.requisitos.versionesNuevas', { count: requisito.reenvios })}</Typography>}
          {/* Lo que de la ficha del tercero hizo que se pida (EF-6), o que ya no aplica porque lo declarado cambió (EF-5). */}
          {requisito.estado !== 'NoAplica' && (requisito.porQue?.length ?? 0) > 0 && (
            <Typography sx={{ color: 'text.secondary' }} data-por-que="">
              {t('expedientes.requisitos.porQue', { motivos: textoDelPorQue(requisito.porQue ?? []) })}
            </Typography>
          )}
          {requisito.estado === 'NoAplica' && (
            <Typography sx={{ color: 'text.secondary' }} data-no-aplica="">
              {t('expedientes.requisitos.noAplica')}
            </Typography>
          )}
          {requisito.exencion && (
            <Typography>
              {t('expedientes.requisitos.eximido', {
                persona: nombres.get(requisito.exencion.por) ?? t('expedientes.requisitos.persona'),
                fecha: formatearFecha(requisito.exencion.fecha),
                justificacion: requisito.exencion.justificacion,
              })}
            </Typography>
          )}
        </>
      }
      // Las áreas que lo revisan y su avance, al pie de la tarjeta, separadas por un filete.
      pie={
        conAreas ? <AreasDelRequisito expediente={expediente} requisito={requisito} areas={areas} contexto={contexto} nombres={nombres} onAccion={onAccion} decidirPorDocumento={decidirPorDocumento} /> : undefined
      }
    />
  );
}
