import type { CampoCruzadoDto, CruceDeSeccionDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';

/**
 * El cruce de un documento con lo declarado, resumido por lo que importa: los campos críticos (el número, el titular, su identificación…).
 * Una sola regla para todo lo que muestra «el resultado del cruce» (la tarjeta de la cuenta, el chip de lo que respalda un documento): Discrepa si algún crítico
 * difiere; NoVerificable si alguno no se pudo verificar; Coincide solo si todos los críticos coinciden. Que un campo que no es crítico difiera no cambia el
 * resultado, pero se dice aparte. Un documento que no se lee con seguridad no verifica nada (NoSeLee).
 */
export type ResultadoDelResumen = 'Coincide' | 'Discrepa' | 'NoVerificable' | 'NoSeLee';

/** Tono del resumen: error si un crítico difiere, advertencia si algo crítico quedó sin verificar o no se lee, éxito si todo lo crítico coincide. */
export type TonoDelResumen = 'exito' | 'advertencia' | 'error';

/** Un campo del cruce por su código (`numero`, `identificacion_titular`…) y su etiqueta completa. */
export type CampoResumido = Pick<CampoCruzadoDto, 'campo' | 'etiqueta'>;

export interface ResumenDeCruce {
  resultado: ResultadoDelResumen;
  /** Los campos críticos según su resultado. */
  criticosQueCoinciden: CampoResumido[];
  criticosQueDifieren: CampoResumido[];
  criticosSinVerificar: CampoResumido[];
  /** Los campos que no son críticos y difieren (evidencia, no cambian el resultado). */
  otrosQueDifieren: CampoResumido[];
}

export function resumirCruce(cruce: Pick<CruceDeSeccionDto, 'campos' | 'legible'>): ResumenDeCruce {
  const resumen: ResumenDeCruce = { resultado: 'Coincide', criticosQueCoinciden: [], criticosQueDifieren: [], criticosSinVerificar: [], otrosQueDifieren: [] };
  for (const { campo, etiqueta, resultado, critico } of cruce.campos) {
    const resumido = { campo, etiqueta };
    if (!critico) {
      if (resultado === 'Discrepa') resumen.otrosQueDifieren.push(resumido);
    } else if (resultado === 'Coincide') {
      resumen.criticosQueCoinciden.push(resumido);
    } else if (resultado === 'Discrepa') {
      resumen.criticosQueDifieren.push(resumido);
    } else {
      resumen.criticosSinVerificar.push(resumido);
    }
  }
  if (!cruce.legible) resumen.resultado = 'NoSeLee';
  else if (resumen.criticosQueDifieren.length > 0) resumen.resultado = 'Discrepa';
  else if (resumen.criticosSinVerificar.length > 0) resumen.resultado = 'NoVerificable';
  return resumen;
}

export function tonoDelResumen(resultado: ResultadoDelResumen): TonoDelResumen {
  if (resultado === 'Discrepa') return 'error';
  return resultado === 'Coincide' ? 'exito' : 'advertencia';
}

/** «Número de la cuenta» → «número de la cuenta»; una sigla («NIT») se deja como está. */
const enMinuscula = (etiqueta: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(etiqueta) ? etiqueta.charAt(0).toLocaleLowerCase('es-CO') + etiqueta.slice(1) : etiqueta);

/**
 * La lista de campos con sus nombres cortos («número, titular e identificación»): `cruce.criticos.cortos` tiene el de los campos que conoce (los de la cuenta); otro
 * campo va con su etiqueta en minúscula.
 */
function lista(campos: readonly CampoResumido[], t: TFunction): string {
  const cortos: Readonly<Record<string, string>> = t('cruce.criticos.cortos', { returnObjects: true });
  return new Intl.ListFormat('es-CO', { style: 'long', type: 'conjunction' }).format(campos.map((c) => cortos[c.campo] ?? enMinuscula(c.etiqueta)));
}

/**
 * El resumen en una frase corta, con los nombres cortos de los campos: «Coincide: número y titular · Sin verificar: identificación», «No coincide: número», «No se lee con
 * seguridad: nada se pudo verificar». Si algún crítico difiere no se enumeran los que coinciden: la comparación completa está a un clic.
 */
export function textoDelResumen(resumen: ResumenDeCruce, t: TFunction): string {
  if (resumen.resultado === 'NoSeLee') return t('cruce.criticos.noSeLee');
  const partes: string[] = [];
  if (resumen.criticosQueDifieren.length > 0) partes.push(t('cruce.criticos.difiere', { campos: lista(resumen.criticosQueDifieren, t) }));
  else if (resumen.criticosQueCoinciden.length > 0) partes.push(t('cruce.criticos.coincide', { campos: lista(resumen.criticosQueCoinciden, t) }));
  if (resumen.criticosSinVerificar.length > 0) partes.push(t('cruce.criticos.falta', { campos: lista(resumen.criticosSinVerificar, t) }));
  if (resumen.otrosQueDifieren.length > 0) partes.push(t('cruce.criticos.tambienDifiere', { campos: lista(resumen.otrosQueDifieren, t) }));
  return partes.length > 0 ? partes.join(' · ') : t('cruce.criticos.sinDiferencias');
}
