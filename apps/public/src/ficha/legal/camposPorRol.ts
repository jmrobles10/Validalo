import type { PerfilDeFichaDto } from '@validalo/api-client';
import type { PersonaRelacionada, RolPersona } from '../tipos';
import { esSociedad } from './personas';

/**
 * Qué campos lleva cada persona de la información legal según su rol y cuáles son obligatorios. Es la tabla que sigue el diálogo «Agregar persona»
 * y coincide con lo que exige el servidor (`EsquemaLegal.Revisar`, `Validalo.Dominio/Ficha/EsquemasDeSeccion.cs`): rol, tipo y número de
 * identificación, nombres (razón social si es una sociedad), apellidos (si no lo es), las dos preguntas PEP, el porcentaje del socio y el DV de
 * los tipos que lo declaran. Lo demás es opcional.
 */

/** Los campos del diálogo (los de la fila más las dos decisiones que se toman ahí: «también es socio» y el porcentaje). */
export type CampoDePersona =
  | 'rol'
  | 'tipo_representacion'
  | 'tambien_socio'
  | 'porcentaje'
  | 'tipo_identificacion'
  | 'numero'
  | 'dv'
  | 'nombres'
  | 'apellidos'
  | 'cargo'
  | 'pep'
  | 'vinculo_pep'
  | 'declaracion_pep'
  | 'fecha_expedicion'
  | 'lugar_expedicion'
  | 'fecha_nacimiento'
  | 'nacionalidad'
  | 'residencia'
  | 'correo'
  | 'telefono';

export type Presencia = 'oculto' | 'opcional' | 'obligatorio';

/** Los roles que representan a la empresa y por eso llevan «tipo de representación» (como en el certificado: Principal, Primer suplente…). */
export const ROLES_CON_REPRESENTACION: readonly RolPersona[] = ['RepresentanteLegal', 'Suplente', 'Apoderado'];

/** Un socio no tiene cargo por serlo: el cargo es de su otro rol, si lo tiene. */
export const ROLES_SIN_CARGO: readonly RolPersona[] = ['Socio'];

export interface ContextoDePersona {
  /** La respuesta a «¿También es socio o accionista?»; `null` = aún sin responder. Con el rol Socio no aplica. */
  tambienSocio: boolean | null;
  /** Los tipos de identificación del país del tercero y los que declaran su DV (RG-4); sin perfil, ninguno declara DV. */
  perfil?: PerfilDeFichaDto | null;
}

const hayTexto = (valor: string | null | undefined): boolean => (valor ?? '').trim() !== '';

/** ¿El tipo de identificación de la persona declara su DV (el RUC de Panamá)? El resto lo calcula Valídalo. */
export const declaraDv = (tipo: string | null | undefined, perfil: PerfilDeFichaDto | null | undefined): boolean => perfil?.tiposConDvDeclarado.includes(tipo ?? '') === true;

/** La tabla rol → campo: visible, opcional u obligatorio. Sin rol elegido solo se piden los datos de siempre. */
export function presenciaDeCampos(p: PersonaRelacionada, contexto: ContextoDePersona): Record<CampoDePersona, Presencia> {
  const rol = p.rol ?? null;
  const esSocio = rol === 'Socio';
  const sociedad = esSociedad(p.tipo_identificacion, p.numero);
  const sinSocio = rol === null || esSocio;
  const porcentaje = esSocio || (!sinSocio && contexto.tambienSocio === true);
  return {
    rol: 'obligatorio',
    tipo_representacion: rol !== null && ROLES_CON_REPRESENTACION.includes(rol) ? 'opcional' : 'oculto',
    tambien_socio: sinSocio ? 'oculto' : 'obligatorio',
    porcentaje: porcentaje ? 'obligatorio' : 'oculto',
    tipo_identificacion: 'obligatorio',
    numero: 'obligatorio',
    dv: declaraDv(p.tipo_identificacion, contexto.perfil) ? 'obligatorio' : 'oculto',
    nombres: 'obligatorio',
    apellidos: sociedad ? 'oculto' : 'obligatorio',
    cargo: rol !== null && ROLES_SIN_CARGO.includes(rol) ? 'oculto' : 'opcional',
    pep: 'obligatorio',
    vinculo_pep: 'obligatorio',
    declaracion_pep: p.pep === true ? 'obligatorio' : 'oculto',
    fecha_expedicion: 'opcional',
    lugar_expedicion: 'opcional',
    fecha_nacimiento: 'opcional',
    nacionalidad: 'opcional',
    residencia: 'opcional',
    correo: 'opcional',
    telefono: 'opcional',
  };
}

/**
 * Lo que deja de aplicar al elegir un rol: el tipo de representación fuera de los roles que representan y el cargo del socio. Devuelve solo lo
 * que hay que vaciar (los campos que ya estaban vacíos no se tocan), para no guardar basura de un rol anterior.
 */
export function limpiezaAlCambiarDeRol(p: PersonaRelacionada, rol: RolPersona | null): PersonaRelacionada {
  const limpiar: PersonaRelacionada = {};
  if (rol !== null && !ROLES_CON_REPRESENTACION.includes(rol) && hayTexto(p.tipo_representacion)) limpiar.tipo_representacion = null;
  if (rol !== null && ROLES_SIN_CARGO.includes(rol) && hayTexto(p.cargo)) limpiar.cargo = null;
  return limpiar;
}

/** Qué falla de un campo: falta (obligatorio sin valor) o su formato no es válido. */
export type MotivoDeFalta = 'falta' | 'invalido';

export interface Faltante {
  campo: CampoDePersona;
  motivo: MotivoDeFalta;
}

/** Cuál es el problema de un campo con formato: el código se traduce en `ficha.legal.errores.<código>`. */
export type ErrorDeFormato = 'porcentajeRango' | 'porcentajeDecimales' | 'dv' | 'correo' | 'telefono' | 'fechaFutura' | 'nacimientoPosterior';

// Las mismas expresiones que el servidor (`RegexCorreo`, `RegexTelefono`).
const REGEX_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const REGEX_TELEFONO = /^\+?[0-9][0-9 ()-]{5,24}$/;

/** El formato de los campos que lo tienen (los mismos controles de forma que hace el servidor); vacío = nada que revisar. */
export function erroresDeFormato(p: PersonaRelacionada, contexto: ContextoDePersona, hoy: string): Partial<Record<CampoDePersona, ErrorDeFormato>> {
  const presencia = presenciaDeCampos(p, contexto);
  const errores: Partial<Record<CampoDePersona, ErrorDeFormato>> = {};
  const porcentaje = p.porcentaje;
  if (presencia.porcentaje !== 'oculto' && porcentaje !== null && porcentaje !== undefined) {
    if (porcentaje < 0 || porcentaje > 100) errores.porcentaje = 'porcentajeRango';
    else if ((String(porcentaje).split('.')[1] ?? '').length > 4) errores.porcentaje = 'porcentajeDecimales';
  }
  if (presencia.dv !== 'oculto' && hayTexto(p.dv) && !/^[0-9]{2}$/.test((p.dv ?? '').trim())) errores.dv = 'dv';
  const correo = (p.correo ?? '').trim();
  if (correo !== '' && (correo.length > 254 || !REGEX_CORREO.test(correo))) errores.correo = 'correo';
  const telefono = (p.telefono ?? '').trim();
  if (telefono !== '') {
    const digitos = telefono.replace(/[^0-9]/g, '').length;
    if (!REGEX_TELEFONO.test(telefono) || digitos < 7 || digitos > 15) errores.telefono = 'telefono';
  }
  if (hayTexto(p.fecha_expedicion) && (p.fecha_expedicion ?? '') > hoy) errores.fecha_expedicion = 'fechaFutura';
  if (hayTexto(p.fecha_nacimiento) && (p.fecha_nacimiento ?? '') > hoy) errores.fecha_nacimiento = 'fechaFutura';
  else if (hayTexto(p.fecha_nacimiento) && hayTexto(p.fecha_expedicion) && (p.fecha_nacimiento ?? '') >= (p.fecha_expedicion ?? '')) errores.fecha_nacimiento = 'nacimientoPosterior';
  return errores;
}

const TIENE_VALOR: Record<CampoDePersona, (p: PersonaRelacionada, contexto: ContextoDePersona) => boolean> = {
  rol: (p) => p.rol !== null && p.rol !== undefined,
  tipo_representacion: (p) => hayTexto(p.tipo_representacion),
  tambien_socio: (_p, contexto) => contexto.tambienSocio !== null,
  porcentaje: (p) => p.porcentaje !== null && p.porcentaje !== undefined,
  tipo_identificacion: (p) => hayTexto(p.tipo_identificacion),
  numero: (p) => hayTexto(p.numero),
  dv: (p) => hayTexto(p.dv),
  nombres: (p) => hayTexto(p.nombres),
  apellidos: (p) => hayTexto(p.apellidos),
  cargo: (p) => hayTexto(p.cargo),
  pep: (p) => p.pep !== null && p.pep !== undefined,
  vinculo_pep: (p) => p.vinculo_pep !== null && p.vinculo_pep !== undefined,
  declaracion_pep: (p) => p.declaracion_pep !== null && p.declaracion_pep !== undefined,
  fecha_expedicion: (p) => hayTexto(p.fecha_expedicion),
  lugar_expedicion: (p) => hayTexto(p.lugar_expedicion),
  fecha_nacimiento: (p) => hayTexto(p.fecha_nacimiento),
  nacionalidad: (p) => hayTexto(p.nacionalidad),
  residencia: (p) => hayTexto(p.residencia),
  correo: (p) => hayTexto(p.correo),
  telefono: (p) => hayTexto(p.telefono),
};

/**
 * Los campos que impiden dar la persona por lista, en el orden del diálogo: los obligatorios de su rol que faltan y los que tienen un formato
 * inválido (porcentaje fuera de 0–100, correo, teléfono, fecha futura, nacimiento posterior a la expedición, DV de 2 dígitos). Vacía = lista.
 * `hoy`: el día civil de hoy `aaaa-mm-dd`.
 */
export function faltantesDePersona(p: PersonaRelacionada, contexto: ContextoDePersona, hoy: string): Faltante[] {
  const presencia = presenciaDeCampos(p, contexto);
  const formato = erroresDeFormato(p, contexto, hoy);
  const campos = Object.keys(presencia) as CampoDePersona[];
  return campos.flatMap((campo): Faltante[] => {
    if (presencia[campo] === 'obligatorio' && !TIENE_VALOR[campo](p, contexto)) return [{ campo, motivo: 'falta' }];
    return formato[campo] !== undefined ? [{ campo, motivo: 'invalido' }] : [];
  });
}
