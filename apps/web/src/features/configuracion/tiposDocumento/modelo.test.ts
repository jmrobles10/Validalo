import type { TipoDocumentoTenantDto } from '@validalo/api-client';
import i18n from 'i18next';
import { describe, expect, it } from 'vitest';
import '../../../i18n';
import { sePuedePedir } from '../../flujos/editor';
import {
  borradorDe,
  borradorNuevo,
  campoNuevo,
  claveDesdeEtiqueta,
  cuerpoActualizar,
  cuerpoCrear,
  diasDeRevalidacion,
  etiquetaDelCanonico,
  frescuraSugerida,
  mesesADias,
  plazoParaEditar,
  validarBorrador,
  type BorradorTipo,
} from './modelo';
import { enumerar, plazoEnPalabras, resumenTipo, resumenVigencia } from './resumen';

const t = i18n.t.bind(i18n);

export const TIPO: TipoDocumentoTenantDto = {
  id: 'td1',
  codigo: 'CAMARA_COMERCIO',
  nombre: 'Certificado de existencia y representación legal',
  tipoCanonico: 'CAMARA_COMERCIO',
  versionCanonico: 1,
  ambito: 'Global',
  clase: 'Archivo',
  textoAyuda: null,
  reglaFrescura: { tipo: 'Ninguna', dias: null, regla: null },
  antiguedadMaximaDias: 30,
  revalidarCadaDias: 365,
  diasAviso: [30, 15, 5],
  diasGracia: 15,
  diasRevalidacion: 15,
  activo: true,
  creadoEn: '2026-11-08T20:41:38Z',
  formatosPermitidos: ['application/pdf'],
  tamanoMaximoMb: 5,
  paginasMaximas: null,
  modo: 'Archivo',
  campos: [],
  reglasEfectivas: { formatos: ['application/pdf'], tamanoMaximoBytes: 5 * 1024 * 1024, paginasMaximas: 50, descripcion: 'Certificado… admite solo PDF de hasta 5 MB' },
  plantilla: null,
  cargaSoportada: true,
};

const formulario = (cambios: Partial<BorradorTipo> = {}): BorradorTipo => ({
  ...borradorNuevo(),
  codigo: 'DECLARACION_ORIGEN',
  nombre: 'Declaración de origen de fondos',
  modo: 'Formulario',
  campos: [{ ...campoNuevo(), etiqueta: 'Fecha de expedición', clave: 'fecha_expedicion', tipo: 'Fecha', obligatorio: true }],
  ...cambios,
});

describe('borrador de un tipo de documento', () => {
  it('se arma desde la API con los formatos en nombre corto y los límites vacíos si son los globales', () => {
    const b = borradorDe(TIPO);
    expect(b.formatos).toEqual(['pdf']);
    expect(b.tamanoMb).toBe('5');
    expect(b.paginas).toBe('');
    expect(b.diasAviso).toBe('30, 15, 5');
    // Las dos reglas de frescura (TD-10): 30 días de antigüedad y 365 días de revalidación, que se muestran como 12 meses.
    expect([b.antiguedad, b.revalidar, b.unidadRevalidar, b.periodo]).toEqual(['30', '12', 'meses', '']);
  });

  it('el plazo de revalidación se guarda en días: 12 meses son 365 (un año) y se vuelve a mostrar en meses solo si es una cantidad exacta de dos o más', () => {
    expect(mesesADias(12)).toBe(365);
    expect(mesesADias(6)).toBe(183);
    expect(mesesADias(1)).toBe(30);
    expect(plazoParaEditar(365)).toEqual({ valor: '12', unidad: 'meses' });
    expect(plazoParaEditar(183)).toEqual({ valor: '6', unidad: 'meses' });
    expect(plazoParaEditar(30)).toEqual({ valor: '30', unidad: 'dias' }); // un mes suelto sigue diciéndose en días
    expect(plazoParaEditar(90)).toEqual({ valor: '90', unidad: 'dias' });
    expect(plazoParaEditar(null)).toEqual({ valor: '', unidad: 'dias' });
    expect(diasDeRevalidacion({ revalidar: '12', unidadRevalidar: 'meses' })).toBe(365);
    expect(diasDeRevalidacion({ revalidar: '90', unidadRevalidar: 'dias' })).toBe(90);
    expect(diasDeRevalidacion({ revalidar: '', unidadRevalidar: 'dias' })).toBeNull();
  });

  it('el canónico sugiere las reglas de frescura y se precargan en el borrador', () => {
    expect(frescuraSugerida({ antiguedadMaximaSugeridaDias: 30, revalidarCadaSugeridoDias: 365, reglaFrescuraSugerida: null })).toEqual({
      antiguedad: '30',
      revalidar: '12',
      unidadRevalidar: 'meses',
      periodo: '',
    });
    expect(frescuraSugerida({ antiguedadMaximaSugeridaDias: null, revalidarCadaSugeridoDias: 365, reglaFrescuraSugerida: null }).antiguedad).toBe('');
    expect(frescuraSugerida({ reglaFrescuraSugerida: { tipo: 'PeriodoMinimo', dias: null, regla: 'ultimo-anio' } })).toMatchObject({ antiguedad: '', revalidar: '', periodo: 'ultimo-anio' });
  });

  it('la clave se sugiere en snake_case a partir de la etiqueta', () => {
    expect(claveDesdeEtiqueta('Fecha de expedición')).toBe('fecha_de_expedicion');
    expect(claveDesdeEtiqueta('  ¿Año 2024? ')).toBe('ano_2024');
    expect(claveDesdeEtiqueta('3 socios')).toBe('c_3_socios');
  });

  it('valida como la API: código, formulario solo del vínculo, claves únicas, reservadas como Fecha y listas con opciones', () => {
    expect(validarBorrador(formulario(), true)).toEqual([]);
    expect(validarBorrador(formulario({ codigo: 'mal' }), true)).toContainEqual({ campo: 'codigo', codigo: 'codigo-invalido' });
    expect(validarBorrador(formulario({ ambito: 'Global' }), true)).toContainEqual({ campo: 'ambito', codigo: 'formulario-solo-por-vinculo' });
    expect(validarBorrador(formulario({ campos: [] }), true)).toContainEqual({ campo: 'campos', codigo: 'campos-requeridos' });

    const repetido = { ...campoNuevo(), etiqueta: 'Otra', clave: 'fecha_expedicion', tipo: 'Fecha' as const };
    expect(validarBorrador(formulario({ campos: [...formulario().campos, repetido] }), true)).toContainEqual({ campo: 'campo', indice: 1, codigo: 'campo-duplicado' });
    const reservada = { ...campoNuevo(), etiqueta: 'Vence', clave: 'fecha_vencimiento', tipo: 'Texto' as const };
    expect(validarBorrador(formulario({ campos: [reservada] }), true)).toContainEqual({ campo: 'campo', indice: 0, codigo: 'campo-reservado' });
    const lista = { ...campoNuevo(), etiqueta: 'Régimen', clave: 'regimen', tipo: 'Lista' as const };
    expect(validarBorrador(formulario({ campos: [lista] }), true)).toContainEqual({ campo: 'campo', indice: 0, codigo: 'opciones-requeridas' });

    expect(validarBorrador({ ...formulario(), antiguedad: '4000' }, true)).toContainEqual({ campo: 'antiguedad', codigo: 'antiguedad-invalida' });
    expect(validarBorrador({ ...formulario(), antiguedad: '0' }, true)).toContainEqual({ campo: 'antiguedad', codigo: 'antiguedad-invalida' });
    expect(validarBorrador({ ...formulario(), revalidar: '0' }, true)).toContainEqual({ campo: 'revalidar', codigo: 'revalidacion-invalida' });
    // 121 meses son más de 3650 días.
    expect(validarBorrador({ ...formulario(), revalidar: '121', unidadRevalidar: 'meses' }, true)).toContainEqual({ campo: 'revalidar', codigo: 'revalidacion-invalida' });
    // Las dos reglas son opcionales: vacías, no hay error.
    expect(validarBorrador({ ...formulario(), antiguedad: '', revalidar: '' }, true)).toEqual([]);
    expect(validarBorrador({ ...formulario(), antiguedad: '30', revalidar: '12', unidadRevalidar: 'meses' }, true)).toEqual([]);
    expect(validarBorrador({ ...formulario(), tamanoMb: '2000' }, true)).toContainEqual({ campo: 'tamanoMb', codigo: 'limite-invalido' });
  });

  it('al crear manda los formatos cortos y los campos; al actualizar, 0 vuelve al global y [] quita los campos', () => {
    const lista = { ...campoNuevo(), etiqueta: 'Régimen', clave: 'regimen', tipo: 'Lista' as const, opciones: 'Común\nSimplificado\n' };
    const crear = cuerpoCrear(formulario({ campos: [lista], formatos: ['pdf'] }));
    expect(crear).toMatchObject({ codigo: 'DECLARACION_ORIGEN', modo: 'Formulario', formatosPermitidos: ['pdf'], tipoCanonico: null, tamanoMaximoMb: null });
    // Sin reglas de frescura escritas, se mandan vacías; con ellas, antigüedad en días y revalidación en días (los meses se convierten).
    expect(crear).toMatchObject({ antiguedadMaximaDias: null, revalidarCadaDias: null, reglaFrescura: { tipo: 'Ninguna' } });
    expect(cuerpoCrear(formulario({ antiguedad: '30', revalidar: '12', unidadRevalidar: 'meses' }))).toMatchObject({ antiguedadMaximaDias: 30, revalidarCadaDias: 365 });
    expect(crear.campos).toEqual([{ clave: 'regimen', etiqueta: 'Régimen', tipo: 'Lista', obligatorio: false, opciones: ['Común', 'Simplificado'], ayuda: null }]);

    const actualizar = cuerpoActualizar({ ...borradorDe(TIPO), tamanoMb: '', modo: 'Archivo' });
    expect(actualizar).toMatchObject({ tamanoMaximoMb: 0, paginasMaximas: 0, campos: [], activo: true });
    // La regla heredada ya solo lleva el periodo; las dos nuevas viajan en sus campos y, en un PUT, vaciar una manda 0 para quitarla.
    expect(actualizar.reglaFrescura).toEqual({ tipo: 'Ninguna', dias: null, regla: null });
    expect(actualizar).toMatchObject({ antiguedadMaximaDias: 30, revalidarCadaDias: 365 });
    expect(cuerpoActualizar({ ...borradorDe(TIPO), antiguedad: '', revalidar: '' })).toMatchObject({ antiguedadMaximaDias: 0, revalidarCadaDias: 0 });
    expect(cuerpoActualizar({ ...borradorDe(TIPO), periodo: 'ultimo-anio' }).reglaFrescura).toEqual({ tipo: 'PeriodoMinimo', dias: null, regla: 'ultimo-anio' });
  });
});

describe('resumen de reglas (lista y editor de flujos)', () => {
  it('dice formato, peso, páginas, formulario y plantilla en corto', () => {
    expect(enumerar(['PDF', 'JPG', 'PNG'])).toBe('PDF, JPG o PNG');
    expect(resumenTipo(TIPO, t)).toBe('PDF · hasta 5 MB · 50 págs.');
    const conTodo = {
      ...TIPO,
      modo: 'ArchivoYFormulario',
      campos: [{ clave: 'a', etiqueta: 'A', tipo: 'Texto' }, { clave: 'b', etiqueta: 'B', tipo: 'Texto' }],
      plantilla: { version: 1, nombreOriginal: 'f.docx', mime: 'x', tamanoBytes: 1, sha256: 'x', cargadaEn: '2026-11-08', cargadaPor: 'u', vigente: true, retiradaEn: null },
    };
    expect(resumenTipo(conTodo, t)).toBe('PDF · hasta 5 MB · 50 págs. · Formulario (2 campos) · con plantilla');
    expect(resumenTipo({ ...TIPO, modo: 'Formulario', campos: [{ clave: 'a', etiqueta: 'A', tipo: 'Texto' }] }, t)).toBe('Formulario (1 campo)');
  });

  it('explica las dos reglas de frescura en palabras, cada una opcional', () => {
    expect(resumenVigencia(TIPO, t)).toBe('Expedido hace menos de 30 días · Se revalida cada 1 año desde que lo apruebas');
    expect(resumenVigencia({ reglaFrescura: { tipo: 'Ninguna' } }, t)).toBe('No vence');
    expect(resumenVigencia({ reglaFrescura: { tipo: 'Ninguna' }, antiguedadMaximaDias: 1 }, t)).toBe('Expedido hace menos de 1 día');
    expect(resumenVigencia({ reglaFrescura: { tipo: 'Ninguna' }, revalidarCadaDias: 90 }, t)).toBe('Se revalida cada 90 días desde que lo apruebas');
    expect(resumenVigencia({ reglaFrescura: { tipo: 'PeriodoMinimo', regla: 'ultimo-anio' }, revalidarCadaDias: 183 }, t)).toBe(
      'Se revalida cada 6 meses desde que lo apruebas · Periodo mínimo: ultimo-anio',
    );
    expect(plazoEnPalabras(730, t)).toBe('2 años');
    expect(plazoEnPalabras(30, t)).toBe('30 días');
  });

  it('en un flujo se puede pedir cualquier tipo activo que el proveedor pueda entregar (también formularios)', () => {
    expect(sePuedePedir(TIPO)).toBe(true);
    expect(sePuedePedir({ activo: true, clase: 'Formulario', cargaSoportada: true })).toBe(true);
    expect(sePuedePedir({ activo: true, clase: 'Formulario', cargaSoportada: false })).toBe(false);
    expect(sePuedePedir({ activo: false, clase: 'Archivo', cargaSoportada: true })).toBe(false);
    expect(sePuedePedir({ activo: true, clase: 'Archivo' })).toBe(true);
  });
});

describe('Canónicos por país (RG-5)', () => {
  it('el canónico de un solo país lo lleva en su etiqueta y el de cualquiera va con su nombre', () => {
    expect(etiquetaDelCanonico({ nombre: 'Registro Único Tributario', paises: ['CO'] })).toBe('Registro Único Tributario · Colombia');
    expect(etiquetaDelCanonico({ nombre: 'Certificado de RUC (DGI)', paises: ['PA'] })).toBe('Certificado de RUC (DGI) · Panamá');
    expect(etiquetaDelCanonico({ nombre: 'Constancia de RNC (DGII)', paises: ['DO'] })).toBe('Constancia de RNC (DGII) · República Dominicana');
    expect(etiquetaDelCanonico({ nombre: 'Cédula de ciudadanía', paises: null })).toBe('Cédula de ciudadanía');
    expect(etiquetaDelCanonico({ nombre: 'Pasaporte' })).toBe('Pasaporte');
  });
});
