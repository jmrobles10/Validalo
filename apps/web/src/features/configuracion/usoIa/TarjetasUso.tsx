import { Box, IconButton, Link, Tooltip, Typography } from '@mui/material';
import type { UsoIaDto } from '@validalo/api-client';
import { BarraMedida, GrillaKpi, SeccionPlana, TarjetaKpi, type TonoKpi } from '@validalo/ui';
import { ArrowDownToLine, ArrowUpFromLine, CircleDollarSign, CirclePlus, Cpu, Gauge, Info, ListChecks } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { costoAtribuido, formatearConteo, formatearPorcentaje, formatearUsd, nivelDeUso, porcentajeUsado, tokensAtribuidos, URL_USO_OPENAI, type NivelUso } from './modelo';

/** Barra y tarjeta de las incluidas: cian normal, ámbar desde el 80 %, roja al agotarse (con el borde y la cifra de alerta que el tablero da al tono rojo). */
const TONO_INCLUIDAS: Record<NivelUso, TonoKpi> = { normal: 'cian', alerta: 'ambar', agotado: 'rojo' };

/**
 * Lo consumido en el mes con las mismas tarjetas de cifras del Inicio (`TarjetaKpi` en la rejilla del tablero, 3 → 2 → 1 columnas) en dos secciones: «Uso del mes» (validaciones
 * incluidas con una barra fina, validaciones adicionales y costo de IA) y «Tokens» (entrada y salida en tarjetas separadas: no valen lo mismo y nunca se suman). Para la empresa el
 * costo y los tokens son un solo total de todas sus validaciones (IA-15): de dónde salió cada análisis solo lo ve la consola de Plataforma. Devuelve las dos secciones sin
 * separación propia: la da el contenedor de la página.
 */
export function TarjetasUso({ uso }: { uso: UsoIaDto }) {
  const { t } = useTranslation();
  const { plan } = uso;
  const costo = costoAtribuido(uso);
  const tokens = tokensAtribuidos(uso);
  const incluidas = plan.validacionesIncluidasMes;
  const porcentaje = porcentajeUsado(uso.incluidasConsumidas, incluidas);
  const nivel = nivelDeUso(porcentaje);
  const textoPorcentaje = formatearPorcentaje(porcentaje);
  const usadas = formatearConteo(uso.incluidasConsumidas);
  const notaIncluidas =
    nivel === 'agotado'
      ? t('ia.uso.agotadas')
      : nivel === 'alerta'
        ? t('ia.uso.alerta', { porcentaje: textoPorcentaje })
        : t('ia.uso.quedan', { count: uso.incluidasRestantes });
  const notaAdicionales = !plan.adicionalHabilitado
    ? t('ia.uso.sinAdicionalAyuda')
    : plan.topeAdicionalMes === null
      ? t('ia.uso.sinTope')
      : t('ia.uso.tope', { tope: formatearConteo(plan.topeAdicionalMes), restantes: formatearConteo(uso.adicionalesRestantes ?? 0) });

  return (
    <>
      <Box>
        <SeccionPlana titulo={t('ia.uso.seccionUso')} icono={Gauge}>
          <GrillaKpi columnas={3}>
            <TarjetaKpi
              icono={ListChecks}
              tono={TONO_INCLUIDAS[nivel]}
              titulo={t('ia.uso.incluidas')}
              valor={t('ia.uso.incluidasValor', { usadas, incluidas: formatearConteo(incluidas) })}
              detalle={notaIncluidas}
              barra={
                <BarraMedida
                  valor={uso.incluidasConsumidas}
                  maximo={incluidas}
                  tono={TONO_INCLUIDAS[nivel]}
                  etiqueta={t('ia.uso.incluidasAccesible', { usadas, incluidas: formatearConteo(incluidas), porcentaje: textoPorcentaje })}
                />
              }
            />
            <TarjetaKpi
              icono={CirclePlus}
              tono="violeta"
              titulo={t('ia.uso.adicionales')}
              // Sin adicional contratado no hay cifra que dar: el texto va más pequeño que un número.
              valor={
                plan.adicionalHabilitado ? (
                  formatearConteo(uso.adicionalesConsumidas)
                ) : (
                  <Typography component="span" variant="subtitle1" sx={{ color: 'text.secondary' }}>
                    {t('ia.uso.sinAdicional')}
                  </Typography>
                )
              }
              detalle={notaAdicionales}
            />
            <TarjetaKpi
              icono={CircleDollarSign}
              tono="verde"
              etiqueta={t('ia.uso.costo')}
              // El costo es una estimación (tokens por la tarifa que conocemos): el saldo y el límite reales están en la cuenta de OpenAI de la empresa.
              titulo={
                <>
                  {t('ia.uso.costo')}
                  <Tooltip title={t('ia.uso.costoLimite')} arrow>
                    {/* Área de toque de 22 px sin cambiar el alto de la fila de la tarjeta (los márgenes negativos la devuelven a la del ícono). */}
                    <IconButton size="small" sx={{ ml: 0.25, p: 0.5, my: -0.5, verticalAlign: 'middle', color: 'text.secondary' }}>
                      <Info size={14} strokeWidth={1.75} aria-hidden />
                    </IconButton>
                  </Tooltip>
                </>
              }
              valor={`≈ ${formatearUsd(costo)}`}
              detalle={
                <>
                  {t('ia.uso.costoAyuda')}
                  <Box component="span" sx={{ display: 'block' }}>
                    {t('ia.uso.llave', { valor: plan.llaveConfigurada ? t('ia.uso.si') : t('ia.uso.no') })}
                    {plan.llaveConfigurada && (
                      <>
                        {' · '}
                        <Link href={URL_USO_OPENAI} target="_blank" rel="noopener noreferrer" variant="caption">
                          {t('ia.uso.verUsoOpenAi')}
                        </Link>
                      </>
                    )}
                  </Box>
                </>
              }
            />
          </GrillaKpi>
        </SeccionPlana>
      </Box>
      <Box>
        <SeccionPlana titulo={t('ia.uso.seccionTokens')} icono={Cpu}>
          <GrillaKpi columnas={3}>
            <TarjetaKpi
              icono={ArrowDownToLine}
              tono="cian"
              titulo={t('ia.uso.tokensEntrada')}
              valor={formatearConteo(tokens.entrada)}
              detalle={
                <>
                  {t('ia.uso.tokensEntradaNota')}
                  {tokens.enCache > 0 && (
                    <Box component="span" sx={{ display: 'block' }}>
                      {t('ia.uso.tokensCache', { valor: formatearConteo(tokens.enCache) })}
                    </Box>
                  )}
                </>
              }
            />
            <TarjetaKpi icono={ArrowUpFromLine} tono="violeta" titulo={t('ia.uso.tokensSalida')} valor={formatearConteo(tokens.salida)} detalle={t('ia.uso.tokensSalidaNota')} />
          </GrillaKpi>
        </SeccionPlana>
      </Box>
    </>
  );
}
