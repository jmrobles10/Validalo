import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import { SCOPES } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

const permisos = vi.hoisted(() => ({ scopes: new Set<string>() }));
const excepciones = vi.hoisted(() => ({ conteo: null as number | null }));
vi.mock('../features/empresas/useEmpresas', () => ({
  useEmpresaActiva: () => ({ empresa: { id: 'emp', nombre: 'Constructora Norte' }, empresas: [] }),
  aOpcion: (e: { id: string; nombre: string }) => ({ id: e.id, nombre: e.nombre, identificacion: '' }),
}));
vi.mock('../shared/usePermisos', () => ({ usePermisos: () => ({ scopes: permisos.scopes, puede: (s: string) => permisos.scopes.has(s) }) }));
vi.mock('../features/notificaciones/Campana', () => ({ Campana: () => null }));
vi.mock('../features/revisionAutomatica/api', () => ({ useConteoExcepciones: () => excepciones.conteo }));
vi.mock('../sesion/useYo', () => ({ useYo: () => ({ data: undefined }) }));

function montar(ruta: string) {
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route path="/e/:empresaId/*" element={<AppShell />} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => {
  permisos.scopes = new Set();
  excepciones.conteo = null;
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
