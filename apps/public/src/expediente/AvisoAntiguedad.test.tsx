import { ThemeProvider } from '@mui/material';
import { render, screen } from '@testing-library/react';
import type { AntiguedadDocumentoDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { AvisoAntiguedad } from './AvisoAntiguedad';

const excedida: AntiguedadDocumentoDto = {
  estado: 'Excedida',
  maximoDias: 30,
  fechaExpedicion: '2024-07-17',
  dias: 860,
  fuente: 'Ia',
  fechaDeclarada: null,
  difiereDeLaDeclarada: false,
  critico: true,
  detalle: 'Expedida el 17/07/2024: 860 días; el máximo es 30.',
  mensaje: 'Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días.',
  campo: null,
};

function montar(antiguedad: AntiguedadDocumentoDto | null | undefined, decidido = false) {
  render(
    <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
      <AvisoAntiguedad antiguedad={antiguedad} decidido={decidido} />
    </ThemeProvider>,
  );
}

describe('aviso de antigüedad del documento que ve el tercero', () => {
  it('dice la fecha leída, los días frente al máximo y qué documento debe subir', () => {
    montar(excedida);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Expedida el 17/07/2024: 860 días; el máximo es 30. Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días.',
    );
  });

  it('si no se pudo leer la fecha, pide que el documento la muestre', () => {
    montar({
      ...excedida,
      estado: 'SinFecha',
      fechaExpedicion: null,
      dias: null,
      detalle: 'No se encontró la fecha de expedición.',
      mensaje: 'Sube el documento «Certificado de existencia y representación legal» expedido hace menos de 30 días y que muestre su fecha de expedición.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('que muestre su fecha de expedición');
  });

  it('no aparece si el documento cumple', () => {
    montar({ ...excedida, estado: 'Cumple', critico: false, mensaje: null });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('no repite lo que ya dice la observación de la empresa ni se queda cuando la empresa aprobó el documento', () => {
    montar(excedida, true);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin antigüedad no pinta nada', () => {
    montar(null);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
