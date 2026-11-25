import type { ErrorApi } from '@validalo/api-client';
import { create } from 'zustand';

/**
 * Reautenticación (step-up) para acciones sensibles (PI-13, PI-20). La API responde 403 `reautenticacion-requerida` a quien tiene una sesión directa sin una
 * confirmación reciente; el cliente de la API llama a `solicitarReautenticacion`, la app abre el diálogo y, si la persona confirma con su passkey o con un código
 * que le llega al correo, repite la petición una vez. Este módulo guarda lo que el diálogo muestra y cuida que haya un solo diálogo abierto a la vez.
 */

export interface PeticionDeReautenticacion {
  /** La acción que se quiso hacer (`rotar-api-key`, `cambiar-roles`…): el diálogo la nombra. */
  accion: string;
  /** Cuánto dura la confirmación: durante ese tiempo no se vuelve a pedir. */
  minutos: number;
  /** Sin passkey (y sin la opción del código) no hay con qué confirmar: se manda a registrar una en Mi cuenta. */
  tienePasskey: boolean;
  /**
   * También se puede confirmar con un código que llega al correo de la cuenta. Los operadores de Plataforma y los grupos que exigen passkey a todos confirman solo
   * con la passkey: la API lo dice con `puedeConCodigo: false`, y sin esa señal la web no ofrece el código.
   */
  puedeConCodigo: boolean;
}

interface EstadoDeReautenticacion {
  peticion: PeticionDeReautenticacion | null;
}

export const useReautenticacion = create<EstadoDeReautenticacion>()(() => ({ peticion: null }));

const MINUTOS_POR_OMISION = 5;

/** Lo que el diálogo necesita, de las extensiones del ProblemDetails (`accion`, `minutos`, `tienePasskey`, `puedeConCodigo`). */
export function peticionDesde(error: ErrorApi): PeticionDeReautenticacion {
  const { accion, minutos, tienePasskey, puedeConCodigo } = error.extensiones;
  return {
    accion: typeof accion === 'string' ? accion : '',
    minutos: typeof minutos === 'number' && Number.isFinite(minutos) && minutos > 0 ? minutos : MINUTOS_POR_OMISION,
    tienePasskey: tienePasskey !== false,
    puedeConCodigo: puedeConCodigo === true,
  };
}

let enCurso: { promesa: Promise<boolean>; resolver: (confirmada: boolean) => void } | null = null;

/**
 * Abre el diálogo y espera la respuesta. Si ya hay uno abierto (dos peticiones sensibles a la vez), la segunda espera la misma confirmación en vez de
 * abrir otro diálogo.
 */
export function solicitarReautenticacion(error: ErrorApi): Promise<boolean> {
  if (enCurso) return enCurso.promesa;
  let resolver: (confirmada: boolean) => void = () => undefined;
  const promesa = new Promise<boolean>((resolve) => {
    resolver = resolve;
  });
  enCurso = { promesa, resolver };
  useReautenticacion.setState({ peticion: peticionDesde(error) });
  return promesa;
}

/** El diálogo terminó: `true` si la persona confirmó (con su passkey o con el código del correo), `false` si cerró o canceló. */
export function resolverReautenticacion(confirmada: boolean): void {
  const actual = enCurso;
  enCurso = null;
  useReautenticacion.setState({ peticion: null });
  actual?.resolver(confirmada);
}

/**
 * Dónde está Mi cuenta según la pantalla actual (consola de Plataforma o una empresa), para mandar a registrar una passkey. Con HashRouter la ruta
 * va tras el `#`.
 */
export function rutaDeMiCuenta(hash: string): string {
  const ruta = hash.replace(/^#/, '');
  if (ruta.startsWith('/plataforma')) return '#/plataforma/mi-cuenta';
  const empresa = /^\/e\/([^/?#]+)/.exec(ruta);
  return empresa ? `#/e/${empresa[1]}/mi-cuenta` : '#/';
}
