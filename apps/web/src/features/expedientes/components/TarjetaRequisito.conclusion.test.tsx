import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPES, type AreaExpedienteDto, type ConclusionDeRevisionDto, type HechosDto, type RequisitoExpedienteDto, type RevisionAutomaticaDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it, vi } from 'vitest';
import { area, areaDeRequisito, conclusionDeRevision, expediente, requisito } from '../datosPrueba';
import type { ContextoRevisor, DialogoExpediente } from '../reglas';
import { TarjetaRequisito } from './TarjetaRequisito';

const REVISOR: ContextoRevisor = { scopes: new Set([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.documentosLeer]), usuarioId: 'u-1', esMiembro: true };
const SOLO_LECTURA: ContextoRevisor = { scopes: new Set([SCOPES.expedientesLeer, SCOPES.documentosLeer]), usuarioId: 'u-1', esMiembro: true };

const ACCESO = area({ areaId: 'a-acceso', codigo: 'ACCESO', nombre: 'Acceso Total' });
const CUMPLIMIENTO = area({ areaId: 'a-cumpl', codigo: 'CUMPLIMIENTO', nombre: 'Cumplimiento' });

const CEDULA_REPRESENTANTE = requisito({
  id: 'r-cedula',
  tipoDocumento: { id: 'td-cedula', codigo: 'CEDULA', nombre: 'Fotocopia de la cédula del representante legal', tipoCanonico: 'CEDULA', ambito: 'Global' },
  versionActual: { documentoId: 'doc-cedula', n: 1, sha256: 'abc', cargadaEn: '2026-11-25T14:00:00Z' },
  persona: { rol: 'RepresentanteLegal', todasLasRelaciones: false, sinPersona: false, personaId: 'p-1', nombre: 'JOEL MATEO ROBLES ATUESTA', identificacion: 'CO CC 1073250322' },
  areas: [areaDeRequisito({ areaId: 'a-acceso', codigo: 'ACCESO', estado: 'Pendiente' }), areaDeRequisito({ areaId: 'a-cumpl', codigo: 'CUMPLIMIENTO', estado: 'Esperando' })],
});

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
  ia: {
    modelo: 'gpt-6-luna',
    escalado: false,
    confianza: 0.98,
    legible: true,
    tipoDetectado: 'CEDULA',
    campos: { numero: '1073250322', nombres: 'JOEL MATEO', apellidos: 'ROBLES ATUESTA', fechaNacimiento: '1999-05-02', fechaExpedicion: '2019-03-12' },
    alertas: [],
    observaciones: null,
    paginasEnviadas: 1,
    paginasOmitidas: 0,
    fecha: '2026-11-25T15:00:00Z',
  },
};

const SIN_LEER: HechosDto = { ...HECHOS, conIa: false, ia: null };

const PERSONA_COINCIDE: ConclusionDeRevisionDto = conclusionDeRevision({ cruzadoConLoDeclarado: false, persona: { nombre: 'JOEL MATEO ROBLES ATUESTA', identificacion: 'CC 1073250322' } });

const revision = (cambios: Partial<RevisionAutomaticaDto>): RevisionAutomaticaDto => ({
  areaId: 'a-acceso',
  areaCodigo: 'ACCESO',
  sobreVersion: 1,
  nivel: 'Asistido',
  resultado: 'Sugerida',
  sugerencia: 'Aprobar',
  motivos: [],
  confianza: 0.98,
  fecha: '2026-11-25T15:00:00Z',
  pendienteDeAtencion: false,
  resolucion: null,
  resueltaPor: null,
  resueltaEn: null,
  justificacionResolucion: null,
  ...cambios,
});

interface Opciones {
  contexto?: ContextoRevisor;
  estado?: 'EnRevision' | 'Abierto';
  decidirPorDocumento?: boolean;
  /** Las áreas del expediente en las que `contexto` es miembro (por omisión, solo Acceso Total). */
  miembroDe?: string[];
}

function montar(requisitoDelTest: RequisitoExpedienteDto, hechos: HechosDto | null, { contexto = REVISOR, estado = 'EnRevision', decidirPorDocumento = false, miembroDe = ['a-acceso'] }: Opciones = {}) {
  const onAccion = vi.fn<(dialogo: DialogoExpediente) => void>();
  const areas = new Map<string, AreaExpedienteDto>([ACCESO, CUMPLIMIENTO].map((a) => [a.areaId, a]));
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ul>
          <TarjetaRequisito
            expediente={{ ...expediente(estado, [ACCESO, CUMPLIMIENTO]), requisitos: [requisitoDelTest] }}
            requisito={requisitoDelTest}
            areas={areas}
            contexto={(a) => ({ ...contexto, esMiembro: a !== null && miembroDe.includes(a.areaId) })}
            nombres={new Map()}
            puedeVer
            onVer={() => undefined}
            onAccion={onAccion}
            decidirPorDocumento={decidirPorDocumento}
            hechos={hechos}
          />
        </ul>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { onAccion, bloque: () => screen.queryByRole('group', { name: 'Lectura y cruce del documento' }) };
}

const conConclusion = (conclusion: ConclusionDeRevisionDto, base = CEDULA_REPRESENTANTE): RequisitoExpedienteDto => ({ ...base, conclusionDeRevision: conclusion });

describe('Tarjeta del requisito: el color de la confianza usa el umbral de la conclusión', () => {
  const color = (hechos: HechosDto, umbral: number) => {
    montar(conConclusion(conclusionDeRevision({ umbral, cruzadoConLoDeclarado: false })), hechos);
    const confianza = within(screen.getByRole('region', { name: 'Revisión automática' })).getByText(/^Confianza 90s?%$/);
    const estilo = getComputedStyle(confianza).color;
    cleanup();
    return estilo;
  };
  const AL_90 = { ...HECHOS, ia: { ...HECHOS.ia!, confianza: 0.9 } };

  it('con el mismo 90 %, bajo un umbral de 95 % se pinta en advertencia y con uno de 85 % no', () => {
    expect(color(AL_90, 0.95)).not.toBe(color(AL_90, 0.85));
  });
});

describe('Tarjeta del requisito: la conclusión de la IA en el bloque «Revisión automática»', () => {
  it('abre el contenido del bloque: después del encabezado y antes de lo que se leyó', () => {
    const { bloque } = montar(conConclusion(PERSONA_COINCIDE), HECHOS);

    const texto = bloque()!.textContent;
    expect(texto.indexOf('Analizado el 25/11/2026')).toBeGreaterThan(-1);
    expect(texto.indexOf('Se sugiere aprobar')).toBeGreaterThan(texto.indexOf('Analizado el'));
    expect(texto.indexOf('Se sugiere aprobar')).toBeLessThan(texto.indexOf('Legible'));
    expect(bloque()).toHaveTextContent('coincide con la persona declarada JOEL MATEO ROBLES ATUESTA (CC 1073250322).');
  });

  it('lo que leyó la IA queda como detalle secundario: legible y el tipo a la vista, lo demás tras «Ver lo que leyó la IA»', async () => {
    const usuario = userEvent.setup();
    montar(conConclusion(PERSONA_COINCIDE), HECHOS);

    const revision = within(screen.getByRole('region', { name: 'Revisión automática' }));
    // Al pie, en una línea compacta y en gris; los datos extraídos solo tras el enlace.
    const pie = revision.getByText(/^Legible: /).closest('[data-lectura-al-pie]')!;
    expect(pie.querySelector('[data-lectura-resumen]')).toHaveTextContent('Legible: Sí · Tipo detectado: Cédula de ciudadanía');
    expect(revision.queryByLabelText('Datos extraídos')).not.toBeInTheDocument();
    expect(revision.queryByText('1073250322')).not.toBeInTheDocument();
    await usuario.click(revision.getByRole('button', { name: 'Ver lo que leyó la IA' }));
    expect(within(revision.getByLabelText('Datos extraídos')).getByText('1073250322')).toBeInTheDocument();
    // La conclusión va antes y la zona de detalles es lo último del bloque.
    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    expect(bloque.textContent.indexOf('Se sugiere aprobar')).toBeLessThan(bloque.textContent.indexOf('Legible: '));
  });

  it('el botón «Aprobar» de la conclusión abre el mismo diálogo que el botón del área', async () => {
    const usuario = userEvent.setup();
    const { onAccion } = montar(conConclusion(PERSONA_COINCIDE), HECHOS, { decidirPorDocumento: true });

    await usuario.click(screen.getByRole('button', { name: 'Aprobar Fotocopia de la cédula del representante legal por Acceso Total' }));
    await usuario.click(screen.getByRole('button', { name: 'Aprobar u observar Fotocopia de la cédula del representante legal por Acceso Total' }));

    expect(onAccion).toHaveBeenCalledTimes(2);
    expect(onAccion.mock.calls[0]![0]).toEqual(onAccion.mock.calls[1]![0]);
    expect(onAccion.mock.calls[0]![0]).toMatchObject({ tipo: 'veredictoRequisito', nombreArea: 'Acceso Total', areaRequisito: { areaId: 'a-acceso' } });
  });

  it('el botón aparece junto a la conclusión aunque el «Aprobar u observar» por documento esté apagado', () => {
    montar(conConclusion(PERSONA_COINCIDE), HECHOS, { decidirPorDocumento: false });

    const conclusion = screen.getByRole('region', { name: 'Conclusión de la IA' });
    expect(within(conclusion).getByRole('button', { name: /^Aprobar Fotocopia/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Aprobar u observar/ })).not.toBeInTheDocument();
  });

  it('sin permiso para decidir: no hay botón y dice quién decide', () => {
    montar(conConclusion(PERSONA_COINCIDE), HECHOS, { contexto: SOLO_LECTURA });

    const conclusion = screen.getByRole('region', { name: 'Conclusión de la IA' });
    expect(within(conclusion).queryByRole('button')).not.toBeInTheDocument();
    expect(conclusion).toHaveTextContent('Es una sugerencia de la IA: decide una persona de Acceso Total y Cumplimiento.');
  });

  it('de otra área (aquí en espera): no decide todavía y se dice qué áreas deciden', () => {
    montar(conConclusion(PERSONA_COINCIDE), HECHOS, { miembroDe: ['a-cumpl'] });

    const conclusion = screen.getByRole('region', { name: 'Conclusión de la IA' });
    expect(within(conclusion).queryByRole('button')).not.toBeInTheDocument();
    expect(conclusion).toHaveTextContent('decide una persona de Acceso Total y Cumplimiento');
  });

  it('con el expediente aún abierto a la carga del tercero nadie decide: sin botón', () => {
    montar(conConclusion(PERSONA_COINCIDE), HECHOS, { estado: 'Abierto' });

    expect(within(screen.getByRole('region', { name: 'Conclusión de la IA' })).queryByRole('button')).not.toBeInTheDocument();
  });

  it('«Revisa antes de aprobar» con el motivo, sin botón, y la cédula de otra persona dice en qué difiere', () => {
    const otra = conclusionDeRevision({
      sugerencia: 'Revisar',
      cruzadoConLoDeclarado: false,
      motivos: [
        {
          codigo: 'discrepancia-critica-ficha',
          texto: 'El documento no coincide con la persona declarada, JOEL MATEO ROBLES ATUESTA (CC 1073250322): difiere en Número de identificación, Nombres y apellidos.',
        },
      ],
    });
    montar(conConclusion(otra), HECHOS);

    const conclusion = screen.getByRole('region', { name: 'Conclusión de la IA' });
    expect(within(conclusion).getByText('Revisa antes de aprobar')).toBeInTheDocument();
    expect(conclusion).toHaveTextContent('difiere en Número de identificación, Nombres y apellidos.');
    expect(within(conclusion).queryByRole('button')).not.toBeInTheDocument();
  });

  it('sin análisis de la IA: el bloque lo dice y el aviso de «Sin lectura automática» no se repite', () => {
    montar(conConclusion(conclusionDeRevision({ sugerencia: 'SinAnalisis', cruzadoConLoDeclarado: false })), SIN_LEER);

    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    expect(within(bloque).getByText('Sin análisis de la IA')).toBeInTheDocument();
    expect(bloque).toHaveTextContent('La IA no pudo analizarlo; revísalo a mano.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Revisión automática' })).not.toBeInTheDocument();
  });

  it('una empresa sin conclusión (no usa IA) queda como antes: sin bloque de conclusión y con su aviso de revisar a mano', () => {
    montar(CEDULA_REPRESENTANTE, SIN_LEER);

    expect(screen.queryByRole('region', { name: 'Conclusión de la IA' })).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sin lectura automática');
  });

  it('con la conclusión a la vista, la sugerencia de Asistido no se repite en «Decisión automática»', () => {
    montar(conConclusion(conclusionDeRevision({ nivel: 'Asistido' }), { ...CEDULA_REPRESENTANTE, revisionesAutomaticas: [revision({ resultado: 'Sugerida' })] }), HECHOS);

    expect(screen.getByRole('region', { name: 'Conclusión de la IA' })).toHaveTextContent('Se sugiere aprobar');
    expect(screen.queryByRole('region', { name: 'Decisión automática' })).not.toBeInTheDocument();
    expect(screen.queryByText('La IA sugiere aprobar')).not.toBeInTheDocument();
  });

  it('sin conclusión la sugerencia registrada de Asistido se sigue viendo', () => {
    montar({ ...CEDULA_REPRESENTANTE, revisionesAutomaticas: [revision({ resultado: 'Sugerida' })] }, SIN_LEER);

    expect(screen.getByRole('region', { name: 'Decisión automática' })).toHaveTextContent('La IA sugiere aprobar');
  });

  it('la aprobación del sistema del nivel Automático sigue en «Decisión automática», junto a la conclusión y el rol del nivel', () => {
    montar(conConclusion(conclusionDeRevision({ nivel: 'Automatico' }), { ...CEDULA_REPRESENTANTE, revisionesAutomaticas: [revision({ nivel: 'Automatico', resultado: 'AprobadaAutomaticamente', sugerencia: null })] }), HECHOS);

    expect(screen.getByRole('region', { name: 'Decisión automática' })).toHaveTextContent('Aprobado por el sistema');
    expect(screen.getByRole('region', { name: 'Conclusión de la IA' })).toHaveTextContent('La empresa tiene revisión automática');
  });
});
