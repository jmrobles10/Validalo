import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, SCOPES, type EmpresaDto, type SesionValidalo, type TextoLegalDto } from '@validalo/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { montarPantalla } from '../../../pruebas/montar';
import { useSesion } from '../../../sesion/sesionStore';
import { useAvisos } from '../../../shared/useAvisos';
import { PaginaEmpresas } from './PaginaEmpresas';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../empresas/useEmpresas', async (original) => ({
  ...(await original<typeof import('../../empresas/useEmpresas')>()),
  useEmpresaActiva: () => ({ empresa: { id: 'sinco', nombre: 'Sinco OK' }, empresas: [] }),
}));
vi.mock('../../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

const empresa = (id: string, nombre: string, numero: string, prefijoFolio: string, activa = true): EmpresaDto => ({
  id,
  tenantId: 't-1',
  identificacion: { pais: 'CO', tipo: 'NIT', numero, digitoVerificacion: '4' },
  nombre,
  logoUrl: null,
  replyTo: null,
  prefijoFolio,
  activa,
});
const SINCO = empresa('sinco', 'Sinco OK', '800197268', 'SINCO');
const NORTE = empresa('norte', 'Constructora Norte S.A.S.', '900123456', 'NORTE');
const SUR = empresa('sur', 'Constructora Sur S.A.S.', '900765432', 'SUR', false);

const AUTORIZACION: TextoLegalDto = {
  id: 'tl1',
  ambito: 'Empresa',
  empresaId: 'sinco',
  tipo: 'AutorizacionEmpresa',
  version: 2,
  hash: 'abc',
  contenido: 'Autorizo el tratamiento de mis datos.',
  publicadoEn: '2026-10-01T15:00:00Z',
  publicadoPor: 'u1',
};

function iniciarSesion() {
  const sesion: SesionValidalo = {
    token: 'tok',
    expira: new Date(Date.now() + 30 * 60_000),
    usuarioId: 'yo',
    tenantId: 't-1',
    nombre: null,
    sistema: null,
    sesionId: null,
    metodoIngreso: null,
    actorTipo: 'Usuario',
    scopesDeTenant: new Set(),
    scopesPorEmpresa: new Map(),
    empresas: '*',
  };
  useSesion.setState({ sesion, estado: 'activa', empresaSugerida: null, sugerirPasskey: false });
}

interface Peticion {
  metodo: string;
  ruta: string;
}

function montar(empresas: EmpresaDto[] | 'pendiente' | 'error') {
  const peticiones: Peticion[] = [];
  configurarCliente({
    obtenerToken: () => 'tok',
    fetch: vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const texto = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const ruta = texto.split('?')[0] ?? texto;
      const metodo = init?.method ?? 'GET';
      peticiones.push({ metodo, ruta });
      if (ruta === '/api/v1/empresas' && metodo === 'GET') {
        if (empresas === 'pendiente') return new Promise<Response>(() => undefined);
        return Promise.resolve(empresas === 'error' ? json({ status: 500, codigo: 'error', detail: 'No se pudo leer.' }, 500) : json(empresas));
      }
      const textos = /^\/api\/v1\/empresas\/([^/]+)\/textos-legales$/.exec(ruta);
      if (textos && metodo === 'GET') return Promise.resolve(json({ empresaId: textos[1], vigentes: [{ ...AUTORIZACION, empresaId: textos[1] }], faltantes: ['terminos'] }));
      if (metodo === 'POST' && ruta.endsWith('/desactivar')) return Promise.resolve(json({ ...NORTE, activa: false }));
      return Promise.resolve(json({ status: 404, codigo: 'no-encontrado', detail: 'Sin simular.' }, 404));
    }),
  });
  montarPantalla(<PaginaEmpresas />);
  return peticiones;
}

const conPermisos = (...scopes: string[]) => (permisos.scopes = new Set(scopes));
const ADMINISTRADOR = [SCOPES.empresasAdministrar, SCOPES.configuracionLeer, SCOPES.configuracionEscribir];

beforeEach(iniciarSesion);

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
  useAvisos.getState().cerrar();
  useSesion.setState({ sesion: null, estado: 'sin-sesion' });
});

describe('Empresas del grupo', () => {
  it('con una sola empresa: una lista con ella elegida y, al lado, su detalle con sus textos legales (sin tabla)', async () => {
    conPermisos(...ADMINISTRADOR);
    montar([SINCO]);

    const lista = await screen.findByRole('list', { name: 'Razones sociales' });
    // Ya no es una tabla con encabezado y fila resaltada: una lista de empresas y un detalle.
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('row')).not.toBeInTheDocument();
    expect(screen.getByText('1 empresa')).toBeInTheDocument();
    const elegida = within(lista).getByRole('button', { name: 'Ver Sinco OK' });
    expect(elegida).toHaveAttribute('aria-current', 'true');
    expect(elegida).toHaveTextContent('Sinco OK');
    expect(elegida).toHaveTextContent('NIT 800197268-4 · SINCO');

    // El detalle: identificación, prefijo con su folio de ejemplo, estado y los textos legales.
    const detalle = screen.getByRole('region', { name: 'Sinco OK' });
    expect(within(detalle).getByText('NIT 800197268-4 · CO')).toBeInTheDocument();
    expect(within(detalle).getByText('SINCO')).toBeInTheDocument();
    expect(within(detalle).getByText(/Ejemplo de folio: SINCO-E-\d{4}-000123/)).toBeInTheDocument();
    expect(within(detalle).getByText('Activa')).toBeInTheDocument();
    expect(await within(detalle).findByRole('list', { name: 'Textos legales' })).toBeInTheDocument();
    expect(within(detalle).getByText('Autorización de tratamiento de datos')).toBeInTheDocument();
    expect(within(detalle).getByRole('button', { name: 'Publicar versión nueva' })).toBeInTheDocument();
    expect(within(detalle).getByText(/Sin publicar/)).toBeInTheDocument(); // los términos
  });

  it('con varias empresas: activas primero, la primera elegida y, al elegir otra, el detalle cambia y la marca se mueve', async () => {
    const usuario = userEvent.setup();
    conPermisos(...ADMINISTRADOR);
    montar([SUR, SINCO, NORTE]);

    const lista = await screen.findByRole('list', { name: 'Razones sociales' });
    expect(screen.getByText('3 empresas')).toBeInTheDocument();
    const botones = within(lista).getAllByRole('button', { name: /^Ver / });
    expect(botones.map((b) => b.getAttribute('aria-label'))).toEqual(['Ver Constructora Norte S.A.S.', 'Ver Sinco OK', 'Ver Constructora Sur S.A.S.']);
    const norte = within(lista).getByRole('button', { name: 'Ver Constructora Norte S.A.S.' });
    const sinco = within(lista).getByRole('button', { name: 'Ver Sinco OK' });
    expect(norte).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('region', { name: 'Constructora Norte S.A.S.' })).toBeInTheDocument();

    await usuario.click(sinco);
    expect(sinco).toHaveAttribute('aria-current', 'true');
    expect(norte).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('region', { name: 'Sinco OK' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Constructora Norte S.A.S.' })).not.toBeInTheDocument();
  });

  it('una empresa inactiva se dice en su fila y en su detalle, sin acciones y sin publicar textos', async () => {
    const usuario = userEvent.setup();
    conPermisos(...ADMINISTRADOR);
    montar([NORTE, SUR]);

    const lista = await screen.findByRole('list', { name: 'Razones sociales' });
    expect(within(lista).getByRole('button', { name: 'Ver Constructora Sur S.A.S.' })).toHaveTextContent('Inactiva');
    expect(within(lista).queryByRole('button', { name: 'Acciones de Constructora Sur S.A.S.' })).not.toBeInTheDocument();
    expect(within(lista).getByRole('button', { name: 'Acciones de Constructora Norte S.A.S.' })).toBeInTheDocument();

    await usuario.click(within(lista).getByRole('button', { name: 'Ver Constructora Sur S.A.S.' }));
    const detalle = screen.getByRole('region', { name: 'Constructora Sur S.A.S.' });
    expect(within(detalle).getByText('Inactiva')).toBeInTheDocument();
    expect(within(detalle).getByText(/La empresa está inactiva/)).toBeInTheDocument();
    await within(detalle).findByRole('list', { name: 'Textos legales' });
    expect(within(detalle).queryByRole('button', { name: /Publicar/ })).not.toBeInTheDocument();
  });

  it('desactivar desde el menú «⋯» pide confirmación y llama a la API; agregar abre el diálogo de alta', async () => {
    const usuario = userEvent.setup();
    conPermisos(...ADMINISTRADOR);
    const peticiones = montar([NORTE, SINCO]);

    await usuario.click(await screen.findByRole('button', { name: 'Acciones de Constructora Norte S.A.S.' }));
    await usuario.click(await screen.findByRole('menuitem', { name: 'Desactivar empresa' }));
    const dialogo = await screen.findByRole('dialog', { name: /Desactivar Constructora Norte S.A.S./ });
    expect(peticiones.some((p) => p.metodo === 'POST')).toBe(false);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Desactivar empresa' }));
    await waitFor(() => expect(peticiones).toContainEqual({ metodo: 'POST', ruta: '/api/v1/empresas/norte/desactivar' }));
    expect(await screen.findByText('Constructora Norte S.A.S. quedó inactiva.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Agregar empresa' }));
    expect(await screen.findByRole('dialog', { name: 'Agregar empresa' })).toBeInTheDocument();
  });

  it('elegir una empresa con el teclado: el botón de su fila se activa con Enter', async () => {
    const usuario = userEvent.setup();
    conPermisos(...ADMINISTRADOR);
    montar([NORTE, SINCO]);

    const sinco = await screen.findByRole('button', { name: 'Ver Sinco OK' });
    sinco.focus();
    await usuario.keyboard('{Enter}');
    expect(sinco).toHaveAttribute('aria-current', 'true');
  });

  it('sin permiso de configuración no ofrece los textos legales', async () => {
    conPermisos(SCOPES.empresasAdministrar);
    montar([SINCO]);

    const detalle = await screen.findByRole('region', { name: 'Sinco OK' });
    expect(within(detalle).queryByRole('list', { name: 'Textos legales' })).not.toBeInTheDocument();
    expect(within(detalle).queryByText('Textos legales')).not.toBeInTheDocument();
  });

  it('sin empresas dice que aún no hay y cómo empezar', async () => {
    conPermisos(...ADMINISTRADOR);
    montar([]);

    expect(await screen.findByText('Aún no hay empresas en el grupo.')).toBeInTheDocument();
    expect(screen.getByText('Agrega la primera razón social para empezar a vincular terceros.')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Razones sociales' })).not.toBeInTheDocument();
  });

  it('mientras carga muestra el esqueleto con la forma de la lista y el detalle', async () => {
    conPermisos(...ADMINISTRADOR);
    montar('pendiente');
    expect(await screen.findByRole('status', { name: 'Empresas del grupo' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByRole('list', { name: 'Razones sociales' })).not.toBeInTheDocument();
  });

  it('si la lista no carga, dice el error y deja reintentar', async () => {
    conPermisos(...ADMINISTRADOR);
    montar('error');
    expect(await screen.findByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('sin permiso para administrar empresas dice a quién pedir acceso', () => {
    conPermisos();
    montar([SINCO]);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Razones sociales' })).not.toBeInTheDocument();
  });
});
