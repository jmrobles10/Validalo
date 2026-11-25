import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, SCOPES, type AtributoPermitidoDto, type TipoVinculoDto, type VinculoDto } from '@validalo/api-client';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarPantalla } from '../../../pruebas/montar';
import { AtributosDelVinculo } from './AtributosDelVinculo';
import { DialogoEditarAtributos } from './DialogoEditarAtributos';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const ATRIBUTOS: AtributoPermitidoDto[] = [
  { clave: 'nivelRiesgo', tipo: 'Opcion', obligatorio: true, opciones: ['Bajo', 'Medio', 'Alto'] },
  { clave: 'categorias', tipo: 'ListaOpciones', obligatorio: false, opciones: ['Materiales', 'Servicios', 'Equipos'] },
  { clave: 'montoEstimado', tipo: 'Numero', obligatorio: false, opciones: null },
  { clave: 'vigencia', tipo: 'Fecha', obligatorio: false, opciones: null },
  { clave: 'critico', tipo: 'Booleano', obligatorio: false, opciones: null },
  { clave: 'nota', tipo: 'Texto', obligatorio: false, opciones: null },
];

const tipo = (atributosPermitidos: AtributoPermitidoDto[] = ATRIBUTOS): TipoVinculoDto => ({
  id: 'tipo-proveedor',
  codigo: 'PROVEEDOR',
  nombre: 'Proveedor',
  atributosPermitidos,
  exigeCuentaDesignada: false,
  activo: true,
});

const vinculo = (atributos: Record<string, unknown> = {}, estado = 'Activo'): VinculoDto =>
  ({
    id: 'v1',
    empresaId: 'norte',
    terceroId: 't1',
    tipoVinculo: { id: 'tipo-proveedor', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
    estado,
    atributos,
    version: 5,
  }) as unknown as VinculoDto;

interface Peticion {
  url: string;
  metodo: string;
  cuerpo: unknown;
  empresa: string | null;
  ifMatch: string | null;
}

function simular(patch: (cuerpo: unknown) => Response = () => json(vinculo())) {
  const peticiones: Peticion[] = [];
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const metodo = init?.method ?? 'GET';
      const cabeceras = new Headers(init?.headers);
      const cuerpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      peticiones.push({ url, metodo, cuerpo, empresa: cabeceras.get('X-Empresa'), ifMatch: cabeceras.get('If-Match') });
      if (url.startsWith('/api/v1/tipos-vinculo')) return Promise.resolve(json([tipo(tiposDelServidor)]));
      if (metodo === 'PATCH' && url === '/api/v1/vinculos/v1/atributos') return Promise.resolve(patch(cuerpo));
      return Promise.resolve(json({ status: 404, codigo: 'no-encontrado', detail: 'Sin simular.' }, 404));
    }),
  });
  return peticiones;
}

let tiposDelServidor: AtributoPermitidoDto[] = ATRIBUTOS;

function Anfitrion({ actual }: { actual: VinculoDto }) {
  const [abierto, setAbierto] = useState(true);
  return abierto ? <DialogoEditarAtributos vinculo={actual} tipo={tipo()} empresaId="norte" onCerrar={() => setAbierto(false)} /> : <p>Diálogo cerrado</p>;
}

async function elegir(usuario: ReturnType<typeof userEvent.setup>, campo: string | RegExp, opcion: string | RegExp) {
  await usuario.click(screen.getByRole('combobox', { name: campo }));
  await usuario.click(await screen.findByRole('option', { name: opcion }));
}

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
  tiposDelServidor = ATRIBUTOS;
});

describe('«Editar atributos» del vínculo', () => {
  it('genera un control por atributo con los valores del vínculo y marca los obligatorios', () => {
    simular();
    montarPantalla(<Anfitrion actual={vinculo({ nivelRiesgo: 'Alto', categorias: ['Servicios'], montoEstimado: 1500000, critico: false, nota: 'Revisar' })} />);

    const dialogo = screen.getByRole('dialog', { name: /Editar atributos del vínculo/ });
    // Las etiquetas son el código del atributo en texto legible («nivelRiesgo» → «Nivel riesgo»).
    expect(within(dialogo).getByRole('combobox', { name: /Nivel riesgo/ })).toHaveTextContent('Alto');
    // Solo el obligatorio lleva asterisco.
    expect(dialogo.querySelectorAll('.MuiFormLabel-asterisk')).toHaveLength(1);
    expect(within(dialogo).getByRole('combobox', { name: /Nivel riesgo/ }).closest('.MuiFormControl-root')?.querySelector('.MuiFormLabel-asterisk')).not.toBeNull();
    expect(within(dialogo).getByText('Servicios')).toBeInTheDocument(); // el chip de la lista de opciones
    expect(within(dialogo).getByRole('textbox', { name: 'Monto estimado' })).toHaveValue('1500000');
    // La fecha es el selector por secciones (dd/mm/aaaa), no un input de fecha del navegador.
    expect(within(within(dialogo).getByRole('group', { name: 'Vigencia' })).getByRole('spinbutton', { name: 'Día' })).toBeInTheDocument();
    expect(dialogo.querySelector('input[type="date"]')).toBeNull();
    expect(within(dialogo).getByRole('combobox', { name: 'Critico' })).toHaveTextContent('No');
    expect(within(dialogo).getByRole('textbox', { name: 'Nota' })).toHaveValue('Revisar');
    // Nada cambiado, nada que guardar.
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  });

  it('guarda con PATCH el conjunto completo (con If-Match de la versión leída), avisa y cierra; lo vaciado se quita', async () => {
    const usuario = userEvent.setup();
    const peticiones = simular();
    montarPantalla(<Anfitrion actual={vinculo({ nivelRiesgo: 'Alto', montoEstimado: 1500000, nota: 'Revisar', desconocido: 'x' })} />);

    await usuario.clear(screen.getByRole('textbox', { name: 'Monto estimado' }));
    await usuario.type(screen.getByRole('textbox', { name: 'Monto estimado' }), '2000000.5');
    await usuario.clear(screen.getByRole('textbox', { name: 'Nota' }));
    await elegir(usuario, 'Critico', 'Sí');
    await usuario.click(screen.getByRole('combobox', { name: 'Categorias' }));
    await usuario.click(await screen.findByRole('option', { name: 'Equipos' }));
    await usuario.keyboard('{Escape}');
    await usuario.click(within(screen.getByRole('group', { name: 'Vigencia' })).getByRole('spinbutton', { name: 'Día' }));
    await usuario.keyboard('31122026');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Diálogo cerrado')).toBeInTheDocument();
    expect(screen.getByText('Atributos actualizados.')).toBeInTheDocument();
    const envio = peticiones.find((p) => p.metodo === 'PATCH');
    expect(envio).toMatchObject({ url: '/api/v1/vinculos/v1/atributos', empresa: 'norte', ifMatch: '"5"' });
    // Sin la nota (vaciada) ni el atributo que el tipo ya no admite; cada valor con el tipo de su atributo.
    expect(envio?.cuerpo).toEqual({
      atributos: { nivelRiesgo: 'Alto', categorias: ['Equipos'], montoEstimado: 2000000.5, vigencia: '2026-12-31', critico: true },
    });
  });

  it('un obligatorio sin valor o un número con coma no se guardan y lo dicen en su campo', async () => {
    const usuario = userEvent.setup();
    const peticiones = simular();
    montarPantalla(<Anfitrion actual={vinculo()} />);

    await usuario.type(screen.getByRole('textbox', { name: 'Monto estimado' }), '12,5');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Este atributo es obligatorio.')).toBeInTheDocument();
    expect(screen.getByText('Escribe un número, con punto decimal.')).toBeInTheDocument();
    expect(peticiones.some((p) => p.metodo === 'PATCH')).toBe(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('si la API rechaza el cambio lo muestra y deja el formulario abierto', async () => {
    const usuario = userEvent.setup();
    simular(() => json({ status: 422, codigo: 'atributo-invalido', detail: 'El valor del atributo «nivelRiesgo» no es un opcion válido.' }, 422));
    montarPantalla(<Anfitrion actual={vinculo({ nivelRiesgo: 'Alto' })} />);

    await usuario.type(screen.getByRole('textbox', { name: 'Nota' }), 'Hola');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeEnabled();
  });
});

describe('Atributos en el detalle del vínculo', () => {
  const montar = (actual: VinculoDto) => montarPantalla(<AtributosDelVinculo vinculo={actual} empresaId="norte" />);

  it('con permiso y un tipo con atributos muestra los valores y «Editar atributos», que abre el formulario', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    simular();
    montar(vinculo({ nivelRiesgo: 'Alto', montoEstimado: 1500000, categorias: ['Servicios', 'Equipos'] }));

    expect(screen.getByText('nivelRiesgo: Alto')).toBeInTheDocument();
    expect(screen.getByText('categorias: Servicios, Equipos')).toBeInTheDocument();
    await usuario.click(await screen.findByRole('button', { name: 'Editar atributos' }));
    expect(await screen.findByRole('dialog', { name: /Editar atributos del vínculo/ })).toBeInTheDocument();
  });

  it('sin atributos permitidos en el tipo, sin permiso de escribir o con el vínculo terminado no ofrece el botón', async () => {
    simular();
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    tiposDelServidor = [];
    const sinAtributos = montar(vinculo());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Editar atributos' })).not.toBeInTheDocument());
    expect(screen.queryByText('Atributos')).not.toBeInTheDocument(); // ni valores ni qué editar: no ocupa lugar
    sinAtributos.unmount();

    tiposDelServidor = ATRIBUTOS;
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.configuracionLeer]);
    const soloLectura = montar(vinculo({ nivelRiesgo: 'Alto' }));
    expect(screen.getByText('nivelRiesgo: Alto')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar atributos' })).not.toBeInTheDocument();
    soloLectura.unmount();

    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    montar(vinculo({ nivelRiesgo: 'Alto' }, 'Anulado'));
    expect(screen.getByText('nivelRiesgo: Alto')).toBeInTheDocument();
    await new Promise((resolver) => setTimeout(resolver, 50));
    expect(screen.queryByRole('button', { name: 'Editar atributos' })).not.toBeInTheDocument();
  });
});
