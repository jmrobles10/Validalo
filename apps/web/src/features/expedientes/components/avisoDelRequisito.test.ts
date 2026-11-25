import type { HechosDto, VersionRequisitoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { antiguedad, requisito, requisitoConAntiguedad } from '../datosPrueba';
import { documentoEnVisor } from '../requisitos';
import { archivoSinLeer, avisoDelRequisito, soporteSinCruce } from './avisoDelRequisito';

const t = i18n.t.bind(i18n);

const HECHOS: HechosDto = {
  conIa: true,
  hashVerificado: true,
  antivirus: 'Limpio',
  mimeReal: 'application/pdf',
  paginas: 1,
  comparacion: 'SinCambios',
  camposCambiados: [],
  camposCriticosCambiados: [],
  pendienteRevisionHumana: true,
  ia: { modelo: 'gpt-6-luna', escalado: false, confianza: 0.99, legible: true, tipoDetectado: 'RUT', campos: {}, alertas: [], observaciones: null, paginasEnviadas: 1, paginasOmitidas: 0, fecha: '2026-11-24T15:00:00Z' },
};
const SIN_LEER: HechosDto = { ...HECHOS, conIa: false, ia: null };

const SIN_CRUCE = requisito({ soporteDeSecciones: { sinAnalisis: true, discrepanciaCritica: false, secciones: [] } });

describe('aviso del requisito: la lectura del archivo y el cruce con lo que respalda', () => {
  it('el archivo se da por sin leer solo si llegó sin la lectura automática', () => {
    expect(archivoSinLeer(documentoEnVisor(requisito(), SIN_LEER))).toBe(true);
    expect(archivoSinLeer(documentoEnVisor(requisito(), HECHOS))).toBe(false);
    // Sin hechos (todavía no llegan o no hay permiso para verlos) no se sabe: no se afirma que no se leyó.
    expect(archivoSinLeer(documentoEnVisor(requisito(), null))).toBe(false);
    expect(archivoSinLeer(null)).toBe(false);
  });

  it('archivo leído y cruce sin con qué compararse: no hay aviso de falta de lectura, sí la nota del cruce', () => {
    const visor = documentoEnVisor(SIN_CRUCE, HECHOS);
    expect(avisoDelRequisito(SIN_CRUCE, visor, t)).toBeNull();
    expect(soporteSinCruce(SIN_CRUCE, visor)).toBe(true);
  });

  it('archivo sin leer: el aviso es el de falta de lectura y la nota del cruce sobra', () => {
    const visor = documentoEnVisor(SIN_CRUCE, SIN_LEER);
    expect(avisoDelRequisito(SIN_CRUCE, visor, t)).toEqual({ severidad: 'info', texto: 'Sin lectura automática: revísalo y compáralo a mano con lo que declaró el tercero.' });
    expect(soporteSinCruce(SIN_CRUCE, visor)).toBe(false);
  });

  it('sin hechos y cruce sin con qué compararse: tampoco se afirma que no se leyó', () => {
    const visor = documentoEnVisor(SIN_CRUCE, null);
    expect(avisoDelRequisito(SIN_CRUCE, visor, t)).toBeNull();
    expect(soporteSinCruce(SIN_CRUCE, visor)).toBe(true);
  });

  it('la discrepancia crítica sigue siendo el aviso más importante', () => {
    const critica = requisito({ soporteDeSecciones: { sinAnalisis: false, discrepanciaCritica: true, secciones: [] } });
    expect(avisoDelRequisito(critica, documentoEnVisor(critica, SIN_LEER), t)?.severidad).toBe('error');
  });

  it('la antigüedad máxima excedida o sin fecha verificable (TD-10) es un hallazgo crítico: aviso de error con su detalle', () => {
    const antiguedad = (cambios: Partial<NonNullable<VersionRequisitoDto['antiguedad']>>): VersionRequisitoDto => ({
      documentoId: 'doc-rut',
      n: 1,
      sha256: 'abc',
      cargadaEn: '2026-11-24T14:00:00Z',
      antiguedad: {
        estado: 'Excedida',
        maximoDias: 30,
        fechaExpedicion: '2024-07-17',
        dias: 860,
        fuente: 'Ia',
        fechaDeclarada: null,
        difiereDeLaDeclarada: false,
        critico: true,
        detalle: 'Expedida el 17/07/2024: 860 días; el máximo es 30.',
        mensaje: null,
        campo: null,
        ...cambios,
      },
    });
    const excedida = requisito({ versionActual: antiguedad({}) });
    expect(avisoDelRequisito(excedida, documentoEnVisor(excedida, HECHOS), t)).toEqual({
      severidad: 'error',
      texto: 'Antigüedad del documento: Expedida el 17/07/2024: 860 días; el máximo es 30. Aprobarlo pide una justificación.',
    });
    // Lo que cumple no avisa.
    const cumple = requisito({ versionActual: antiguedad({ estado: 'Cumple', critico: false }) });
    expect(avisoDelRequisito(cumple, documentoEnVisor(cumple, HECHOS), t)).toBeNull();
  });

  it('un requisito sin soporte de secciones no tiene nota de cruce', () => {
    expect(soporteSinCruce(requisito(), documentoEnVisor(requisito(), HECHOS))).toBe(false);
  });
});

describe('El aviso de un documento más antiguo de lo que permite su tipo', () => {
  it('lo dice como hallazgo crítico, con el detalle de la API', () => {
    const aviso = avisoDelRequisito(requisitoConAntiguedad(antiguedad()), null, t);
    expect(aviso?.severidad).toBe('error');
    expect(aviso?.texto).toContain('Expedida el 17/07/2024: 860 días; el máximo es 30.');
  });

  it('un documento dentro del máximo, o un tipo sin regla de antigüedad, no avisa nada', () => {
    const dentro = antiguedad({ estado: 'Cumple', dias: 12, critico: false, campo: { ...antiguedad().campo!, resultado: 'Coincide', extraido: '12 días' } });
    expect(avisoDelRequisito(requisitoConAntiguedad(dentro), null, t)).toBeNull();
    expect(avisoDelRequisito(requisitoConAntiguedad(null), null, t)).toBeNull();
  });
});
