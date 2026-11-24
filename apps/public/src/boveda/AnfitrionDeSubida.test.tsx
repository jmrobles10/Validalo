import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, useNavigate, type NavigateFunction } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnfitrionDeSubida } from './AnfitrionDeSubida';
import { useDialogoSubir } from './useDialogoSubir';

/** Deja a mano el `navigate` del router: el diálogo es modal, así que se navega «por fuera», como con el botón «atrás» del navegador. */
let navegar: NavigateFunction = () => Promise.resolve();
function CapturaDeNavegacion() {
  navegar = useNavigate();
  return null;
}

function montar() {
  configurarCliente({ fetch: vi.fn(() => Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))) });
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/boveda']}>
          <CapturaDeNavegacion />
          <AnfitrionDeSubida />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => {
  reiniciarCliente();
  useDialogoSubir.getState().cerrar();
});

describe('el diálogo de subida de toda la app', () => {
  it('no hay diálogo hasta que un botón «Subir…» lo abre', () => {
    montar();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lo abre con lo que pide el botón y se cierra con «Cerrar»', async () => {
    const usuario = userEvent.setup();
    montar();

    act(() => useDialogoSubir.getState().abrir({ tipo: 'RUT', nombre: 'RUT' }));
    expect(await screen.findByRole('dialog', { name: 'Subir RUT' })).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Cerrar' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(useDialogoSubir.getState().solicitud).toBeNull();
  });

  it('si la persona cambia de pantalla, no se queda abierto sobre la otra', async () => {
    montar();
    act(() => useDialogoSubir.getState().abrir({ tipo: 'RUT', nombre: 'RUT' }));
    expect(await screen.findByRole('dialog', { name: 'Subir RUT' })).toBeInTheDocument();

    await act(() => navegar('/personas'));

    await vi.waitFor(() => expect(useDialogoSubir.getState().solicitud).toBeNull());
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('un cambio en la misma pantalla (el filtro de la dirección) no lo cierra', async () => {
    montar();
    act(() => useDialogoSubir.getState().abrir({ tipo: 'RUT', nombre: 'RUT' }));
    expect(await screen.findByRole('dialog', { name: 'Subir RUT' })).toBeInTheDocument();

    await act(() => navegar('/boveda?empresa=norte'));

    expect(useDialogoSubir.getState().solicitud).toEqual({ tipo: 'RUT', nombre: 'RUT' });
    expect(screen.getByRole('dialog', { name: 'Subir RUT' })).toBeInTheDocument();
  });

  it('abrir con un diálogo ya abierto no deja dos: manda la última solicitud', async () => {
    montar();

    act(() => useDialogoSubir.getState().abrir({ tipo: 'RUT', nombre: 'RUT' }));
    act(() => useDialogoSubir.getState().abrir({ tipo: 'CEDULA', nombre: 'Cédula de ciudadanía' }));

    expect(await screen.findByRole('dialog', { name: 'Subir Cédula de ciudadanía' })).toBeInTheDocument();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });
});
