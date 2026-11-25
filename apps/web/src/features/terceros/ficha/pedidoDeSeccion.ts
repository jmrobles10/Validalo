import { useQueries } from '@tanstack/react-query';
import { getObtenerExpedienteQueryOptions, SCOPES, type ExpedienteDto, type VinculoEnFichaDto } from '@validalo/api-client';
import { conEmpresa } from '../../../shared/consultas';
import { usePermisos } from '../../../shared/usePermisos';

/**
 * Lo que el expediente en curso de un vínculo hace con una sección de la ficha. La empresa acepta una sección solo al **aprobarse el expediente** que la
 * pide como requisito (y no está eximida): una sección que el flujo no pide no se acepta nunca por ese camino y queda como información del tercero (FM-29).
 */
export type PedidoDeSeccion =
  | { tipo: 'pedida'; expedienteId: string; folio: string }
  | { tipo: 'eximida'; expedienteId: string; folio: string }
  | { tipo: 'noPedida'; expedienteId: string; folio: string }
  /** El vínculo no tiene un expediente abierto: nada la pide ahora. */
  | { tipo: 'sinExpediente' };

/** El requisito de esa sección (y periodo) en el expediente: lo pide, lo eximieron o no lo pide (tampoco cuando la condición no aplica). */
export function pedidoDeSeccion(expediente: ExpedienteDto, seccion: string, periodo: number | null): PedidoDeSeccion {
  const base = { expedienteId: expediente.id, folio: expediente.folio };
  const requisito = (expediente.requisitos ?? []).find((r) => r.seccion?.seccion === seccion && (r.seccion.periodo ?? null) === periodo);
  if (!requisito || requisito.estado === 'NoAplica') return { tipo: 'noPedida', ...base };
  return { tipo: requisito.estado === 'Eximido' || requisito.exencion ? 'eximida' : 'pedida', ...base };
}

/**
 * Por vínculo de la ficha, lo que su expediente en curso hace con la sección. Sin permiso para leer expedientes, o mientras carga, no se sabe (`undefined`): la frase
 * de la validación no afirma entonces nada del expediente. Las consultas son las del expediente de la ficha del vínculo: la caché las comparte.
 */
export function usePedidoDeSeccion(empresaId: string, vinculos: readonly VinculoEnFichaDto[], seccion: string, periodo: number | null): ReadonlyMap<string, PedidoDeSeccion | undefined> {
  const permisos = usePermisos(empresaId);
  const puedeLeer = permisos.puede(SCOPES.expedientesLeer);
  const conExpediente = vinculos.filter((v) => Boolean(v.vinculo.expedienteAbiertoId));
  const consultas = useQueries({
    queries: conExpediente.map((v) => {
      const id = v.vinculo.expedienteAbiertoId ?? '';
      const opciones = getObtenerExpedienteQueryOptions(id, { request: { empresa: empresaId } });
      return { ...opciones, queryKey: conEmpresa(opciones.queryKey, empresaId), enabled: puedeLeer && id !== '' };
    }),
  });
  const respuesta = new Map<string, PedidoDeSeccion | undefined>();
  for (const v of vinculos) {
    if (!v.vinculo.expedienteAbiertoId) {
      respuesta.set(v.vinculo.id, { tipo: 'sinExpediente' });
      continue;
    }
    const expediente = consultas[conExpediente.indexOf(v)]?.data;
    respuesta.set(v.vinculo.id, expediente ? pedidoDeSeccion(expediente, seccion, periodo) : undefined);
  }
  return respuesta;
}
