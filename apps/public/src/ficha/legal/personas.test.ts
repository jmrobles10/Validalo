import type { PropuestaDeSeccionDto, RelacionEntreTercerosDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { personaDesdeRelacion, relacionesFueraDeLaFicha } from './personas';

const relacion = (cambios: Partial<RelacionEntreTercerosDto>): RelacionEntreTercerosDto => ({
  id: 'r1',
  personaId: 'p1',
  identificacion: { pais: 'CO', tipo: 'CC', numero: '1.020.304' },
  nombre: 'Juan Pérez',
  tipo: 'RepresentanteLegal',
  principal: true,
  participacion: null,
  cargo: 'Gerente',
  vigenteDesde: '2026-11-24',
  vigenteHasta: null,
  estado: 'Confirmada',
  fuente: 'Declarada',
  deFicha: false,
  confianza: null,
  confirmadaEn: '2026-11-24T10:00:00Z',
  documentos: [],
  ...cambios,
});

describe('personas registradas fuera de la ficha legal', () => {
  it('ofrece la relación vigente declarada en Personas que no figura en la sección', () => {
    expect(relacionesFueraDeLaFicha([relacion({})], [])).toHaveLength(1);
  });

  it('no repite a quien ya figura en la sección aunque el número venga con puntos', () => {
    expect(relacionesFueraDeLaFicha([relacion({})], [{ numero: '1020304' }])).toHaveLength(0);
  });

  it('no repite a quien ya propone un documento más nuevo de la sección', () => {
    const propuesta = { disponible: true, datos: { personas: [{ numero: '1020304', rol: 'RepresentanteLegal' }] } } as unknown as PropuestaDeSeccionDto;
    expect(relacionesFueraDeLaFicha([relacion({})], [], [propuesta])).toHaveLength(0);
  });

  it('deja por fuera las que mantiene la ficha, las propuestas y los roles que la ficha no maneja', () => {
    const relaciones = [relacion({ deFicha: true }), relacion({ estado: 'Propuesta' }), relacion({ tipo: 'BeneficiarioFinal' })];
    expect(relacionesFueraDeLaFicha(relaciones, [])).toHaveLength(0);
  });

  it('llena la persona de la ficha con el rol, la identificación y el nombre', () => {
    expect(personaDesdeRelacion(relacion({}))).toMatchObject({ rol: 'RepresentanteLegal', tipo_identificacion: 'CC', numero: '1.020.304', nombres: 'Juan Pérez', cargo: 'Gerente' });
  });
});
