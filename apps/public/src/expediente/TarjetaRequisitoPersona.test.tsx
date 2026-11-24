import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { TarjetaRequisito } from './TarjetaRequisito';
import { solicitudDeRequisito } from './requisitos';

const requisito = (cambios: Partial<RequisitoPublicoDto>): RequisitoPublicoDto => ({
  id: 'rq1',
  tipoDocumento: { id: 'td', codigo: 'CEDULA', nombre: 'Cédula de ciudadanía', tipoCanonico: 'CEDULA', ambito: 'Global', modo: 'Archivo' },
  obligatorio: true,
  estado: 'Pendiente',
  versionActual: null,
  observaciones: [],
  ...cambios,
});

const EXPEDIENTE = {
  id: 'e1',
  folio: 'NORTE-E-2026-000001',
  empresa: { id: 'emp', nombre: 'Constructora Norte S.A.S.', logoUrl: null },
  tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
  estado: 'Abierto',
  observaciones: [],
  puedeReenviar: false,
  reenvios: 0,
  actualizadoEn: '2026-11-06T13:00:00Z',
  requisitos: [],
  requisitosFaltantes: 1,
} satisfies ExpedientePublicoDto;

function montar(r: RequisitoPublicoDto) {
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ul>
            <TarjetaRequisito requisito={r} expediente={EXPEDIENTE} subida={solicitudDeRequisito(r, 'v1', 'e1')} />
          </ul>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => useDialogoSubir.getState().cerrar());

describe('el documento de una persona relacionada en la revisión', () => {
  it('dice de quién es y abre el diálogo para subirlo a la bóveda de esa persona', async () => {
    const usuario = userEvent.setup();
    montar(requisito({ persona: { rol: 'RepresentanteLegal', todasLasRelaciones: false, sinPersona: false, personaId: 'p1', nombre: 'Juan Pérez', identificacion: 'CO CC 1001' } }));

    expect(screen.getByText('De Juan Pérez · Representante legal')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(useDialogoSubir.getState().solicitud).toMatchObject({ persona: 'p1', tipo: 'CEDULA', expediente: 'e1', requisito: 'rq1' });
  });

  it('sin persona todavía pide registrarla en la ficha legal con el rol elegido y no ofrece subir nada', () => {
    montar(requisito({ persona: { rol: 'RepresentanteLegal', todasLasRelaciones: false, sinPersona: true } }));

    expect(screen.getByText(/Aún no registras a quién cumple este rol \(representante legal\)/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar a la persona' })).toHaveAttribute('href', '/ficha/legal?agregar=RepresentanteLegal');
    expect(screen.queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Subir/ })).not.toBeInTheDocument();
  });

  it('un rol que la ficha legal no maneja se registra en Personas', () => {
    montar(requisito({ persona: { rol: 'BeneficiarioFinal', todasLasRelaciones: false, sinPersona: true } }));

    expect(screen.getByRole('link', { name: 'Registrar a la persona' })).toHaveAttribute('href', '/personas');
  });

  it('un documento del propio tercero se ve como siempre: su subida no lleva persona', async () => {
    const usuario = userEvent.setup();
    montar(requisito({}));

    expect(screen.queryByText(/De .* ·/)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir documento' }));

    const solicitud = useDialogoSubir.getState().solicitud;
    expect(solicitud).toMatchObject({ tipo: 'CEDULA', vinculoId: 'v1' });
    expect(solicitud?.persona).toBeUndefined();
  });
});
