import { Box, Button } from '@mui/material';
import { SCOPES, type EmpresaDto } from '@validalo/api-client';
import { EsqueletoTarjeta, EstadoVacio } from '@validalo/ui';
import { Ban, Building2, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogoConfirmacion, EncabezadoPagina, ErrorRecuperable, SinPermiso, Tarjeta } from '../../../shared/componentes';
import { mensajeDeError } from '../../../shared/errores';
import { usePermisos } from '../../../shared/usePermisos';
import { useAvisos } from '../../../shared/useAvisos';
import { useEmpresaActiva, useEmpresas } from '../../empresas/useEmpresas';
import { useDesactivarEmpresa } from './api';
import { DetalleEmpresa } from './DetalleEmpresa';
import { DialogoEmpresa } from './DialogoEmpresa';
import { ListaEmpresas } from './ListaEmpresas';
import { identificacionVisible } from './modelo';

/**
 * Lista a la izquierda y detalle a la derecha desde `lg` (con la barra de Configuración al lado, antes el detalle quedaría demasiado angosto para sus textos legales); por
 * debajo, una sobre otra.
 */
const COLUMNAS = { xs: 'minmax(0, 1fr)', lg: '320px minmax(0, 1fr)' } as const;

/** Razones sociales del grupo (ADR-0008): alta, desactivación y sus textos legales versionados. */
export function PaginaEmpresas() {
  const { t } = useTranslation();
  const { empresa: activa } = useEmpresaActiva();
  const permisos = usePermisos(activa.id);
  const puede = permisos.puede(SCOPES.empresasAdministrar);
  const consulta = useEmpresas();
  const desactivar = useDesactivarEmpresa();
  const mostrar = useAvisos((s) => s.mostrar);
  const [elegidaId, setElegidaId] = useState<string | null>(null);
  const [creando, setCreando] = useState<string | null>(null);
  const [porDesactivar, setPorDesactivar] = useState<EmpresaDto | null>(null);

  if (!puede) return <SinPermiso seccion={t('nav.empresas')} />;

  const empresas = [...(consulta.data ?? [])].sort((a, b) => Number(b.activa) - Number(a.activa) || a.nombre.localeCompare(b.nombre, 'es'));
  const elegida = empresas.find((e) => e.id === elegidaId) ?? empresas[0] ?? null;

  const confirmarDesactivar = (e: EmpresaDto) =>
    desactivar.mutate(e.id, {
      onSuccess: () => mostrar(t('empresasGrupo.desactivada', { nombre: e.nombre })),
      onError: (error) => mostrar(mensajeDeError(error, t), 'error'),
      onSettled: () => setPorDesactivar(null),
    });

  return (
    <>
      <EncabezadoPagina
        titulo={t('empresasGrupo.titulo')}
        subtitulo={t('empresasGrupo.ayuda')}
        acciones={
          <Button variant="contained" startIcon={<Plus size={16} aria-hidden />} onClick={() => setCreando(crypto.randomUUID())}>
            {t('empresasGrupo.nueva')}
          </Button>
        }
      />
      {consulta.isError && (
        <Box sx={{ mb: 1.5 }}>
          <ErrorRecuperable mensaje={mensajeDeError(consulta.error, t)} onReintentar={() => void consulta.refetch()} />
        </Box>
      )}
      {consulta.isPending && (
        <Box role="status" aria-busy="true" aria-label={t('empresasGrupo.titulo')} sx={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 2, alignItems: 'start' }}>
          <EsqueletoTarjeta lineas={2} alto={140} />
          <EsqueletoTarjeta lineas={5} alto={260} />
        </Box>
      )}
      {consulta.data && empresas.length === 0 && (
        <Tarjeta etiqueta={t('empresasGrupo.lista')}>
          <EstadoVacio compacto icono={Building2} titulo={t('empresasGrupo.vacio')} texto={t('empresasGrupo.vacioAyuda')} />
        </Tarjeta>
      )}
      {elegida && (
        <Box sx={{ display: 'grid', gridTemplateColumns: COLUMNAS, gap: 2, alignItems: 'start' }}>
          <ListaEmpresas empresas={empresas} elegidaId={elegida.id} onElegir={setElegidaId} onDesactivar={setPorDesactivar} />
          <DetalleEmpresa empresa={elegida} puedeLeerTextos={permisos.puede(SCOPES.configuracionLeer)} puedeEscribirTextos={permisos.puede(SCOPES.configuracionEscribir)} />
        </Box>
      )}

      {creando && (
        <DialogoEmpresa
          claveIdempotencia={creando}
          onCerrar={() => setCreando(null)}
          onGuardada={(empresa) => {
            setElegidaId(empresa.id);
            setCreando(null);
          }}
        />
      )}
      {porDesactivar && (
        <DialogoConfirmacion
          titulo={t('empresasGrupo.desactivarTitulo', { nombre: porDesactivar.nombre })}
          subtitulo={identificacionVisible(porDesactivar.identificacion)}
          mensaje={porDesactivar.id === activa.id ? `${t('empresasGrupo.confirmarDesactivar')} ${t('empresasGrupo.esLaActiva')}` : t('empresasGrupo.confirmarDesactivar')}
          confirmar={t('empresasGrupo.desactivar')}
          icono={<Ban size={16} aria-hidden />}
          ocupado={desactivar.isPending}
          onConfirmar={() => confirmarDesactivar(porDesactivar)}
          onCerrar={() => setPorDesactivar(null)}
        />
      )}
    </>
  );
}
