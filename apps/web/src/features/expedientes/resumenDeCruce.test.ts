import type { CampoCruzadoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { resumirCruce, textoDelResumen, tonoDelResumen } from './resumenDeCruce';

type Resultado = 'Coincide' | 'Discrepa' | 'NoVerificable';

const campo = (codigo: string, etiqueta: string, resultado: Resultado, critico: boolean): CampoCruzadoDto => ({
  campo: codigo,
  etiqueta,
  declarado: 'x',
  extraido: resultado === 'NoVerificable' ? null : 'x',
  resultado,
  critico,
  detalle: null,
});

const NUMERO = (r: Resultado) => campo('numero', 'Número de la cuenta', r, true);
const TITULAR = (r: Resultado) => campo('titular', 'Titular de la cuenta', r, true);
const IDENTIFICACION = (r: Resultado) => campo('identificacion_titular', 'Identificación del titular', r, true);
const BANCO = (r: Resultado) => campo('banco', 'Banco', r, false);

describe('Resumen de un cruce por lo crítico', () => {
  it('Coincide solo si todos los campos críticos coinciden', () => {
    const resumen = resumirCruce({ legible: true, campos: [NUMERO('Coincide'), TITULAR('Coincide'), BANCO('Coincide')] });
    expect(resumen.resultado).toBe('Coincide');
    expect(resumen.criticosQueCoinciden.map((c) => c.campo)).toEqual(['numero', 'titular']);
    expect(tonoDelResumen(resumen.resultado)).toBe('exito');
  });

  it('un crítico sin verificar lo deja en NoVerificable (advertencia), aunque nada difiera: no «Coincide»', () => {
    const resumen = resumirCruce({ legible: true, campos: [NUMERO('Coincide'), IDENTIFICACION('NoVerificable')] });
    expect(resumen.resultado).toBe('NoVerificable');
    expect(resumen.criticosSinVerificar.map((c) => c.campo)).toEqual(['identificacion_titular']);
    expect(tonoDelResumen(resumen.resultado)).toBe('advertencia');
  });

  it('un crítico que difiere lo deja en Discrepa (error), por encima de lo que quedó sin verificar', () => {
    const resumen = resumirCruce({ legible: true, campos: [NUMERO('Discrepa'), IDENTIFICACION('NoVerificable'), TITULAR('Coincide')] });
    expect(resumen.resultado).toBe('Discrepa');
    expect(resumen.criticosQueDifieren.map((c) => c.campo)).toEqual(['numero']);
    expect(tonoDelResumen(resumen.resultado)).toBe('error');
  });

  it('un campo que no es crítico y difiere no cambia el resultado, pero se dice aparte', () => {
    const resumen = resumirCruce({ legible: true, campos: [NUMERO('Coincide'), BANCO('Discrepa')] });
    expect(resumen.resultado).toBe('Coincide');
    expect(resumen.otrosQueDifieren.map((c) => c.etiqueta)).toEqual(['Banco']);
  });

  it('un campo que no es crítico y no se verificó no cuenta para nada', () => {
    const resumen = resumirCruce({ legible: true, campos: [NUMERO('Coincide'), BANCO('NoVerificable')] });
    expect(resumen.resultado).toBe('Coincide');
    expect(resumen.criticosSinVerificar).toEqual([]);
    expect(resumen.otrosQueDifieren).toEqual([]);
  });

  it('un documento que no se lee con seguridad no verifica nada: NoSeLee (advertencia), sea lo que sea lo que traigan los campos', () => {
    const resumen = resumirCruce({ legible: false, campos: [NUMERO('Discrepa'), IDENTIFICACION('NoVerificable')] });
    expect(resumen.resultado).toBe('NoSeLee');
    expect(tonoDelResumen(resumen.resultado)).toBe('advertencia');
  });
});

describe('Frase del resumen', () => {
  const t = i18n.t.bind(i18n);

  it('lo crítico que coincide va con nombres cortos, y lo que falta, aparte', () => {
    const campos = [NUMERO('Coincide'), TITULAR('Coincide'), IDENTIFICACION('NoVerificable'), campo('titular_es_el_tercero', 'El titular es el tercero', 'Coincide', true)];
    expect(textoDelResumen(resumirCruce({ legible: true, campos }), t)).toBe('Coincide: número, titular y titular = tercero · Sin verificar: identificación');
  });

  it('si un crítico difiere dice solo cuál, sin enumerar los que coinciden', () => {
    expect(textoDelResumen(resumirCruce({ legible: true, campos: [NUMERO('Discrepa'), TITULAR('Coincide')] }), t)).toBe('No coincide: número');
  });

  it('un campo sin nombre corto va con su etiqueta en minúscula, y una sigla se deja como está', () => {
    const campos = [campo('razon_social', 'Razón social', 'Coincide', true), campo('nit', 'NIT', 'Coincide', true)];
    expect(textoDelResumen(resumirCruce({ legible: true, campos }), t)).toBe('Coincide: razón social y NIT');
  });

  it('el banco que difiere se dice con «También difiere»', () => {
    expect(textoDelResumen(resumirCruce({ legible: true, campos: [NUMERO('Coincide'), BANCO('Discrepa')] }), t)).toBe('Coincide: número · También difiere: banco');
  });

  it('un documento que no se lee lo dice sin enumerar campos, y sin campos críticos dice «Sin diferencias»', () => {
    expect(textoDelResumen(resumirCruce({ legible: false, campos: [NUMERO('NoVerificable')] }), t)).toBe('No se lee con seguridad: nada se pudo verificar');
    expect(textoDelResumen(resumirCruce({ legible: true, campos: [BANCO('Coincide')] }), t)).toBe('Sin diferencias');
  });
});
