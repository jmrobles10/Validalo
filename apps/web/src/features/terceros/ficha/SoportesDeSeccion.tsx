import { Stack, Typography } from '@mui/material';
import { SCOPES, type SoporteSeccionDto, type VinculoEnFichaDto } from '@validalo/api-client';
import { FileText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermisos } from '../../../shared/usePermisos';
import { VisorDocumento, type DocumentoEnVisor } from '../../documentos/VisorDocumento';
import { BotonVerVersion } from '../../expedientes/components/BotonVerVersion';
import { soporteEnVisor } from '../../expedientes/secciones';
import { useEmpresaActiva } from '../../empresas/useEmpresas';
import { SeccionFicha } from '../SeccionesVinculo';

interface Abierto {
  vinculoId: string;
  documento: DocumentoEnVisor;
}

/**
 * Los documentos que respaldan la sección: cada uno en una fila con su ícono, su nombre y el botón de texto «Ver» (centrado en la fila), que abre el documento en el visor si la
 * empresa lo tiene compartido en alguno de los vínculos del tercero. Si no lo puede ver, la fila dice por qué en lugar de quedarse sin nada.
 */
export function SoportesDeSeccion({ empresaId, soportes, vinculos }: { empresaId: string; soportes: readonly SoporteSeccionDto[]; vinculos: readonly VinculoEnFichaDto[] }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  return (
    <SeccionFicha titulo={t('fichaMaestra.soportes')}>
      {soportes.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {t('fichaMaestra.sinSoportes')}
        </Typography>
      ) : (
        <Stack component="ul" spacing={0.75} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {soportes.map((s) => (
            <Soporte key={`${s.documentoId}-${String(s.version)}`} empresaId={empresaId} soporte={s} vinculos={vinculos} onVer={(vinculoId, documento) => setAbierto({ vinculoId, documento })} />
          ))}
        </Stack>
      )}
      {abierto && <VisorDocumento empresaId={empresaId} vinculoId={abierto.vinculoId} documento={abierto.documento} onCerrar={() => setAbierto(null)} />}
    </SeccionFicha>
  );
}

/** El soporte en alguno de los vínculos del tercero con la empresa (compartido en esa versión), con el vínculo que lo trae. */
function compartido(soporte: SoporteSeccionDto, vinculos: readonly VinculoEnFichaDto[]): { vinculoId: string; documento: DocumentoEnVisor } | null {
  for (const v of vinculos) {
    const documento = soporteEnVisor(soporte, v.documentos ?? []);
    if (documento) return { vinculoId: v.vinculo.id, documento };
  }
  return null;
}

interface SoporteProps {
  empresaId: string;
  soporte: SoporteSeccionDto;
  vinculos: readonly VinculoEnFichaDto[];
  onVer: (vinculoId: string, documento: DocumentoEnVisor) => void;
}

/** Un soporte: «Ver» lo abre si la empresa lo puede ver; si no, la fila dice si es porque el tercero no lo compartió o porque la persona no puede leer documentos. */
function Soporte({ empresaId, soporte, vinculos, onVer }: SoporteProps) {
  const { t } = useTranslation();
  const { empresa } = useEmpresaActiva();
  const permisos = usePermisos(empresaId);
  const puedeDescargar = permisos.puede(SCOPES.documentosDescargar);
  const visible = compartido(soporte, vinculos);
  // Sin `documentos:leer` la API no manda los documentos de ningún vínculo (nulo): ahí no se sabe si el tercero lo compartió.
  const sinPermisoDeLectura = vinculos.length > 0 && vinculos.every((v) => v.documentos === null);
  // Una versión de solo formulario se abre en «solo datos»; un archivo pide poder descargar.
  const noSePuedeAbrir = visible !== null && !visible.documento.sinArchivo && !puedeDescargar;
  const motivo = visible === null ? (sinPermisoDeLectura ? t('fichaMaestra.soporteSinPermisoDeLectura') : t('fichaMaestra.soporteNoCompartido', { empresa: empresa.nombre })) : noSePuedeAbrir ? t('fichaMaestra.soporteSinPermisoParaVer') : null;
  return (
    <Stack
      component="li"
      direction="row"
      spacing={1.25}
      useFlexGap
      sx={{ alignItems: 'center', flexWrap: 'wrap', minHeight: 44, py: 0.5, pl: 1.5, pr: 0.75, bgcolor: 'superficie.nivel2', borderRadius: (th) => `${String(th.radio.md)}px` }}
    >
      <FileText size={16} strokeWidth={1.75} aria-hidden style={{ flex: 'none', opacity: 0.7 }} />
      <Typography variant="body2" sx={{ flex: '1 1 12rem', minWidth: 0 }}>
        {visible ? t('fichaMaestra.soporteVisible', { tipo: visible.documento.tipo, n: String(soporte.version) }) : t('fichaMaestra.soporteDelTercero', { n: String(soporte.version) })}
      </Typography>
      {motivo && (
        <Typography variant="caption" sx={{ color: 'text.secondary', flex: '1 1 14rem', minWidth: 0 }}>
          {motivo}
        </Typography>
      )}
      {visible && <BotonVerVersion documento={visible.documento} puedeVerArchivo={puedeDescargar} variante="text" onVer={(documento) => onVer(visible.vinculoId, documento)} />}
    </Stack>
  );
}
