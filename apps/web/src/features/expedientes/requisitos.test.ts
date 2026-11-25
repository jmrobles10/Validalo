import { SCOPES, type AreaDeRequisitoDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import { area, areaDeRequisito, expediente, requisito, veredicto } from './datosPrueba';
import { dialogoAplica, type ContextoRevisor } from './reglas';
import {
  bloqueoRequisito,
  dialogoDeVeredicto,
  enFaseDeCarga,
  puedeEximir,
  quienDecide,
  requisitosFaltantes,
  usuariosDelExpediente,
  veredictosInvalidados,
  veredictosVigentesDeRequisito,
} from './requisitos';

const REVISOR = new Set<string>([SCOPES.expedientesLeer, SCOPES.expedientesRevisar]);
const ADMIN = new Set<string>([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.expedientesAdministrar]);
const miembro = (scopes: ReadonlySet<string> = REVISOR, extra: Partial<ContextoRevisor> = {}): ContextoRevisor => ({ scopes, usuarioId: 'u-1', esMiembro: true, ...extra });

const conRequisitos = (estado: Parameters<typeof expediente>[0], requisitos = [requisito()]) => ({ ...expediente(estado), requisitos });

describe('fase de carga', () => {
  it('el expediente Abierto con requisitos espera documentos y dice cuáles faltan', () => {
    const camara = requisito({ id: 'r-camara', estado: 'Pendiente', versionActual: null, tipoDocumento: { id: 'td-c', codigo: 'CAMARA_COMERCIO', nombre: 'Cámara de comercio', tipoCanonico: 'CAMARA_COMERCIO', ambito: 'Global' } });
    const opcional = requisito({ id: 'r-op', estado: 'Pendiente', versionActual: null, obligatorio: false });
    const exp = conRequisitos('Abierto', [requisito({ estado: 'Cargado' }), camara, opcional]);
    expect(enFaseDeCarga(exp)).toBe(true);
    expect(requisitosFaltantes(exp).map((r) => r.id)).toEqual(['r-camara']);
    expect(enFaseDeCarga(expediente('Abierto'))).toBe(false); // sin requisitos (FL-1)
  });
});

describe('veredicto por documento', () => {
  it('deja decidir al miembro del área pendiente con el expediente en revisión', () => {
    const r = requisito();
    expect(bloqueoRequisito(conRequisitos('EnRevision', [r]), r, r.areas[0]!, miembro())).toBeNull();
  });

  it('explica cada bloqueo: carga, devuelto, sin versión, área en espera o cerrada, no miembro, ya votó', () => {
    const r = requisito();
    const a = r.areas[0]!;
    expect(bloqueoRequisito(conRequisitos('Abierto', [r]), r, a, miembro())).toBe('expediente-en-carga');
    expect(bloqueoRequisito(conRequisitos('Observado', [r]), r, a, miembro())).toBe('expediente-observado');
    expect(bloqueoRequisito(conRequisitos('Aprobado', [r]), r, a, miembro())).toBe('expediente-cerrado');
    expect(bloqueoRequisito(conRequisitos('EnRevision'), requisito({ versionActual: null }), a, miembro())).toBe('sin-version');
    expect(bloqueoRequisito(conRequisitos('EnRevision'), requisito({ estado: 'Eximido' }), a, miembro())).toBe('requisito-cerrado');
    expect(bloqueoRequisito(conRequisitos('EnRevision'), r, areaDeRequisito({ estado: 'Esperando' }), miembro())).toBe('area-esperando');
    expect(bloqueoRequisito(conRequisitos('EnRevision'), r, areaDeRequisito({ estado: 'Aprobado' }), miembro())).toBe('area-cerrada');
    expect(bloqueoRequisito(conRequisitos('EnRevision'), r, a, miembro(REVISOR, { esMiembro: false }))).toBe('no-es-miembro');
    const yaVoto = areaDeRequisito({ aprobadoresRequeridos: 2, aprobaciones: 1, veredictos: [veredicto({ sobreVersion: 1 })] });
    expect(bloqueoRequisito(conRequisitos('EnRevision'), r, yaVoto, miembro())).toBe('ya-voto');
  });

  it('un voto sobre una versión anterior (invalidado por la nueva) no cuenta: puede volver a decidir', () => {
    const r = requisito({ versionActual: { documentoId: 'doc-rut', n: 2, sha256: 'def', cargadaEn: '2026-11-06T15:00:00Z' } });
    const area2 = areaDeRequisito({ veredictos: [veredicto({ sobreVersion: 1, invalidado: true })] });
    expect(bloqueoRequisito(conRequisitos('EnRevision', [r]), r, area2, miembro())).toBeNull();
    expect(veredictosVigentesDeRequisito(area2)).toEqual([]);
    expect(veredictosInvalidados(area2).map((v) => v.sobreVersion)).toEqual([1]);
  });

  it('el diálogo deja de aplicar si llegó otra versión mientras se revisaba (version-superada)', () => {
    const r = requisito();
    const dialogo = { tipo: 'veredictoRequisito' as const, requisito: r, areaRequisito: r.areas[0]!, nombreArea: 'Jurídica' };
    const contexto = () => miembro();
    expect(dialogoAplica(dialogo, conRequisitos('EnRevision', [r]), contexto)).toBe(true);
    const nueva = requisito({ versionActual: { documentoId: 'doc-rut', n: 2, sha256: 'def', cargadaEn: '2026-11-06T15:00:00Z' } });
    expect(dialogoAplica(dialogo, conRequisitos('EnRevision', [nueva]), contexto)).toBe(false);
  });
});

describe('exención y nombres', () => {
  it('exime solo el administrador, con el expediente abierto y el documento sin aprobar', () => {
    const r = requisito({ estado: 'Pendiente' });
    expect(puedeEximir(conRequisitos('Abierto', [r]), r, ADMIN)).toBe(true);
    expect(puedeEximir(conRequisitos('Abierto', [r]), r, REVISOR)).toBe(false);
    expect(puedeEximir(conRequisitos('EnRevision'), requisito({ estado: 'Aprobado' }), ADMIN)).toBe(false);
    expect(puedeEximir(conRequisitos('Aprobado', [r]), r, ADMIN)).toBe(false);
  });

  it('un documento que ya no aplica según la ficha del tercero (NoAplica) no se revisa ni se exime a mano (EF-5)', () => {
    const noAplica = requisito({ estado: 'NoAplica' });
    expect(bloqueoRequisito(conRequisitos('EnRevision', [noAplica]), noAplica, noAplica.areas[0]!, miembro())).toBe('requisito-cerrado');
    expect(puedeEximir(conRequisitos('EnRevision', [noAplica]), noAplica, ADMIN)).toBe(false);
  });

  it('junta los ids de quienes aparecen para pedir sus nombres una sola vez', () => {
    const r = requisito({
      exencion: { por: 'u-admin', justificacion: 'No aplica', fecha: '2026-11-06T15:00:00Z' },
      areas: [areaDeRequisito({ veredictos: [veredicto({ usuario: 'u-2' })] })],
    });
    const exp = { ...expediente('EnRevision', [area({ miembrosPendientes: ['u-3'], veredictos: [veredicto({ usuario: 'u-2' })] })]), requisitos: [r] };
    expect(usuariosDelExpediente(exp)).toEqual(['u-2', 'u-3', 'u-admin']);
  });
});

describe('quién decide el requisito (junto a la conclusión de la IA)', () => {
  const acceso = area({ areaId: 'a-acceso', codigo: 'ACCESO', nombre: 'Acceso Total' });
  const cumplimiento = area({ areaId: 'a-cumpl', codigo: 'CUMPLIMIENTO', nombre: 'Cumplimiento' });
  const areas = new Map([acceso, cumplimiento].map((a) => [a.areaId, a]));
  const dosAreas = (estados: [AreaDeRequisitoDto['estado'], AreaDeRequisitoDto['estado']]) =>
    requisito({ areas: [areaDeRequisito({ areaId: 'a-acceso', codigo: 'ACCESO', estado: estados[0] }), areaDeRequisito({ areaId: 'a-cumpl', codigo: 'CUMPLIMIENTO', estado: estados[1] })] });
  const comoMiembroDe = (...ids: string[]) => (a: { areaId: string } | null) => miembro(REVISOR, { esMiembro: a !== null && ids.includes(a.areaId) });

  it('quien es miembro del área en turno puede decidir ahora, con la misma guarda del botón del área; las demás quedan como pendientes', () => {
    const r = dosAreas(['Pendiente', 'Esperando']);
    const quien = quienDecide(conRequisitos('EnRevision', [r]), r, areas, comoMiembroDe('a-acceso'));

    expect(quien.puede?.nombre).toBe('Acceso Total');
    expect(quien.puede?.areaRequisito).toBe(r.areas[0]);
    expect(quien.pendientes).toEqual(['Cumplimiento']);
    // Es exactamente lo que dice bloqueoRequisito para esa área: sin bloqueo.
    expect(bloqueoRequisito(conRequisitos('EnRevision', [r]), r, r.areas[0]!, miembro())).toBeNull();
  });

  it('quien no es miembro de ninguna área en turno no puede decidir y se dice quién decide', () => {
    const r = dosAreas(['Pendiente', 'Esperando']);
    const quien = quienDecide(conRequisitos('EnRevision', [r]), r, areas, comoMiembroDe());

    expect(quien).toEqual({ puede: null, pendientes: ['Acceso Total', 'Cumplimiento'] });
  });

  it('otra área en turno: el miembro de un área en espera todavía no decide', () => {
    const r = dosAreas(['Pendiente', 'Esperando']);

    expect(quienDecide(conRequisitos('EnRevision', [r]), r, areas, comoMiembroDe('a-cumpl')).puede).toBeNull();
  });

  it('sin el permiso de revisar nadie decide desde esta pantalla', () => {
    const r = dosAreas(['Pendiente', 'Pendiente']);
    const lector = () => miembro(new Set<string>([SCOPES.expedientesLeer]));

    expect(quienDecide(conRequisitos('EnRevision', [r]), r, areas, lector).puede).toBeNull();
  });

  it('con el expediente en carga o devuelto al tercero nadie decide todavía; un área aprobada ya no está pendiente', () => {
    const r = dosAreas(['Aprobado', 'Pendiente']);

    expect(quienDecide(conRequisitos('Abierto', [r]), r, areas, comoMiembroDe('a-cumpl')).puede).toBeNull();
    expect(quienDecide(conRequisitos('EnRevision', [r]), r, areas, comoMiembroDe()).pendientes).toEqual(['Cumplimiento']);
  });

  it('usa el código del área si no se conoce su nombre', () => {
    const r = dosAreas(['Pendiente', 'Pendiente']);

    expect(quienDecide(conRequisitos('EnRevision', [r]), r, new Map(), comoMiembroDe()).pendientes).toEqual(['ACCESO', 'CUMPLIMIENTO']);
  });

  it('el diálogo de «Aprobar» junto a la conclusión es el mismo del botón del área', () => {
    const r = dosAreas(['Pendiente', 'Pendiente']);

    expect(dialogoDeVeredicto(r, r.areas[0]!, 'Acceso Total')).toEqual({ tipo: 'veredictoRequisito', requisito: r, areaRequisito: r.areas[0], nombreArea: 'Acceso Total' });
  });
});
