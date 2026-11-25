import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { vigencia } from '../expedientes/datosPrueba';
import { CHIP_VIGENCIA, estaPorAprobar, estadoVigencia, etiquetaVigencia, explicacionVigencia, requiereAviso, severidadAviso, textoAvisoVigencia, textoVencimiento } from './vigencia';

const t = i18n.t.bind(i18n);

describe('texto de la vigencia', () => {
  it('vigente o por vencer: «Vence el …» con el día calendario (sin correrlo por zona)', () => {
    expect(textoVencimiento(vigencia(), t)).toBe('Vence el 30/11/2026');
    expect(textoVencimiento(vigencia({ estado: 'PorVencer' }), t)).toBe('Vence el 30/11/2026');
  });

  it('en gracia o vencida: «Venció el …»', () => {
    expect(textoVencimiento(vigencia({ estado: 'EnGracia', diasGracia: 5, finDeGracia: '2026-12-05' }), t)).toBe('Venció el 30/11/2026');
    expect(textoVencimiento(vigencia({ estado: 'Vencida' }), t)).toBe('Venció el 30/11/2026');
  });

  it('sin fecha: lo dice', () => {
    expect(textoVencimiento(vigencia({ vigenteHasta: null, estado: 'SinVencimiento', base: 'SinVencimiento' }), t)).toBe('Sin fecha de vencimiento');
  });

  it('sin fecha porque la empresa aún no lo aprueba: dice cuánto después de aprobarlo vence (revalidar cada N días, TD-10)', () => {
    const sinAprobar = { vigenteHasta: null, estado: 'SinVencimiento', base: 'SinVencimiento' };
    expect(textoVencimiento(vigencia({ ...sinAprobar, revalidarCadaDias: 365 }), t)).toBe('Vence 1 año después de que lo apruebes');
    expect(textoVencimiento(vigencia({ ...sinAprobar, revalidarCadaDias: 90 }), t)).toBe('Vence 90 días después de que lo apruebes');
  });

  it('mientras la empresa no aprueba, el chip y la explicación no dicen que el documento no vence (TD-10)', () => {
    const sinAprobar = vigencia({ vigenteHasta: null, estado: 'SinVencimiento', base: 'SinVencimiento', revalidarCadaDias: 365 });
    expect(estaPorAprobar(sinAprobar)).toBe(true);
    expect(etiquetaVigencia(sinAprobar, t)).toBe('Sin fecha aún');
    expect(explicacionVigencia(sinAprobar, t)).toBe('Empieza a contar cuando tu empresa apruebe el documento.');
    // Sin regla de revalidación, o con fecha ya calculada, sigue siendo lo de siempre.
    const sinRegla = vigencia({ vigenteHasta: null, estado: 'SinVencimiento', base: 'SinVencimiento' });
    expect(estaPorAprobar(sinRegla)).toBe(false);
    expect(explicacionVigencia(sinRegla, t)).toBe('Este tipo de documento no vence.');
    expect(estaPorAprobar(vigencia({ base: 'Aprobacion', revalidarCadaDias: 365 }))).toBe(false);
  });

  it('la base explica que la fecha cuenta desde la aprobación o la ratificación', () => {
    expect(explicacionVigencia(vigencia({ base: 'Aprobacion' }), t)).toBe('Calculada desde que tu empresa aprobó el documento (revalidar cada N días).');
    expect(explicacionVigencia(vigencia({ base: 'Ratificacion' }), t)).toBe('Calculada desde que el tercero confirmó que el documento no cambió.');
  });

  it('el chip dice el estado y la fecha que importa (en gracia, hasta cuándo se acepta)', () => {
    expect(etiquetaVigencia(vigencia(), t)).toBe('Vigente · 30/11/2026');
    expect(etiquetaVigencia(vigencia({ estado: 'PorVencer' }), t)).toBe('Por vencer · 30/11/2026');
    expect(etiquetaVigencia(vigencia({ estado: 'EnGracia', diasGracia: 5, finDeGracia: '2026-12-05' }), t)).toBe('En gracia · hasta el 05/12/2026');
    expect(etiquetaVigencia(vigencia({ estado: 'Vencida' }), t)).toBe('Vencida · 30/11/2026');
    expect(etiquetaVigencia(vigencia({ vigenteHasta: null, estado: 'SinVencimiento', base: 'SinVencimiento' }), t)).toBe('Sin vencimiento');
  });

  it('la base explica de dónde sale la fecha, con los días de gracia', () => {
    expect(explicacionVigencia(vigencia(), t)).toBe('Calculada desde la fecha de expedición que declaró el tercero.');
    expect(explicacionVigencia(vigencia({ base: 'FechaCarga', diasGracia: 1 }), t)).toBe(
      'Calculada desde la fecha en que el tercero cargó el documento. Tiene 1 día de gracia después del vencimiento.',
    );
    expect(explicacionVigencia(vigencia({ base: 'VencimientoPropio', diasGracia: 10 }), t)).toBe(
      'Es la fecha de vencimiento que declaró el tercero. Tiene 10 días de gracia después del vencimiento.',
    );
    expect(explicacionVigencia(vigencia({ base: 'Desconocida' }), t)).toBe('');
  });
});

describe('estado y aviso de la vigencia', () => {
  it('avisa por vencer, en gracia y vencida; no en vigente ni sin vencimiento', () => {
    expect(requiereAviso(vigencia({ estado: 'PorVencer' }))).toBe(true);
    expect(requiereAviso(vigencia({ estado: 'EnGracia' }))).toBe(true);
    expect(requiereAviso(vigencia({ estado: 'Vencida' }))).toBe(true);
    expect(requiereAviso(vigencia())).toBe(false);
    expect(requiereAviso(vigencia({ estado: 'SinVencimiento' }))).toBe(false);
    expect(textoAvisoVigencia(vigencia(), t)).toBeNull();
  });

  it('el aviso en gracia dice hasta cuándo; vencida es error', () => {
    expect(textoAvisoVigencia(vigencia({ estado: 'PorVencer' }), t)).toBe('Vence pronto: el 30/11/2026.');
    expect(textoAvisoVigencia(vigencia({ estado: 'EnGracia', diasGracia: 5, finDeGracia: '2026-12-05' }), t)).toBe(
      'Venció el 30/11/2026. Está en periodo de gracia hasta el 05/12/2026.',
    );
    expect(textoAvisoVigencia(vigencia({ estado: 'Vencida' }), t)).toBe('Venció el 30/11/2026: ya no está vigente para este vínculo.');
    expect(severidadAviso(vigencia({ estado: 'Vencida' }))).toBe('error');
    expect(severidadAviso(vigencia({ estado: 'EnGracia' }))).toBe('warning');
  });

  it('cada estado tiene su chip canónico; un estado desconocido se ignora', () => {
    expect(CHIP_VIGENCIA.PorVencer).toBe('PorVencer');
    expect(CHIP_VIGENCIA.Vencida).toBe('Vencida');
    expect(CHIP_VIGENCIA.EnGracia).not.toBe(CHIP_VIGENCIA.PorVencer);
    expect(estadoVigencia({ estado: 'Caducada' })).toBeNull();
    expect(requiereAviso({ estado: 'Caducada' })).toBe(false);
  });
});
