import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { solicitudDeRequisito } from './requisitos';
import { TarjetaRequisito } from './TarjetaRequisito';

/** Subir un archivo desde la revisión es un diálogo; llenar un formulario (sin archivo) sigue siendo su página. */
const requisito = (cambios: Partial<RequisitoPublicoDto['tipoDocumento']> = {}, estado: RequisitoPublicoDto['estado'] = 'Pendiente'): RequisitoPublicoDto => ({
  id: 'rq1',
  tipoDocumento: { id: 'td', codigo: 'RUT', nombre: 'Registro Único Tributario', tipoCanonico: 'RUT', ambito: 'Global', modo: 'Archivo', ...cambios },
  obligatorio: true,
  estado,
  versionActual: estado === 'Pendiente' ? null : { documentoId: 'd1', n: 1, sha256: 'x', cargadaEn: '2026-11-06T12:00:00Z' },
  observaciones: [],
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

function montar(r: RequisitoPublicoDto, soloLectura = false) {
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ul>
            <TarjetaRequisito requisito={r} expediente={EXPEDIENTE} subida={soloLectura ? null : solicitudDeRequisito(r, 'v1', 'e1')} />
          </ul>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => useDialogoSubir.getState().cerrar());

describe('subir lo que pide una empresa desde su revisión', () => {
  it('«Subir documento» abre el diálogo con el requisito, el vínculo y el tipo, sin salir de la revisión', async () => {
    const usuario = userEvent.setup();
    montar(requisito());

    expect(screen.queryByRole('link', { name: 'Subir documento' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(useDialogoSubir.getState().solicitud).toEqual({
      nombre: 'Registro Único Tributario',
      volver: '/expediente/e1',
      expediente: 'e1',
      requisito: 'rq1',
      tipo: 'RUT',
      vinculoId: 'v1',
    });
  });

  it('«Subir otra versión» de un documento ya cargado también abre el diálogo', async () => {
    const usuario = userEvent.setup();
    montar(requisito({}, 'Cargado'));

    await usuario.click(screen.getByRole('button', { name: 'Subir otra versión' }));

    expect(useDialogoSubir.getState().solicitud).toMatchObject({ requisito: 'rq1', tipo: 'RUT' });
  });

  it('un tipo que solo se llena (formulario) lleva a su página, que sí tiene su propio regreso a la revisión', () => {
    montar(requisito({ modo: 'Formulario' }));

    const llenar = screen.getByRole('link', { name: 'Llenar formulario' });
    expect(llenar).toHaveAttribute('href', expect.stringContaining('/boveda/subir?'));
    expect(llenar).toHaveAttribute('href', expect.stringContaining('requisito=rq1'));
    expect(llenar).toHaveAttribute('href', expect.stringContaining('volver=%2Fexpediente%2Fe1'));
    expect(screen.queryByRole('button', { name: 'Llenar formulario' })).not.toBeInTheDocument();
  });

  it('la acción es un botón pequeño relleno del color primario, con el ícono de lo que hace', () => {
    montar(requisito());

    const subir = screen.getByRole('button', { name: 'Subir documento' });
    expect(subir).toHaveClass('MuiButton-contained', 'MuiButton-colorPrimary', 'MuiButton-sizeSmall');
    expect(subir.querySelector('.MuiButton-startIcon svg.lucide-upload')).not.toBeNull();
  });

  it('reemplazar una versión vigente es la acción menos urgente: botón pequeño de borde, no relleno', () => {
    montar(requisito({}, 'Cargado'));

    const reemplazar = screen.getByRole('button', { name: 'Subir otra versión' });
    expect(reemplazar).toHaveClass('MuiButton-outlined', 'MuiButton-sizeSmall');
    expect(reemplazar).not.toHaveClass('MuiButton-contained');
  });

  it('una sola línea de metadatos une el estado de la versión con lo que admite el archivo', () => {
    montar(requisito());

    expect(screen.getByText(/^Aún no lo subes · .+ de hasta \d+ MB/)).toBeInTheDocument();
  });

  it('en solo lectura (o sin vínculo) no hay acción de subir', () => {
    montar(requisito(), true);

    expect(screen.queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Subir/ })).not.toBeInTheDocument();
  });
});
