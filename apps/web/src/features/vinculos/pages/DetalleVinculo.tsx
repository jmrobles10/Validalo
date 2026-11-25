import { esErrorApi, SCOPES } from '@validalo/api-client';
import { PaginaEstado } from '@validalo/ui';
import { SearchX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';
import { useScrollPropio } from '../../../sesion/alturaFija';
import { EnlaceVolver, ErrorRecuperable, SinPermiso } from '../../../shared/componentes';
import { mensajeDeError } from '../../../shared/errores';
import { usePermisos } from '../../../shared/usePermisos';
import { useEmpresaActiva } from '../../empresas/useEmpresas';
import { useVinculo } from '../api';
import { EsqueletoFicha } from '../ficha/EsqueletoFicha';
import { FichaVinculo } from '../ficha/FichaVinculo';
import { esSector, type Sector } from '../ficha/sectores';

/** Detalle del vínculo: la ficha por sectores, abierta en Información general como la ficha del proveedor del SRM. */
export function DetalleVinculo() {
  const { t } = useTranslation();
  // Encabezado con las acciones siempre a la vista: embebida, la página usa scroll propio.
  useScrollPropio();
  const { vinculoId = '' } = useParams();
  const [parametros] = useSearchParams();
  const pedido = parametros.get('sector');
  const sector: Sector = esSector(pedido) ? pedido : 'general';
  const { empresa } = useEmpresaActiva();
  const permisos = usePermisos(empresa.id);
  const consulta = useVinculo(empresa.id, vinculoId);

  if (!permisos.puede(SCOPES.vinculosLeer)) return <SinPermiso seccion={t('nav.vinculos')} />;

  const volver = <EnlaceVolver a="..">{t('nav.vinculos')}</EnlaceVolver>;

  if (consulta.isPending) return <EsqueletoFicha sector={sector} volver={volver} />;
  if (consulta.isError) {
    if (esErrorApi(consulta.error) && consulta.error.esNoEncontrado) {
      return <PaginaEstado icono={SearchX} titulo={t('vinculos.detalle.noEncontrado')} texto={t('vinculos.detalle.noEncontradoAyuda')} acciones={volver} />;
    }
    return (
      <>
        {volver}
        <ErrorRecuperable mensaje={mensajeDeError(consulta.error, t)} onReintentar={() => void consulta.refetch()} />
      </>
    );
  }

  const vinculo = consulta.data;
  return <FichaVinculo vinculo={vinculo} expedienteId={vinculo.expedienteAbiertoId ?? null} sectorPorDefecto="general" volver={volver} />;
}
