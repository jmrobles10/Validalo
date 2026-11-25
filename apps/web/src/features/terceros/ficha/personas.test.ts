import { describe, expect, it } from 'vitest';
import { agruparPersonas, agruparPorIdentificacion, clavePersona, claveDeIdentificacion, faltantesPorFila, resumirPersona, soloTienePersonas, type DatoDePersona, type FilaPersona } from './personas';

const REPRESENTANTE: FilaPersona = { rol: 'RepresentanteLegal', tipo_representacion: 'Principal', tipo_identificacion: 'CC', numero: '1073250322', nombres: 'JOEL MATEO', apellidos: 'ROBLES ATUESTA', pep: false, vinculo_pep: false };
const SOCIO: FilaPersona = { rol: 'Socio', tipo_identificacion: 'CC', numero: '1073250322', nombres: 'JOEL MATEO', apellidos: 'ROBLES ATUESTA', porcentaje: 100, pep: false, vinculo_pep: false };
const OTRO: FilaPersona = { rol: 'Suplente', tipo_identificacion: 'CC', numero: '52111222', nombres: 'Ana', apellidos: 'Gómez', cargo: 'Gerente', correo: 'ana@norte.co', pep: false, vinculo_pep: false };

describe('Agrupación de las personas relacionadas por identificación', () => {
  it('la clave es el tipo y el número sin puntos, guiones ni espacios y en mayúsculas; sin número no hay clave', () => {
    expect(clavePersona({ tipo_identificacion: 'nit', numero: '900.123.456-1' })).toBe('NIT|9001234561');
    expect(clavePersona({ tipo_identificacion: 'CC', numero: ' 1073250322 ' })).toBe('CC|1073250322');
    expect(clavePersona({ tipo_identificacion: 'CC', numero: '' })).toBeNull();
    expect(clavePersona({ tipo_identificacion: 'CC' })).toBeNull();
  });

  it('el representante que también es socio (dos filas con la misma identificación) es UNA persona, con la fila del rol primero', () => {
    const grupos = agruparPersonas([REPRESENTANTE, SOCIO]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.filas.map((f) => [f.indice, f.fila.rol])).toEqual([[0, 'RepresentanteLegal'], [1, 'Socio']]);
  });

  it('aunque la fila de Socio venga antes, la del rol va primero; la persona queda donde estaba su primera fila', () => {
    const grupos = agruparPersonas([OTRO, SOCIO, REPRESENTANTE]);
    expect(grupos.map((g) => g.filas.map((f) => f.fila.rol))).toEqual([['Suplente'], ['RepresentanteLegal', 'Socio']]);
    expect(grupos.map((g) => g.filas.map((f) => f.indice))).toEqual([[0], [2, 1]]);
  });

  it('quien solo es socio queda en su propia tarjeta y las personas distintas no se mezclan', () => {
    const grupos = agruparPersonas([REPRESENTANTE, OTRO, { ...SOCIO, numero: '999', nombres: 'Luis' }]);
    expect(grupos).toHaveLength(3);
    expect(grupos.map((g) => g.filas.length)).toEqual([1, 1, 1]);
  });

  it('un rol más de la misma identificación (representante y suplente) también es la misma persona', () => {
    const grupos = agruparPersonas([REPRESENTANTE, { ...REPRESENTANTE, rol: 'Suplente', tipo_representacion: 'Primer suplente' }, SOCIO]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.filas.map((f) => f.fila.rol)).toEqual(['RepresentanteLegal', 'Suplente', 'Socio']);
  });

  it('las filas sin número no se unen entre sí', () => {
    const grupos = agruparPersonas([{ rol: 'Contador', nombres: 'A' }, { rol: 'Contador', nombres: 'B' }]);
    expect(grupos).toHaveLength(2);
  });

  it('sin personas, nada', () => {
    expect(agruparPersonas([])).toEqual([]);
  });
});

const claves = (datos: DatoDePersona[]) => datos.map((d) => (d.rol ? `${d.clave}@${d.rol}` : d.clave));

describe('Resumen de una persona: todo lo que el tercero llenó', () => {
  it('arriba el nombre, la identificación (sin DV) y los roles; en los datos, todo lo demás con valor, en el orden del formulario del portal', () => {
    const resumen = resumirPersona(
      agruparPersonas([{ ...OTRO, dv: '3', telefono: '3001112233', nacionalidad: 'CO', lugar_expedicion: 'Bogotá', fecha_nacimiento: '1980-02-01', fecha_expedicion: '2000-05-05', residencia: 'CO' }])[0]!,
    );
    expect(resumen.nombre).toBe('Ana Gómez');
    expect(resumen.identificacion).toBe('CC 52111222');
    expect(resumen.roles).toEqual([{ rol: 'Suplente' }]);
    expect(claves(resumen.datos)).toEqual([
      'dv', 'cargo@Suplente', 'pep', 'vinculo_pep', 'fecha_expedicion', 'lugar_expedicion', 'fecha_nacimiento', 'nacionalidad', 'residencia', 'correo', 'telefono',
    ]);
    expect(resumen.datos.every((d) => !d.sinDato)).toBe(true);
  });

  it('los vacíos se omiten, pero un «No» (false) es una respuesta y se muestra', () => {
    const resumen = resumirPersona(agruparPersonas([{ ...SOCIO, correo: '', telefono: null, residencia: undefined }])[0]!);
    expect(claves(resumen.datos)).toEqual(['porcentaje@Socio', 'pep', 'vinculo_pep']);
    expect(resumen.datos.find((d) => d.clave === 'pep')?.valor).toBe(false);
  });

  it('con dos roles, lo propio de cada uno (tipo de representación, cargo, participación) va una vez por rol, con su rol; lo demás, una sola vez', () => {
    const resumen = resumirPersona(agruparPersonas([{ ...REPRESENTANTE, cargo: 'Gerente', correo: 'joel@atlas.co' }, SOCIO])[0]!);
    expect(claves(resumen.datos)).toEqual(['tipo_representacion@RepresentanteLegal', 'porcentaje@Socio', 'cargo@RepresentanteLegal', 'pep', 'vinculo_pep', 'correo']);
    expect(resumen.datos.find((d) => d.clave === 'porcentaje')?.valor).toBe(100);
  });

  it('PEP en Sí en cualquiera de las filas es Sí; el «No» de las demás no lo pisa', () => {
    const resumen = resumirPersona(agruparPersonas([REPRESENTANTE, { ...SOCIO, pep: true }])[0]!);
    expect(resumen.datos.find((d) => d.clave === 'pep')?.valor).toBe(true);
    expect(resumen.datos.find((d) => d.clave === 'vinculo_pep')?.valor).toBe(false);
  });

  it('lo obligatorio que la API dice que falta sale como «Sin dato», en su lugar del formulario y solo en la fila que lo debe', () => {
    const faltantes = faltantesPorFila(['personas[1].porcentaje', 'personas[0].pep', 'personas[0].dv', 'revisor_fiscal_firma.nit', null]);
    const base = { tipo_identificacion: 'NIT', numero: '900123456', nombres: 'Inversiones Andinas S.A.S.' };
    const resumen = resumirPersona(agruparPersonas([{ ...base, rol: 'RepresentanteLegal' }, { ...base, rol: 'Socio' }])[0]!, faltantes);
    expect(resumen.datos.filter((d) => d.sinDato).map((d) => (d.rol ? `${d.clave}@${d.rol}` : d.clave))).toEqual(['porcentaje@Socio', 'dv', 'pep']);
  });

  it('una clave nueva del esquema que aquí no se conoce también se muestra, al final', () => {
    const resumen = resumirPersona(agruparPersonas([{ ...OTRO, segundo_apellido_legal: 'Pérez' }])[0]!);
    expect(claves(resumen.datos).at(-1)).toBe('segundo_apellido_legal');
  });

  it('la declaración PEP es una por persona: la de la primera fila que la tiene activa, con su posición', () => {
    const declaracion = { cargo: 'Alcalde' };
    const grupos = agruparPersonas([{ ...SOCIO, pep: true, declaracion_pep: declaracion }, { ...REPRESENTANTE, pep: true, declaracion_pep: declaracion }]);
    // La fila del rol va primero: su declaración es la que se descarga (posición 1 en `personas`).
    expect(resumirPersona(grupos[0]!).declaracion).toEqual({ indice: 1, datos: declaracion });
    // Con «No» en PEP la declaración queda inactiva: no hay nada que descargar.
    expect(resumirPersona(agruparPersonas([{ ...REPRESENTANTE, pep: false, declaracion_pep: declaracion }])[0]!).declaracion).toBeNull();
  });

  it('el nombre de una sociedad es su razón social', () => {
    expect(resumirPersona(agruparPersonas([{ rol: 'Socio', tipo_identificacion: 'NIT', numero: '900123456', nombres: 'Inversiones Andinas S.A.S.' }])[0]!).nombre).toBe('Inversiones Andinas S.A.S.');
  });
});

describe('Faltantes por fila', () => {
  it('toma solo las rutas de personas con su posición y su campo', () => {
    const porFila = faltantesPorFila(['personas[0].pep', 'personas[0].vinculo_pep', 'personas[3].porcentaje', 'razon_social', 'personas[1]', undefined]);
    expect([...(porFila.get(0) ?? [])]).toEqual(['pep', 'vinculo_pep']);
    expect([...(porFila.get(3) ?? [])]).toEqual(['porcentaje']);
    expect(porFila.has(1)).toBe(false);
  });
});

describe('«Datos» solo si hay más que personas', () => {
  it('con solo personas no hace falta el título', () => {
    expect(soloTienePersonas({ personas: [OTRO] })).toBe(true);
    expect(soloTienePersonas({ personas: [OTRO], revisor_fiscal_firma: { nit: '1', razon_social: 'X' } })).toBe(false);
    expect(soloTienePersonas({ personas: [], revisor_fiscal_firma: null })).toBe(false);
    expect(soloTienePersonas({ razon_social: 'X' })).toBe(false);
    expect(soloTienePersonas({})).toBe(false);
  });
});

describe('Agrupación genérica por identificación (la regla que comparten la ficha y las relaciones del vínculo)', () => {
  it('la clave ignora puntos, guiones, espacios y mayúsculas, y sin número no hay clave', () => {
    expect(claveDeIdentificacion('cc', ' 1.073.250-322 ')).toBe('CC|1073250322');
    expect(claveDeIdentificacion('CC', '')).toBeNull();
    expect(claveDeIdentificacion(null, undefined)).toBeNull();
  });

  it('agrupa lo que comparte identificación, con los de rol primero y el Socio al final; las personas, donde está su fila de rol', () => {
    const items = [
      { id: 'socio-a', clave: 'A', socio: true },
      { id: 'otro', clave: 'B', socio: false },
      { id: 'rol-a', clave: 'A', socio: false },
      { id: 'sin-clave-1', clave: null, socio: false },
      { id: 'sin-clave-2', clave: null, socio: false },
    ];
    const grupos = agruparPorIdentificacion(items, (i) => i.clave, (i) => i.socio);
    expect(grupos.map((g) => g.map((x) => x.elemento.id))).toEqual([['otro'], ['rol-a', 'socio-a'], ['sin-clave-1'], ['sin-clave-2']]);
    // La persona queda donde estaba su fila de rol (la posición 2), como en el portal; la de Socio (posición 0) va al final.
    expect(grupos[1]?.map((x) => x.indice)).toEqual([2, 0]);
  });
});
