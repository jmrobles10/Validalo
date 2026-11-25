import type { CondicionDto, RequisitoExpedienteDto, TipoDocumentoTenantDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { GRUPOS_SECTORES } from '../vinculos/ficha/gruposSectores';
import { SECCIONES_FICHA } from '../terceros/ficha/secciones';
import { SECTORES_DE_REQUISITO, sectorDeRequisito, sectorDeSeccion } from '../vinculos/ficha/sectores';
import { requisitoDeSeccionNuevo, requisitoNuevo, requisitosADto, type RequisitoEnEditor } from './editor';
import {
  agruparPorSector,
  contarRequisitos,
  entradasEnOrdenVisual,
  nombreDelSector,
  POR_COMPLETAR,
  posicionesConError,
  sectorDelRequisito,
  sectorDelTipo,
  textoDelConteo,
  tiposPorPedirEnSector,
} from './requisitosPorSector';

const t = i18n.t.bind(i18n);

const tipo = (id: string, tipoCanonico: string | null = null): TipoDocumentoTenantDto =>
  ({ id, codigo: id.toUpperCase(), nombre: id, clase: 'Archivo', activo: true, tipoCanonico }) as unknown as TipoDocumentoTenantDto;

const TIPOS = [
  tipo('rut', 'RUT'),
  tipo('camara', 'CAMARA_COMERCIO'),
  tipo('bancaria', 'CERTIFICACION_BANCARIA'),
  tipo('estados', 'ESTADOS_FINANCIEROS'),
  tipo('general', 'FORMATO_VINCULACION'),
  tipo('sst', 'SG_SST'),
  tipo('afiliacion', 'AFILIACION_SEGURIDAD_SOCIAL'),
  tipo('datos', 'AUTORIZACION_TRATAMIENTO_DATOS'),
  tipo('cedula', 'CEDULA'),
  tipo('sarlaft', 'FORMULARIO_SARLAFT'),
  tipo('alturas'),
];

const doc = (id: string, clave: string, extra: Partial<RequisitoEnEditor> = {}): RequisitoEnEditor => ({ ...requisitoNuevo(id), clave, ...extra });
const seccion = (codigo: string, clave: string): RequisitoEnEditor => ({ ...requisitoDeSeccionNuevo(codigo), clave });

describe('el sector de un requisito del editor de flujos', () => {
  it('sale del mismo mapeo que usa la ficha del vínculo: el tipo canónico del documento y el código de la sección', () => {
    for (const canonico of ['RUT', 'CAMARA_COMERCIO', 'CERTIFICACION_BANCARIA', 'ESTADOS_FINANCIEROS', 'FORMATO_VINCULACION', 'SG_SST', 'AUTORIZACION_TRATAMIENTO_DATOS', 'FORMULARIO_SARLAFT', 'CEDULA', 'PROPIO', null]) {
      const enLaFicha = sectorDeRequisito({ persona: null, seccion: null, tipoDocumento: { tipoCanonico: canonico }, soporteDeSecciones: null } as unknown as RequisitoExpedienteDto);
      expect(sectorDelTipo({ tipoCanonico: canonico }), String(canonico)).toBe(enLaFicha);
    }
    for (const codigo of ['FICHA_GENERAL', 'FICHA_ESPECIALIDADES', 'FICHA_SST', 'FICHA_TRIBUTARIA', 'FICHA_FINANCIERA', 'FICHA_LEGAL']) {
      expect(sectorDelRequisito(seccion(codigo, 's'), TIPOS), codigo).toBe(sectorDeSeccion(codigo));
    }
  });

  it('un documento va a su sector por el tipo; el de una persona relacionada, a Información legal; un tipo propio, a «sin sector»', () => {
    expect(sectorDelRequisito(doc('rut', 'a'), TIPOS)).toBe('tributaria');
    expect(sectorDelRequisito(doc('bancaria', 'a'), TIPOS)).toBe('cuenta');
    expect(sectorDelRequisito(doc('sst', 'a'), TIPOS)).toBe('sst');
    expect(sectorDelRequisito(doc('sarlaft', 'a'), TIPOS)).toBe('cumplimiento');
    expect(sectorDelRequisito(doc('datos', 'a'), TIPOS)).toBe('autorizacion');
    expect(sectorDelRequisito(doc('cedula', 'a', { dePersonaRelacionada: 'Socio' }), TIPOS)).toBe('legal');
    expect(sectorDelRequisito(doc('alturas', 'a'), TIPOS)).toBe('documentos');
  });

  it('un documento nuevo sin tipo va a «Por completar» (no a «sin sector») y, si se agregó desde un sector, se queda en él', () => {
    expect(sectorDelRequisito(requisitoNuevo(), TIPOS)).toBe(POR_COMPLETAR);
    const nuevo = requisitoNuevo();
    expect(sectorDelRequisito(nuevo, TIPOS, { [nuevo.clave]: 'tributaria' })).toBe('tributaria');
    // Ya con tipo, manda el tipo y no la ubicación provisional.
    expect(sectorDelRequisito(doc('rut', 'a'), TIPOS, { a: 'sst' })).toBe('tributaria');
    // Un tipo que no se encuentra (inactivo o la lista aún no llega) no es «Por completar»: tiene tipo.
    expect(sectorDelRequisito(doc('borrado', 'a'), TIPOS)).toBe('documentos');
    expect(sectorDelRequisito(doc('borrado', 'a'), TIPOS, { a: 'sst' })).toBe('sst');
  });

  it('una sección siempre está en el sector de su código: nunca en «sin sector» ni en «Por completar»', () => {
    for (const { codigo } of SECCIONES_FICHA) {
      const sector = sectorDelRequisito(requisitoDeSeccionNuevo(codigo), TIPOS);
      expect(sector, codigo).toBe(sectorDeSeccion(codigo));
      expect(['documentos', POR_COMPLETAR]).not.toContain(sector);
    }
    expect(sectorDelRequisito(requisitoDeSeccionNuevo('FICHA_SST'), TIPOS)).toBe('sst');
    // Ni una colocada «provisionalmente» cambia de sector.
    expect(sectorDelRequisito(requisitoDeSeccionNuevo('FICHA_SST'), TIPOS, {})).toBe('sst');
  });
});

describe('«lo que pide el flujo» agrupado por sector', () => {
  it('usa los sectores y el orden del menú lateral del vínculo, «sin sector» al final y «Por completar» antes que todos', () => {
    expect(nombreDelSector(POR_COMPLETAR, t)).toBe('Por completar');
    expect(agruparPorSector([doc('alturas', 'a'), doc('rut', 'b'), requisitoNuevo()], TIPOS).map((g) => g.sector)).toEqual([POR_COMPLETAR, 'tributaria', 'documentos']);
    const informacion = GRUPOS_SECTORES.find((g) => g.clave === 'informacion')?.sectores ?? [];
    // Datos de contacto está en el menú pero no recibe requisitos.
    expect(SECTORES_DE_REQUISITO).toEqual([...informacion.filter((s) => s !== 'contactos'), 'documentos']);
    expect(SECTORES_DE_REQUISITO.map((s) => nombreDelSector(s, t))).toEqual([
      'Información general',
      'Seguridad industrial y SST',
      'Cuenta bancaria',
      'Información tributaria',
      'Información financiera',
      'Autorización y declaración',
      'Información legal',
      'Oficial de cumplimiento',
      'Otros documentos',
    ]);
  });

  const requisitos = [
    doc('alturas', 'alturas'),
    doc('estados', 'estados'),
    doc('rut', 'rut'),
    seccion('FICHA_FINANCIERA', 'sec-fin'),
    doc('general', 'general'),
    doc('camara', 'camara'),
    seccion('FICHA_GENERAL', 'sec-gen'),
    doc('cedula', 'cedula', { dePersonaRelacionada: 'RepresentanteLegal' }),
  ];

  it('ordena los grupos como el menú, pone la sección antes que los documentos y no muestra los sectores vacíos', () => {
    const grupos = agruparPorSector(requisitos, TIPOS);
    expect(grupos.map((g) => g.sector)).toEqual(['general', 'tributaria', 'financiera', 'legal', 'documentos']);
    expect(grupos.map((g) => [...g.secciones, ...g.documentos].map((e) => e.requisito.clave))).toEqual([
      ['sec-gen', 'general'],
      ['rut'],
      ['sec-fin', 'estados'],
      ['camara', 'cedula'],
      ['alturas'],
    ]);
    expect(entradasEnOrdenVisual(grupos).map((e) => e.requisito.clave)).toEqual(['sec-gen', 'general', 'rut', 'sec-fin', 'estados', 'camara', 'cedula', 'alturas']);
  });

  it('conserva la posición de cada requisito en el borrador (por ella van los errores y los cambios) y no toca el orden en que se guarda', () => {
    const antes = JSON.stringify(requisitosADto(requisitos));
    const grupos = agruparPorSector(requisitos, TIPOS);
    expect(entradasEnOrdenVisual(grupos).every((e) => requisitos[e.indice] === e.requisito)).toBe(true);
    expect(grupos.flatMap((g) => [...g.secciones, ...g.documentos]).map((e) => e.indice).sort((a, b) => a - b)).toEqual(requisitos.map((_, i) => i));
    expect(requisitos.map((r) => r.clave)).toEqual(['alturas', 'estados', 'rut', 'sec-fin', 'general', 'camara', 'sec-gen', 'cedula']);
    expect(JSON.stringify(requisitosADto(requisitos))).toBe(antes);
  });

  it('sin requisitos no hay grupos', () => {
    expect(agruparPorSector([], TIPOS)).toEqual([]);
  });

  it('cuenta documentos, secciones y los que tienen condición, y lo dice sin ceros', () => {
    const conCondicion: CondicionDto = { tipo: 'Predicado', nodos: null, atributo: 'tercero.tipoPersona', operador: 'Igual', valores: ['Juridica'] };
    const conteo = contarRequisitos([...requisitos.slice(0, 6), { ...requisitos[6]!, condicion: conCondicion }, { ...requisitos[7]!, condicion: conCondicion }]);
    expect(conteo).toEqual({ documentos: 6, secciones: 2, conCondicion: 2 });
    expect(textoDelConteo(conteo, t, true)).toBe('6 documentos · 2 secciones · 2 con condición');
    expect(textoDelConteo(conteo, t)).toBe('6 documentos · 2 secciones');
    expect(textoDelConteo({ documentos: 1, secciones: 1, conCondicion: 1 }, t, true)).toBe('1 documento · 1 sección · 1 con condición');
    expect(textoDelConteo({ documentos: 14, secciones: 0, conCondicion: 0 }, t, true)).toBe('14 documentos');
    expect(textoDelConteo({ documentos: 0, secciones: 2, conCondicion: 0 }, t, true)).toBe('2 secciones');
  });
});

describe('requisitos con error y tipos por pedir', () => {
  it('las posiciones con error salen de `requisito.<k>` y de sus subcampos, sin repetir', () => {
    expect(posicionesConError([{ campo: 'requisito.3' }, { campo: 'requisito.1.periodos' }, { campo: 'requisito.3.vigencia' }, { campo: 'area.0.0' }, { campo: 'requisito.12.revalidacion' }, { campo: 'nombre' }])).toEqual([1, 3, 12]);
    expect(posicionesConError([])).toEqual([]);
  });

  it('al agregar a un sector se ofrecen sus tipos que el flujo aún no pide', () => {
    const elegibles = [...TIPOS, tipo('constancia', 'CONSTANCIA_RNC')];
    expect(tiposPorPedirEnSector('tributaria', [], elegibles).map((x) => x.id)).toEqual(['rut', 'constancia']);
    expect(tiposPorPedirEnSector('tributaria', [doc('rut', 'a')], elegibles).map((x) => x.id)).toEqual(['constancia']);
    // El documento de una persona relacionada no cuenta como el del propio tercero.
    expect(tiposPorPedirEnSector('legal', [doc('cedula', 'a', { dePersonaRelacionada: 'Socio' })], elegibles).map((x) => x.id)).toContain('cedula');
    expect(tiposPorPedirEnSector('documentos', [], elegibles).map((x) => x.id)).toEqual(['alturas']);
    expect(tiposPorPedirEnSector('cuenta', [doc('bancaria', 'a')], elegibles)).toEqual([]);
  });
});
