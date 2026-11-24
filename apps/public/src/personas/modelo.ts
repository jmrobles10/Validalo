import type { DeclararRelacionDto, DocumentoDePersonaDto, RelacionEntreTercerosDto } from '@validalo/api-client';
import type { SolicitudDeSubida } from '../boveda/solicitudDeSubida';

/** Cómo se relaciona una persona con el tercero (ADR-0010), en el orden en que se muestran. */
export const ROLES = ['RepresentanteLegal', 'Suplente', 'Socio', 'BeneficiarioFinal', 'MiembroDe'] as const;
export type RolDePersona = (typeof ROLES)[number];

export function esRol(valor: string): valor is RolDePersona {
  return (ROLES as readonly string[]).includes(valor);
}

/**
 * Los roles que la ficha legal maneja: es el único lugar donde se registran (decisión de Producto del 2026-11-24). «Personas» solo los muestra, con
 * sus documentos y lo que la IA detecta; el beneficiario final y el miembro de consorcio no tienen fila en la ficha y se declaran en Personas.
 */
export const ROLES_DE_LA_FICHA: readonly RolDePersona[] = ['RepresentanteLegal', 'Suplente', 'Socio'];

export const seRegistraEnLaFicha = (rol: string): boolean => ROLES_DE_LA_FICHA.some((r) => r === rol);

/** Tipos de documento con los que se declara una persona natural (el país de los colombianos es CO; el pasaporte genérico lleva el suyo). */
export const TIPOS_DE_DOCUMENTO = ['CC', 'CE', 'PA', 'PASAPORTE', 'TI', 'PPT'] as const;
export type TipoDeDocumento = (typeof TIPOS_DE_DOCUMENTO)[number];

/** Lo vigente (confirmado) y lo que la IA propuso y el tercero aún no decide; lo terminado o descartado no se muestra. */
export const esPropuesta = (r: Pick<RelacionEntreTercerosDto, 'estado'>) => r.estado === 'Propuesta';
export const esVigente = (r: Pick<RelacionEntreTercerosDto, 'estado'>) => r.estado === 'Confirmada';

export const propuestasDe = (relaciones: readonly RelacionEntreTercerosDto[]) => relaciones.filter(esPropuesta);

/** Las vigentes agrupadas por rol, en el orden de `ROLES`, con la principal primero. */
export function vigentesPorRol(relaciones: readonly RelacionEntreTercerosDto[]): { rol: RolDePersona; personas: RelacionEntreTercerosDto[] }[] {
  const vigentes = relaciones.filter(esVigente);
  return ROLES.map((rol) => ({
    rol,
    personas: vigentes.filter((r) => r.tipo === rol).sort((a, b) => Number(b.principal) - Number(a.principal) || a.nombre.localeCompare(b.nombre, 'es')),
  })).filter((g) => g.personas.length > 0);
}

/** Un documento de la persona que ya está cargado en su bóveda (con su versión y su estado). */
export const estaCargado = (d: Pick<DocumentoDePersonaDto, 'documentoId' | 'version' | 'estado'>) => d.documentoId !== null && d.version !== null && d.estado !== null;

/** Una persona relacionada con lo que ya tiene cargado en su bóveda, para mostrarla en «Mi bóveda» (ADR-0010: su cédula no está en la del tercero). */
export interface PersonaConDocumentos {
  personaId: string;
  nombre: string;
  /** Sus roles vigentes con el tercero, en el orden de `ROLES` (una misma persona puede ser representante y socia). */
  roles: string[];
  documentos: DocumentoDePersonaDto[];
}

/**
 * Las personas con relación vigente que ya tienen algo cargado en su bóveda, una vez cada una aunque tenga varios roles (los documentos son de la
 * persona, no de la relación). Las que no tienen nada cargado no salen: «Mi bóveda» solo muestra lo que hay. Ordenadas por su primer rol y por nombre.
 */
export function personasConDocumentosCargados(relaciones: readonly RelacionEntreTercerosDto[]): PersonaConDocumentos[] {
  const posicion = (rol: string) => {
    const i = ROLES.findIndex((r) => r === rol);
    return i < 0 ? ROLES.length : i;
  };
  const porPersona = new Map<string, PersonaConDocumentos>();
  for (const relacion of relaciones.filter(esVigente)) {
    const documentos = relacion.documentos.filter(estaCargado);
    if (documentos.length === 0) continue;
    const existente = porPersona.get(relacion.personaId);
    if (existente) {
      if (!existente.roles.includes(relacion.tipo)) existente.roles.push(relacion.tipo);
    } else {
      porPersona.set(relacion.personaId, { personaId: relacion.personaId, nombre: relacion.nombre, roles: [relacion.tipo], documentos });
    }
  }
  const personas = [...porPersona.values()];
  for (const persona of personas) persona.roles.sort((a, b) => posicion(a) - posicion(b));
  return personas.sort((a, b) => posicion(a.roles[0] ?? '') - posicion(b.roles[0] ?? '') || a.nombre.localeCompare(b.nombre, 'es'));
}

/** Un documento que una empresa pide de esta persona y todavía no está vigente en su bóveda. */
export const documentoPorSubir = (d: Pick<DocumentoDePersonaDto, 'pedido' | 'estado'>) => d.pedido === true && d.estado !== 'Actual';

/** Cuántos documentos pedidos le faltan a la persona (para ordenar y para el chip de la tarjeta). */
export const documentosPorSubir = (r: Pick<RelacionEntreTercerosDto, 'documentos'>) => r.documentos.filter(documentoPorSubir).length;

/** Las cifras decimales llegan como número o como texto (`AllowReadingFromString`): siempre un número, o nulo. */
export function comoNumero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/** «93» para 0,93: la confianza de la IA como porcentaje entero. */
export function confianzaComoPorcentaje(valor: number | string | null | undefined): number | null {
  const numero = comoNumero(valor);
  return numero === null ? null : Math.round(numero * 100);
}

/** Lo que se le pide al diálogo de subida para el documento de una persona: va a la bóveda de la persona, no a la del tercero. */
export function solicitudDeDocumentoDePersona(personaId: string, tipoCanonico: string, nombreDelDocumento: string): SolicitudDeSubida {
  return { persona: personaId, tipo: tipoCanonico, nombre: nombreDelDocumento };
}

export interface DatosDePersona {
  rol: RolDePersona;
  nombre: string;
  tipoDocumento: TipoDeDocumento;
  numero: string;
  participacion: string;
  cargo: string;
  principal: boolean;
}

export const DATOS_DE_PERSONA_VACIOS: DatosDePersona = {
  rol: 'RepresentanteLegal',
  nombre: '',
  tipoDocumento: 'CC',
  numero: '',
  participacion: '',
  cargo: '',
  principal: false,
};

export type CampoDePersona = 'nombre' | 'numero' | 'participacion';

/** Lo que el formulario revisa antes de enviar (la API vuelve a validar todo: 422 con el campo en `detalle`). */
export function validarPersona(datos: DatosDePersona): Partial<Record<CampoDePersona, true>> {
  const errores: Partial<Record<CampoDePersona, true>> = {};
  if (datos.nombre.trim() === '') errores.nombre = true;
  if (datos.numero.replace(/[\s.-]/g, '') === '') errores.numero = true;
  const participacion = datos.participacion.trim() === '' ? null : Number(datos.participacion.replace(',', '.'));
  if (participacion !== null && (!Number.isFinite(participacion) || participacion < 0 || participacion > 100)) errores.participacion = true;
  return errores;
}

/** El cuerpo de `POST /public/v1/tercero/relaciones`: el país de los documentos colombianos es CO; el pasaporte genérico se declara en CO también (país de la nacionalidad se afina en la ficha). */
export function cuerpoDeDeclaracion(datos: DatosDePersona): DeclararRelacionDto {
  const participacion = datos.participacion.trim() === '' ? null : Number(datos.participacion.replace(',', '.'));
  return {
    identificacion: { pais: 'CO', tipo: datos.tipoDocumento, numero: datos.numero.trim() },
    nombre: datos.nombre.trim(),
    tipo: datos.rol,
    principal: datos.principal,
    ...(participacion === null ? {} : { participacion }),
    ...(datos.cargo.trim() === '' ? {} : { cargo: datos.cargo.trim() }),
  };
}
