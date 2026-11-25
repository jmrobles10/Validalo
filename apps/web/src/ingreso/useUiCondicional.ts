import { obtenerOpcionesPasskeyIngreso, verificarPasskeyIngreso, type PasoDeIngresoDto } from '@validalo/api-client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { esErrorDePasskey, firmarConPasskeyConReintento, soportaPasskeysCondicional } from './passkeys';

const SIN_CREDENCIAL = { token: null, empresa: null } as const;

/** Lo que el paso hace con la petición condicional cuando la persona elige otro camino que también pide una passkey (el botón «Entrar con una passkey»). */
export interface ControlDeUiCondicional {
  /**
   * Aborta la petición condicional abierta y espera a que su promesa se asiente. Hay que hacerlo antes de pedir una passkey con ventana, pero no basta:
   * Chrome rechaza la promesa antes de liberar la petición por dentro y, mientras siga pendiente, rechaza la nueva con «A request is already pending.».
   * Quien pida la ventana debe usar `firmarConPasskeyConReintento`, que espera unos milisegundos y vuelve a intentarlo.
   */
  detenerCondicional: () => Promise<void>;
  /** Vuelve a dejar abierta la petición condicional si se detuvo (al terminar la petición con ventana, haya salido bien o mal y la persona siga en el paso). */
  reanudarCondicional: () => void;
}

interface PeticionCondicional {
  control: AbortController;
  /** Se asienta cuando el navegador ya no tiene pendiente la petición (o nunca llegó a hacerla). */
  liberada: Promise<void>;
}

/**
 * Passkeys en el campo del correo (WebAuthn condicional, PI-14): al llegar al primer paso se deja abierta una petición `mediation: 'conditional'` y el
 * navegador ofrece las passkeys guardadas dentro del autocompletado del campo (`autocomplete="username webauthn"`), sin ventana ni botón. Al elegir una se
 * verifica como cualquier ingreso con passkey. Se aborta al salir del paso.
 *
 * El navegador solo admite una petición de passkey a la vez: una petición con ventana NO aborta la condicional (Chrome la rechaza con «A request is already
 * pending»). Quien pida una con ventana debe antes `detenerCondicional()` y, al terminar, `reanudarCondicional()`. Por la misma razón, una condicional nueva
 * espera a que la anterior se haya liberado antes de pedirse (p. ej. al volver a un correo sin SSO exclusivo) y, si el navegador la rechaza al instante
 * porque la anterior sigue pendiente, se reintenta (`firmarConPasskeyConReintento`) en vez de quedarse sin autocompletado.
 * Si el navegador no la admite, no hace nada: el botón «Entrar con una passkey» sigue ahí.
 */
export function useUiCondicionalDePasskeys(alResultado: (paso: PasoDeIngresoDto) => void, alFallar: (error: unknown) => void, activa = true): ControlDeUiCondicional {
  // Los callbacks cambian en cada render; la petición abierta debe llamar siempre al último sin reiniciarse.
  const resultado = useRef(alResultado);
  const fallo = useRef(alFallar);
  useEffect(() => {
    resultado.current = alResultado;
    fallo.current = alFallar;
  });

  // La última petición (abierta o ya abortada): la siguiente espera a que se libere. Cambiar `intento` reinicia el efecto y con él la petición.
  const ultima = useRef<PeticionCondicional | null>(null);
  const detenida = useRef(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (!activa) return undefined;
    const control = new AbortController();
    const abortada = () => control.signal.aborted;
    const anterior = ultima.current?.liberada ?? Promise.resolve();
    let liberar: () => void = () => undefined;
    const liberada = new Promise<void>((resolver) => {
      liberar = resolver;
    });
    ultima.current = { control, liberada };

    void (async () => {
      try {
        await anterior;
        if (abortada() || !(await soportaPasskeysCondicional()) || abortada()) return;
        const { desafio, opciones } = await obtenerOpcionesPasskeyIngreso(SIN_CREDENCIAL);
        if (abortada()) return;
        // La petición queda libre en cuanto el navegador la asienta (elige, falla o aborta), no cuando termina de verificarse.
        const respuesta = await firmarConPasskeyConReintento(opciones, { senal: control.signal, condicional: true }).finally(liberar);
        if (abortada()) return;
        const paso = await verificarPasskeyIngreso({ desafio, respuesta }, SIN_CREDENCIAL);
        if (!abortada()) resultado.current(paso);
      } catch (error) {
        // Abortar (salir del paso, usar el botón), cerrar el selector o que el navegador siga ocupado tras los reintentos (queda en la consola) no son fallos
        // que la persona deba ver: el autocompletado es un extra y el botón «Entrar con una passkey» sigue ahí.
        if (abortada() || (esErrorDePasskey(error) && (error.causa === 'cancelada' || error.causa === 'conflicto'))) return;
        fallo.current(error);
      } finally {
        liberar();
      }
    })();

    return () => control.abort();
  }, [activa, intento]);

  return useMemo<ControlDeUiCondicional>(
    () => ({
      detenerCondicional: async () => {
        const vigente = ultima.current;
        if (!vigente) return;
        detenida.current = true;
        vigente.control.abort();
        await vigente.liberada;
      },
      reanudarCondicional: () => {
        if (!detenida.current) return;
        detenida.current = false;
        setIntento((n) => n + 1);
      },
    }),
    [],
  );
}
