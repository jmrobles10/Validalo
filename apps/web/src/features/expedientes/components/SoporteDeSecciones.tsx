import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import type { CampoCruzadoDto, SeccionRespaldadaDto, SoporteDeSeccionesDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { SeccionFicha } from '../../terceros/SeccionesVinculo';
import { resumirCruce, textoDelResumen, tonoDelResumen, type ResumenDeCruce } from '../resumenDeCruce';
import { TablaCruce } from './CruceSeccion';
import { IconoDelResumen } from './IconoDelResumen';
import { enLineaDeResumen, nombreDeSeccionRespaldada, SECCION_CUENTAS } from './textoDelSoporte';

/**
 * Lo que un documento exigido respalda de la ficha del tercero (F5, «Usar como soporte»): por cada sección que respalda, su
 * versión vigente y el resultado del cruce con esta versión del documento. Es evidencia: no decide nada. En la tarjeta del requisito
 * (`compacto`) solo van los cruces que existen; qué respalda y el aviso de que no hay con qué cruzar van en su pie (`PieDelRequisito`) y
 * la discrepancia crítica en su aviso único.
 *
 * `cuentasEnSuTarjeta`: la tarjeta de la cuenta designada ya muestra el cruce de la certificación con la cuenta (resumen y comparación): aquí cada
 * cuenta queda en una sola línea de resumen, sin repetir la tabla.
 */
export function SoporteDeSecciones({
  soporte,
  compacto = false,
  cuentasEnSuTarjeta = false,
  campoExtra = null,
}: {
  soporte: SoporteDeSeccionesDto;
  compacto?: boolean;
  cuentasEnSuTarjeta?: boolean;
  /** Una fila más para la tabla del cruce (la antigüedad del documento): va en la primera que se muestre, no en todas. */
  campoExtra?: CampoCruzadoDto | null;
}) {
  const { t } = useTranslation();
  if (soporte.secciones.length === 0 && !soporte.sinAnalisis) return null;
  const filaConTabla = soporte.secciones.find((s) => s.cruce && !enLineaDeResumen(s, cuentasEnSuTarjeta));
  if (compacto) {
    const conCruce = soporte.secciones.filter((s) => s.cruce);
    if (conCruce.length === 0) return null;
    return (
      <Box component="section" aria-label={t('cruce.soporte.titulo')}>
        <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {conCruce.map((s) => (
            <FilaDeSeccion key={`${s.seccion}-${String(s.periodo ?? '')}`} respaldada={s} enLinea={enLineaDeResumen(s, cuentasEnSuTarjeta)} campoExtra={s === filaConTabla ? campoExtra : null} />
          ))}
        </Stack>
      </Box>
    );
  }
  return (
    <SeccionFicha titulo={t('cruce.soporte.titulo')}>
      <Stack spacing={1.25}>
        {soporte.discrepanciaCritica && <Alert severity="error">{t('cruce.discrepanciaCritica')}</Alert>}
        {soporte.sinAnalisis && <Alert severity="info">{t('cruce.soporte.sinAnalisis')}</Alert>}
        <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {soporte.secciones.map((s) => (
            <FilaDeSeccion key={`${s.seccion}-${String(s.periodo ?? '')}`} respaldada={s} enLinea={enLineaDeResumen(s, cuentasEnSuTarjeta)} campoExtra={s === filaConTabla ? campoExtra : null} />
          ))}
        </Stack>
      </Stack>
    </SeccionFicha>
  );
}

type ColorDelChip = 'error' | 'warning' | 'success';

/**
 * El chip del resultado de un cruce, con la misma regla que el resumen de la cuenta: difiere en lo crítico en rojo; algo crítico sin verificar (o un documento que no
 * se lee) en ámbar como «Sin verificar»; solo difiere lo que no es crítico, «Difiere en n campos» en ámbar; todo lo crítico coincide, en verde.
 */
function chipDelCruce(resumen: ResumenDeCruce, difieren: number, t: TFunction): { color: ColorDelChip; etiqueta: string } {
  if (resumen.resultado === 'Discrepa') return { color: 'error', etiqueta: t('cruce.soporte.criticas') };
  if (resumen.resultado === 'NoVerificable') return { color: 'warning', etiqueta: t('cruce.soporte.sinVerificar') };
  if (resumen.resultado === 'NoSeLee') return { color: 'warning', etiqueta: t('cruce.soporte.noSeLee') };
  return difieren > 0 ? { color: 'warning', etiqueta: t('cruce.soporte.difiere', { count: difieren }) } : { color: 'success', etiqueta: t('cruce.soporte.coincide') };
}

function FilaDeSeccion({ respaldada, enLinea, campoExtra }: { respaldada: SeccionRespaldadaDto; enLinea: boolean; campoExtra: CampoCruzadoDto | null }) {
  const { t } = useTranslation();
  const { cruce } = respaldada;
  const esCuenta = respaldada.seccion === SECCION_CUENTAS;
  const nombre = nombreDeSeccionRespaldada(respaldada, t);
  const resumen = cruce ? resumirCruce(cruce) : null;

  if (cruce && resumen && enLinea) {
    return (
      <Stack component="li" direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', minWidth: 0 }}>
        <IconoDelResumen tono={tonoDelResumen(resumen.resultado)} />
        <Typography variant="body2" sx={{ minWidth: 0 }}>
          {t('cruce.soporte.lineaDeCuenta', { cuenta: nombre, resumen: textoDelResumen(resumen, t) })}
        </Typography>
      </Stack>
    );
  }

  const chip = cruce && resumen ? chipDelCruce(resumen, cruce.discrepancias, t) : null;
  return (
    <Stack component="li" spacing={0.75} sx={{ minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography component="p" variant="subtitle2">
          {nombre}
        </Typography>
        {cruce === null && (respaldada.version !== null || esCuenta) && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('cruce.soporte.sinCruce')}
          </Typography>
        )}
        {chip && <Chip size="small" variant="outlined" color={chip.color} label={chip.etiqueta} />}
      </Stack>
      {/* Los conteos («6 coinciden · 0 difieren · 1 sin verificar») ya van en el encabezado de la tabla. */}
      {cruce && <TablaCruce cruce={cruce} camposExtra={campoExtra ? [campoExtra] : []} />}
    </Stack>
  );
}
