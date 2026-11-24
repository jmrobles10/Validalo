import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TarjetaRequisito } from './TarjetaRequisito';
import { TarjetaRequisitoSeccion } from './TarjetaRequisitoSeccion';
import { solicitudDeRequisito } from './requisitos';

const requisito = (cambios: Partial<RequisitoPublicoDto>): RequisitoPublicoDto => ({
  id: 'rq1',
  tipoDocumento: { id: 'td', codigo: 'CAMARA_COMERCIO', nombre: 'Certificado de existencia y representación legal', tipoCanonico: 'CAMARA_COMERCIO', ambito: 'Global', modo: 'Archivo' },
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

const PORQUE = [{ campo: 'ficha.especialidades.especialidades', etiqueta: 'Especialidades', valores: ['Obra gris', 'Acabados'] }];

function montar(r: RequisitoPublicoDto, seccion = false) {
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ul>
            {seccion ? (
              <TarjetaRequisitoSeccion requisito={r} expediente={EXPEDIENTE} conAccion />
            ) : (
              <TarjetaRequisito requisito={r} expediente={EXPEDIENTE} subida={solicitudDeRequisito(r, 'v1', 'e1')} />
            )}
          </ul>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('por qué se le pide un documento al tercero (EF-6)', () => {
  it('dice que lo pide la empresa porque declaró algo en su ficha, con los valores que lo hicieron aplicar', () => {
    montar(requisito({ porQue: PORQUE }));

    expect(screen.getByText('Te lo pide Constructora Norte S.A.S. porque en tu ficha declaraste: Especialidades: Obra gris, Acabados.')).toBeInTheDocument();
  });

  it('con varios campos los separa y con un campo sin valores solo lo nombra', () => {
    montar(requisito({ porQue: [...PORQUE, { campo: 'ficha.tributaria.responsable_ica', etiqueta: 'Responsable del impuesto de industria y comercio', valores: [] }] }));

    expect(screen.getByText(/declaraste: Especialidades: Obra gris, Acabados; Responsable del impuesto de industria y comercio\./)).toBeInTheDocument();
  });

  it('un documento que se pide siempre no trae explicación', () => {
    montar(requisito({}));
    montar(requisito({ porQue: [] }));

    expect(screen.queryByText(/porque en tu ficha declaraste/)).not.toBeInTheDocument();
  });

  it('una sección que pide la empresa por lo que declaró también lo explica', () => {
    montar(
      requisito({
        tipoRequisito: 'Seccion',
        tipoDocumento: { id: 'td', codigo: 'FICHA_SST', nombre: 'Seguridad y salud en el trabajo', tipoCanonico: 'FICHA_SST', ambito: 'Global', modo: 'Formulario' },
        porQue: PORQUE,
      }),
      true,
    );

    expect(screen.getByText(/Te lo pide Constructora Norte S.A.S. porque en tu ficha declaraste: Especialidades: Obra gris, Acabados\./)).toBeInTheDocument();
  });
});
