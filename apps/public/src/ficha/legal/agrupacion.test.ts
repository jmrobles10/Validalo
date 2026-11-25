import { describe, expect, it } from 'vitest';
import type { PersonaRelacionada } from '../tipos';
import { clavePersona, guardarPersona, hayEnLaTarjeta, indicesDeLaTarjeta, mensajeDeLaTarjeta, personaParaEditar, quitarPersona, rolesDeLaTarjeta, tarjetasDePersonas } from './agrupacion';

const JOEL: PersonaRelacionada = {
  tipo_identificacion: 'CC',
  numero: '1020304050',
  nombres: 'Joel Mateo',
  apellidos: 'Robles Atuesta',
  pep: false,
  vinculo_pep: false,
  correo: 'joel@correo.co',
};
const ANA: PersonaRelacionada = { rol: 'Contador', tipo_identificacion: 'CC', numero: '52123456', nombres: 'Ana', apellidos: 'Ríos', pep: false, vinculo_pep: false };
const SOCIO_SOLO: PersonaRelacionada = { rol: 'Socio', tipo_identificacion: 'NIT', numero: '900373913', nombres: 'Inversiones S.A.S.', porcentaje: 60, pep: false, vinculo_pep: false };

const representante = (cambios: PersonaRelacionada = {}): PersonaRelacionada => ({ ...JOEL, rol: 'RepresentanteLegal', tipo_representacion: 'Principal', cargo: 'Gerente', ...cambios });
/** La fila de Socio que deja el diálogo: la misma identidad, sin lo propio del representante, y el porcentaje. */
const socioDeJoel = (porcentaje = 100, cambios: PersonaRelacionada = {}): PersonaRelacionada => ({ ...JOEL, rol: 'Socio', porcentaje, ...cambios });

describe('una tarjeta por persona', () => {
  it('junta el rol de una persona con su fila de Socio (mismo tipo y número, aunque el número traiga puntos)', () => {
    const personas = [representante(), ANA, socioDeJoel(100, { numero: '1.020.304.050' })];
    expect(tarjetasDePersonas(personas)).toEqual([
      { indice: 0, indiceSocio: 2 },
      { indice: 1, indiceSocio: null },
    ]);
  });

  it('un socio sin otro rol es una tarjeta con su propia fila; el orden es el de las filas', () => {
    const personas = [SOCIO_SOLO, representante(), socioDeJoel()];
    expect(tarjetasDePersonas(personas)).toEqual([
      { indice: 0, indiceSocio: 0 },
      { indice: 1, indiceSocio: 2 },
    ]);
  });

  it('filas sin número no se unen a ninguna otra, y el mismo número con otro tipo es otra persona', () => {
    const sinNumero: PersonaRelacionada = { rol: 'Socio' };
    expect(tarjetasDePersonas([{ rol: 'Contador' }, sinNumero])).toEqual([
      { indice: 0, indiceSocio: null },
      { indice: 1, indiceSocio: 1 },
    ]);
    expect(tarjetasDePersonas([representante(), socioDeJoel(100, { tipo_identificacion: 'CE' })])).toEqual([
      { indice: 0, indiceSocio: null },
      { indice: 1, indiceSocio: 1 },
    ]);
    expect(clavePersona({ tipo_identificacion: 'cc', numero: ' 1.020-304 050 ' })).toBe('CC|1020304050');
    expect(clavePersona({ tipo_identificacion: 'CC', numero: null })).toBeNull();
  });

  it('quien tiene dos roles que no son socio sigue siendo una tarjeta por fila y la fila de Socio se muestra en ambas', () => {
    const personas = [representante(), { ...JOEL, rol: 'Apoderado' } as PersonaRelacionada, socioDeJoel()];
    expect(tarjetasDePersonas(personas)).toEqual([
      { indice: 0, indiceSocio: 2 },
      { indice: 1, indiceSocio: 2 },
    ]);
  });

  it('dice qué filas y qué roles tiene la tarjeta', () => {
    const personas = [representante(), ANA, socioDeJoel()];
    const [joel, ana] = tarjetasDePersonas(personas);
    expect(joel && indicesDeLaTarjeta(joel)).toEqual([0, 2]);
    expect(joel && rolesDeLaTarjeta(personas, joel)).toEqual(['RepresentanteLegal', 'Socio']);
    expect(ana && rolesDeLaTarjeta(personas, ana)).toEqual(['Contador']);
    const solo = tarjetasDePersonas([SOCIO_SOLO])[0];
    expect(solo && indicesDeLaTarjeta(solo)).toEqual([0]);
    expect(solo && rolesDeLaTarjeta([SOCIO_SOLO], solo)).toEqual(['Socio']);
  });
});

describe('abrir una persona para editarla', () => {
  it('trae el porcentaje de su fila de Socio y la marca como «también es socio»', () => {
    const personas = [representante(), socioDeJoel(60)];
    const { persona, tambienSocio } = personaParaEditar(personas, { indice: 0, indiceSocio: 1 });
    expect(persona).toMatchObject({ rol: 'RepresentanteLegal', porcentaje: 60, tipo_representacion: 'Principal' });
    expect(tambienSocio).toBe(true);
  });

  it('una persona que no es socio abre con «No»; un socio solo, con su rol y su porcentaje', () => {
    expect(personaParaEditar([ANA], { indice: 0, indiceSocio: null })).toEqual({ persona: ANA, tambienSocio: false });
    expect(personaParaEditar([SOCIO_SOLO], { indice: 0, indiceSocio: 0 })).toEqual({ persona: SOCIO_SOLO, tambienSocio: false });
  });

  it('un porcentaje en la fila del rol (de cuando el diálogo se lo pedía a todos) se ofrece como «también es socio»', () => {
    const { persona, tambienSocio } = personaParaEditar([representante({ porcentaje: 100 })], { indice: 0, indiceSocio: null });
    expect(persona.porcentaje).toBe(100);
    expect(tambienSocio).toBe(true);
  });

  it('si la declaración PEP solo está en la fila de Socio, el diálogo la trae', () => {
    const declaracion = { cargo: 'Alcalde' };
    const { persona } = personaParaEditar([representante({ pep: true }), socioDeJoel(100, { pep: true, declaracion_pep: declaracion })], { indice: 0, indiceSocio: 1 });
    expect(persona.declaracion_pep).toEqual(declaracion);
  });
});

describe('guardar la persona del diálogo', () => {
  it('representante y socio: dos filas, la del rol y la de Socio, con la misma identidad y el porcentaje solo en la de Socio', () => {
    const editada = representante({ porcentaje: 100 });
    const lista = guardarPersona([ANA], null, editada, true);
    expect(lista).toHaveLength(3);
    const filaDelRol = lista[1];
    const filaDeSocio = lista[2];
    expect(filaDelRol).toMatchObject({ rol: 'RepresentanteLegal', numero: '1020304050', tipo_representacion: 'Principal', cargo: 'Gerente' });
    expect(filaDelRol).not.toHaveProperty('porcentaje');
    expect(filaDeSocio).toEqual(socioDeJoel(100, { correo: 'joel@correo.co' }));
    // El tipo de representación y el cargo son del rol, no del socio.
    expect(filaDeSocio).not.toHaveProperty('tipo_representacion');
    expect(filaDeSocio).not.toHaveProperty('cargo');
  });

  it('copia a la fila de Socio todos los datos de la persona (fechas, nacionalidad, PEP y su declaración)', () => {
    const declaracion = { cargo: 'Alcalde', fecha_firma: '2026-11-25' };
    const editada = representante({ porcentaje: 30, fecha_expedicion: '2010-01-01', fecha_nacimiento: '1990-02-02', nacionalidad: 'CO', residencia: 'CO', telefono: '3001234567', pep: true, declaracion_pep: declaracion });
    const socio = guardarPersona([], null, editada, true)[1];
    expect(socio).toMatchObject({ rol: 'Socio', porcentaje: 30, fecha_expedicion: '2010-01-01', fecha_nacimiento: '1990-02-02', nacionalidad: 'CO', residencia: 'CO', telefono: '3001234567', pep: true, declaracion_pep: declaracion });
  });

  it('sin «también es socio» queda solo la fila del rol y no lleva porcentaje', () => {
    const lista = guardarPersona([], null, representante({ porcentaje: 80 }), false);
    expect(lista).toHaveLength(1);
    expect(lista[0]).not.toHaveProperty('porcentaje');
  });

  it('elegir el rol Socio deja una sola fila, con su porcentaje', () => {
    const lista = guardarPersona([ANA], null, { ...JOEL, rol: 'Socio', porcentaje: 25 }, false);
    expect(lista).toEqual([ANA, { ...JOEL, rol: 'Socio', porcentaje: 25 }]);
  });

  it('editar sincroniza las dos filas: un cambio de identidad llega a ambas y el porcentaje solo a la de Socio', () => {
    const personas = [representante(), ANA, socioDeJoel(100)];
    const lista = guardarPersona(personas, { indice: 0, indiceSocio: 2 }, representante({ correo: 'nuevo@correo.co', nombres: 'Joel M.', porcentaje: 70 }), true);
    expect(lista).toHaveLength(3);
    expect(lista[0]).toMatchObject({ rol: 'RepresentanteLegal', correo: 'nuevo@correo.co', nombres: 'Joel M.' });
    expect(lista[0]).not.toHaveProperty('porcentaje');
    expect(lista[1]).toEqual(ANA);
    expect(lista[2]).toMatchObject({ rol: 'Socio', correo: 'nuevo@correo.co', nombres: 'Joel M.', porcentaje: 70 });
  });

  it('desmarcar «también es socio» quita la fila de Socio de esa persona y nada más', () => {
    const personas = [representante(), ANA, socioDeJoel(100)];
    const lista = guardarPersona(personas, { indice: 0, indiceSocio: 2 }, representante(), false);
    expect(lista).toHaveLength(2);
    expect(lista.map((p) => p.rol)).toEqual(['RepresentanteLegal', 'Contador']);
  });

  it('marcarlo al editar agrega la fila de Socio justo después de la del rol', () => {
    const personas = [representante(), ANA];
    const lista = guardarPersona(personas, { indice: 0, indiceSocio: null }, representante({ porcentaje: 100 }), true);
    expect(lista.map((p) => p.rol)).toEqual(['RepresentanteLegal', 'Socio', 'Contador']);
  });

  it('pasar de representante y socio al rol Socio deja una sola fila (la de Socio) y sin el cargo ni la representación', () => {
    const personas = [representante(), socioDeJoel(100)];
    const lista = guardarPersona(personas, { indice: 0, indiceSocio: 1 }, { ...JOEL, rol: 'Socio', porcentaje: 100 }, false);
    expect(lista).toEqual([{ ...JOEL, rol: 'Socio', porcentaje: 100 }]);
  });

  it('pasar de socio solo a representante que no es socio quita su participación; si sigue siendo socio, conserva el porcentaje', () => {
    const solo = socioDeJoel(40);
    expect(guardarPersona([solo], { indice: 0, indiceSocio: 0 }, { ...JOEL, rol: 'RepresentanteLegal', porcentaje: 40 }, false)).toEqual([{ ...JOEL, rol: 'RepresentanteLegal' }]);
    const lista = guardarPersona([solo], { indice: 0, indiceSocio: 0 }, { ...JOEL, rol: 'RepresentanteLegal', porcentaje: 40 }, true);
    expect(lista.map((p) => p.rol)).toEqual(['RepresentanteLegal', 'Socio']);
    expect(lista[1]?.porcentaje).toBe(40);
  });

  it('al agregar una persona que ya figura como socio no duplica su fila de Socio: la actualiza; y sin «También» no la borra', () => {
    const personas = [socioDeJoel(20)];
    const conSocio = guardarPersona(personas, null, representante({ porcentaje: 55 }), true);
    expect(conSocio.map((p) => p.rol)).toEqual(['Socio', 'RepresentanteLegal']);
    expect(conSocio[0]?.porcentaje).toBe(55);
    const sin = guardarPersona(personas, null, representante(), false);
    expect(sin.map((p) => p.rol)).toEqual(['Socio', 'RepresentanteLegal']);
    expect(sin[0]?.porcentaje).toBe(20);
  });
});

describe('quitar a la persona', () => {
  it('quita sus dos filas', () => {
    const personas = [representante(), ANA, socioDeJoel()];
    expect(quitarPersona(personas, { indice: 0, indiceSocio: 2 })).toEqual([ANA]);
  });

  it('quita la fila de un socio solo y la de quien no es socio', () => {
    expect(quitarPersona([SOCIO_SOLO, ANA], { indice: 0, indiceSocio: 0 })).toEqual([ANA]);
    expect(quitarPersona([SOCIO_SOLO, ANA], { indice: 1, indiceSocio: null })).toEqual([SOCIO_SOLO]);
  });

  it('si la persona tiene otro rol en la lista, su fila de Socio se queda para él', () => {
    const personas = [representante(), { ...JOEL, rol: 'Apoderado' } as PersonaRelacionada, socioDeJoel()];
    expect(quitarPersona(personas, { indice: 0, indiceSocio: 2 }).map((p) => p.rol)).toEqual(['Apoderado', 'Socio']);
  });
});

describe('los errores del servidor de las dos filas', () => {
  const errores: Record<string, string> = { 'personas[2].porcentaje': 'Falta «Porcentaje de participación».', 'personas[0].numero': 'Número inválido.', 'personas[2].numero': 'Número inválido de nuevo.', 'personas[2].declaracion_pep.cargo': 'Falta «Cargo».' };
  const mensaje = (ruta: string) => errores[ruta] ?? null;
  const tarjeta = { indice: 0, indiceSocio: 2 };

  it('el diálogo ve el de la fila del rol o el de la de Socio, el primero que haya', () => {
    expect(mensajeDeLaTarjeta(mensaje, tarjeta, 'porcentaje')).toBe('Falta «Porcentaje de participación».');
    expect(mensajeDeLaTarjeta(mensaje, tarjeta, 'numero')).toBe('Número inválido.');
    expect(mensajeDeLaTarjeta(mensaje, tarjeta, 'correo')).toBeNull();
    expect(mensajeDeLaTarjeta(mensaje, tarjeta)).toBeNull();
  });

  it('el error de la declaración PEP de la fila de Socio también cuenta', () => {
    const hayEnRuta = (prefijo: string) => Object.keys(errores).some((r) => r === prefijo || r.startsWith(`${prefijo}.`));
    expect(hayEnLaTarjeta(hayEnRuta, tarjeta, 'declaracion_pep')).toBe(true);
    expect(hayEnLaTarjeta(hayEnRuta, { indice: 1, indiceSocio: null }, 'declaracion_pep')).toBe(false);
  });
});
