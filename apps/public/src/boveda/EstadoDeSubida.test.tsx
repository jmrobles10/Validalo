import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type VersionDocumentoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { EstadoDeSubida } from './EstadoDeSubida';

/**
 * Lo que dice la subida al terminar bien: la versión que quedó en la bóveda y a dónde seguir (conversión de la e2e `actualizaciones`, PC-1: el
 * proveedor actualiza su RUT y ve «Es tu versión 2»).
 */
const version = (n: number): VersionDocumentoDto => ({
  documentoId: 'd-rut',
  n,
  estado: 'Actual',
  cargadaEn: '2026-11-08T15:00:00Z',
  cargadaPor: 'tercero',
  clase: 'Archivo',
  nombreOriginal: 'rut.pdf',
  mime: 'application/pdf',
  tamanoBytes: 2048,
  paginas: 1,
  sha256: 'huella',
  motivoDevolucion: null,
  detalleDevolucion: null,
  hechos: null,
});

function montar(n: number, volver: string | null, onListo?: () => void) {
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <MemoryRouter>
        <EstadoDeSubida
          estado={{ fase: 'resultado', archivo: new File(['%PDF-1.4'], 'rut.pdf', { type: 'application/pdf' }), resultado: { tipo: 'lista', version: version(n), compartidos: [] } }}
          tipo="Registro Único Tributario"
          onCancelar={() => undefined}
          onOtroArchivo={() => undefined}
          volver={volver}
          onListo={onListo}
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('una subida que terminó bien', () => {
  it('dice la versión que quedó en la bóveda y que ninguna empresa la exige todavía', () => {
    montar(2, null);

    expect(screen.getByText('Listo. Es tu versión 2 de Registro Único Tributario.')).toBeInTheDocument();
    expect(screen.getByText('Por ahora ninguna empresa la exige; queda en tu bóveda.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Volver a mi revisión' })).not.toBeInTheDocument();
  });

  it('si venía de una revisión ofrece volver a ella', () => {
    montar(1, '/expediente/e1');

    expect(screen.getByText('Listo. Es tu versión 1 de Registro Único Tributario.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Volver a mi revisión' })).toHaveAttribute('href', '/expediente/e1');
  });

  it('en el diálogo de subida la acción es «Listo»: cierra y no ofrece enlaces a otras pantallas', async () => {
    const usuario = userEvent.setup();
    const alTerminar = vi.fn();
    montar(3, '/expediente/e1', alTerminar);

    expect(screen.getByText('Listo. Es tu versión 3 de Registro Único Tributario.')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Listo' }));
    expect(alTerminar).toHaveBeenCalledTimes(1);
  });
});
