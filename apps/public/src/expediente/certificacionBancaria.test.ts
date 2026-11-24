import type { CuentaBancariaPublicaDto, RequisitoPublicoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { cuentaDeLaEmpresa, debeProponerTrasSubir, esRequisitoDeCertificacionBancaria, pasoAlElegir, vinculoSinCuenta } from './certificacionBancaria';

const cuenta = (id: string, cambios: Partial<CuentaBancariaPublicaDto> = {}): CuentaBancariaPublicaDto => ({
  id,
  banco: 'Davivienda',
  tipoCuenta: 'Corriente',
  numeroEnmascarado: '****7097',
  titular: 'ATLAS SERVICES SAS',
  identificacionTitular: '901178876-8',
  moneda: 'COP',
  estado: 'Activa',
  registradaEn: '2026-10-02T10:00:00Z',
  designadaEn: [],
  certificacion: null,
  faltaCertificacion: false,
  ...cambios,
});

const designada = (estado: 'Propuesta' | 'Aprobada' | 'Rechazada', vinculoId = 'v1') => ({ vinculoId, empresaId: 'emp', empresa: 'Sinco OK', estado, motivoRechazo: null });

const requisito = (cambios: Partial<Pick<RequisitoPublicoDto, 'persona'>> & { tipoCanonico?: string; ambito?: string } = {}) =>
  ({
    tipoDocumento: { id: 'td', codigo: 'X', nombre: 'X', tipoCanonico: cambios.tipoCanonico ?? 'CERTIFICACION_BANCARIA', ambito: cambios.ambito ?? 'Global', modo: 'Archivo' },
    persona: cambios.persona,
  }) as Pick<RequisitoPublicoDto, 'tipoDocumento' | 'persona'>;

describe('el requisito de certificación bancaria', () => {
  it('es el documento global de la propia bóveda; ni otro tipo, ni uno de la empresa, ni el de una persona relacionada', () => {
    expect(esRequisitoDeCertificacionBancaria(requisito())).toBe(true);
    expect(esRequisitoDeCertificacionBancaria(requisito({ tipoCanonico: 'RUT' }))).toBe(false);
    expect(esRequisitoDeCertificacionBancaria(requisito({ ambito: 'PorVinculo' }))).toBe(false);
    expect(esRequisitoDeCertificacionBancaria(requisito({ persona: { rol: 'RepresentanteLegal', personaId: 'p1' } as RequisitoPublicoDto['persona'] }))).toBe(false);
  });
});

describe('qué cuenta tiene la empresa', () => {
  it('sin vínculo no hay a quién proponerle; sin designaciones, sí', () => {
    expect(vinculoSinCuenta(null, [cuenta('c1')])).toBe(false);
    expect(vinculoSinCuenta('v1', [])).toBe(true);
    expect(vinculoSinCuenta('v1', [cuenta('c1')])).toBe(true);
  });

  it('una cuenta aprobada o por aprobar es una cuenta; una rechazada o la de otra empresa no', () => {
    expect(vinculoSinCuenta('v1', [cuenta('c1', { designadaEn: [designada('Aprobada')] })])).toBe(false);
    expect(vinculoSinCuenta('v1', [cuenta('c1', { designadaEn: [designada('Propuesta')] })])).toBe(false);
    expect(vinculoSinCuenta('v1', [cuenta('c1', { designadaEn: [designada('Rechazada')] })])).toBe(true);
    expect(vinculoSinCuenta('v1', [cuenta('c1', { designadaEn: [designada('Aprobada', 'otro')] })])).toBe(true);
  });

  it('la cuenta de la empresa es la aprobada y, si no, la que espera su aprobación; una retirada no se sugiere', () => {
    const aprobada = cuenta('c1', { designadaEn: [designada('Aprobada')] });
    const propuesta = cuenta('c2', { designadaEn: [designada('Propuesta')] });
    expect(cuentaDeLaEmpresa('v1', [propuesta, aprobada])?.id).toBe('c1');
    expect(cuentaDeLaEmpresa('v1', [propuesta])?.id).toBe('c2');
    expect(cuentaDeLaEmpresa('v1', [cuenta('c3', { estado: 'Retirada', designadaEn: [designada('Aprobada')] })])).toBeNull();
    expect(cuentaDeLaEmpresa('v1', [cuenta('c4')])).toBeNull();
    expect(cuentaDeLaEmpresa(null, [aprobada])).toBeNull();
  });
});

describe('qué sigue tras elegir la cuenta', () => {
  it('sin certificación se sube; con ella y sin cuenta de la empresa se propone', () => {
    const sin = cuenta('c1', { faltaCertificacion: true });
    const con = cuenta('c2');
    expect(pasoAlElegir(sin, 'v1', [sin, con])).toBe('subir');
    expect(pasoAlElegir(con, 'v1', [sin, con])).toBe('proponer');
  });

  it('con una cuenta de la empresa o sin vínculo, la certificación nueva se sube (sin proponer nada)', () => {
    const deLaEmpresa = cuenta('c1', { designadaEn: [designada('Aprobada')] });
    const otra = cuenta('c2');
    expect(pasoAlElegir(otra, 'v1', [deLaEmpresa, otra])).toBe('subir');
    expect(pasoAlElegir(deLaEmpresa, 'v1', [deLaEmpresa, otra])).toBe('subir');
    expect(pasoAlElegir(otra, null, [otra])).toBe('subir');
  });

  it('tras subir se propone la cuenta solo si la empresa aún no tiene una', () => {
    expect(debeProponerTrasSubir('v1', [cuenta('c1')])).toBe(true);
    expect(debeProponerTrasSubir('v1', [cuenta('c1', { designadaEn: [designada('Propuesta')] })])).toBe(false);
    expect(debeProponerTrasSubir(null, [cuenta('c1')])).toBe(false);
  });
});
