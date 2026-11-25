import type { PropuestaDeSeccionDto, RelacionEntreTercerosDto } from '@validalo/api-client';
import { esVigente } from '../../personas/modelo';
import { ROLES, type PersonaRelacionada, type RolPersona } from '../tipos';

export const esRol = (valor: string): valor is RolPersona => ROLES.some((r) => r === valor);

/** «Ana María Gómez» o la razón social de una persona jurídica (NIT: solo `nombres`). */
export const nombrePersona = (p: Pick<PersonaRelacionada, 'nombres' | 'apellidos'>) => [p.nombres, p.apellidos].filter(Boolean).join(' ');

/**
 * ¿El número fiscal es de una sociedad y no de una persona? Un NIT; un RNC de 9 dígitos (el de 11 es la cédula de una persona física) o un RUC
 * de Panamá de 12 dígitos o más (el de una persona natural es su cédula). Es la misma regla que aplica el servidor (RG-4): una sociedad lleva
 * razón social y no apellidos.
 */
export function esSociedad(tipo: string | null | undefined, numero: string | null | undefined): boolean {
  const limpio = (numero ?? '').toUpperCase().replace(/[\s.-]/g, '');
  switch ((tipo ?? '').toUpperCase()) {
    case 'NIT':
      return true;
    case 'RNC':
      return limpio.length === 9;
    case 'RUC':
      return /^[0-9]{12,}$/.test(limpio);
    default:
      return false;
  }
}

/** Parámetro de la ficha legal que abre el diálogo de una persona nueva con ese rol ya elegido. */
export const PARAMETRO_AGREGAR = 'agregar';

/**
 * Adónde lleva «Registrar a la persona» de un requisito sin persona: la ficha legal, que es donde se registran las personas (crea sola la relación),
 * con el diálogo abierto y el rol elegido. Los roles que la ficha no maneja (beneficiario final, miembro de consorcio) se declaran en Personas.
 */
export const enlaceParaRegistrarPersona = (rol: string): string => (esRol(rol) ? `/ficha/legal?${PARAMETRO_AGREGAR}=${rol}` : '/personas');

const normalizar = (numero: string | null | undefined) => (numero ?? '').toUpperCase().replace(/[\s.-]/g, '');

/**
 * Las relaciones vigentes que se registraron en Personas (no las mantiene la ficha) y cuya persona no figura en esta sección: las que se
 * declararon desde un documento pedido antes de que «Registrar a la persona» llevara aquí. Solo los roles que la ficha maneja.
 */
export function relacionesFueraDeLaFicha(
  relaciones: readonly RelacionEntreTercerosDto[],
  personas: readonly PersonaRelacionada[],
  propuestas: readonly PropuestaDeSeccionDto[] = [],
): RelacionEntreTercerosDto[] {
  // Quien ya propone un documento más nuevo (el aviso «Tienes documentos más nuevos…», p. ej. el RUT) no se ofrece otra vez aquí: la misma
  // persona aparecía dos veces, y la del documento trae los datos mejor separados.
  const yaEstan = new Set([...personas.map((p) => normalizar(p.numero)), ...numerosPropuestos(propuestas)].filter(Boolean));
  return relaciones.filter((r) => esVigente(r) && !r.deFicha && esRol(r.tipo) && !yaEstan.has(normalizar(r.identificacion.numero)));
}

/** Los números de identificación de las personas que proponen los documentos de la sección (solo las propuestas con valores). */
function numerosPropuestos(propuestas: readonly PropuestaDeSeccionDto[]): string[] {
  return propuestas.flatMap((p) => {
    const lista: unknown = p.disponible && p.datos && typeof p.datos === 'object' ? (p.datos as Record<string, unknown>).personas : null;
    if (!Array.isArray(lista)) return [];
    return lista.flatMap((persona: unknown) =>
      persona && typeof persona === 'object' && typeof (persona as Record<string, unknown>).numero === 'string' ? [normalizar((persona as Record<string, string>).numero)] : [],
    );
  });
}

/** La persona de la ficha que corresponde a una relación: rol, identificación y nombre (los apellidos los completa el tercero si hace falta). */
export const personaDesdeRelacion = (r: RelacionEntreTercerosDto): PersonaRelacionada => ({
  rol: esRol(r.tipo) ? r.tipo : null,
  tipo_identificacion: r.identificacion.tipo,
  numero: r.identificacion.numero,
  dv: r.identificacion.digitoVerificacion ?? null,
  nombres: r.nombre,
  cargo: r.cargo,
  porcentaje: r.participacion === null ? null : Number(r.participacion),
});

/** Los roles de la ficha que son una relación con el tercero (ADR-0010): quien los tiene es una persona con bóveda propia y documentos propios. */
export const ROLES_CON_BOVEDA: readonly RolPersona[] = ['RepresentanteLegal', 'Suplente', 'Socio'];

/** El documento de la bóveda de la persona que prueba su identidad: el pasaporte para quien se identifica con uno; la cédula (de ciudadanía o de extranjería) para el resto. */
export const tipoCanonicoDeIdentidad = (tipoIdentificacion: string | null | undefined): 'CEDULA' | 'PASAPORTE' =>
  ['PA', 'PASAPORTE'].includes((tipoIdentificacion ?? '').trim().toUpperCase()) ? 'PASAPORTE' : 'CEDULA';

/** ¿La relación es de la persona de esa fila de la ficha? Mismo tipo y número de identificación (sin puntos ni guiones). */
export const esRelacionDe = (r: Pick<RelacionEntreTercerosDto, 'identificacion'>, p: Pick<PersonaRelacionada, 'tipo_identificacion' | 'numero'>): boolean =>
  normalizar(p.numero) !== '' && normalizar(r.identificacion.numero) === normalizar(p.numero) && r.identificacion.tipo.toUpperCase() === (p.tipo_identificacion ?? '').trim().toUpperCase();
