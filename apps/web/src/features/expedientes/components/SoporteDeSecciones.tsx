import { Alert, Box, ButtonBase, Chip, Stack, Typography } from '@mui/material';
import type { CampoCruzadoDto, CruceDeSeccionDto, SeccionRespaldadaDto, SoporteDeSeccionesDto } from '@validalo/api-client';
import { Check, ChevronDown, ChevronRight } from 'lucide-react';
import type { TFunction } from 'i18next';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SeccionFicha } from '../../terceros/SeccionesVinculo';
import { resumirCruce, seAbreSola, textoDelResumen, tonoDelResumen, type ResumenDeCruce } from '../resumenDeCruce';
import { TablaCruce } from './CruceSeccion';
import { IconoDelResumen } from './IconoDelResumen';
import { enLineaDeResumen, nombreDeSeccionRespaldada, SECCION_CUENTAS } from './textoDelSoporte';

/**
 * Lo que un documento exigido respalda de la ficha del tercero (F5, «Usar como soporte»): por cada sección que respalda, su
 * versión vigente y el resultado del cruce con esta versión del documento. Es evidencia: no decide nada. En la tarjeta del requisito
 * (`compacto`) solo van los cruces que existen; qué respalda y el aviso de que no hay con qué cruzar van en su pie (`PieDelRequisito`) y
 * la discrepancia crítica en su aviso único.
 *
 * Cada sección con cruce es una línea de resumen («Información general · versión 1 — Coincide · 9 coinciden») que se despliega para ver la comparación campo por
 * campo: abierta por omisión solo si algo difiere o no se pudo verificar; las que coinciden por completo van cerradas, para que lo que pide atención no se pierda.
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
        <Stack component="ul" spacing={0.5} sx={{ p: 0, m: 0, listStyle: 'none' }}>
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
        <Stack component="ul" spacing={0.5} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {soporte.secciones.map((s) => (
            <FilaDeSeccion key={`${s.seccion}-${String(s.periodo ?? '')}`} respaldada={s} enLinea={enLineaDeResumen(s, cuentasEnSuTarjeta)} campoExtra={s === filaConTabla ? campoExtra : null} />
          ))}
        </Stack>
      </Stack>
    </SeccionFicha>
  );
}

type TonoDelChip = 'error' | 'warning' | 'neutro';

/**
 * El chip del resultado de un cruce, con la misma regla que el resumen de la cuenta: difiere en lo crítico en rojo; algo crítico sin verificar (o un documento que no
 * se lee) en ámbar como «Sin verificar»; solo difiere lo que no es crítico, «Difiere en n campos» en ámbar; todo lo crítico coincide, neutro (con un check gris: lo que está
 * bien no lleva verde).
 */
function chipDelCruce(resumen: ResumenDeCruce, difieren: number, t: TFunction): { color: TonoDelChip; etiqueta: string } {
  if (resumen.resultado === 'Discrepa') return { color: 'error', etiqueta: t('cruce.soporte.criticas') };
  if (resumen.resultado === 'NoVerificable') return { color: 'warning', etiqueta: t('cruce.soporte.sinVerificar') };
  if (resumen.resultado === 'NoSeLee') return { color: 'warning', etiqueta: t('cruce.soporte.noSeLee') };
  return difieren > 0 ? { color: 'warning', etiqueta: t('cruce.soporte.difiere', { count: difieren }) } : { color: 'neutro', etiqueta: t('cruce.soporte.coincide') };
}

/** «9 coinciden · 1 difiere · 2 sin verificar»: los conteos del cruce que no son cero (el chip ya dice el resultado). */
function conteoDelCruce(cruce: Pick<CruceDeSeccionDto, 'coincidencias' | 'discrepancias' | 'noVerificables'>, t: TFunction): string {
  const partes: string[] = [];
  if (cruce.coincidencias > 0) partes.push(t('cruce.soporte.conteoCoinciden', { count: cruce.coincidencias }));
  if (cruce.discrepancias > 0) partes.push(t('cruce.soporte.conteoDifieren', { count: cruce.discrepancias }));
  if (cruce.noVerificables > 0) partes.push(t('cruce.soporte.conteoSinVerificar', { count: cruce.noVerificables }));
  return partes.join(' · ');
}

function FilaDeSeccion({ respaldada, enLinea, campoExtra }: { respaldada: SeccionRespaldadaDto; enLinea: boolean; campoExtra: CampoCruzadoDto | null }) {
  const { t } = useTranslation();
  const idTabla = useId();
  const { cruce } = respaldada;
  // Lo que la persona eligió; mientras no elija, la comparación va abierta solo si hay algo que mirar.
  const [elegida, setElegida] = useState<boolean | null>(null);
  const esCuenta = respaldada.seccion === SECCION_CUENTAS;
  const nombre = nombreDeSeccionRespaldada(respaldada, t);
  const resumen = cruce ? resumirCruce(cruce) : null;

  if (cruce && resumen && enLinea) {
    return (
      <Stack component="li" direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', minWidth: 0 }}>
        <IconoDelResumen tono={tonoDelResumen(resumen.resultado)} sobrio />
        <Typography variant="body2" sx={{ minWidth: 0 }}>
          {t('cruce.soporte.lineaDeCuenta', { cuenta: nombre, resumen: textoDelResumen(resumen, t) })}
        </Typography>
      </Stack>
    );
  }

  if (!cruce || !resumen) {
    return (
      <Stack component="li" direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
        <Typography component="p" variant="subtitle2">
          {nombre}
        </Typography>
        {(respaldada.version !== null || esCuenta) && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('cruce.soporte.sinCruce')}
          </Typography>
        )}
      </Stack>
    );
  }

  const abierta = elegida ?? seAbreSola(cruce, campoExtra);
  const chip = chipDelCruce(resumen, cruce.discrepancias, t);
  const Chevron = abierta ? ChevronDown : ChevronRight;
  const titulo = esCuenta ? nombre : t('cruce.soporte.seccionResumen', { seccion: respaldada.nombre, n: String(respaldada.version ?? cruce.versionDocumento) });
  return (
    <Box component="li" sx={{ minWidth: 0 }}>
      <ButtonBase
        onClick={() => setElegida(!abierta)}
        aria-expanded={abierta}
        aria-controls={abierta ? idTabla : undefined}
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          columnGap: 1,
          rowGap: 0.25,
          width: '100%',
          justifyContent: 'flex-start',
          textAlign: 'left',
          py: 0.5,
          pr: 0.5,
          borderRadius: (th) => `${String(th.radio.xs)}px`,
          color: 'text.primary',
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <Box component="span" aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: 'text.secondary' }}>
          <Chevron size={16} strokeWidth={1.75} />
        </Box>
        <Typography variant="subtitle2" component="span">
          {titulo}
        </Typography>
        <Chip
          size="small"
          variant="outlined"
          color={chip.color === 'neutro' ? 'default' : chip.color}
          icon={chip.color === 'neutro' ? <Check size={12} strokeWidth={1.75} aria-hidden /> : undefined}
          label={chip.etiqueta}
          sx={chip.color === 'neutro' ? { color: 'text.secondary', borderColor: 'borde.sutil', '& .MuiChip-icon': { color: 'text.secondary' } } : undefined}
        />
        <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>
          {conteoDelCruce(cruce, t)}
        </Typography>
      </ButtonBase>
      {abierta && (
        <Box id={idTabla} sx={{ mt: 0.5, mb: 0.5 }}>
          <TablaCruce cruce={cruce} camposExtra={campoExtra ? [campoExtra] : []} conEncabezado={false} />
        </Box>
      )}
    </Box>
  );
}
