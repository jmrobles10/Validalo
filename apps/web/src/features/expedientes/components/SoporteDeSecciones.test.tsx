import { ThemeProvider } from '@mui/material';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CampoCruzadoDto, CruceDeSeccionDto, SeccionRespaldadaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { seAbreSola } from '../resumenDeCruce';
import { SoporteDeSecciones } from './SoporteDeSecciones';

type Resultado = CampoCruzadoDto['resultado'];

const campo = (etiqueta: string, resultado: Resultado, critico = false, declarado: string | null = 'x', extraido: string | null = 'x'): CampoCruzadoDto => ({
  campo: etiqueta.toLowerCase(),
  etiqueta,
  declarado,
  extraido: resultado === 'NoVerificable' ? null : extraido,
  resultado,
  critico,
  detalle: null,
});

const cruceDe = (campos: CampoCruzadoDto[], legible = true): CruceDeSeccionDto => ({
  documentoId: 'doc-rut',
  versionDocumento: 1,
  tipoDocumento: 'RUT',
  nombreDocumento: 'Registro Único Tributario',
  confianza: 0.98,
  legible,
  fecha: '2026-11-25T15:00:00Z',
  coincidencias: campos.filter((c) => c.resultado === 'Coincide').length,
  discrepancias: campos.filter((c) => c.resultado === 'Discrepa').length,
  noVerificables: campos.filter((c) => c.resultado === 'NoVerificable').length,
  discrepanciaCritica: campos.some((c) => c.critico && c.resultado === 'Discrepa'),
  campos,
});

const iguales = (n: number): CampoCruzadoDto[] => Array.from({ length: n }, (_, i) => campo(`Campo ${String(i + 1)}`, 'Coincide', i < 2));

const seccion = (codigo: string, nombre: string, cruce: CruceDeSeccionDto | null, version: number | null = 1): SeccionRespaldadaDto => ({ seccion: codigo, nombre, periodo: null, version, cruce });

/** Como el RUT de ATLAS: la general con 9 que coinciden y 1 que difiere sin ser crítico, y la tributaria y la legal que coinciden por completo. */
const RUT_DE_ATLAS = [
  seccion('FICHA_GENERAL', 'Información general', cruceDe([...iguales(9), campo('Actividades económicas secundarias', 'Discrepa', false, null, '8129, 4330, 4799')])),
  seccion('FICHA_TRIBUTARIA', 'Información tributaria', cruceDe(iguales(3))),
  seccion('FICHA_LEGAL', 'Información legal', cruceDe(iguales(2))),
];

function montar(secciones: SeccionRespaldadaDto[], campoExtra: CampoCruzadoDto | null = null) {
  return render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <SoporteDeSecciones soporte={{ sinAnalisis: false, discrepanciaCritica: false, secciones }} compacto campoExtra={campoExtra} />
    </ThemeProvider>,
  );
}

const filaDe = (nombre: RegExp) => screen.getByRole('button', { name: nombre }).closest('li')!;

describe('Soporte de las secciones: cada sección es una línea de resumen que se despliega', () => {
  it('cada sección con cruce es una línea «Sección · versión n» con su chip y sus conteos', () => {
    montar(RUT_DE_ATLAS);

    const general = filaDe(/Información general/);
    expect(general).toHaveTextContent('Información general · versión 1');
    expect(general).toHaveTextContent('Difiere en 1 campo');
    expect(general).toHaveTextContent('9 coinciden · 1 difiere');
    const tributaria = filaDe(/Información tributaria/);
    expect(tributaria).toHaveTextContent('Información tributaria · versión 1');
    expect(tributaria).toHaveTextContent('Coincide');
    expect(tributaria).toHaveTextContent('3 coinciden');
    expect(tributaria).not.toHaveTextContent('difiere');
  });

  it('abre solo la que tiene diferencias; las que coinciden por completo quedan cerradas, sin su tabla', () => {
    montar(RUT_DE_ATLAS);

    expect(screen.getByRole('button', { name: /Información general/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Información tributaria/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: /Información legal/ })).toHaveAttribute('aria-expanded', 'false');
    expect(within(filaDe(/Información general/)).getByRole('table')).toBeInTheDocument();
    expect(within(filaDe(/Información tributaria/)).queryByRole('table')).not.toBeInTheDocument();
    expect(within(filaDe(/Información legal/)).queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('table')).toHaveLength(1);
  });

  it('una sección cerrada se abre y se vuelve a cerrar con su línea', async () => {
    const usuario = userEvent.setup();
    montar(RUT_DE_ATLAS);

    await usuario.click(screen.getByRole('button', { name: /Información tributaria/ }));
    expect(within(filaDe(/Información tributaria/)).getByRole('table')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: /Información general/ }));
    expect(within(filaDe(/Información general/)).queryByRole('table')).not.toBeInTheDocument();
  });

  it('lo que no se pudo verificar o un documento que no se lee también abren la sección', () => {
    montar([
      seccion('FICHA_GENERAL', 'Información general', cruceDe([...iguales(2), campo('Dirección', 'NoVerificable')])),
      seccion('FICHA_TRIBUTARIA', 'Información tributaria', cruceDe(iguales(2), false)),
      seccion('FICHA_LEGAL', 'Información legal', cruceDe(iguales(2))),
    ]);

    expect(screen.getByRole('button', { name: /Información general/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Información tributaria/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /Información legal/ })).toHaveAttribute('aria-expanded', 'false');
    expect(filaDe(/Información general/)).toHaveTextContent('2 coinciden · 1 sin verificar');
  });

  it('la antigüedad que no cumple abre la primera sección con tabla, que es la que la lleva como una fila más', () => {
    const antiguedad = campo('Antigüedad del documento', 'Discrepa', true, 'Máximo 30 días', '860 días');
    montar([seccion('FICHA_GENERAL', 'Información general', cruceDe(iguales(3))), seccion('FICHA_LEGAL', 'Información legal', cruceDe(iguales(2)))], antiguedad);

    expect(screen.getByRole('button', { name: /Información general/ })).toHaveAttribute('aria-expanded', 'true');
    expect(within(filaDe(/Información general/)).getByRole('row', { name: 'Antigüedad del documento: Difiere' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Información legal/ })).toHaveAttribute('aria-expanded', 'false');
  });

  it('con la antigüedad cumplida y todo coincidiendo todo queda cerrado', () => {
    montar([seccion('FICHA_GENERAL', 'Información general', cruceDe(iguales(3)))], campo('Antigüedad del documento', 'Coincide'));

    expect(screen.getByRole('button', { name: /Información general/ })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('la regla de apertura: solo lo que pide atención', () => {
    const base = { discrepancias: 0, noVerificables: 0, legible: true };
    expect(seAbreSola(base, null)).toBe(false);
    expect(seAbreSola({ ...base, discrepancias: 1 }, null)).toBe(true);
    expect(seAbreSola({ ...base, noVerificables: 1 }, null)).toBe(true);
    expect(seAbreSola({ ...base, legible: false }, null)).toBe(true);
    expect(seAbreSola(base, { resultado: 'Coincide' })).toBe(false);
    expect(seAbreSola(base, { resultado: 'NoVerificable' })).toBe(true);
  });

  it('el chip de una sección que coincide es neutro: sin el verde del éxito', () => {
    montar(RUT_DE_ATLAS);

    const chip = within(filaDe(/Información tributaria/)).getByText('Coincide', { selector: '.MuiChip-label' }).closest('.MuiChip-root')!;
    expect(chip.className).not.toEqual(expect.stringContaining('MuiChip-colorSuccess'));
    expect(chip.className).toEqual(expect.stringContaining('MuiChip-colorDefault'));
    // Las que difieren van en ámbar y las críticas en rojo.
    const difiere = within(filaDe(/Información general/)).getByText('Difiere en 1 campo', { selector: '.MuiChip-label' }).closest('.MuiChip-root')!;
    expect(difiere.className).toEqual(expect.stringContaining('MuiChip-colorWarning'));
  });
});

describe('La tabla del cruce: solo lo que difiere se resalta', () => {
  it('las filas que coinciden van sobrias y las que difieren o no se verifican, resaltadas', () => {
    montar([
      seccion('FICHA_GENERAL', 'Información general', cruceDe([campo('Número de identificación', 'Coincide', true), campo('Razón social', 'Discrepa', true), campo('Dirección', 'Discrepa'), campo('Teléfono', 'NoVerificable'), campo('Correo', 'Coincide')])),
    ]);

    const tabla = within(screen.getByRole('table'));
    const resaltada = (nombre: string) => tabla.getByRole('row', { name: new RegExp(`^${nombre}:`) }).getAttribute('data-resaltada');
    expect(resaltada('Número de identificación')).toBeNull();
    expect(resaltada('Correo')).toBeNull();
    // Un crítico que difiere, en rojo; uno que no es crítico o que no se pudo verificar, en ámbar.
    expect(resaltada('Razón social')).toBe('error');
    expect(resaltada('Dirección')).toBe('advertencia');
    expect(resaltada('Teléfono')).toBe('advertencia');
  });

  it('«Coincide» va en texto secundario con un check pequeño gris, y el resultado que difiere, en un color distinto', () => {
    montar([seccion('FICHA_GENERAL', 'Información general', cruceDe([campo('Correo', 'Coincide'), campo('Dirección', 'Discrepa')]))]);

    const tabla = within(screen.getByRole('table'));
    const coincide = tabla.getByRole('row', { name: 'Correo: Coincide' });
    const difiere = tabla.getByRole('row', { name: 'Dirección: Difiere' });
    expect(coincide.querySelector('svg')).not.toBeNull();
    expect(difiere.querySelector('svg')).toBeNull();
    const celda = (fila: HTMLElement) => fila.querySelectorAll('td')[3]!;
    expect(getComputedStyle(celda(coincide)).color).not.toBe(getComputedStyle(celda(difiere)).color);
    // Sin la barra lateral de color en lo que coincide.
    expect(['transparent', 'rgba(0, 0, 0, 0)']).toContain(getComputedStyle(coincide.querySelector('td')!).borderLeftColor);
    expect(['transparent', 'rgba(0, 0, 0, 0)']).not.toContain(getComputedStyle(difiere.querySelector('td')!).borderLeftColor);
  });
});
