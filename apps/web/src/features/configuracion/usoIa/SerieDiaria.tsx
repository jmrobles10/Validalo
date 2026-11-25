import { Box, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import type { UsoIaDiaDto } from '@validalo/api-client';
import { SeccionPlana, visualmenteOculto } from '@validalo/ui';
import { ChartColumn, ChartNoAxesColumn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../../shared/componentes';
import { etiquetasDelEje, fechaCorta, formatearConteo, marcasDelEje, mesEnTitulo, momentosDelMes, resumenDeLaSerie, serieDelMes, totalDelDia } from './modelo';

/** Alto de la barra más alta (la del máximo del eje): bajo a propósito, que 30 días con poco uso no dejen un panel vacío. */
const ALTO_BARRAS = 56;
/** Espacio sobre la barra más alta para el valor que se escribe encima de cada barra. */
const ALTO_VALOR = 16;
const ANCHO_EJE_Y = 28;
const COLOR_INCLUIDAS = 'acento.main';
const COLOR_ADICIONALES = 'estado.advertencia.solido';

function Leyenda({ color, texto }: { color: string; texto: string }) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
      <Box aria-hidden sx={{ width: 8, height: 8, borderRadius: '2px', bgcolor: color }} />
      <Typography variant="caption" component="span" sx={{ color: 'text.secondary' }}>
        {texto}
      </Typography>
    </Stack>
  );
}

/**
 * Validaciones por día del mes elegido (incluidas y adicionales apiladas) como barras simples: el título dice el mes y, al lado, cuántas validaciones hubo y en cuántos días; el eje
 * Y marca 0 y el máximo (y la mitad si hay espacio), el eje X rotula el 1 y cada 5 días con su fecha corta y, si el mes es el actual, marca «Hoy» y atenúa los días que faltan. Cada
 * barra lleva su total encima (en pantallas anchas) y un tooltip con el día. Sin pista gris en los días sin uso: solo la línea base y las rayas finas del eje. Sin validaciones en el
 * mes no se dibuja nada: una línea de estado vacío. Las barras son decorativas: el dato accesible va en una tabla visualmente oculta con una fila por día con uso.
 */
export function SerieDiaria({ mes, porDia }: { mes: string; porDia: readonly UsoIaDiaDto[] }) {
  const { t } = useTranslation();
  const serie = serieDelMes(mes, porDia);
  const { validaciones, diasConUso } = resumenDeLaSerie(serie);
  const marcas = marcasDelEje(Math.max(...serie.map(totalDelDia)));
  const tope = marcas[marcas.length - 1] ?? 1;
  const momentos = momentosDelMes(mes, serie.length);
  const etiquetas = etiquetasDelEje(mes, momentos);
  const conUso = serie.filter((d) => totalDelDia(d) > 0);
  const titulo = t('ia.uso.porDiaMes', { mes: mesEnTitulo(mes) });
  const columnas = `repeat(${String(serie.length)}, minmax(0, 1fr))`;
  const alturaPlano = ALTO_BARRAS + ALTO_VALOR;
  const px = (n: number) => `${String(n)}px`;

  return (
    <Box>
      <SeccionPlana titulo={titulo} ayuda={conUso.length > 0 ? t('ia.uso.porDiaResumen', { count: validaciones, dias: String(diasConUso) }) : undefined} icono={ChartColumn}>
        {conUso.length === 0 ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', color: 'text.secondary' }}>
            <ChartNoAxesColumn size={16} strokeWidth={1.75} aria-hidden />
            <Typography variant="body2">{t('ia.uso.porDiaVacio')}</Typography>
          </Stack>
        ) : (
          <Tarjeta>
            <Stack direction="row" spacing={2} sx={{ mb: 1 }}>
              <Leyenda color={COLOR_INCLUIDAS} texto={t('ia.uso.leyendaIncluidas')} />
              <Leyenda color={COLOR_ADICIONALES} texto={t('ia.uso.leyendaAdicionales')} />
            </Stack>
            <Box aria-hidden sx={{ display: 'grid', gridTemplateColumns: `${px(ANCHO_EJE_Y)} minmax(0, 1fr)` }}>
              {/* Eje Y: las marcas enteras con una raya fina a lo ancho del plano. */}
              <Box sx={{ position: 'relative', height: px(alturaPlano) }}>
                {marcas.map((marca) => (
                  <Typography
                    key={marca}
                    variant="caption"
                    component="span"
                    sx={{ position: 'absolute', right: 6, bottom: px((marca / tope) * ALTO_BARRAS), transform: 'translateY(50%)', lineHeight: 1, color: 'text.secondary' }}
                  >
                    {formatearConteo(marca)}
                  </Typography>
                ))}
              </Box>
              <Box sx={{ position: 'relative', height: px(alturaPlano), borderBottom: 1, borderColor: 'divider' }}>
                {marcas
                  .filter((marca) => marca > 0)
                  .map((marca) => (
                    <Box key={marca} data-marca={marca} sx={{ position: 'absolute', insetInline: 0, bottom: px((marca / tope) * ALTO_BARRAS), borderTop: 1, borderColor: 'divider', opacity: 0.6 }} />
                  ))}
                <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: columnas, columnGap: '3px', height: '100%' }}>
                  {serie.map((d, i) => {
                    const total = totalDelDia(d);
                    const alto = (total / tope) * ALTO_BARRAS;
                    return (
                      <Box
                        key={d.dia}
                        data-momento={momentos[i]}
                        title={t('ia.uso.barra', { fecha: fechaCorta(mes, d.dia), incluidas: String(d.incluidas), adicionales: String(d.adicionales) })}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'flex-end',
                          alignItems: 'center',
                          borderRadius: '3px 3px 0 0',
                          bgcolor: momentos[i] === 'hoy' ? 'superficie.nivel1' : undefined,
                        }}
                      >
                        {total > 0 && (
                          <Typography variant="caption" component="span" sx={{ display: { xs: 'none', sm: 'block' }, lineHeight: 1, mb: 0.25, color: 'text.secondary' }}>
                            {formatearConteo(total)}
                          </Typography>
                        )}
                        {total > 0 && (
                          <Box sx={{ width: '100%', maxWidth: 16, height: px(Math.max(alto, 3)), display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                            <Box data-barra="adicionales" sx={{ flex: d.adicionales, bgcolor: COLOR_ADICIONALES, borderRadius: '2px 2px 0 0' }} />
                            <Box data-barra="incluidas" sx={{ flex: d.incluidas, bgcolor: COLOR_INCLUIDAS, borderRadius: d.adicionales > 0 ? 0 : '2px 2px 0 0' }} />
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
              {/* Eje X: fechas cortas cada 5 días y «Hoy»; los días que faltan, atenuados. */}
              <Box />
              <Box sx={{ display: 'grid', gridTemplateColumns: columnas, columnGap: '3px', mt: 0.25 }}>
                {serie.map((d, i) => (
                  // La etiqueta se centra en su columna y se desborda a los lados; las de las últimas columnas se pegan al borde derecho para no salirse (ni cortarse) de la tarjeta.
                  <Box key={d.dia} sx={{ position: 'relative', height: 16 }}>
                    <Typography
                      variant="caption"
                      component="span"
                      sx={{
                        position: 'absolute',
                        top: 0,
                        whiteSpace: 'nowrap',
                        ...(i >= serie.length - 2 ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
                        color: momentos[i] === 'hoy' ? 'text.primary' : 'text.secondary',
                        opacity: momentos[i] === 'futuro' ? 0.55 : 1,
                      }}
                    >
                      {momentos[i] === 'hoy' ? t('ia.uso.hoy') : (etiquetas[i] ?? '')}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>
            <Table size="small" aria-label={titulo} sx={visualmenteOculto}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('ia.uso.dia')}</TableCell>
                  <TableCell>{t('ia.uso.leyendaIncluidas')}</TableCell>
                  <TableCell>{t('ia.uso.leyendaAdicionales')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {conUso.map((d) => (
                  <TableRow key={d.dia}>
                    <TableCell>{d.dia}</TableCell>
                    <TableCell>{formatearConteo(d.incluidas)}</TableCell>
                    <TableCell>{formatearConteo(d.adicionales)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Tarjeta>
        )}
      </SeccionPlana>
    </Box>
  );
}
