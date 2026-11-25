import type { PerfilDeFichaDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import type { PersonaRelacionada, RolPersona } from '../tipos';
import { erroresDeFormato, faltantesDePersona, limpiezaAlCambiarDeRol, presenciaDeCampos, ROLES_CON_REPRESENTACION } from './camposPorRol';

const HOY = '2026-11-25';
const PERFIL_PANAMA = { tiposConDvDeclarado: ['RUC'] } as unknown as PerfilDeFichaDto;

/** Una persona con todo lo obligatorio de su rol; cada prueba le quita o le cambia lo que le interesa. */
const completa = (rol: RolPersona, cambios: PersonaRelacionada = {}): PersonaRelacionada => ({
  rol,
  tipo_identificacion: 'CC',
  numero: '1020304050',
  nombres: 'Joel Mateo',
  apellidos: 'Robles Atuesta',
  pep: false,
  vinculo_pep: false,
  ...cambios,
});

const campos = (p: PersonaRelacionada, tambienSocio: boolean | null = false, perfil: PerfilDeFichaDto | null = null) => faltantesDePersona(p, { tambienSocio, perfil }, HOY).map((f) => f.campo);

describe('qué campos lleva cada rol', () => {
  it('el tipo de representación solo es de quien representa a la empresa', () => {
    const conRepresentacion = (['RepresentanteLegal', 'Suplente', 'Apoderado'] as const).map((rol) => presenciaDeCampos({ rol }, { tambienSocio: null }).tipo_representacion);
    expect(conRepresentacion).toEqual(['opcional', 'opcional', 'opcional']);
    for (const rol of ['Socio', 'JuntaDirectiva', 'RevisorFiscal', 'Contador'] as const) {
      expect(presenciaDeCampos({ rol }, { tambienSocio: null }).tipo_representacion).toBe('oculto');
    }
    expect(ROLES_CON_REPRESENTACION).toEqual(['RepresentanteLegal', 'Suplente', 'Apoderado']);
    // Sin rol elegido todavía no se muestra.
    expect(presenciaDeCampos({}, { tambienSocio: null }).tipo_representacion).toBe('oculto');
  });

  it('un socio no tiene cargo; los demás roles sí (opcional)', () => {
    expect(presenciaDeCampos({ rol: 'Socio' }, { tambienSocio: null }).cargo).toBe('oculto');
    for (const rol of ['RepresentanteLegal', 'Suplente', 'Apoderado', 'JuntaDirectiva', 'RevisorFiscal', 'Contador'] as const) {
      expect(presenciaDeCampos({ rol }, { tambienSocio: null }).cargo).toBe('opcional');
    }
  });

  it('«¿También es socio?» se pregunta a todo rol menos a Socio y es obligatorio; el porcentaje, con Socio o con «Sí»', () => {
    expect(presenciaDeCampos({ rol: 'Socio' }, { tambienSocio: null }).tambien_socio).toBe('oculto');
    expect(presenciaDeCampos({}, { tambienSocio: null }).tambien_socio).toBe('oculto');
    expect(presenciaDeCampos({ rol: 'Socio' }, { tambienSocio: null }).porcentaje).toBe('obligatorio');
    for (const rol of ['RepresentanteLegal', 'Suplente', 'Apoderado', 'JuntaDirectiva', 'RevisorFiscal', 'Contador'] as const) {
      expect(presenciaDeCampos({ rol }, { tambienSocio: null }).tambien_socio).toBe('obligatorio');
      expect(presenciaDeCampos({ rol }, { tambienSocio: null }).porcentaje).toBe('oculto');
      expect(presenciaDeCampos({ rol }, { tambienSocio: false }).porcentaje).toBe('oculto');
      expect(presenciaDeCampos({ rol }, { tambienSocio: true }).porcentaje).toBe('obligatorio');
    }
  });

  it('los apellidos no aplican a una sociedad, y el DV solo a los tipos que lo declaran', () => {
    expect(presenciaDeCampos({ rol: 'Socio', tipo_identificacion: 'NIT', numero: '900373913' }, { tambienSocio: null }).apellidos).toBe('oculto');
    expect(presenciaDeCampos({ rol: 'Socio', tipo_identificacion: 'CC', numero: '1020304050' }, { tambienSocio: null }).apellidos).toBe('obligatorio');
    expect(presenciaDeCampos({ tipo_identificacion: 'RUC' }, { tambienSocio: null, perfil: PERFIL_PANAMA }).dv).toBe('obligatorio');
    expect(presenciaDeCampos({ tipo_identificacion: 'CC' }, { tambienSocio: null, perfil: PERFIL_PANAMA }).dv).toBe('oculto');
    expect(presenciaDeCampos({ tipo_identificacion: 'RUC' }, { tambienSocio: null }).dv).toBe('oculto');
  });

  it('la declaración PEP es obligatoria solo con «Sí»', () => {
    expect(presenciaDeCampos({ pep: true }, { tambienSocio: null }).declaracion_pep).toBe('obligatorio');
    expect(presenciaDeCampos({ pep: false }, { tambienSocio: null }).declaracion_pep).toBe('oculto');
  });
});

describe('qué se vacía al cambiar de rol', () => {
  it('el tipo de representación y el cargo que dejan de aplicar, y solo si tenían algo', () => {
    const persona = { rol: 'RepresentanteLegal', tipo_representacion: 'Principal', cargo: 'Gerente' } as const;
    expect(limpiezaAlCambiarDeRol(persona, 'Socio')).toEqual({ tipo_representacion: null, cargo: null });
    expect(limpiezaAlCambiarDeRol(persona, 'Contador')).toEqual({ tipo_representacion: null });
    expect(limpiezaAlCambiarDeRol(persona, 'Suplente')).toEqual({});
    expect(limpiezaAlCambiarDeRol({ rol: 'Contador' }, 'Socio')).toEqual({});
    expect(limpiezaAlCambiarDeRol(persona, null)).toEqual({});
  });
});

describe('qué impide dar por lista a la persona', () => {
  it('sin datos faltan los de siempre, y el rol pide «¿También es socio?»', () => {
    expect(campos({}, null)).toEqual(['rol', 'tipo_identificacion', 'numero', 'nombres', 'apellidos', 'pep', 'vinculo_pep']);
    expect(campos({ rol: 'RepresentanteLegal' }, null)).toEqual(['tambien_socio', 'tipo_identificacion', 'numero', 'nombres', 'apellidos', 'pep', 'vinculo_pep']);
  });

  it('una persona completa de cada rol está lista (lo mismo que exige el servidor)', () => {
    for (const rol of ['RepresentanteLegal', 'Suplente', 'Apoderado', 'JuntaDirectiva', 'RevisorFiscal', 'Contador'] as const) {
      expect(faltantesDePersona(completa(rol), { tambienSocio: false }, HOY)).toEqual([]);
    }
    expect(faltantesDePersona(completa('Socio', { porcentaje: 40 }), { tambienSocio: null }, HOY)).toEqual([]);
  });

  it('el rol Socio y el «Sí» exigen el porcentaje', () => {
    expect(campos(completa('Socio'), null)).toEqual(['porcentaje']);
    expect(campos(completa('RepresentanteLegal'), true)).toEqual(['porcentaje']);
    expect(campos(completa('RepresentanteLegal', { porcentaje: 100 }), true)).toEqual([]);
    // Un 0 es una respuesta: lo que falta es no decir nada.
    expect(campos(completa('Socio', { porcentaje: 0 }), null)).toEqual([]);
  });

  it('una sociedad lleva razón social y no apellidos; el tipo que declara su DV lo pide', () => {
    expect(campos({ rol: 'Socio', tipo_identificacion: 'NIT', numero: '900373913', nombres: 'Inversiones S.A.S.', porcentaje: 10, pep: false, vinculo_pep: false }, null)).toEqual([]);
    expect(campos(completa('Contador', { tipo_identificacion: 'RUC', numero: '8-123-456' }), false, PERFIL_PANAMA)).toEqual(['dv']);
    expect(campos(completa('Contador', { tipo_identificacion: 'RUC', numero: '8-123-456', dv: '56' }), false, PERFIL_PANAMA)).toEqual([]);
  });

  it('PEP «Sí» sin declaración falta; con ella no', () => {
    expect(campos(completa('Contador', { pep: true }))).toEqual(['declaracion_pep']);
    expect(campos(completa('Contador', { pep: true, declaracion_pep: { cargo: 'Alcalde' } }))).toEqual([]);
  });

  it('el texto en blanco no cuenta como dato', () => {
    expect(campos(completa('Contador', { numero: '   ', nombres: ' ' }))).toEqual(['numero', 'nombres']);
  });

  it('un formato inválido también impide: porcentaje, correo, teléfono, fechas y DV', () => {
    const invalidos = (p: PersonaRelacionada, tambienSocio = false, perfil: PerfilDeFichaDto | null = null) =>
      faltantesDePersona(p, { tambienSocio, perfil }, HOY).filter((f) => f.motivo === 'invalido').map((f) => f.campo);
    expect(invalidos(completa('Socio', { porcentaje: 150 }))).toEqual(['porcentaje']);
    expect(invalidos(completa('Socio', { porcentaje: -1 }))).toEqual(['porcentaje']);
    expect(invalidos(completa('Socio', { porcentaje: 12.34567 }))).toEqual(['porcentaje']);
    expect(invalidos(completa('Socio', { porcentaje: 12.3456 }))).toEqual([]);
    expect(invalidos(completa('Contador', { correo: 'sin-arroba' }))).toEqual(['correo']);
    expect(invalidos(completa('Contador', { correo: 'a@b.co' }))).toEqual([]);
    expect(invalidos(completa('Contador', { telefono: '123' }))).toEqual(['telefono']);
    expect(invalidos(completa('Contador', { telefono: '+57 (300) 123-4567' }))).toEqual([]);
    expect(invalidos(completa('Contador', { fecha_expedicion: '2027-01-01' }))).toEqual(['fecha_expedicion']);
    expect(invalidos(completa('Contador', { fecha_nacimiento: '2027-01-01' }))).toEqual(['fecha_nacimiento']);
    expect(invalidos(completa('Contador', { fecha_nacimiento: '2000-05-01', fecha_expedicion: '1999-05-01' }))).toEqual(['fecha_nacimiento']);
    expect(invalidos(completa('Contador', { fecha_nacimiento: '1980-05-01', fecha_expedicion: '1999-05-01' }))).toEqual([]);
    expect(invalidos(completa('Contador', { tipo_identificacion: 'RUC', numero: '8-123-456', dv: '5' }), false, PERFIL_PANAMA)).toEqual(['dv']);
  });

  it('el porcentaje de un rol que no es socio no se revisa (no se muestra ni se guarda)', () => {
    expect(erroresDeFormato(completa('Contador', { porcentaje: 500 }), { tambienSocio: false }, HOY)).toEqual({});
  });
});
