import type { ExpedientePublicoDto, RequisitoPublicoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { destinoFijo, rutaSegura } from '../boveda/parametrosSubida';
import {
  accionDeRequisito,
  debeRefrescar,
  hayProcesamientoEnCurso,
  observacionesDeRequisito,
  observacionesGenerales,
  requisitosPorGrupo,
  SONDEO_DE_RESPALDO_MS,
  SONDEO_RAPIDO_MS,
  solicitudDeRequisito,
} from './requisitos';

const requisito = (id: string, estado: RequisitoPublicoDto['estado'], cambios: Partial<RequisitoPublicoDto> = {}): RequisitoPublicoDto => ({
  id,
  tipoDocumento: { id: `td-${id}`, codigo: id.toUpperCase(), nombre: id, tipoCanonico: id.toUpperCase(), ambito: 'Global' },
  obligatorio: true,
  estado,
  versionActual: estado === 'Pendiente' ? null : { documentoId: `doc-${id}`, n: 1, sha256: 'x', cargadaEn: '2026-11-06T12:00:00Z' },
  observaciones: [],
  ...cambios,
});

const observacion = (requisitoCodigo: string | null) => ({ motivos: [{ codigo: 'incompleto', texto: 'Está incompleto.' }], observacion: null, fecha: '2026-11-06T13:00:00Z', requisito: requisitoCodigo });

function expediente(estado: ExpedientePublicoDto['estado'], requisitos: RequisitoPublicoDto[], observaciones = [observacion(null)]): ExpedientePublicoDto {
  return {
    id: 'e1',
    folio: 'NORTE-E-2026-000001',
    empresa: { id: 'emp', nombre: 'Constructora Norte S.A.S.', logoUrl: null },
    tipoVinculo: { id: 'tv', codigo: 'PROVEEDOR', nombre: 'Proveedor' },
    estado,
    observaciones,
    puedeReenviar: estado === 'Observado',
    reenvios: 0,
    actualizadoEn: '2026-11-06T13:00:00Z',
    requisitos,
    requisitosFaltantes: requisitos.filter((r) => r.estado === 'Pendiente').length,
  };
}

describe('documentos que pide la empresa', () => {
  it('agrupa en «te toca» (observado primero), «lo revisa la empresa» y «listo»', () => {
    const grupos = requisitosPorGrupo(
      expediente('Observado', [requisito('rut', 'Aprobado'), requisito('camara', 'Pendiente'), requisito('poliza', 'Observado'), requisito('renta', 'EnRevision'), requisito('ef', 'Eximido')]),
    );
    expect(grupos['te-toca'].map((r) => r.id)).toEqual(['poliza', 'camara']);
    expect(grupos['en-revision'].map((r) => r.id)).toEqual(['renta']);
    expect(grupos.listo.map((r) => r.id)).toEqual(['rut', 'ef']);
  });

  it('ofrece subir lo que falta, corregir lo observado y reemplazar lo cargado; nada si está cerrado', () => {
    const abierto = expediente('Abierto', []);
    expect(accionDeRequisito({ estado: 'Pendiente' }, abierto)).toBe('subir');
    expect(accionDeRequisito({ estado: 'Observado' }, abierto)).toBe('corregir');
    expect(accionDeRequisito({ estado: 'Cargado' }, abierto)).toBe('reemplazar');
    expect(accionDeRequisito({ estado: 'Aprobado' }, abierto)).toBeNull();
    expect(accionDeRequisito({ estado: 'Pendiente' }, expediente('Aprobado', []))).toBeNull();
  });

  it('un documento aprobado que está por vencer o vencido se puede renovar aunque la revisión esté aprobada', () => {
    const porVencer = { estado: 'Aprobado' as const, versionActual: { vigencia: { estado: 'PorVencer' as const } } };
    const vigente = { estado: 'Aprobado' as const, versionActual: { vigencia: { estado: 'Vigente' as const } } };
    expect(accionDeRequisito(porVencer, expediente('Aprobado', []))).toBe('reemplazar');
    expect(accionDeRequisito({ ...porVencer, versionActual: { vigencia: { estado: 'Vencida' as const } } }, expediente('Aprobado', []))).toBe('reemplazar');
    expect(accionDeRequisito(vigente, expediente('Aprobado', []))).toBeNull();
    expect(accionDeRequisito(porVencer, expediente('Rechazado', []))).toBeNull();
  });

  it('separa las observaciones de cada documento de las del expediente completo', () => {
    const camara = requisito('camara', 'Observado');
    const exp = expediente('Observado', [camara], [observacion(null), observacion('CAMARA')]);
    expect(observacionesGenerales(exp)).toHaveLength(1);
    expect(observacionesDeRequisito(camara, exp).map((o) => o.requisito)).toEqual(['CAMARA']);
  });

  it('arma la solicitud de subida: canónico global a la bóveda, tipo propio con su vínculo, el requisito y la vuelta a la revisión', () => {
    const base = { nombre: 'camara', volver: '/expediente/e1', expediente: 'e1', requisito: 'camara' };
    expect(solicitudDeRequisito(requisito('camara', 'Pendiente'), null, 'e1')).toEqual({ ...base, tipo: 'CAMARA' });
    // Con el vínculo como contexto, la API aplica las reglas de archivo que configuró la empresa.
    expect(solicitudDeRequisito(requisito('camara', 'Pendiente'), 'v1', 'e1')).toEqual({ ...base, tipo: 'CAMARA', vinculoId: 'v1' });
    const propio = requisito('anexo', 'Pendiente', { tipoDocumento: { id: 'td-anexo', codigo: 'ANEXO', nombre: 'Anexo', tipoCanonico: null, ambito: 'PorVinculo' } });
    expect(solicitudDeRequisito(propio, 'v1', 'e1')).toEqual({
      nombre: 'Anexo',
      volver: '/expediente/e1',
      expediente: 'e1',
      requisito: 'anexo',
      tipoDocumentoTenantId: 'td-anexo',
      vinculoId: 'v1',
    });
    expect(solicitudDeRequisito(propio, null, 'e1')).toBeNull();
  });

  describe('refresco del expediente', () => {
    const ahora = Date.parse('2026-11-06T12:00:30Z');
    const enAnalisis = (estado: string, cargadaEn: string) =>
      requisito('rut', 'Cargado', { versionActual: { documentoId: 'doc-rut', n: 1, sha256: 'x', cargadaEn, estado } });

    it('sin stream se pide cada 30 s mientras el expediente esté vivo, sin sondeo rápido', () => {
      for (const estado of ['Abierto', 'Observado', 'EnRevision'] as const)
        expect(debeRefrescar(expediente(estado, [requisito('rut', 'Pendiente')]), { streamConectado: false, ahora })).toBe(SONDEO_DE_RESPALDO_MS);
    });

    it('con el stream conectado no se sondea: los avisos lo refrescan', () => {
      for (const estado of ['Abierto', 'Observado', 'EnRevision'] as const)
        expect(debeRefrescar(expediente(estado, [requisito('rut', 'Pendiente')]), { streamConectado: true, ahora })).toBe(false);
    });

    it('se sondea rápido solo mientras algo se procesa: una versión en análisis o lo recién subido', () => {
      const recibida = expediente('Abierto', [enAnalisis('Recibida', '2026-11-06T12:00:00Z')]);
      const analizando = expediente('EnRevision', [enAnalisis('EnAnalisis', '2026-11-06T12:00:00Z')]);
      expect(hayProcesamientoEnCurso(recibida, ahora)).toBe(true);
      expect(debeRefrescar(recibida, { streamConectado: true, ahora })).toBe(SONDEO_RAPIDO_MS);
      expect(debeRefrescar(analizando, { streamConectado: false, ahora })).toBe(SONDEO_RAPIDO_MS);

      const pendiente = expediente('Abierto', [requisito('rut', 'Pendiente')]);
      expect(debeRefrescar(pendiente, { streamConectado: true, esperandoSubidaHasta: ahora + 10_000, ahora })).toBe(SONDEO_RAPIDO_MS);
      // Pasada la espera de la subida se vuelve al stream (o al respaldo).
      expect(debeRefrescar(pendiente, { streamConectado: true, esperandoSubidaHasta: ahora - 1, ahora })).toBe(false);
      expect(debeRefrescar(pendiente, { streamConectado: false, esperandoSubidaHasta: ahora - 1, ahora })).toBe(SONDEO_DE_RESPALDO_MS);
    });

    it('una versión atascada o ya actual no mantiene el sondeo rápido', () => {
      const atascada = expediente('Abierto', [enAnalisis('EnAnalisis', '2026-11-06T11:00:00Z')]);
      expect(hayProcesamientoEnCurso(atascada, ahora)).toBe(false);
      expect(debeRefrescar(atascada, { streamConectado: true, ahora })).toBe(false);
      expect(debeRefrescar(atascada, { streamConectado: false, ahora })).toBe(SONDEO_DE_RESPALDO_MS);
      const actual = expediente('Abierto', [enAnalisis('Actual', '2026-11-06T12:00:00Z')]);
      expect(hayProcesamientoEnCurso(actual, ahora)).toBe(false);
      expect(hayProcesamientoEnCurso(expediente('Abierto', [enAnalisis('EnAnalisis', 'no-es-fecha')]), ahora)).toBe(false);
    });

    it('no sondea un expediente cerrado ni sin datos, aunque haya algo en espera', () => {
      const entorno = { streamConectado: false, esperandoSubidaHasta: ahora + 10_000, ahora };
      for (const estado of ['Aprobado', 'Rechazado', 'Anulado', 'Caducado'] as const) expect(debeRefrescar(expediente(estado, []), entorno)).toBe(false);
      expect(debeRefrescar(undefined, entorno)).toBe(false);
    });
  });
});

describe('parámetros de «Subir documento»', () => {
  it('lee el destino fijado por un requisito', () => {
    expect(destinoFijo(new URLSearchParams('tipo=RUT&nombre=RUT'))).toEqual({ destino: { tipoCanonico: 'RUT' }, nombre: 'RUT' });
    expect(destinoFijo(new URLSearchParams('tipo=RUT&nombre=RUT&vinculoId=v1'))).toEqual({ destino: { tipoCanonico: 'RUT', vinculoId: 'v1' }, nombre: 'RUT' });
    expect(destinoFijo(new URLSearchParams('tipoDocumentoTenantId=t1&vinculoId=v1&nombre=Anexo'))).toEqual({ destino: { tipoDocumentoTenantId: 't1', vinculoId: 'v1' }, nombre: 'Anexo' });
    expect(destinoFijo(new URLSearchParams('documento=d1'))).toBeNull();
  });

  it('solo vuelve a rutas de la app', () => {
    expect(rutaSegura('/expediente/e1')).toBe('/expediente/e1');
    expect(rutaSegura('//evil.example')).toBeNull();
    expect(rutaSegura('https://evil.example')).toBeNull();
    expect(rutaSegura(null)).toBeNull();
  });
});
