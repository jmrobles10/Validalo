import type { VigenciaDto } from '@validalo/api-client';
import { formatearDiaCivil } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { detalleComparticion } from '../boveda/versiones';
import i18n from '../i18n';
import { avisoDeVigencia, ESTADO_DEL_CHIP, estadoDeVigencia, plazoEnPalabras, requiereAtencion, textoPorAprobar, textoSinVencimiento, textoVigencia } from './vigencia';

const t = i18n.t.bind(i18n);

const vigencia = (estado: string, cambios: Partial<VigenciaDto> = {}): VigenciaDto => ({
  vigenteHasta: '2026-12-31',
  base: 'FechaExpedicion',
  estado,
  diasAviso: [30, 7],
  diasGracia: 5,
  finDeGracia: '2027-01-05',
  vencidaEn: null,
  ...cambios,
});

describe('vigencia de un documento', () => {
  it('muestra las fechas sin hora tal cual, sin correrlas por la zona horaria', () => {
    expect(formatearDiaCivil('2026-12-31')).toBe('31/12/2026');
    expect(formatearDiaCivil('2026-11-08T15:00:00Z')).toBe('08/11/2026');
    // El texto que ve el tercero usa ese mismo día, no el anterior.
    const vigencia: VigenciaDto = { vigenteHasta: '2026-11-26', base: 'FechaCarga', estado: 'Vigente', diasAviso: [], diasGracia: 0, finDeGracia: null, vencidaEn: null };
    expect(textoVigencia(vigencia, t)).toContain('26/11/2026');
  });

  it('dice hasta cuándo sirve o cuándo venció', () => {
    expect(textoVigencia(vigencia('Vigente'), t)).toBe('Vence el 31/12/2026');
    expect(textoVigencia(vigencia('PorVencer'), t)).toBe('Vence el 31/12/2026');
    expect(textoVigencia(vigencia('EnGracia'), t)).toBe('Venció el 31/12/2026');
    expect(textoVigencia(vigencia('Vencida'), t)).toBe('Venció el 31/12/2026');
    expect(textoVigencia(vigencia('SinVencimiento', { vigenteHasta: null }), t)).toBeNull();
    expect(textoVigencia(vigencia('Vigente', { vigenteHasta: null, base: 'PeriodoNoCalculado' }), t)).toBeNull();
  });

  it('avisa qué hacer si está por vencer, en gracia o vencido', () => {
    expect(avisoDeVigencia(vigencia('Vigente'), t)).toBeNull();
    expect(avisoDeVigencia(vigencia('PorVencer'), t)).toEqual({ severidad: 'warning', texto: 'Vence pronto: sube una versión nueva antes del 31/12/2026.' });
    expect(avisoDeVigencia(vigencia('EnGracia'), t)).toEqual({ severidad: 'warning', texto: 'Ya venció. Tienes hasta el 05/01/2027 para subir una versión nueva.' });
    expect(avisoDeVigencia(vigencia('Vencida'), t)?.severidad).toBe('error');
    expect(requiereAtencion(vigencia('EnGracia'))).toBe(true);
    expect(requiereAtencion(vigencia('SinVencimiento'))).toBe(false);
  });

  it('usa estados del design system para el chip e ignora uno desconocido', () => {
    expect(ESTADO_DEL_CHIP.PorVencer).toBe('PorVencer');
    expect(ESTADO_DEL_CHIP.Vencida).toBe('Vencida');
    expect(estadoDeVigencia(vigencia('Renovando'))).toBeNull();
    expect(estadoDeVigencia(null)).toBeNull();
  });

  it('dice un plazo como se habla: años, meses o días', () => {
    expect(plazoEnPalabras(365, t)).toBe('1 año');
    expect(plazoEnPalabras(730, t)).toBe('2 años');
    expect(plazoEnPalabras(180, t)).toBe('6 meses');
    expect(plazoEnPalabras(60, t)).toBe('2 meses');
    expect(plazoEnPalabras(30, t)).toBe('30 días');
    expect(plazoEnPalabras(45, t)).toBe('45 días');
    expect(plazoEnPalabras(1, t)).toBe('1 día');
  });

  it('antes de que la empresa apruebe un documento que se revalida cada N días no hay fecha: dice cuándo empieza a contar', () => {
    const sinAprobar = vigencia('SinVencimiento', { vigenteHasta: null, base: 'SinVencimiento', finDeGracia: null, revalidarCadaDias: 365 });
    expect(textoPorAprobar(sinAprobar, 'Constructora Norte', t)).toBe('Vence 1 año después de que Constructora Norte lo apruebe');
    expect(textoPorAprobar(sinAprobar, null, t)).toBe('Vence 1 año después de que la empresa lo apruebe');
    expect(textoPorAprobar({ ...sinAprobar, revalidarCadaDias: 90 }, 'Norte', t)).toBe('Vence 3 meses después de que Norte lo apruebe');
    expect(textoPorAprobar({ ...sinAprobar, revalidarCadaDias: 45 }, 'Norte', t)).toBe('Vence 45 días después de que Norte lo apruebe');
    // En la tarjeta de la bóveda reemplaza a «No vence».
    expect(textoSinVencimiento(sinAprobar, t)).toBe('Vence 1 año después de que la empresa lo apruebe');
  });

  it('sin regla de revalidación, o con la fecha ya calculada, sigue diciendo lo de siempre', () => {
    const sinRegla = vigencia('SinVencimiento', { vigenteHasta: null, base: 'SinVencimiento', finDeGracia: null });
    expect(textoPorAprobar(sinRegla, 'Norte', t)).toBeNull();
    expect(textoSinVencimiento(sinRegla, t)).toBe('No vence');
    const aprobada = vigencia('Vigente', { base: 'Aprobacion', aprobadaEn: '2026-11-25T10:00:00Z', revalidarCadaDias: 365, vigenteHasta: '2027-11-25' });
    expect(textoPorAprobar(aprobada, 'Norte', t)).toBeNull();
    expect(textoVigencia(aprobada, t)).toBe('Vence el 25/11/2027');
  });

  it('en la bóveda, cada empresa dice hasta cuándo le sirve el documento solo si difiere de la cabecera, y por qué', () => {
    const empresa = { id: 'e1', nombre: 'Constructora Norte S.A.S.', logoUrl: null };
    const fila = { vinculoId: 'v1', empresa, compartido: true, version: 3, versionActualCompartida: true, compartidaEn: '2026-11-06T12:00:00Z', situacion: 'TieneVigente', otraVersion: null };
    expect(detalleComparticion({ ...fila, vigencia: vigencia('PorVencer') }, t)).toBe(
      'Tiene la versión 3, la vigente. Vence el 31/12/2026: su regla de vigencia cuenta desde la fecha de expedición.',
    );
    // Si es la misma fecha de la cabecera, no se repite.
    expect(detalleComparticion({ ...fila, vigencia: vigencia('PorVencer') }, t, '2026-12-31')).toBe('Tiene la versión 3, la vigente.');
    expect(detalleComparticion({ ...fila, vigencia: null }, t)).toBe('Tiene la versión 3, la vigente.');
  });
});
