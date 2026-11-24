import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, within } from '@testing-library/react';
import { createValidaloTheme } from '@validalo/ui';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { useSesionTercero } from '../sesion/sesionTercero';
import { Shell } from './Shell';

// Un marcador en lugar de la campana (consulta la API): basta para saber si el shell la muestra.
vi.mock('../notificaciones/Campana', () => ({ Campana: () => <span data-testid="campana" /> }));
// El aviso de «accesos por aprobar» pregunta a la API (se prueba aparte, con su propio cliente).
vi.mock('../accesos/AvisosDeAcceso', async (original) => ({ ...(await original<typeof import('../accesos/AvisosDeAcceso')>()), AvisoDeAccesosPorAprobar: () => null }));
// Lo mismo el aviso de «personas por confirmar»: pregunta a la API y se prueba en `personas/`.
vi.mock('../personas/AvisoDePropuestas', () => ({ AvisoDePropuestasDePersonas: () => null }));
vi.mock('../embebido/usePuenteEmbebido', () => ({ usePuenteEmbebido: () => undefined }));

function montar(ruta: string) {
  return render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <MemoryRouter initialEntries={[ruta]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="*" element={<p>contenido</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

afterEach(() => {
  useSesionTercero.setState({ estado: 'sin-sesion', sesion: null });
  useDialogoSubir.getState().cerrar();
});

describe('Shell del tercero: la marca', () => {
  it('la barra lleva el logotipo de Valídalo (la «V» con el check y «alídalo») y, en las pantallas de entrada, el rótulo «Mis documentos»', () => {
    useSesionTercero.setState({ estado: 'sin-sesion' });
    montar('/entrar');
    const barra = screen.getByRole('banner');
    const logo = within(barra).getByRole('img', { name: 'Valídalo' });
    expect(logo.querySelector('[data-parte="v"]')).toHaveAttribute('fill', '#22D38A');
    expect(logo.querySelector('[data-parte="palabra"]')).toHaveAttribute('fill', '#0E8C9A');
    // El dibujo no se recorta en la barra: el svg deja ver lo que sobresalga y la «V» y la palabra están dentro de su caja.
    expect(logo).toHaveStyle({ overflow: 'visible' });
    expect(within(barra).getByText('Mis documentos')).toBeInTheDocument();
  });

  it('en la verificación pública el rótulo es «Verificación de certificados»', () => {
    montar('/verificar/NORTE-C-2026-000001-1');
    expect(within(screen.getByRole('banner')).getByText('Verificación de certificados')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByRole('img', { name: 'Valídalo' })).toBeInTheDocument();
  });

  it('con sesión las secciones de la barra ya dicen dónde está la persona: sin el rótulo, para que no se corte', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/boveda');
    const barra = screen.getByRole('banner');
    expect(within(barra).getByRole('img', { name: 'Valídalo' })).toBeInTheDocument();
    expect(within(barra).queryByText('Mis documentos')).not.toBeInTheDocument();
    expect(within(barra).getByRole('link', { name: 'Mi bóveda' })).toBeInTheDocument();
  });

  it('el pie dice «con Valídalo» con el ícono de la marca (decorativo)', () => {
    montar('/entrar');
    const pie = screen.getByRole('contentinfo');
    expect(pie).toHaveTextContent('con Valídalo');
    expect(pie.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    // El nombre «Valídalo» del logotipo es solo el de la barra: el ícono del pie no lo repite a los lectores de pantalla.
    expect(within(pie).queryByRole('img', { name: 'Valídalo' })).not.toBeInTheDocument();
  });
});

describe('Shell del tercero: el enlace del correo es una entrada', () => {
  const SECCIONES = ['Mi bóveda', 'Mis empresas', 'Mi información', 'Mis cuentas', 'Privacidad'];

  it('mientras se pide el código no hay secciones, campana ni «Salir», aunque el navegador conserve una sesión anterior', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/e/abc123');

    const barra = screen.getByRole('banner');
    for (const seccion of SECCIONES) expect(within(barra).queryByRole('link', { name: seccion })).not.toBeInTheDocument();
    expect(screen.queryByTestId('campana')).not.toBeInTheDocument();
    expect(within(barra).queryByRole('button', { name: 'Salir' })).not.toBeInTheDocument();
    // Ni la barra inferior del celular, y el pie y el rótulo de las pantallas de entrada sí.
    expect(document.querySelector('.MuiBottomNavigation-root')).toBeNull();
    expect(within(barra).getByText('Mis documentos')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('sin sesión tampoco hay secciones ni campana', () => {
    useSesionTercero.setState({ estado: 'sin-sesion' });
    montar('/e/abc123');

    expect(within(screen.getByRole('banner')).queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByTestId('campana')).not.toBeInTheDocument();
  });

  it('con la sesión abierta, en cualquier otra ruta, las secciones, la campana y «Salir» siguen ahí', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/empresas');

    const barra = screen.getByRole('banner');
    expect(within(barra).getAllByRole('link').map((l) => l.textContent)).toEqual(SECCIONES);
    expect(screen.getByTestId('campana')).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: 'Salir' })).toBeInTheDocument();
  });
});

describe('Shell del tercero: lienzo, píldoras y panel', () => {
  it('las secciones son píldoras: la activa es blanca (con sombra) y las demás no tienen caja; «Salir» no es una caja suelta', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/ficha');
    const barra = screen.getByRole('banner');
    const activa = within(barra).getByRole('link', { name: 'Mi información' });
    expect(activa).toHaveAttribute('aria-current', 'page');
    expect(getComputedStyle(activa).boxShadow).not.toBe('none');
    const otra = within(barra).getByRole('link', { name: 'Mi bóveda' });
    expect(getComputedStyle(otra).boxShadow).toMatch(/none$/);
    // «Salir» tiene el estilo de una sección inactiva: sin borde ni sombra propios.
    const salir = within(barra).getByRole('button', { name: 'Salir' });
    expect(getComputedStyle(salir).boxShadow).toMatch(/none$/);
    expect(getComputedStyle(salir).borderTopWidth).not.toBe('1px');
  });

  it('el contenido va en un único panel flotante (main) y la barra y el panel comparten ancho máximo', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/boveda');
    const panel = screen.getByRole('main').firstElementChild as HTMLElement;
    expect(getComputedStyle(panel).borderRadius).toBe('16px');
    expect(within(panel).getByText('contenido')).toBeInTheDocument();
    const barra = screen.getByRole('banner').firstElementChild as HTMLElement;
    expect(getComputedStyle(barra).maxWidth).toBe(getComputedStyle(panel).maxWidth);
  });
});

describe('Shell del tercero: un solo ancho', () => {
  /** El primer hijo de `main` y la caja de la barra superior comparten ancho máximo (el logotipo se alinea con el borde del panel). */
  const anchos = () => {
    const panel = screen.getByRole('main').firstElementChild as HTMLElement;
    const barra = screen.getByRole('banner').firstElementChild as HTMLElement;
    return { panel: getComputedStyle(panel).maxWidth, barra: getComputedStyle(barra).maxWidth };
  };

  it.each(['/boveda', '/empresas', '/cuentas', '/ficha', '/boveda/subir', '/privacidad'])('%s: el panel y la barra llegan al mismo ancho (1440 px) en todas las páginas', (ruta) => {
    useSesionTercero.setState({ estado: 'activa' });
    montar(ruta);
    expect(anchos()).toEqual({ panel: '1440px', barra: '1440px' });
  });

  it('una sección de Mi información no lleva el panel del Shell: la página pone el suyo (el de las secciones y el del formulario) con el mismo ancho', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/ficha/general');
    const principal = screen.getByRole('main');
    const contenedor = principal.firstElementChild as HTMLElement;
    // Sin panel flotante envolviendo todo: el contenido (aquí un marcador) cuelga directo del contenedor sobre el lienzo.
    expect(getComputedStyle(contenedor).borderRadius).not.toBe('16px');
    expect(within(contenedor).getByText('contenido')).toBeInTheDocument();
    expect(anchos()).toEqual({ panel: '1440px', barra: '1440px' });
  });
});

describe('Shell del tercero con acceso aislado', () => {
  const aislada = { accessToken: 't', expira: '2099-01-01T00:00:00Z', terceroId: 'ter', otpVerificado: false, vinculos: [], aislada: true, terceroEnmascarado: 'P••••• N•••' };

  it('la barra solo ofrece «Mis empresas» (la bóveda, la información, las cuentas y la privacidad son del tercero entero) y avisa que el acceso espera aprobación', () => {
    useSesionTercero.setState({ estado: 'activa', sesion: aislada });
    montar('/empresas');

    const barra = screen.getByRole('banner');
    expect(within(barra).getByRole('link', { name: 'Mis empresas' })).toBeInTheDocument();
    for (const oculta of ['Mi bóveda', 'Mi información', 'Mis cuentas', 'Privacidad']) expect(within(barra).queryByRole('link', { name: oculta })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tu acceso está pendiente de que un contacto de P••••• N••• lo apruebe.');
    const inferior = document.querySelector('.MuiBottomNavigation-root');
    expect([...(inferior?.querySelectorAll('.MuiBottomNavigationAction-label') ?? [])].map((r) => r.textContent)).toEqual(['Mis empresas']);
  });

  it('con acceso completo la barra trae las cinco secciones y ningún aviso', () => {
    useSesionTercero.setState({ estado: 'activa', sesion: { ...aislada, aislada: false, terceroEnmascarado: null } });
    montar('/empresas');

    expect(within(screen.getByRole('banner')).getAllByRole('link').map((l) => l.textContent)).toEqual(['Mi bóveda', 'Mis empresas', 'Mi información', 'Mis cuentas', 'Privacidad']);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('Shell del tercero: la barra inferior del celular', () => {
  it('cada rótulo va en una sola línea, también el de la sección activa (sin partir «Mi bóveda» ni «Mi información»)', () => {
    useSesionTercero.setState({ estado: 'activa' });
    montar('/boveda');
    const barra = document.querySelector('.MuiBottomNavigation-root');
    expect(barra).not.toBeNull();
    const rotulos = [...(barra?.querySelectorAll('.MuiBottomNavigationAction-label') ?? [])];
    expect(rotulos.map((r) => r.textContent)).toEqual(['Mi bóveda', 'Mis empresas', 'Mi información', 'Mis cuentas', 'Privacidad']);
    expect(barra?.querySelector('.Mui-selected')).not.toBeNull();
    for (const rotulo of rotulos) {
      expect(rotulo).toHaveStyle({ whiteSpace: 'nowrap' });
    }
  });
});

describe('Shell del tercero: el diálogo de subida', () => {
  it('el marco monta el diálogo de toda la app: los botones «Subir…» lo abren sin que la pantalla lo traiga', async () => {
    useSesionTercero.setState({ estado: 'activa' });
    render(
      <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter initialEntries={['/boveda']}>
            <Routes>
              <Route element={<Shell />}>
                <Route path="*" element={<p>contenido</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => useDialogoSubir.getState().abrir({ tipo: 'RUT', nombre: 'RUT' }));

    expect(await screen.findByRole('dialog', { name: 'Subir RUT' })).toBeInTheDocument();
  });
});
