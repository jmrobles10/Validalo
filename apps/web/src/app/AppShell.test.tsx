import { ThemeProvider } from '@mui/material';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPES } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePreferencias } from '../shared/preferencias';
import { AppShell } from './AppShell';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
const excepciones = vi.hoisted(() => ({ conteo: null as number | null }));
const grupo = vi.hoisted(() => ({ empresas: [] as { id: string; nombre: string }[] }));
vi.mock('../features/empresas/useEmpresas', () => ({
  useEmpresaActiva: () => ({ empresa: { id: 'emp', nombre: 'Constructora Norte' }, empresas: grupo.empresas }),
  aOpcion: (e: { id: string; nombre: string }) => ({ id: e.id, nombre: e.nombre, identificacion: '' }),
}));
vi.mock('../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));
vi.mock('../features/notificaciones/Campana', () => ({ Campana: () => null }));
vi.mock('../features/revisionAutomatica/api', () => ({ useConteoExcepciones: () => excepciones.conteo }));
vi.mock('../sesion/useYo', () => ({ useYo: () => ({ data: undefined }) }));

/** Muestra la ruta actual: para comprobar que elegir una opción del cajón navega. */
function RutaActual() {
  return <output data-testid="ruta">{useLocation().pathname}</output>;
}

function montar(ruta: string) {
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/e/:empresaId/*" element={<AppShell />} />
        </Routes>
        <RutaActual />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => {
  permisos.scopes = new Set();
  excepciones.conteo = null;
  grupo.empresas = [];
  usePreferencias.setState({ modo: 'light' });
  vi.unstubAllGlobals();
});

describe('AppShell', () => {
  it('lleva el ícono de Valídalo arriba del riel, con su nombre accesible, enlazado a Inicio', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    const riel = screen.getByRole('navigation', { name: 'Secciones' });
    const logo = within(riel).getByRole('img', { name: 'Valídalo' });
    expect(logo.closest('a')).toHaveAttribute('href', '/e/emp/inicio');
  });

  it('sin auditoria:leer no muestra la pestaña Auditoría', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    expect(screen.getByRole('link', { name: 'Vínculos' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Auditoría' })).not.toBeInTheDocument();
  });

  it('con auditoria:leer muestra la pestaña y la marca activa en /auditoria', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.auditoriaLeer]);
    montar('/e/emp/auditoria');
    const pestana = screen.getByRole('link', { name: 'Auditoría' });
    expect(pestana).toHaveAttribute('href', '/e/emp/auditoria');
    expect(pestana).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Vínculos' })).not.toHaveAttribute('aria-current');
  });

  it('Configuración va al pie del riel, fuera de la lista de secciones, activa en cualquiera de sus secciones', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.configuracionLeer]);
    montar('/e/emp/plantillas');
    const barra = screen.getByRole('navigation', { name: 'Secciones' });
    expect(within(within(barra).getByRole('list')).queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
    const engranaje = within(barra).getByRole('link', { name: 'Configuración' });
    expect(engranaje).toHaveAttribute('href', '/e/emp/tipos-vinculo');
    expect(engranaje).toHaveAttribute('aria-current', 'page');
    // Estando en Configuración ninguna pestaña queda activa.
    expect(within(barra).getByRole('link', { name: 'Vínculos' })).not.toHaveAttribute('aria-current');
  });

  it('fuera de Configuración el engranaje no está activo, y sin permisos de configuración no aparece', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.configuracionLeer]);
    montar('/e/emp/vinculos');
    expect(screen.getByRole('link', { name: 'Configuración' })).not.toHaveAttribute('aria-current');
  });

  it('sin ningún permiso de configuración no hay engranaje', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    expect(screen.queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  it('con todos los permisos el riel tiene once secciones, en su orden, todas a la vista', () => {
    permisos.scopes = new Set(Object.values(SCOPES));
    montar('/e/emp/inicio');
    const barra = within(screen.getByRole('navigation', { name: 'Secciones' })).getByRole('list');
    expect(within(barra).getAllByRole('link').map((e) => e.textContent)).toEqual([
      'Inicio',
      'Bandeja',
      'Excepciones',
      'Revalidaciones',
      'Vencimientos',
      'Cumplimiento',
      'Evaluaciones',
      'Certificados',
      'Vínculos',
      'Informes',
      'Auditoría',
    ]);
    expect(within(barra).queryByRole('button', { name: 'Más' })).not.toBeInTheDocument();
  });

  it('sin permiso de leer evaluaciones no hay pestaña Evaluaciones (CE-3)', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    expect(screen.queryByRole('link', { name: 'Evaluaciones' })).not.toBeInTheDocument();
  });

  it('con permiso de leer evaluaciones la pestaña sigue activa dentro de una evaluación (CE-3)', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.evaluacionesLeer]);
    montar('/e/emp/evaluaciones/ev1');
    const pestana = screen.getByRole('link', { name: 'Evaluaciones' });
    expect(pestana).toHaveAttribute('href', '/e/emp/evaluaciones');
    expect(pestana).toHaveAttribute('aria-current', 'page');
  });

  it('Excepciones lleva el contador de las que esperan a una persona', () => {
    permisos.scopes = new Set([SCOPES.expedientesLeer]);
    excepciones.conteo = 3;
    montar('/e/emp/excepciones');
    const pestana = screen.getByRole('link', { name: 'Excepciones (3)' });
    expect(pestana).toHaveAttribute('href', '/e/emp/excepciones');
    expect(pestana).toHaveAttribute('aria-current', 'page');
  });

  it('sin excepciones pendientes la pestaña no muestra contador', () => {
    permisos.scopes = new Set([SCOPES.expedientesLeer]);
    excepciones.conteo = 0;
    montar('/e/emp/bandeja');
    expect(screen.getByRole('link', { name: 'Excepciones' })).toBeInTheDocument();
  });

  it('sin expedientes:leer no aparece la pestaña Excepciones', () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    expect(screen.queryByRole('link', { name: /^Excepciones/ })).not.toBeInTheDocument();
  });
});

/** Un `matchMedia` que contesta solo a `min-width: 600px` (el punto donde aparece el riel) y permite ensanchar la ventana. */
function simularVentana(anchoInicial: number) {
  let ancho = anchoInicial;
  const oyentes = new Set<() => void>();
  vi.stubGlobal('matchMedia', (consulta: string) => ({
    get matches() {
      return /min-width:\s*600px/.test(consulta) && ancho >= 600;
    },
    media: consulta,
    addEventListener: (_: string, oyente: () => void) => oyentes.add(oyente),
    removeEventListener: (_: string, oyente: () => void) => oyentes.delete(oyente),
  }));
  return {
    ensanchar: (nuevo: number) => {
      ancho = nuevo;
      act(() => oyentes.forEach((oyente) => oyente()));
    },
  };
}

describe('AppShell en el celular: el cajón del menú', () => {
  // jsdom aplica las reglas de `@media` sin evaluarlas: el botón de menú (`display: none` desde `sm`) queda «oculto» y sin nombre para los roles.
  const botonDeMenu = () => screen.getByLabelText('Abrir el menú');
  const abrirCajon = async () => {
    const usuario = userEvent.setup();
    await usuario.click(botonDeMenu());
    return { usuario, cajon: await screen.findByRole('dialog', { name: 'Menú principal' }) };
  };

  it('el botón de menú abre un cajón con el logo, el botón de cerrar y las secciones como filas (ícono y rótulo, alto táctil)', async () => {
    permisos.scopes = new Set(Object.values(SCOPES));
    montar('/e/emp/bandeja');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const { cajon } = await abrirCajon();

    expect(within(cajon).getByRole('img', { name: 'Valídalo' }).closest('a')).toHaveAttribute('href', '/e/emp/inicio');
    expect(within(cajon).getByRole('button', { name: 'Cerrar el menú' })).toBeInTheDocument();

    const menu = within(within(cajon).getByRole('navigation', { name: 'Secciones' }));
    const secciones = within(menu.getByRole('list')).getAllByRole('link');
    expect(secciones.map((e) => e.textContent)).toEqual([
      'Inicio',
      'Bandeja',
      'Excepciones',
      'Revalidaciones',
      'Vencimientos',
      'Cumplimiento',
      'Evaluaciones',
      'Certificados',
      'Vínculos',
      'Informes',
      'Auditoría',
    ]);
    // Filas horizontales de al menos 44 px, no el rótulo apilado bajo el ícono del riel.
    for (const fila of [...secciones, menu.getByRole('link', { name: 'Configuración' })]) {
      expect(fila).toHaveStyle({ display: 'flex', minHeight: '44px', justifyContent: 'flex-start' });
      expect(fila).not.toHaveStyle({ flexDirection: 'column' });
      expect(fila.querySelector('svg')).not.toBeNull();
    }
    // La sección actual va marcada; Configuración queda fuera de la lista, al pie.
    expect(menu.getByRole('link', { name: 'Bandeja' })).toHaveAttribute('aria-current', 'page');
    expect(menu.getByRole('link', { name: 'Inicio' })).not.toHaveAttribute('aria-current');
    expect(within(menu.getByRole('list')).queryByRole('link', { name: 'Configuración' })).not.toBeInTheDocument();
  });

  it('muestra la empresa activa como bloque y el tema, y el tema cambia desde el cajón', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    grupo.empresas = [
      { id: 'emp', nombre: 'Constructora Norte' },
      { id: 'otra', nombre: 'Constructora Sur' },
    ];
    montar('/e/emp/vinculos');
    const { usuario, cajon } = await abrirCajon();

    expect(within(cajon).getByText('Empresa activa')).toBeInTheDocument();
    const empresa = within(cajon).getByRole('button', { name: /Empresa: Constructora Norte/ });
    expect(empresa).toHaveStyle({ width: '100%', height: '44px' });

    await usuario.click(within(cajon).getByRole('button', { name: 'Usar tema oscuro' }));
    expect(usePreferencias.getState().modo).toBe('dark');
    expect(within(cajon).getByRole('button', { name: 'Usar tema claro' })).toBeInTheDocument();
  });

  it('elegir una opción navega y cierra el cajón', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer, SCOPES.configuracionLeer]);
    montar('/e/emp/vinculos');
    const { usuario, cajon } = await abrirCajon();

    await usuario.click(within(cajon).getByRole('link', { name: 'Configuración' }));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/e/emp/tipos-vinculo');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('Esc y el botón de cerrar cierran el cajón sin navegar', async () => {
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    const { usuario } = await abrirCajon();

    await usuario.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await usuario.click(botonDeMenu());
    await usuario.click(within(await screen.findByRole('dialog', { name: 'Menú principal' })).getByRole('button', { name: 'Cerrar el menú' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('ruta')).toHaveTextContent('/e/emp/vinculos');
  });

  it('el cajón no se queda abierto si la ventana se ensancha hasta donde aparece el riel', async () => {
    const ventana = simularVentana(375);
    permisos.scopes = new Set([SCOPES.vinculosLeer]);
    montar('/e/emp/vinculos');
    await abrirCajon();

    ventana.ensanchar(900);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
