import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, SCOPES, type FichaTerceroDto, type SeccionFichaDto, type VinculoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaginaFichaTercero } from '../PaginaFichaTercero';
import { CERTIFICADO, CUENTA, DOCUMENTO } from '../pruebas/datos';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../empresas/useEmpresas', () => ({
  useEmpresaActiva: () => ({ empresa: { id: 'emp', nombre: 'Constructora Norte' }, empresas: [{ id: 'emp', nombre: 'Constructora Norte' }] }),
}));
vi.mock('../../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const VINCULO = {
  id: 'v1',
  empresaId: 'emp',
  terceroId: 't1',
  tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
  flujoId: null,
  estado: 'Activo',
  atributos: {},
  correoTercero: 'compras@tornillo.co',
  invitacion: null,
  invitacionAceptadaEn: '2026-09-01T15:00:00Z',
  requisitosCubribles: null,
  bloqueo: null,
  referencias: [],
  origen: 'Invitacion',
  creadoEn: '2026-08-01T15:00:00Z',
  actualizadoEn: '2026-10-01T15:00:00Z',
  version: 3,
} satisfies VinculoDto;

function seccion(cambios: Partial<SeccionFichaDto>): SeccionFichaDto {
  return { seccion: 'FICHA_GENERAL', nombre: 'Información general', periodo: null, version: 2, datos: {}, soportes: [], completitud: { completa: true, faltantes: [], reglaVersion: 1 }, huella: 'h', origen: 'Tercero', fecha: '2026-11-02T15:00:00Z', versiones: 2, esquemaVersion: 1, ...cambios };
}

const SECCIONES: SeccionFichaDto[] = [
  seccion({
    datos: { razon_social: 'Ferretería El Tornillo S.A.S.', tipo_persona: 'Juridica', pais: 'CO', certificado_iso: true, anio_inicio: 2004, direccion_estructurada: { tipo_via: 'Calle', numero_via: '45' } },
    // d1 es el RUT compartido con el vínculo; d9 no lo puede ver la empresa.
    soportes: [{ documentoId: 'd1', version: 2, tipoDocumento: 'RUT' }, { documentoId: 'd9', version: 1, tipoDocumento: 'SOPORTE_FICHA' }],
  }),
  seccion({
    seccion: 'FICHA_LEGAL',
    nombre: 'Información legal',
    version: 1,
    datos: { personas: [{ rol: 'RepresentanteLegal', tipo_identificacion: 'CC', numero: '1020304050', nombres: 'Ana', apellidos: 'Gómez', porcentaje: 12.5, pep: false }] },
    completitud: { completa: false, faltantes: [{ campo: null, regla: 'socio-requerido', mensaje: 'Registra al menos un socio o accionista.' }], reglaVersion: 1 },
  }),
  seccion({ seccion: 'FICHA_FINANCIERA', nombre: 'Información financiera', periodo: 2025, datos: { periodo: 2025, fecha_corte: '2025-12-31', activos: 1500000.5, moneda_extranjera: { realiza: true, tipos: ['Importaciones'], paises: ['US'] } } }),
];

function montar(ficha: FichaTerceroDto) {
  configurarCliente({ fetch: vi.fn(() => Promise.resolve(new Response(JSON.stringify(ficha), { status: 200, headers: { 'Content-Type': 'application/json' } }))) });
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={['/e/emp/terceros/t1']}>
          <Routes>
            <Route path="/e/:empresaId/terceros/:terceroId" element={<PaginaFichaTercero />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

function ficha(secciones: SeccionFichaDto[] | null): FichaTerceroDto {
  return {
    tercero: {
      id: 't1',
      identificacion: { pais: 'CO', tipo: 'NIT', numero: '900123456', digitoVerificacion: '8' },
      tipoPersona: 'Juridica',
      nombre: 'Ferretería El Tornillo',
      nombreComercial: null,
      contactos: [],
      esExtranjero: false,
      creadoEn: '2026-08-01T15:00:00Z',
    },
    vinculos: [{ vinculo: VINCULO, certificado: CERTIFICADO, cuentaDesignada: CUENTA, documentos: [DOCUMENTO] }],
    otrasEmpresasDelGrupo: [],
    secciones,
  };
}

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
});

describe('Tercero 360: información del tercero', () => {
  it('muestra una tarjeta por sección con estado, versión, datos legibles y soportes', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer, SCOPES.documentosLeer, SCOPES.documentosDescargar]);
    montar(ficha(SECCIONES));

    const bloque = await screen.findByRole('region', { name: 'Información del tercero' });
    const general = within(bloque).getByRole('region', { name: 'Información general' });
    expect(general).toHaveTextContent('Completa');
    expect(general).toHaveTextContent('Versión 2 · 02/11/2026');
    expect(general).toHaveTextContent('Razón socialFerretería El Tornillo S.A.S.');
    expect(general).toHaveTextContent('Tipo de personaPersona jurídica');
    expect(general).toHaveTextContent('Certificado ISOSí');
    expect(general).toHaveTextContent('Año de inicio2004');
    expect(within(general).getByRole('region', { name: 'Dirección por partes' })).toHaveTextContent('Tipo de víaCalle');
    // El RUT del vínculo se abre en el visor con «Ver»; el otro soporte no lo puede ver la empresa y la fila dice por qué.
    expect(within(general).getByRole('button', { name: 'Ver RUT, versión 2' })).toHaveTextContent('Ver');
    const noCompartido = within(general).getByText('Soporte del tercero · versión 1').closest('li');
    expect(noCompartido).toHaveTextContent('El tercero no lo compartió con Constructora Norte, por eso no se puede abrir aquí.');
    expect(within(noCompartido as HTMLElement).queryByRole('button')).not.toBeInTheDocument();

    const legal = within(bloque).getByRole('region', { name: 'Información legal' });
    expect(legal).toHaveTextContent('Falta 1 dato');
    expect(legal).toHaveTextContent('Registra al menos un socio o accionista.');
    const persona = within(legal).getByRole('listitem', { name: 'Ana Gómez · Representante legal' });
    expect(persona).toHaveTextContent('Participación12,5 %');
    expect(persona).toHaveTextContent('PEPNo');
    expect(legal).toHaveTextContent('Sin soporte.');

    const financiera = within(bloque).getByRole('region', { name: 'Información financiera · 2025' });
    expect(financiera).toHaveTextContent('Fecha de corte31/12/2025');
    expect(financiera.textContent).toMatch(/Activos\$\s?1\.500\.000,5/);
    expect(within(financiera).getByRole('region', { name: 'Moneda extranjera' })).toHaveTextContent('Tipos de operaciónImportaciones');
    expect(within(financiera).getByRole('region', { name: 'Moneda extranjera' })).toHaveTextContent('Estados Unidos (US)');
  });

  it('dice qué versión aceptó la empresa activa por vínculo y si hay una nueva pendiente, con enlace a su revalidación (F2)', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer]);
    montar(
      ficha([
        seccion({
          version: 3,
          aceptaciones: [
            {
              vinculoId: 'v1',
              versionAceptada: 2,
              aceptadaEn: '2026-10-05T15:00:00Z',
              expedienteId: 'x1',
              folio: 'VS-E-2026-000001',
              versionNuevaPendiente: true,
              revalidacion: { expedienteId: 'x2', folio: 'VS-E-2026-000007', estado: 'EnRevision', version: 3, plazoHasta: '2026-11-24T15:00:00Z' },
            },
          ],
        }),
        seccion({ seccion: 'FICHA_SST', nombre: 'Seguridad y salud en el trabajo', aceptaciones: [{ vinculoId: 'v1', versionAceptada: null, aceptadaEn: null, expedienteId: null, folio: null, versionNuevaPendiente: false, revalidacion: null }] }),
      ]),
    );

    const general = await screen.findByRole('region', { name: 'Información general' });
    const validacion = within(general).getByRole('region', { name: 'Validación de la empresa' });
    // La frase dice quién (la empresa activa, no el tipo de vínculo) y qué: aceptó la versión 2, pero hay otra pendiente.
    expect(validacion).toHaveTextContent('Constructora Norte aceptó la versión 2 el 05/10/2026.');
    expect(validacion).not.toHaveTextContent('Proveedor');
    expect(within(validacion).getByRole('link', { name: 'Ver el expediente VS-E-2026-000001' })).toHaveAttribute('href', '/e/emp/expedientes/x1');
    expect(validacion).toHaveTextContent('Versión nueva pendiente de revisión');
    const revalidacion = within(validacion).getByRole('link', { name: 'Ver la revalidación VS-E-2026-000007' });
    expect(revalidacion).toHaveAttribute('href', '/e/emp/expedientes/x2');
    expect(revalidacion).toHaveTextContent('Revalidación VS-E-2026-000007: versión 3, plazo hasta el 24/11/2026');

    const sst = screen.getByRole('region', { name: 'Seguridad y salud en el trabajo' });
    expect(within(sst).getByRole('region', { name: 'Validación de la empresa' })).toHaveTextContent(
      'Constructora Norte aún no acepta esta versión: no hay un expediente en curso que la pida.',
    );
    expect(sst).not.toHaveTextContent('Versión nueva pendiente de revisión');
  });

  it('sin secciones diligenciadas lo dice', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer]);
    montar(ficha([]));
    expect(await screen.findByText('El tercero aún no ha diligenciado su información.')).toBeInTheDocument();
  });
});

describe('Tercero 360: lo que declaró el tercero, todo y en orden', () => {
  const PERSONA = { tipo_identificacion: 'CC', numero: '1073250322', nombres: 'JOEL MATEO', apellidos: 'ROBLES ATUESTA' };
  const LEGAL = seccion({
    seccion: 'FICHA_LEGAL',
    nombre: 'Información legal',
    version: 1,
    datos: {
      personas: [
        { ...PERSONA, rol: 'RepresentanteLegal', tipo_representacion: 'Principal', cargo: 'Gerente', pep: false, vinculo_pep: true, correo: 'joel@atlas.co', telefono: '3001112233', nacionalidad: 'CO', fecha_expedicion: '2010-03-04' },
        { ...PERSONA, rol: 'Socio', porcentaje: 100, pep: false, vinculo_pep: true },
        { tipo_identificacion: 'CC', numero: '52111222', nombres: 'Ana', apellidos: 'Gómez', rol: 'Suplente' },
      ],
    },
    completitud: {
      completa: false,
      faltantes: [
        { campo: 'personas[2].pep', regla: null, mensaje: 'Falta PEP' },
        { campo: 'personas[2].vinculo_pep', regla: null, mensaje: 'Falta vínculo PEP' },
      ],
      reglaVersion: 1,
    },
  });

  async function legal() {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer, SCOPES.documentosLeer]);
    montar(ficha([LEGAL]));
    return within(await screen.findByRole('region', { name: 'Información legal' }));
  }

  it('una persona, una tarjeta: el representante que también es socio son dos filas pero una sola tarjeta con sus dos roles', async () => {
    const tarjeta = await legal();
    expect(tarjeta.getAllByRole('listitem', { name: /JOEL MATEO ROBLES ATUESTA|Ana Gómez/ })).toHaveLength(2);
    const joel = tarjeta.getByRole('listitem', { name: 'JOEL MATEO ROBLES ATUESTA · Representante legal · Socio o accionista' });
    expect(joel).toHaveTextContent('CC 1073250322');
    expect(within(joel).getByText('Representante legal')).toBeInTheDocument();
    expect(within(joel).getByText('Socio o accionista')).toBeInTheDocument();
    expect(tarjeta.getByText('2 personas')).toBeInTheDocument();
  });

  it('muestra TODO lo llenado en el orden del formulario; con dos roles rotula lo propio de cada uno', async () => {
    const tarjeta = await legal();
    const joel = tarjeta.getByRole('listitem', { name: /JOEL MATEO/ });
    const etiquetas = within(joel).getAllByRole('term').map((t) => t.textContent);
    expect(etiquetas).toEqual([
      'Tipo de representación · Representante legal',
      'Participación · Socio o accionista',
      'Cargo · Representante legal',
      'PEP',
      'Vínculo con PEP',
      'Expedición del documento',
      'Nacionalidad',
      'Correo electrónico',
      'Teléfono',
    ]);
    expect(joel).toHaveTextContent('Participación · Socio o accionista100 %');
    expect(joel).toHaveTextContent('Expedición del documento04/03/2010');
    expect(joel).toHaveTextContent('Correo electrónicojoel@atlas.co');
    // «No» en PEP es un dato normal; «Sí» en el vínculo con PEP se destaca como estado de advertencia.
    expect(joel).toHaveTextContent('PEPNo');
    expect(joel.querySelector('[data-estado="Observado"]')).toHaveTextContent('Sí');
  });

  it('lo obligatorio que falta (según la API) dice «Sin dato»; con un solo rol las etiquetas no llevan el rol', async () => {
    const tarjeta = await legal();
    const ana = tarjeta.getByRole('listitem', { name: 'Ana Gómez · Suplente' });
    expect(within(ana).getAllByRole('term').map((t) => t.textContent)).toEqual(['PEP', 'Vínculo con PEP']);
    expect(within(ana).getAllByText('Sin dato')).toHaveLength(2);
  });

  it('si la sección solo tiene personas no repite el título «Datos»', async () => {
    const tarjeta = await legal();
    expect(tarjeta.queryByRole('region', { name: 'Datos' })).not.toBeInTheDocument();
    expect(tarjeta.getByRole('region', { name: 'Personas relacionadas' })).toBeInTheDocument();
  });

  it('en las demás secciones los datos salen en el orden del esquema (no el de la base de datos) y lo obligatorio vacío dice «Sin dato»', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer, SCOPES.documentosLeer]);
    // Así los entrega jsonb: por largo de la clave y luego alfabético.
    montar(
      ficha([
        seccion({
          datos: { pais: 'CO', correo: 'a@b.co', ciudad: '11001', telefono: '3001112233', direccion: 'Calle 1', razon_social: 'Atlas S.A.S.', anio_inicio: 2004 },
          completitud: {
            completa: false,
            faltantes: [
              { campo: 'ciiu_principal', regla: null, mensaje: 'Falta la actividad' },
              { campo: 'direccion_estructurada.placa', regla: null, mensaje: 'x' },
            ],
            reglaVersion: 1,
          },
        }),
      ]),
    );
    const general = within(await screen.findByRole('region', { name: 'Información general' }));
    expect(general.getAllByRole('term').map((t) => t.textContent)).toEqual(['Razón social', 'Correo electrónico', 'Teléfono', 'País', 'Ciudad (DANE)', 'Dirección', 'CIIU principal', 'Año de inicio']);
    expect(general.getByText('Sin dato')).toBeInTheDocument();
    expect(general.getByRole('region', { name: 'Datos' })).toBeInTheDocument();
  });
});

describe('Tercero 360: la validación de la empresa, en una frase', () => {
  it('dice quién la acepta y cómo; con varios vínculos de la misma empresa, una línea por vínculo con su tipo entre paréntesis', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer]);
    const otro = { ...VINCULO, id: 'v2', tipoVinculo: { id: 'tv2', codigo: 'CONTRATISTA', nombre: 'Contratista' } };
    const datos = ficha([
      seccion({
        aceptaciones: [
          { vinculoId: 'v1', versionAceptada: 2, aceptadaEn: '2026-10-05T15:00:00Z', expedienteId: null, folio: null, versionNuevaPendiente: false, revalidacion: null },
          { vinculoId: 'v2', versionAceptada: null, aceptadaEn: null, expedienteId: null, folio: null, versionNuevaPendiente: false, revalidacion: null },
        ],
      }),
    ]);
    montar({ ...datos, vinculos: [...datos.vinculos, { ...datos.vinculos[0]!, vinculo: otro }] });

    const validacion = within(await screen.findByRole('region', { name: 'Validación de la empresa' }));
    expect(validacion.getByText('Constructora Norte aceptó la versión 2 el 05/10/2026. (Proveedor)')).toBeInTheDocument();
    expect(validacion.getByText('Constructora Norte aún no acepta esta versión: no hay un expediente en curso que la pida. (Contratista)')).toBeInTheDocument();
  });
});

describe('Tercero 360: los soportes de la sección y su «Ver»', () => {
  const GENERAL = SECCIONES[0]!;

  it('«Ver» abre el documento compartido en el visor', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer, SCOPES.documentosLeer, SCOPES.documentosDescargar]);
    montar(ficha([GENERAL]));
    const general = within(await screen.findByRole('region', { name: 'Información general' }));

    await userEvent.setup().click(general.getByRole('button', { name: 'Ver RUT, versión 2' }));

    expect(await screen.findByRole('dialog')).toHaveTextContent('RUT · Versión 2');
  });

  it('sin permiso para descargar la fila del documento dice por qué no se abre, en lugar de ofrecer un botón que no sirve', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer, SCOPES.documentosLeer]);
    montar(ficha([GENERAL]));
    const general = within(await screen.findByRole('region', { name: 'Información general' }));

    const fila = general.getByText('RUT · versión 2').closest('li');
    expect(fila).toHaveTextContent('Tu rol no puede descargar documentos, por eso no se puede abrir el archivo.');
    expect(general.queryByRole('button', { name: /^Ver / })).not.toBeInTheDocument();
  });

  it('un soporte que la empresa no recibió dice qué documento es (la API trae el nombre del tipo) y sigue sin poder abrirse (FD-10)', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer, SCOPES.documentosLeer, SCOPES.documentosDescargar]);
    // d1: el RUT compartido con el vínculo (se abre en el visor con su nombre); d8: otro RUT que no recibió; d9: un soporte genérico de antes.
    const soportes = [
      { documentoId: 'd1', version: 2, tipoDocumento: 'RUT', nombre: 'Registro Único Tributario' },
      { documentoId: 'd8', version: 3, tipoDocumento: 'CAMARA_COMERCIO', nombre: 'Certificado de existencia y representación legal' },
      { documentoId: 'd9', version: 1, tipoDocumento: 'SOPORTE_FICHA', nombre: 'Otro soporte' },
    ];
    montar(ficha([{ ...GENERAL, soportes }]));
    const general = within(await screen.findByRole('region', { name: 'Información general' }));

    expect(general.getByRole('button', { name: 'Ver RUT, versión 2' })).toBeInTheDocument();
    for (const nombre of ['Certificado de existencia y representación legal · versión 3', 'Otro soporte · versión 1']) {
      const fila = general.getByText(nombre).closest('li');
      expect(fila).toHaveTextContent('El tercero no lo compartió con Constructora Norte, por eso no se puede abrir aquí.');
      expect(within(fila as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
    }
    expect(general.queryByText(/Soporte del tercero/)).not.toBeInTheDocument();
  });

  it('sin permiso para leer los documentos del vínculo, todos los soportes lo dicen', async () => {
    permisos.scopes = new Set([SCOPES.tercerosLeer, SCOPES.vinculosLeer]);
    const datos = ficha([GENERAL]);
    montar({ ...datos, vinculos: [{ ...datos.vinculos[0]!, documentos: null }] });
    const general = within(await screen.findByRole('region', { name: 'Información general' }));

    const filas = general.getAllByText('Soporte del tercero · versión', { exact: false }).map((texto) => texto.closest('li'));
    expect(filas).toHaveLength(2);
    for (const fila of filas) expect(fila).toHaveTextContent('Tu rol no puede leer los documentos del vínculo, por eso no se puede abrir aquí.');
  });
});
