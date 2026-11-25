import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, SCOPES, type EmpresaDto, type FlujoDto, type InvitacionDeTerceroDto, type PaisDto, type TipoVinculoDto } from '@validalo/api-client';
import { useState } from 'react';
import { Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { montarPantalla } from '../../pruebas/montar';
import { DialogoInvitarTercero } from './DialogoInvitarTercero';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

const empresa = (id: string, nombre: string): EmpresaDto => ({
  id,
  tenantId: 't1',
  identificacion: { pais: 'CO', tipo: 'NIT', numero: '800197268', digitoVerificacion: '4' },
  nombre,
  logoUrl: null,
  replyTo: null,
  prefijoFolio: id.toUpperCase(),
  activa: true,
});
const NORTE = empresa('norte', 'Constructora Norte');
const SUR = empresa('sur', 'Constructora Sur');

const PAISES: PaisDto[] = [
  {
    codigo: 'CO',
    nombre: 'Colombia',
    tiposIdentificacion: [
      { pais: 'CO', codigo: 'NIT', nombre: 'Número de Identificación Tributaria', aplicaA: 'Ambas', patron: '^[0-9]{6,15}$', tieneDv: true },
      { pais: 'CO', codigo: 'CC', nombre: 'Cédula de ciudadanía', aplicaA: 'Natural', patron: '^[0-9]{3,10}$', tieneDv: false },
    ],
  },
  { codigo: 'PE', nombre: 'Perú', tiposIdentificacion: [{ pais: 'PE', codigo: 'RUC', nombre: 'Registro Único de Contribuyentes', aplicaA: 'Ambas', patron: '^[0-9]{11}$', tieneDv: false }] },
  {
    codigo: 'PA',
    nombre: 'Panamá',
    tiposIdentificacion: [
      { pais: 'PA', codigo: 'RUC', nombre: 'Registro Único de Contribuyente (DGI)', aplicaA: 'Ambas', patron: '^((PE|PI|E|N)?[0-9]{1,2}(AV)?[0-9]{3,9}|[0-9]{12,20})$', tieneDv: false },
      { pais: 'PA', codigo: 'CIP', nombre: 'Cédula de identidad personal', aplicaA: 'Natural', patron: '^(PE|PI|E|N)?[0-9]{1,2}(AV)?[0-9]{3,9}$', tieneDv: false },
    ],
  },
];

const tipo = (codigo: string, nombre: string, activo = true): TipoVinculoDto => ({ id: codigo, codigo, nombre, atributosPermitidos: [], exigeCuentaDesignada: false, activo });
const TIPOS = [tipo('PROVEEDOR', 'Proveedor'), tipo('CLIENTE', 'Cliente'), tipo('OBSOLETO', 'Tipo obsoleto', false)];

const flujo = (codigo: string, nombre: string, publicada: boolean): FlujoDto =>
  ({
    id: `id-${codigo}`,
    empresaId: 'norte',
    codigo,
    nombre,
    tipoVinculo: { id: 'PROVEEDOR', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
    esPorDefecto: false,
    publicada: publicada ? { version: 1 } : null,
    borrador: null,
    creadoEn: '2026-11-01T15:00:00Z',
    actualizadoEn: '2026-11-01T15:00:00Z',
  }) as unknown as FlujoDto;
const FLUJOS = [flujo('HAB_PROV', 'Habilitación de proveedores', true), flujo('BORRADOR', 'Flujo en borrador', false)];

const RESPUESTA: InvitacionDeTerceroDto = { accion: 'Invitado', terceroId: 't1', vinculoId: 'v1', terceroCreado: true, porAprobar: false, detalle: null };

interface Peticion {
  url: string;
  metodo: string;
  cuerpo: unknown;
  empresa: string | null;
  clave: string | null;
}

function montar(invitar: (cuerpo: unknown) => Response, empresas: EmpresaDto[] = [NORTE], tipos: TipoVinculoDto[] = TIPOS) {
  const peticiones: Peticion[] = [];
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const metodo = init?.method ?? 'GET';
      const cabeceras = new Headers(init?.headers);
      const cuerpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      peticiones.push({ url, metodo, cuerpo, empresa: cabeceras.get('X-Empresa'), clave: cabeceras.get('Idempotency-Key') });
      if (url.startsWith('/api/v1/catalogos/paises')) return Promise.resolve(json(PAISES));
      if (url.startsWith('/api/v1/tipos-vinculo')) return Promise.resolve(json(tipos));
      if (url.startsWith('/api/v1/flujos')) return Promise.resolve(json(FLUJOS));
      if (metodo === 'POST' && url === '/api/v1/invitaciones') return Promise.resolve(invitar(cuerpo));
      return Promise.resolve(json({ status: 404, codigo: 'no-encontrado', detail: 'Sin simular.' }, 404));
    }),
  });

  function Anfitrion() {
    const [abierto, setAbierto] = useState(true);
    return abierto ? <DialogoInvitarTercero empresas={empresas} empresaInicial="norte" onCerrar={() => setAbierto(false)} /> : <p>Diálogo cerrado</p>;
  }
  montarPantalla(
    <Routes>
      <Route path="/e/:empresaId/vinculos" element={<Anfitrion />} />
      <Route path="/e/:empresaId/vinculos/:vinculoId" element={<p>Detalle del vínculo</p>} />
    </Routes>,
    '/e/norte/vinculos',
  );
  return peticiones;
}

async function elegir(usuario: ReturnType<typeof userEvent.setup>, campo: string | RegExp, opcion: string | RegExp) {
  await usuario.click(screen.getByRole('combobox', { name: campo }));
  await usuario.click(await screen.findByRole('option', { name: opcion }));
}

async function llenar(usuario: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('dialog');
  await usuario.type(screen.getByRole('textbox', { name: /Número de identificación/ }), '900123456');
  await usuario.type(screen.getByRole('textbox', { name: /Razón social o nombres/ }), 'Aceros del Norte S.A.S.');
  await usuario.type(screen.getByRole('textbox', { name: /Correo/ }), 'compras@aceros.co');
  await elegir(usuario, /Tipo de vínculo/, 'Proveedor');
}

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
});

describe('«Invitar tercero»: formulario de una invitación a mano', () => {
  it('ofrece los tipos de vínculo configurados (solo los activos) y, del tipo elegido, los flujos publicados', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer, SCOPES.flujosLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201));
    await screen.findByRole('dialog');

    await usuario.click(screen.getByRole('combobox', { name: /Tipo de vínculo/ }));
    const opciones = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opciones).toEqual(['Proveedor', 'Cliente']);
    await usuario.click(screen.getByRole('option', { name: 'Proveedor' }));

    // Los flujos se piden del tipo elegido y solo se ofrecen los publicados.
    await waitFor(() => expect(peticiones.some((p) => p.url.startsWith('/api/v1/flujos') && p.url.includes('tipoVinculo=PROVEEDOR'))).toBe(true));
    await usuario.click(screen.getByRole('combobox', { name: /Flujo/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['Según las reglas de la empresa', 'Habilitación de proveedores']);
  });

  it('envía exactamente lo del formulario a POST /invitaciones con su Idempotency-Key, avisa y abre el vínculo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer, SCOPES.flujosLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201));
    await llenar(usuario);
    await usuario.type(screen.getByRole('textbox', { name: /Nombre comercial/ }), 'Aceros');
    await usuario.type(screen.getByRole('textbox', { name: /Contacto/ }), 'Laura Gómez');
    await usuario.type(screen.getByRole('textbox', { name: /Teléfono/ }), '3001234567');
    await usuario.type(screen.getByRole('textbox', { name: 'DV' }), '8');
    await elegir(usuario, /Flujo/, 'Habilitación de proveedores');

    const invitar = screen.getByRole('button', { name: 'Invitar' });
    await waitFor(() => expect(invitar).toBeEnabled());
    await usuario.click(invitar);

    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    const envio = peticiones.find((p) => p.metodo === 'POST');
    expect(envio).toMatchObject({
      url: '/api/v1/invitaciones',
      empresa: 'norte',
      cuerpo: {
        pais: 'CO',
        tipoIdentificacion: 'NIT',
        numeroIdentificacion: '900123456',
        digitoVerificacion: '8',
        tipoPersona: 'Juridica',
        nombre: 'Aceros del Norte S.A.S.',
        nombreComercial: 'Aceros',
        correo: 'compras@aceros.co',
        tipoVinculo: 'PROVEEDOR',
        flujo: 'HAB_PROV',
        contacto: 'Laura Gómez',
        telefono: '3001234567',
      },
    });
    expect(envio?.clave).toBeTruthy();
    expect(await screen.findByText('Invitación enviada a compras@aceros.co.')).toBeInTheDocument();
  });

  it('el tipo de persona no se elige: se deriva del tipo de identificación, se muestra junto a él como texto y viaja derivado', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201));
    await llenar(usuario);

    // No hay un campo «Tipo de persona»: solo el texto de lo que resulta del tipo de identificación.
    expect(screen.queryByRole('combobox', { name: /Tipo de persona/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Tipo de persona/)).not.toBeInTheDocument();
    expect(screen.getByText('Persona jurídica')).toBeInTheDocument(); // NIT

    await elegir(usuario, /Tipo de identificación/, /CC · Cédula de ciudadanía/);
    expect(screen.getByText('Persona natural')).toBeInTheDocument();
    expect(screen.queryByText('Persona jurídica')).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));
    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({ tipoIdentificacion: 'CC', tipoPersona: 'Natural' });
  });

  it('en el RUC de Panamá el número decide: la cédula es de una persona natural y el RUC largo, de una sociedad', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201));
    await screen.findByRole('dialog');
    await elegir(usuario, /País/, 'Panamá');
    await elegir(usuario, /Tipo de identificación/, /RUC · /);

    // Sin número (o con uno que aún no es válido) no se sabe: se dice que depende del número.
    expect(screen.getByText('Persona natural o jurídica, según el número.')).toBeInTheDocument();
    const numero = screen.getByRole('textbox', { name: /Número de identificación/ });
    await usuario.type(numero, '8-123-456');
    expect(screen.getByText('Persona natural')).toBeInTheDocument();
    await usuario.clear(numero);
    await usuario.type(numero, '155612345-2-2019');
    expect(screen.getByText('Persona jurídica')).toBeInTheDocument();

    await usuario.type(screen.getByRole('textbox', { name: /Razón social o nombres/ }), 'Constructora del Istmo');
    await usuario.type(screen.getByRole('textbox', { name: /Correo/ }), 'compras@istmo.pa');
    await elegir(usuario, /Tipo de vínculo/, 'Proveedor');
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));
    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({ pais: 'PA', tipoIdentificacion: 'RUC', numeroIdentificacion: '155612345-2-2019', tipoPersona: 'Juridica' });
  });

  it('no deja enviar mientras falta algo y dice qué: número, razón social, correo y tipo de vínculo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(() => json(RESPUESTA, 201));
    await screen.findByRole('dialog');

    const invitar = screen.getByRole('button', { name: 'Invitar' });
    expect(invitar).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Escribe el número de identificación.');
    await usuario.type(screen.getByRole('textbox', { name: /Número de identificación/ }), '12AB');
    await usuario.tab();
    expect(await screen.findAllByText('El número no tiene el formato de Número de Identificación Tributaria.')).toHaveLength(2);
    await usuario.type(screen.getByRole('textbox', { name: /Correo/ }), 'sin-arroba');
    await usuario.tab();
    expect(await screen.findByText('Escribe un correo válido, por ejemplo compras@empresa.co.')).toBeInTheDocument();
    expect(invitar).toBeDisabled();
  });

  it('el país decide los tipos de identificación y el DV solo aparece con los tipos que lo tienen', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(() => json(RESPUESTA, 201));
    await screen.findByRole('dialog');

    expect(await screen.findByRole('textbox', { name: 'DV' })).toBeInTheDocument(); // NIT
    await elegir(usuario, /Tipo de identificación/, /CC · Cédula de ciudadanía/);
    expect(screen.queryByRole('textbox', { name: 'DV' })).not.toBeInTheDocument();

    await elegir(usuario, /País/, 'Perú');
    await usuario.click(screen.getByRole('combobox', { name: /Tipo de identificación/ }));
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual(['RUC · Registro Único de Contribuyentes']);
  });

  it('un tercero que ya aceptó se dice sin cerrar, con el enlace a su vínculo; reenviar a un pendiente avisa y abre el vínculo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    let respuesta: InvitacionDeTerceroDto = { ...RESPUESTA, accion: 'SinCambios', terceroCreado: false, detalle: 'El tercero ya aceptó la invitación (vínculo Activo); no se le reenvía.' };
    montar(() => json(respuesta));
    await llenar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('Ese tercero ya aceptó la invitación de Constructora Norte: no se le reenvía nada.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Cualquier cambio quita el aviso; si el vínculo estaba pendiente, se reenvía y se abre.
    respuesta = { ...RESPUESTA, accion: 'Reinvitado', terceroCreado: false };
    await usuario.type(screen.getByRole('textbox', { name: /Contacto/ }), 'Laura');
    expect(screen.queryByText(/ya aceptó/)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));
    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(screen.getByText('Ese tercero ya tenía un vínculo pendiente: reenviamos la invitación a compras@aceros.co.')).toBeInTheDocument();
  });

  it('con un tipo que exige aprobación, dice que la invitación espera a otra persona', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(() => json({ ...RESPUESTA, porAprobar: true }, 201));
    await llenar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('Vínculo creado: la invitación a compras@aceros.co espera la aprobación de otra persona antes de salir.')).toBeInTheDocument();
  });

  it('un vínculo que ya existe y no se puede invitar muestra el mensaje de la API y un enlace al vínculo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(() =>
      json({ status: 409, codigo: 'vinculo-no-invitable', detail: 'La empresa ya tiene ese vínculo y está Bloqueado: no se puede invitar.', vinculoId: 'v9' }, 409),
    );
    await llenar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    const aviso = await screen.findByRole('alert');
    expect(within(aviso).getByText('La empresa ya tiene ese vínculo y está Bloqueado: no se puede invitar.')).toBeInTheDocument();
    await usuario.click(within(aviso).getByRole('button', { name: 'Abrir el vínculo' }));
    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('los errores por campo de la API se ven en su campo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(() =>
      json(
        {
          status: 422,
          codigo: 'digito-verificacion-invalido',
          detail: 'El dígito de verificación no corresponde a NIT 900123456 (esperado 8).',
          errores: [
            { campo: 'digitoVerificacion', codigo: 'digito-verificacion-invalido', mensaje: 'El dígito de verificación no corresponde a NIT 900123456 (esperado 8).' },
            { campo: 'flujo', codigo: 'flujo-invalido', mensaje: 'El flujo «OTRO» no existe en la empresa para PROVEEDOR o no está publicado.' },
          ],
        },
        422,
      ),
    );
    await llenar(usuario);
    await usuario.type(screen.getByRole('textbox', { name: 'DV' }), '3');
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('El dígito de verificación no corresponde a NIT 900123456 (esperado 8).')).toBeInTheDocument();
    expect(screen.getByText('El flujo «OTRO» no existe en la empresa para PROVEEDOR o no está publicado.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('con varias empresas deja elegir desde cuál invitar y manda esa empresa', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201), [NORTE, SUR]);
    await screen.findByRole('dialog');

    await elegir(usuario, /Empresa/, 'Constructora Sur');
    await llenar(usuario);
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST')?.empresa).toBe('sur');
    expect(peticiones.some((p) => p.url.startsWith('/api/v1/tipos-vinculo') && p.empresa === 'sur')).toBe(true);
  });

  it('sin leer la configuración el tipo de vínculo se escribe como código', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201));
    await screen.findByRole('dialog');

    expect(screen.queryByRole('combobox', { name: /Tipo de vínculo/ })).not.toBeInTheDocument();
    await usuario.type(screen.getByRole('textbox', { name: /Código del tipo de vínculo/ }), 'proveedor');
    expect(screen.getByRole('textbox', { name: /Código del tipo de vínculo/ })).toHaveValue('PROVEEDOR');
    await usuario.type(screen.getByRole('textbox', { name: /Número de identificación/ }), '900123456');
    await usuario.type(screen.getByRole('textbox', { name: /Razón social o nombres/ }), 'Aceros');
    await usuario.type(screen.getByRole('textbox', { name: /Correo/ }), 'compras@aceros.co');
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({ tipoVinculo: 'PROVEEDOR' });
    expect(peticiones.some((p) => p.url.startsWith('/api/v1/tipos-vinculo'))).toBe(false);
  });
});

describe('«Invitar tercero»: atributos del vínculo del tipo elegido', () => {
  const CON_ATRIBUTOS: TipoVinculoDto[] = [
    {
      ...tipo('PROVEEDOR', 'Proveedor'),
      atributosPermitidos: [
        { clave: 'nivelRiesgo', tipo: 'Opcion', obligatorio: true, opciones: ['Bajo', 'Medio', 'Alto'] },
        { clave: 'categorias', tipo: 'ListaOpciones', obligatorio: false, opciones: ['Materiales', 'Servicios'] },
        { clave: 'montoEstimado', tipo: 'Numero', obligatorio: false, opciones: null },
        { clave: 'critico', tipo: 'Booleano', obligatorio: false, opciones: null },
      ],
    },
    tipo('CLIENTE', 'Cliente'),
  ];

  async function llenarSinTipo(usuario: ReturnType<typeof userEvent.setup>) {
    await screen.findByRole('dialog');
    await usuario.type(screen.getByRole('textbox', { name: /Número de identificación/ }), '900123456');
    await usuario.type(screen.getByRole('textbox', { name: /Razón social o nombres/ }), 'Aceros del Norte S.A.S.');
    await usuario.type(screen.getByRole('textbox', { name: /Correo/ }), 'compras@aceros.co');
  }

  it('al elegir el tipo muestra los campos de sus atributos (los obligatorios marcados) y no los muestra si el tipo no tiene', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(() => json(RESPUESTA, 201), [NORTE], CON_ATRIBUTOS);
    await llenarSinTipo(usuario);
    expect(screen.queryByText('Atributos del vínculo')).not.toBeInTheDocument();

    await elegir(usuario, /Tipo de vínculo/, 'Proveedor');
    expect(screen.getByText('Atributos del vínculo')).toBeInTheDocument();
    // Las etiquetas son el código del atributo en texto legible, no el código tal cual.
    expect(screen.getByRole('combobox', { name: /Nivel riesgo/ })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Nivel riesgo/ }).closest('.MuiFormControl-root')?.querySelector('.MuiFormLabel-asterisk')).not.toBeNull(); // obligatorio
    expect(screen.getByRole('combobox', { name: 'Critico' }).closest('.MuiFormControl-root')?.querySelector('.MuiFormLabel-asterisk')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Categorias' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Monto estimado' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Critico' })).toBeInTheDocument();
    expect(screen.queryByText('nivelRiesgo')).not.toBeInTheDocument();
    expect(screen.queryByText('montoEstimado')).not.toBeInTheDocument();

    // Con otro tipo sin atributos desaparecen.
    await elegir(usuario, /Tipo de vínculo/, 'Cliente');
    expect(screen.queryByText('Atributos del vínculo')).not.toBeInTheDocument();
  });

  it('con un atributo obligatorio sin valor no deja enviar y dice cuál falta; con él, los envía con el tipo de cada uno', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201), [NORTE], CON_ATRIBUTOS);
    await llenarSinTipo(usuario);
    await elegir(usuario, /Tipo de vínculo/, 'Proveedor');

    const invitar = screen.getByRole('button', { name: 'Invitar' });
    expect(invitar).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Falta el atributo «Nivel riesgo».');

    await elegir(usuario, /Nivel riesgo/, 'Alto');
    await usuario.type(screen.getByRole('textbox', { name: 'Monto estimado' }), '1500000');
    await usuario.click(screen.getByRole('combobox', { name: 'Categorias' }));
    await usuario.click(await screen.findByRole('option', { name: 'Servicios' }));
    await usuario.keyboard('{Escape}');
    await elegir(usuario, 'Critico', 'Sí');
    await waitFor(() => expect(invitar).toBeEnabled());
    await usuario.click(invitar);

    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST')?.cuerpo).toMatchObject({
      tipoVinculo: 'PROVEEDOR',
      atributos: { nivelRiesgo: 'Alto', montoEstimado: 1500000, categorias: ['Servicios'], critico: true },
    });
  });

  it('un tipo sin atributos no manda ninguno y un valor inválido de un número avisa en su campo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    const peticiones = montar(() => json(RESPUESTA, 201), [NORTE], CON_ATRIBUTOS);
    await llenarSinTipo(usuario);
    await elegir(usuario, /Tipo de vínculo/, 'Proveedor');
    await elegir(usuario, /Nivel riesgo/, 'Bajo');
    await usuario.type(screen.getByRole('textbox', { name: 'Monto estimado' }), '12,5');
    expect(await screen.findAllByText('Escribe un número, con punto decimal.')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Invitar' })).toBeDisabled();

    // Quitar el atributo y cambiar a un tipo sin atributos: el cuerpo es el de siempre.
    await elegir(usuario, /Tipo de vínculo/, 'Cliente');
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));
    expect(await screen.findByText('Detalle del vínculo')).toBeInTheDocument();
    expect(peticiones.find((p) => p.metodo === 'POST')?.cuerpo).not.toHaveProperty('atributos');
  });

  it('lo que la API dice de un atributo (atributos.{clave}) se ve en su campo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosEscribir, SCOPES.configuracionLeer]);
    const usuario = userEvent.setup();
    montar(
      () =>
        json(
          {
            status: 422,
            codigo: 'atributo-no-permitido',
            detail: 'x',
            errores: [{ campo: 'atributos.nivelRiesgo', codigo: 'atributo-invalido', mensaje: 'El valor del atributo «nivelRiesgo» no es válido: escribe una de estas opciones: Bajo, Medio, Alto.' }],
          },
          422,
        ),
      [NORTE],
      CON_ATRIBUTOS,
    );
    await llenarSinTipo(usuario);
    await elegir(usuario, /Tipo de vínculo/, 'Proveedor');
    await elegir(usuario, /Nivel riesgo/, 'Medio');
    await usuario.click(screen.getByRole('button', { name: 'Invitar' }));

    expect(await screen.findByText('El valor del atributo «nivelRiesgo» no es válido: escribe una de estas opciones: Bajo, Medio, Alto.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
