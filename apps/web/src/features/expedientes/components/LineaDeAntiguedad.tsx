import { Stack, Typography } from '@mui/material';
import type { CampoCruzadoDto, VersionRequisitoDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { tonoDeCampo } from '../cruce';
import { IconoDelResumen } from './IconoDelResumen';

/** El tono de la línea según el resultado del campo: coincide en éxito, difiere en error si es crítico (advertencia si no) y lo que no se pudo verificar, en advertencia. */
const tonoDeLaLinea = (campo: Pick<CampoCruzadoDto, 'resultado' | 'critico'>) => {
  const tono = tonoDeCampo(campo);
  return tono === 'neutro' ? 'advertencia' : tono;
};

/**
 * La antigüedad del documento frente al máximo que pide su tipo, en una línea con el tono de su resultado: «Antigüedad: 860 días, máximo 30» (error si la pasa y es crítico),
 * «Antigüedad: 12 días, máximo 30» (éxito) o «Antigüedad: sin fecha de expedición, máximo 30 días» (advertencia, no se pudo verificar). El detalle de la API («Expedida el
 * 17/07/2024: 860 días; el máximo es 30.») va en el `title`. Sin regla de antigüedad en el tipo (la API no manda el campo), no se pinta.
 */
export function LineaDeAntiguedad({ antiguedad }: { antiguedad: VersionRequisitoDto['antiguedad'] }) {
  const { t } = useTranslation();
  const campo = antiguedad?.campo ?? null;
  if (!antiguedad || !campo) return null;
  const texto =
    antiguedad.dias === null
      ? t('cruce.antiguedad.sinFecha', { maximo: String(antiguedad.maximoDias) })
      : t('cruce.antiguedad.linea', { count: antiguedad.dias, maximo: String(antiguedad.maximoDias) });
  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', minWidth: 0 }} data-antiguedad="" title={campo.detalle ?? antiguedad.detalle}>
      <IconoDelResumen tono={tonoDeLaLinea(campo)} />
      <Typography variant="body2" sx={{ minWidth: 0 }}>
        {texto}
      </Typography>
    </Stack>
  );
}
