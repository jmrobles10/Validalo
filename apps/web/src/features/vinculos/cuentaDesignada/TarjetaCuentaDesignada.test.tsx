import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  configurarCliente,
  reiniciarCliente,
  SCOPES,
  type CampoCruzadoDto,
  type CertificacionDeCuentaDelVinculoDto,
  type CruceDeSeccionDto,
  type CuentaDesignadaDelVinculoDto,
  type CuentaDesignadaDto,
  type SesionValidalo,
} from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSesion } from '../../../sesion/sesionStore';
import { useAvisos } from '../../../shared/useAvisos';
import { TarjetaCuentaDesignada } from './TarjetaCuentaDesignada';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../empresas/useEmpresas', () => ({ useEmpresaActiva: () => ({ empresa: { id: 'emp', nombre: 'Constructora Norte' }, empresas: [] }) }));
vi.mock('../../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const CUENTA: CuentaDesignadaDto = {
  cuentaId: 'c1',
  banco: 'Bancolombia',
  tipoCuenta: 'Ahorros',
  numeroEnmascarado: '•••• 4321',
  numero: '00123454321',
  titular: 'Ferretería El Tornillo S.A.S.',
  identificacionTitular: '900123456',
  moneda: 'COP',
  estado: 'Propuesta',
  propuestaEn: '2026-11-08T15:00:00Z',
  aprobaciones: [{ usuarioId: 'u-carlos', nombre: 'Carlos Cumplimiento', fecha: '2026-11-08T16:00:00Z' }],
  aprobadaEn: null,
  motivoRechazo: null,
};

const CON_PROPUESTA: CuentaDesignadaDelVinculoDto = { actual: null, propuesta: CUENTA, rechazada: null, aprobadoresRequeridos: 2, puedesAprobar: true };

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });

/** API falsa con estado: lo que responde un POST (si es la cuenta del vínculo) es lo que devuelve el GET siguiente. */
function montar(inicial: CuentaDesignadaDelVinculoDto, responder: (url: string, metodo: string) => CuentaDesignadaDelVinculoDto | Response | null = () => null) {
  const peticiones: { url: string; metodo: string; cuerpo: unknown }[] = [];
  let datos = inicial;
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      const metodo = init?.method ?? 'GET';
      const cuerpo: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      if (metodo !== 'GET') peticiones.push({ url, metodo, cuerpo });
      const respuesta = responder(url, metodo);
      if (respuesta instanceof Response) return Promise.resolve(respuesta);
      if (respuesta) datos = respuesta;
      return Promise.resolve(json(datos));
    }),
  });
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <TarjetaCuentaDesignada vinculo={{ id: 'v1' }} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return peticiones;
}

/** La persona que mira (para «Ya la aprobaste»: la API le dice `puedesAprobar: false` y la tarjeta reconoce su aprobación por el usuario de la sesión). */
function iniciarSesion(usuarioId: string) {
  const sesion: SesionValidalo = {
    token: 'tok',
    expira: new Date(Date.now() + 30 * 60_000),
    usuarioId,
    tenantId: 't-1',
    nombre: null,
    sistema: null,
    sesionId: null,
    metodoIngreso: null,
    actorTipo: 'Usuario',
    scopesDeTenant: new Set(),
    scopesPorEmpresa: new Map(),
    empresas: '*',
  };
  useSesion.setState({ sesion, estado: 'activa', empresaSugerida: null, sugerirPasskey: false });
}

afterEach(() => {
  reiniciarCliente();
  permisos.scopes = new Set();
  useAvisos.getState().cerrar();
  useSesion.setState({ sesion: null, estado: 'sin-sesion' });
});

describe('Cuenta bancaria designada del vínculo', () => {
  it('sin vinculos:leer no se muestra', () => {
    montar(CON_PROPUESTA);
    expect(screen.queryByText('Cuenta bancaria designada')).not.toBeInTheDocument();
  });

  it('sin ninguna cuenta dice que el tercero aún no la ha designado', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar({ actual: null, propuesta: null, rechazada: null, aprobadoresRequeridos: 2, puedesAprobar: false });
    expect(await screen.findByText('El tercero aún no ha designado una cuenta')).toBeInTheDocument();
  });

  it('muestra la propuesta con «van 1» y quién aprobó; aprobar envía el POST', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const usuario = userEvent.setup();
    const designada = { ...CUENTA, estado: 'Aprobada', aprobadaEn: '2026-11-09T10:00:00Z' };
    const peticiones = montar(CON_PROPUESTA, (url, metodo) => (metodo === 'POST' && url.endsWith('/aprobar') ? { ...CON_PROPUESTA, actual: designada, propuesta: null, puedesAprobar: false } : null));

    const progreso = await screen.findByText('Necesita 2 aprobaciones · van 1: Carlos Cumplimiento');
    // El porqué de las dos personas va en el `title`, no en un aviso aparte.
    expect(progreso).toHaveAttribute('title', 'La aprueban 2 personas distintas. Hasta entonces el vínculo no tiene cuenta designada.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('00123454321')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Aprobar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(within(dialogo).getByText(/la cuenta queda designada/)).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Aprobar' }));

    await waitFor(() => expect(peticiones).toContainEqual({ url: '/api/v1/vinculos/v1/cuenta-designada/aprobar', metodo: 'POST', cuerpo: null }));
    await waitFor(() => expect(useAvisos.getState().actual?.mensaje).toBe('La cuenta quedó designada.'));
    expect(await screen.findByRole('region', { name: 'Designada' })).toBeInTheDocument();
  });

  it('rechazar exige el motivo (botón deshabilitado sin él) y lo envía', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const usuario = userEvent.setup();
    const rechazada = { ...CUENTA, estado: 'Rechazada', motivoRechazo: 'El titular no coincide' };
    const peticiones = montar(CON_PROPUESTA, (url) => (url.endsWith('/rechazar') ? { ...CON_PROPUESTA, propuesta: null, rechazada, puedesAprobar: false } : null));

    await usuario.click(await screen.findByRole('button', { name: 'Rechazar' }));
    const dialogo = await screen.findByRole('dialog');
    const confirmar = within(dialogo).getByRole('button', { name: 'Rechazar' });
    expect(confirmar).toBeDisabled();
    await usuario.click(within(dialogo).getByRole('textbox', { name: /Motivo para el tercero/ }));
    await usuario.paste('El titular no coincide');
    await usuario.click(confirmar);

    await waitFor(() => expect(peticiones).toContainEqual({ url: '/api/v1/vinculos/v1/cuenta-designada/rechazar', metodo: 'POST', cuerpo: { motivo: 'El titular no coincide' } }));
    expect(await screen.findByText('Motivo: El titular no coincide')).toBeInTheDocument();
  });

  it('aprobar dos veces explica que falta otra persona (aprobador-repetido)', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const usuario = userEvent.setup();
    montar(CON_PROPUESTA, (url) => (url.endsWith('/aprobar') ? json({ codigo: 'aprobador-repetido', detail: 'Ya aprobaste.', status: 409 }, 409) : null));
    await usuario.click(await screen.findByRole('button', { name: 'Aprobar' }));
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(useAvisos.getState().actual).toMatchObject({ mensaje: 'Ya aprobaste esta cuenta; falta que la apruebe otra persona.', severidad: 'error' }));
  });

  it('sin cuentas:aprobar muestra el número enmascarado y no ofrece acciones', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, numero: null }, puedesAprobar: false });
    expect(await screen.findByText('•••• 4321')).toBeInTheDocument();
    expect(screen.queryByText('00123454321')).not.toBeInTheDocument();
    expect(screen.getByText('Solo quien aprueba cuentas ve el número completo.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });
});

/** La certificación de la cuenta cruzada con ella (CB-1): el número va enmascarado en el cruce, el completo solo aparece en los datos de la cuenta. */
type Resultado = 'Coincide' | 'Discrepa' | 'NoVerificable';

const campo = (codigo: string, etiqueta: string, declarado: string, extraido: string | null, resultado: Resultado, critico: boolean): CampoCruzadoDto => ({
  campo: codigo,
  etiqueta,
  declarado,
  extraido,
  resultado,
  critico,
  detalle: null,
});

const cruce = (campos: CampoCruzadoDto[], legible = true): CruceDeSeccionDto => ({
  documentoId: 'doc-1',
  versionDocumento: 2,
  tipoDocumento: 'CERTIFICACION_BANCARIA',
  nombreDocumento: 'Certificación bancaria · Bancolombia ****4321',
  confianza: 0.93,
  legible,
  fecha: '2026-11-10T10:00:00Z',
  coincidencias: campos.filter((c) => c.resultado === 'Coincide').length,
  discrepancias: campos.filter((c) => c.resultado === 'Discrepa').length,
  noVerificables: campos.filter((c) => c.resultado === 'NoVerificable').length,
  discrepanciaCritica: campos.some((c) => c.critico && c.resultado === 'Discrepa'),
  campos,
});

const certificacion = (cambios: Partial<CertificacionDeCuentaDelVinculoDto>): CertificacionDeCuentaDelVinculoDto => ({
  documentoId: 'doc-1',
  version: 2,
  cargadaEn: '2026-11-10T09:00:00Z',
  verificacion: 'Coincide',
  sinAnalisis: false,
  discrepanciaCritica: false,
  cruce: null,
  ...cambios,
});

/** Los campos que lee la certificación de una cuenta: el número, el titular, su identificación y que sea el tercero, y el banco (evidencia). */
const CAMPOS_QUE_COINCIDEN: CampoCruzadoDto[] = [
  campo('numero', 'Número de la cuenta', '****4321', '****4321', 'Coincide', true),
  campo('titular', 'Titular de la cuenta', 'Ferretería El Tornillo', 'FERRETERIA EL TORNILLO', 'Coincide', true),
  campo('identificacion_titular', 'Identificación del titular', '900123456', '900123456', 'Coincide', true),
  campo('titular_es_el_tercero', 'El titular es el tercero', 'Ferretería El Tornillo (900123456)', '900123456', 'Coincide', true),
  campo('banco', 'Banco', 'Bancolombia', 'Bancolombia', 'Coincide', false),
];

/** La IA no leyó la identificación del titular: sin ella tampoco se puede decir que el titular sea el tercero (el cruce no trae ese campo). */
const sinIdentificacion = (campos: CampoCruzadoDto[]) =>
  campos
    .filter((c) => c.campo !== 'titular_es_el_tercero')
    .map((c) => (c.campo === 'identificacion_titular' ? campo('identificacion_titular', 'Identificación del titular', '900123456', null, 'NoVerificable', true) : c));

describe('La certificación de la cuenta junto a la cuenta por aprobar', () => {
  it('se resume en una línea: versión, fecha y lo crítico que coincide; la comparación queda plegada hasta pedirla', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const usuario = userEvent.setup();
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, certificacion: certificacion({ cruce: cruce(CAMPOS_QUE_COINCIDEN) }) } });

    const region = await screen.findByRole('region', { name: 'Certificación bancaria de la cuenta' });
    expect(region).toHaveTextContent('Certificación v2 · 10/11/2026 — Coincide: número, titular, identificación y titular = tercero');
    // Ni chip de «Coincide» aparte, ni título, ni alertas: una sola línea.
    expect(region.querySelector('[data-estado]')).toBeNull();
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(region).queryByRole('table')).not.toBeInTheDocument();

    const ver = within(region).getByRole('button', { name: 'Ver comparación' });
    expect(ver).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(ver);
    expect(await within(region).findByRole('table', { name: /Cruce con Certificación bancaria/ })).toBeInTheDocument();
    // La nota de evidencia viaja con la tabla, no suelta en la tarjeta.
    expect(region).toHaveTextContent('Es evidencia para la revisión');
    // El número completo está en los datos de la cuenta (para cotejarlo), no en el cruce.
    expect(within(region).queryByText('00123454321')).not.toBeInTheDocument();
    expect(screen.getByText('00123454321')).toBeInTheDocument();

    await usuario.click(within(region).getByRole('button', { name: 'Ocultar comparación' }));
    await waitFor(() => expect(within(region).queryByRole('table')).not.toBeInTheDocument());
    expect(region).not.toHaveTextContent('Es evidencia para la revisión');
  });

  it('si algo crítico quedó sin verificar lo dice en la misma línea, con tono de advertencia y sin abrir la comparación', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const campos = sinIdentificacion(CAMPOS_QUE_COINCIDEN);
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, certificacion: certificacion({ verificacion: 'NoVerificable', cruce: cruce(campos) }) } });

    const region = await screen.findByRole('region', { name: 'Certificación bancaria de la cuenta' });
    expect(region).toHaveTextContent('Certificación v2 · 10/11/2026 — Coincide: número y titular · Sin verificar: identificación');
    expect(region.querySelector('svg.lucide-circle-alert')).not.toBeNull();
    expect(within(region).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(region).queryByRole('table')).not.toBeInTheDocument();
  });

  it('el banco que difiere (evidencia, no crítico) se dice aparte y no cambia el resultado', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const campos = CAMPOS_QUE_COINCIDEN.map((c) => (c.campo === 'banco' ? campo('banco', 'Banco', 'Bancolombia', 'Davivienda', 'Discrepa', false) : c));
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, certificacion: certificacion({ verificacion: 'Discrepa', cruce: cruce(campos) }) } });

    const region = await screen.findByRole('region', { name: 'Certificación bancaria de la cuenta' });
    expect(region).toHaveTextContent('Coincide: número, titular, identificación y titular = tercero · También difiere: banco');
    expect(region.querySelector('svg.lucide-circle-check')).not.toBeNull();
    expect(within(region).queryByRole('table')).not.toBeInTheDocument();
  });

  it('una diferencia en lo crítico va en rojo, abre sola la comparación y no bloquea la aprobación', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const usuario = userEvent.setup();
    const campos = [campo('numero', 'Número de la cuenta', '****4321', '****9999', 'Discrepa', true), campo('banco', 'Banco', 'Bancolombia', 'Bancolombia', 'Coincide', false)];
    const peticiones = montar(
      { ...CON_PROPUESTA, propuesta: { ...CUENTA, certificacion: certificacion({ verificacion: 'Discrepa', discrepanciaCritica: true, cruce: cruce(campos) }) } },
      (url, metodo) => (metodo === 'POST' && url.endsWith('/aprobar') ? { ...CON_PROPUESTA, puedesAprobar: false } : null),
    );

    const region = await screen.findByRole('region', { name: 'Certificación bancaria de la cuenta' });
    // Lo mismo antes iba en tres lugares (alerta, chip y nota): ahora, una línea.
    expect(within(region).getByRole('alert')).toHaveTextContent('Certificación v2 · 10/11/2026 — No coincide: número');
    expect(region.querySelector('svg.lucide-circle-x')).not.toBeNull();
    expect(region.querySelector('[data-estado]')).toBeNull();
    expect(within(region).getByRole('button', { name: 'Ocultar comparación' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(region).getByRole('row', { name: 'Número de la cuenta: Difiere' })).toBeInTheDocument();

    // Al aprobar, el diálogo repite la advertencia, pero no impide confirmar.
    await usuario.click(screen.getByRole('button', { name: 'Aprobar' }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('La certificación de esta cuenta no coincide en lo crítico (Número de la cuenta).');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(peticiones).toContainEqual({ url: '/api/v1/vinculos/v1/cuenta-designada/aprobar', metodo: 'POST', cuerpo: null }));
  });

  it('un documento que no se lee no verifica nada: advertencia, sin enumerar campos', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const campos = CAMPOS_QUE_COINCIDEN.map((c) => ({ ...c, extraido: null, resultado: 'NoVerificable' as const }));
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, certificacion: certificacion({ verificacion: 'NoSeLee', cruce: cruce(campos, false) }) } });

    const region = await screen.findByRole('region', { name: 'Certificación bancaria de la cuenta' });
    expect(region).toHaveTextContent('Certificación v2 · 10/11/2026 — No se lee con seguridad: nada se pudo verificar');
    expect(region.querySelector('svg.lucide-circle-alert')).not.toBeNull();
  });

  it('sin la lectura de la empresa avisa que se coteja a mano, sin comparación que abrir', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const usuario = userEvent.setup();
    montar({
      ...CON_PROPUESTA,
      actual: { ...CUENTA, cuentaId: 'c0', estado: 'Aprobada', aprobadaEn: '2026-11-01T10:00:00Z', certificacion: null, sinCertificacion: true },
      propuesta: { ...CUENTA, certificacion: certificacion({ verificacion: 'SinAnalisis', sinAnalisis: true }) },
    });

    // La designada sin certificación propia conserva su aviso tal cual.
    expect(await screen.findByText(/no tiene certificación bancaria propia/)).toBeInTheDocument();
    const region = screen.getByRole('region', { name: 'Certificación bancaria de la cuenta' });
    expect(region).toHaveTextContent('Certificación v2 · 10/11/2026 — Sin lectura automática: cotéjala a mano');
    expect(region.querySelector('svg.lucide-circle-alert')).not.toBeNull();
    expect(within(region).queryByRole('button', { name: /comparación/ })).not.toBeInTheDocument();
    expect(within(region).queryByRole('table')).not.toBeInTheDocument();

    // La propuesta sin lectura no se destaca como discrepancia: el diálogo de aprobar no la advierte.
    await usuario.click(screen.getByRole('button', { name: 'Aprobar' }));
    expect(within(await screen.findByRole('dialog')).queryByText(/no coincide en lo crítico/)).not.toBeInTheDocument();
  });

  it('el botón de la comparación queda en la misma fila que el ícono y la frase, centrado', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, certificacion: certificacion({ cruce: cruce(CAMPOS_QUE_COINCIDEN) }) } });

    const region = await screen.findByRole('region', { name: 'Certificación bancaria de la cuenta' });
    const fila = within(region).getByRole('button', { name: 'Ver comparación' }).parentElement!;
    expect(fila).toHaveStyle({ display: 'flex', flexDirection: 'row', alignItems: 'center' });
    expect(fila).toContainElement(region.querySelector('svg.lucide-circle-check'));
    expect(fila).toContainElement(within(region).getByText(/^Certificación v2/));
  });
});

describe('Cuenta por aprobar: el encabezado y las aprobaciones', () => {
  it('el estado y la fecha de la propuesta van en una sola línea, sin párrafo aparte ni sobretítulo', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    montar(CON_PROPUESTA);

    const region = await screen.findByRole('region', { name: 'Por aprobar' });
    const chip = region.querySelector('[data-estado="Propuesta"]');
    expect(chip).toHaveTextContent('Por aprobar');
    expect(chip?.parentElement).toHaveTextContent('Propuesta el 08/11/2026');
    expect(screen.queryByText(/El tercero la propuso/)).not.toBeInTheDocument();
    expect(within(region).queryByRole('heading')).not.toBeInTheDocument();
  });

  it('las aprobaciones van al lado de los botones, en la misma fila: «Necesita 2 aprobaciones · van 0»', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    montar({ ...CON_PROPUESTA, propuesta: { ...CUENTA, aprobaciones: [] }, actual: { ...CUENTA, cuentaId: 'c0', estado: 'Aprobada', aprobadaEn: '2026-11-01T10:00:00Z' } });

    const progreso = await screen.findByText('Necesita 2 aprobaciones · van 0');
    // Con una cuenta designada vigente, el porqué dice que sigue vigente la anterior (en el \`title\`).
    expect(progreso).toHaveAttribute('title', 'La aprueban 2 personas distintas. Hasta entonces sigue vigente la cuenta designada anterior.');
    const fila = progreso.parentElement!;
    expect(within(fila).getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();
    expect(within(fila).getByRole('button', { name: 'Rechazar' })).toBeInTheDocument();
    expect(fila).toHaveStyle({ alignItems: 'center' });
    // Ya no hay aviso azul con el conteo.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/de 2 aprobaciones/)).not.toBeInTheDocument();
  });

  it('quien ya aprobó ve cuántas lleva y que falta otra persona, en esa misma línea y sin botones', async () => {
    iniciarSesion('u-carlos');
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    montar({ ...CON_PROPUESTA, puedesAprobar: false });

    const progreso = await screen.findByText('Necesita 2 aprobaciones · van 1: Carlos Cumplimiento');
    const fila = progreso.parentElement!;
    expect(within(fila).getByText('Ya la aprobaste; falta que la apruebe otra persona.')).toBeInTheDocument();
    expect(within(fila).queryByRole('button')).not.toBeInTheDocument();
  });

  it('quien no puede aprobar igual ve el conteo, sin botones ni «Ya la aprobaste»', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar({ ...CON_PROPUESTA, puedesAprobar: false });

    expect(await screen.findByText('Necesita 2 aprobaciones · van 1: Carlos Cumplimiento')).toBeInTheDocument();
    expect(screen.queryByText(/Ya la aprobaste/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprobar' })).not.toBeInTheDocument();
  });
});

describe('Cuenta designada: el mismo patrón', () => {
  it('datos, la certificación en una línea y quién la aprobó, con un solo chip «Designada»', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.cuentasAprobar]);
    const campos = sinIdentificacion(CAMPOS_QUE_COINCIDEN);
    const designada: CuentaDesignadaDto = {
      ...CUENTA,
      estado: 'Aprobada',
      aprobadaEn: '2026-11-09T15:30:00Z',
      aprobaciones: [
        { usuarioId: 'u-carlos', nombre: 'Carlos Cumplimiento', fecha: '2026-11-08T16:00:00Z' },
        { usuarioId: 'u-diana', nombre: 'Diana Tesorería', fecha: '2026-11-09T15:30:00Z' },
      ],
      certificacion: certificacion({ verificacion: 'NoVerificable', cruce: cruce(campos) }),
    };
    montar({ actual: designada, propuesta: null, rechazada: null, aprobadoresRequeridos: 2, puedesAprobar: false });

    const region = await screen.findByRole('region', { name: 'Designada' });
    expect(region.querySelector('[data-estado="Aprobada"]')).toHaveTextContent('Designada');
    expect(within(region).getByText('Bancolombia')).toBeInTheDocument();
    const certificacionDeLaCuenta = within(region).getByRole('region', { name: 'Certificación bancaria de la cuenta' });
    expect(certificacionDeLaCuenta).toHaveTextContent('Certificación v2 · 10/11/2026 — Coincide: número y titular · Sin verificar: identificación');
    expect(within(certificacionDeLaCuenta).getByRole('button', { name: 'Ver comparación' })).toBeInTheDocument();
    expect(region).toHaveTextContent('Aprobada por Carlos Cumplimiento y Diana Tesorería el 09/11/2026');
    // Sin cuenta por aprobar, no hay conteo de aprobaciones.
    expect(screen.queryByText(/Necesita/)).not.toBeInTheDocument();
  });
});
