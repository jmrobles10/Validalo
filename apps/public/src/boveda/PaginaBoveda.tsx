import { Button } from '@mui/material';
import { EstadoVacio } from '@validalo/ui';
import { FolderOpen, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBoveda } from '../shared/api';
import { CabeceraPagina, ErrorRecuperable, EsqueletoTarjetas } from '../shared/componentes';
import { ContenidoBoveda } from './ContenidoBoveda';
import { DocumentosDePersonas } from './DocumentosDePersonas';
import { useDialogoSubir } from './useDialogoSubir';

/**
 * Mi bóveda: cada documento con su versión vigente y con qué empresas está compartido. Jerarquía en un solo nivel (la página ya es el panel,
 * sin otra tarjeta dentro): el filtro por empresa, lo que hay que renovar y los documentos como filas (`ContenidoBoveda`). Debajo, los documentos de las
 * personas relacionadas (`DocumentosDePersonas`). «Subir documento» abre el diálogo de subida: no saca al tercero de su bóveda.
 */
export function PaginaBoveda() {
  const { t } = useTranslation();
  const consulta = useBoveda();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const subir = (
    <Button onClick={() => abrirSubida({})} variant="contained" startIcon={<Upload size={18} aria-hidden />} sx={{ width: { xs: '100%', sm: 'auto' } }}>
      {t('boveda.subir')}
    </Button>
  );

  return (
    <>
      <CabeceraPagina titulo={t('boveda.titulo')} sub={t('boveda.sub')} accion={subir} />
      {consulta.isPending ? (
        <EsqueletoTarjetas />
      ) : consulta.isError ? (
        <ErrorRecuperable error={consulta.error} onReintentar={() => void consulta.refetch()} />
      ) : consulta.data.documentos.length === 0 ? (
        <EstadoVacio icono={FolderOpen} titulo={t('boveda.vacio')} texto={t('boveda.vacioTexto')} />
      ) : (
        <ContenidoBoveda documentos={consulta.data.documentos} />
      )}
      {!consulta.isPending && !consulta.isError && <DocumentosDePersonas />}
    </>
  );
}
