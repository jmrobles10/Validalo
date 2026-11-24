import type { ExpedientePublicoDto, ObservacionPublicaDto, RequisitoPublicoDto, VigenciaDto } from '@validalo/api-client';
import type { SolicitudDeSubida } from '../boveda/solicitudDeSubida';
import { enlaceSeccion } from '../ficha/secciones';
import { requiereAtencion } from '../vigencia/vigencia';

/** Lo que el tercero puede hacer con un documento que le piden. */
export type AccionRequisito = 'subir' | 'corregir' | 'reemplazar' | null;

export function accionDeRequisito(
  requisito: Pick<RequisitoPublicoDto, 'estado'> & { versionActual?: { vigencia?: Pick<VigenciaDto, 'estado'> | null } | null },
  expediente: Pick<ExpedientePublicoDto, 'estado'>,
): AccionRequisito {
  // Aprobado pero por vencer, en gracia o vencido: la tarjeta pide renovarlo, así que ofrece subir la versión nueva
  // aunque la revisión ya se haya cerrado aprobada (antes decía «sube una versión nueva» sin dar cómo).
  if (requisito.estado === 'Aprobado' && ['EnRevision', 'Observado', 'Aprobado'].includes(expediente.estado) && requiereAtencion(requisito.versionActual?.vigencia))
    return 'reemplazar';
  if (!['Abierto', 'EnRevision', 'Observado'].includes(expediente.estado)) return null;
  switch (requisito.estado) {
    case 'Pendiente':
      return 'subir';
    case 'Observado':
      return 'corregir';
    case 'Cargado':
    case 'EnRevision':
      return 'reemplazar';
    default:
      return null; // aprobado o eximido
  }
}

/** La acción de la tarjeta (subir, corregir, reemplazar): destacada salvo reemplazar, que es la menos urgente. */
export const propiedadesDeLaAccion = (accion: Exclude<AccionRequisito, null>) =>
  ({ variant: accion === 'reemplazar' ? 'text' : 'contained', sx: { mt: 1, ml: accion === 'reemplazar' ? 2.25 : 3.25 } }) as const;

/**
 * Orden de lo que ve el tercero: primero lo que le toca (observado, por subir), luego lo que revisa la empresa y al
 * final lo listo (design system P2PubExpediente: «Te toca», «Lo revisa la empresa», «Listo»).
 */
export type GrupoRequisito = 'te-toca' | 'en-revision' | 'listo';

export function grupoDeRequisito(requisito: Pick<RequisitoPublicoDto, 'estado'>): GrupoRequisito {
  if (requisito.estado === 'Observado' || requisito.estado === 'Pendiente') return 'te-toca';
  if (requisito.estado === 'Cargado' || requisito.estado === 'EnRevision') return 'en-revision';
  return 'listo';
}

export function requisitosPorGrupo(expediente: Pick<ExpedientePublicoDto, 'requisitos'>): Record<GrupoRequisito, RequisitoPublicoDto[]> {
  const grupos: Record<GrupoRequisito, RequisitoPublicoDto[]> = { 'te-toca': [], 'en-revision': [], listo: [] };
  for (const r of expediente.requisitos ?? []) grupos[grupoDeRequisito(r)].push(r);
  // Dentro de «te toca», primero lo observado: es lo que frena la revisión.
  grupos['te-toca'].sort((a, b) => Number(b.estado === 'Observado') - Number(a.estado === 'Observado'));
  return grupos;
}

/** Observaciones del expediente que no son de un documento concreto (las de cada documento van en su tarjeta). */
export function observacionesGenerales(expediente: Pick<ExpedientePublicoDto, 'observaciones'>): ObservacionPublicaDto[] {
  return expediente.observaciones.filter((o) => !o.requisito);
}

/** Observaciones de un documento: las de la tarjeta y, si el backend no las adjunta, las del expediente con su código. */
export function observacionesDeRequisito(requisito: RequisitoPublicoDto, expediente: Pick<ExpedientePublicoDto, 'observaciones'>): ObservacionPublicaDto[] {
  if (requisito.observaciones.length > 0) return requisito.observaciones;
  return expediente.observaciones.filter((o) => o.requisito === requisito.tipoDocumento.codigo);
}

/**
 * Lo que pide subir (o llenar el formulario de) este requisito: un canónico global va a la bóveda (con el vínculo como contexto, para que apliquen las
 * reglas de archivo de la empresa); un tipo propio de la empresa necesita el vínculo. `expediente` y `requisito` dejan al diálogo de subida (o a la página
 * del formulario) leer las reglas, los campos y la plantilla del tipo; `volver` trae de regreso a la revisión al llenar un formulario, que sí es una página.
 */
export function solicitudDeRequisito(requisito: RequisitoPublicoDto, vinculoId: string | null, expedienteId: string): SolicitudDeSubida | null {
  const base: SolicitudDeSubida = { nombre: requisito.tipoDocumento.nombre, volver: `/expediente/${expedienteId}`, expediente: expedienteId, requisito: requisito.id };
  // El documento de una persona relacionada (ADR-0010) se sube a la bóveda de esa persona; sin persona todavía no hay a quién subírselo.
  if (requisito.persona) {
    if (!requisito.persona.personaId || !requisito.tipoDocumento.tipoCanonico) return null;
    return { ...base, tipo: requisito.tipoDocumento.tipoCanonico, persona: requisito.persona.personaId };
  }
  if (requisito.tipoDocumento.tipoCanonico && requisito.tipoDocumento.ambito === 'Global') {
    return { ...base, tipo: requisito.tipoDocumento.tipoCanonico, ...(vinculoId ? { vinculoId } : {}) };
  }
  if (vinculoId) return { ...base, tipoDocumentoTenantId: requisito.tipoDocumento.id, vinculoId };
  return null;
}

/** Una sección de «Mi información» que pide la empresa (F2): no se sube aquí, se completa o corrige en el wizard. */
export function esRequisitoDeSeccion(requisito: Pick<RequisitoPublicoDto, 'tipoRequisito' | 'seccion'>): boolean {
  return requisito.tipoRequisito === 'Seccion' || Boolean(requisito.seccion);
}

/** El wizard de la sección (`/ficha/:seccion`, la financiera con `?periodo=`). */
export function enlaceDeSeccion(requisito: Pick<RequisitoPublicoDto, 'seccion' | 'tipoDocumento'>): string {
  return enlaceSeccion(requisito.seccion?.seccion ?? requisito.tipoDocumento.codigo, requisito.seccion?.periodo);
}

/** Cada cuánto se vuelve a pedir el expediente mientras el servidor procesa algo que el tercero espera. */
export const SONDEO_RAPIDO_MS = 4000;
/** Cada cuánto, sin stream en vivo, para que una observación o un cambio aparezca sin recargar. */
export const SONDEO_DE_RESPALDO_MS = 30_000;
/**
 * Cuánto se da por «procesándose» una versión recibida o en análisis: pasado esto (p. ej. el antivirus no responde y la versión
 * espera, T-11) deja de sondearse rápido y se vuelve al stream o al respaldo.
 */
export const VENTANA_DE_PROCESAMIENTO_MS = 2 * 60 * 1000;

/** Lo que `debeRefrescar` necesita saber del entorno: si el stream en vivo está conectado y hasta cuándo se espera lo recién subido. */
export interface EntornoDeRefresco {
  streamConectado: boolean;
  /** Instante (ms) hasta el que se espera que la cola ponga en el expediente lo que el tercero acaba de subir; 0 = nada en espera. */
  esperandoSubidaHasta?: number;
  ahora?: number;
}

/**
 * ¿Hay algo procesándose en el servidor que el tercero espera? El DTO no trae un indicador explícito, así que se mira lo más
 * cercano: un requisito cuya versión está `Recibida` o `EnAnalisis` en la bóveda (recién cargada, hasta `VENTANA_DE_PROCESAMIENTO_MS`).
 * Lo recién subido que todavía no llega al expediente (la versión pasa por una cola, RQ-2) no se ve aquí: lo cubre `esperandoSubidaHasta`.
 */
export function hayProcesamientoEnCurso(expediente: Pick<ExpedientePublicoDto, 'requisitos'>, ahora: number): boolean {
  return (expediente.requisitos ?? []).some((r) => {
    const version = r.versionActual;
    if (version?.estado !== 'Recibida' && version?.estado !== 'EnAnalisis') return false;
    const cargada = Date.parse(version.cargadaEn);
    return Number.isFinite(cargada) && ahora - cargada < VENTANA_DE_PROCESAMIENTO_MS;
  });
}

/**
 * Cada cuánto se vuelve a pedir el expediente (`false` = no se sondea). Se sondea rápido (4 s) solo mientras el servidor procesa algo que el
 * tercero espera: una versión en análisis o lo que acaba de subir. Fuera de eso, con el stream en vivo conectado no se sondea (el aviso
 * `expediente`/`documento` lo refresca) y sin stream se pide cada 30 s mientras el expediente esté vivo (Abierto, Observado o EnRevision).
 * El sondeo se pausa con la pestaña oculta (`refetchIntervalInBackground` apagado).
 */
export function debeRefrescar(expediente: Pick<ExpedientePublicoDto, 'estado' | 'requisitos'> | undefined, entorno: EntornoDeRefresco): number | false {
  if (!expediente || !['Abierto', 'Observado', 'EnRevision'].includes(expediente.estado)) return false;
  const ahora = entorno.ahora ?? Date.now();
  if (ahora < (entorno.esperandoSubidaHasta ?? 0) || hayProcesamientoEnCurso(expediente, ahora)) return SONDEO_RAPIDO_MS;
  return entorno.streamConectado ? false : SONDEO_DE_RESPALDO_MS;
}
