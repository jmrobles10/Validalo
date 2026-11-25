import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AreaDto, CondicionDto, TipoDocumentoTenantDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { areaNueva, requisitoDeSeccionNuevo, requisitoNuevo, requisitosADto, type ErrorFlujo, type RequisitoEnEditor } from '../editor';
import { EditorRequisitos } from './EditorRequisitos';

/** «Lo que pide el flujo» por sector: grupos, filas cerradas con su resumen, una abierta a la vez, errores que abren solos y agregar. */

const area = (id: string, nombre: string): AreaDto => ({ id, empresaId: 'e', codigo: id.toUpperCase(), nombre, miembros: ['u1'], activa: true });
const AREAS = [area('compras', 'Compras'), area('juridica', 'Jurídica'), area('tesoreria', 'Tesorería')];
const ETAPAS = [{ clave: 'e1', areas: [areaNueva('compras'), areaNueva('juridica'), areaNueva('tesoreria')] }];

const tipo = (id: string, nombre: string, tipoCanonico: string | null): TipoDocumentoTenantDto =>
  ({ id, codigo: id.toUpperCase(), nombre, clase: 'Archivo', activo: true, tipoCanonico }) as unknown as TipoDocumentoTenantDto;
const TIPOS = [
  tipo('rut', 'Registro Único Tributario', 'RUT'),
  tipo('constancia', 'Constancia de régimen', 'CONSTANCIA_RNC'),
  tipo('renta', 'Declaración de renta', 'DECLARACION_RENTA'),
  tipo('bancaria', 'Certificación bancaria', 'CERTIFICACION_BANCARIA'),
  tipo('estados', 'Estados financieros', 'ESTADOS_FINANCIEROS'),
  tipo('datos', 'Autorización de datos', 'AUTORIZACION_TRATAMIENTO_DATOS'),
  tipo('alturas', 'Certificado de alturas', null),
];

const doc = (id: string, clave: string, extra: Partial<RequisitoEnEditor> = {}): RequisitoEnEditor => ({ ...requisitoNuevo(id), clave, ...extra });
const seccion = (codigo: string, clave: string, extra: Partial<RequisitoEnEditor> = {}): RequisitoEnEditor => ({ ...requisitoDeSeccionNuevo(codigo), clave, ...extra });
const juridica: CondicionDto = { tipo: 'Predicado', nodos: null, atributo: 'tercero.tipoPersona', operador: 'Igual', valores: ['Juridica'] };

const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const Envoltura = ({ children }: { children: ReactNode }) => (
  <ThemeProvider theme={createValidaloTheme('light')}>
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  </ThemeProvider>
);

interface Props {
  requisitos: RequisitoEnEditor[];
  onCambiar?: (requisitos: RequisitoEnEditor[]) => void;
  errores?: readonly ErrorFlujo[];
  soloLectura?: boolean;
}

const Estatico = ({ requisitos, onCambiar = vi.fn(), errores = [], soloLectura = false }: Props) => (
  <EditorRequisitos requisitos={requisitos} etapas={ETAPAS} areas={AREAS} tiposDocumento={TIPOS} onCambiar={onCambiar} errores={errores} soloLectura={soloLectura} />
);

/** Como lo usa el formulario del flujo: el borrador vive arriba y cada cambio vuelve como propiedad. */
function Controlado({ inicial, alCambiar }: { inicial: RequisitoEnEditor[]; alCambiar: (requisitos: RequisitoEnEditor[]) => void }) {
  const [requisitos, setRequisitos] = useState(inicial);
  return (
    <Estatico
      requisitos={requisitos}
      onCambiar={(siguiente) => {
        alCambiar(siguiente);
        setRequisitos(siguiente);
      }}
    />
  );
}

const montar = (ui: ReactNode) => render(ui, { wrapper: Envoltura });
const fila = (nombre: string) => screen.getByRole('button', { name: new RegExp(`^${nombre}`) });
const abrir = (nombre: string) => fireEvent.click(fila(nombre));
const encabezados = () => screen.getAllByRole('heading', { level: 3 });
const nombresDeGrupos = () => encabezados().map((h) => h.textContent);
/** El grupo de un sector por su nombre. */
function grupo(nombre: string): HTMLElement {
  const contenedor = encabezados().find((h) => h.textContent === nombre)?.closest('[role="group"]');
  if (!(contenedor instanceof HTMLElement)) throw new Error(`No hay un grupo «${nombre}»`);
  return contenedor;
}
const filasDe = (nombre: string) => within(grupo(nombre)).getAllByRole('region').map((r) => r.getAttribute('aria-label'));

describe('EditorRequisitos por sector', () => {
  const requisitos = [
    doc('alturas', 'alturas', { condicion: juridica }),
    doc('estados', 'estados'),
    doc('rut', 'rut', { obligatorio: false, areasQueRevisan: ['compras'] }),
    seccion('FICHA_FINANCIERA', 'sec-fin', { periodos: 2 }),
    doc('bancaria', 'bancaria'),
  ];

  it('agrupa por sector en el orden del menú lateral, sin mostrar los sectores vacíos, y deja «sin sector» al final', () => {
    montar(<Estatico requisitos={requisitos} />);
    expect(nombresDeGrupos()).toEqual(['Cuenta bancaria', 'Información tributaria', 'Información financiera', 'Otros documentos']);
  });

  it('cada grupo trae el ícono y el nombre de su sector y cuántos documentos y secciones tiene', () => {
    montar(<Estatico requisitos={requisitos} />);
    expect(within(grupo('Cuenta bancaria')).getByText('1 documento')).toBeInTheDocument();
    expect(within(grupo('Información financiera')).getByText('1 documento · 1 sección')).toBeInTheDocument();
    // Los íconos son los del menú lateral de la ficha.
    expect(grupo('Cuenta bancaria').querySelector('svg.lucide-credit-card')).toBeInTheDocument();
    expect(grupo('Información tributaria').querySelector('svg.lucide-receipt')).toBeInTheDocument();
    expect(grupo('Información financiera').querySelector('svg.lucide-wallet')).toBeInTheDocument();
    expect(grupo('Otros documentos').querySelector('svg.lucide-file-stack')).toBeInTheDocument();
  });

  it('la tarjeta resume lo que pide el flujo: documentos, secciones y los que tienen condición', () => {
    montar(<Estatico requisitos={requisitos} />);
    expect(screen.getByText('4 documentos · 1 sección · 1 con condición')).toBeInTheDocument();
  });

  it('sin requisitos solo explica qué pasa y ofrece agregar', () => {
    montar(<Estatico requisitos={[]} />);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByText(/Sin documentos, cada área aprueba/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar' })).toBeInTheDocument();
  });

  it('dentro del grupo la sección de la información va primero y se ve distinta de un documento', () => {
    montar(<Estatico requisitos={requisitos} />);
    const [primera, segunda] = within(grupo('Información financiera')).getAllByRole('region');
    if (!primera || !segunda) throw new Error('faltan las filas');
    expect(primera).toHaveAccessibleName('Información financiera');
    expect(primera).toHaveAttribute('data-seccion-de-informacion');
    expect(within(primera).getByText('Sección de la información')).toBeInTheDocument();
    expect(primera.querySelector('svg.lucide-clipboard-list')).toBeInTheDocument();
    expect(segunda).toHaveAccessibleName('Estados financieros');
    expect(segunda).not.toHaveAttribute('data-seccion-de-informacion');
    expect(within(segunda).queryByText('Sección de la información')).not.toBeInTheDocument();
    expect(segunda.querySelector('svg.lucide-file-text')).toBeInTheDocument();
  });

  it('una fila cerrada resume el requisito (obligatorio, a quién se pide, quién lo revisa) y no muestra controles', () => {
    montar(<Estatico requisitos={requisitos} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(fila('Registro Único Tributario')).toHaveTextContent('Opcional · Se pide a todos · Lo revisa Compras');
    expect(fila('Estados financieros')).toHaveTextContent('Obligatorio · Se pide a todos · Lo revisan todas las áreas');
    // Lo que se sale de lo común va en una etiqueta: la condición («Se pide a»).
    expect(fila('Certificado de alturas')).toHaveTextContent('Solo personas jurídicas');
    expect(fila('Certificado de alturas')).toHaveTextContent('Obligatorio · Lo revisan todas las áreas');
    expect(fila('Certificación bancaria')).toHaveTextContent('Soporte de secciones');
    expect(fila('Registro Único Tributario')).toHaveAttribute('aria-expanded', 'false');
  });

  it('editar abre la fila con todos sus controles y solo hay una abierta a la vez', () => {
    montar(<Estatico requisitos={requisitos} />);
    abrir('Registro Único Tributario');
    expect(fila('Registro Único Tributario')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' })).toHaveTextContent('Registro Único Tributario');
    expect(screen.getByRole('combobox', { name: 'Lo revisan' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Se pide a' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Aprobadores' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Obligatorio' })).not.toBeChecked();

    abrir('Estados financieros');
    expect(fila('Registro Único Tributario')).toHaveAttribute('aria-expanded', 'false');
    expect(fila('Estados financieros')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('combobox', { name: 'Tipo de documento' })).toHaveLength(1);
    expect(screen.getByRole('combobox', { name: 'Tipo de documento' })).toHaveTextContent('Estados financieros');

    abrir('Estados financieros');
    expect(screen.queryByRole('combobox', { name: 'Tipo de documento' })).not.toBeInTheDocument();
  });

  it('el cambio de una fila abierta vuelve al borrador en su posición y en el orden original, no en el del sector', () => {
    const onCambiar = vi.fn();
    montar(<Estatico requisitos={requisitos} onCambiar={onCambiar} />);
    abrir('Registro Único Tributario');
    fireEvent.click(screen.getByRole('switch', { name: 'Obligatorio' }));
    const enviado = onCambiar.mock.lastCall?.[0] as RequisitoEnEditor[];
    expect(enviado.map((r) => r.clave)).toEqual(['alturas', 'estados', 'rut', 'sec-fin', 'bancaria']);
    expect(enviado.map((r) => r.obligatorio)).toEqual([true, true, true, true, true]);
    // Lo demás queda tal cual (mismos objetos) y lo que se envía a la API conserva el orden del borrador.
    expect(enviado.filter((_, i) => i !== 2).every((r, i) => r === requisitos[[0, 1, 3, 4][i]!])).toBe(true);
    expect(requisitosADto(enviado).map((r) => r.seccion ?? r.tipoDocumentoTenantId)).toEqual(['alturas', 'estados', 'rut', 'FICHA_FINANCIERA', 'bancaria']);
  });

  it('quitar saca el requisito sin abrir la fila y lo que sigue abierto sigue siendo el mismo', () => {
    const alCambiar = vi.fn();
    montar(<Controlado inicial={requisitos} alCambiar={alCambiar} />);
    abrir('Estados financieros');
    fireEvent.click(within(screen.getByRole('region', { name: 'Certificación bancaria' })).getByRole('button', { name: 'Quitar documento' }));
    expect((alCambiar.mock.lastCall?.[0] as RequisitoEnEditor[]).map((r) => r.clave)).toEqual(['alturas', 'estados', 'rut', 'sec-fin']);
    expect(nombresDeGrupos()).toEqual(['Información tributaria', 'Información financiera', 'Otros documentos']);
    expect(fila('Estados financieros')).toHaveAttribute('aria-expanded', 'true');
  });

  it('en solo lectura no se agrega ni se quita, pero las filas se abren para verlas con sus controles apagados', () => {
    montar(<Estatico requisitos={requisitos} soloLectura />);
    expect(screen.queryByRole('button', { name: 'Agregar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Agregar documento a/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar documento' })).not.toBeInTheDocument();
    abrir('Registro Único Tributario');
    expect(screen.getByRole('switch', { name: 'Obligatorio' })).toBeDisabled();
  });
});

describe('EditorRequisitos: errores', () => {
  const requisitos = [doc('alturas', 'alturas'), doc('rut', 'rut'), doc('estados', 'estados'), seccion('FICHA_FINANCIERA', 'sec-fin'), doc('bancaria', 'bancaria')];
  const sinTipo: ErrorFlujo = { codigo: 'condicion-invalida', campo: 'requisito.1' };
  const duplicado: ErrorFlujo = { codigo: 'requisito-duplicado', campo: 'requisito.4' };

  it('un requisito con error se abre solo y muestra el error; el primero que se ve, no el primero del borrador', () => {
    montar(<Estatico requisitos={requisitos} errores={[sinTipo, duplicado]} />);
    // «Certificación bancaria» (posición 4) está en un sector que va antes que el del RUT (posición 1).
    expect(fila('Certificación bancaria')).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('region', { name: 'Certificación bancaria' })).getByText('Ese documento ya está en la lista.')).toBeInTheDocument();
    expect(fila('Registro Único Tributario')).toHaveAttribute('aria-expanded', 'false');
  });

  it('el resumen de la fila también marca el error, con su mensaje, abierta o cerrada', () => {
    montar(<Estatico requisitos={requisitos} errores={[sinTipo, duplicado]} />);
    const rut = within(screen.getByRole('region', { name: 'Registro Único Tributario' }));
    expect(rut.getByText('Con errores').closest('.MuiChip-root')).toHaveAttribute('title', expect.stringContaining('La condición no es válida'));
    expect(within(screen.getByRole('region', { name: 'Certificación bancaria' })).getByText('Con errores')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Estados financieros' })).queryByText('Con errores')).not.toBeInTheDocument();
  });

  it('abre solo el que recibe un error nuevo y no vuelve a abrir uno que se cerró mientras los errores sean los mismos', () => {
    const { rerender } = montar(<Estatico requisitos={requisitos} errores={[duplicado]} />);
    expect(fila('Certificación bancaria')).toHaveAttribute('aria-expanded', 'true');

    abrir('Estados financieros');
    rerender(<Estatico requisitos={requisitos} errores={[{ ...duplicado }]} />);
    expect(fila('Estados financieros')).toHaveAttribute('aria-expanded', 'true');

    rerender(<Estatico requisitos={requisitos} errores={[duplicado, sinTipo]} />);
    expect(fila('Registro Único Tributario')).toHaveAttribute('aria-expanded', 'true');
    expect(fila('Estados financieros')).toHaveAttribute('aria-expanded', 'false');
  });

  it('un error de los periodos de una sección también abre la fila de la sección', () => {
    montar(<Estatico requisitos={requisitos} errores={[{ codigo: 'periodos-invalidos', campo: 'requisito.3.periodos' }]} />);
    expect(fila('Información financiera')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('textbox', { name: 'Periodos' })).toHaveAccessibleDescription('Entre 1 y 5 periodos.');
  });
});

describe('EditorRequisitos: agregar', () => {
  const requisitos = [doc('rut', 'rut'), doc('estados', 'estados')];

  async function agregarDesdeElMenu() {
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Documento' }));
  }

  /** «Agregar» › «Sección de la información» › la sección (un submenú con las que el flujo aún no pide). */
  async function agregarSeccionDesdeElMenu(nombre: string) {
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sección de la información' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: nombre }));
  }

  const abrirElSubmenu = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Sección de la información/ }));
    return within(await screen.findByRole('menu', { name: 'Secciones de la información que el flujo aún no pide' }));
  };

  it('un solo botón «Agregar» ofrece «Documento» y «Sección de la información»', async () => {
    montar(<Estatico requisitos={requisitos} />);
    expect(screen.getAllByRole('button', { name: 'Agregar' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect((await screen.findAllByRole('menuitem')).map((m) => m.textContent)).toEqual(['Documento', 'Sección de la información']);
  });

  it('«Documento» suma un documento sin tipo al final del borrador y lo deja abierto en «Por completar», al principio de la lista', async () => {
    const alCambiar = vi.fn();
    montar(<Controlado inicial={requisitos} alCambiar={alCambiar} />);
    await agregarDesdeElMenu();
    expect(alCambiar).toHaveBeenLastCalledWith([requisitos[0], requisitos[1], expect.objectContaining({ tipoDocumentoTenantId: '', seccion: null, obligatorio: true })]);
    expect(nombresDeGrupos()).toEqual(['Por completar', 'Información tributaria', 'Información financiera']);
    expect(filasDe('Por completar')).toEqual(['Documento nuevo']);
    expect(within(grupo('Por completar')).getByText('1 documento · Elige su tipo para ubicarlo en su sector')).toBeInTheDocument();
    expect(within(grupo('Por completar')).queryByRole('button', { name: /^Agregar documento a/ })).not.toBeInTheDocument();
    expect(fila('Documento nuevo')).toHaveAttribute('aria-expanded', 'true');
    expect(within(screen.getByRole('region', { name: 'Documento nuevo' })).getByRole('combobox', { name: 'Tipo de documento' })).toBeInTheDocument();
  });

  it('al elegir el tipo del documento nuevo la fila pasa a su sector, sigue abierta y «Por completar» desaparece', async () => {
    montar(<Controlado inicial={requisitos} alCambiar={vi.fn()} />);
    await agregarDesdeElMenu();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de documento' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Certificación bancaria' }));
    expect(nombresDeGrupos()).toEqual(['Cuenta bancaria', 'Información tributaria', 'Información financiera']);
    expect(fila('Certificación bancaria')).toHaveAttribute('aria-expanded', 'true');
    expect(filasDe('Cuenta bancaria')).toEqual(['Certificación bancaria']);
  });

  it('«Otros documentos» queda para los de un tipo propio: un documento nuevo sin tipo no cae ahí y, con un tipo propio, sí', async () => {
    montar(<Controlado inicial={[doc('rut', 'rut')]} alCambiar={vi.fn()} />);
    await agregarDesdeElMenu();
    expect(nombresDeGrupos()).toEqual(['Por completar', 'Información tributaria']);
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de documento' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Certificado de alturas' }));
    expect(nombresDeGrupos()).toEqual(['Información tributaria', 'Otros documentos']);
    expect(filasDe('Otros documentos')).toEqual(['Certificado de alturas']);
  });

  it('«Sección de la información» abre un submenú con las secciones que el flujo aún no pide, cada una con el ícono de su sector', async () => {
    montar(<Estatico requisitos={[doc('rut', 'rut'), seccion('FICHA_FINANCIERA', 'sec-fin')]} />);
    const submenu = await abrirElSubmenu();
    const habilitadas = submenu.getAllByRole('menuitem').filter((i) => i.getAttribute('aria-disabled') !== 'true');
    expect(habilitadas.map((i) => i.textContent)).toEqual(['Información general', 'Especialidades', 'Seguridad y salud en el trabajo', 'Información tributaria', 'Información legal']);
    // El ícono es el de su sector en el menú lateral de la ficha.
    const iconoDe = (nombre: string) => submenu.getByRole('menuitem', { name: new RegExp(`^${nombre}`) }).querySelector('svg');
    expect(iconoDe('Información general')).toHaveClass('lucide-landmark');
    expect(iconoDe('Especialidades')).toHaveClass('lucide-landmark');
    expect(iconoDe('Seguridad y salud en el trabajo')).toHaveClass('lucide-hard-hat');
    expect(iconoDe('Información tributaria')).toHaveClass('lucide-receipt');
    expect(iconoDe('Información legal')).toHaveClass('lucide-scale');
  });

  it('una sección que el flujo ya pide sale apagada con «Ya se pide»', async () => {
    montar(<Estatico requisitos={[seccion('FICHA_FINANCIERA', 'sec-fin')]} />);
    const submenu = await abrirElSubmenu();
    const pedida = submenu.getByRole('menuitem', { name: /^Información financiera/ });
    expect(pedida).toHaveAttribute('aria-disabled', 'true');
    expect(pedida).toHaveTextContent('Ya se pide');
    expect(submenu.getByRole('menuitem', { name: 'Información tributaria' })).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('si el flujo ya pide todas las secciones, el ítem queda apagado y lo explica', async () => {
    const todas = ['FICHA_GENERAL', 'FICHA_ESPECIALIDADES', 'FICHA_SST', 'FICHA_TRIBUTARIA', 'FICHA_FINANCIERA', 'FICHA_LEGAL'].map((c) => seccion(c, c));
    montar(<Estatico requisitos={todas} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const item = await screen.findByRole('menuitem', { name: /^Sección de la información/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveTextContent('Ya se piden todas');
  });

  it('elegir una sección la crea con la sección puesta, abierta y dentro de su sector: nunca hay una sección sin sector', async () => {
    const alCambiar = vi.fn();
    montar(<Controlado inicial={requisitos} alCambiar={alCambiar} />);
    await agregarSeccionDesdeElMenu('Información tributaria');
    expect(alCambiar).toHaveBeenLastCalledWith([requisitos[0], requisitos[1], expect.objectContaining({ seccion: 'FICHA_TRIBUTARIA', tipoDocumentoTenantId: '' })]);
    expect(nombresDeGrupos()).toEqual(['Información tributaria', 'Información financiera']);
    expect(filasDe('Información tributaria')).toEqual(['Información tributaria', 'Registro Único Tributario']);
    expect(screen.queryByRole('region', { name: 'Sección nueva' })).not.toBeInTheDocument();
    const nueva = screen.getByRole('region', { name: 'Información tributaria' });
    expect(nueva).toHaveAttribute('data-seccion-de-informacion');
    expect(fila('Información tributaria')).toHaveAttribute('aria-expanded', 'true');
    expect(within(nueva).getByRole('combobox', { name: 'Sección de la información del tercero' })).toHaveTextContent('Información tributaria');
    // La que ya se pide sale apagada la próxima vez.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Sección de la información/ }));
    expect(await screen.findByRole('menuitem', { name: /^Información tributaria/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('«Otros documentos» nunca cuenta secciones, ni siquiera una sección de la ficha que no tiene sector propio', () => {
    const todas = ['FICHA_GENERAL', 'FICHA_ESPECIALIDADES', 'FICHA_SST', 'FICHA_TRIBUTARIA', 'FICHA_FINANCIERA', 'FICHA_LEGAL'].map((c) => seccion(c, c));
    montar(<Estatico requisitos={[doc('alturas', 'alturas'), ...todas]} />);
    expect(nombresDeGrupos()).toEqual(['Información general', 'Seguridad industrial y SST', 'Información tributaria', 'Información financiera', 'Información legal', 'Otros documentos']);
    expect(within(grupo('Otros documentos')).getByText('1 documento')).toBeInTheDocument();
    expect(filasDe('Otros documentos')).toEqual(['Certificado de alturas']);
    expect(within(grupo('Información general')).getByText('2 secciones')).toBeInTheDocument();
  });

  it('cada sector tiene su «Agregar documento a …»: el documento nuevo se queda en ese sector mientras no se elige su tipo', () => {
    const alCambiar = vi.fn();
    montar(<Controlado inicial={[doc('rut', 'rut')]} alCambiar={alCambiar} />);
    // En Información tributaria quedan por pedir la Constancia y la Declaración de renta: no se elige una por la persona.
    fireEvent.click(screen.getByRole('button', { name: 'Agregar documento a Información tributaria' }));
    expect(alCambiar).toHaveBeenLastCalledWith([expect.anything(), expect.objectContaining({ tipoDocumentoTenantId: '', seccion: null })]);
    expect(nombresDeGrupos()).toEqual(['Información tributaria']);
    expect(filasDe('Información tributaria')).toEqual(['Registro Único Tributario', 'Documento nuevo']);
    expect(fila('Documento nuevo')).toHaveAttribute('aria-expanded', 'true');
  });

  it('si al sector solo le queda un tipo por pedir, el documento nuevo ya lo trae elegido', () => {
    const alCambiar = vi.fn();
    montar(<Controlado inicial={[doc('rut', 'rut'), doc('constancia', 'constancia')]} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar documento a Información tributaria' }));
    expect(alCambiar).toHaveBeenLastCalledWith([expect.anything(), expect.anything(), expect.objectContaining({ tipoDocumentoTenantId: 'renta' })]);
    expect(filasDe('Información tributaria')).toEqual(['Registro Único Tributario', 'Constancia de régimen', 'Declaración de renta']);
    expect(fila('Declaración de renta')).toHaveAttribute('aria-expanded', 'true');
  });

  it('«Otros documentos» también agrega, en el mismo grupo', () => {
    const alCambiar = vi.fn();
    montar(<Controlado inicial={[doc('alturas', 'alturas')]} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar documento a Otros documentos' }));
    // El único tipo propio de la empresa ya se pide: el nuevo queda sin elegir.
    expect(alCambiar).toHaveBeenLastCalledWith([expect.anything(), expect.objectContaining({ tipoDocumentoTenantId: '' })]);
    expect(filasDe('Otros documentos')).toEqual(['Certificado de alturas', 'Documento nuevo']);
  });
});

describe('EditorRequisitos: el submenú de las secciones no tapa el menú principal', () => {
  const requisitos = [doc('rut', 'rut')];
  const anchoInicial = window.innerWidth;

  afterEach(() => {
    vi.restoreAllMocks();
    window.innerWidth = anchoInicial;
  });

  /** jsdom no mide: el menú principal (su papel) y su ítem «Sección de la información» ocupan donde se diga. */
  function medir({ ancho, menu, itemTop }: { ancho: number; menu: { left: number; right: number }; itemTop: number }) {
    window.innerWidth = ancho;
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const caja = this.classList.contains('MuiPaper-root') ? { left: menu.left, right: menu.right, top: 0 } : this.getAttribute('role') === 'menuitem' ? { left: 0, right: 0, top: itemTop } : { left: 0, right: 0, top: 0 };
      return { ...caja, bottom: caja.top, width: caja.right - caja.left, height: 0, x: caja.left, y: caja.top, toJSON: () => ({}) };
    });
  }

  async function abrirElItemDeSecciones() {
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const item = await screen.findByRole('menuitem', { name: /^Sección de la información/ });
    fireEvent.click(item);
    return item;
  }

  const papelDe = (menu: HTMLElement) => menu.closest<HTMLElement>('.MuiPaper-root')!;

  it('el menú principal es lo bastante ancho para leer «Sección de la información» completo', async () => {
    montar(<Estatico requisitos={requisitos} />);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    const principal = papelDe(await screen.findByRole('menu'));
    expect(principal).toHaveStyle({ minWidth: '264px' });
    expect(within(principal).getByText('Sección de la información')).toBeInTheDocument();
  });

  it('se abre a la derecha, pegado al borde del menú y a la altura de su ítem', async () => {
    medir({ ancho: 1440, menu: { left: 100, right: 364 }, itemTop: 500 });
    montar(<Estatico requisitos={requisitos} />);
    await abrirElItemDeSecciones();
    const submenu = await screen.findByRole('menu', { name: 'Secciones de la información que el flujo aún no pide' });
    expect(papelDe(submenu)).toHaveStyle({ left: '368px', top: '492px', width: '280px' });
  });

  it('si a la derecha no cabe, se abre a la izquierda, pegado al otro borde del menú', async () => {
    medir({ ancho: 1000, menu: { left: 700, right: 964 }, itemTop: 300 });
    montar(<Estatico requisitos={requisitos} />);
    await abrirElItemDeSecciones();
    const submenu = await screen.findByRole('menu', { name: 'Secciones de la información que el flujo aún no pide' });
    // La esquina derecha del submenú toca el borde izquierdo del menú: sin tapar el menú.
    expect(papelDe(submenu)).toHaveStyle({ left: '696px', top: '292px' });
  });

  it('en un celular las secciones van debajo del ítem, dentro del mismo menú, y se agregan desde ahí', async () => {
    medir({ ancho: 375, menu: { left: 16, right: 310 }, itemTop: 400 });
    const alCambiar = vi.fn();
    montar(<Controlado inicial={requisitos} alCambiar={alCambiar} />);
    const item = await abrirElItemDeSecciones();
    expect(item).toHaveAttribute('aria-expanded', 'true');
    // Un solo menú: nada se superpone.
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    const menu = within(screen.getByRole('menu'));
    expect(menu.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'Documento',
      'Sección de la información',
      'Información general',
      'Especialidades',
      'Seguridad y salud en el trabajo',
      'Información tributaria',
      'Información financiera',
      'Información legal',
    ]);
    fireEvent.click(menu.getByRole('menuitem', { name: 'Información tributaria' }));
    expect(alCambiar).toHaveBeenLastCalledWith([requisitos[0], expect.objectContaining({ seccion: 'FICHA_TRIBUTARIA' })]);
    expect(nombresDeGrupos()).toEqual(['Información tributaria']);
  });

  it('el ítem de las secciones se pliega al tocarlo otra vez cuando van debajo', async () => {
    medir({ ancho: 375, menu: { left: 16, right: 310 }, itemTop: 400 });
    montar(<Estatico requisitos={requisitos} />);
    const item = await abrirElItemDeSecciones();
    expect(screen.getByRole('menuitem', { name: 'Información general' })).toBeInTheDocument();
    fireEvent.click(item);
    expect(item).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem', { name: 'Información general' })).not.toBeInTheDocument();
  });
});
