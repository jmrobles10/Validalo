import type { ConclusionDeRevisionDto, RequisitoExpedienteDto } from '@validalo/api-client';
import type { QuienDecideElRequisito } from './requisitos';

/**
 * La conclusión que da la IA del documento (`requisito.conclusionDeRevision`), lista para pintar. La regla no está aquí: la calcula el servidor con el mismo motor de la revisión
 * automática (`MotorDeRevision.Concluir`: la sugerencia del nivel Asistido, las excepciones del Automático) y la manda en cualquier nivel de la empresa. Esta vista solo decide
 * cómo se ve: el tono, el título y qué se dice de lo que se verificó, de los motivos y de quién decide.
 */
export type SugerenciaDeLaIa = 'Aprobar' | 'Revisar' | 'SinAnalisis';
export type TonoDeLaConclusion = 'exito' | 'advertencia' | 'error';

/** Lo que el servidor verificó de un documento que se sugiere aprobar (cada uno es una frase de la conclusión). */
export type PuntoVerificado = 'legible' | 'tipo' | 'cruce' | 'cruceCritico' | 'persona' | 'antiguedad';

/**
 * Los motivos que son un hallazgo crítico (los mismos que piden justificación para aprobar o que apuntan a una alteración): la conclusión se pinta en error, no en advertencia.
 */
const MOTIVOS_CRITICOS: readonly string[] = ['discrepancia-critica-ficha', 'antiguedad-excedida', 'sin-fecha-de-expedicion', 'alertas-de-manipulacion'];

export interface VistaDeLaConclusion {
  sugerencia: SugerenciaDeLaIa;
  tono: TonoDeLaConclusion;
  /** El requisito aún se decide: ni aprobado, ni eximido, ni fuera de aplicación. Si no, la conclusión es un dato más y no se sugiere nada. */
  abierta: boolean;
  /** El nivel Automático tiene su propio flujo: el sistema aprueba lo autorizado y una persona decide el resto. */
  automatico: boolean;
  /** Para «Revisar»: el texto de cada motivo, tal como lo manda el servidor (concreto: qué campo difiere, cuántos días…). */
  motivos: readonly string[];
  /** Para «Aprobar»: lo que se verificó, en el orden en que se dice. */
  verificado: readonly PuntoVerificado[];
  /** Para «Aprobar»: los campos críticos que el cruce no pudo verificar (el motor no los cuenta como motivo, pero se dicen). */
  sinVerificar: readonly string[];
  /** Para «Aprobar»: los campos que no son críticos y difieren (no mandan el documento a una persona): lo declarado y lo que trae el documento; un valor ausente es `null`. */
  diferencias: readonly { etiqueta: string; declarado: string | null; extraido: string | null }[];
  /** La persona declarada con la que coincide el documento (cédula de una persona relacionada). */
  persona: { nombre: string; identificacion: string | null } | null;
}

const esSugerencia = (valor: string): valor is SugerenciaDeLaIa => valor === 'Aprobar' || valor === 'Revisar' || valor === 'SinAnalisis';

/** El requisito aún se decide (los estados `Aprobado`, `Eximido` y `NoAplica` ya no esperan a nadie). */
export function requisitoAbierto(requisito: Pick<RequisitoExpedienteDto, 'estado'>): boolean {
  return requisito.estado !== 'Aprobado' && requisito.estado !== 'Eximido' && requisito.estado !== 'NoAplica';
}

/** Un valor que esta versión no conoce se lee como «Revisar»: ante la duda, que lo mire una persona. */
export function vistaDeLaConclusion(conclusion: ConclusionDeRevisionDto, requisito: Pick<RequisitoExpedienteDto, 'estado'>): VistaDeLaConclusion {
  const sugerencia = esSugerencia(conclusion.sugerencia) ? conclusion.sugerencia : 'Revisar';
  const persona = conclusion.persona ?? null;
  const verificado: PuntoVerificado[] = [];
  if (sugerencia === 'Aprobar') {
    verificado.push('legible', 'tipo');
    // Con diferencias en campos no críticos se dice que coincide lo crítico (no «lo que dice»), y las diferencias van aparte.
    if (persona) verificado.push('persona');
    else if (conclusion.cruzadoConLoDeclarado) verificado.push(conclusion.diferencias.length > 0 ? 'cruceCritico' : 'cruce');
    if (conclusion.antiguedadVerificada) verificado.push('antiguedad');
  }
  const tono: TonoDeLaConclusion =
    sugerencia === 'Aprobar' ? 'exito' : sugerencia === 'Revisar' && conclusion.motivos.some((m) => MOTIVOS_CRITICOS.includes(m.codigo)) ? 'error' : 'advertencia';
  return {
    sugerencia,
    tono,
    abierta: requisitoAbierto(requisito),
    automatico: conclusion.nivel === 'Automatico',
    motivos: sugerencia === 'Revisar' ? conclusion.motivos.map((m) => m.texto.trim() || m.codigo) : [],
    verificado,
    sinVerificar: sugerencia === 'Aprobar' ? conclusion.sinVerificar : [],
    diferencias: sugerencia === 'Aprobar' ? conclusion.diferencias.map((d) => ({ etiqueta: d.etiqueta, declarado: d.declarado ?? null, extraido: d.extraido ?? null })) : [],
    persona: persona?.nombre ? { nombre: persona.nombre, identificacion: persona.identificacion ?? null } : null,
  };
}

/** Qué se dice de quién decide, junto a la conclusión (un texto corto): `null` si el requisito ya no se decide. */
export type RolDeLaIa =
  | { tipo: 'automatico' }
  | { tipo: 'puedes'; area: string }
  | { tipo: 'decide'; areas: string[] }
  | { tipo: 'sinAreas' };

/**
 * El rol de la IA: es una sugerencia y decide una persona (quien mira, si puede decidir ahora en su área; si no, las áreas que aún deciden). En el nivel Automático el sistema
 * tiene su propio flujo y se dice eso. Un requisito que ya no se decide, o un documento que la IA no pudo analizar (no hay sugerencia), no dicen nada de esto.
 */
export function rolDeLaIa(vista: Pick<VistaDeLaConclusion, 'abierta' | 'automatico' | 'sugerencia'>, decide: QuienDecideElRequisito): RolDeLaIa | null {
  if (!vista.abierta || vista.sugerencia === 'SinAnalisis') return null;
  if (vista.automatico) return { tipo: 'automatico' };
  if (decide.puede) return { tipo: 'puedes', area: decide.puede.nombre };
  return decide.pendientes.length > 0 ? { tipo: 'decide', areas: decide.pendientes } : { tipo: 'sinAreas' };
}

/** El botón «Aprobar» junto a la conclusión: solo si la IA sugiere aprobar, el requisito aún se decide y quien mira puede decidir ahora en su área. */
export function puedeAprobarDesdeLaConclusion(vista: Pick<VistaDeLaConclusion, 'abierta' | 'sugerencia'>, decide: QuienDecideElRequisito): boolean {
  return vista.sugerencia === 'Aprobar' && vista.abierta && decide.puede !== null;
}
