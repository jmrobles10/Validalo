import type { TipoDocumentoTenantDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { ROLES_DE_PERSONA, type RequisitoEnEditor } from './editor';
import { unirEnFrase } from './fraseDeCondicion';
import { seccionesQueRespalda } from './requisitosDeSeccion';

/**
 * El resumen de un requisito en su fila cerrada: una línea con lo de siempre («Obligatorio · Se pide a todos · Lo revisan todas las áreas»),
 * unas etiquetas con lo que se sale de lo común (soporte de secciones, documento de una persona). La condición de «Se pide a» se dice aparte, en
 * `fraseDeCondicion`. No cambia nada del requisito: solo lo cuenta.
 */

/** Los nombres de las áreas en una frase: hasta tres completos («Compras, Jurídica y Tesorería»); si son más, las dos primeras y cuántas faltan. */
function areasEnFrase(nombres: readonly string[], t: TFunction): string {
  return nombres.length <= 3 ? unirEnFrase(nombres, 'y', t) : t('flujoRequisitos.fila.yOtras', { primeras: nombres.slice(0, 2).join(', '), count: nombres.length - 2 });
}

export interface EtiquetaDelRequisito {
  clave: 'soporte' | 'persona' | 'exigeSoporte';
  texto: string;
}

export interface ResumenDelRequisito {
  /** «Obligatorio · Se pide a todos · Lo revisan todas las áreas» (a quién se pide solo si no hay condición: esa va aparte). */
  linea: string;
  etiquetas: EtiquetaDelRequisito[];
}

const esRolDePersona = (rol: string): rol is (typeof ROLES_DE_PERSONA)[number] => (ROLES_DE_PERSONA as readonly string[]).includes(rol);

export function resumenDelRequisito(
  requisito: RequisitoEnEditor,
  { t, tipo, nombreArea }: { t: TFunction; tipo: Pick<TipoDocumentoTenantDto, 'tipoCanonico'> | undefined; nombreArea: (id: string) => string },
): ResumenDelRequisito {
  const revisan = requisito.areasQueRevisan.map(nombreArea);
  const linea = [
    requisito.obligatorio ? t('flujoRequisitos.fila.obligatorio') : t('flujoRequisitos.fila.opcional'),
    ...(requisito.condicion === null ? [t('flujoRequisitos.fila.sePideATodos')] : []),
    revisan.length === 0 ? t('flujoRequisitos.fila.revisanTodas') : t(revisan.length === 1 ? 'flujoRequisitos.fila.revisa' : 'flujoRequisitos.fila.revisan', { areas: areasEnFrase(revisan, t) }),
  ].join(' · ');

  const etiquetas: EtiquetaDelRequisito[] = [];
  if (requisito.seccion === null && requisito.dePersonaRelacionada !== null) {
    const rol = requisito.dePersonaRelacionada;
    const texto = esRolDePersona(rol) ? t(`flujoRequisitos.fila.deLaPersona.${rol}`) : rol;
    etiquetas.push({ clave: 'persona', texto: requisito.todasLasRelaciones ? t('flujoRequisitos.fila.todasLasPersonas', { texto }) : texto });
  }
  if (requisito.seccion === null && requisito.dePersonaRelacionada === null && requisito.usarComoSoporte !== false && seccionesQueRespalda(tipo?.tipoCanonico).length > 0) {
    etiquetas.push({ clave: 'soporte', texto: t('flujoRequisitos.fila.soporteDeSecciones') });
  }
  if (requisito.seccion !== null && requisito.exigeSoporte) etiquetas.push({ clave: 'exigeSoporte', texto: t('flujoRequisitos.fila.exigeSoporte') });
  return { linea, etiquetas };
}
