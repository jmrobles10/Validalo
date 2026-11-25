import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, type AntiguedadDeCertificacionDto, type CertificacionDeCuentaDto, type CuentaBancariaPublicaDto, type VinculoPublicoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpcionesSubida, ResultadoSubida } from '../boveda/subida';
import { useAvisos } from '../shared/useAvisos';
import { PaginaCuentas } from './PaginaCuentas';

// La subida real habla con el almacenamiento por XHR: aquí se simula y se mira a qué documento se le pidió subir.
const subirDocumentoSimulado = vi.hoisted(() => vi.fn<(opciones: OpcionesSubida) => Promise<ResultadoSubida>>());
vi.mock('../boveda/subida', async (importarOriginal) => ({ ...(await importarOriginal<typeof import('../boveda/subida')>()), subirDocumento: subirDocumentoSimulado }));

// Los menús y las listas de MUI necesitan el retardo de un macrotask entre acciones: `userEvent.setup()` lo quita por omisión en la preparación de las pruebas (PV-5).

const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': estado >= 400 ? 'application/problem+json' : 'application/json' } });

function vinculo(id: string, nombre: string, cambios: Partial<VinculoPublicoDto> = {}): VinculoPublicoDto {
  return {
    id,
    empresa: { id: `emp-${id}`, nombre, logoUrl: null },
    tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
    estado: 'Activo',
    invitacionAceptada: true,
    invitacionAceptadaEn: '2026-10-01T10:00:00Z',
    ...cambios,
  };
}

/** La certificación de la cuenta tal como la devuelve la API: versión 1, vigente y con lo que leyó la IA (sin diferencias por omisión). */
function certificacion(cambios: Partial<CertificacionDeCuentaDto> = {}): CertificacionDeCuentaDto {
  return {
    documentoId: 'doc-1',
    version: 1,
    estado: 'Actual',
    cargadaEn: '2026-10-03T10:00:00Z',
    nombreArchivo: 'certificacion.pdf',
    verificacion: 'Coincide',
    discrepanciaCritica: false,
    campos: [],
    ...cambios,
  };
}

function cuenta(id: string, cambios: Partial<CuentaBancariaPublicaDto> = {}): CuentaBancariaPublicaDto {
  return {
    id,
    banco: 'Bancolombia',
    tipoCuenta: 'Ahorros',
    numeroEnmascarado: '****5678',
    titular: 'Aceros del Norte S.A.S.',
    identificacionTitular: '900123456-7',
    moneda: 'COP',
    estado: 'Activa',
    registradaEn: '2026-10-02T10:00:00Z',
    designadaEn: [],
    certificacion: certificacion(),
    faltaCertificacion: false,
    ...cambios,
  };
}

const BANCOS = [
  { codigo: '1007', nombre: 'Bancolombia', activo: true },
  { codigo: '1051', nombre: 'Banco Davivienda', activo: true },
];

const VINCULOS = [vinculo('v1', 'Constructora Norte'), vinculo('v2', 'Ferretería Sur'), vinculo('v3', 'Minera Andina', { invitacionAceptada: false })];

interface Peticion {
  metodo: string;
  url: string;
  cuerpo: unknown;
}

/** Responde la lista de cuentas y los vínculos; las mutaciones, con `alMutar`. */
function montar(cuentas: CuentaBancariaPublicaDto[], alMutar: (p: Peticion) => Response = () => json(200, {})) {
  const mutaciones: Peticion[] = [];
  configurarCliente({
    fetch: vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const direccion = url instanceof Request ? url.url : url.toString();
      const metodo = init?.method ?? 'GET';
      if (metodo === 'GET' && direccion.includes('/catalogos/bancos')) return Promise.resolve(json(200, { datos: BANCOS, siguienteCursor: null }));
      if (metodo === 'GET') return Promise.resolve(json(200, direccion.includes('/cuentas-bancarias') ? cuentas : VINCULOS));
      const peticion: Peticion = { metodo, url: direccion, cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
      mutaciones.push(peticion);
      return Promise.resolve(alMutar(peticion));
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <MemoryRouter>
          <PaginaCuentas />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return mutaciones;
}

/** Pega el texto en vez de teclearlo letra por letra: la suite completa corre en paralelo y teclear es lento. */
async function escribir(usuario: ReturnType<typeof userEvent.setup>, campo: HTMLElement, texto: string) {
  await usuario.click(campo);
  await usuario.paste(texto);
}

/** El banco se elige de la lista del catálogo (autocompletar con el código de compensación detrás). */
async function elegirBanco(usuario: ReturnType<typeof userEvent.setup>, dialogo: HTMLElement, nombre: string) {
  await usuario.click(within(dialogo).getByRole('combobox', { name: /Banco/ }));
  await usuario.click(await screen.findByRole('option', { name: nombre }));
}

const certificacionPdf = () => new File(['%PDF-1.4'], 'certificacion.pdf', { type: 'application/pdf' });

const resultadoLista = (n = 1): ResultadoSubida => ({ tipo: 'lista', version: { documentoId: 'doc-1', n, estado: 'Actual' } as never, compartidos: [] });

beforeEach(() => subirDocumentoSimulado.mockReset());

afterEach(() => reiniciarCliente());

describe('mis cuentas bancarias', () => {
  it('las cuentas van en una rejilla (una columna en pantallas angostas y dos desde lg, con el panel ancho de las listas)', async () => {
    montar([cuenta('c1'), cuenta('c2', { banco: 'Davivienda' })]);

    const primera = await screen.findByRole('article', { name: 'Bancolombia' });
    const rejilla = primera.parentElement!;
    expect(screen.getByRole('article', { name: 'Davivienda' }).parentElement).toBe(rejilla);
    expect(getComputedStyle(rejilla).display).toBe('grid');
    expect(getComputedStyle(rejilla).gridTemplateColumns).toMatch(/^minmax\(0(px)?, 1fr\)$/);
    // Desde `lg` pasa a dos columnas (jsdom no evalúa las consultas de medios: se lee la regla que emitió el estilo).
    const reglas = [...document.querySelectorAll('style')].map((s) => s.textContent).join('');
    expect(reglas).toMatch(/min-width:1200px\)\{[^}]*grid-template-columns:repeat\(2, ?minmax\(0, ?1fr\)\)/);
  });

  it('muestra cada cuenta enmascarada con el estado de su designación en cada empresa', async () => {
    montar([
      cuenta('c1', {
        designadaEn: [
          { vinculoId: 'v1', empresaId: 'emp-v1', empresa: 'Constructora Norte', estado: 'Aprobada', motivoRechazo: null },
          { vinculoId: 'v2', empresaId: 'emp-v2', empresa: 'Ferretería Sur', estado: 'Rechazada', motivoRechazo: 'El titular no coincide con el RUT.' },
        ],
      }),
      cuenta('c2', {
        banco: 'Davivienda',
        tipoCuenta: 'Corriente',
        numeroEnmascarado: '****9012',
        designadaEn: [{ vinculoId: 'v2', empresaId: 'emp-v2', empresa: 'Ferretería Sur', estado: 'Propuesta', motivoRechazo: null }],
      }),
      cuenta('c3', { banco: 'BBVA', numeroEnmascarado: '****3333', estado: 'Retirada' }),
    ]);

    const bancolombia = await screen.findByRole('article', { name: 'Bancolombia' });
    expect(bancolombia).toHaveTextContent('Ahorros · ****5678 · COP');
    expect(bancolombia).toHaveTextContent('Titular: Aceros del Norte S.A.S. · 900123456-7');
    expect(bancolombia).toHaveTextContent('Designada para Constructora Norte');
    expect(bancolombia).toHaveTextContent('Ferretería Sur la rechazó: El titular no coincide con el RUT.');
    expect(screen.getByRole('article', { name: 'Davivienda' })).toHaveTextContent('Pendiente de aprobación de Ferretería Sur');

    const retirada = screen.getByRole('article', { name: 'BBVA' });
    expect(retirada).toHaveTextContent('Retirada');
    expect(within(retirada).queryByRole('button', { name: /Retirar/ })).not.toBeInTheDocument();

    // Por empresa: solo las de invitación aceptada, con lo que tienen hoy.
    const porEmpresa = await screen.findByRole('list', { name: 'En qué cuenta te paga cada empresa' });
    expect(porEmpresa).toHaveTextContent('Te paga en Bancolombia ****5678.');
    expect(porEmpresa).toHaveTextContent('Davivienda ****9012 pendiente de su aprobación.');
    expect(porEmpresa).not.toHaveTextContent('Minera Andina');
  });

  it('valida antes de enviar y registra la cuenta con el cuerpo que espera la API', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista());
    const mutaciones = montar([], () => json(201, cuenta('nueva', { certificacion: null, faltaCertificacion: true })));

    await usuario.click(await screen.findByRole('button', { name: 'Agregar cuenta' }));
    const dialogo = screen.getByRole('dialog', { name: 'Agregar cuenta bancaria' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));
    expect(dialogo).toHaveTextContent('Elige el banco de la cuenta.');
    expect(dialogo).toHaveTextContent('Elige si la cuenta es de ahorros o corriente.');
    expect(dialogo).toHaveTextContent('Adjunta la certificación bancaria de esta cuenta.');
    expect(mutaciones).toHaveLength(0);

    await elegirBanco(usuario, dialogo, 'Bancolombia');
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Corriente' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Nombre' }), ' Marta Ríos ');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Correo' }), ' PAGOS@aceros.co ');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Número de cuenta/ }), '123-456 78');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Titular de la cuenta/ }), 'Aceros del Norte S.A.S.');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Identificación del titular/ }), '900123456-7');
    // Sin el archivo de la certificación no se guarda, aunque todo lo demás esté bien.
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));
    expect(dialogo).toHaveTextContent('Adjunta la certificación bancaria de esta cuenta.');
    expect(mutaciones).toHaveLength(0);
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), certificacionPdf());
    expect(within(dialogo).getByText('Certificación: certificacion.pdf')).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));

    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]?.url).toContain('/public/v1/boveda/cuentas-bancarias');
    expect(mutaciones[0]?.cuerpo).toEqual({
      banco: null,
      bancoCodigo: '1007',
      bancoSwift: null,
      pais: null,
      contactoPagos: { nombre: 'Marta Ríos', correo: 'PAGOS@aceros.co', telefono: null },
      tipoCuenta: 'Corriente',
      numero: '123-456 78',
      titular: 'Aceros del Norte S.A.S.',
      identificacionTitular: '900123456-7',
      moneda: 'COP',
    });
    // Con la cuenta creada se le sube su certificación (al documento de esa cuenta) y, al terminar, el diálogo se cierra.
    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1));
    const subida = subirDocumentoSimulado.mock.calls[0]?.[0];
    expect(subida?.archivo.name).toBe('certificacion.pdf');
    expect(subida?.destino).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'nueva' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('si la certificación no se alcanza a subir la cuenta queda guardada y se puede reintentar o dejarla para después', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(resultadoLista());
    const mutaciones = montar([], () => json(201, cuenta('nueva', { certificacion: null, faltaCertificacion: true })));

    await usuario.click(await screen.findByRole('button', { name: 'Agregar cuenta' }));
    const dialogo = screen.getByRole('dialog', { name: 'Agregar cuenta bancaria' });
    await elegirBanco(usuario, dialogo, 'Bancolombia');
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Ahorros' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Número de cuenta/ }), '12345678');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Titular de la cuenta/ }), 'Ana Pérez');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Identificación del titular/ }), '1020304050');
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), certificacionPdf());
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));

    // La cuenta ya se guardó una sola vez; la subida falló y el diálogo lo dice con el siguiente paso.
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Tu cuenta quedó guardada, pero no pudimos subir la certificación');
    expect(mutaciones).toHaveLength(1);
    expect(within(dialogo).getAllByRole('button', { name: 'Subirla después' }).length).toBeGreaterThan(0);

    await usuario.click(within(dialogo).getByRole('button', { name: 'Reintentar' }));
    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutaciones).toHaveLength(1); // reintentar no vuelve a registrar la cuenta
  });

  it('un banco que no está en la lista se escribe con su país y su SWIFT, sin código de compensación', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista());
    const mutaciones = montar([], () => json(201, cuenta('nueva')));

    await usuario.click(await screen.findByRole('button', { name: 'Agregar cuenta' }));
    const dialogo = screen.getByRole('dialog', { name: 'Agregar cuenta bancaria' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Mi banco no está en la lista' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Nombre del banco/ }), 'Chase');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Código SWIFT/ }), 'chas us33');
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Corriente' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Número de cuenta/ }), '123456789');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Titular de la cuenta/ }), 'Ana Pérez');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Identificación del titular/ }), '1020304050');
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), certificacionPdf());
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));

    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]?.cuerpo).toMatchObject({ banco: 'Chase', bancoCodigo: null, bancoSwift: 'CHASUS33', pais: 'CO', contactoPagos: null });
  });

  it('un error de validación de la API se muestra en su campo', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montar([], () => json(422, { status: 422, codigo: 'moneda-invalida', detail: 'La moneda es un código ISO de tres letras (COP, USD…).' }));

    await usuario.click(await screen.findByRole('button', { name: 'Agregar cuenta' }));
    const dialogo = screen.getByRole('dialog');
    await elegirBanco(usuario, dialogo, 'Bancolombia');
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Ahorros' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Número de cuenta/ }), '12345678');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Titular de la cuenta/ }), 'Ana Pérez');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Identificación del titular/ }), '1020304050');
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), certificacionPdf());
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));

    expect(await within(dialogo).findByText('La moneda es un código de tres letras, por ejemplo COP o USD.')).toBeInTheDocument();
    expect(within(dialogo).getByRole('textbox', { name: /Moneda/ })).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialogo).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('una cuenta sin su certificación se ve con el aviso, no se puede designar y se le sube desde su tarjeta', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista());
    montar([cuenta('c1', { certificacion: null, faltaCertificacion: true }), cuenta('c2', { banco: 'Davivienda', numeroEnmascarado: '****9012' })]);

    const sin = await screen.findByRole('article', { name: 'Bancolombia' });
    expect(within(sin).getByText('Falta certificación')).toBeInTheDocument();
    expect(sin).toHaveTextContent('Sube la certificación que expide tu banco para esta cuenta. Sin ella no puedes designarla con una empresa.');
    const con = screen.getByRole('article', { name: 'Davivienda' });
    expect(within(con).queryByText('Falta certificación')).not.toBeInTheDocument();

    // En «Elegir cuenta» la que no tiene certificación aparece deshabilitada con la razón; la otra sí se puede elegir.
    await usuario.click(await screen.findByRole('button', { name: 'Elegir cuenta: Constructora Norte' }));
    const dialogo = screen.getByRole('dialog', { name: 'Cuenta para Constructora Norte' });
    expect(within(dialogo).getByRole('radio', { name: /Bancolombia · Ahorros \*\*\*\*5678/ })).toBeDisabled();
    expect(dialogo).toHaveTextContent('Falta su certificación bancaria: súbela en la tarjeta de la cuenta para poder designarla.');
    expect(within(dialogo).getByRole('radio', { name: /Davivienda · Ahorros \*\*\*\*9012/ })).toBeChecked();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));

    // «Subir certificación» abre la subida de esa cuenta: al elegir el archivo se sube al documento propio de la cuenta.
    await usuario.click(within(sin).getByRole('button', { name: 'Subir certificación: Bancolombia ****5678' }));
    const subida = screen.getByRole('dialog', { name: 'Certificación de Bancolombia ****5678' });
    await usuario.upload(within(subida).getByTestId('entrada-archivo'), certificacionPdf());
    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1));
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'c1' });
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('la certificación de cada cuenta dice su versión, su fecha y lo que la IA leyó frente a lo que declaraste', async () => {
    montar([
      cuenta('c1', { certificacion: certificacion({ version: 2 }) }),
      cuenta('c2', {
        banco: 'Davivienda',
        numeroEnmascarado: '****9012',
        certificacion: certificacion({ documentoId: 'doc-2', verificacion: 'SinAnalisis' }),
      }),
      cuenta('c3', {
        banco: 'BBVA',
        numeroEnmascarado: '****3333',
        certificacion: certificacion({
          documentoId: 'doc-3',
          verificacion: 'Discrepa',
          discrepanciaCritica: true,
          campos: [
            { campo: 'numero', etiqueta: 'Número de la cuenta', declarado: '****3333', extraido: '****9999', resultado: 'Discrepa', critico: true, detalle: null },
            { campo: 'banco', etiqueta: 'Banco', declarado: 'BBVA', extraido: 'BBVA', resultado: 'Coincide', critico: false, detalle: null },
          ],
        }),
      }),
      cuenta('c4', {
        banco: 'Occidente',
        numeroEnmascarado: '****4444',
        certificacion: certificacion({ documentoId: 'doc-4', estado: 'Devuelta', verificacion: 'SinAnalisis', motivoDevolucion: 'El PDF trae contenido activo.' }),
        faltaCertificacion: true,
      }),
    ]);

    const coincide = await screen.findByRole('article', { name: 'Bancolombia' });
    expect(within(coincide).getByText('Coincide')).toBeInTheDocument();
    expect(coincide).toHaveTextContent('Versión 2 · subida el');
    expect(coincide).toHaveTextContent('Lo que dice tu certificación coincide con la cuenta que registraste.');
    expect(within(coincide).getByRole('button', { name: 'Reemplazar: Bancolombia ****5678' })).toBeInTheDocument();

    expect(screen.getByRole('article', { name: 'Davivienda' })).toHaveTextContent('Aún no la hemos leído: se lee cuando una empresa la recibe al designar esta cuenta con ella.');

    // No coincide: qué campos y con qué valores, y el siguiente paso.
    const discrepa = screen.getByRole('article', { name: 'BBVA' });
    expect(within(discrepa).getByText('No coincide')).toBeInTheDocument();
    expect(discrepa).toHaveTextContent('Tu certificación no coincide con lo que registraste. Revisa: Número de la cuenta.');
    expect(discrepa).toHaveTextContent('Número de la cuenta: registraste ****3333 y la certificación dice ****9999');
    expect(discrepa).not.toHaveTextContent('Banco: registraste');
    expect(discrepa).toHaveTextContent('Sube la certificación correcta de esta cuenta.');

    // Devuelta: el motivo y volver a subirla.
    const devuelta = screen.getByRole('article', { name: 'Occidente' });
    expect(devuelta).toHaveTextContent('Devolvimos tu certificación: El PDF trae contenido activo.');
    expect(devuelta).toHaveTextContent('Sube de nuevo la certificación de esta cuenta.');
  });

  describe('la antigüedad que exige cada empresa', () => {
    const MENSAJE = 'Sube el documento «Certificación bancaria» expedido hace menos de 30 días.';
    const campoSinVerificar = { campo: 'identificacion_titular', etiqueta: 'Identificación del titular', declarado: null, extraido: null, resultado: 'NoVerificable', critico: true, detalle: null } as const;
    const antiguedad = (empresa: string, cambios: Partial<AntiguedadDeCertificacionDto['antiguedad']> = {}): AntiguedadDeCertificacionDto => ({
      empresaId: `id-${empresa}`,
      empresa,
      antiguedad: {
        estado: 'Excedida',
        maximoDias: 30,
        fechaExpedicion: '2024-07-17',
        dias: 861,
        fuente: 'Ia',
        fechaDeclarada: null,
        difiereDeLaDeclarada: false,
        critico: true,
        detalle: 'Expedida el 17/07/2024: 861 días; el máximo es 30.',
        mensaje: MENSAJE,
        campo: null,
        ...cambios,
      },
    });

    it('la certificación vieja dice primero la antigüedad y después lo que no se pudo verificar, en un solo aviso', async () => {
      montar([cuenta('c1', { banco: 'Davivienda', numeroEnmascarado: '****9012', certificacion: certificacion({ verificacion: 'NoVerificable', campos: [campoSinVerificar], antiguedad: [antiguedad('Sinco OK')] }) })]);

      const tarjeta = await screen.findByRole('article', { name: 'Davivienda' });
      const aviso = within(tarjeta).getByRole('alert');
      // Un solo bloque, con la antigüedad primero (la causa principal) y luego lo que la lectura no pudo verificar.
      expect(within(tarjeta).getAllByRole('alert')).toHaveLength(1);
      const texto = aviso.textContent;
      expect(texto).toContain('Expedida el 17/07/2024: 861 días; el máximo es 30. ' + MENSAJE);
      expect(texto).toContain('No pudimos verificar en tu certificación: Identificación del titular.');
      expect(texto.indexOf('Expedida el 17/07/2024')).toBeLessThan(texto.indexOf('No pudimos verificar'));
      // Una sola empresa con regla: el aviso es el mismo del expediente, sin nombrarla.
      expect(texto).not.toContain('Sinco OK');
      expect(aviso.querySelector('[data-antiguedad="Excedida"]')).not.toBeNull();
    });

    it('con varias empresas nombra a las que no cumplen, en el orden que llega, y no a la que cumple', async () => {
      const cumple = antiguedad('Constructora Sur', { estado: 'Cumple', maximoDias: 365, dias: 176, critico: false, detalle: 'Expedida el 01/06/2026: 176 días; el máximo es 365.', mensaje: null });
      montar([cuenta('c1', { certificacion: certificacion({ antiguedad: [antiguedad('Sinco OK'), cumple, antiguedad('Constructora Este', { maximoDias: 60, mensaje: 'Sube el documento «Certificación bancaria» expedido hace menos de 60 días.' })] }) })]);

      const aviso = within(await screen.findByRole('article', { name: 'Bancolombia' })).getByRole('alert');
      const texto = aviso.textContent;
      expect(texto).toContain('Sinco OK · Expedida el 17/07/2024: 861 días; el máximo es 30. ' + MENSAJE);
      expect(texto).toContain('Constructora Este · Expedida el 17/07/2024');
      expect(texto).toContain('expedido hace menos de 60 días.');
      expect(texto).not.toContain('Constructora Sur');
      expect(texto.indexOf('Sinco OK')).toBeLessThan(texto.indexOf('Constructora Este'));
    });

    it('si solo falla la antigüedad el aviso la dice y debajo sigue lo que leyó la IA; sin nada que pedir no hay aviso', async () => {
      montar([
        cuenta('c1', { certificacion: certificacion({ verificacion: 'Coincide', antiguedad: [antiguedad('Sinco OK')] }) }),
        cuenta('c2', {
          banco: 'Davivienda',
          numeroEnmascarado: '****9012',
          certificacion: certificacion({ documentoId: 'doc-2', antiguedad: [antiguedad('Sinco OK', { estado: 'Cumple', critico: false, mensaje: null }), antiguedad('Constructora Sur', { estado: 'SinLectura', critico: false, mensaje: null })] }),
        }),
      ]);

      const vieja = await screen.findByRole('article', { name: 'Bancolombia' });
      expect(within(vieja).getByRole('alert')).toHaveTextContent(MENSAJE);
      expect(vieja).toHaveTextContent('Lo que dice tu certificación coincide con la cuenta que registraste.');

      const reciente = screen.getByRole('article', { name: 'Davivienda' });
      expect(within(reciente).queryByRole('alert')).not.toBeInTheDocument();
      expect(reciente).toHaveTextContent('Lo que dice tu certificación coincide con la cuenta que registraste.');
    });
  });

  it('reemplazar la certificación sube una versión nueva al documento de esa cuenta', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista(3));
    montar([cuenta('c1', { certificacion: certificacion({ version: 2 }) })]);

    await usuario.click(await screen.findByRole('button', { name: 'Reemplazar: Bancolombia ****5678' }));
    const dialogo = screen.getByRole('dialog', { name: 'Reemplazar la certificación de Bancolombia ****5678' });
    expect(dialogo).toHaveTextContent('Sube una versión nueva de la certificación de esta cuenta.');
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), certificacionPdf());

    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1));
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'c1' });
    await vi.waitFor(() => expect(useAvisos.getState().actual?.mensaje).toBe('Subiste la certificación de Bancolombia ****5678 (versión 3).'));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('si la API todavía responde que falta la certificación lo explica sin llevar a la bóveda', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    const mutaciones = montar([cuenta('c1')], () =>
      json(422, { status: 422, codigo: 'certificacion-requerida', detail: 'Sube la certificación bancaria de esta cuenta antes de designarla.' }),
    );

    await usuario.click(await screen.findByRole('button', { name: 'Elegir cuenta: Constructora Norte' }));
    const dialogo = screen.getByRole('dialog', { name: 'Cuenta para Constructora Norte' });
    // La única cuenta activa ya viene elegida.
    expect(within(dialogo).getByRole('radio', { name: /Bancolombia · Ahorros \*\*\*\*5678/ })).toBeChecked();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Designar cuenta' }));

    const alerta = await within(dialogo).findByRole('alert');
    expect(alerta).toHaveTextContent('Esta cuenta aún no tiene su certificación bancaria. Súbela en la tarjeta de la cuenta y vuelve a designarla');
    expect(within(alerta).queryByRole('link')).not.toBeInTheDocument();
    expect(mutaciones[0]?.url).toContain('/public/v1/vinculos/v1/cuenta-designada');
    expect(mutaciones[0]?.cuerpo).toEqual({ cuentaId: 'c1' });
  });

  it('no deja retirar una cuenta designada: pide elegir otra primero', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montar(
      [cuenta('c1', { designadaEn: [{ vinculoId: 'v1', empresaId: 'emp-v1', empresa: 'Constructora Norte', estado: 'Aprobada', motivoRechazo: null }] })],
      () => json(409, { status: 409, codigo: 'cuenta-en-uso', detail: 'Esa cuenta está designada con una empresa: primero designa otra.' }),
    );

    await usuario.click(await screen.findByRole('button', { name: 'Retirar: Bancolombia ****5678' }));
    const dialogo = screen.getByRole('dialog', { name: 'Retirar la cuenta Bancolombia ****5678' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Retirar cuenta' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Primero elige otra cuenta para esa empresa y luego retírala.');
  });
});
