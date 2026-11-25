import { Alert, AlertTitle, Box, Button, Stack, Typography } from '@mui/material';
import { SCOPES, type AreaExpedienteDto, type ExpedienteDto, type RequisitoExpedienteDto } from '@validalo/api-client';
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { claveVersion, hechosPorVersion, useDocumentosVinculo } from '../../documentos/api';
import { documentosDePersonas, usePersonasDelVinculo } from '../../personas/api';
import { VisorDocumento, type DocumentoEnVisor } from '../../documentos/VisorDocumento';
import type { ContextoRevisor, DialogoExpediente } from '../reglas';
import { enFaseDeCarga, puedeEximir, requisitosDe, requisitosFaltantes } from '../requisitos';
import { areasPorEtapa, grupoDeRequisito } from '../requisitosAgrupados';
import { GruposDeRequisitos } from './GruposDeRequisitos';
import { TarjetaDePendiente } from './TarjetaDePendiente';
import { TarjetaRequisito } from './TarjetaRequisito';

/**
 * Documentos (y secciones de la información del tercero, F2) que pide el flujo (docs/05 §2.4.2): la fase de carga mientras falten obligatorios y, por documento, su
 * versión vigente, el visor, la revisión automática y las decisiones de cada área. Agrupados por situación («Por revisar», «Observados», «Le toca al tercero»,
 * «Aprobados»…), cada requisito en su propia tarjeta (el marco del portal del tercero) directamente sobre el fondo de la página, sin otra tarjeta que las envuelva: lo que
 * el tercero aún no carga, en tarjetas compactas y sin repetir las áreas; qué áreas revisan, una sola vez arriba. No se muestra en un flujo sin requisitos (FL-1). Los hechos de cada versión (IA-11) vienen de los documentos del vínculo (`documentos:leer`).
 */
export function PanelRequisitos({
  expediente,
  contexto,
  nombres,
  onAccion,
  filtro,
  titulo,
  avisoDeCarga = true,
  cuentasEnSuTarjeta = false,
  datosAparte = false,
}: {
  expediente: ExpedienteDto;
  contexto: (area: AreaExpedienteDto | null) => ContextoRevisor;
  nombres: ReadonlyMap<string, string>;
  onAccion: (dialogo: DialogoExpediente) => void;
  /** Solo los requisitos que cumplen (los de un sector de la ficha del vínculo). */
  filtro?: (requisito: RequisitoExpedienteDto) => boolean;
  titulo?: string;
  /** El aviso de la fase de carga va una sola vez (en Validación), no en cada sector. */
  avisoDeCarga?: boolean;
  /** La tarjeta de la cuenta designada está en la misma pantalla (sector «Cuenta» de la ficha del vínculo): el cruce de la certificación con las cuentas va ahí, y aquí solo su resumen. */
  cuentasEnSuTarjeta?: boolean;
  /** «Lo que declaró el tercero» está en la misma pantalla (sectores de la ficha con secciones): el requisito de una sección no repite sus datos, que ya se ven ahí completos. */
  datosAparte?: boolean;
}) {
  const { t } = useTranslation();
  const idTitulo = useId();
  const [abierto, setAbierto] = useState<DocumentoEnVisor | null>(null);
  // La decisión principal es por área (PanelDecisionArea); documento por documento queda como acción secundaria.
  const [porDocumento, setPorDocumento] = useState(false);
  const areas = useMemo(() => new Map(expediente.etapas.flatMap((e) => e.areas.map((a) => [a.areaId, a] as const))), [expediente.etapas]);
  const todos = requisitosDe(expediente);
  const requisitos = filtro ? todos.filter(filtro) : todos;
  const faltantes = requisitosFaltantes(expediente);
  const puedeVer = contexto(null).scopes.has(SCOPES.documentosDescargar);
  const documentos = useDocumentosVinculo(expediente.empresaId, expediente.vinculoId, contexto(null).scopes.has(SCOPES.documentosLeer));
  // Los hechos de IA del documento de una persona relacionada (ADR-0010) también se ven al revisar: son de otra bóveda, pero se compartieron con este vínculo.
  const personas = usePersonasDelVinculo(expediente.empresaId, expediente.vinculoId, contexto(null).scopes.has(SCOPES.documentosLeer));
  const hechos = useMemo(() => hechosPorVersion([...(documentos.data ?? []), ...documentosDePersonas(personas.data)]), [documentos.data, personas.data]);
  if (requisitos.length === 0) return null;
  const revisan = areasPorEtapa(expediente).map((nombres) => nombres.join(' · ')).join(' → ');
  const scopes = contexto(null).scopes;

  return (
    <Box component="section" aria-labelledby={idTitulo}>
      <Stack direction="row" useFlexGap sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2, rowGap: 0.5, mb: 0.5, minHeight: 36 }}>
        <Typography id={idTitulo} variant="h6" component="h2">
          {titulo ?? t('expedientes.requisitos.titulo')}
        </Typography>
        {scopes.has(SCOPES.expedientesRevisar) && expediente.estado === 'EnRevision' && (
          <Button variant="text" onClick={() => setPorDocumento((v) => !v)} aria-pressed={porDocumento}>
            {porDocumento ? t('expedientes.requisitos.ocultarPorDocumento') : t('expedientes.requisitos.decidirPorDocumento')}
          </Button>
        )}
      </Stack>
      {revisan && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
          {t('expedientes.requisitos.revisan', { areas: revisan })}
        </Typography>
      )}
      {avisoDeCarga && enFaseDeCarga(expediente) && faltantes.length > 0 && (
        <Alert severity="info" sx={{ mb: 1.5 }}>
          <AlertTitle>{t('expedientes.requisitos.faseCargaTitulo')}</AlertTitle>
          {t('expedientes.requisitos.faseCarga', { count: faltantes.length, documentos: faltantes.map((r) => r.tipoDocumento.nombre).join(', ') })}
        </Alert>
      )}
      <GruposDeRequisitos
        requisitos={requisitos}
        tarjeta={(requisito) => (
          <TarjetaRequisito
            key={requisito.id}
            expediente={expediente}
            requisito={requisito}
            areas={areas}
            contexto={contexto}
            nombres={nombres}
            puedeVer={puedeVer}
            onVer={setAbierto}
            onAccion={onAccion}
            decidirPorDocumento={porDocumento}
            hechos={requisito.versionActual ? hechos.get(claveVersion(requisito.versionActual.documentoId, requisito.versionActual.n)) : null}
            documentos={documentos.data}
            cuentasEnSuTarjeta={cuentasEnSuTarjeta}
            datosAparte={datosAparte}
            conAreas={grupoDeRequisito(requisito) !== 'leTocaAlTercero'}
          />
        )}
        tarjetaPendiente={(requisito) => (
          <TarjetaDePendiente key={requisito.id} requisito={requisito} puedeEximir={puedeEximir(expediente, requisito, scopes)} onEximir={() => onAccion({ tipo: 'eximir', requisito })} />
        )}
      />
      {abierto && <VisorDocumento empresaId={expediente.empresaId} vinculoId={expediente.vinculoId} documento={abierto} onCerrar={() => setAbierto(null)} />}
    </Box>
  );
}
