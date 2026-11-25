import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import type { VigenciaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { AvisoVigencia, LineaVigencia } from './ChipVigencia';

/** La vigencia que calcula la API el 12/11/2026 para un certificado que vence 30 días después de expedido, con aviso a 10 días y 5 de gracia. */
const vigencia = (estado: string, vigenteHasta: string, finDeGracia: string): VigenciaDto => ({
  vigenteHasta,
  base: 'FechaExpedicion',
  estado,
  diasAviso: [10],
  diasGracia: 5,
  finDeGracia,
  vencidaEn: null,
});

function montar(v: VigenciaDto) {
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <LineaVigencia vigencia={v} />
      <AvisoVigencia vigencia={v} />
    </ThemeProvider>,
  );
}

describe('lo que ve el tercero mientras la empresa no aprueba un documento que se revalida cada año', () => {
  it('dice cuándo empezará a vencer, con el nombre de la empresa, en vez de «No vence»', () => {
    const sinAprobar: VigenciaDto = { vigenteHasta: null, base: 'SinVencimiento', estado: 'SinVencimiento', diasAviso: [30], diasGracia: 5, finDeGracia: null, vencidaEn: null, revalidarCadaDias: 365 };
    render(
      <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
        <LineaVigencia vigencia={sinAprobar} empresa="Constructora Norte" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Vence 1 año después de que Constructora Norte lo apruebe')).toBeInTheDocument();
    expect(screen.queryByText('No vence')).not.toBeInTheDocument();
  });

  it('una vez aprobado muestra la fecha que calculó la API', () => {
    const aprobada: VigenciaDto = {
      vigenteHasta: '2027-11-25',
      base: 'Aprobacion',
      estado: 'Vigente',
      diasAviso: [30],
      diasGracia: 5,
      finDeGracia: '2027-11-30',
      vencidaEn: null,
      aprobadaEn: '2026-11-25T10:00:00Z',
      revalidarCadaDias: 365,
    };
    render(
      <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
        <LineaVigencia vigencia={aprobada} empresa="Constructora Norte" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Vence el 25/11/2027')).toBeInTheDocument();
  });
});

describe('lo que ve el tercero de un documento según cuándo se expidió', () => {
  it.each([
    ['expedido hace 3 días', 'Vigente', 'Vence el 09/12/2026', null, vigencia('Vigente', '2026-12-09', '2026-12-14')],
    [
      'expedido hace 25 días',
      'Por vencer',
      'Vence el 17/11/2026',
      'Vence pronto: sube una versión nueva antes del 17/11/2026.',
      vigencia('PorVencer', '2026-11-17', '2026-11-22'),
    ],
    [
      'expedido hace 32 días',
      'En periodo de gracia',
      'Venció el 10/11/2026',
      'Ya venció. Tienes hasta el 15/11/2026 para subir una versión nueva.',
      vigencia('EnGracia', '2026-11-10', '2026-11-15'),
    ],
    ['expedido hace 40 días', 'Vencido', 'Venció el 02/11/2026', 'Está vencido: sube una versión nueva.', vigencia('Vencida', '2026-11-02', '2026-11-07')],
  ])('%s: el chip dice «%s», la línea «%s» y el aviso lo que hay que hacer', (_caso, chip, linea, aviso, v) => {
    montar(v);

    expect(screen.getByText(chip)).toBeInTheDocument();
    expect(screen.getByText(linea)).toBeInTheDocument();
    if (aviso === null) expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    else expect(screen.getByRole('alert')).toHaveTextContent(aviso);
  });
});
