import { describe, expect, it } from 'vitest';
import { area, expediente, requisito, requisitoSeccion } from './datosPrueba';
import { agruparRequisitos, aparienciaParaElRevisor, areasPorEtapa, esFilaCompacta, grupoDeRequisito } from './requisitosAgrupados';

describe('Requisitos agrupados por situación', () => {
  it('cada estado cae en su grupo: cargado y en revisión por revisar; observado, observados; pendiente, le toca al tercero; aprobado y eximido o no aplica, resueltos', () => {
    expect(grupoDeRequisito({ estado: 'Cargado' })).toBe('porRevisar');
    expect(grupoDeRequisito({ estado: 'EnRevision' })).toBe('porRevisar');
    expect(grupoDeRequisito({ estado: 'Observado' })).toBe('observados');
    expect(grupoDeRequisito({ estado: 'Pendiente' })).toBe('leTocaAlTercero');
    expect(grupoDeRequisito({ estado: 'Aprobado' })).toBe('aprobados');
    expect(grupoDeRequisito({ estado: 'Eximido' })).toBe('eximidos');
    expect(grupoDeRequisito({ estado: 'NoAplica' })).toBe('eximidos');
  });

  it('un estado que la API agregue y aquí no esté va a «Por revisar» (lo que no se debe pasar por alto)', () => {
    expect(grupoDeRequisito({ estado: 'Inventado' as never })).toBe('porRevisar');
  });

  it('agrupa conservando el orden de llegada y deja vacíos los grupos sin requisitos', () => {
    const grupos = agruparRequisitos([
      requisito({ id: 'a', estado: 'Pendiente' }),
      requisito({ id: 'b', estado: 'EnRevision' }),
      requisito({ id: 'c', estado: 'Pendiente' }),
      requisito({ id: 'd', estado: 'Aprobado' }),
    ]);
    expect(grupos.leTocaAlTercero.map((r) => r.id)).toEqual(['a', 'c']);
    expect(grupos.porRevisar.map((r) => r.id)).toEqual(['b']);
    expect(grupos.aprobados.map((r) => r.id)).toEqual(['d']);
    expect(grupos.observados).toEqual([]);
    expect(grupos.eximidos).toEqual([]);
  });

  it('solo un documento pendiente sin versión basta con una fila; uno con retiro, exención o una sección de la información conserva su tarjeta', () => {
    expect(esFilaCompacta(requisito({ estado: 'Pendiente', versionActual: null }))).toBe(true);
    expect(esFilaCompacta(requisito({ estado: 'Pendiente' }))).toBe(false); // ya trae una versión
    expect(esFilaCompacta(requisito({ estado: 'Cargado', versionActual: null }))).toBe(false);
    expect(esFilaCompacta(requisito({ estado: 'Pendiente', versionActual: null, exencion: { por: 'u', fecha: '2026-11-01T10:00:00Z', justificacion: 'x' } }))).toBe(false);
    expect(esFilaCompacta(requisitoSeccion({ estado: 'Pendiente', versionActual: null }))).toBe(false);
  });
});

describe('Qué áreas revisan, por etapa', () => {
  it('las áreas de cada etapa en el orden de las etapas', () => {
    const datos = {
      ...expediente('EnRevision'),
      etapas: [
        { orden: 2, estado: 'Esperando' as const, activadaEn: null, aprobadaEn: null, areas: [area({ areaId: 'c', nombre: 'Integración SincSoft' })] },
        { orden: 1, estado: 'Activa' as const, activadaEn: null, aprobadaEn: null, areas: [area({ areaId: 'a', nombre: 'Acceso Total' }), area({ areaId: 'b', nombre: 'Sala ventas' })] },
      ],
    };
    expect(areasPorEtapa(datos)).toEqual([['Acceso Total', 'Sala ventas'], ['Integración SincSoft']]);
  });

  it('una etapa sin áreas no cuenta', () => {
    expect(areasPorEtapa({ etapas: [{ orden: 1, estado: 'Activa', activadaEn: null, aprobadaEn: null, areas: [] }] })).toEqual([]);
  });
});

describe('Cómo se pinta cada requisito para quien revisa', () => {
  it('lo por revisar va en el acento de la marca con el borde teñido; lo observado, en advertencia con el borde teñido', () => {
    expect(aparienciaParaElRevisor({ estado: 'Cargado', obligatorio: true })).toEqual({ tono: 'acento', resaltar: true, tenue: false });
    expect(aparienciaParaElRevisor({ estado: 'EnRevision', obligatorio: false })).toEqual({ tono: 'acento', resaltar: true, tenue: false });
    expect(aparienciaParaElRevisor({ estado: 'Observado', obligatorio: true })).toEqual({ tono: 'advertencia', resaltar: true, tenue: false });
  });

  it('lo que le toca al tercero va en gris neutro (más tenue si es opcional) y sin borde teñido', () => {
    expect(aparienciaParaElRevisor({ estado: 'Pendiente', obligatorio: true })).toEqual({ tono: 'neutro', resaltar: false, tenue: false });
    expect(aparienciaParaElRevisor({ estado: 'Pendiente', obligatorio: false })).toEqual({ tono: 'neutro', resaltar: false, tenue: true });
  });

  it('lo aprobado va en éxito; lo eximido o que no aplica, en gris tenue', () => {
    expect(aparienciaParaElRevisor({ estado: 'Aprobado', obligatorio: true })).toEqual({ tono: 'exito', resaltar: false, tenue: false });
    expect(aparienciaParaElRevisor({ estado: 'Eximido', obligatorio: true })).toEqual({ tono: 'neutro', resaltar: false, tenue: true });
    expect(aparienciaParaElRevisor({ estado: 'NoAplica', obligatorio: false })).toEqual({ tono: 'neutro', resaltar: false, tenue: true });
  });
});
