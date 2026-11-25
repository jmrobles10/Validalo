import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { configurarCliente, reiniciarCliente, SCOPES, type PersonaDelRequisitoDto, type PersonaDelVinculoDto, type VinculoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import type { TFunction } from 'i18next';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { TarjetaPersonasRelacionadas } from './TarjetaPersonasRelacionadas';
import { documentosDePersonas } from './api';
import { textoDelRequisito, textoDelRol } from './modelo';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const json = (estado: number, cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

function vinculo(cambios: Partial<VinculoDto> = {}): VinculoDto {
  return {
    id: 'v1',
    empresaId: 'emp',
    terceroId: 't1',
    tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
    flujoId: null,
    estado: 'Activo',
    atributos: {},
    correoTercero: 'contacto@tornillo.co',
    invitacionAceptadaEn: '2026-11-02T10:00:00Z',
    ...cambios,
  } as VinculoDto;
}

function persona(cambios: Partial<PersonaDelVinculoDto> = {}): PersonaDelVinculoDto {
  return {
    relacionId: 'r1',
    personaId: 'p1',
    identificacion: { pais: 'CO', tipo: 'CC', numero: '1020304050' },
    nombre: 'Juan Pérez',
    tipo: 'RepresentanteLegal',
    principal: true,
    participacion: null,
    cargo: null,
    vigenteDesde: '2026-11-01',
    documentos: [
      {
        documentoId: 'd1',
        tipo: { id: 'td', codigo: 'CEDULA', nombre: 'Cédula de ciudadanía' },
        ambito: 'Global',
        versionActual: 1,
        versionesCompartidas: [{ n: 1, sha256: 'abc', cargadaEn: '2026-11-05T10:00:00Z', estado: 'Actual' }],
      },
    ],
    ...cambios,
  } as PersonaDelVinculoDto;
}

function montar(personas: PersonaDelVinculoDto[], v: VinculoDto = vinculo()) {
  const urls: string[] = [];
  configurarCliente({
    fetch: vi.fn((url: RequestInfo | URL) => {
      urls.push(url instanceof Request ? url.url : url.toString());
      return Promise.resolve(json(200, personas));
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TarjetaPersonasRelacionadas vinculo={v} empresaId="emp" />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return urls;
}

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
});

describe('personas relacionadas del vínculo', () => {
  it('muestra cada persona con su rol y solo lo que se compartió con el vínculo', async () => {
    permisos.scopes = new Set([SCOPES.documentosLeer]);
    const urls = montar([
      persona(),
      persona({ relacionId: 'r2', personaId: 'p2', identificacion: { pais: 'CO', tipo: 'CC', numero: '52111222' }, nombre: 'Ana Gómez', tipo: 'Socio', principal: false, participacion: '35.5', cargo: 'Presidente', documentos: [] }),
    ]);

    const juan = await screen.findByRole('listitem', { name: 'Juan Pérez' });
    expect(juan).toHaveTextContent('CC 1020304050');
    expect(within(juan).getByText('Representante legal')).toBeInTheDocument();
    expect(within(juan).getByText('Principal')).toBeInTheDocument();
    expect(juan).toHaveTextContent('Cédula de ciudadanía');
    expect(juan).toHaveTextContent('Versión 1');
    expect(juan).toHaveTextContent('1 versión compartida');
    const ana = screen.getByRole('listitem', { name: 'Ana Gómez' });
    expect(ana).toHaveTextContent('CC 52111222 · Cargo: Presidente');
    expect(within(ana).getByText('Socio o accionista · 35,5 %')).toBeInTheDocument();
    expect(ana).toHaveTextContent('Aún no se comparte ningún documento de esta persona con el vínculo.');
    expect(urls.some((u) => u.includes('/api/v1/vinculos/v1/personas-relacionadas'))).toBe(true);
  });

  it('una persona con dos relaciones (representante legal y socio) es UNA tarjeta: sus dos roles como chips, «Principal» una vez y su cédula una sola vez', async () => {
    permisos.scopes = new Set([SCOPES.documentosLeer]);
    montar([
      persona({ relacionId: 'r1', nombre: 'JOEL MATEO ROBLES ATUESTA', tipo: 'RepresentanteLegal', principal: true }),
      persona({ relacionId: 'r2', nombre: 'JOEL MATEO ROBLES ATUESTA', tipo: 'Socio', principal: true, participacion: '100' }),
    ]);

    const joel = await screen.findByRole('listitem', { name: 'JOEL MATEO ROBLES ATUESTA' });
    expect(screen.getAllByRole('listitem', { name: 'JOEL MATEO ROBLES ATUESTA' })).toHaveLength(1);
    expect(within(joel).getByText('Representante legal')).toBeInTheDocument();
    expect(within(joel).getByText('Socio o accionista · 100 %')).toBeInTheDocument();
    expect(within(joel).getAllByText('Principal')).toHaveLength(1);
    // La cédula, que se compartió por las dos relaciones, sale una vez (y con su única versión compartida).
    expect(within(joel).getAllByText('Cédula de ciudadanía')).toHaveLength(1);
    expect(within(joel).getAllByText('1 versión compartida')).toHaveLength(1);
    expect(joel).toHaveTextContent('CC 1020304050');
  });

  it('si las relaciones comparten versiones distintas del mismo documento, salen juntas en una sola fila', async () => {
    permisos.scopes = new Set([SCOPES.documentosLeer]);
    const conVersion = (n: number) =>
      [{ ...persona().documentos[0]!, versionesCompartidas: [{ n, sha256: 'abc', cargadaEn: '2026-11-05T10:00:00Z', estado: 'Actual' }] }] as unknown as PersonaDelVinculoDto['documentos'];
    montar([
      persona({ relacionId: 'r1', documentos: conVersion(1) }),
      persona({ relacionId: 'r2', tipo: 'Socio', principal: false, participacion: '60', documentos: conVersion(2) }),
    ]);

    const juan = await screen.findByRole('listitem', { name: 'Juan Pérez' });
    expect(within(juan).getAllByText('Cédula de ciudadanía')).toHaveLength(1);
    expect(within(juan).getByText('2 versiones compartidas')).toBeInTheDocument();
  });

  it('sin personas dice que el flujo no pide documentos de personas relacionadas', async () => {
    permisos.scopes = new Set([SCOPES.documentosLeer]);
    montar([]);

    expect(await screen.findByText('Tu flujo no pide documentos de personas relacionadas')).toBeInTheDocument();
  });

  it('no aparece sin permiso de leer documentos ni antes de que el tercero acepte la invitación', () => {
    const sinPermiso = montar([persona()]);
    expect(screen.queryByText('Personas relacionadas')).not.toBeInTheDocument();
    expect(sinPermiso).toHaveLength(0);
  });

  it('no pide nada si el tercero aún no aceptó la invitación', () => {
    permisos.scopes = new Set([SCOPES.documentosLeer]);
    const urls = montar([persona()], vinculo({ invitacionAceptadaEn: null }));

    expect(screen.queryByText('Personas relacionadas')).not.toBeInTheDocument();
    expect(urls).toHaveLength(0);
  });
});

describe('modelo de las personas en el expediente', () => {
  const t = i18n.t.bind(i18n) as TFunction;

  it('dice de quién es el documento, o que nadie cumple el rol todavía', () => {
    const con: PersonaDelRequisitoDto = { rol: 'RepresentanteLegal', todasLasRelaciones: false, sinPersona: false, personaId: 'p1', nombre: 'Juan Pérez' };
    expect(textoDelRequisito(con, t)).toBe('De Juan Pérez · Representante legal');
    expect(textoDelRequisito({ rol: 'Suplente', todasLasRelaciones: false, sinPersona: true }, t)).toContain('el tercero aún no registra a quién cumple este rol (suplente del representante legal)');
    expect(textoDelRequisito(null, t)).toBeNull();
    expect(textoDelRol('Desconocido', t)).toBe('Desconocido');
  });

  it('reúne los documentos de todas las personas para ver sus hechos al revisar', () => {
    expect(documentosDePersonas([persona(), persona({ relacionId: 'r2', documentos: [] })]).map((d) => d.documentoId)).toEqual(['d1']);
    expect(documentosDePersonas(undefined)).toEqual([]);
  });
});
