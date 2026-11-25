import { Box, ButtonBase, Skeleton, Stack, useMediaQuery, useTheme, type Theme } from '@mui/material';
import { EsqueletoNavegacionLateral, EsqueletoTarjeta } from '@validalo/ui';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EncabezadoPagina } from '../../../shared/componentes';
import { GRUPOS_SECTORES } from './gruposSectores';
import { ESTILO_BARRA_SECTORES, REJILLA_DE_LA_FICHA } from './medidasDeLaFicha';
import type { Sector } from './sectores';

/**
 * Lo que lleva el contenido de cada sector mientras carga: si pide algo del expediente (la tarjeta «Lo que pide»), si tiene un título propio sobre sus tarjetas («Lo que
 * declaró el tercero») y cuántas líneas lleva cada tarjeta. No es exacto: es la silueta, para que al llegar lo real no salte.
 */
interface Plan {
  pide?: boolean;
  titulo?: boolean;
  tarjetas: readonly number[];
}

const PLAN_POR_SECTOR: Readonly<Record<Sector, Plan>> = {
  general: { pide: true, titulo: true, tarjetas: [5, 4] },
  sst: { pide: true, titulo: true, tarjetas: [4] },
  cuenta: { pide: true, tarjetas: [5] },
  tributaria: { pide: true, titulo: true, tarjetas: [4] },
  financiera: { pide: true, titulo: true, tarjetas: [4] },
  contactos: { tarjetas: [3, 3] },
  documentos: { pide: true, tarjetas: [3] },
  autorizacion: { pide: true, tarjetas: [3] },
  legal: { pide: true, titulo: true, tarjetas: [6] },
  evaluaciones: { tarjetas: [4, 3] },
  cumplimiento: { pide: true, tarjetas: [4, 3] },
  aprobaciones: { tarjetas: [5, 3] },
  certificado: { tarjetas: [4] },
  historial: { tarjetas: [6] },
};

/** El contenido del sector que se pidió: sus tarjetas con la silueta del real (encabezado, divisor y líneas). */
export function EsqueletoDeSector({ sector }: { sector: Sector }) {
  const plan = PLAN_POR_SECTOR[sector];
  return (
    <Stack spacing={2}>
      {plan.pide && <EsqueletoTarjeta lineas={4} />}
      {plan.titulo && <Skeleton variant="rounded" width={220} height={22} />}
      {plan.tarjetas.map((lineas, i) => (
        <EsqueletoTarjeta key={i} lineas={lineas} />
      ))}
    </Stack>
  );
}

/** «‹ Vínculos / Nombre · NIT · tipo · estado» y el botón «⋯»: el encabezado fijo de la ficha con la silueta de sus partes (el mismo componente, las mismas medidas). */
function EncabezadoEsqueleto({ volver }: { volver: ReactNode }) {
  const { t } = useTranslation();
  return (
    <EncabezadoPagina
      titulo={
        <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', gap: 1, minWidth: 0 }}>
          <Box component="span" sx={{ typography: 'body2', flex: 'none', '& a': { mb: 0 } }}>
            {volver}
          </Box>
          <Box component="span" aria-hidden sx={{ flex: 'none', color: 'text.disabled' }}>
            /
          </Box>
          <Box component="span" sx={{ typography: 'h5', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <Skeleton width={280} sx={{ display: 'inline-block' }} />
          </Box>
          <Stack component="span" direction="row" spacing={1} useFlexGap sx={{ typography: 'body2', flex: 'none', alignSelf: 'center', alignItems: 'center', ml: 1, color: 'text.secondary' }}>
            <Skeleton width={110} />
            <span aria-hidden>·</span>
            <Skeleton width={64} />
            <span aria-hidden>·</span>
            <Skeleton variant="rounded" width={92} height={24} sx={{ borderRadius: (th) => `${String(th.radio.pill)}px` }} />
          </Stack>
        </Box>
      }
      etiquetaAcciones={t('vinculos.detalle.acciones')}
      acciones={<Skeleton variant="rounded" width={36} height={36} />}
    />
  );
}

/** El selector de sectores de las pantallas angostas con su silueta: la misma caja de una línea (ícono, nombre y flecha). */
function SelectorEsqueleto() {
  return (
    <ButtonBase
      disabled
      aria-hidden
      sx={(th: Theme) => ({
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 1.25,
        width: '100%',
        height: 44,
        pl: 0.75,
        pr: 1.25,
        border: 1,
        borderColor: 'divider',
        borderRadius: '12px',
        bgcolor: th.palette.superficie.panel,
        boxShadow: th.sombra.suave,
      })}
    >
      <Skeleton variant="rounded" width={30} height={30} sx={{ borderRadius: '9px', flex: 'none' }} />
      <Skeleton variant="rounded" height={12} width="40%" sx={{ flex: 'none' }} />
      <Box sx={{ flex: 1 }} />
      <Box aria-hidden sx={{ display: 'inline-flex', color: 'text.disabled' }}>
        <ChevronDown size={18} strokeWidth={1.75} />
      </Box>
    </ButtonBase>
  );
}

/**
 * La ficha del vínculo mientras carga, con la estructura de la real y las mismas medidas (ver `medidasDeLaFicha`): el encabezado fijo con la miga, el nombre, el estado y el
 * botón «⋯»; a la izquierda la barra de sectores con sus tres grupos (o, en pantallas angostas, el selector de una línea) y a la derecha el contenido del sector pedido. Así
 * al llegar los datos nada se mueve.
 */
export function EsqueletoFicha({ sector, volver }: { sector: Sector; volver: ReactNode }) {
  const { t } = useTranslation();
  const tema = useTheme();
  const conBarraLateral = useMediaQuery(tema.breakpoints.up('lg'));
  return (
    <Box aria-busy="true">
      <EncabezadoEsqueleto volver={volver} />
      <Box sx={REJILLA_DE_LA_FICHA}>
        {conBarraLateral ? (
          <EsqueletoNavegacionLateral data-esqueleto="riel" etiqueta={t('vinculos.ficha.cargandoSectores')} grupos={GRUPOS_SECTORES.map((g) => g.sectores.length)} densidad="compacta" sx={ESTILO_BARRA_SECTORES} />
        ) : (
          <SelectorEsqueleto />
        )}
        <Box data-esqueleto="contenido" role="status" aria-label={t('vinculos.ficha.cargandoSector', { sector: t(`vinculos.ficha.sector.${sector}`) })} sx={{ minWidth: 0 }}>
          <EsqueletoDeSector sector={sector} />
        </Box>
      </Box>
    </Box>
  );
}
