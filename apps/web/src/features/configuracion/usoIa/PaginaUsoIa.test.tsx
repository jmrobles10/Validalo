import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, SCOPES, type UsoIaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaginaUsoIa } from './PaginaUsoIa';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
vi.mock('../../empresas/useEmpresas', () => ({ useEmpresaActiva: () => ({ empresa: { id: 'emp', nombre: 'Constructora Norte' }, empresas: [] }) }));
vi.mock('../../../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));

const USO: UsoIaDto = {
  mes: '2026-11',
  plan: {
    configurado: true,
    validacionesIncluidasMes: 50,
    adicionalHabilitado: true,
    topeAdicionalMes: 20,
    llaveConfigurada: true,
    modeloPorDefecto: 'gpt-6-luna',
    modeloEscalamiento: 'gpt-6.1-terra',
    umbralConfianza: 0.85,
    activo: true,
  },
  incluidasConsumidas: 42,
  adicionalesConsumidas: 3,
  incluidasRestantes: 8,
  adicionalesRestantes: 17,
  analisisPagados: 30,
  tokensEntrada: 1_234_567,
  tokensEntradaEnCache: 2_000,
  tokensSalida: 45_000,
  costoUsd: '0.1234',
  porDia: [
    { fecha: '2026-11-03', incluidas: 4, adicionales: 0, analisisPagados: 3, tokensEntrada: 1000, tokensSalida: 100, costoUsd: 0.01 },
    { fecha: '2026-11-10', incluidas: 2, adicionales: 3, analisisPagados: 2, tokensEntrada: 800, tokensSalida: 90, costoUsd: 0.02 },
  ],
  // IA-15: lo reutilizado (12 validaciones con un análisis que pagó otra empresa) va aparte de lo que pagó la llave de la empresa.
  validacionesReutilizadas: 12,
  tokensEntradaReutilizados: 300_000,
  tokensEntradaEnCacheReutilizados: 500,
  tokensSalidaReutilizados: 15_000,
  costoReutilizadoUsd: 0.05,
};

/** El mismo uso sin los campos reutilizados: lo que manda un backend anterior a IA-15 (los campos son opcionales). */
function sinReutilizado(uso: UsoIaDto): UsoIaDto {
  const copia = { ...uso };
  delete copia.validacionesReutilizadas;
  delete copia.tokensEntradaReutilizados;
  delete copia.tokensEntradaEnCacheReutilizados;
  delete copia.tokensSalidaReutilizados;
  delete copia.costoReutilizadoUsd;
  return copia;
}

const json = (cuerpo: unknown, estado = 200) => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } });

function montar(uso: (url: URL) => UsoIaDto = () => USO, ruta = '/e/emp/uso-ia') {
  const urls: URL[] = [];
  configurarCliente({
    fetch: vi.fn((entrada: RequestInfo | URL) => {
      const url = new URL(typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url, 'http://localhost');
      urls.push(url);
      return Promise.resolve(json(uso(url)));
    }),
  });
  const router = createMemoryRouter([{ path: '/e/:empresaId/uso-ia', element: <PaginaUsoIa /> }], { initialEntries: [ruta] });
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { urls, router };
}

beforeEach(() => {
  // Solo el reloj de Date: el mes actual es noviembre de 2026 (user-event sigue con temporizadores reales).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T15:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
  reiniciarCliente();
  permisos.scopes = new Set();
});

describe('Plan y uso de IA', () => {
  it('sin configuracion:leer dice que no hay acceso y no pide nada', () => {
    const { urls } = montar();
    expect(screen.getByRole('alert')).toHaveTextContent('Plan y uso de IA');
    expect(urls).toHaveLength(0);
  });

  it('con plan muestra el uso del mes: incluidas con barra, adicionales, costo de IA y los tokens de entrada y salida por separado', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    const { urls } = montar();

    expect(await screen.findByText('42 de 50')).toBeInTheDocument();
    expect(urls[0]?.pathname).toBe('/api/v1/ia/uso');
    expect(urls[0]?.searchParams.get('mes')).toBe('2026-11');
    expect(screen.getByRole('combobox', { name: 'Mes' })).toHaveTextContent('Noviembre de 2026');
    expect(screen.getByRole('heading', { name: 'Uso del mes' })).toBeInTheDocument();

    // Las incluidas llevan una barra fina bajo el número y, debajo, la nota.
    expect(screen.getByRole('img', { name: /42 de 50 validaciones incluidas usadas/ })).toBeInTheDocument();
    expect(screen.getByText(/Usaste el 84\s?% de las incluidas/)).toBeInTheDocument();

    const adicionales = within(screen.getByRole('group', { name: 'Validaciones adicionales' }));
    expect(adicionales.getByText('3')).toBeInTheDocument();
    expect(adicionales.getByText('Tope de 20 al mes · quedan 17')).toBeInTheDocument();

    // El costo es una estimación y se dice: título «estimado», cifra con «≈», nota y, con llave propia, el enlace al panel de uso de OpenAI. Es un solo total (US$ 0,1234 de
    // su llave + US$ 0,05 de lo que recibió ya analizado), sin desglose.
    const costo = within(screen.getByRole('group', { name: 'Costo estimado de IA' }));
    expect(costo.getByText(/^≈ US\$\s0,1734$/)).toBeInTheDocument();
    expect(costo.getByText('Estimado según los tokens usados; puede diferir de lo que te cobra OpenAI.')).toBeInTheDocument();
    expect(costo.getByText(/Llave de OpenAI configurada: sí/)).toBeInTheDocument();
    const enlace = costo.getByRole('link', { name: 'Ver uso en OpenAI' });
    expect(enlace).toHaveAttribute('href', 'https://platform.openai.com/usage');
    expect(enlace).toHaveAttribute('target', '_blank');
    expect(enlace).toHaveAttribute('rel', 'noopener noreferrer');
    // La segunda frase va en un tooltip alcanzable con el teclado.
    expect(costo.getByRole('button', { name: 'El saldo y el límite reales los ves en tu cuenta de OpenAI.' })).toBeInTheDocument();

    // Los tokens de entrada y de salida no se suman: dos tarjetas, cada una con lo suyo (la caché es parte de la entrada y se dice aparte).
    const seccionTokens = within(screen.getByRole('region', { name: 'Tokens' }));
    const entrada = within(seccionTokens.getByRole('group', { name: 'Tokens de entrada' }));
    expect(entrada.getByText('1.534.567')).toBeInTheDocument();
    expect(entrada.getByText('Lo que se le envía al modelo: el documento y las instrucciones')).toBeInTheDocument();
    expect(entrada.getByText('De ellos en caché: 2.500')).toBeInTheDocument();
    const salida = within(seccionTokens.getByRole('group', { name: 'Tokens de salida' }));
    expect(salida.getByText('60.000')).toBeInTheDocument();
    expect(salida.getByText('Lo que responde el modelo: los datos leídos')).toBeInTheDocument();
    expect(screen.queryByText('1.594.567')).not.toBeInTheDocument();

    // Nada de lo que se muestra dice de dónde salió el análisis: eso solo lo ve Plataforma.
    expect(document.body).not.toHaveTextContent(/reutiliz|otra empresa|de la red|Llamadas a OpenAI|Costo real/i);
  });

  it('«Validaciones por día» dice el mes y el resumen, rotula el eje con fechas cortas y marca hoy, y deja el dato en una tabla', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    montar();
    await screen.findByText('42 de 50');

    expect(screen.getByRole('heading', { name: 'Validaciones por día · noviembre de 2026' })).toBeInTheDocument();
    expect(screen.getByText('9 validaciones en el mes · días con uso: 2')).toBeInTheDocument();
    // Eje X: el 1 y cada 5 días con su fecha corta; hoy (15 de noviembre) dice «Hoy» en lugar de la fecha.
    for (const fecha of ['1 nov', '5 nov', '10 nov', '20 nov', '25 nov', '30 nov', 'Hoy']) expect(screen.getByText(fecha)).toBeInTheDocument();
    expect(screen.queryByText('15 nov')).not.toBeInTheDocument();
    // Eje Y: 0 y el máximo (5 en un día) y cada barra con su total encima.
    expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    // El tooltip de cada día dice la fecha.
    expect(document.querySelector('[title="10 nov: 2 incluidas · 3 adicionales"]')).not.toBeNull();

    const tabla = screen.getByRole('table', { name: 'Validaciones por día · noviembre de 2026' });
    const filas = within(tabla).getAllByRole('row').slice(1);
    expect(filas.map((f) => within(f).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['3', '4', '0'],
      ['10', '2', '3'],
    ]);
  });

  it('«¿Cómo funciona?» va plegado, se despliega a todo el ancho y no menciona reutilización ni otras empresas', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    montar();
    const usuario = userEvent.setup();
    await screen.findByText('42 de 50');

    const boton = screen.getByRole('button', { name: '¿Cómo funciona?' });
    expect(boton).toHaveAttribute('aria-expanded', 'false');
    await usuario.click(boton);
    expect(boton).toHaveAttribute('aria-expanded', 'true');

    const ayuda = within(screen.getByRole('region', { name: '¿Cómo funciona?' }));
    expect(ayuda.getByText('Cada documento que recibe la empresa y se analiza automáticamente cuenta como una validación de tu plan.')).toBeInTheDocument();
    expect(ayuda.getByText('El costo de IA es el de los análisis de esas validaciones.')).toBeInTheDocument();
    expect(
      ayuda.getByText(
        /El costo es una estimación con las tarifas publicadas del modelo\. Si la llave de OpenAI se queda sin saldo o llega a su límite, los análisis fallan y los documentos pasan a revisión manual; revisa el saldo en tu cuenta de OpenAI\./,
      ),
    ).toBeInTheDocument();
    expect(ayuda.getByText(/los documentos nuevos quedan sin análisis automático, para revisión manual\. Nada se bloquea\./)).toBeInTheDocument();
    expect(ayuda.getByText(/aviso al llegar al 80 % y al 100 %/)).toBeInTheDocument();
  });

  it('si el backend no manda lo reutilizado, el costo y los tokens son los de la llave de la empresa', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    montar(() => sinReutilizado(USO));

    const costo = within(await screen.findByRole('group', { name: 'Costo estimado de IA' }));
    expect(costo.getByText(/^≈ US\$\s0,1234$/)).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Tokens de entrada' })).getByText('1.234.567')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Tokens de salida' })).getByText('45.000')).toBeInTheDocument();
  });

  it('al agotar las incluidas la tarjeta y la barra quedan en tono de error; sin adicional lo dice con texto pequeño', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    montar(() => ({ ...USO, incluidasConsumidas: 50, incluidasRestantes: 0, plan: { ...USO.plan, adicionalHabilitado: false, topeAdicionalMes: null } }));

    expect(await screen.findByRole('img', { name: /50 de 50/ })).toBeInTheDocument();
    expect(screen.getByText('Agotaste las incluidas de este mes.')).toBeInTheDocument();
    expect(screen.getByText('Sin adicional')).toBeInTheDocument();
  });

  it('sin plan activo explica que la revisión automática no está contratada', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    montar(() => ({ ...USO, plan: { ...USO.plan, configurado: true, activo: false } }));

    expect(await screen.findByText('La revisión automática no está contratada')).toBeInTheDocument();
    expect(screen.getByText(/lo configura Valídalo desde Plataforma/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('cambiar el mes lo escribe en la URL, pide ese mes y el título de la serie dice el mes elegido', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    const { urls, router } = montar((url) => ({ ...USO, mes: url.searchParams.get('mes') ?? USO.mes, porDia: [] }));
    const usuario = userEvent.setup();
    await screen.findByText('42 de 50');

    await usuario.click(screen.getByRole('combobox', { name: 'Mes' }));
    const opciones = screen.getAllByRole('option');
    expect(opciones).toHaveLength(12);
    expect(opciones.at(-1)).toHaveTextContent('Diciembre de 2025');
    await usuario.click(screen.getByRole('option', { name: 'Octubre de 2026' }));

    await waitFor(() => expect(router.state.location.search).toBe('?mes=2026-10'));
    await waitFor(() => expect(urls.at(-1)?.searchParams.get('mes')).toBe('2026-10'));
    expect(await screen.findByText('Sin validaciones en este mes.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Validaciones por día · octubre de 2026' })).toBeInTheDocument();
  });

  it('un mes válido en la URL se respeta al abrir', async () => {
    permisos.scopes = new Set([SCOPES.configuracionLeer]);
    const { urls } = montar(undefined, '/e/emp/uso-ia?mes=2026-09');
    await screen.findByText('42 de 50');
    expect(urls[0]?.searchParams.get('mes')).toBe('2026-09');
  });
});
