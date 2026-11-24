import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, type CuentaBancariaPublicaDto, type ExpedientePublicoDto, type RequisitoPublicoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpcionesSubida, ResultadoSubida } from '../boveda/subida';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { solicitudDeRequisito } from './requisitos';
import { TarjetaRequisito } from './TarjetaRequisito';

// La subida real habla con el almacenamiento por XHR: aquí se simula y se mira a qué documento se le pidió subir.
const subirDocumentoSimulado = vi.hoisted(() => vi.fn<(opciones: OpcionesSubida) => Promise<ResultadoSubida>>());
vi.mock('../boveda/subida', async (importarOriginal) => ({ ...(await importarOriginal<typeof import('../boveda/subida')>()), subirDocumento: subirDocumentoSimulado }));

/**
 * La certificación bancaria que pide una empresa (CB-8): no se sube a un documento suelto sino con la cuenta a la que pertenece. La tarjeta del requisito lleva a elegir la cuenta (o
 * agregar una), sube la certificación de esa cuenta y propone designarla para la empresa, que así recibe el documento.
 */
const json = (estado: number, cuerpo: unknown) =>
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': estado >= 400 ? 'application/problem+json' : 'application/json' } });

const requisito = (estado: RequisitoPublicoDto['estado'] = 'Pendiente'): RequisitoPublicoDto => ({
  id: 'rq1',
  tipoDocumento: { id: 'td', codigo: 'CERTIFICACION_BANCARIA', nombre: 'Certificación bancaria', tipoCanonico: 'CERTIFICACION_BANCARIA', ambito: 'Global', modo: 'Archivo' },
  obligatorio: true,
  estado,
  versionActual: estado === 'Pendiente' ? null : { documentoId: 'd1', n: 1, sha256: 'x', cargadaEn: '2026-11-06T12:00:00Z' },
  observaciones: [],
});

const EXPEDIENTE = {
  id: 'e1',
  folio: 'SINCO-E-2026-000001',
  empresa: { id: 'emp', nombre: 'Sinco OK', logoUrl: null },
  tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
  estado: 'Abierto',
  observaciones: [],
  puedeReenviar: false,
  reenvios: 0,
  actualizadoEn: '2026-11-06T13:00:00Z',
  requisitos: [],
  requisitosFaltantes: 1,
} satisfies ExpedientePublicoDto;

const cuenta = (id: string, cambios: Partial<CuentaBancariaPublicaDto> = {}): CuentaBancariaPublicaDto => ({
  id,
  banco: 'Davivienda',
  tipoCuenta: 'Corriente',
  numeroEnmascarado: '****7097',
  titular: 'ATLAS SERVICES SAS',
  identificacionTitular: '901178876-8',
  moneda: 'COP',
  estado: 'Activa',
  registradaEn: '2026-10-02T10:00:00Z',
  designadaEn: [],
  certificacion: null,
  faltaCertificacion: false,
  ...cambios,
});

const BANCOS = [{ codigo: '1051', nombre: 'Banco Davivienda', activo: true }];

interface Peticion {
  metodo: string;
  url: string;
  cuerpo: unknown;
}

/** Responde la lista de cuentas (y el catálogo de bancos); las mutaciones se anotan y `alMutar` las responde. */
function montar(cuentas: CuentaBancariaPublicaDto[], { estado = 'Pendiente', soloLectura = false, alMutar = () => json(200, {}) }: { estado?: RequisitoPublicoDto['estado']; soloLectura?: boolean; alMutar?: (p: Peticion) => Response } = {}) {
  const mutaciones: Peticion[] = [];
  configurarCliente({
    fetch: vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const direccion = url instanceof Request ? url.url : url.toString();
      const metodo = init?.method ?? 'GET';
      if (metodo === 'GET' && direccion.includes('/catalogos/bancos')) return Promise.resolve(json(200, { datos: BANCOS, siguienteCursor: null }));
      if (metodo === 'GET') return Promise.resolve(json(200, direccion.includes('/cuentas-bancarias') ? cuentas : {}));
      const peticion: Peticion = { metodo, url: direccion, cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
      mutaciones.push(peticion);
      return Promise.resolve(alMutar(peticion));
    }),
  });
  const r = requisito(estado);
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <MemoryRouter>
          <ul>
            <TarjetaRequisito requisito={r} expediente={EXPEDIENTE} subida={soloLectura ? null : solicitudDeRequisito(r, 'v1', 'e1')} />
          </ul>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return mutaciones;
}

const certificacionPdf = () => new File(['%PDF-1.4'], 'certificacion.pdf', { type: 'application/pdf' });

const resultadoLista = (n = 1): ResultadoSubida => ({ tipo: 'lista', version: { documentoId: 'doc-1', n, estado: 'Actual' } as never, compartidos: [] });

/** Pega el texto en vez de teclearlo letra por letra: la suite completa corre en paralelo y teclear es lento. */
async function escribir(usuario: ReturnType<typeof userEvent.setup>, campo: HTMLElement, texto: string) {
  await usuario.click(campo);
  await usuario.paste(texto);
}

beforeEach(() => subirDocumentoSimulado.mockReset());

afterEach(() => {
  reiniciarCliente();
  useDialogoSubir.getState().cerrar();
});

describe('la certificación bancaria que pide una empresa', () => {
  it('no se sube como un documento suelto: la acción lleva a elegir la cuenta a la que pertenece', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montar([cuenta('c1', { faltaCertificacion: true }), cuenta('c2', { banco: 'Bancolombia', numeroEnmascarado: '****5678' })]);

    expect(screen.queryByRole('button', { name: 'Subir documento' })).not.toBeInTheDocument();
    expect(screen.getByText(/se sube con su cuenta/)).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir certificación de una cuenta' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Certificación bancaria para Sinco OK' });
    expect(useDialogoSubir.getState().solicitud).toBeNull(); // no abre la subida de un documento general
    expect(await within(dialogo).findByRole('radio', { name: /Davivienda · Corriente \*\*\*\*7097/ })).toBeInTheDocument();
    expect(dialogo).toHaveTextContent('Falta su certificación: la subes ahora.');
    expect(dialogo).toHaveTextContent('Ya tiene su certificación.');
  });

  it('en solo lectura no hay acción', () => {
    montar([cuenta('c1')], { soloLectura: true });

    expect(screen.queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument();
  });

  it('una cuenta sin certificación sube la suya y se propone designarla para la empresa', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista());
    const mutaciones = montar([cuenta('c1', { faltaCertificacion: true }), cuenta('c2', { banco: 'Bancolombia', numeroEnmascarado: '****5678' })]);

    await usuario.click(screen.getByRole('button', { name: 'Subir certificación de una cuenta' }));
    const elegir = await screen.findByRole('dialog', { name: 'Certificación bancaria para Sinco OK' });
    await usuario.click(await within(elegir).findByRole('radio', { name: /Davivienda/ }));
    await usuario.click(within(elegir).getByRole('button', { name: 'Continuar' }));

    // Se sube al documento de esa cuenta (no al general de la bóveda).
    const subir = await screen.findByRole('dialog', { name: 'Certificación de Davivienda ****7097' });
    await usuario.upload(within(subir).getByTestId('entrada-archivo'), certificacionPdf());
    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1));
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'c1' });

    // La empresa aún no tiene cuenta: se propone la que acaba de quedar con su certificación.
    const proponer = await screen.findByRole('dialog', { name: '¿Designar esta cuenta para Sinco OK?' });
    expect(mutaciones).toHaveLength(0);
    await usuario.click(within(proponer).getByRole('button', { name: 'Designar con Sinco OK' }));

    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]).toMatchObject({ metodo: 'POST', cuerpo: { cuentaId: 'c1' } });
    expect(mutaciones[0]?.url).toContain('/public/v1/vinculos/v1/cuenta-designada');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('una cuenta que ya tiene su certificación se propone a la empresa sin volver a subirla, y «Ahora no» la deja guardada', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    const mutaciones = montar([cuenta('c1', { certificacion: { documentoId: 'd', version: 1, estado: 'Actual', cargadaEn: '2026-10-03T10:00:00Z', nombreArchivo: 'c.pdf', verificacion: 'Coincide', discrepanciaCritica: false, campos: [] } })]);

    await usuario.click(screen.getByRole('button', { name: 'Subir certificación de una cuenta' }));
    const elegir = await screen.findByRole('dialog', { name: 'Certificación bancaria para Sinco OK' });
    // Con una sola cuenta ya viene elegida.
    expect(await within(elegir).findByRole('radio', { name: /Davivienda/ })).toBeChecked();
    await usuario.click(within(elegir).getByRole('button', { name: 'Continuar' }));

    const proponer = await screen.findByRole('dialog', { name: '¿Designar esta cuenta para Sinco OK?' });
    expect(subirDocumentoSimulado).not.toHaveBeenCalled();
    await usuario.click(within(proponer).getByRole('button', { name: 'Ahora no' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutaciones).toHaveLength(0);
  });

  it('la cuenta que la empresa ya tiene viene elegida y su certificación nueva se sube sin proponer nada', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista(2));
    const mutaciones = montar(
      [
        cuenta('c1', { banco: 'Bancolombia', numeroEnmascarado: '****5678', faltaCertificacion: true }),
        cuenta('c2', { designadaEn: [{ vinculoId: 'v1', empresaId: 'emp', empresa: 'Sinco OK', estado: 'Aprobada', motivoRechazo: null }] }),
      ],
      { estado: 'Observado' },
    );

    await usuario.click(screen.getByRole('button', { name: 'Subir certificación corregida' }));
    const elegir = await screen.findByRole('dialog', { name: 'Certificación bancaria para Sinco OK' });
    expect(await within(elegir).findByRole('radio', { name: /Davivienda/ })).toBeChecked();
    expect(elegir).toHaveTextContent('Es la cuenta que tienes con Sinco OK.');
    await usuario.click(within(elegir).getByRole('button', { name: 'Continuar' }));

    const subir = await screen.findByRole('dialog', { name: 'Reemplazar la certificación de Davivienda ****7097' });
    await usuario.upload(within(subir).getByTestId('entrada-archivo'), certificacionPdf());
    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1));
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'c2' });
    // La cuenta ya es de la empresa: recibe la versión nueva sola y no hay nada que proponer.
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mutaciones).toHaveLength(0);
  });

  it('sin cuentas se agrega una con su certificación y se propone a la empresa', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    subirDocumentoSimulado.mockResolvedValue(resultadoLista());
    const mutaciones = montar([], { alMutar: (p) => (p.url.includes('/cuentas-bancarias') ? json(201, cuenta('nueva', { faltaCertificacion: true })) : json(200, {})) });

    await usuario.click(screen.getByRole('button', { name: 'Subir certificación de una cuenta' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar cuenta bancaria' });
    await usuario.click(within(dialogo).getByRole('combobox', { name: /Banco/ }));
    await usuario.click(await screen.findByRole('option', { name: 'Banco Davivienda' }));
    await usuario.click(within(dialogo).getByRole('radio', { name: 'Corriente' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Número de cuenta/ }), '0074 6999 7097');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Titular de la cuenta/ }), 'ATLAS SERVICES SAS');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: /Identificación del titular/ }), '901178876-8');
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), certificacionPdf());
    await usuario.click(within(dialogo).getByRole('button', { name: 'Guardar cuenta' }));

    await vi.waitFor(() => expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1));
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'nueva' });
    const proponer = await screen.findByRole('dialog', { name: '¿Designar esta cuenta para Sinco OK?' });
    await usuario.click(within(proponer).getByRole('button', { name: 'Designar con Sinco OK' }));

    await vi.waitFor(() => expect(mutaciones).toHaveLength(2));
    expect(mutaciones[0]?.url).toContain('/public/v1/boveda/cuentas-bancarias');
    expect(mutaciones[1]).toMatchObject({ metodo: 'POST', cuerpo: { cuentaId: 'nueva' } });
    expect(mutaciones[1]?.url).toContain('/public/v1/vinculos/v1/cuenta-designada');
  });
});
