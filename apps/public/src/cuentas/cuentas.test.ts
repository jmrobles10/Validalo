import type { CampoCruzadoDto, CertificacionDeCuentaDto, CuentaBancariaPublicaDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { camposQueNoCoinciden, camposSinVerificar, cuerpoRegistro, DATOS_VACIOS, destinoDeCertificacion, enmascararNumero, esDesignable, validarCuenta, verificacionDe } from './cuentas';

const COMPLETOS = { ...DATOS_VACIOS, bancoCodigo: '1007', tipoCuenta: 'Ahorros', numero: '1234 5678', titular: 'Ana Pérez', identificacionTitular: '1020304050', moneda: 'COP' } as const;

describe('validar una cuenta como el dominio', () => {
  it('pide banco, tipo, número, titular e identificación; la moneda es opcional', () => {
    expect(validarCuenta(DATOS_VACIOS)).toEqual({
      banco: 'banco-requerido',
      tipoCuenta: 'tipo-cuenta-invalido',
      numero: 'numero-cuenta-invalido',
      titular: 'titular-requerido',
      identificacionTitular: 'identificacion-titular-requerida',
    });
    expect(validarCuenta({ ...COMPLETOS, moneda: '' })).toEqual({});
  });

  it.each([
    ['12345', true],
    ['123456', false],
    ['123-456 7890', false],
    ['1'.repeat(20), false],
    ['1'.repeat(21), true],
    ['12345a78', true],
  ])('el número «%s» es inválido: %s', (numero, invalido) => {
    expect('numero' in validarCuenta({ ...COMPLETOS, numero })).toBe(invalido);
  });

  it('la moneda son tres letras', () => {
    expect(validarCuenta({ ...COMPLETOS, moneda: 'usd' })).toEqual({});
    expect(validarCuenta({ ...COMPLETOS, moneda: 'US' })).toEqual({ moneda: 'moneda-invalida' });
  });

  it('el cuerpo va sin espacios sobrantes y con la moneda en mayúsculas (o nula si no la escribió)', () => {
    expect(cuerpoRegistro({ ...COMPLETOS, moneda: 'usd' })).toMatchObject({ moneda: 'USD' });
    expect(cuerpoRegistro({ ...COMPLETOS, moneda: ' ' }).moneda).toBeNull();
    expect(enmascararNumero('12-34 5678')).toBe('****5678');
  });

  it('el banco se toma del catálogo por su código; con otro banco va su nombre, su país y su SWIFT en mayúsculas', () => {
    expect(cuerpoRegistro(COMPLETOS)).toMatchObject({ banco: null, bancoCodigo: '1007', bancoSwift: null, pais: null, contactoPagos: null });
    expect(cuerpoRegistro({ ...COMPLETOS, bancoCodigo: '', otroBanco: true, banco: ' Chase ', pais: 'US', bancoSwift: 'chas us33', moneda: 'usd' })).toMatchObject({
      banco: 'Chase',
      bancoCodigo: null,
      bancoSwift: 'CHASUS33',
      pais: 'US',
      moneda: 'USD',
    });
  });

  it('sin elegir banco del catálogo falta el banco; con otro banco basta su nombre', () => {
    expect(validarCuenta({ ...COMPLETOS, bancoCodigo: '' })).toEqual({ banco: 'banco-requerido' });
    expect(validarCuenta({ ...COMPLETOS, bancoCodigo: '', otroBanco: true })).toEqual({ banco: 'banco-requerido' });
    expect(validarCuenta({ ...COMPLETOS, bancoCodigo: '', otroBanco: true, banco: 'Chase' })).toEqual({});
  });

  it.each([
    ['COLOCOBM', false],
    ['colo cobm', false],
    ['DEUTDEFF500', false],
    ['COLOCOB', true],
    ['COLOCOBM1', true],
    ['1OLOCOBM', true],
  ])('el SWIFT «%s» es inválido: %s', (bancoSwift, invalido) => {
    expect('bancoSwift' in validarCuenta({ ...COMPLETOS, bancoSwift })).toBe(invalido);
  });

  it('el contacto de pagos es opcional, pero si se empieza pide el nombre y un correo válido', () => {
    expect(validarCuenta({ ...COMPLETOS, pagosTelefono: '6015551234' })).toEqual({ pagosNombre: 'contacto-pagos-nombre-requerido', pagosCorreo: 'correo-invalido' });
    expect(validarCuenta({ ...COMPLETOS, pagosNombre: 'Marta', pagosCorreo: 'marta@' })).toEqual({ pagosCorreo: 'correo-invalido' });
    expect(validarCuenta({ ...COMPLETOS, pagosNombre: 'Marta', pagosCorreo: 'marta@aceros.co' })).toEqual({});
    expect(cuerpoRegistro({ ...COMPLETOS, pagosNombre: ' Marta ', pagosCorreo: ' marta@aceros.co ', pagosTelefono: ' ' }).contactoPagos).toEqual({
      nombre: 'Marta',
      correo: 'marta@aceros.co',
      telefono: null,
    });
  });
});

const CUENTA: CuentaBancariaPublicaDto = {
  id: 'c1',
  banco: 'Bancolombia',
  tipoCuenta: 'Ahorros',
  numeroEnmascarado: '****5678',
  titular: 'Aceros del Norte S.A.S.',
  identificacionTitular: '900123456-7',
  moneda: 'COP',
  estado: 'Activa',
  registradaEn: '2026-10-02T10:00:00Z',
  designadaEn: [],
  faltaCertificacion: false,
};

const CERTIFICACION: CertificacionDeCuentaDto = {
  documentoId: 'doc-1',
  version: 1,
  estado: 'Actual',
  cargadaEn: '2026-10-03T10:00:00Z',
  nombreArchivo: 'certificacion.pdf',
  verificacion: 'Coincide',
  discrepanciaCritica: false,
  campos: [],
};

const campo = (campo: string, resultado: string, critico: boolean): CampoCruzadoDto => ({ campo, etiqueta: campo, declarado: 'a', extraido: 'b', resultado, critico, detalle: null });

describe('la certificación bancaria de cada cuenta (CB-1)', () => {
  it('la certificación se sube al documento propio de la cuenta, no al general de la bóveda', () => {
    expect(destinoDeCertificacion('c9')).toEqual({ tipoCanonico: 'CERTIFICACION_BANCARIA', cuentaBancariaId: 'c9' });
  });

  it('solo se designa una cuenta activa y con su certificación', () => {
    expect(esDesignable(CUENTA)).toBe(true);
    expect(esDesignable({ ...CUENTA, faltaCertificacion: true })).toBe(false);
    expect(esDesignable({ ...CUENTA, estado: 'Retirada' })).toBe(false);
  });

  it('el resultado de la lectura sale de lo que dijo la API; una versión devuelta manda sobre él', () => {
    expect(verificacionDe(CERTIFICACION)).toBe('Coincide');
    expect(verificacionDe({ ...CERTIFICACION, verificacion: 'Discrepa' })).toBe('Discrepa');
    expect(verificacionDe({ ...CERTIFICACION, verificacion: 'NoSeLee' })).toBe('NoSeLee');
    expect(verificacionDe({ ...CERTIFICACION, estado: 'Devuelta', verificacion: 'Coincide' })).toBe('Devuelta');
    // Un resultado que este cliente no conoce no inventa nada: queda sin leer.
    expect(verificacionDe({ ...CERTIFICACION, verificacion: 'Otro' })).toBe('SinAnalisis');
  });

  it('lo que no coincide va primero lo crítico y lo que no se pudo verificar solo cuenta si es crítico', () => {
    const certificacion = {
      ...CERTIFICACION,
      campos: [campo('banco', 'Discrepa', false), campo('numero', 'Discrepa', true), campo('titular', 'Coincide', true), campo('estado_cuenta', 'NoVerificable', true), campo('tipo_cuenta', 'NoVerificable', false)],
    };
    expect(camposQueNoCoinciden(certificacion).map((c) => c.campo)).toEqual(['numero', 'banco']);
    expect(camposSinVerificar(certificacion).map((c) => c.campo)).toEqual(['estado_cuenta']);
  });
});
