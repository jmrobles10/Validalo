import type { ExpedienteDto, RequisitoExpedienteDto } from '@validalo/api-client';
import type { TonoDeTarjeta } from '@validalo/ui';

/**
 * Los requisitos de un expediente por situación, para leerlos de un vistazo en lugar de una lista larga y repetitiva (como el portal del tercero): lo que la empresa debe
 * decidir primero, luego lo observado, lo que le toca al tercero y, al final, lo que ya está resuelto.
 */
export type GrupoDeRequisitos = 'porRevisar' | 'observados' | 'leTocaAlTercero' | 'aprobados' | 'eximidos';

/** El orden en que se muestran los grupos. */
export const GRUPOS_DE_REQUISITOS: readonly GrupoDeRequisitos[] = ['porRevisar', 'observados', 'leTocaAlTercero', 'aprobados', 'eximidos'];

/** Los grupos de lo ya resuelto: van plegados mientras haya algo más que atender. */
export const GRUPOS_RESUELTOS: readonly GrupoDeRequisitos[] = ['aprobados', 'eximidos'];

/**
 * En qué grupo cae un requisito: cargado o en revisión, por revisar; observado, observados; pendiente, vencido o desactualizado, le toca al tercero (subir o renovar);
 * aprobado, aprobados; eximido o que no aplica, eximidos. Un estado que la API agregue y aquí no esté va a «Por revisar»: es lo que no se debe pasar por alto.
 */
export function grupoDeRequisito(requisito: Pick<RequisitoExpedienteDto, 'estado'>): GrupoDeRequisitos {
  const estado: string = requisito.estado;
  switch (estado) {
    case 'Pendiente':
    case 'Vencido':
    case 'Desactualizado':
      return 'leTocaAlTercero';
    case 'Observado':
      return 'observados';
    case 'Aprobado':
      return 'aprobados';
    case 'Eximido':
    case 'NoAplica':
      return 'eximidos';
    default:
      return 'porRevisar';
  }
}

/** Los requisitos de cada grupo, en el orden en que vienen; los grupos vacíos quedan como lista vacía. */
export function agruparRequisitos(requisitos: readonly RequisitoExpedienteDto[]): Record<GrupoDeRequisitos, RequisitoExpedienteDto[]> {
  const grupos: Record<GrupoDeRequisitos, RequisitoExpedienteDto[]> = { porRevisar: [], observados: [], leTocaAlTercero: [], aprobados: [], eximidos: [] };
  for (const requisito of requisitos) grupos[grupoDeRequisito(requisito)].push(requisito);
  return grupos;
}

/**
 * ¿Basta una fila de una línea? Un documento que el tercero aún no carga no tiene nada que decidir: ni versión, ni lectura, ni áreas que mostrar (todas esperan lo mismo).
 * Uno con otras cosas que contar (un retiro, una exención) o una sección de la información (que dice lo que le falta para la empresa) sigue con su tarjeta.
 */
export const esFilaCompacta = (requisito: Pick<RequisitoExpedienteDto, 'estado' | 'versionActual' | 'retiro' | 'exencion' | 'seccion'>): boolean =>
  requisito.estado === 'Pendiente' && !requisito.versionActual && !requisito.retiro && !requisito.exencion && !requisito.seccion;

/**
 * Qué áreas revisan, por etapa y en su orden: cada etapa con los nombres de sus áreas (las de una etapa revisan al mismo tiempo; la siguiente empieza cuando todas
 * aprueban). Para decirlo una sola vez arriba del panel en lugar de repetir las áreas en cada requisito.
 */
export function areasPorEtapa(expediente: Pick<ExpedienteDto, 'etapas'>): string[][] {
  return [...expediente.etapas]
    .sort((a, b) => a.orden - b.orden)
    .map((etapa) => etapa.areas.map((area) => area.nombre))
    .filter((nombres) => nombres.length > 0);
}

/** Cómo se pinta la tarjeta de un requisito: su tono, si el borde se tiñe (lo que pide atención) y si va tenue (lo opcional o ya sin efecto). */
export interface AparienciaDeRequisito {
  tono: TonoDeTarjeta;
  resaltar: boolean;
  tenue: boolean;
}

/**
 * El tono de un requisito para quien revisa (distinto del que ve el tercero: a él le toca lo pendiente; a la empresa, lo que subió): lo que hay por revisar en el acento de la
 * marca y con el borde teñido; lo observado en advertencia; lo que le toca al tercero en gris neutro (más tenue si es opcional); lo aprobado en verde; lo eximido o que no
 * aplica, gris tenue.
 */
export function aparienciaParaElRevisor(requisito: Pick<RequisitoExpedienteDto, 'estado' | 'obligatorio'>): AparienciaDeRequisito {
  switch (grupoDeRequisito(requisito)) {
    case 'porRevisar':
      return { tono: 'acento', resaltar: true, tenue: false };
    case 'observados':
      return { tono: 'advertencia', resaltar: true, tenue: false };
    case 'leTocaAlTercero':
      return { tono: 'neutro', resaltar: false, tenue: !requisito.obligatorio };
    case 'aprobados':
      return { tono: 'exito', resaltar: false, tenue: false };
    case 'eximidos':
      return { tono: 'neutro', resaltar: false, tenue: true };
  }
}
