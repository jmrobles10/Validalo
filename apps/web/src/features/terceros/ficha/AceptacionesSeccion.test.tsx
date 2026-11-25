import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { configurarCliente, reiniciarCliente, SCOPES, type AceptacionDeSeccionDto, type ExpedienteDto, type VinculoDto, type VinculoEnFichaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { expediente, requisito, requisitoSeccion } from '../../expedientes/datosPrueba';
import { CERTIFICADO, CUENTA } from '../pruebas/datos';
import { AceptacionesSeccion } from './AceptacionesSeccion';
import { pedidoDeSeccion } from './pedidoDeSeccion';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../empresas/useEmpresas', () => ({ useEmpresaActiva: () => ({ empresa: { id: 'emp', nombre: 'Sinco OK' } }) }));
vi.mock('../../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const VINCULO = {
  id: 'v1',
  empresaId: 'emp',
  terceroId: 't1',
  tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
  flujoId: null,
  estado: 'EnValidacion',
  atributos: {},
  correoTercero: 'compras@tornillo.co',
  invitacion: null,
  invitacionAceptadaEn: '2026-09-01T15:00:00Z',
  requisitosCubribles: null,
  bloqueo: null,
  referencias: [],
  origen: 'Invitacion',
  creadoEn: '2026-08-01T15:00:00Z',
  actualizadoEn: '2026-10-01T15:00:00Z',
  version: 3,
} satisfies VinculoDto;

const SIN_ACEPTAR: AceptacionDeSeccionDto = { vinculoId: 'v1', versionAceptada: null, aceptadaEn: null, expedienteId: null, folio: null, versionNuevaPendiente: false, revalidacion: null };

const enFicha = (vinculo: VinculoDto): VinculoEnFichaDto => ({ vinculo, certificado: CERTIFICADO, cuentaDesignada: CUENTA, documentos: [] });

/** La franja de la sección «Información tributaria» con el expediente en curso del vínculo (o sin él). */
function montar(abierto: ExpedienteDto | null) {
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL) => {
      const url = entrada instanceof Request ? entrada.url : entrada.toString();
      return Promise.resolve(
        url.includes('/api/v1/expedientes/') && abierto ? new Response(JSON.stringify(abierto), { status: 200, headers: { 'Content-Type': 'application/json' } }) : new Response('{}', { status: 404 }),
      );
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <AceptacionesSeccion
            empresaId="emp"
            codigo="FICHA_TRIBUTARIA"
            periodo={null}
            seccion="Información tributaria"
            aceptaciones={[SIN_ACEPTAR]}
            vinculos={[enFicha(abierto ? { ...VINCULO, expedienteAbiertoId: abierto.id } : VINCULO)]}
          />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return within(screen.getByRole('region', { name: 'Validación de la empresa' }));
}

const tributaria = (cambios: Parameters<typeof requisitoSeccion>[0] = {}) =>
  requisitoSeccion({ id: 'r-trib', ...cambios }, { seccion: 'FICHA_TRIBUTARIA', nombre: 'Información tributaria' });

const expedienteCon = (...requisitos: ReturnType<typeof requisito>[]): ExpedienteDto => ({ ...expediente('EnRevision'), id: 'x9', requisitos });

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
});

describe('La validación de la empresa cuando aún no acepta la sección', () => {
  it('el expediente en curso la pide: se acepta al aprobarse el expediente, con el enlace a su requisito en el sector de la sección', async () => {
    permisos.scopes = new Set([SCOPES.expedientesLeer]);
    const validacion = montar(expedienteCon(tributaria()));

    expect(await validacion.findByText('Sinco OK aún no acepta esta versión. Se acepta al aprobarse el expediente NORTE-E-2026-000001, que la pide como requisito «Información tributaria».')).toBeInTheDocument();
    expect(validacion.getByRole('link', { name: 'Ver el requisito «Información tributaria» del expediente NORTE-E-2026-000001' })).toHaveAttribute('href', '/e/emp/expedientes/x9?sector=tributaria');
  });

  it('el flujo no la pide (el expediente no tiene su requisito): dice que queda como información del tercero, sin enlace', async () => {
    permisos.scopes = new Set([SCOPES.expedientesLeer]);
    const validacion = montar(expedienteCon(requisitoSeccion()));

    expect(await validacion.findByText('Sinco OK no pide esta sección en su expediente NORTE-E-2026-000001: queda como información del tercero, sin validación de la empresa.')).toBeInTheDocument();
    expect(validacion.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Validación de la empresa' })).not.toHaveTextContent('Se acepta al aprobar');
  });

  it('su requisito está eximido: no la valida', async () => {
    permisos.scopes = new Set([SCOPES.expedientesLeer]);
    const validacion = montar(expedienteCon(tributaria({ estado: 'Eximido' })));

    expect(await validacion.findByText('El requisito «Información tributaria» del expediente NORTE-E-2026-000001 está eximido: Sinco OK no valida esta sección.')).toBeInTheDocument();
    expect(validacion.queryByRole('link')).not.toBeInTheDocument();
  });

  it('sin expediente abierto dice que nada la pide ahora', () => {
    permisos.scopes = new Set([SCOPES.expedientesLeer]);
    const validacion = montar(null);

    expect(validacion.getByText('Sinco OK aún no acepta esta versión: no hay un expediente en curso que la pida.')).toBeInTheDocument();
  });

  it('sin permiso para leer expedientes no afirma nada de él', () => {
    permisos.scopes = new Set();
    const validacion = montar(expedienteCon(tributaria()));

    expect(validacion.getByText('Sinco OK aún no acepta esta versión.')).toBeInTheDocument();
    expect(validacion.queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('pedidoDeSeccion', () => {
  it('distingue la sección pedida, eximida, no pedida y la que no aplica por su condición', () => {
    expect(pedidoDeSeccion(expedienteCon(tributaria()), 'FICHA_TRIBUTARIA', null).tipo).toBe('pedida');
    expect(pedidoDeSeccion(expedienteCon(tributaria({ estado: 'Eximido' })), 'FICHA_TRIBUTARIA', null).tipo).toBe('eximida');
    expect(pedidoDeSeccion(expedienteCon(tributaria({ estado: 'NoAplica' })), 'FICHA_TRIBUTARIA', null).tipo).toBe('noPedida');
    expect(pedidoDeSeccion(expedienteCon(requisitoSeccion()), 'FICHA_TRIBUTARIA', null).tipo).toBe('noPedida');
  });

  it('la información financiera se busca por periodo', () => {
    const financiera = (periodo: number) => requisitoSeccion({ id: `r-fin-${String(periodo)}` }, { seccion: 'FICHA_FINANCIERA', nombre: 'Información financiera', periodo });
    const expedientePedido = expedienteCon(financiera(2025));
    expect(pedidoDeSeccion(expedientePedido, 'FICHA_FINANCIERA', 2025).tipo).toBe('pedida');
    expect(pedidoDeSeccion(expedientePedido, 'FICHA_FINANCIERA', 2024).tipo).toBe('noPedida');
  });
});
