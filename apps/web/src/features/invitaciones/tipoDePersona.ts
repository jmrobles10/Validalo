import type { TipoIdentificacionDto } from '@validalo/api-client';
import { numeroNormalizado, numeroValido } from '../configuracion/empresas/modelo';

/**
 * El tipo de persona de un tercero que se invita, derivado de su tipo de identificación (decisión IM: el tipo de persona no se elige, va restringido por el documento).
 * `Consorcio` ya no se ofrece en el formulario: un consorcio se invita por lote (columna «Tipo de persona») o por la API.
 */
export type TipoDePersona = 'Natural' | 'Juridica';

/**
 * Los tipos que aplican a ambas personas y cuyo **número** dice cuál es (`país:tipo` → ¿el número es de una sociedad?). Es `CatalogoIdentificacion.EsDeSociedad` del
 * dominio, la misma regla de `esSociedad` en la ficha del tercero: en Panamá el RUC de una persona natural es su cédula («8-123-456») y el de una sociedad un RUC largo de folio,
 * tomo, asiento y año (12 dígitos o más); en República Dominicana el RNC de 9 dígitos es de una sociedad y el de 11 es la cédula de una persona física. El número va sin
 * puntos, espacios ni guiones.
 */
const SOCIEDAD_SEGUN_EL_NUMERO: Readonly<Record<string, (numero: string) => boolean>> = {
  'PA:RUC': (numero) => /^[0-9]{12,}$/.test(numero),
  'DO:RNC': (numero) => numero.length === 9,
};

/**
 * El tipo de persona que corresponde a un tipo de identificación y su número. Es la regla de `ValidacionDeLote.TipoPersonaDe` (la que aplica la API cuando no llega el tipo de
 * persona): Natural si el tipo solo es de personas naturales (cédula, pasaporte, CIP…) y Jurídica en los demás (NIT, RUT, CUIT, RFC, RUC, ID fiscal…), afinada con
 * `EsDeSociedad` donde el número lo decide (RUC de Panamá y RNC de República Dominicana). `null` si aún no se sabe: sin tipo de identificación o, en esos dos tipos, mientras el
 * número no tenga un formato válido.
 */
export function tipoDePersonaDe(tipo: TipoIdentificacionDto | undefined, numero: string): TipoDePersona | null {
  if (!tipo) return null;
  if (tipo.aplicaA === 'Natural') return 'Natural';
  const esSociedad = tipo.aplicaA === 'Ambas' ? SOCIEDAD_SEGUN_EL_NUMERO[`${tipo.pais}:${tipo.codigo}`] : undefined;
  if (!esSociedad) return 'Juridica';
  if (!numero.trim() || !numeroValido(numero, tipo)) return null;
  return esSociedad(numeroNormalizado(numero, tipo)) ? 'Juridica' : 'Natural';
}

/** ¿El número decide el tipo de persona de este tipo de identificación? (para decir «según el número» mientras aún no se puede saber). */
export function decideElNumero(tipo: TipoIdentificacionDto | undefined): boolean {
  return tipo?.aplicaA === 'Ambas' && `${tipo.pais}:${tipo.codigo}` in SOCIEDAD_SEGUN_EL_NUMERO;
}
