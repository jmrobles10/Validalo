import { Stack } from '@mui/material';
import type { DatoDeclaradoDto, HechosDto, VigenciaDto } from '@validalo/api-client';
import { estadoRevision } from './revisionIa';
import { DatosDeclarados } from './DatosDeclarados';
import { RevisionAutomatica, type TipoEsperado } from './RevisionAutomatica';
import { VigenciaDocumento } from './VigenciaDocumento';

export interface ResumenVersionProps {
  datos: readonly DatoDeclaradoDto[];
  vigencia?: VigenciaDto | null;
  /** Cuántos datos se muestran antes de «Ver n datos más» (sin límite, todos). */
  limite?: number;
  conTitulo?: boolean;
  /** Hechos de la versión con archivo: la revisión automática (IA-11). Una versión de solo formulario no los pasa. */
  hechos?: HechosDto | null;
  tipoEsperado?: TipoEsperado | null;
  /** En la tarjeta del requisito: sin la vigencia, la línea de «sin análisis» ni el pie «Analizado el …», que la tarjeta resume en un solo aviso y en una sola línea al pie. */
  compacto?: boolean;
}

/**
 * Lo que se revisa de una versión además del archivo (o en lugar de él, si es un formulario): el aviso y el estado de
 * su vigencia, los datos declarados y la revisión automática de la IA.
 */
export function ResumenVersion({ datos, vigencia, limite, conTitulo, hechos, tipoEsperado, compacto = false }: ResumenVersionProps) {
  const estado = estadoRevision(hechos);
  const conRevision = compacto ? estado === 'conIa' : estado !== 'nada';
  const conVigencia = Boolean(vigencia) && !compacto;
  if (datos.length === 0 && !conVigencia && !conRevision) return null;
  return (
    <Stack spacing={1}>
      {conVigencia && vigencia && <VigenciaDocumento vigencia={vigencia} />}
      <DatosDeclarados datos={datos} limite={limite} conTitulo={conTitulo} />
      {conRevision && <RevisionAutomatica hechos={hechos} tipoEsperado={tipoEsperado} limite={limite} sinPie={compacto} />}
    </Stack>
  );
}
