import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorApi, reiniciarCliente } from '@validalo/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarPantalla } from '../pruebas/montar';
import { OPCIONES_DE_FIRMA, simularNavegadorConPasskeys, type NavegadorSimulado } from '../pruebas/navegadorSimulado';
import { ProblemaSimulado, simularApi } from '../pruebas/simularApi';
import { DialogoDeReautenticacion } from './DialogoDeReautenticacion';
import { resolverReautenticacion, solicitarReautenticacion, useReautenticacion } from './reautenticacion';

let navegador: NavegadorSimulado | null = null;

afterEach(() => {
  vi.restoreAllMocks();
  act(() => resolverReautenticacion(false));
  navegador?.restaurar();
  navegador = null;
  reiniciarCliente();
  window.location.hash = '';
});

function requerir(extensiones: Record<string, unknown> = { accion: 'rotar-api-key', minutos: 5, tienePasskey: true }): Promise<boolean> {
  let respuesta: Promise<boolean> = Promise.resolve(false);
  act(() => {
    respuesta = solicitarReautenticacion(new ErrorApi(403, 'reautenticacion-requerida', 'Confirma con tu passkey', null, null, {}, extensiones));
  });
  return respuesta;
}

describe('diálogo de reautenticación (PI-13)', () => {
  it('no se ve mientras nadie pide confirmar', () => {
    montarPantalla(<DialogoDeReautenticacion />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('dice qué acción se confirma, pide la passkey a la API y deja repetir la petición', async () => {
    navegador = simularNavegadorConPasskeys();
    const peticiones = simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/opciones': { desafio: 'desafio-1', opciones: OPCIONES_DE_FIRMA },
      'POST /api/v1/mi-cuenta/reautenticacion': { hasta: '2026-11-11T15:05:00Z', minutos: 5 },
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();

    const confirmada = requerir();

    expect(await screen.findByRole('dialog', { name: 'Confirma que eres tú' })).toBeInTheDocument();
    expect(screen.getByText('Para rotar una API key, confirma con tu passkey.')).toBeInTheDocument();
    expect(screen.getByText('Con esto no te lo volvemos a pedir durante 5 minutos.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Usar mi passkey' }));

    await expect(confirmada).resolves.toBe(true);
    expect(peticiones.map((p) => `${p.metodo} ${p.ruta}`)).toEqual(['POST /api/v1/mi-cuenta/reautenticacion/opciones', 'POST /api/v1/mi-cuenta/reautenticacion']);
    expect(peticiones[1]?.cuerpo).toMatchObject({ desafio: 'desafio-1', respuesta: { id: 'cred-1', type: 'public-key' } });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useReautenticacion.getState().peticion).toBeNull();
  });

  it('cancelar cierra el diálogo y responde que no se confirmó', async () => {
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir();

    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }));

    await expect(confirmada).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('si la persona cierra la ventana de la passkey (el error llega tarde) explica qué pasó, no reintenta y deja intentar otra vez sin cerrar', async () => {
    navegador = simularNavegadorConPasskeys({ falloDeLaModal: 'NotAllowedError', demoraDelFallo: 500 });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/opciones': { desafio: 'desafio-1', opciones: OPCIONES_DE_FIRMA },
      'POST /api/v1/mi-cuenta/reautenticacion': { hasta: '2026-11-11T15:05:00Z', minutos: 5 },
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir();

    await usuario.click(await screen.findByRole('button', { name: 'Usar mi passkey' }));
    expect(await screen.findByText('No se completó el paso de la passkey. Inténtalo de nuevo cuando quieras.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(navegador.get).toHaveBeenCalledTimes(1);

    await usuario.click(screen.getByRole('button', { name: 'Usar mi passkey' }));
    await expect(confirmada).resolves.toBe(true);
  });

  it('si el navegador rechaza la passkey al instante, sin ventana, se reintenta solo y se confirma sin mostrar ningún error', async () => {
    navegador = simularNavegadorConPasskeys();
    navegador.get.mockRejectedValueOnce(new DOMException('A request is already pending.', 'NotAllowedError'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/opciones': { desafio: 'desafio-1', opciones: OPCIONES_DE_FIRMA },
      'POST /api/v1/mi-cuenta/reautenticacion': { hasta: '2026-11-11T15:05:00Z', minutos: 5 },
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir();

    await usuario.click(await screen.findByRole('button', { name: 'Usar mi passkey' }));

    await expect(confirmada).resolves.toBe(true);
    expect(navegador.get).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('un error de la API al confirmar se muestra y no se da por confirmado', async () => {
    navegador = simularNavegadorConPasskeys();
    simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/opciones': { desafio: 'desafio-1', opciones: OPCIONES_DE_FIRMA },
      'POST /api/v1/mi-cuenta/reautenticacion': new ProblemaSimulado(401, 'passkey-invalida', 'La passkey no es válida.'),
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    void requerir();

    await usuario.click(await screen.findByRole('button', { name: 'Usar mi passkey' }));

    expect(await screen.findByText('No pudimos verificar tu passkey. Inténtalo de nuevo.')).toBeInTheDocument();
    expect(useReautenticacion.getState().peticion).not.toBeNull();
  });

  it('sin ninguna passkey no hay con qué confirmar: lleva a registrarla en Mi cuenta', async () => {
    window.location.hash = '#/plataforma/operadores';
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir({ accion: 'desactivar-operador', minutos: 5, tienePasskey: false });

    expect(await screen.findByRole('dialog', { name: 'Registra una passkey' })).toBeInTheDocument();
    expect(screen.getByText(/Para desactivar un operador de Plataforma necesitas una passkey/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usar mi passkey' })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Ir a Mi cuenta' }));

    await expect(confirmada).resolves.toBe(false);
    expect(window.location.hash).toBe('#/plataforma/mi-cuenta');
  });

  it('una acción que la app no conoce se dice de forma genérica', async () => {
    montarPantalla(<DialogoDeReautenticacion />);
    void requerir({ accion: 'accion-nueva', minutos: 5, tienePasskey: true });
    expect(await screen.findByText('Para hacer esta acción, confirma con tu passkey.')).toBeInTheDocument();
  });

  it('sin la señal de la API no ofrece el código: solo la passkey (operadores y grupos que la exigen)', async () => {
    montarPantalla(<DialogoDeReautenticacion />);
    void requerir({ accion: 'desactivar-operador', minutos: 5, tienePasskey: true, puedeConCodigo: false });
    expect(await screen.findByRole('button', { name: 'Usar mi passkey' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviarme un código al correo' })).not.toBeInTheDocument();
  });
});

const CON_CODIGO = { accion: 'rotar-api-key', minutos: 5, tienePasskey: true, puedeConCodigo: true };
const SIN_PASSKEY_CON_CODIGO = { ...CON_CODIGO, tienePasskey: false };
const CODIGO_ENVIADO = { desafio: 'codigo-1', expira: '2026-11-11T15:05:00Z', mensaje: 'Te enviamos un código de 6 dígitos a ana@norte.co. Vence en 5 minutos.' };
const CONFIRMADA = { hasta: '2026-11-11T15:05:00Z', minutos: 5 };

async function escribirCodigo(usuario: ReturnType<typeof userEvent.setup>, digitos: string): Promise<void> {
  await usuario.click(screen.getByLabelText('Dígito 1 de 6'));
  await usuario.keyboard(digitos);
}

describe('confirmar con el código del correo (PI-20)', () => {
  it('con passkey y con la opción del código ofrece las dos formas y la passkey sigue confirmando', async () => {
    navegador = simularNavegadorConPasskeys();
    const peticiones = simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/opciones': { desafio: 'desafio-1', opciones: OPCIONES_DE_FIRMA },
      'POST /api/v1/mi-cuenta/reautenticacion': CONFIRMADA,
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir(CON_CODIGO);

    expect(await screen.findByRole('dialog', { name: 'Confirma que eres tú' })).toBeInTheDocument();
    expect(screen.getByText('Para rotar una API key, confirma con tu passkey o con un código que te enviamos al correo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviarme un código al correo' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Usar mi passkey' }));

    await expect(confirmada).resolves.toBe(true);
    expect(peticiones.map((p) => p.ruta)).toEqual(['/api/v1/mi-cuenta/reautenticacion/opciones', '/api/v1/mi-cuenta/reautenticacion']);
  });

  it('elegir el código lo pide a la API, verifica los seis dígitos y confirma', async () => {
    const peticiones = simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/codigo': CODIGO_ENVIADO,
      'POST /api/v1/mi-cuenta/reautenticacion/codigo/verificar': CONFIRMADA,
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir(CON_CODIGO);

    await usuario.click(await screen.findByRole('button', { name: 'Enviarme un código al correo' }));
    expect(await screen.findByText(/Te enviamos el código\. Vence a las/)).toBeInTheDocument();
    expect(screen.getByText('Para rotar una API key, escribe el código de 6 dígitos que te enviamos al correo de tu cuenta.')).toBeInTheDocument();
    expect(screen.getByText(/Con esto no te lo volvemos a pedir durante 5 minutos\./)).toBeInTheDocument();

    await escribirCodigo(usuario, '482915');

    await expect(confirmada).resolves.toBe(true);
    expect(peticiones.map((p) => `${p.metodo} ${p.ruta}`)).toEqual([
      'POST /api/v1/mi-cuenta/reautenticacion/codigo',
      'POST /api/v1/mi-cuenta/reautenticacion/codigo/verificar',
    ]);
    expect(peticiones[1]?.cuerpo).toEqual({ desafio: 'codigo-1', codigo: '482915' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sin passkeys va directo al código: lo pide solo y no ofrece la passkey', async () => {
    const peticiones = simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/codigo': CODIGO_ENVIADO,
      'POST /api/v1/mi-cuenta/reautenticacion/codigo/verificar': CONFIRMADA,
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir(SIN_PASSKEY_CON_CODIGO);

    expect(await screen.findByText(/Te enviamos el código\. Vence a las/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Usar mi passkey' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Registra una passkey' })).not.toBeInTheDocument();
    expect(peticiones.map((p) => p.ruta)).toEqual(['/api/v1/mi-cuenta/reautenticacion/codigo']);

    await escribirCodigo(usuario, '482915');
    await expect(confirmada).resolves.toBe(true);
  });

  it('un código incorrecto dice cuántos intentos quedan, deja escribir otro y no cierra el diálogo', async () => {
    simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/codigo': CODIGO_ENVIADO,
      'POST /api/v1/mi-cuenta/reautenticacion/codigo/verificar': (p) =>
        (p.cuerpo as { codigo: string }).codigo === '482915' ? CONFIRMADA : new ProblemaSimulado(422, 'codigo-invalido', 'El código no es correcto.', { intentosRestantes: 4 }),
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir(SIN_PASSKEY_CON_CODIGO);
    await screen.findByText(/Te enviamos el código\. Vence a las/);

    await escribirCodigo(usuario, '111111');
    expect(await screen.findByText('El código no es correcto. Te quedan 4 intentos.')).toBeInTheDocument();
    expect(useReautenticacion.getState().peticion).not.toBeNull();

    await escribirCodigo(usuario, '482915');
    await expect(confirmada).resolves.toBe(true);
  });

  it('un código vencido o bloqueado ofrece pedir otro al instante y el nuevo confirma', async () => {
    let pedidos = 0;
    const peticiones = simularApi({
      'POST /api/v1/mi-cuenta/reautenticacion/codigo': () => ({ ...CODIGO_ENVIADO, desafio: `codigo-${String(++pedidos)}` }),
      'POST /api/v1/mi-cuenta/reautenticacion/codigo/verificar': (p) =>
        (p.cuerpo as { desafio: string }).desafio === 'codigo-2' ? CONFIRMADA : new ProblemaSimulado(410, 'codigo-vencido', 'El código venció.'),
    });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir(SIN_PASSKEY_CON_CODIGO);
    await screen.findByText(/Te enviamos el código\. Vence a las/);

    await escribirCodigo(usuario, '482915');
    expect(await screen.findByText('El código venció. Pide uno nuevo.')).toBeInTheDocument();
    await usuario.click(await screen.findByRole('button', { name: 'Reenviar código' }));
    await waitFor(() => expect(pedidos).toBe(2));
    await waitFor(() => expect(screen.queryByText('El código venció. Pide uno nuevo.')).not.toBeInTheDocument());

    await escribirCodigo(usuario, '482915');
    await expect(confirmada).resolves.toBe(true);
    expect(peticiones.filter((p) => p.ruta.endsWith('/codigo/verificar')).map((p) => (p.cuerpo as { desafio: string }).desafio)).toEqual(['codigo-1', 'codigo-2']);
  });

  it('si no se puede enviar el código (límite por hora) lo explica y deja reintentar', async () => {
    simularApi({ 'POST /api/v1/mi-cuenta/reautenticacion/codigo': new ProblemaSimulado(429, 'limite-de-envios', 'Ya pediste varios códigos en la última hora.') });
    montarPantalla(<DialogoDeReautenticacion />);
    void requerir(SIN_PASSKEY_CON_CODIGO);

    expect(await screen.findByText('Ya pediste varios códigos en la última hora. Espera un poco o confirma con tu passkey.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reenviar código' })).toBeEnabled();
  });

  it('quien tiene passkey puede volver a ella desde el código, y cancelar cierra sin confirmar', async () => {
    simularApi({ 'POST /api/v1/mi-cuenta/reautenticacion/codigo': CODIGO_ENVIADO });
    montarPantalla(<DialogoDeReautenticacion />);
    const usuario = userEvent.setup();
    const confirmada = requerir(CON_CODIGO);

    await usuario.click(await screen.findByRole('button', { name: 'Enviarme un código al correo' }));
    await screen.findByText(/Te enviamos el código\. Vence a las/);
    await usuario.click(screen.getByRole('button', { name: 'Usar mi passkey' }));
    expect(await screen.findByText('Para rotar una API key, confirma con tu passkey o con un código que te enviamos al correo.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Enviarme un código al correo' }));
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await expect(confirmada).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
