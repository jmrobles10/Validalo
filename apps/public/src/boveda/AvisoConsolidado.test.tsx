import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentoBovedaDto, VigenciaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { AvisoConsolidado } from './AvisoConsolidado';
import { useDialogoSubir } from './useDialogoSubir';

const vigencia = (estado: string, vigenteHasta: string, finDeGracia: string | null = null): VigenciaDto => ({
  vigenteHasta,
  base: 'FechaExpedicion',
  estado,
  diasAviso: [30],
  diasGracia: 15,
  finDeGracia,
  vencidaEn: null,
});

const documento = (id: string, nombre: string, empresas: [string, VigenciaDto][]): DocumentoBovedaDto => ({
  id,
  tipo: { codigo: id.toUpperCase(), nombre, tipoDocumentoTenantId: null },
  ambito: 'Global',
  clase: 'Archivo',
  vinculoId: null,
  versionActual: null,
  versiones: 1,
  porEmpresa: empresas.map(([empresa, v]) => ({
    vinculoId: `v-${empresa}`,
    empresa: { id: `e-${empresa}`, nombre: empresa, logoUrl: null },
    compartido: true,
    version: 1,
    versionActualCompartida: true,
    compartidaEn: '2026-10-01T12:00:00Z',
    vigencia: v,
  })),
});

function montar(documentos: DocumentoBovedaDto[]) {
  return render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <MemoryRouter>
        <AvisoConsolidado documentos={documentos} />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => useDialogoSubir.getState().cerrar());

describe('bloque «Por renovar» de la bóveda', () => {
  it('lista primero lo que vence antes, con qué empresas queda al día y la acción para subir la versión nueva', async () => {
    const usuario = userEvent.setup();
    montar([
      documento('camara', 'Cámara de comercio', [
        ['Constructora Norte', vigencia('PorVencer', '2026-11-30')],
        ['Constructora Sur', vigencia('Vigente', '2026-12-30')],
      ]),
      documento('rut', 'Registro Único Tributario', [['Constructora Norte', vigencia('EnGracia', '2026-11-01', '2026-11-16')]]),
      documento('cedula', 'Cédula', [['Constructora Norte', vigencia('Vigente', '2027-06-01')]]),
    ]);

    const bloque = screen.getByRole('region', { name: 'Por renovar' });
    const [primera, segunda, ...resto] = within(bloque).getAllByRole('listitem');
    expect(resto).toHaveLength(0);
    if (!primera || !segunda) throw new Error('Faltan líneas');
    const lineas = [primera, segunda] as const;
    expect(lineas[0]).toHaveTextContent('Registro Único Tributario: está en el periodo de gracia con Constructora Norte hasta el 16/11/2026.');
    expect(lineas[0]).toHaveTextContent('En periodo de gracia');
    expect(lineas[1]).toHaveTextContent(
      'Cámara de comercio: vence para Constructora Norte el 30/11/2026 y para Constructora Sur el 30/12/2026. Renueva antes del 30/11 y quedas al día con las dos.',
    );
    // «Subir versión nueva» abre el diálogo de subida con ese documento: no navega.
    await usuario.click(within(lineas[1]).getByRole('button', { name: 'Subir versión nueva: Cámara de comercio' }));
    expect(useDialogoSubir.getState().solicitud).toEqual({ documento: 'camara', tipo: 'CAMARA' });
    expect(screen.queryByText(/Cédula/)).not.toBeInTheDocument();
  });

  it('no se muestra si no hay nada que renovar', () => {
    const { container } = montar([documento('rut', 'Registro Único Tributario', [['Constructora Norte', vigencia('Vigente', '2027-06-01')]])]);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('con muchas empresas la línea se resume y «Ver empresas» abre la fecha de cada una', async () => {
    const usuario = userEvent.setup();
    const muchas: [string, VigenciaDto][] = Array.from({ length: 25 }, (_, i) => [
      `Empresa ${String(i + 1).padStart(2, '0')}`,
      i < 3 ? vigencia('PorVencer', `2026-11-${String(20 + i)}`) : vigencia('Vigente', '2027-06-01'),
    ]);
    montar([documento('camara', 'Cámara de comercio', muchas)]);

    const bloque = screen.getByRole('region', { name: 'Por renovar' });
    // Una sola línea corta: ni las 25 empresas en una frase ni una lista de chips.
    expect(within(bloque).getAllByRole('listitem')).toHaveLength(1);
    expect(bloque).toHaveTextContent('Cámara de comercio: vence el 20/11/2026 para 3 empresas (la primera, Empresa 01).');
    expect(bloque).not.toHaveTextContent('Empresa 25');
    expect(within(bloque).getByRole('button', { name: 'Subir versión nueva: Cámara de comercio' })).toBeInTheDocument();

    const ver = within(bloque).getByRole('button', { name: 'Ver empresas: Cámara de comercio' });
    expect(ver).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(ver);

    expect(within(bloque).getByRole('button', { name: 'Ocultar empresas: Cámara de comercio' })).toHaveAttribute('aria-expanded', 'true');
    const detalle = within(bloque).getByRole('region', { name: 'Con tus empresas' });
    const filas = within(detalle).getAllByRole('listitem');
    expect(filas).toHaveLength(25);
    expect(filas[0]).toHaveTextContent('Empresa 01 · Vence el 20/11/2026');
    expect(filas[24]).toHaveTextContent('Empresa 25 · Vence el 01/06/2027');
    expect(bloque).toHaveTextContent('Renueva antes del 20/11 y quedas al día con todas.');

    // Con tantas empresas, un buscador por nombre.
    await usuario.type(within(bloque).getByRole('searchbox', { name: 'Buscar empresa' }), 'empresa 07');
    expect(within(within(bloque).getByRole('region', { name: 'Con tus empresas' })).getAllByRole('listitem')).toHaveLength(1);

    await usuario.click(within(bloque).getByRole('button', { name: 'Ocultar empresas: Cámara de comercio' }));
    expect(within(bloque).queryByRole('region', { name: 'Con tus empresas' })).not.toBeInTheDocument();
  });

  it('con una sola empresa no hay «Ver empresas»', () => {
    montar([documento('rut', 'Registro Único Tributario', [['Constructora Norte', vigencia('PorVencer', '2026-11-30')]])]);

    expect(screen.queryByRole('button', { name: /Ver empresas/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Por renovar' })).toHaveTextContent('vence para Constructora Norte el 30/11/2026.');
  });

  it('con más de cuatro líneas muestra las cuatro primeras y «Ver N más»', async () => {
    const usuario = userEvent.setup();
    montar(
      Array.from({ length: 7 }, (_, i) =>
        documento(`d${String(i + 1)}`, `Documento ${String(i + 1)}`, [['Constructora Norte', vigencia('PorVencer', `2026-11-${String(10 + i)}`)]]),
      ),
    );

    const bloque = screen.getByRole('region', { name: 'Por renovar' });
    expect(within(bloque).getAllByRole('listitem').map((l) => /Documento \d/.exec(l.textContent)?.[0])).toEqual(['Documento 1', 'Documento 2', 'Documento 3', 'Documento 4']);
    const mas = within(bloque).getByRole('button', { name: 'Ver 3 más' });
    expect(mas).toHaveAttribute('aria-expanded', 'false');

    await usuario.click(mas);
    expect(within(bloque).getAllByRole('listitem')).toHaveLength(7);
    await usuario.click(within(bloque).getByRole('button', { name: 'Ver menos' }));
    expect(within(bloque).getAllByRole('listitem')).toHaveLength(4);
  });

  it('con cuatro líneas no pide «Ver más»', () => {
    montar(Array.from({ length: 4 }, (_, i) => documento(`d${String(i + 1)}`, `Documento ${String(i + 1)}`, [['Constructora Norte', vigencia('PorVencer', `2026-11-${String(10 + i)}`)]])));

    expect(within(screen.getByRole('region', { name: 'Por renovar' })).getAllByRole('listitem')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: /Ver .* más/ })).not.toBeInTheDocument();
  });
});
