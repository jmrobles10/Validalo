import type { TipoDocumentoTenantDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { megas, nombreDeFormato, plazoParaEditar } from './modelo';

/** Lista en español: «PDF», «PDF o JPG», «PDF, JPG o PNG». */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} o ${partes.at(-1) ?? ''}`;
}

/** Reglas de archivo efectivas en corto: «PDF · hasta 5 MB · 10 págs.». Vacío si el tipo no recibe archivo. */
export function resumenArchivo(tipo: Pick<TipoDocumentoTenantDto, 'modo' | 'reglasEfectivas'>, t: TFunction): string {
  const reglas = tipo.reglasEfectivas;
  if (tipo.modo === 'Formulario' || !reglas) return '';
  const formatos = enumerar(reglas.formatos.map(nombreDeFormato));
  return t('tiposDocumento.resumen.archivo', { formatos, peso: megas(reglas.tamanoMaximoBytes), paginas: String(reglas.paginasMaximas) });
}

/** Cómo se entrega y qué trae: «PDF · hasta 5 MB · 50 págs. · con plantilla» o «Formulario (4 campos)». */
export function resumenTipo(tipo: Pick<TipoDocumentoTenantDto, 'modo' | 'reglasEfectivas' | 'campos' | 'plantilla'>, t: TFunction): string {
  const partes: string[] = [];
  const archivo = resumenArchivo(tipo, t);
  if (archivo) partes.push(archivo);
  const campos = tipo.campos?.length ?? 0;
  if (tipo.modo === 'Formulario' || tipo.modo === 'ArchivoYFormulario') partes.push(t('tiposDocumento.resumen.formulario', { count: campos }));
  if (tipo.plantilla) partes.push(t('tiposDocumento.resumen.conPlantilla'));
  return partes.join(' · ');
}

/** Un plazo en días, como se dice: «1 año» (365), «6 meses» (183), «30 días». */
export function plazoEnPalabras(dias: number, t: TFunction): string {
  if (dias >= 365 && dias % 365 === 0) return t('tiposDocumento.vigencia.plazo.anios', { count: dias / 365 });
  const { valor, unidad } = plazoParaEditar(dias);
  return unidad === 'meses' ? t('tiposDocumento.vigencia.plazo.meses', { count: Number(valor) }) : t('tiposDocumento.vigencia.plazo.dias', { count: dias });
}

/**
 * Las dos reglas de frescura en palabras (TD-10): «Expedido hace menos de 30 días · Se revalida cada 1 año desde que lo apruebas». Cada una es opcional;
 * sin ninguna (ni periodo), «No vence».
 */
export function resumenVigencia(tipo: Pick<TipoDocumentoTenantDto, 'reglaFrescura' | 'antiguedadMaximaDias' | 'revalidarCadaDias'>, t: TFunction): string {
  const partes: string[] = [];
  if (tipo.antiguedadMaximaDias) partes.push(t('tiposDocumento.vigencia.resumen.antiguedad', { count: tipo.antiguedadMaximaDias }));
  if (tipo.revalidarCadaDias) partes.push(t('tiposDocumento.vigencia.resumen.revalidar', { plazo: plazoEnPalabras(tipo.revalidarCadaDias, t) }));
  if (tipo.reglaFrescura.tipo === 'PeriodoMinimo') partes.push(t('tiposDocumento.vigencia.resumen.periodo', { periodo: tipo.reglaFrescura.regla ?? '—' }));
  return partes.length > 0 ? partes.join(' · ') : t('tiposDocumento.vigencia.resumen.ninguna');
}
