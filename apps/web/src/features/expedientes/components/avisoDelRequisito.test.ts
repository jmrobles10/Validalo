import type { HechosDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { requisito } from '../datosPrueba';
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

  it('un requisito sin soporte de secciones no tiene nota de cruce', () => {
    expect(soporteSinCruce(requisito(), documentoEnVisor(requisito(), HECHOS))).toBe(false);
  });
});
