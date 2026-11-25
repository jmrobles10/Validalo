import { describe, expect, it } from 'vitest';
import { puedeAprobarDesdeLaConclusion, requisitoAbierto, rolDeLaIa, vistaDeLaConclusion } from './conclusionDeRevision';
import { areaDeRequisito, conclusionDeRevision } from './datosPrueba';
import type { QuienDecideElRequisito } from './requisitos';

const ABIERTO = { estado: 'EnRevision' } as const;
const area = (nombre: string) => ({ areaRequisito: areaDeRequisito({ areaId: nombre, codigo: nombre }), nombre });
const PUEDE: QuienDecideElRequisito = { puede: area('Acceso Total'), pendientes: [] };
const NO_PUEDE: QuienDecideElRequisito = { puede: null, pendientes: ['Cumplimiento', 'Acceso Total'] };

describe('la vista de la conclusión de la IA', () => {
  it('todo verificado: aprobar en éxito, con lo que se verificó, en el orden en que se dice', () => {
    const vista = vistaDeLaConclusion(conclusionDeRevision({ antiguedadVerificada: true }), ABIERTO);

    expect(vista).toMatchObject({ sugerencia: 'Aprobar', tono: 'exito', abierta: true, automatico: false, motivos: [], sinVerificar: [], persona: null });
    expect(vista.verificado).toEqual(['legible', 'tipo', 'cruce', 'antiguedad']);
  });

  it('sin nada con qué cruzar (un documento que no respalda lo declarado) no dice que coincide con lo declarado', () => {
    const vista = vistaDeLaConclusion(conclusionDeRevision({ cruzadoConLoDeclarado: false }), ABIERTO);

    expect(vista.sugerencia).toBe('Aprobar');
    expect(vista.verificado).toEqual(['legible', 'tipo']);
  });

  it('con diferencias solo en campos no críticos se sigue sugiriendo aprobar: coincide lo crítico y las diferencias van aparte, con lo declarado y lo leído', () => {
    const vista = vistaDeLaConclusion(
      conclusionDeRevision({ diferencias: [{ etiqueta: 'Actividades económicas secundarias', declarado: null, extraido: '8129, 4330, 4799' }] }),
      ABIERTO,
    );

    expect(vista).toMatchObject({ sugerencia: 'Aprobar', tono: 'exito', motivos: [] });
    expect(vista.verificado).toEqual(['legible', 'tipo', 'cruceCritico']);
    expect(vista.diferencias).toEqual([{ etiqueta: 'Actividades económicas secundarias', declarado: null, extraido: '8129, 4330, 4799' }]);
  });

  it('las diferencias solo se dicen con «Aprobar»: con «Revisar» ya hay motivos concretos', () => {
    const vista = vistaDeLaConclusion(
      conclusionDeRevision({ sugerencia: 'Revisar', motivos: [{ codigo: 'ilegible', texto: 'El documento no es legible.' }], diferencias: [{ etiqueta: 'Banco', declarado: 'A', extraido: 'B' }] }),
      ABIERTO,
    );

    expect(vista.diferencias).toEqual([]);
  });

  it('la cédula de una persona relacionada dice con quién coincide, en lugar de «lo declarado por el tercero»', () => {
    const vista = vistaDeLaConclusion(conclusionDeRevision({ persona: { nombre: 'JOEL MATEO ROBLES ATUESTA', identificacion: 'CC 1073250322' } }), ABIERTO);

    expect(vista.verificado).toEqual(['legible', 'tipo', 'persona']);
    expect(vista.persona).toEqual({ nombre: 'JOEL MATEO ROBLES ATUESTA', identificacion: 'CC 1073250322' });
  });

  it('lo crítico que no se pudo verificar se dice aparte y no cambia la sugerencia', () => {
    const vista = vistaDeLaConclusion(conclusionDeRevision({ sinVerificar: ['Identificación del titular'] }), ABIERTO);

    expect(vista.sugerencia).toBe('Aprobar');
    expect(vista.sinVerificar).toEqual(['Identificación del titular']);
  });

  it('revisar: el texto de cada motivo tal como lo manda el servidor, en advertencia', () => {
    const vista = vistaDeLaConclusion(
      conclusionDeRevision({ sugerencia: 'Revisar', motivos: [{ codigo: 'confianza-baja', texto: 'La confianza del análisis (80 %) está bajo el umbral de la empresa (85 %).' }] }),
      ABIERTO,
    );

    expect(vista).toMatchObject({ sugerencia: 'Revisar', tono: 'advertencia', motivos: ['La confianza del análisis (80 %) está bajo el umbral de la empresa (85 %).'], verificado: [] });
  });

  it.each(['discrepancia-critica-ficha', 'antiguedad-excedida', 'sin-fecha-de-expedicion', 'alertas-de-manipulacion'])('un hallazgo crítico (%s) se pinta en error', (codigo) => {
    const vista = vistaDeLaConclusion(conclusionDeRevision({ sugerencia: 'Revisar', motivos: [{ codigo, texto: 'Un hallazgo.' }] }), ABIERTO);

    expect(vista.tono).toBe('error');
  });

  it('sin análisis: advertencia, sin motivos que listar', () => {
    const vista = vistaDeLaConclusion(conclusionDeRevision({ sugerencia: 'SinAnalisis', motivos: [{ codigo: 'sin-analisis-ia', texto: 'La empresa no recibió el análisis.' }] }), ABIERTO);

    expect(vista).toMatchObject({ sugerencia: 'SinAnalisis', tono: 'advertencia', motivos: [], verificado: [] });
  });

  it('una sugerencia que esta versión no conoce se lee como «Revisar»: ante la duda, que lo mire una persona', () => {
    expect(vistaDeLaConclusion(conclusionDeRevision({ sugerencia: 'Otra' }), ABIERTO).sugerencia).toBe('Revisar');
  });

  it('un requisito aprobado, eximido o que ya no aplica no se decide: la conclusión es un dato más', () => {
    for (const estado of ['Aprobado', 'Eximido', 'NoAplica'] as const) expect(requisitoAbierto({ estado })).toBe(false);
    for (const estado of ['Cargado', 'EnRevision', 'Observado'] as const) expect(requisitoAbierto({ estado })).toBe(true);
    expect(vistaDeLaConclusion(conclusionDeRevision(), { estado: 'Aprobado' }).abierta).toBe(false);
  });

  it('el nivel Automático se marca: tiene su propio flujo', () => {
    expect(vistaDeLaConclusion(conclusionDeRevision({ nivel: 'Automatico' }), ABIERTO).automatico).toBe(true);
    expect(vistaDeLaConclusion(conclusionDeRevision({ nivel: 'Asistido' }), ABIERTO).automatico).toBe(false);
  });
});

describe('el rol de la IA: sugiere y decide una persona', () => {
  const vista = (cambios: Parameters<typeof conclusionDeRevision>[0] = {}, estado: 'EnRevision' | 'Aprobado' = 'EnRevision') => vistaDeLaConclusion(conclusionDeRevision(cambios), { estado });

  it('quien puede decidir ahora lo oye en primera persona, con su área', () => {
    expect(rolDeLaIa(vista(), PUEDE)).toEqual({ tipo: 'puedes', area: 'Acceso Total' });
  });

  it('quien no puede decidir (otra área en turno, sin permiso) oye qué áreas deciden', () => {
    expect(rolDeLaIa(vista(), NO_PUEDE)).toEqual({ tipo: 'decide', areas: ['Cumplimiento', 'Acceso Total'] });
    expect(rolDeLaIa(vista(), { puede: null, pendientes: [] })).toEqual({ tipo: 'sinAreas' });
  });

  it('el nivel Automático dice que el sistema tiene su propio flujo, sin importar quién mira', () => {
    expect(rolDeLaIa(vista({ nivel: 'Automatico' }), PUEDE)).toEqual({ tipo: 'automatico' });
    expect(rolDeLaIa(vista({ nivel: 'Automatico' }), NO_PUEDE)).toEqual({ tipo: 'automatico' });
  });

  it('un requisito ya decidido o un documento sin análisis no dicen nada del rol', () => {
    expect(rolDeLaIa(vista({}, 'Aprobado'), PUEDE)).toBeNull();
    expect(rolDeLaIa(vista({ sugerencia: 'SinAnalisis' }), PUEDE)).toBeNull();
  });
});

describe('el botón «Aprobar» junto a la conclusión', () => {
  const vista = (cambios: Parameters<typeof conclusionDeRevision>[0] = {}, estado: 'EnRevision' | 'Aprobado' = 'EnRevision') => vistaDeLaConclusion(conclusionDeRevision(cambios), { estado });

  it('solo con «Se sugiere aprobar», el requisito abierto y alguien que puede decidir ahora', () => {
    expect(puedeAprobarDesdeLaConclusion(vista(), PUEDE)).toBe(true);
    expect(puedeAprobarDesdeLaConclusion(vista(), NO_PUEDE)).toBe(false);
    expect(puedeAprobarDesdeLaConclusion(vista({ sugerencia: 'Revisar' }), PUEDE)).toBe(false);
    expect(puedeAprobarDesdeLaConclusion(vista({ sugerencia: 'SinAnalisis' }), PUEDE)).toBe(false);
    expect(puedeAprobarDesdeLaConclusion(vista({}, 'Aprobado'), PUEDE)).toBe(false);
  });
});
