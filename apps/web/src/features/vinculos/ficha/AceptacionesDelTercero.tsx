import { Box, Skeleton, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { getObtenerVersionTextoLegalQueryOptions, type EventoHistorialDto } from '@validalo/api-client';
import { EstadoVacio, formatearFecha, formatearFechaHora } from '@validalo/ui';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorRecuperable, Tarjeta } from '../../../shared/componentes';
import { conEmpresa } from '../../../shared/consultas';
import { mensajeDeError } from '../../../shared/errores';
import { useHistorialVinculo } from '../api';

interface Aceptado {
  id: string;
  tipo: string;
  version: number;
  hash: string;
}

interface Aceptacion {
  fecha: string;
  consentimientos: Aceptado[];
  correo: string | null;
  otpVerificado: boolean;
}

const TIPOS = ['AvisoPlataforma', 'AutorizacionEmpresa', 'TerminosEmpresa'] as const;
const esTipo = (tipo: string): tipo is (typeof TIPOS)[number] => (TIPOS as readonly string[]).includes(tipo);

/** Lee las aceptaciones del evento `ConsentimientosRegistrados` del historial (la evidencia vive en el evento, no en otro recurso). */
function aceptacionesDe(eventos: readonly EventoHistorialDto[] | undefined): Aceptacion[] {
  const objeto = (v: unknown): Record<string, unknown> | null => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null);
  return (eventos ?? [])
    .filter((e) => e.tipo.replace(/_/g, '').toLowerCase() === 'consentimientosregistrados')
    .map((e) => {
      const lista = Array.isArray(e.datos.consentimientos) ? (e.datos.consentimientos as unknown[]) : [];
      const evidencia = objeto(e.datos.evidencia);
      return {
        fecha: e.fecha,
        consentimientos: lista
          .map(objeto)
          .filter((c): c is Record<string, unknown> => c !== null)
          .map((c) => ({ id: typeof c.textoLegalId === 'string' ? c.textoLegalId : '', tipo: typeof c.tipo === 'string' ? c.tipo : '', version: Number(c.version ?? 0), hash: typeof c.hash === 'string' ? c.hash : '' })),
        correo: typeof evidencia?.correo === 'string' ? evidencia.correo : null,
        otpVerificado: evidencia?.otpVerificado === true,
      };
    })
    .reverse();
}

/**
 * Lo que el tercero aceptó al entrar (autorización de datos, términos de la empresa y el aviso de la plataforma), con la versión del
 * texto, la fecha y la evidencia (correo y si lo verificó con un código). Cada texto se lee ahí mismo, en la versión exacta que aceptó
 * (aunque ya haya otra vigente). Es el «Autorización y declaración» del SRM.
 */
export function AceptacionesDelTercero({ empresaId, vinculoId }: { empresaId: string; vinculoId: string }) {
  const { t } = useTranslation();
  const consulta = useHistorialVinculo(empresaId, vinculoId);
  const aceptaciones = useMemo(() => aceptacionesDe(consulta.data), [consulta.data]);
  const nombreDe = (tipo: string) => (esTipo(tipo) ? t(`vinculos.ficha.aceptaciones.tipos.${tipo}`) : tipo);

  return (
    <Tarjeta titulo={t('vinculos.ficha.aceptaciones.titulo')}>
      {consulta.isPending && <Skeleton variant="rounded" height={160} />}
      {consulta.isError && <ErrorRecuperable mensaje={t('vinculos.detalle.errorHistorial')} onReintentar={() => void consulta.refetch()} />}
      {consulta.data && aceptaciones.length === 0 && <EstadoVacio compacto titulo={t('vinculos.ficha.aceptaciones.vacio')} texto={t('vinculos.ficha.aceptaciones.vacioAyuda')} />}
      <Stack spacing={3}>
        {aceptaciones.map((a) => (
          <Stack key={a.fecha} spacing={1.5}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {t('vinculos.ficha.aceptaciones.cuando', { fecha: formatearFechaHora(a.fecha) })}
              {a.correo && ` · ${a.correo}`}
              {a.otpVerificado && ` · ${t('vinculos.ficha.aceptaciones.conCodigo')}`}
            </Typography>
            {a.consentimientos.map((c) => (
              <TextoAceptado key={`${c.tipo}-${String(c.version)}`} empresaId={empresaId} aceptado={c} titulo={nombreDe(c.tipo)} />
            ))}
          </Stack>
        ))}
      </Stack>
    </Tarjeta>
  );
}

/** Un texto aceptado: nombre, versión y fecha de publicación, y el contenido exacto de esa versión con desplazamiento propio. */
function TextoAceptado({ empresaId, aceptado, titulo }: { empresaId: string; aceptado: Aceptado; titulo: string }) {
  const { t } = useTranslation();
  const opciones = getObtenerVersionTextoLegalQueryOptions(aceptado.id, { request: { empresa: empresaId } });
  const consulta = useQuery({ ...opciones, queryKey: conEmpresa(opciones.queryKey, empresaId), staleTime: Infinity, enabled: Boolean(aceptado.id) });
  return (
    <Box component="section" aria-label={titulo} sx={(th) => ({ border: 1, borderColor: 'divider', borderRadius: `${String(th.radio.md)}px`, p: 2 })}>
      <Typography variant="subtitle1" component="h3">
        {titulo}
      </Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }} title={aceptado.hash ? `SHA-256 ${aceptado.hash}` : undefined}>
        {t('vinculos.ficha.aceptaciones.version', { n: String(aceptado.version) })}
        {consulta.data && ` · ${t('vinculos.ficha.aceptaciones.publicado', { fecha: formatearFecha(consulta.data.publicadoEn) })}`}
      </Typography>
      {aceptado.id && consulta.isPending && <Skeleton variant="rounded" height={96} />}
      {consulta.isError && <ErrorRecuperable mensaje={mensajeDeError(consulta.error, t)} onReintentar={() => void consulta.refetch()} />}
      {consulta.data && (
        <Box tabIndex={0} sx={(th) => ({ maxHeight: 220, overflowY: 'auto', bgcolor: 'action.hover', borderRadius: `${String(th.radio.sm)}px`, px: 2, py: 1.5 })}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {consulta.data.contenido}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
