import type { DocumentoVistaEmpresaDto, PersonaDelVinculoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { agruparRelaciones } from './agrupacion';

/** Solo lo que la agrupación lee (el id del documento y las versiones compartidas); el resto de la vista no importa aquí. */
const documento = (id: string, versiones: number[]) =>
  ({
  documentoId: id,
  tipo: { codigo: 'CEDULA', nombre: 'Cédula de ciudadanía', tipoDocumentoTenantId: null },
  ambito: 'Global' as const,
  versionActual: versiones[0] ?? 1,
  versionesCompartidas: versiones.map((n) => ({ n, sha256: `h${String(n)}`, cargadaEn: '2026-11-05T10:00:00Z', estado: 'Actual' })),
  }) as unknown as DocumentoVistaEmpresaDto;

const relacion = (cambios: Partial<PersonaDelVinculoDto>): PersonaDelVinculoDto => ({
    relacionId: 'r1',
    personaId: 'p1',
    identificacion: { pais: 'CO', tipo: 'CC', numero: '1073250322' },
    nombre: 'JOEL MATEO ROBLES ATUESTA',
    tipo: 'RepresentanteLegal',
    principal: true,
    participacion: null,
    cargo: null,
    vigenteDesde: '2026-11-01',
    documentos: [documento('d1', [1])],
    ...cambios,
  });

describe('Relaciones de las personas con el vínculo, una persona por identificación', () => {
  it('el representante que también es socio es UNA persona con sus dos relaciones (la de rol primero, la de Socio al final)', () => {
    const personas = agruparRelaciones([relacion({ relacionId: 'socio', tipo: 'Socio', participacion: '100' }), relacion({ relacionId: 'rep' })]);
    expect(personas).toHaveLength(1);
    expect(personas[0]?.relaciones.map((r) => r.tipo)).toEqual(['RepresentanteLegal', 'Socio']);
    expect(personas[0]?.nombre).toBe('JOEL MATEO ROBLES ATUESTA');
  });

  it('«Principal» si lo es en alguna de sus relaciones', () => {
    const personas = agruparRelaciones([relacion({ relacionId: 'a', principal: false }), relacion({ relacionId: 'b', tipo: 'Socio', principal: true })]);
    expect(personas[0]?.principal).toBe(true);
    expect(agruparRelaciones([relacion({ principal: false })])[0]?.principal).toBe(false);
  });

  it('sus documentos salen una sola vez, con las versiones compartidas de todas las relaciones', () => {
    const personas = agruparRelaciones([
      relacion({ relacionId: 'a', documentos: [documento('d1', [1]), documento('d2', [3])] }),
      relacion({ relacionId: 'b', tipo: 'Socio', documentos: [documento('d1', [1, 2])] }),
    ]);
    const documentos = personas[0]?.documentos ?? [];
    expect(documentos.map((d) => d.documentoId)).toEqual(['d1', 'd2']);
    expect(documentos[0]?.versionesCompartidas.map((v) => v.n)).toEqual([1, 2]);
  });

  it('personas distintas no se mezclan, en el orden de su primera relación; la misma cédula con otro formato es la misma persona', () => {
    const personas = agruparRelaciones([
      relacion({ relacionId: 'a', nombre: 'Ana', identificacion: { pais: 'CO', tipo: 'CC', numero: '52.111.222' } }),
      relacion({ relacionId: 'b', nombre: 'Luis', identificacion: { pais: 'CO', tipo: 'CC', numero: '80123456' } }),
      relacion({ relacionId: 'c', nombre: 'Ana', tipo: 'Socio', identificacion: { pais: 'CO', tipo: 'cc', numero: '52111222' } }),
    ]);
    expect(personas.map((p) => [p.nombre, p.relaciones.length])).toEqual([
      ['Ana', 2],
      ['Luis', 1],
    ]);
  });

  it('sin relaciones, nada', () => {
    expect(agruparRelaciones([])).toEqual([]);
  });
});
