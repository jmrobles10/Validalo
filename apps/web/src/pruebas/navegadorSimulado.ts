import { vi } from 'vitest';

/**
 * Un navegador con passkeys para las pruebas: `PublicKeyCredential` y `navigator.credentials` falsos. `get` devuelve una firma de verdad (con binarios) para que
 * el código que la serializa corra completo; los tests ven lo que se le pidió (`mediation`, `signal`) en `llamadas`.
 *
 * Imita a Chrome en lo que importa para el ingreso: solo admite una petición de passkey a la vez. Mientras el autenticador tenga una abierta, una nueva se
 * rechaza al instante con `NotAllowedError: A request is already pending.` (la persona no decidió nada). Al abortar la señal de una condicional, Chrome rechaza
 * su promesa de inmediato pero libera la petición por dentro una tarea después: quien pida otra enseguida choca y debe reintentar.
 */
export interface NavegadorSimulado {
  llamadas: { mediation: string | undefined; conSenal: boolean }[];
  /** Las señales de aborto con que se pidió cada firma, para comprobar que se cancelan al salir de la pantalla. */
  senales: AbortSignal[];
  get: ReturnType<typeof vi.fn>;
  restaurar: () => void;
}

class CredencialFalsa {
  id = 'cred-1';
  rawId = new Uint8Array([1, 2, 3]).buffer;
  type = 'public-key';
  response = {
    authenticatorData: new Uint8Array([4, 5]).buffer,
    clientDataJSON: new Uint8Array([6, 7]).buffer,
    signature: new Uint8Array([8, 9]).buffer,
    userHandle: null,
  };
}

export const OPCIONES_DE_FIRMA = { challenge: 'AQID', rpId: 'localhost', userVerification: 'required', allowCredentials: [] };

export interface OpcionesDelNavegadorSimulado {
  /** Responde a `isConditionalMediationAvailable` (si no se indica, el navegador no la tiene). */
  condicional?: boolean;
  /** La petición condicional queda abierta hasta que se aborta (como el navegador) en vez de resolverse con una passkey. */
  esperaLaFirma?: boolean;
  /** La primera petición modal (sin `mediation`) falla con este error del navegador (p. ej. `NotAllowedError` si la persona cierra la ventana). */
  falloDeLaModal?: string;
  /**
   * Milisegundos que tarda en llegar el fallo de la modal: la persona cierra la ventana pasado un rato. Sin esto el fallo es inmediato, como cuando el
   * navegador rechaza sin haber abierto ninguna ventana.
   */
  demoraDelFallo?: number;
  /** El fallo de la modal se repite en cada petición con ventana, no solo en la primera (la persona cierra la ventana siempre). */
  repetirElFallo?: boolean;
}

export function simularNavegadorConPasskeys(opciones: OpcionesDelNavegadorSimulado = {}): NavegadorSimulado {
  const llamadas: NavegadorSimulado['llamadas'] = [];
  const senales: AbortSignal[] = [];
  const anterior = Object.getOwnPropertyDescriptor(window, 'PublicKeyCredential');
  const credenciales = Object.getOwnPropertyDescriptor(navigator, 'credentials');

  const clase = CredencialFalsa as unknown as { isConditionalMediationAvailable?: () => Promise<boolean> };
  if (opciones.condicional !== undefined) clase.isConditionalMediationAvailable = () => Promise.resolve(opciones.condicional === true);
  else delete clase.isConditionalMediationAvailable;

  // Peticiones sin asentar: el navegador solo admite una a la vez.
  let sinAsentar = 0;
  let modalPorFallar = opciones.falloDeLaModal;
  const get = vi.fn((peticion: { mediation?: string; signal?: AbortSignal }) => {
    llamadas.push({ mediation: peticion.mediation, conSenal: peticion.signal !== undefined });
    if (peticion.signal) senales.push(peticion.signal);
    if (peticion.signal?.aborted) return Promise.reject(new DOMException('abortada', 'AbortError'));
    if (sinAsentar > 0) return Promise.reject(new DOMException('A request is already pending.', 'NotAllowedError'));
    const condicional = peticion.mediation === 'conditional';
    // Como Chrome: la petición condicional queda abierta hasta que la persona elige o se aborta; al abortar, la promesa se rechaza al instante y la
    // petición se libera por dentro una tarea después.
    if (opciones.esperaLaFirma && condicional) {
      sinAsentar += 1;
      return new Promise((_resolver, rechazar) => {
        peticion.signal?.addEventListener('abort', () => {
          rechazar(new DOMException('abortada', 'AbortError'));
          setTimeout(() => {
            sinAsentar -= 1;
          }, 0);
        });
      });
    }
    if (!condicional && modalPorFallar) {
      const nombre = modalPorFallar;
      if (!opciones.repetirElFallo) modalPorFallar = undefined;
      const fallo = new DOMException('rechazada', nombre);
      if (!opciones.demoraDelFallo) return Promise.reject(fallo);
      return new Promise((_resolver, rechazar) => setTimeout(() => rechazar(fallo), opciones.demoraDelFallo));
    }
    return Promise.resolve(new CredencialFalsa());
  });
  Object.defineProperty(window, 'PublicKeyCredential', { value: CredencialFalsa, configurable: true, writable: true });
  Object.defineProperty(navigator, 'credentials', { value: { create: vi.fn(), get }, configurable: true });

  return {
    llamadas,
    senales,
    get,
    restaurar: () => {
      if (anterior) Object.defineProperty(window, 'PublicKeyCredential', anterior);
      else delete (window as { PublicKeyCredential?: unknown }).PublicKeyCredential;
      if (credenciales) Object.defineProperty(navigator, 'credentials', credenciales);
      else delete (navigator as { credentials?: unknown }).credentials;
    },
  };
}
