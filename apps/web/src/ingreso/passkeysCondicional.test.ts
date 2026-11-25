// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { simularNavegadorConPasskeys, OPCIONES_DE_FIRMA, type NavegadorSimulado } from '../pruebas/navegadorSimulado';
import { esErrorDePasskey, firmarConPasskey, firmarConPasskeyConReintento, soportaPasskeysCondicional, UMBRAL_SIN_DECISION_MS, type RelojDePasskeys } from './passkeys';

let navegador: NavegadorSimulado | null = null;

afterEach(() => {
  navegador?.restaurar();
  navegador = null;
  vi.restoreAllMocks();
});

describe('UI condicional de passkeys (PI-14)', () => {
  it('sin passkeys en el navegador no se ofrece', async () => {
    await expect(soportaPasskeysCondicional()).resolves.toBe(false);
  });

  it('un navegador con passkeys pero sin la consulta condicional tampoco', async () => {
    navegador = simularNavegadorConPasskeys();
    await expect(soportaPasskeysCondicional()).resolves.toBe(false);
  });

  it('se ofrece solo si el navegador dice que puede', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true });
    await expect(soportaPasskeysCondicional()).resolves.toBe(true);
    navegador.restaurar();
    navegador = simularNavegadorConPasskeys({ condicional: false });
    await expect(soportaPasskeysCondicional()).resolves.toBe(false);
  });

  it('pide la firma condicional con mediation conditional y la señal para poder abortarla', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true });
    const control = new AbortController();

    const respuesta = await firmarConPasskey(OPCIONES_DE_FIRMA, control.signal, true);

    expect(navegador.llamadas).toEqual([{ mediation: 'conditional', conSenal: true }]);
    expect(respuesta).toMatchObject({ id: 'cred-1', type: 'public-key', response: { signature: 'CAk' } });
  });

  it('la firma de siempre (el botón) no es condicional', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true });
    await firmarConPasskey(OPCIONES_DE_FIRMA);
    expect(navegador.llamadas).toEqual([{ mediation: undefined, conSenal: false }]);
  });

  it('que el navegador aborte la petición condicional es una cancelación, no un fallo', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true });
    navegador.get.mockRejectedValueOnce(new DOMException('abortada', 'AbortError'));

    const error = await firmarConPasskey(OPCIONES_DE_FIRMA, new AbortController().signal, true).catch((e: unknown) => e);

    expect(esErrorDePasskey(error)).toBe(true);
    expect(error).toMatchObject({ causa: 'cancelada' });
  });

  it('el navegador (el simulador imita a Chrome) no admite dos peticiones a la vez: abortar rechaza la promesa de la condicional pero la ventana pedida enseguida choca con «pending»', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true, esperaLaFirma: true });
    const control = new AbortController();
    const condicional = firmarConPasskey(OPCIONES_DE_FIRMA, control.signal, true).catch((e: unknown) => e);

    // Chrome rechaza la promesa al abortar, pero libera la petición por dentro un poco después: la ventana pedida justo ahí choca.
    control.abort();
    await expect(condicional).resolves.toMatchObject({ causa: 'cancelada' });
    const choque = await firmarConPasskey(OPCIONES_DE_FIRMA).catch((e: unknown) => e);
    expect(choque).toMatchObject({ causa: 'conflicto', origen: { nombre: 'NotAllowedError', mensaje: 'A request is already pending.' } });

    // Una vez liberada, la ventana se abre sin problema.
    await new Promise((r) => setTimeout(r, 10));
    await expect(firmarConPasskey(OPCIONES_DE_FIRMA)).resolves.toMatchObject({ id: 'cred-1' });
  });

  it('firmarConPasskeyConReintento espera a que Chrome libere la condicional abortada y la ventana entra, sin que la persona vea el choque', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true, esperaLaFirma: true });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const control = new AbortController();
    const condicional = firmarConPasskey(OPCIONES_DE_FIRMA, control.signal, true).catch((e: unknown) => e);
    control.abort();
    await condicional;
    const esperas: number[] = [];
    const reloj: RelojDePasskeys = {
      ahora: () => performance.now(),
      esperar: (ms) => {
        esperas.push(ms);
        return new Promise((r) => setTimeout(r, 10));
      },
    };

    const respuesta = await firmarConPasskeyConReintento(OPCIONES_DE_FIRMA, { reloj });

    expect(respuesta).toMatchObject({ id: 'cred-1' });
    expect(esperas).toEqual([150]);
    expect(navegador.llamadas.map((l) => l.mediation)).toEqual(['conditional', undefined, undefined]);
  });

  it('firmarConPasskeyConReintento no repite si la persona cierra la ventana: el fallo tarda más que el umbral', async () => {
    navegador = simularNavegadorConPasskeys({ falloDeLaModal: 'NotAllowedError', demoraDelFallo: UMBRAL_SIN_DECISION_MS + 100 });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(firmarConPasskeyConReintento(OPCIONES_DE_FIRMA)).rejects.toMatchObject({ causa: 'cancelada', origen: { nombre: 'NotAllowedError', mensaje: 'rechazada' } });

    expect(navegador.llamadas).toHaveLength(1);
  });

  it('deja en la consola el nombre y el mensaje del error del navegador, y nada más', async () => {
    navegador = simularNavegadorConPasskeys();
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    navegador.get.mockRejectedValueOnce(new DOMException('A request is already pending.', 'NotAllowedError'));

    await firmarConPasskey(OPCIONES_DE_FIRMA).catch(() => undefined);

    expect(aviso).toHaveBeenCalledTimes(1);
    expect(aviso).toHaveBeenCalledWith('[passkeys] firmar: NotAllowedError: A request is already pending. (causa: conflicto)');
  });

  it('abortar la condicional es lo normal al salir de la pantalla: no se registra', async () => {
    navegador = simularNavegadorConPasskeys({ condicional: true, esperaLaFirma: true });
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const control = new AbortController();
    const condicional = firmarConPasskey(OPCIONES_DE_FIRMA, control.signal, true).catch((e: unknown) => e);

    control.abort();
    await condicional;

    expect(aviso).not.toHaveBeenCalled();
  });
});
