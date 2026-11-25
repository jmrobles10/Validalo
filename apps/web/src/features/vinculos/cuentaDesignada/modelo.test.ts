import type { CampoCruzadoDto, CertificacionDeCuentaDelVinculoDto, CruceDeSeccionDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { debeAbrirLaComparacion, resumirCertificacion, textoDeCertificacion, tonoDeCertificacion } from './modelo';

const t = i18n.t.bind(i18n);

type Resultado = 'Coincide' | 'Discrepa' | 'NoVerificable';

const campo = (codigo: string, etiqueta: string, resultado: Resultado, critico = true): CampoCruzadoDto => ({
  campo: codigo,
  etiqueta,
  declarado: 'x',
  extraido: resultado === 'NoVerificable' ? null : 'x',
  resultado,
  critico,
  detalle: null,
});

const cruce = (campos: CampoCruzadoDto[], legible = true): CruceDeSeccionDto => ({
  documentoId: 'doc-1',
  versionDocumento: 1,
  tipoDocumento: 'CERTIFICACION_BANCARIA',
  nombreDocumento: 'Certificación bancaria',
  confianza: 0.95,
  legible,
  fecha: '2026-11-10T10:00:00Z',
  coincidencias: campos.filter((c) => c.resultado === 'Coincide').length,
  discrepancias: campos.filter((c) => c.resultado === 'Discrepa').length,
  noVerificables: campos.filter((c) => c.resultado === 'NoVerificable').length,
  discrepanciaCritica: campos.some((c) => c.critico && c.resultado === 'Discrepa'),
  campos,
});

const certificacion = (cambios: Partial<CertificacionDeCuentaDelVinculoDto>): CertificacionDeCuentaDelVinculoDto => ({
  documentoId: 'doc-1',
  version: 1,
  cargadaEn: '2026-11-10T09:00:00Z',
  verificacion: 'Coincide',
  sinAnalisis: false,
  discrepanciaCritica: false,
  cruce: null,
  ...cambios,
});

const COINCIDEN = [
  campo('numero', 'Número de la cuenta', 'Coincide'),
  campo('titular', 'Titular de la cuenta', 'Coincide'),
  campo('identificacion_titular', 'Identificación del titular', 'Coincide'),
];

describe('Resumen de la certificación de la cuenta', () => {
  it('todo lo crítico coincide: éxito, comparación plegada y la frase con lo que coincide', () => {
    const resumen = resumirCertificacion(certificacion({ cruce: cruce(COINCIDEN) }));
    expect(tonoDeCertificacion(resumen)).toBe('exito');
    expect(debeAbrirLaComparacion(resumen)).toBe(false);
    expect(textoDeCertificacion(resumen, t)).toBe('Coincide: número, titular e identificación');
  });

  it('algo crítico sin verificar (la identificación del titular): advertencia, comparación plegada y «Sin verificar: …»', () => {
    const resumen = resumirCertificacion(certificacion({ verificacion: 'NoVerificable', cruce: cruce([COINCIDEN[0]!, COINCIDEN[1]!, campo('identificacion_titular', 'Identificación del titular', 'NoVerificable')]) }));
    expect(tonoDeCertificacion(resumen)).toBe('advertencia');
    expect(debeAbrirLaComparacion(resumen)).toBe(false);
    expect(textoDeCertificacion(resumen, t)).toBe('Coincide: número y titular · Sin verificar: identificación');
  });

  it('un crítico que no coincide: error, la comparación se abre sola y dice cuál', () => {
    const resumen = resumirCertificacion(certificacion({ verificacion: 'Discrepa', discrepanciaCritica: true, cruce: cruce([campo('numero', 'Número de la cuenta', 'Discrepa'), COINCIDEN[1]!]) }));
    expect(tonoDeCertificacion(resumen)).toBe('error');
    expect(debeAbrirLaComparacion(resumen)).toBe(true);
    expect(textoDeCertificacion(resumen, t)).toBe('No coincide: número');
  });

  it('el `verificacion` de la API no manda: que solo difiera el banco (no crítico) no la deja en rojo', () => {
    const resumen = resumirCertificacion(certificacion({ verificacion: 'Discrepa', cruce: cruce([...COINCIDEN, campo('banco', 'Banco', 'Discrepa', false)]) }));
    expect(tonoDeCertificacion(resumen)).toBe('exito');
    expect(debeAbrirLaComparacion(resumen)).toBe(false);
    expect(textoDeCertificacion(resumen, t)).toBe('Coincide: número, titular e identificación · También difiere: banco');
  });

  it('el documento no se lee: advertencia, sin campos y sin abrir la comparación', () => {
    const resumen = resumirCertificacion(certificacion({ verificacion: 'NoSeLee', cruce: cruce(COINCIDEN, false) }));
    expect(tonoDeCertificacion(resumen)).toBe('advertencia');
    expect(debeAbrirLaComparacion(resumen)).toBe(false);
    expect(textoDeCertificacion(resumen, t)).toBe('No se lee con seguridad: nada se pudo verificar');
  });

  it('sin la lectura de la empresa: advertencia y «cotéjala a mano»', () => {
    const resumen = resumirCertificacion(certificacion({ verificacion: 'SinAnalisis', sinAnalisis: true }));
    expect(resumen).toEqual({ tipo: 'sinLectura' });
    expect(tonoDeCertificacion(resumen)).toBe('advertencia');
    expect(debeAbrirLaComparacion(resumen)).toBe(false);
    expect(textoDeCertificacion(resumen, t)).toBe('Sin lectura automática: cotéjala a mano');
  });
});
