import { Alert, AlertTitle, LinearProgress } from '@mui/material';
import { FileSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LecturaDelSoporte, SoporteSubido } from './propuestas';

interface Props {
  /** Lo que se sabe de la lectura; la propuesta con valores no va aquí: la muestra `PropuestaDesdeDocumento`. */
  lectura: Exclude<LecturaDelSoporte, { estado: 'propuesta' }>;
  subido: SoporteSubido;
  onCerrar: () => void;
}

const TEXTOS = { leyendo: 'leyendo', ilegible: 'ilegible', 'sin-lectura': 'sinLectura', 'sin-diferencias': 'sinDiferencias' } as const;
const SEVERIDAD = { leyendo: 'info', ilegible: 'warning', 'sin-lectura': 'info', 'sin-diferencias': 'success' } as const;

/**
 * Lo que la sección dice del documento que el tercero acaba de subir con «Subir un soporte» (FD-10), en un solo aviso: que lo está leyendo (con una barra de
 * avance corta), que no pudo (la IA no está disponible, se agotó el cupo, falló) o que no se lee bien, o que lo leyó y no trae nada distinto. En los tres
 * últimos casos el documento ya quedó marcado como soporte y el tercero diligencia con el documento a la vista; el aviso se cierra.
 */
export function AvisoDeLectura({ lectura, subido, onCerrar }: Props) {
  const { t } = useTranslation();
  const clave = TEXTOS[lectura.estado];
  const titulo = t(`ficha.lectura.${clave}Titulo`);
  const texto = t(`ficha.lectura.${clave}Texto`, { documento: t(`ficha.soporte.tipos.${subido.tipo}.nombre`), n: String(subido.version) });
  const leyendo = lectura.estado === 'leyendo';

  return (
    <Alert
      severity={SEVERIDAD[lectura.estado]}
      icon={<FileSearch size={20} aria-hidden />}
      role="status"
      aria-busy={leyendo}
      aria-label={titulo}
      onClose={leyendo ? undefined : onCerrar}
      sx={{ alignItems: 'center', '& .MuiAlert-message': { minWidth: 0, flex: 1 } }}
    >
      <AlertTitle>{titulo}</AlertTitle>
      {texto}
      {leyendo && <LinearProgress aria-label={t('ficha.lectura.progreso')} sx={{ mt: 1.5, height: 4 }} />}
    </Alert>
  );
}
