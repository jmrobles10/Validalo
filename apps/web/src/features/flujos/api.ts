import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  crearFlujo,
  definirFlujoPorDefecto,
  editarFlujo,
  getBuscarEnCatalogoQueryOptions,
  getListarCamposDeFichaQueryOptions,
  getListarFlujosPorDefectoQueryOptions,
  getListarFlujosQueryOptions,
  getListarVersionesFlujoQueryOptions,
  getObtenerFlujoQueryOptions,
  publicarFlujo,
  type CrearFlujoDto,
  type EditarFlujoDto,
  getListarTiposDocumentoQueryOptions,
} from '@validalo/api-client';
import { conEmpresa, invalidarRuta } from '../../shared/consultas';

/** Tipos de documento del tenant para los requisitos del flujo (`configuracion:leer`). Cambian poco. */
export function useTiposDocumento(habilitado = true) {
  return useQuery({ ...getListarTiposDocumentoQueryOptions({ request: { empresa: null } }), enabled: habilitado, staleTime: 5 * 60_000 });
}

/** Los campos de la ficha del tercero que puede mirar una condición (EF-1): con su tipo, sus operadores y el catálogo de sus valores. Cambian con el código, no con los datos. */
export function useCamposDeFicha(habilitado = true) {
  return useQuery({ ...getListarCamposDeFichaQueryOptions({ request: { empresa: null } }), enabled: habilitado, staleTime: 60 * 60_000 });
}

/** Busca en un catálogo de plataforma (especialidades, actividades económicas…) por código o por nombre; sin catálogo no consulta. */
export function useBuscarEnCatalogo(catalogo: string | null, q: string) {
  return useQuery({
    ...getBuscarEnCatalogoQueryOptions(catalogo ?? '', { q: q.trim() || undefined, limite: 20 }, { request: { empresa: null } }),
    enabled: catalogo !== null,
    staleTime: 5 * 60_000,
  });
}

/** Nombre de cada código ya elegido (una consulta por código, que se guarda): lo que se muestra en lugar del código solo. */
export function useNombresDeCatalogo(catalogo: string | null, codigos: readonly string[]): ReadonlyMap<string, string> {
  const consultas = useQueries({
    queries: codigos.map((codigo) => ({
      ...getBuscarEnCatalogoQueryOptions(catalogo ?? '', { q: codigo, limite: 20 }, { request: { empresa: null } }),
      enabled: catalogo !== null,
      staleTime: Infinity,
    })),
  });
  const nombres = new Map<string, string>();
  consultas.forEach((consulta, i) => {
    const entrada = consulta.data?.datos.find((e) => e.codigo === codigos[i]);
    if (entrada) nombres.set(entrada.codigo, entrada.nombre);
  });
  return nombres;
}

/**
 * Nombre de cada código en el catálogo de su campo, para varios campos a la vez (las condiciones compuestas miran más de uno): la clave es `catálogo|código`.
 * Usa las mismas consultas, y por tanto la misma caché, que `useNombresDeCatalogo`; un campo sin catálogo no consulta.
 */
export function useNombresDeCodigos(pares: readonly { catalogo: string | null; codigo: string }[]): ReadonlyMap<string, string> {
  const consultas = useQueries({
    queries: pares.map(({ catalogo, codigo }) => ({
      ...getBuscarEnCatalogoQueryOptions(catalogo ?? '', { q: codigo, limite: 20 }, { request: { empresa: null } }),
      enabled: catalogo !== null,
      staleTime: Infinity,
    })),
  });
  const nombres = new Map<string, string>();
  consultas.forEach((consulta, i) => {
    const par = pares[i];
    const entrada = par ? consulta.data?.datos.find((e) => e.codigo === par.codigo) : undefined;
    if (par && entrada) nombres.set(`${par.catalogo ?? ''}|${par.codigo}`, entrada.nombre);
  });
  return nombres;
}

export function useFlujos(empresaId: string, tipoVinculo?: string, habilitado = true) {
  const opciones = getListarFlujosQueryOptions(tipoVinculo ? { tipoVinculo } : undefined, { request: { empresa: empresaId } });
  return useQuery({ ...opciones, queryKey: conEmpresa(opciones.queryKey, empresaId), enabled: habilitado });
}

export function useFlujo(empresaId: string, id: string) {
  const opciones = getObtenerFlujoQueryOptions(id, { request: { empresa: empresaId } });
  return useQuery({ ...opciones, queryKey: conEmpresa(opciones.queryKey, empresaId), enabled: Boolean(id) });
}

export function useVersionesFlujo(empresaId: string, id: string) {
  const opciones = getListarVersionesFlujoQueryOptions(id, { request: { empresa: empresaId } });
  return useQuery({ ...opciones, queryKey: conEmpresa(opciones.queryKey, empresaId), enabled: Boolean(id) });
}

export function useFlujosPorDefecto(empresaId: string, habilitado = true) {
  const opciones = getListarFlujosPorDefectoQueryOptions({ request: { empresa: empresaId } });
  return useQuery({ ...opciones, queryKey: conEmpresa(opciones.queryKey, empresaId), enabled: habilitado });
}

function useInvalidarFlujos() {
  const cliente = useQueryClient();
  return () => invalidarRuta(cliente, '/api/v1/flujos');
}

export function useCrearFlujo(empresaId: string) {
  const invalidar = useInvalidarFlujos();
  return useMutation({ mutationFn: (dto: CrearFlujoDto) => crearFlujo(dto, { empresa: empresaId }), onSuccess: invalidar });
}

export function useEditarFlujo(empresaId: string, id: string) {
  const invalidar = useInvalidarFlujos();
  return useMutation({ mutationFn: (dto: EditarFlujoDto) => editarFlujo(id, dto, { empresa: empresaId }), onSuccess: invalidar });
}

export function usePublicarFlujo(empresaId: string, id: string) {
  const invalidar = useInvalidarFlujos();
  return useMutation({ mutationFn: () => publicarFlujo(id, { empresa: empresaId }), onSettled: invalidar });
}

export function useDefinirPorDefecto(empresaId: string) {
  const invalidar = useInvalidarFlujos();
  return useMutation({
    mutationFn: ({ tipoVinculoId, flujoId }: { tipoVinculoId: string; flujoId: string }) =>
      definirFlujoPorDefecto({ tipoVinculoId, flujoId, empresaId }, { empresa: empresaId }),
    onSettled: invalidar,
  });
}
