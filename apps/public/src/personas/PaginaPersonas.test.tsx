import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, type RelacionEntreTercerosDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { PaginaPersonas } from './PaginaPersonas';

const json = (estado: number, cuerpo: unknown) =>
  new Response(estado === 204 ? null : JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': estado >= 400 ? 'application/problem+json' : 'application/json' } });

const documentos = (cedula: Partial<RelacionEntreTercerosDto['documentos'][number]> = {}): RelacionEntreTercerosDto['documentos'] => [
  { tipoCanonico: 'CEDULA', nombre: 'Cédula de ciudadanía', documentoId: null, version: null, estado: null, cargadaEn: null, pedido: false, ...cedula },
  { tipoCanonico: 'PASAPORTE', nombre: 'Pasaporte', documentoId: null, version: null, estado: null, cargadaEn: null, pedido: false },
  { tipoCanonico: 'CERTIFICADO_ANTECEDENTES', nombre: 'Certificado de antecedentes', documentoId: null, version: null, estado: null, cargadaEn: null, pedido: false },
];

function relacion(id: string, tipo: string, nombre: string, cambios: Partial<RelacionEntreTercerosDto> = {}): RelacionEntreTercerosDto {
  return {
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
    documentos: documentos(),
    ...cambios,
  };
}

interface Peticion {
  metodo: string;
  url: string;
  cuerpo: unknown;
}

function montar(relaciones: RelacionEntreTercerosDto[], alMutar: (p: Peticion) => Response = () => json(204, null)) {
  const mutaciones: Peticion[] = [];
  configurarCliente({
    fetch: vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
      const direccion = url instanceof Request ? url.url : url.toString();
      const metodo = init?.method ?? 'GET';
      if (metodo === 'GET') return Promise.resolve(json(200, relaciones));
      const peticion: Peticion = { metodo, url: direccion, cuerpo: typeof init?.body === 'string' ? JSON.parse(init.body) : null };
      mutaciones.push(peticion);
      return Promise.resolve(alMutar(peticion));
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
        <MemoryRouter>
          <PaginaPersonas />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return mutaciones;
}

afterEach(() => {
  reiniciarCliente();
  useDialogoSubir.getState().cerrar();
});

describe('personas relacionadas', () => {
  it('muestra las personas vigentes por rol con sus documentos y lo que una empresa pide', async () => {
    const usuario = userEvent.setup();
    montar([
      relacion('1', 'RepresentanteLegal', 'Juan Pérez', { principal: true, documentos: documentos({ pedido: true }) }),
      relacion('2', 'Socio', 'Ana Gómez', { participacion: '35.5', deFicha: false, cargo: 'Presidente' }),
    ]);

    expect(await screen.findByRole('heading', { level: 2, name: 'Representantes legales' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Socios y accionistas' })).toBeInTheDocument();

    const juan = screen.getByRole('heading', { name: 'Juan Pérez' }).closest('li') as HTMLElement;
    expect(juan).toHaveTextContent('CC 1001 · Representante legal');
    expect(within(juan).getByText('Principal')).toBeInTheDocument();
    expect(juan).toHaveTextContent('Te lo pide una empresa');
    // Lo pedido se destaca (botón relleno) y abre el diálogo de subida de la bóveda de la persona, sin salir de la página.
    await usuario.click(within(juan).getByRole('button', { name: 'Subir: Cédula de ciudadanía' }));
    expect(useDialogoSubir.getState().solicitud).toEqual({ persona: 'persona-1', tipo: 'CEDULA', nombre: 'Cédula de ciudadanía' });
    // La que sale de la información legal se cambia o se quita allí (es el único lugar donde se registra): la tarjeta lleva a la ficha y no ofrece quitarla.
    expect(within(juan).getByText('Se registra en tu información legal: para cambiarla o quitarla, hazlo allí.')).toBeInTheDocument();
    expect(within(juan).getByRole('link', { name: 'Editar en Información legal' })).toHaveAttribute('href', '/ficha/legal');
    expect(within(juan).queryByRole('button', { name: 'Quitar' })).not.toBeInTheDocument();

    const ana = screen.getByRole('heading', { name: 'Ana Gómez' }).closest('li') as HTMLElement;
    expect(ana).toHaveTextContent('35,5 % de participación');
    expect(ana).toHaveTextContent('Cargo: Presidente');
    expect(within(ana).getByRole('button', { name: 'Quitar' })).toBeInTheDocument();
    expect(within(ana).queryByText(/antes de que la información legal fuera el único lugar/)).toBeInTheDocument(); // un socio declarado a mano de antes: se agrega en la ficha
  });

  it('un beneficiario final declarado aquí no lleva el aviso de la ficha, porque la ficha no lo maneja', async () => {
    montar([relacion('2', 'BeneficiarioFinal', 'Beatriz Beneficiaria', { deFicha: false })]);

    const beatriz = (await screen.findByRole('heading', { name: 'Beatriz Beneficiaria' })).closest('li') as HTMLElement;
    expect(within(beatriz).getByRole('button', { name: 'Quitar' })).toBeInTheDocument();
    expect(within(beatriz).queryByText(/información legal/)).not.toBeInTheDocument();
  });

  it('la cabecera y el vacío dicen dónde se registran los representantes, suplentes y socios y llevan a la información legal', async () => {
    montar([]);

    expect(await screen.findByText('Aún no hay personas relacionadas')).toBeInTheDocument();
    expect(screen.getByText(/se registran en Información legal; aquí los ves con sus documentos/)).toBeInTheDocument();
    for (const enlace of screen.getAllByRole('link', { name: 'Ir a Información legal' })) expect(enlace).toHaveAttribute('href', '/ficha/legal');
    expect(screen.getAllByRole('link', { name: 'Ir a Información legal' })).toHaveLength(2); // el de la cabecera y el del estado vacío
  });

  it('muestra el estado del documento ya cargado y ofrece subir otra versión', async () => {
    montar([relacion('1', 'RepresentanteLegal', 'Juan Pérez', { documentos: documentos({ documentoId: 'd1', version: 2, estado: 'Actual', cargadaEn: '2026-11-10T10:00:00Z' }) })]);

    const juan = (await screen.findByRole('heading', { name: 'Juan Pérez' })).closest('li') as HTMLElement;
    expect(juan).toHaveTextContent('Versión 2');
    expect(juan).toHaveTextContent('Vigente');
    expect(within(juan).getByRole('button', { name: 'Subir otra versión: Cédula de ciudadanía' })).toBeInTheDocument();
  });

  it('confirma lo que detectó la IA y dice a quién reemplazaría y que también la agrega a la información legal', async () => {
    const mutaciones = montar([
      relacion('1', 'RepresentanteLegal', 'Juan Pérez', { principal: true }),
      relacion('9', 'RepresentanteLegal', 'María Gómez', {
        estado: 'Propuesta',
        fuente: 'ExtraidaIa',
        deFicha: false,
        principal: true,
        confianza: '0.93',
        reemplaza: { relacionId: '1', nombre: 'Juan Pérez', identificacion: { pais: 'CO', tipo: 'CC', numero: '1001' } },
      }),
    ]);

    const propuesta = await screen.findByRole('group', { name: 'María Gómez' });
    expect(propuesta).toHaveTextContent('María Gómez como representante legal (confianza 93 %)');
    expect(propuesta).toHaveTextContent('Reemplazaría a Juan Pérez.');
    expect(propuesta).toHaveTextContent('al confirmar, también la agregamos a tu información legal');
    expect(screen.queryByRole('heading', { name: 'María Gómez' })).not.toBeInTheDocument(); // todavía no es una persona vigente

    await userEvent.setup().click(within(propuesta).getByRole('button', { name: 'Confirmar cambio' }));
    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]?.metodo).toBe('POST');
    expect(mutaciones[0]?.url).toContain('/public/v1/tercero/relaciones/9/confirmar');
  });

  it('descarta lo que detectó la IA', async () => {
    const mutaciones = montar([relacion('9', 'Suplente', 'Luis Suárez', { estado: 'Propuesta', fuente: 'ExtraidaIa', confianza: 0.8, deFicha: false })]);

    await userEvent.setup().click(within(await screen.findByRole('group', { name: 'Luis Suárez' })).getByRole('button', { name: 'No es correcto' }));
    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]?.metodo).toBe('POST');
    expect(mutaciones[0]?.url).toContain('/relaciones/9/descartar');
  });

  it('quita a una persona que el tercero declaró, después de confirmar', async () => {
    const mutaciones = montar([relacion('2', 'BeneficiarioFinal', 'Ana Gómez', { deFicha: false })]);
    const usuario = userEvent.setup();

    await usuario.click(within((await screen.findByRole('heading', { name: 'Ana Gómez' })).closest('li') as HTMLElement).getByRole('button', { name: 'Quitar' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Quitar a Ana Gómez' });
    expect(dialogo).toHaveTextContent('Sus documentos siguen en su bóveda');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Quitar persona' }));

    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]?.metodo).toBe('DELETE');
    expect(mutaciones[0]?.url).toContain('/public/v1/tercero/relaciones/2');
  });

  it('con un rol de la ficha el diálogo no declara nada: lleva a la información legal con el rol elegido', async () => {
    const mutaciones = montar([]);
    const usuario = userEvent.setup();

    await usuario.click((await screen.findAllByRole('button', { name: 'Agregar persona' }))[0]!);
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar una persona relacionada' });
    // Lo que se declara aquí por omisión es lo que la ficha no maneja.
    expect(within(dialogo).getByRole('combobox', { name: /Cómo se relaciona/ })).toHaveTextContent('Beneficiario final');
    expect(within(dialogo).getByLabelText(/Nombre completo/)).toBeInTheDocument();

    for (const [rol, valor] of [['Representante legal', 'RepresentanteLegal'], ['Suplente del representante legal', 'Suplente'], ['Socio o accionista', 'Socio']] as const) {
      await usuario.click(within(dialogo).getByRole('combobox', { name: /Cómo se relaciona/ }));
      await usuario.click(await screen.findByRole('option', { name: rol }));
      expect(within(dialogo).getByText(/se registra en tu Información legal, que es el único lugar/)).toBeInTheDocument();
      expect(within(dialogo).queryByLabelText(/Nombre completo/)).not.toBeInTheDocument();
      expect(within(dialogo).queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
      expect(within(dialogo).getByRole('link', { name: 'Ir a Información legal' })).toHaveAttribute('href', `/ficha/legal?agregar=${valor}`);
    }

    expect(mutaciones).toHaveLength(0);
  });

  it('declara una persona: valida al intentar y envía el cuerpo de la API', async () => {
    const mutaciones = montar([], (p) => json(201, relacion('7', 'Socio', (p.cuerpo as { nombre: string }).nombre)));
    const usuario = userEvent.setup();

    expect(await screen.findByText('Aún no hay personas relacionadas')).toBeInTheDocument();
    await usuario.click(screen.getAllByRole('button', { name: 'Agregar persona' })[0]!);
    const dialogo = await screen.findByRole('dialog', { name: 'Agregar una persona relacionada' });
    await usuario.click(within(dialogo).getByRole('button', { name: 'Agregar' }));
    expect(within(dialogo).getByText('Escribe el nombre de la persona.')).toBeInTheDocument();
    expect(within(dialogo).getByText('Escribe el número de documento.')).toBeInTheDocument();
    expect(mutaciones).toHaveLength(0);

    await usuario.click(within(dialogo).getByLabelText(/Nombre completo/));
    await usuario.paste('Beatriz Beneficiaria');
    await usuario.click(within(dialogo).getByLabelText(/Número de documento/));
    await usuario.paste('52123456');
    await usuario.click(within(dialogo).getByRole('combobox', { name: /Cómo se relaciona/ }));
    await usuario.click(await screen.findByRole('option', { name: 'Beneficiario final' }));
    await usuario.click(within(dialogo).getByLabelText(/Participación/));
    await usuario.paste('30');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Agregar' }));

    await vi.waitFor(() => expect(mutaciones).toHaveLength(1));
    expect(mutaciones[0]?.metodo).toBe('POST');
    expect(mutaciones[0]?.url).toContain('/public/v1/tercero/relaciones');
    expect(mutaciones[0]).toMatchObject({
      cuerpo: { identificacion: { pais: 'CO', tipo: 'CC', numero: '52123456' }, nombre: 'Beatriz Beneficiaria', tipo: 'BeneficiarioFinal', principal: false, participacion: 30 },
    });
  });
});
