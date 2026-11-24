import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, type BovedaDto, type ComparticionPublicaDto, type DocumentoBovedaDto, type VigenciaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaginaBoveda } from './PaginaBoveda';
import { useDialogoSubir } from './useDialogoSubir';

const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } });

const vigencia = (estado: string, vigenteHasta: string): VigenciaDto => ({ vigenteHasta, base: 'FechaExpedicion', estado, diasAviso: [30], diasGracia: 15, finDeGracia: null, vencidaEn: null });

const empresa = (id: string, nombre: string, cambios: Partial<ComparticionPublicaDto> = {}): ComparticionPublicaDto => ({
  vinculoId: `v-${id}`,
  empresa: { id, nombre, logoUrl: null },
  compartido: true,
  version: 1,
  versionActualCompartida: true,
  compartidaEn: '2026-10-01T12:00:00Z',
  vigencia: vigencia('Vigente', '2027-06-01'),
  situacion: 'AproboVigente',
  otraVersion: null,
  ...cambios,
});

const documento = (id: string, nombre: string, porEmpresa: ComparticionPublicaDto[]): DocumentoBovedaDto => ({
  id,
  tipo: { codigo: id.toUpperCase(), nombre, tipoDocumentoTenantId: null },
  ambito: 'Global',
  clase: 'Archivo',
  vinculoId: null,
  versionActual: null,
  versiones: 1,
  porEmpresa,
});

/** Cuatro empresas: el RUT vence pronto para Norte, la cámara vence pronto para Sur. Oriente y Poniente están al día. */
const CUATRO = (): DocumentoBovedaDto[] => [
  documento('rut', 'Registro Único Tributario', [
    empresa('norte', 'Constructora Norte', { vigencia: vigencia('PorVencer', '2026-11-30') }),
    empresa('sur', 'Constructora Sur'),
    empresa('oriente', 'Constructora Oriente'),
    empresa('poniente', 'Constructora Poniente'),
  ]),
  documento('camara', 'Cámara de comercio', [
    empresa('norte', 'Constructora Norte'),
    empresa('sur', 'Constructora Sur', { vigencia: vigencia('PorVencer', '2026-12-15') }),
    empresa('oriente', 'Constructora Oriente'),
    empresa('poniente', 'Constructora Poniente', { compartido: false, version: null, versionActualCompartida: false, vigencia: null, situacion: 'NoRecibe' }),
  ]),
];

function Ubicacion() {
  return <output aria-label="ubicación">{useLocation().search}</output>;
}

function montar(documentos: DocumentoBovedaDto[], direccion = '/boveda') {
  const respuesta: BovedaDto = { terceroId: 't1', documentos };
  configurarCliente({ fetch: vi.fn(() => Promise.resolve(json(respuesta))) });
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[direccion]}>
          <PaginaBoveda />
          <Ubicacion />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

const tarjeta = (nombre: string) => screen.getByRole('article', { name: nombre });

afterEach(() => {
  reiniciarCliente();
  useDialogoSubir.getState().cerrar();
});

describe('mi bóveda con varias empresas', () => {
  it('con una sola empresa no hay filtro', async () => {
    montar([documento('rut', 'Registro Único Tributario', [empresa('norte', 'Constructora Norte')])]);

    expect(await screen.findByRole('article', { name: 'Registro Único Tributario' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Empresa' })).not.toBeInTheDocument();
  });

  it('con dos o más empresas el filtro empieza en «Todas» y cada documento resume sus empresas', async () => {
    montar(CUATRO());

    const filtro = await screen.findByRole('combobox', { name: 'Empresa' });
    expect(filtro).toHaveValue('Todas');
    // El RUT tiene cuatro empresas que lo exigen y la cámara tres (Poniente no la exige): ninguna se nombra, se cuentan.
    expect(within(tarjeta('Registro Único Tributario')).getByRole('button', { name: /Al día con 4 empresas/ })).toBeInTheDocument();
    expect(within(tarjeta('Cámara de comercio')).getByRole('button', { name: /Al día con 3 empresas/ })).toBeInTheDocument();
    expect(tarjeta('Cámara de comercio')).not.toHaveTextContent('Poniente');
  });

  it('elegir una empresa limita las filas y el aviso «Por renovar» a ella y lo deja en la dirección', async () => {
    const usuario = userEvent.setup();
    montar(CUATRO());
    const aviso = await screen.findByRole('region', { name: 'Por renovar' });
    // Sin filtro, cada documento dice su fecha más próxima: con cuatro empresas la línea se resume y con tres las nombra a todas.
    expect(aviso).toHaveTextContent('Registro Único Tributario: vence el 30/11/2026 para Constructora Norte.');
    expect(aviso).toHaveTextContent('Cámara de comercio: vence para Constructora Sur el 15/12/2026');

    await usuario.click(screen.getByRole('combobox', { name: 'Empresa' }));
    await usuario.click(screen.getByRole('option', { name: 'Constructora Norte' }));

    expect(screen.getByRole('combobox', { name: 'Empresa' })).toHaveValue('Constructora Norte');
    expect(screen.getByLabelText('ubicación')).toHaveTextContent('?empresa=norte');
    // Cada fila dice solo el estado de esa empresa, como con una sola.
    for (const nombre of ['Registro Único Tributario', 'Cámara de comercio']) {
      const filas = within(within(tarjeta(nombre)).getByRole('list', { name: 'Con tus empresas' })).getAllByRole('listitem');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toHaveTextContent('Constructora Norte · aprobada v1');
    }
    // El aviso se limita a esa empresa: la cámara ya no aparece (para Norte no vence) y el RUT usa la frase de una sola empresa.
    const avisoNorte = screen.getByRole('region', { name: 'Por renovar' });
    expect(avisoNorte).toHaveTextContent('Registro Único Tributario: vence para Constructora Norte el 30/11/2026.');
    expect(avisoNorte).not.toHaveTextContent('Cámara de comercio');

    // «Todas» quita el filtro y la dirección vuelve a quedar limpia.
    await usuario.click(screen.getByRole('combobox', { name: 'Empresa' }));
    await usuario.click(screen.getByRole('option', { name: 'Todas' }));
    expect(screen.getByLabelText('ubicación')).toBeEmptyDOMElement();
    expect(within(tarjeta('Registro Único Tributario')).getByRole('button', { name: /Al día con 4 empresas/ })).toBeInTheDocument();
  });

  it('abrir la bóveda con la empresa en la dirección ya la trae filtrada y un id desconocido se lee como «Todas»', async () => {
    montar(CUATRO(), '/boveda?empresa=sur');
    expect(await screen.findByRole('combobox', { name: 'Empresa' })).toHaveValue('Constructora Sur');
    expect(within(tarjeta('Cámara de comercio')).getByRole('list', { name: 'Con tus empresas' })).toHaveTextContent('Constructora Sur · aprobada v1');
  });

  it('con un id desconocido en la dirección muestra todas las empresas', async () => {
    montar(CUATRO(), '/boveda?empresa=fantasma');
    expect(await screen.findByRole('combobox', { name: 'Empresa' })).toHaveValue('Todas');
    expect(within(tarjeta('Registro Único Tributario')).getByRole('button', { name: /Al día con 4 empresas/ })).toBeInTheDocument();
  });
});

describe('subir desde mi bóveda', () => {
  it('«Subir documento» abre el diálogo de subida sin tipo elegido y no cambia de pantalla', async () => {
    const usuario = userEvent.setup();
    montar(CUATRO());

    await usuario.click(await screen.findByRole('button', { name: 'Subir documento' }));

    expect(useDialogoSubir.getState().solicitud).toEqual({});
    expect(screen.getByLabelText('ubicación')).toBeEmptyDOMElement();
  });

  it('«Subir versión» de un documento abre el diálogo con ese documento', async () => {
    const usuario = userEvent.setup();
    montar(CUATRO());

    await usuario.click(await within(await screen.findByRole('article', { name: 'Cámara de comercio' })).findByRole('button', { name: 'Subir versión' }));

    expect(useDialogoSubir.getState().solicitud).toEqual({ documento: 'camara', tipo: 'CAMARA' });
  });

  it('con la bóveda vacía el botón también está en la cabecera', async () => {
    const usuario = userEvent.setup();
    montar([]);

    expect(await screen.findByText('Aún no tienes documentos')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir documento' }));

    expect(useDialogoSubir.getState().solicitud).toEqual({});
  });
});
