import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { configurarCliente, reiniciarCliente, SCOPES } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { area, areaDeRequisito, expediente, requisito, veredicto } from '../datosPrueba';
import type { ContextoRevisor } from '../reglas';
import { PanelRequisitos } from './PanelRequisitos';

const CONTEXTO: ContextoRevisor = {
  scopes: new Set([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.documentosLeer]),
  usuarioId: 'u-1',
  esMiembro: true,
};

const JUSTIFICACION = 'La empresa ya aprobó esta versión en el expediente NORTE-E-2026-000007 (Proveedor).';

function montar() {
  configurarCliente({ fetch: vi.fn(() => new Promise<Response>(() => undefined)) });
  const compras = area({ areaId: 'a-compras', codigo: 'COMPRAS', nombre: 'Compras' });
  const rut = requisito({
    estado: 'Aprobado',
    areas: [
      areaDeRequisito({
        areaId: 'a-compras',
        codigo: 'COMPRAS',
        estado: 'Aprobado',
        aprobaciones: 1,
        veredictos: [veredicto({ id: 'v-sistema', origen: 'Sistema', usuario: null, sobreVersion: 1, justificacion: JUSTIFICACION })],
      }),
    ],
  });
  const bancaria = requisito({
    id: 'r-bancaria',
    tipoDocumento: { id: 'td-banco', codigo: 'CERTIFICACION_BANCARIA', nombre: 'Certificación bancaria', tipoCanonico: 'CERTIFICACION_BANCARIA', ambito: 'Global' },
    versionActual: { documentoId: 'doc-banco', n: 1, sha256: 'def', cargadaEn: '2026-11-06T14:00:00Z' },
    areas: [areaDeRequisito({ areaId: 'a-compras', codigo: 'COMPRAS', estado: 'Pendiente' })],
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PanelRequisitos expediente={{ ...expediente('EnRevision', [compras]), requisitos: [rut, bancaria] }} contexto={() => CONTEXTO} nombres={new Map()} onAccion={() => undefined} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  // Lo aprobado va plegado en «Aprobados» mientras haya algo por revisar: el revisor lo abre para ver lo que decidió el Sistema.
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
  const tarjeta = (nombre: string) => {
    const li = screen.getByRole('heading', { name: nombre }).closest('li');
    if (!li) throw new Error(`falta la tarjeta de ${nombre}`);
    return within(li);
  };
  return { rut: tarjeta('Registro Único Tributario'), bancaria: tarjeta('Certificación bancaria') };
}

afterEach(() => reiniciarCliente());

describe('Lo que la empresa ya aprobó en otro expediente (RQ-11)', () => {
  it('el revisor ve el RUT aprobado por el Sistema sobre la misma versión, con la referencia al expediente anterior, y la certificación nueva sin veredicto', () => {
    const { rut, bancaria } = montar();

    expect(rut.getByText(`Sistema · aprobó · v1 · ${JUSTIFICACION}`)).toBeInTheDocument();
    expect(rut.queryByText(/Persona del área/)).not.toBeInTheDocument();
    expect(bancaria.queryByText(/aprobó/)).not.toBeInTheDocument();
    expect(bancaria.getByText('Compras')).toBeInTheDocument();
  });
});
