import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRequisitoPublico } from '../shared/api';
import { EsqueletoTarjetas } from '../shared/componentes';
import { MarcoDelDialogoSubir } from './MarcoDelDialogoSubir';
import { destinoFijo } from './parametrosSubida';
import { parametrosDeSolicitud, type SolicitudDeSubida } from './solicitudDeSubida';
import { SubirArchivo } from './SubirArchivo';

/**
 * Subir un documento o una versión nueva sin salir de la pantalla: el mismo contenido que la página `/boveda/subir` (tipo fijo o a elegir, campos de
 * un `ArchivoYFormulario`, reglas y plantilla del tipo, aviso de acceso aislado, progreso y resultado) en un diálogo. Al terminar bien muestra el
 * resultado con «Listo»; no navega a ningún lado. Se abre con `useDialogoSubir().abrir(solicitud)` y lo monta `AnfitrionDeSubida`.
 */
export function DialogoSubir({ solicitud, onCerrar }: { solicitud: SolicitudDeSubida; onCerrar: () => void }) {
  const { t } = useTranslation();
  const parametros = useMemo(() => parametrosDeSolicitud(solicitud), [solicitud]);
  const contexto = useRequisitoPublico(solicitud.expediente ?? null, solicitud.requisito ?? null);

  if (contexto.isLoading) {
    return (
      <MarcoDelDialogoSubir titulo={t('subir.titulo')} onCerrar={onCerrar}>
        <EsqueletoTarjetas cantidad={1} />
      </MarcoDelDialogoSubir>
    );
  }
  // Si la revisión no carga o el requisito ya no está, se sube con las reglas globales (como la página).
  const delRequisito = destinoFijo(parametros) ? (contexto.data ?? null) : null;
  return <SubirArchivo parametros={parametros} delRequisito={delRequisito} onCerrar={onCerrar} />;
}
