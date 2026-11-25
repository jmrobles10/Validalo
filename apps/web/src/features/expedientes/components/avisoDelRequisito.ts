import type { RequisitoExpedienteDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { estadoRevision } from '../../documentos/revisionIa';
import type { DocumentoEnVisor } from '../../documentos/VisorDocumento';
import { estadoVigencia, severidadAviso, textoAvisoVigencia } from '../../documentos/vigencia';

export interface Aviso {
  severidad: 'error' | 'warning' | 'info';
  texto: string;
}

/** El archivo del requisito (no un formulario) llegó a la empresa sin la lectura automática: hay que revisarlo a mano. */
export function archivoSinLeer(visor: DocumentoEnVisor | null): boolean {
  return visor !== null && !visor.sinArchivo && estadoRevision(visor.hechos) === 'sinAnalisis';
}

/**
 * El cruce con lo que el documento respalda no tiene con qué compararse (`soporteDeSecciones.sinAnalisis`): p. ej. la certificación
 * respalda las cuentas y el tercero no ha designado ninguna. No dice que el archivo no se leyó (eso es `archivoSinLeer`): si no se
 * leyó, ese aviso ya lo explica y esta nota sobra.
 */
export function soporteSinCruce(requisito: RequisitoExpedienteDto, visor: DocumentoEnVisor | null): boolean {
  return requisito.soporteDeSecciones?.sinAnalisis === true && !archivoSinLeer(visor);
}

/**
 * El aviso más importante del requisito (la tarjeta muestra uno solo): retiro, discrepancia crítica, antigüedad máxima del tipo excedida o sin una fecha de
 * expedición verificable (TD-10: un hallazgo crítico), vencimiento o archivo sin lectura automática. El cruce sin con qué compararse no es un aviso: va en el pie de la tarjeta, en texto secundario.
 */
export function avisoDelRequisito(requisito: RequisitoExpedienteDto, visor: DocumentoEnVisor | null, t: TFunction): Aviso | null {
  const version = requisito.versionActual;
  if (requisito.retiro && version) {
    return { severidad: 'warning', texto: t('expedientes.requisitos.retiro', { retirada: String(requisito.retiro.numero), motivo: requisito.retiro.motivo, n: String(version.n) }) };
  }
  if (requisito.soporteDeSecciones?.discrepanciaCritica) return { severidad: 'error', texto: t('cruce.discrepanciaCritica') };
  if (version?.antiguedad?.critico) return { severidad: 'error', texto: t('expedientes.requisitos.antiguedadCritica', { detalle: version.antiguedad.detalle }) };
  const vigencia = visor?.vigencia;
  const estado = vigencia ? estadoVigencia(vigencia) : null;
  if (vigencia && (estado === 'EnGracia' || estado === 'Vencida')) {
    const texto = textoAvisoVigencia(vigencia, t);
    if (texto) return { severidad: severidadAviso(vigencia), texto };
  }
  return archivoSinLeer(visor) ? { severidad: 'info', texto: t('vinculos.ficha.sinLectura') } : null;
}
