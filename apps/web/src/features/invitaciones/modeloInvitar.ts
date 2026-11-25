import type { AtributoPermitidoDto, InvitarTerceroDto, TipoIdentificacionDto } from '@validalo/api-client';
import { numeroValido, PAIS_POR_DEFECTO, TIPO_POR_DEFECTO } from '../configuracion/empresas/modelo';
import { cuerpoDeAtributos, type ValoresDeAtributos } from '../vinculos/atributos/modelo';
import { tipoDePersonaDe } from './tipoDePersona';

/**
 * Invitar a un tercero a mano (decisión IM): los mismos datos que una fila del lote, con la misma validación que `ValidacionDeLote` para avisar antes de enviar; la API decide
 * (422 con sus errores por campo, 409 si el vínculo ya existe y no se puede invitar).
 */

/** `ValidacionDeLote.LongitudMaximaTexto`. */
export const LONGITUD_MAXIMA_TEXTO = 200;

export interface BorradorInvitacion {
  pais: string;
  tipoIdentificacion: string;
  numero: string;
  /** Solo para los tipos con dígito de verificación; vacío = la API lo calcula. */
  digito: string;
  nombre: string;
  nombreComercial: string;
  correo: string;
  contacto: string;
  telefono: string;
  tipoVinculo: string;
  /** Código del flujo; vacío = el que corresponda según las reglas de la empresa. */
  flujo: string;
  /** Los valores de los atributos permitidos del tipo de vínculo elegido (clave → valor del control); vacío mientras el tipo no tenga atributos. */
  atributos: ValoresDeAtributos;
}

/** Los campos de texto del formulario (los atributos del vínculo se validan aparte, uno por uno). */
export type CampoInvitacion = Exclude<keyof BorradorInvitacion, 'atributos'>;

/** Los códigos de error de un campo (`invitaciones.invitarTercero.errores.*`). */
export type ErrorInvitacion =
  | 'tipo-identificacion-requerido'
  | 'numero-requerido'
  | 'numero-invalido'
  | 'nombre-requerido'
  | 'correo-requerido'
  | 'correo-invalido'
  | 'tipo-vinculo-requerido'
  | 'texto-demasiado-largo';

export interface ErrorDeCampo {
  campo: CampoInvitacion;
  codigo: ErrorInvitacion;
}

export function borradorInvitacionNuevo(): BorradorInvitacion {
  return {
    pais: PAIS_POR_DEFECTO,
    tipoIdentificacion: TIPO_POR_DEFECTO,
    numero: '',
    digito: '',
    nombre: '',
    nombreComercial: '',
    correo: '',
    contacto: '',
    telefono: '',
    tipoVinculo: '',
    flujo: '',
    atributos: {},
  };
}

/** Como `ValidacionDeLote`: algo, una arroba, algo, un punto y algo, sin espacios; hasta 254 caracteres. */
export function correoValido(correo: string): boolean {
  return correo.length <= 254 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo);
}

/** Los errores del borrador en el orden del formulario (el primero es el que se dice junto al botón). */
export function validarInvitacion(b: BorradorInvitacion, tipo: TipoIdentificacionDto | undefined): ErrorDeCampo[] {
  const errores: ErrorDeCampo[] = [];
  const largo = (campo: CampoInvitacion) => {
    if (b[campo].trim().length > LONGITUD_MAXIMA_TEXTO) errores.push({ campo, codigo: 'texto-demasiado-largo' });
  };

  if (!b.tipoIdentificacion) errores.push({ campo: 'tipoIdentificacion', codigo: 'tipo-identificacion-requerido' });
  if (!b.numero.trim()) errores.push({ campo: 'numero', codigo: 'numero-requerido' });
  else if (!numeroValido(b.numero, tipo)) errores.push({ campo: 'numero', codigo: 'numero-invalido' });
  if (!b.nombre.trim()) errores.push({ campo: 'nombre', codigo: 'nombre-requerido' });
  largo('nombre');
  largo('nombreComercial');
  const correo = b.correo.trim();
  if (!correo) errores.push({ campo: 'correo', codigo: 'correo-requerido' });
  else if (!correoValido(correo)) errores.push({ campo: 'correo', codigo: 'correo-invalido' });
  largo('contacto');
  largo('telefono');
  if (!b.tipoVinculo) errores.push({ campo: 'tipoVinculo', codigo: 'tipo-vinculo-requerido' });
  return errores;
}

const aNulo = (texto: string): string | null => texto.trim() || null;

/**
 * El cuerpo de `POST /invitaciones`: lo vacío viaja como `null` (la API lo trata como ausente). Los atributos del vínculo (`permitidos` son los del tipo elegido) viajan solo
 * si alguno tiene valor: sin ninguno el cuerpo es el de siempre.
 */
export function cuerpoInvitacion(b: BorradorInvitacion, tipo: TipoIdentificacionDto | undefined, permitidos: readonly AtributoPermitidoDto[] = []): InvitarTerceroDto {
  const atributos = cuerpoDeAtributos(permitidos, b.atributos);
  return {
    pais: b.pais,
    tipoIdentificacion: b.tipoIdentificacion,
    numeroIdentificacion: b.numero.trim(),
    // El dígito solo viaja si el tipo lo tiene (el campo no se ve de otro modo).
    digitoVerificacion: tipo?.tieneDv ? aNulo(b.digito) : null,
    // El tipo de persona no se elige: sale del tipo de identificación (y, en el RUC de Panamá y el RNC dominicano, del número). `null` solo si aún no se sabe: la API lo deduce igual.
    tipoPersona: tipoDePersonaDe(tipo, b.numero),
    nombre: b.nombre.trim(),
    nombreComercial: aNulo(b.nombreComercial),
    correo: b.correo.trim(),
    tipoVinculo: b.tipoVinculo,
    flujo: aNulo(b.flujo),
    contacto: aNulo(b.contacto),
    telefono: aNulo(b.telefono),
    ...(Object.keys(atributos).length > 0 ? { atributos } : {}),
  };
}

/** Los campos del formulario a los que apunta un error de la API (los nombres de `ErrorDeFilaDto.campo`). */
export const CAMPO_DE_LA_API: Readonly<Record<string, CampoInvitacion>> = {
  pais: 'pais',
  tipoIdentificacion: 'tipoIdentificacion',
  numeroIdentificacion: 'numero',
  digitoVerificacion: 'digito',
  // Ya no hay campo de tipo de persona: lo que la API diga de él (el tipo de identificación no aplica a ese tipo de persona) se ve en el tipo de identificación.
  tipoPersona: 'tipoIdentificacion',
  nombre: 'nombre',
  nombreComercial: 'nombreComercial',
  correo: 'correo',
  contacto: 'contacto',
  telefono: 'telefono',
  tipoVinculo: 'tipoVinculo',
  flujo: 'flujo',
};

/** El prefijo con el que la API nombra el campo de un error de atributo: `atributos.nivelRiesgo` (`AtributosDeLote.PrefijoDeCampo`). */
const PREFIJO_DE_ATRIBUTO = 'atributos.';

/** Los errores por atributo de una respuesta 422 de la API (`clave` → mensaje): los de los campos `atributos.{clave}`. */
export function erroresDeAtributosDeLaApi(errores: Readonly<Record<string, readonly string[]>>): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const [campo, mensajes] of Object.entries(errores)) {
    const primero = mensajes[0];
    const clave = campo.startsWith(PREFIJO_DE_ATRIBUTO) ? campo.slice(PREFIJO_DE_ATRIBUTO.length) : '';
    if (clave && primero) resultado[clave] = primero;
  }
  return resultado;
}

/** Los errores por campo de una respuesta 422 de la API, ya en los campos del formulario. */
export function erroresDeLaApi(errores: Readonly<Record<string, readonly string[]>>): Partial<Record<CampoInvitacion, string>> {
  const resultado: Partial<Record<CampoInvitacion, string>> = {};
  for (const [campo, mensajes] of Object.entries(errores)) {
    const propio = CAMPO_DE_LA_API[campo];
    const primero = mensajes[0];
    if (propio && primero) resultado[propio] = primero;
  }
  return resultado;
}
