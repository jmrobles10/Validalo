import { Alert, Box, Chip, Stack, Typography } from '@mui/material';
import type { SeccionRespaldadaDto, SoporteDeSeccionesDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { SeccionFicha } from '../../terceros/SeccionesVinculo';
import { TablaCruce } from './CruceSeccion';
import { nombreDeSeccionRespaldada } from './textoDelSoporte';

/**
 * Lo que un documento exigido respalda de la ficha del tercero (F5, «Usar como soporte»): por cada sección que respalda, su
 * versión vigente y el resultado del cruce con esta versión del documento. Es evidencia: no decide nada. En la tarjeta del requisito
 * (`compacto`) solo van los cruces que existen; qué respalda y el aviso de que no hay con qué cruzar van en su pie (`PieDelRequisito`) y
 * la discrepancia crítica en su aviso único.
 */
export function SoporteDeSecciones({ soporte, compacto = false }: { soporte: SoporteDeSeccionesDto; compacto?: boolean }) {
  const { t } = useTranslation();
  if (soporte.secciones.length === 0 && !soporte.sinAnalisis) return null;
  if (compacto) {
    const conCruce = soporte.secciones.filter((s) => s.cruce);
    if (conCruce.length === 0) return null;
    return (
      <Box component="section" aria-label={t('cruce.soporte.titulo')}>
        <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {conCruce.map((s) => (
            <FilaDeSeccion key={`${s.seccion}-${String(s.periodo ?? '')}`} respaldada={s} />
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
            <FilaDeSeccion key={`${s.seccion}-${String(s.periodo ?? '')}`} respaldada={s} />
          ))}
        </Stack>
      </Stack>
    </SeccionFicha>
  );
}

function FilaDeSeccion({ respaldada }: { respaldada: SeccionRespaldadaDto }) {
  const { t } = useTranslation();
  const { cruce } = respaldada;
  const esCuenta = respaldada.seccion === 'CUENTAS_BANCARIAS';
  const nombre = nombreDeSeccionRespaldada(respaldada, t);
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
        {cruce && (
          <>
            <Chip
              size="small"
              variant="outlined"
              color={cruce.discrepanciaCritica ? 'error' : cruce.discrepancias > 0 ? 'warning' : 'success'}
              label={cruce.discrepanciaCritica ? t('cruce.soporte.criticas') : cruce.discrepancias > 0 ? t('cruce.soporte.difiere', { count: cruce.discrepancias }) : t('cruce.soporte.coincide')}
            />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('cruce.resumen', { coinciden: String(cruce.coincidencias), difieren: String(cruce.discrepancias), noVerificables: String(cruce.noVerificables) })}
            </Typography>
          </>
        )}
      </Stack>
      {cruce && <TablaCruce cruce={cruce} />}
    </Stack>
  );
}
