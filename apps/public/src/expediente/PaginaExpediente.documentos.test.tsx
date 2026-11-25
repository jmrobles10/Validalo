import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { configurarCliente, reiniciarCliente, type ExpedientePublicoDto, type RequisitoPublicoDto, type VinculoPublicoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaginaExpediente } from './PaginaExpediente';

/**
 * Lo que el tercero ve de cada documento en «Tu revisión con {empresa}»: lo que falta, lo que la empresa revisa o aprobó (con su versión) y lo
 * que le eximió; el encabezado y la tarjeta de cada documento cuentan lo mismo (nunca «Aprobado» arriba y «En revisión» abajo).
 */
const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } });

const vinculo: VinculoPublicoDto = {
  id: 'v1',
  empresa: { id: 'emp', nombre: 'Constructora Norte', logoUrl: null },
  tipoVinculo: { id: 'tp', codigo: 'CLIENTE', nombre: 'Cliente' },
  estado: 'EnValidacion',
  invitacionAceptada: true,
  invitacionAceptadaEn: '2026-11-08T15:00:00Z',
  expedienteId: 'exp-1',
};

function documento(codigo: string, nombre: string, estado: RequisitoPublicoDto['estado'], version: number | null): RequisitoPublicoDto {
  return {
    id: `r-${codigo}`,
    tipoDocumento: { id: `td-${codigo}`, codigo, nombre, tipoCanonico: codigo, ambito: 'Global' },
    obligatorio: true,
    estado,
    versionActual: version === null ? null : { documentoId: `doc-${codigo}`, n: version, sha256: 'abc', cargadaEn: '2026-11-10T15:00:00Z' },
    observaciones: [],
  };
}

function expediente(cambios: Partial<ExpedientePublicoDto>): ExpedientePublicoDto {
  return {
    id: 'exp-1',
    folio: 'NORTE-E-2026-000001',
    empresa: { id: 'emp', nombre: 'Constructora Norte', logoUrl: null },
    tipoVinculo: { id: 'tp', codigo: 'CLIENTE', nombre: 'Cliente' },
    estado: 'EnRevision',
    tipo: 'Inicial',
    observaciones: [],
    puedeReenviar: false,
    reenvios: 0,
    requisitosFaltantes: 0,
    requisitos: [],
    actualizadoEn: '2026-11-10T15:00:00Z',
    ...cambios,
  };
}

function montar(cuerpo: ExpedientePublicoDto) {
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      return Promise.resolve(json(url.includes('/expedientes/') ? cuerpo : [vinculo]));
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/expediente/exp-1']}>
          <Routes>
            <Route path="/expediente/:id" element={<PaginaExpediente />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const tarjeta = (nombre: string) => within(screen.getByRole('heading', { level: 4, name: nombre }).closest('li') as HTMLElement);

afterEach(() => reiniciarCliente());

describe('Mi revisión con una empresa: los documentos que pide', () => {
  it('con un documento sin subir dice cuántos faltan y que la empresa empieza a revisar cuando lo suba', async () => {
    montar(expediente({ estado: 'Abierto', requisitosFaltantes: 1, requisitos: [documento('RUT', 'Registro Único Tributario', 'Cargado', 1), documento('CAMARA', 'Certificado de existencia y representación legal', 'Pendiente', null)] }));

    const titulo = await screen.findByRole('heading', { level: 1, name: 'Tu revisión con Constructora Norte' });
    expect(within(titulo.closest('main') ?? document.body).getByText('Te falta 1 documento. Súbelo para que Constructora Norte empiece a revisar.')).toBeInTheDocument();
    expect(tarjeta('Certificado de existencia y representación legal').getByText(/^Aún no lo subes · .+ de hasta \d+ MB/)).toBeInTheDocument();
    expect(tarjeta('Certificado de existencia y representación legal').getByRole('button', { name: 'Subir documento' })).toBeInTheDocument();
  });

  it('cada grupo dice cuántos requisitos tiene y cada requisito es una tarjeta propia (no un bloque con divisores)', async () => {
    montar(
      expediente({
        estado: 'Abierto',
        requisitosFaltantes: 2,
        requisitos: [
          documento('RUT', 'Registro Único Tributario', 'Cargado', 1),
          documento('CAMARA', 'Certificado de existencia y representación legal', 'Pendiente', null),
          documento('POLIZA', 'Póliza de cumplimiento', 'Pendiente', null),
        ],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Tu revisión con Constructora Norte' });
    expect(screen.getByRole('heading', { level: 3, name: 'Te toca 2' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Lo revisa Constructora Norte 1' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: /^Listo/ })).not.toBeInTheDocument();
    const lista = screen.getByRole('heading', { level: 3, name: 'Te toca 2' }).nextElementSibling as HTMLElement;
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(getComputedStyle(lista).display).toBe('grid');
  });

  it('un documento eximido se ve «Eximido» y ya no se le pide subirlo; la revisión sigue en curso', async () => {
    montar(
      expediente({
        estado: 'EnRevision',
        requisitos: [documento('RUT', 'Registro Único Tributario', 'EnRevision', 1), documento('CAMARA', 'Certificado de existencia y representación legal', 'Eximido', null)],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Tu revisión con Constructora Norte' });
    const camara = tarjeta('Certificado de existencia y representación legal');
    expect(await camara.findByText('Eximido')).toBeInTheDocument();
    expect(camara.queryByRole('button', { name: /^Subir/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Te falta/)).not.toBeInTheDocument();
  });

  it('cada documento dice su versión y su estado: lo aprobado «Aprobado» y lo que la empresa revisa «En revisión», sin contradecirse', async () => {
    montar(
      expediente({
        estado: 'EnRevision',
        tipo: 'Actualizacion',
        requisitos: [documento('RUT', 'Registro Único Tributario', 'EnRevision', 2), documento('BANCARIA', 'Certificación bancaria', 'Aprobado', 2)],
      }),
    );

    await screen.findByRole('heading', { level: 1, name: 'Tu revisión con Constructora Norte' });
    expect(tarjeta('Registro Único Tributario').getByText(/Versión 2 · cargada el/)).toBeInTheDocument();
    expect(tarjeta('Registro Único Tributario').getByText('En revisión')).toBeInTheDocument();
    expect(tarjeta('Registro Único Tributario').queryByText('Aprobado')).not.toBeInTheDocument();
    expect(tarjeta('Certificación bancaria').getByText(/Versión 2 · cargada el/)).toBeInTheDocument();
    expect(tarjeta('Certificación bancaria').getByText('Aprobado')).toBeInTheDocument();
  });
});
