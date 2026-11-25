import { esErrorApi, SCOPES } from '@validalo/api-client';
import { PaginaEstado } from '@validalo/ui';
import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useScrollPropio } from '../../../sesion/alturaFija';
import { EnlaceVolver, ErrorRecuperable, SinPermiso } from '../../../shared/componentes';
import { mensajeDeError } from '../../../shared/errores';
import { usePermisos } from '../../../shared/usePermisos';
import { useEmpresaActiva } from '../../empresas/useEmpresas';
import { useVinculo } from '../../vinculos/api';
import { FichaVinculo } from '../../vinculos/ficha/FichaVinculo';
import { EsqueletoFicha } from '../../vinculos/ficha/EsqueletoFicha';
import { useExpediente } from '../api';

/**
 * Un expediente (desde la bandeja, una notificación o un enlace): se revisa en la ficha de su vínculo, abierta en el sector Aprobaciones y
 * con **este** expediente aunque el vínculo tenga otro abierto. Volver lleva a la bandeja.
 */
export function DetalleExpediente() {
  const { t } = useTranslation();
  useScrollPropio();
  const { expedienteId = '' } = useParams();
  const { empresa } = useEmpresaActiva();
  const permisos = usePermisos(empresa.id);
  const consulta = useExpediente(empresa.id, expedienteId);
  const vinculo = useVinculo(empresa.id, consulta.data?.vinculoId ?? '');

  if (!permisos.puede(SCOPES.expedientesLeer)) return <SinPermiso seccion={t('nav.bandeja')} />;

  const volver = <EnlaceVolver a={`/e/${empresa.id}/bandeja`}>{t('nav.bandeja')}</EnlaceVolver>;
  const error = consulta.isError ? consulta.error : vinculo.isError ? vinculo.error : null;

  if (error) {
    if (esErrorApi(error) && error.esNoEncontrado) {
      return <PaginaEstado icono={SearchX} titulo={t('expedientes.noEncontrado')} texto={t('expedientes.noEncontradoAyuda')} acciones={volver} />;
    }
    return (
      <>
        {volver}
        <ErrorRecuperable mensaje={mensajeDeError(error, t)} onReintentar={() => void (consulta.isError ? consulta.refetch() : vinculo.refetch())} />
      </>
    );
  }
  if (!consulta.data || !vinculo.data) return <EsqueletoFicha sector="aprobaciones" volver={volver} />;

  return <FichaVinculo vinculo={vinculo.data} expedienteId={consulta.data.id} sectorPorDefecto="aprobaciones" volver={volver} />;
}
