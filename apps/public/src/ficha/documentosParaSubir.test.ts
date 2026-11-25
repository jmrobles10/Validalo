import { describe, expect, it } from 'vitest';
import { documentosParaSubir, SECCIONES, seccionPorCodigo, SOPORTE_FICHA } from './secciones';

/** «Subir un soporte» (FD-10): qué documentos se ofrecen en cada sección, sacados de lo que respalda el cruce (docs/14 §5.1, `MapaDeRespaldo`). */
describe('documentosParaSubir: qué documento puede ser el soporte de cada sección', () => {
  const de = (codigo: string, tipoPersona: string, pais?: string) => documentosParaSubir(seccionPorCodigo(codigo)!, tipoPersona, pais);

  it('General: el RUT y, según la persona, la Cámara (jurídica) o la cédula (natural)', () => {
    expect(de('FICHA_GENERAL', 'Juridica')).toEqual(['RUT', 'CAMARA_COMERCIO']);
    expect(de('FICHA_GENERAL', 'Natural')).toEqual(['RUT', 'CEDULA']);
  });

  it('Tributaria: solo el RUT, para quien sea (un único documento natural: va preseleccionado)', () => {
    expect(de('FICHA_TRIBUTARIA', 'Juridica')).toEqual(['RUT']);
    expect(de('FICHA_TRIBUTARIA', 'Natural')).toEqual(['RUT']);
  });

  it('Legal: la Cámara, la cédula de los representantes y el RUT; Financiera: los estados financieros', () => {
    expect(de('FICHA_LEGAL', 'Juridica')).toEqual(['CAMARA_COMERCIO', 'CEDULA', 'RUT']);
    expect(de('FICHA_FINANCIERA', 'Juridica')).toEqual(['ESTADOS_FINANCIEROS']);
  });

  it('un consorcio o una unión temporal se tratan como jurídica, igual que en la API', () => {
    expect(de('FICHA_GENERAL', 'Consorcio')).toEqual(['RUT', 'CAMARA_COMERCIO']);
    expect(de('FICHA_GENERAL', 'UnionTemporal')).toEqual(['RUT', 'CAMARA_COMERCIO']);
  });

  it('SST y Especialidades no tienen documentos propios: solo «Otro documento»', () => {
    expect(de('FICHA_SST', 'Juridica')).toEqual([]);
    expect(de('FICHA_ESPECIALIDADES', 'Natural')).toEqual([]);
  });

  it('de un tercero de otro país no se ofrece el RUT, la Cámara ni la cédula (no se leen, RG-6): solo «Otro documento»', () => {
    expect(de('FICHA_GENERAL', 'Juridica', 'PA')).toEqual([]);
    expect(de('FICHA_TRIBUTARIA', 'Juridica', 'DO')).toEqual([]);
    expect(de('FICHA_GENERAL', 'Juridica', 'CO')).toEqual(['RUT', 'CAMARA_COMERCIO']);
  });

  it('todo lo que se ofrece es un tipo que la propia sección admite como soporte, y «Otro documento» también', () => {
    for (const seccion of SECCIONES) {
      for (const documento of [...seccion.subibles.natural, ...seccion.subibles.juridica]) expect(seccion.soportes).toContain(documento);
      if (seccion.soportes !== null) expect(seccion.soportes).toContain(SOPORTE_FICHA);
    }
  });
});
