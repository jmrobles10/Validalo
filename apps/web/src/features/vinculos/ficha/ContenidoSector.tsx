import { Stack, Typography } from '@mui/material';
import { SCOPES, type FichaTerceroDto, type VinculoDto } from '@validalo/api-client';
import { ChipEstado, EsqueletoTarjeta, EstadoVacio } from '@validalo/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../../shared/componentes';
import { usePermisos } from '../../../shared/usePermisos';
import { useEmpresaActiva } from '../../empresas/useEmpresas';
import { TarjetaCertificado } from '../../certificados/TarjetaCertificado';
import { DocumentosVinculo } from '../../documentos/DocumentosVinculo';
import { PanelEvaluaciones } from '../../evaluaciones/PanelEvaluaciones';
import { TarjetaEvaluacionesDelVinculo } from '../../evaluaciones/TarjetaEvaluacionesDelVinculo';
import { AccionesExpediente, AvisosExpediente } from '../../expedientes/components/ControlExpediente';
import type { ControlExpediente } from '../../expedientes/useControlExpediente';
import { EtapasExpediente } from '../../expedientes/components/EtapasExpediente';
import { PanelDecisionArea } from '../../expedientes/components/PanelDecisionArea';
import { DatosExpediente, UltimaRespuesta } from '../../expedientes/components/PanelesExpediente';
import { PanelRequisitos } from '../../expedientes/components/PanelRequisitos';
import { TarjetaExpedienteVinculo } from '../../expedientes/components/TarjetaExpedienteVinculo';
import { TarjetaPersonasRelacionadas } from '../../personas/TarjetaPersonasRelacionadas';
import { TarjetaFichaAceptadaEnVinculo } from '../../terceros/fichaAceptada/TarjetaFichaAceptadaEnVinculo';
import { TarjetaSeccion } from '../../terceros/ficha/InformacionTercero';
import { TarjetaContactos } from '../contactos/TarjetaContactos';
import { TarjetaCuentaDesignada } from '../cuentaDesignada/TarjetaCuentaDesignada';
import { estadoVisibleDelVinculo } from '../estadoVisible';
import { TarjetaExenciones } from '../exenciones/TarjetaExenciones';
import { AceptacionesDelTercero } from './AceptacionesDelTercero';
import { ContactoDelTercero } from './ContactoDelTercero';
import { CumplimientoDelVinculo } from './CumplimientoDelVinculo';
import { HistorialFicha } from './HistorialFicha';
import { DatosVinculo, ReferenciasVinculo } from './PartesVinculo';
import { sectorDeRequisito, sectorDeSeccion, type Sector, type SectorDeRequisito } from './sectores';

interface Props {
  sector: Sector;
  vinculo: VinculoDto;
  control: ControlExpediente | null;
  cargandoExpediente: boolean;
  /** La ficha 360 del tercero: lo que declaró por sección y lo que la empresa le aceptó. */
  ficha: FichaTerceroDto | undefined;
}

/** Los sectores que traen «Lo que declaró el tercero» (los de las secciones de la ficha): ahí los datos de una sección se ven completos y el requisito no los repite. */
const sectorConDeclarado = (sector: SectorDeRequisito): boolean => sector !== 'cuenta' && sector !== 'documentos' && sector !== 'autorizacion';

/** Lo que muestra cada sector de la ficha del vínculo. Reutiliza las tarjetas de siempre; solo cambia dónde va cada una. */
export function ContenidoSector({ sector, vinculo, control, cargandoExpediente, ficha }: Props) {
  const { t } = useTranslation();
  const permisos = usePermisos(vinculo.empresaId);
  const { empresa } = useEmpresaActiva();
  const empresaId = vinculo.empresaId;

  /** Lo que el expediente pide de este sector (nada si no pide nada o no hay expediente). */
  const pedido = (de: SectorDeRequisito) =>
    cargandoExpediente ? (
      <EsqueletoTarjeta alto={200} />
    ) : control ? (
      <PanelRequisitos
        expediente={control.expediente}
        contexto={control.contexto}
        nombres={control.nombres}
        onAccion={control.abrirDialogo}
        filtro={(r) => sectorDeRequisito(r) === de}
        titulo={t('vinculos.ficha.loQuePide')}
        avisoDeCarga={false}
        cuentasEnSuTarjeta={de === 'cuenta' && permisos.puede(SCOPES.vinculosLeer)}
        datosAparte={sectorConDeclarado(de) && permisos.puede(SCOPES.tercerosLeer)}
      />
    ) : null;
  const declarado = (de: SectorDeRequisito) => <SeccionesDeclaradas sector={de} empresaId={empresaId} ficha={ficha} />;
  const pila = (...hijos: ReactNode[]) => <Stack spacing={2}>{hijos}</Stack>;

  switch (sector) {
    case 'general':
      return (
        <Stack spacing={2}>
          <DatosVinculo vinculo={vinculo} empresaId={empresaId} empresaNombre={empresa.nombre} conFicha={permisos.puede(SCOPES.tercerosLeer)} />
          {pedido('general')}
          {declarado('general')}
          <TarjetaFichaAceptadaEnVinculo vinculo={vinculo} />
          <TarjetaExenciones vinculo={vinculo} empresaId={empresaId} />
          <ReferenciasVinculo vinculo={vinculo} />
        </Stack>
      );
    case 'sst':
    case 'tributaria':
    case 'financiera':
      return (
        <Stack spacing={2}>
          {pedido(sector)}
          {declarado(sector)}
        </Stack>
      );
    // Sin «Lo que declaró el tercero»: las cuentas no son una sección de la ficha (no hay nada que mostrar ahí) y la cuenta que declaró es la de su tarjeta.
    case 'cuenta':
      return (
        <Stack spacing={2}>
          {pedido('cuenta')}
          <TarjetaCuentaDesignada vinculo={vinculo} />
        </Stack>
      );
    case 'contactos':
      return (
        <Stack spacing={2}>
          <ContactoDelTercero vinculo={vinculo} ficha={ficha} />
          <TarjetaContactos vinculo={vinculo} />
        </Stack>
      );
    case 'documentos':
      return (
        <Stack spacing={2}>
          {pedido('documentos')}
          <DocumentosVinculo vinculo={vinculo} />
        </Stack>
      );
    case 'autorizacion':
      return (
        <Stack spacing={2}>
          {pedido('autorizacion')}
          <AceptacionesDelTercero empresaId={empresaId} vinculoId={vinculo.id} />
        </Stack>
      );
    case 'legal':
      return (
        <Stack spacing={2}>
          {pedido('legal')}
          {declarado('legal')}
          <TarjetaPersonasRelacionadas vinculo={vinculo} empresaId={empresaId} />
        </Stack>
      );
    case 'evaluaciones':
      return pila(
        control && <PanelEvaluaciones key="expediente" expediente={control.expediente} empresaId={empresaId} />,
        <TarjetaEvaluacionesDelVinculo key="vinculo" vinculo={vinculo} empresaId={empresaId} />,
      );
    case 'cumplimiento':
      return (
        <Stack spacing={2}>
          <CumplimientoDelVinculo vinculo={vinculo} control={control} pedido={pedido('cumplimiento')} />
          <SeccionesDeclaradas sector="cumplimiento" empresaId={empresaId} ficha={ficha} sinVacio />
        </Stack>
      );
    case 'aprobaciones':
      return <SectorAprobaciones vinculo={vinculo} control={control} cargando={cargandoExpediente} />;
    case 'certificado':
      return <TarjetaCertificado vinculo={vinculo} />;
    case 'historial':
      return (
        <Tarjeta titulo={t('vinculos.ficha.historial')}>
          <HistorialFicha empresaId={empresaId} vinculoId={vinculo.id} expediente={control?.expediente ?? null} />
        </Tarjeta>
      );
  }
}

/** El expediente en curso: su estado y acciones, los avisos, la decisión por área y las etapas (las «Aprobaciones» del SRM). */
function SectorAprobaciones({ vinculo, control, cargando }: { vinculo: VinculoDto; control: ControlExpediente | null; cargando: boolean }) {
  const { t } = useTranslation();
  if (cargando) return <EsqueletoTarjeta alto={320} />;
  if (!control) {
    return (
      <Stack spacing={2}>
        <TarjetaExpedienteVinculo vinculo={vinculo} />
        {!vinculo.expedienteAbiertoId && !vinculo.aperturaDeExpedientePendiente && (
          <Tarjeta titulo={t('vinculos.ficha.sector.aprobaciones')}>
            <EstadoVacio compacto titulo={t('vinculos.ficha.sinExpediente')} texto={t('vinculos.ficha.sinExpedienteAyuda')} />
          </Tarjeta>
        )}
      </Stack>
    );
  }
  const { expediente } = control;
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography variant="h6" component="h2" sx={{ mr: 0.5 }}>
          {t(`expedientes.tipo.${expediente.tipo}`)}
        </Typography>
        <Typography component="span" variant="monoTabla" sx={{ color: 'text.secondary' }}>
          {expediente.folio}
        </Typography>
        {/* Si el expediente está como el vínculo (p. ej. los dos «En revisión»), el chip del encabezado ya lo dice: no se repite. */}
        {expediente.estado !== estadoVisibleDelVinculo(vinculo) && <ChipEstado estado={expediente.estado} fecha={expediente.cerradoEn ?? expediente.actualizadoEn} />}
        <Stack direction="row" spacing={1} useFlexGap sx={{ ml: 'auto', flexWrap: 'wrap' }}>
          <AccionesExpediente control={control} />
        </Stack>
      </Stack>
      <Stack spacing={1.5} sx={{ '&:empty': { display: 'none' } }}>
        <AvisosExpediente control={control} />
      </Stack>
      <PanelDecisionArea expediente={expediente} contexto={control.contexto} onAccion={control.abrirDialogo} />
      <EtapasExpediente expediente={expediente} contexto={control.contexto} nombres={control.nombres} motivos={control.nombresMotivos} onAccion={control.abrirDialogo} />
      <UltimaRespuesta expediente={expediente} />
      <DatosExpediente expediente={expediente} />
    </Stack>
  );
}

/** Lo que el tercero declaró en las secciones de este sector, con lo que la empresa le aceptó (las tarjetas de Tercero 360). */
function SeccionesDeclaradas({ sector, empresaId, ficha, sinVacio = false }: { sector: SectorDeRequisito; empresaId: string; ficha: FichaTerceroDto | undefined; sinVacio?: boolean }) {
  const { t } = useTranslation();
  const secciones = (ficha?.secciones ?? []).filter((s) => sectorDeSeccion(s.seccion) === sector);
  if (!ficha || secciones.length === 0) {
    return sinVacio ? null : (
      <Tarjeta titulo={t('vinculos.ficha.declarado')}>
        <EstadoVacio compacto titulo={t('vinculos.ficha.sinDeclarado')} texto={t('vinculos.ficha.sinDeclaradoAyuda')} />
      </Tarjeta>
    );
  }
  return (
    <Stack spacing={1.5}>
      <Typography variant="h6" component="h2">
        {t('vinculos.ficha.declarado')}
      </Typography>
      {secciones.map((s) => (
        <TarjetaSeccion key={`${s.seccion}-${String(s.periodo)}`} empresaId={empresaId} terceroId={ficha.tercero.id} seccion={s} vinculos={ficha.vinculos} />
      ))}
    </Stack>
  );
}
