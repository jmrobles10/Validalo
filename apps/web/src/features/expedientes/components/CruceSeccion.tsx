import { Alert, Box, Chip, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { CampoCruzadoDto, CruceDeRequisitoDto, CruceDeSeccionDto } from '@validalo/api-client';
import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SeccionFicha } from '../../terceros/SeccionesVinculo';
import { esResultadoCruce, porcentaje, tonoDeCampo } from '../cruce';

/**
 * Cruce de la sección con los documentos que la respaldan (F5, FM-8): por documento, la tabla campo por campo con lo
 * declarado, lo que dice el documento y el resultado, y el aviso de discrepancias críticas (FM-13). Sin análisis de IA para
 * la empresa, revisión manual. Es evidencia: no decide nada.
 */
export function CruceSeccion({ cruce }: { cruce: CruceDeRequisitoDto }) {
  const { t } = useTranslation();
  return (
    <SeccionFicha titulo={t('cruce.titulo')}>
      <Stack spacing={1.5}>
        {cruce.discrepanciaCritica && <Alert severity="error">{t('cruce.discrepanciaCritica')}</Alert>}
        {cruce.estado === 'SinDocumento' && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('cruce.sinDocumento')}
          </Typography>
        )}
        {cruce.sinCruce.length > 0 && (
          <Alert severity="info">
            {t('cruce.manual', { documentos: cruce.sinCruce.map((d) => t('fichaEmpresa.requisito.soporte', { tipo: d.nombreDocumento, n: String(d.version) })).join(', ') })}
          </Alert>
        )}
        {cruce.cruces.map((c) => (
          <TablaCruce key={`${c.documentoId}-${String(c.versionDocumento)}`} cruce={c} />
        ))}
        {cruce.cruces.length > 0 && (
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {t('cruce.evidencia')}
          </Typography>
        )}
      </Stack>
    </SeccionFicha>
  );
}

/**
 * La tabla del cruce con una versión de documento; `camposExtra` son filas que el documento trae aparte del cruce (la antigüedad frente al máximo de su tipo). `conEncabezado`
 * (por omisión) pone encima el título, la confianza y los conteos; dentro de una sección plegable del bloque «Revisión automática» ya los dice su línea de resumen.
 *
 * Lo que coincide va sobrio (texto secundario con un check pequeño gris, sin barra ni color); lo que difiere o no se pudo verificar va resaltado (fondo y barra ámbar suaves y
 * el resultado en ámbar) y, si es un campo crítico que difiere, en rojo.
 */
export function TablaCruce({ cruce, camposExtra = [], conEncabezado = true }: { cruce: CruceDeSeccionDto; camposExtra?: readonly CampoCruzadoDto[]; conEncabezado?: boolean }) {
  const { t } = useTranslation();
  const titulo = t('cruce.tituloCon', { documento: cruce.nombreDocumento, n: String(cruce.versionDocumento) });
  const vacio = t('cruce.vacio');
  return (
    <Stack spacing={0.75}>
      {conEncabezado && (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="subtitle2" component="p">
            {titulo}
          </Typography>
          <Chip size="small" variant="outlined" label={t('cruce.confianza', { valor: porcentaje(Number(cruce.confianza)) })} />
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {t('cruce.resumen', { coinciden: String(cruce.coincidencias), difieren: String(cruce.discrepancias), noVerificables: String(cruce.noVerificables) })}
          </Typography>
        </Stack>
      )}
      {!cruce.legible && <Alert severity="warning">{t('cruce.ilegible')}</Alert>}
      <TableContainer sx={{ border: 1, borderColor: 'borde.sutil', borderRadius: (th) => `${String(th.radio.sm)}px`, overflowX: 'auto', bgcolor: 'background.paper' }}>
        <Table size="small" aria-label={titulo} sx={{ '& .MuiTableCell-head': { bgcolor: 'superficie.nivel2' } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('cruce.campo')}</TableCell>
              <TableCell>{t('cruce.declarado')}</TableCell>
              <TableCell>{t('cruce.documento')}</TableCell>
              <TableCell>{t('cruce.resultado')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...cruce.campos, ...camposExtra].map((campo, i) => {
              // Coincide: sobrio. Difiere o sin verificar: ámbar; un crítico que difiere, rojo.
              const tono = tonoDeCampo(campo);
              const bien = tono === 'exito';
              const alerta = tono === 'error' ? 'error' : 'advertencia';
              const resultado = esResultadoCruce(campo.resultado) ? t(`cruce.resultados.${campo.resultado}`) : campo.resultado;
              return (
                <TableRow
                  key={`${campo.campo}-${String(i)}`}
                  data-resultado={campo.resultado}
                  data-resaltada={bien ? undefined : alerta}
                  aria-label={`${campo.etiqueta}: ${resultado}`}
                  sx={bien ? undefined : { bgcolor: `estado.${alerta}.fondo`, '&:hover': { bgcolor: `estado.${alerta}.fondo` } }}
                >
                  <TableCell sx={{ borderLeft: 3, borderLeftColor: bien ? 'transparent' : `estado.${alerta}.solido`, typography: 'subtitle2' }}>
                    {campo.etiqueta}
                    {campo.critico && <Chip size="small" variant="outlined" label={t('cruce.critico')} sx={{ ml: 1 }} />}
                  </TableCell>
                  <TableCell>{campo.declarado ?? vacio}</TableCell>
                  <TableCell>{campo.extraido ?? vacio}</TableCell>
                  <TableCell sx={{ color: bien ? 'text.secondary' : `estado.${alerta}.texto` }}>
                    {bien ? (
                      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                        <Check size={14} strokeWidth={1.75} aria-hidden />
                        {resultado}
                      </Box>
                    ) : (
                      resultado
                    )}
                    {campo.detalle && (
                      <Typography variant="caption" component="span" sx={{ display: 'block', color: 'text.secondary' }}>
                        {campo.detalle}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
