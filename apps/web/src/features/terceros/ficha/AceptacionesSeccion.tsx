import { Box, Link, Stack, Typography } from '@mui/material';
import type { AceptacionDeSeccionDto, VinculoEnFichaDto } from '@validalo/api-client';
import { formatearFecha } from '@validalo/ui';
import type { TFunction } from 'i18next';
import { CircleCheck, Hourglass, Info, TriangleAlert, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { sectorDeSeccion } from '../../vinculos/ficha/sectores';
import { useEmpresaActiva } from '../../empresas/useEmpresas';
import { usePedidoDeSeccion, type PedidoDeSeccion } from './pedidoDeSeccion';

interface Props {
  empresaId: string;
  /** El código de la sección (`FICHA_LEGAL`) y su periodo: con ellos se busca su requisito en el expediente en curso de cada vínculo. */
  codigo: string;
  periodo: number | null;
  /** El nombre de la sección («Información legal»): el requisito del expediente cuya aprobación la acepta. */
  seccion: string;
  aceptaciones: readonly AceptacionDeSeccionDto[];
  vinculos: readonly VinculoEnFichaDto[];
}

type Tono = 'info' | 'exito' | 'advertencia';
const ICONO: Record<Tono, LucideIcon> = { info: Hourglass, exito: CircleCheck, advertencia: TriangleAlert };

/**
 * Lo que la empresa activa tiene aceptado de la sección (FM-29), dicho con una frase y el color de su estado: «Sinco OK aceptó la versión 2 el …» (verde); si el tercero guardó otra
 * versión, la advertencia de que hay una nueva pendiente de revisión, con el enlace a la revalidación que la revisa; y, mientras no la acepta, lo que de verdad pasa con la sección en el
 * expediente del vínculo: lo pide (se acepta al aprobarse el expediente, con enlace al requisito), lo eximió, no lo pide (queda como información del tercero) o no hay expediente en
 * curso. Una línea por vínculo; con varios, cada una dice el tipo de su vínculo entre paréntesis.
 */
export function AceptacionesSeccion({ empresaId, codigo, periodo, seccion, aceptaciones, vinculos }: Props) {
  const { t } = useTranslation();
  const { empresa } = useEmpresaActiva();
  const pedidos = usePedidoDeSeccion(empresaId, vinculos, codigo, periodo);
  if (aceptaciones.length === 0) return null;
  const tipoDelVinculo = (id: string) => vinculos.find((v) => v.vinculo.id === id)?.vinculo.tipoVinculo.nombre ?? '';
  return (
    <Stack component="section" aria-label={t('fichaEmpresa.aceptaciones.titulo')} spacing={1}>
      {aceptaciones.map((a) => (
        <Franja
          key={a.vinculoId}
          empresaId={empresaId}
          empresa={empresa.nombre}
          codigo={codigo}
          seccion={seccion}
          aceptacion={a}
          pedido={pedidos.get(a.vinculoId)}
          vinculo={aceptaciones.length > 1 ? tipoDelVinculo(a.vinculoId) : ''}
        />
      ))}
    </Stack>
  );
}

/** La frase de una sección que la empresa aún no acepta, según lo que su expediente hace con ella. */
function fraseSinAceptar(t: TFunction, empresa: string, seccion: string, pedido: PedidoDeSeccion | undefined): string {
  switch (pedido?.tipo) {
    case 'pedida':
      return t('fichaEmpresa.aceptaciones.sinAceptar', { empresa, seccion, folio: pedido.folio });
    case 'eximida':
      return t('fichaEmpresa.aceptaciones.eximida', { empresa, seccion, folio: pedido.folio });
    case 'noPedida':
      return t('fichaEmpresa.aceptaciones.noPedida', { empresa, folio: pedido.folio });
    case 'sinExpediente':
      return t('fichaEmpresa.aceptaciones.sinExpediente', { empresa });
    case undefined:
      return t('fichaEmpresa.aceptaciones.sinAceptarGenerica', { empresa });
  }
}

interface FranjaProps {
  empresaId: string;
  empresa: string;
  codigo: string;
  seccion: string;
  aceptacion: AceptacionDeSeccionDto;
  pedido: PedidoDeSeccion | undefined;
  vinculo: string;
}

function Franja({ empresaId, empresa, codigo, seccion, aceptacion: a, pedido, vinculo }: FranjaProps) {
  const { t } = useTranslation();
  const expediente = (id: string) => `/e/${empresaId}/expedientes/${id}`;
  const aceptada = a.versionAceptada !== null;
  const tono: Tono = !aceptada ? 'info' : a.versionNuevaPendiente ? 'advertencia' : 'exito';
  // Esperando: la hará el expediente (o no se sabe). Si nada la va a aceptar, no es una espera: es un dato.
  const esperando = !aceptada && (pedido?.tipo === 'pedida' || pedido === undefined);
  const Icono = aceptada ? ICONO[tono] : esperando ? Hourglass : Info;
  const frase = aceptada
    ? a.aceptadaEn
      ? t('fichaEmpresa.aceptaciones.aceptada', { empresa, n: String(a.versionAceptada), fecha: formatearFecha(a.aceptadaEn) })
      : t('fichaEmpresa.aceptaciones.aceptadaSinFecha', { empresa, n: String(a.versionAceptada) })
    : fraseSinAceptar(t, empresa, seccion, pedido);
  return (
    <Box sx={{ px: 1.5, py: 1, border: 1, borderColor: `estado.${tono}.borde`, bgcolor: `estado.${tono}.fondo`, borderRadius: (th) => `${String(th.radio.md)}px` }}>
      <Stack direction="row" spacing={1.25} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Box component="span" aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: `estado.${tono}.texto` }}>
          <Icono size={16} strokeWidth={1.75} />
        </Box>
        <Typography variant="body2" sx={{ flex: '1 1 16rem', minWidth: 0 }}>
          {vinculo ? t('fichaEmpresa.aceptaciones.conVinculo', { texto: frase, vinculo }) : frase}
        </Typography>
        {a.expedienteId && a.folio && (
          <Link component={RouterLink} to={expediente(a.expedienteId)} variant="body2" aria-label={t('fichaEmpresa.aceptaciones.verExpediente', { folio: a.folio })}>
            {t('fichaEmpresa.aceptaciones.expediente', { folio: a.folio })}
          </Link>
        )}
        {!aceptada && pedido?.tipo === 'pedida' && (
          <Link
            component={RouterLink}
            to={`${expediente(pedido.expedienteId)}?sector=${sectorDeSeccion(codigo)}`}
            variant="body2"
            aria-label={t('fichaEmpresa.aceptaciones.verRequisitoAccesible', { seccion, folio: pedido.folio })}
          >
            {t('fichaEmpresa.aceptaciones.verRequisito')}
          </Link>
        )}
      </Stack>
      {a.versionNuevaPendiente && (
        <Stack direction="row" spacing={1.25} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.75, pl: 3.5 }}>
          <Typography variant="body2" sx={{ color: 'estado.advertencia.texto' }}>
            {t('fichaEmpresa.aceptaciones.pendiente')}
          </Typography>
          {a.revalidacion && (
            <Link
              component={RouterLink}
              to={expediente(a.revalidacion.expedienteId)}
              variant="body2"
              aria-label={t('fichaEmpresa.aceptaciones.verRevalidacion', { folio: a.revalidacion.folio })}
            >
              {t('fichaEmpresa.aceptaciones.revalidacion', {
                folio: a.revalidacion.folio,
                n: String(a.revalidacion.version ?? '—'),
                fecha: formatearFecha(a.revalidacion.plazoHasta),
              })}
            </Link>
          )}
        </Stack>
      )}
    </Box>
  );
}
