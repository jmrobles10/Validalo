import type { PropuestaDeSeccionDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { agruparPorDocumento, lecturaDelSoporte, TIEMPOS_DE_LECTURA, type SoporteSubido } from './propuestas';

const documento = (id: string, tipo: string, version = 2) => ({ documentoId: id, version, tipoDocumento: tipo, nombreDocumento: tipo, cargadaEn: '2026-11-09T15:00:00Z' });
const propuesta = (seccion: string, doc: ReturnType<typeof documento>, cambios: Partial<PropuestaDeSeccionDto> = {}): PropuestaDeSeccionDto => ({
  seccion,
  nombreSeccion: seccion,
  periodo: null,
  documento: doc,
  disponible: true,
  motivo: null,
  campos: [{ campo: 'x', etiqueta: 'X', actual: 'a', propuesto: 'b' }],
  ...cambios,
});

describe('agruparPorDocumento', () => {
  it('junta las secciones de un mismo documento y versión, en el orden de la API', () => {
    const rut = documento('d1', 'RUT');
    const camara = documento('d2', 'CAMARA_COMERCIO');
    const grupos = agruparPorDocumento([propuesta('FICHA_GENERAL', rut), propuesta('FICHA_GENERAL', camara), propuesta('FICHA_TRIBUTARIA', rut), propuesta('FICHA_LEGAL', camara)]);

    expect(grupos.map((g) => g.documento)).toEqual(['RUT', 'Cámara de Comercio']);
    expect(grupos[0]?.propuestas.map((p) => p.seccion)).toEqual(['FICHA_GENERAL', 'FICHA_TRIBUTARIA']);
    expect(grupos[1]?.propuestas.map((p) => p.seccion)).toEqual(['FICHA_GENERAL', 'FICHA_LEGAL']);
  });

  it('suma los datos distintos de lo que se pudo leer y marca lo que no', () => {
    const rut = documento('d1', 'RUT');
    const [grupo] = agruparPorDocumento([
      propuesta('FICHA_GENERAL', rut, { campos: [{ campo: 'a', etiqueta: 'A', actual: null, propuesto: '1' }, { campo: 'b', etiqueta: 'B', actual: null, propuesto: '2' }] }),
      propuesta('FICHA_TRIBUTARIA', rut, { disponible: false, campos: [] }),
    ]);

    expect(grupo).toMatchObject({ datosDistintos: 2, hayNoLeidas: true, version: 2 });
  });

  it('dos versiones del mismo documento son dos avisos y sin propuestas no hay nada', () => {
    expect(agruparPorDocumento([propuesta('FICHA_GENERAL', documento('d1', 'RUT', 2)), propuesta('FICHA_GENERAL', documento('d1', 'RUT', 3))])).toHaveLength(2);
    expect(agruparPorDocumento([])).toEqual([]);
  });
});

describe('lecturaDelSoporte: qué dice la sección del documento que el tercero acaba de subir (FD-10)', () => {
  const rut = documento('d-rut', 'RUT', 2);
  const subido: SoporteSubido = { documentoId: 'd-rut', version: 2, tipo: 'RUT', desde: 1_000_000, esperaLectura: true };
  const sinLectura = propuesta('FICHA_GENERAL', rut, { disponible: false, motivo: 'sin-lectura-automatica', campos: [] });
  const DESPUES = subido.desde + 5_000;
  const VENCIDA = subido.desde + TIEMPOS_DE_LECTURA.trasSubirMs;

  it('con valores propone: la lectura terminó y trae datos distintos', () => {
    const conValores = propuesta('FICHA_GENERAL', rut);
    expect(lecturaDelSoporte(subido, [conValores], DESPUES, DESPUES)).toEqual({ estado: 'propuesta', propuesta: conValores });
  });

  it('una propuesta sin lectura es «leyendo» mientras corre el tiempo de espera y «sin lectura» cuando se agota', () => {
    expect(lecturaDelSoporte(subido, [sinLectura], DESPUES, DESPUES)).toEqual({ estado: 'leyendo' });
    expect(lecturaDelSoporte(subido, [sinLectura], DESPUES, VENCIDA - 1)).toEqual({ estado: 'leyendo' });
    expect(lecturaDelSoporte(subido, [sinLectura], DESPUES, VENCIDA)).toEqual({ estado: 'sin-lectura' });
  });

  it('ilegible y fallida son definitivas: no se espera nada, ni siquiera dentro del tiempo', () => {
    expect(lecturaDelSoporte(subido, [{ ...sinLectura, motivo: 'documento-ilegible' }], DESPUES, DESPUES)).toEqual({ estado: 'ilegible' });
    expect(lecturaDelSoporte(subido, [{ ...sinLectura, motivo: 'lectura-fallida' }], DESPUES, DESPUES)).toEqual({ estado: 'sin-lectura' });
  });

  it('si nadie lo puede pagar (ninguna empresa lo recibió) no se espera: sin lectura de una vez, haya o no propuesta', () => {
    const sinPagador = { ...subido, esperaLectura: false };
    expect(lecturaDelSoporte(sinPagador, [sinLectura], DESPUES, DESPUES)).toEqual({ estado: 'sin-lectura' });
    expect(lecturaDelSoporte(sinPagador, [], DESPUES, DESPUES)).toEqual({ estado: 'sin-lectura' });
  });

  it('sin propuesta, «no hay nada distinto» solo cuando la consulta ya es posterior a la subida; antes se sigue leyendo', () => {
    expect(lecturaDelSoporte(subido, [], DESPUES, DESPUES)).toEqual({ estado: 'sin-diferencias' });
    expect(lecturaDelSoporte(subido, [], subido.desde - 1, DESPUES)).toEqual({ estado: 'leyendo' });
    expect(lecturaDelSoporte(subido, undefined, subido.desde - 1, DESPUES)).toEqual({ estado: 'leyendo' });
    expect(lecturaDelSoporte(subido, [], subido.desde - 1, VENCIDA)).toEqual({ estado: 'sin-lectura' });
  });

  it('solo cuenta la propuesta de ese documento y esa versión', () => {
    const otraVersion = propuesta('FICHA_GENERAL', documento('d-rut', 'RUT', 3));
    const otroDocumento = propuesta('FICHA_GENERAL', documento('d-camara', 'CAMARA_COMERCIO', 2));
    expect(lecturaDelSoporte(subido, [otraVersion, otroDocumento], DESPUES, DESPUES)).toEqual({ estado: 'sin-diferencias' });
  });
});
