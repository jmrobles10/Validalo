import { describe, expect, it, vi } from 'vitest';
import {
  base64UrlABytes,
  bytesABase64Url,
  conReintentoSiNoHuboDecision,
  ErrorDePasskey,
  esErrorDePasskey,
  ESPERAS_DE_REINTENTO_MS,
  nombreSugeridoDePasskey,
  opcionesDeFirma,
  opcionesDeRegistro,
  respuestaDeFirma,
  respuestaDeRegistro,
  traducirFalloDelNavegador,
  UMBRAL_SIN_DECISION_MS,
  type RelojDePasskeys,
} from './passkeys';

describe('base64url', () => {
  it('va y vuelve sin perder bytes (incluido lo que base64 escribe con + y /)', () => {
    const bytes = new Uint8Array([251, 255, 190, 0, 1, 2, 3, 250]);
    const texto = bytesABase64Url(bytes);
    expect(texto).toMatch(/^[A-Za-z0-9_-]+$/);
    expect([...base64UrlABytes(texto)]).toEqual([...bytes]);
  });

  it('no deja relleno y acepta cualquier largo', () => {
    for (const largo of [0, 1, 2, 3, 4, 31, 32, 33]) {
      const bytes = Uint8Array.from({ length: largo }, (_, i) => (i * 37) % 256);
      const texto = bytesABase64Url(bytes);
      expect(texto).not.toContain('=');
      expect([...base64UrlABytes(texto)]).toEqual([...bytes]);
    }
  });
});

describe('opciones del servidor', () => {
  const registro = {
    rp: { id: 'validalo.co', name: 'Valídalo' },
    user: { id: bytesABase64Url(new Uint8Array([1, 2, 3])), name: 'ana@aceros.co', displayName: 'Ana' },
    challenge: bytesABase64Url(new Uint8Array([9, 9, 9, 9])),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
    timeout: 60_000,
    excludeCredentials: [{ type: 'public-key', id: bytesABase64Url(new Uint8Array([7, 7])) }],
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestation: 'none',
  };

  it('convierte desafío, usuario y credenciales excluidas a binarios', () => {
    const opciones = opcionesDeRegistro(registro);
    expect([...new Uint8Array(opciones.challenge as ArrayBuffer)]).toEqual([9, 9, 9, 9]);
    expect([...new Uint8Array(opciones.user.id as ArrayBuffer)]).toEqual([1, 2, 3]);
    expect(opciones.rp).toEqual({ id: 'validalo.co', name: 'Valídalo' });
    expect(opciones.user.name).toBe('ana@aceros.co');
    expect(opciones.excludeCredentials).toHaveLength(1);
    expect([...new Uint8Array(opciones.excludeCredentials?.[0]?.id as ArrayBuffer)]).toEqual([7, 7]);
    expect(opciones.authenticatorSelection).toEqual({ residentKey: 'required', userVerification: 'required' });
    expect(opciones.attestation).toBe('none');
  });

  it('una opción sin lo indispensable no se inventa', () => {
    expect(() => opcionesDeRegistro({ ...registro, challenge: undefined })).toThrow(ErrorDePasskey);
    expect(() => opcionesDeRegistro({ ...registro, user: undefined })).toThrow(ErrorDePasskey);
    expect(() => opcionesDeRegistro({ ...registro, rp: { id: 'x' } })).toThrow(ErrorDePasskey);
  });

  it('las opciones de firma sin credenciales dejan que el navegador ofrezca las del sitio y exigen verificar al usuario', () => {
    const opciones = opcionesDeFirma({ challenge: bytesABase64Url(new Uint8Array([5, 5])), rpId: 'validalo.co' });
    expect(opciones.allowCredentials).toEqual([]);
    expect(opciones.userVerification).toBe('required');
    expect(opciones.rpId).toBe('validalo.co');

    const conCredencial = opcionesDeFirma({ challenge: bytesABase64Url(new Uint8Array([5])), allowCredentials: [{ type: 'public-key', id: bytesABase64Url(new Uint8Array([1])) }] });
    expect(conCredencial.allowCredentials).toHaveLength(1);
  });
});

describe('respuestas del navegador', () => {
  const credencial = (respuesta: object) =>
    ({ id: 'cred-1', rawId: new Uint8Array([1, 2, 3]).buffer, type: 'public-key', response: respuesta }) as unknown as PublicKeyCredential;

  it('serializa el registro con los binarios en base64url', () => {
    const resultado = respuestaDeRegistro(
      credencial({ attestationObject: new Uint8Array([4, 5]).buffer, clientDataJSON: new Uint8Array([6]).buffer, getTransports: () => ['internal'] }),
    );
    expect(resultado).toEqual({
      id: 'cred-1',
      rawId: bytesABase64Url(new Uint8Array([1, 2, 3])),
      type: 'public-key',
      response: { attestationObject: bytesABase64Url(new Uint8Array([4, 5])), clientDataJSON: bytesABase64Url(new Uint8Array([6])), transports: ['internal'] },
      clientExtensionResults: {},
    });
  });

  it('serializa la firma y manda el manejador solo si lo hay', () => {
    const base = { authenticatorData: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer, signature: new Uint8Array([3]).buffer };
    expect(respuestaDeFirma(credencial({ ...base, userHandle: new Uint8Array([8, 8]).buffer })).response.userHandle).toBe(bytesABase64Url(new Uint8Array([8, 8])));
    expect(respuestaDeFirma(credencial({ ...base, userHandle: null })).response.userHandle).toBeNull();
    expect(respuestaDeFirma(credencial({ ...base, userHandle: new Uint8Array([]).buffer })).response.userHandle).toBeNull();
  });
});

describe('fallos del navegador', () => {
  const dom = (nombre: string) => new DOMException('x', nombre);

  it('traduce cancelar, repetir y no poder a causas que la pantalla explica', () => {
    expect(traducirFalloDelNavegador(dom('NotAllowedError')).causa).toBe('cancelada');
    expect(traducirFalloDelNavegador(dom('AbortError')).causa).toBe('cancelada');
    expect(traducirFalloDelNavegador(dom('InvalidStateError')).causa).toBe('ya-registrada');
    expect(traducirFalloDelNavegador(dom('NotSupportedError')).causa).toBe('no-soportada');
    expect(traducirFalloDelNavegador(dom('SecurityError')).causa).toBe('no-soportada');
    expect(traducirFalloDelNavegador(new Error('raro')).causa).toBe('otra');
    const propio = new ErrorDePasskey('cancelada', 'x');
    expect(traducirFalloDelNavegador(propio)).toBe(propio);
  });

  it('«A request is already pending» es un conflicto, no una cancelación, se llame como se llame el error del navegador', () => {
    const mensaje = 'A request is already pending.';
    expect(traducirFalloDelNavegador(new DOMException(mensaje, 'NotAllowedError')).causa).toBe('conflicto');
    expect(traducirFalloDelNavegador(new DOMException(mensaje, 'OperationError')).causa).toBe('conflicto');
    expect(traducirFalloDelNavegador(new DOMException(mensaje, 'InvalidStateError')).causa).toBe('conflicto');
    expect(traducirFalloDelNavegador(new DOMException('The request is not allowed', 'NotAllowedError')).causa).toBe('cancelada');
  });

  it('conserva el nombre y el mensaje que dio el navegador', () => {
    expect(traducirFalloDelNavegador(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'))).toMatchObject({
      causa: 'cancelada',
      origen: { nombre: 'NotAllowedError', mensaje: 'The operation either timed out or was not allowed.' },
    });
    expect(traducirFalloDelNavegador(new TypeError('raro'))).toMatchObject({ causa: 'otra', message: 'raro', origen: { nombre: 'TypeError', mensaje: 'raro' } });
    expect(new ErrorDePasskey('otra', 'x').origen).toBeNull();
  });
});

/** Un reloj que no espera de verdad: cada espera solo suma su tiempo al reloj y queda anotada. */
function relojFalso() {
  let ms = 1_000;
  const esperas: number[] = [];
  const reloj: RelojDePasskeys = {
    ahora: () => ms,
    esperar: (espera) => {
      esperas.push(espera);
      ms += espera;
      return Promise.resolve();
    },
  };
  return {
    reloj,
    esperas,
    pasar: (n: number) => {
      ms += n;
    },
  };
}

describe('reintento cuando el navegador rechaza sin que la persona decida', () => {
  const rechazo = (nombre: string, mensaje = 'x') => new DOMException(mensaje, nombre);

  it('un NotAllowedError casi al instante (no hubo ventana) se repite con espera creciente hasta que entra', async () => {
    const { reloj, esperas } = relojFalso();
    const operacion = vi.fn().mockRejectedValueOnce(rechazo('NotAllowedError')).mockRejectedValueOnce(rechazo('NotAllowedError')).mockResolvedValue('firma');

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).resolves.toBe('firma');

    expect(operacion).toHaveBeenCalledTimes(3);
    expect(esperas).toEqual([150, 300]);
  });

  it('un InvalidStateError casi al instante también se repite', async () => {
    const { reloj, esperas } = relojFalso();
    const operacion = vi.fn().mockRejectedValueOnce(rechazo('InvalidStateError')).mockResolvedValue('firma');

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).resolves.toBe('firma');
    expect(esperas).toEqual([150]);
  });

  it('un conflicto («pending») se repite aunque el navegador lo llame de otra forma', async () => {
    const { reloj, esperas } = relojFalso();
    const operacion = vi.fn().mockRejectedValueOnce(rechazo('OperationError', 'A request is already pending.')).mockResolvedValue('firma');

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).resolves.toBe('firma');
    expect(esperas).toEqual([150]);
  });

  it('si el fallo llega pasado el umbral la persona cerró la ventana: es una cancelación y no se repite', async () => {
    const { reloj, esperas, pasar } = relojFalso();
    const operacion = vi.fn(() => {
      pasar(UMBRAL_SIN_DECISION_MS + 100);
      return Promise.reject(rechazo('NotAllowedError', 'The operation either timed out or was not allowed.'));
    });

    const error = await conReintentoSiNoHuboDecision(operacion, { reloj }).catch((e: unknown) => e);

    expect(error).toMatchObject({ causa: 'cancelada', origen: { nombre: 'NotAllowedError' } });
    expect(operacion).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it('el umbral se mide desde cada intento: tras un rechazo al instante, cerrar la ventana en el siguiente no se repite', async () => {
    const { reloj, esperas, pasar } = relojFalso();
    const operacion = vi
      .fn()
      .mockRejectedValueOnce(rechazo('NotAllowedError', 'A request is already pending.'))
      .mockImplementationOnce(() => {
        pasar(2_000);
        return Promise.reject(rechazo('NotAllowedError'));
      });

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).rejects.toMatchObject({ causa: 'cancelada' });

    expect(operacion).toHaveBeenCalledTimes(2);
    expect(esperas).toEqual([150]);
  });

  it('agota los reintentos y entrega el último fallo: tres reintentos (150, 300 y 600 ms) y un cuarto rechazo', async () => {
    expect([...ESPERAS_DE_REINTENTO_MS]).toEqual([150, 300, 600]);
    const { reloj, esperas } = relojFalso();
    const operacion = vi.fn(() => Promise.reject(rechazo('NotAllowedError')));

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).rejects.toMatchObject({ causa: 'cancelada' });

    expect(operacion).toHaveBeenCalledTimes(4);
    expect(esperas).toEqual([150, 300, 600]);
  });

  it('si el conflicto no se va, el fallo que queda es un conflicto y no una cancelación', async () => {
    const { reloj } = relojFalso();
    const operacion = vi.fn(() => Promise.reject(rechazo('NotAllowedError', 'A request is already pending.')));

    const error = await conReintentoSiNoHuboDecision(operacion, { reloj }).catch((e: unknown) => e);

    expect(esErrorDePasskey(error)).toBe(true);
    expect(error).toMatchObject({ causa: 'conflicto', origen: { nombre: 'NotAllowedError', mensaje: 'A request is already pending.' } });
  });

  it('los demás fallos no se repiten: sin soporte, otros errores y los propios de la ceremonia', async () => {
    for (const fallo of [rechazo('NotSupportedError'), rechazo('SecurityError'), new TypeError('raro'), new ErrorDePasskey('otra', 'opciones incompletas')]) {
      const { reloj, esperas } = relojFalso();
      const operacion = vi.fn(() => Promise.reject(fallo));

      await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).rejects.toBeInstanceOf(ErrorDePasskey);

      expect(operacion).toHaveBeenCalledTimes(1);
      expect(esperas).toEqual([]);
    }
  });

  it('un AbortError (la persona salió o eligió otro camino) no se repite', async () => {
    const { reloj, esperas } = relojFalso();
    const operacion = vi.fn(() => Promise.reject(rechazo('AbortError')));

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj })).rejects.toMatchObject({ causa: 'cancelada' });

    expect(operacion).toHaveBeenCalledTimes(1);
    expect(esperas).toEqual([]);
  });

  it('con la señal abortada no se repite, ni siquiera si se aborta durante la espera', async () => {
    const control = new AbortController();
    const { reloj } = relojFalso();
    const operacion = vi.fn(() => Promise.reject(rechazo('NotAllowedError')));
    const abortaAlEsperar: RelojDePasskeys = {
      ...reloj,
      esperar: (ms, senal) => {
        control.abort();
        return reloj.esperar(ms, senal);
      },
    };

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj: abortaAlEsperar, senal: control.signal })).rejects.toMatchObject({ causa: 'cancelada' });
    expect(operacion).toHaveBeenCalledTimes(1);

    await expect(conReintentoSiNoHuboDecision(operacion, { reloj, senal: control.signal })).rejects.toMatchObject({ causa: 'cancelada' });
    expect(operacion).toHaveBeenCalledTimes(2);
  });

  it('con el reloj real espera de verdad entre intentos', async () => {
    const operacion = vi.fn().mockRejectedValueOnce(rechazo('NotAllowedError')).mockResolvedValue('firma');
    const inicio = performance.now();

    await expect(conReintentoSiNoHuboDecision(operacion, { esperas: [30] })).resolves.toBe('firma');

    expect(performance.now() - inicio).toBeGreaterThanOrEqual(25);
  });

  it('la espera real termina antes si la señal se aborta', async () => {
    const control = new AbortController();
    const operacion = vi.fn(() => Promise.reject(rechazo('NotAllowedError')));
    const inicio = performance.now();
    setTimeout(() => control.abort(), 20);

    await expect(conReintentoSiNoHuboDecision(operacion, { esperas: [5_000], senal: control.signal })).rejects.toMatchObject({ causa: 'cancelada' });

    expect(performance.now() - inicio).toBeLessThan(2_000);
    expect(operacion).toHaveBeenCalledTimes(1);
  });
});

describe('nombre sugerido', () => {
  it('combina navegador y sistema', () => {
    expect(nombreSugeridoDePasskey('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36')).toBe('Chrome en Windows');
    expect(nombreSugeridoDePasskey('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0')).toBe('Edge en Windows');
    expect(nombreSugeridoDePasskey('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1')).toBe('Safari en iOS');
    expect(nombreSugeridoDePasskey('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0')).toBe('Firefox en Linux');
    expect(nombreSugeridoDePasskey('')).toBe('Mi passkey');
  });
});
