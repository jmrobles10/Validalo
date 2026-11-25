import type { TipoIdentificacionDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { decideElNumero, tipoDePersonaDe } from './tipoDePersona';

const tipo = (pais: string, codigo: string, aplicaA: string, patron: string, tieneDv = false): TipoIdentificacionDto => ({ pais, codigo, nombre: codigo, aplicaA, patron, tieneDv });

// Los tipos del catálogo (`CatalogoIdentificacion`) con su «aplica a» y su patrón.
const NIT = tipo('CO', 'NIT', 'Ambas', '^[0-9]{6,15}$', true);
const CC = tipo('CO', 'CC', 'Natural', '^[0-9]{3,10}$');
const PASAPORTE = tipo('CO', 'PASAPORTE', 'Natural', '^[A-Z0-9]{3,20}$');
const ID_FISCAL = tipo('CO', 'ID_FISCAL', 'Ambas', '^[A-Z0-9]{3,20}$');
const EIN = tipo('US', 'EIN', 'Juridica', '^[0-9]{9}$');
const RUC_PERU = tipo('PE', 'RUC', 'Ambas', '^[0-9]{11}$');
const RUC_PANAMA = tipo('PA', 'RUC', 'Ambas', '^((PE|PI|E|N)?[0-9]{1,2}(AV)?[0-9]{3,9}|[0-9]{12,20})$');
const CIP = tipo('PA', 'CIP', 'Natural', '^(PE|PI|E|N)?[0-9]{1,2}(AV)?[0-9]{3,9}$');
const RNC = tipo('DO', 'RNC', 'Ambas', '^([0-9]{9}|[0-9]{11})$');
const CED = tipo('DO', 'CED', 'Natural', '^[0-9]{11}$');

describe('tipo de persona derivado del tipo de identificación', () => {
  it('Natural si el tipo solo es de personas naturales y Jurídica en los demás (la regla de la API sin tipo de persona)', () => {
    expect(tipoDePersonaDe(NIT, '900123456')).toBe('Juridica');
    expect(tipoDePersonaDe(NIT, '')).toBe('Juridica'); // no depende del número
    expect(tipoDePersonaDe(EIN, '123456789')).toBe('Juridica');
    expect(tipoDePersonaDe(ID_FISCAL, 'ABC123')).toBe('Juridica');
    expect(tipoDePersonaDe(RUC_PERU, '20123456789')).toBe('Juridica');
    for (const natural of [CC, PASAPORTE, CIP, CED]) expect(tipoDePersonaDe(natural, '1020304050')).toBe('Natural');
  });

  it('en el RUC de Panamá el número decide: la cédula («8-123-456») es de una persona natural y el RUC de folio, tomo, asiento y año, de una sociedad', () => {
    for (const cedula of ['8-123-456', 'PE-12-345', 'E-8-123456', 'N-12-345', '8-AV-123-456']) expect(tipoDePersonaDe(RUC_PANAMA, cedula)).toBe('Natural');
    for (const sociedad of ['155612345-2-2019', '155612345220190']) expect(tipoDePersonaDe(RUC_PANAMA, sociedad)).toBe('Juridica');
  });

  it('en el RNC de República Dominicana el de 9 dígitos es de una sociedad y el de 11 es la cédula de una persona física', () => {
    expect(tipoDePersonaDe(RNC, '1-01-85004-3')).toBe('Juridica');
    expect(tipoDePersonaDe(RNC, '101850043')).toBe('Juridica');
    expect(tipoDePersonaDe(RNC, '001-1391820-5')).toBe('Natural');
  });

  it('no se sabe todavía sin tipo de identificación o, donde el número decide, mientras el número no sea válido', () => {
    expect(tipoDePersonaDe(undefined, '900123456')).toBeNull();
    expect(tipoDePersonaDe(RUC_PANAMA, '')).toBeNull();
    expect(tipoDePersonaDe(RUC_PANAMA, 'ABC')).toBeNull();
    expect(tipoDePersonaDe(RNC, '')).toBeNull();
    expect(tipoDePersonaDe(RNC, '12345678')).toBeNull();
    expect(decideElNumero(RUC_PANAMA)).toBe(true);
    expect(decideElNumero(RNC)).toBe(true);
    expect(decideElNumero(NIT)).toBe(false);
    expect(decideElNumero(CIP)).toBe(false);
    expect(decideElNumero(RUC_PERU)).toBe(false); // el RUC de Perú no se afina por el número: como la API, Jurídica
    expect(decideElNumero(undefined)).toBe(false);
  });
});
