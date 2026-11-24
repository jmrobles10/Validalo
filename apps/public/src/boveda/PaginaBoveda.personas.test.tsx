import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  configurarCliente,
  reiniciarCliente,
  type BovedaDto,
  type DocumentoBovedaDto,
  type DocumentoDePersonaDto,
  type RelacionEntreTercerosDto,
  type SesionTerceroDto,
} from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSesionTercero } from '../sesion/sesionTercero';
import { PaginaBoveda } from './PaginaBoveda';
import { useDialogoSubir } from './useDialogoSubir';

/**
 * «De tus personas relacionadas» en «Mi bóveda» (ADR-0010): la cédula de un representante legal vive en la bóveda de la persona, no en la del tercero,
 * y sin este grupo el tercero cree que no la subió.
 */
const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } });

const sesion = (cambios: Partial<SesionTerceroDto> = {}): SesionTerceroDto => ({
  accessToken: 't',
  expira: '2099-01-01T00:00:00Z',
  terceroId: 'ter',
  otpVerificado: false,
  vinculos: [],
  aislada: false,
  terceroEnmascarado: null,
  ...cambios,
});

const RUT: DocumentoBovedaDto = {
  id: 'rut',
  tipo: { codigo: 'RUT', nombre: 'Registro Único Tributario', tipoDocumentoTenantId: null },
  ambito: 'Global',
  clase: 'Archivo',
  vinculoId: null,
  versionActual: null,
  versiones: 1,
  porEmpresa: [],
};

const documento = (tipoCanonico: string, cambios: Partial<DocumentoDePersonaDto> = {}): DocumentoDePersonaDto => ({
  tipoCanonico,
  nombre: tipoCanonico,
  documentoId: `d-${tipoCanonico}`,
  version: 2,
  estado: 'Actual',
  cargadaEn: '2026-11-10T10:00:00Z',
  pedido: false,
  ...cambios,
});

const sinCargar = (tipoCanonico: string) => documento(tipoCanonico, { documentoId: null, version: null, estado: null, cargadaEn: null });

const relacion = (id: string, tipo: string, nombre: string, documentos: DocumentoDePersonaDto[], cambios: Partial<RelacionEntreTercerosDto> = {}): RelacionEntreTercerosDto => ({
  id,
  personaId: `persona-${id}`,
  identificacion: { pais: 'CO', tipo: 'CC', numero: `100${id}` },
  nombre,
  tipo,
  principal: false,
  participacion: null,
  cargo: null,
  vigenteDesde: '2026-11-01',
  vigenteHasta: null,
  estado: 'Confirmada',
  fuente: 'Declarada',
  deFicha: true,
  confianza: null,
  confirmadaEn: '2026-11-01T10:00:00Z',
  documentos,
  ...cambios,
});

function montar(relaciones: RelacionEntreTercerosDto[], documentos: DocumentoBovedaDto[] = [RUT]) {
  const pedidas: string[] = [];
  const laBoveda: BovedaDto = { terceroId: 't1', documentos };
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL) => {
      const ruta = new URL(entrada instanceof Request ? entrada.url : entrada.toString(), 'http://localhost').pathname;
      pedidas.push(ruta);
      return Promise.resolve(json(ruta.endsWith('/tercero/relaciones') ? relaciones : laBoveda));
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/boveda']}>
          <PaginaBoveda />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return pedidas;
}

afterEach(() => {
  reiniciarCliente();
  useSesionTercero.setState({ estado: 'sin-sesion', sesion: null });
  useDialogoSubir.getState().cerrar();
});

describe('«Mi bóveda»: los documentos de las personas relacionadas', () => {
  it('debajo de los documentos del tercero muestra a cada persona con su rol y lo que tiene cargado', async () => {
    useSesionTercero.setState({ estado: 'activa', sesion: sesion() });
    montar([
      relacion('1', 'RepresentanteLegal', 'Juan Pérez', [documento('CEDULA', { version: 2, estado: 'Actual' }), documento('CERTIFICADO_ANTECEDENTES', { version: 1, estado: 'EnAnalisis' }), sinCargar('PASAPORTE')]),
      relacion('2', 'Socio', 'Ana Gómez', [documento('CEDULA', { version: 1, estado: 'Devuelta' })]),
    ]);

    const grupo = await screen.findByRole('region', { name: 'De tus personas relacionadas' });
    expect(within(grupo).getByRole('heading', { level: 2, name: 'De tus personas relacionadas' })).toBeInTheDocument();
    expect(within(grupo).getByRole('link', { name: 'Ver personas relacionadas' })).toHaveAttribute('href', '/personas');

    const juan = within(grupo).getByRole('heading', { level: 3, name: 'Juan Pérez' }).closest('li') as HTMLElement;
    expect(juan).toHaveTextContent('Representante legal');
    const documentosDeJuan = within(within(juan).getByRole('list', { name: 'Documentos de Juan Pérez' })).getAllByRole('listitem');
    // Solo lo cargado: el pasaporte sin cargar no sale. Cada uno con su versión, fecha y estado.
    expect(documentosDeJuan).toHaveLength(2);
    expect(documentosDeJuan[0]).toHaveTextContent('Cédula de ciudadanía');
    expect(documentosDeJuan[0]).toHaveTextContent('Versión 2 · 10/11/2026');
    expect(documentosDeJuan[0]).toHaveTextContent('Vigente');
    expect(documentosDeJuan[1]).toHaveTextContent('Certificado de antecedentes');
    expect(documentosDeJuan[1]).toHaveTextContent('En análisis');

    const ana = within(grupo).getByRole('heading', { level: 3, name: 'Ana Gómez' }).closest('li') as HTMLElement;
    expect(ana).toHaveTextContent('Socio o accionista');
    expect(ana).toHaveTextContent('Devuelta');

    // Los documentos del propio tercero siguen arriba: el grupo va después.
    const rut = screen.getByRole('article', { name: 'Registro Único Tributario' });
    expect(rut.compareDocumentPosition(grupo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('«Subir otra versión» de una persona abre el diálogo de subida de su bóveda, sin salir de la página', async () => {
    const usuario = userEvent.setup();
    useSesionTercero.setState({ estado: 'activa', sesion: sesion() });
    montar([relacion('1', 'RepresentanteLegal', 'Juan Pérez', [documento('CEDULA')])]);

    await usuario.click(await screen.findByRole('button', { name: 'Subir otra versión: Cédula de ciudadanía' }));

    expect(useDialogoSubir.getState().solicitud).toEqual({ persona: 'persona-1', tipo: 'CEDULA', nombre: 'Cédula de ciudadanía' });
  });

  it('una persona con dos roles aparece una vez, con los dos', async () => {
    useSesionTercero.setState({ estado: 'activa', sesion: sesion() });
    montar([
      relacion('1', 'RepresentanteLegal', 'Juan Pérez', [documento('CEDULA')], { personaId: 'p1' }),
      relacion('2', 'Socio', 'Juan Pérez', [documento('CEDULA')], { personaId: 'p1' }),
    ]);

    const grupo = await screen.findByRole('region', { name: 'De tus personas relacionadas' });
    expect(within(grupo).getAllByRole('heading', { level: 3, name: 'Juan Pérez' })).toHaveLength(1);
    expect(grupo).toHaveTextContent('Representante legal · Socio o accionista');
  });

  it.each([
    ['sin personas relacionadas', [] as RelacionEntreTercerosDto[]],
    ['con personas pero sin documentos cargados', [relacion('1', 'RepresentanteLegal', 'Juan Pérez', [sinCargar('CEDULA')])]],
    ['con una propuesta de la IA todavía sin confirmar', [relacion('1', 'RepresentanteLegal', 'Juan Pérez', [documento('CEDULA')], { estado: 'Propuesta' })]],
  ])('el grupo no aparece %s', async (_caso, relaciones) => {
    useSesionTercero.setState({ estado: 'activa', sesion: sesion() });
    const pedidas = montar(relaciones);

    await screen.findByRole('article', { name: 'Registro Único Tributario' });
    await vi.waitFor(() => expect(pedidas.some((r) => r.endsWith('/tercero/relaciones'))).toBe(true));
    expect(screen.queryByRole('region', { name: 'De tus personas relacionadas' })).not.toBeInTheDocument();
  });

  it('con acceso aislado ni siquiera se piden las personas', async () => {
    useSesionTercero.setState({ estado: 'activa', sesion: sesion({ aislada: true }) });
    const pedidas = montar([relacion('1', 'RepresentanteLegal', 'Juan Pérez', [documento('CEDULA')])]);

    await screen.findByRole('article', { name: 'Registro Único Tributario' });
    expect(pedidas.some((r) => r.endsWith('/tercero/relaciones'))).toBe(false);
    expect(screen.queryByRole('region', { name: 'De tus personas relacionadas' })).not.toBeInTheDocument();
  });

  it('aunque el tercero no tenga documentos propios, sus personas con documentos se ven', async () => {
    useSesionTercero.setState({ estado: 'activa', sesion: sesion() });
    montar([relacion('1', 'RepresentanteLegal', 'Juan Pérez', [documento('CEDULA')])], []);

    expect(await screen.findByText('Aún no tienes documentos')).toBeInTheDocument();
    expect(await screen.findByRole('region', { name: 'De tus personas relacionadas' })).toBeInTheDocument();
  });
});
