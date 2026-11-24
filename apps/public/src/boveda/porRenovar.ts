import type { DocumentoBovedaDto, VigenciaDto } from '@validalo/api-client';
import type { TFunction } from 'i18next';
import { formatearDiaCivil } from '@validalo/ui';
import { estadoDeVigencia, requiereAtencion, type EstadoVigencia } from '../vigencia/vigencia';
import type { SolicitudDeSubida } from './solicitudDeSubida';
import { sePuedeSubirVersion, solicitudDeNuevaVersion } from './versiones';

/** Cuántas líneas muestra el bloque «Por renovar» antes de pedir «Ver N más». */
export const MAXIMO_LINEAS_AVISO = 4;

/**
 * Hasta cuántas empresas se nombran en la frase de una línea («vence para A el …, para B el … y para C el …»). Con más, la línea se
 * resume y el detalle por empresa va en «Ver empresas».
 */
export const MAXIMO_EMPRESAS_EN_FRASE = 3;

/** Lo que vence de un documento con una empresa (cada una calcula su propia vigencia, TD-6). */
interface VencimientoConEmpresa {
  empresa: string;
  estado: Exclude<EstadoVigencia, 'SinVencimiento'>;
  vigencia: VigenciaDto;
}

/** Lo que pasa con una empresa en el detalle de una línea resumida: su estado y su fecha («Vence el 30/11/2026»). */
export interface DetalleDeVencimiento {
  empresa: string;
  estado: EstadoVigencia;
  texto: string;
}

/** Una línea del bloque «Por renovar» (AvisoConsolidado de docs/06): un documento y qué hacer con él. */
export interface LineaPorRenovar {
  documentoId: string;
  documento: string;
  /** Qué pasa con cada empresa y antes de cuándo renovarlo, sin el nombre del documento. */
  texto: string;
  /** Con más empresas de las que caben en una frase, la línea se resume y esto es lo que pasa con cada una («Ver empresas»); si no, `null`. */
  empresas: DetalleDeVencimiento[] | null;
  /** Con la línea resumida, antes de cuándo renovar para quedar al día con todas (va en el detalle); si no, `null`. */
  cierre: string | null;
  /** La vigencia más urgente entre las empresas, para el chip. */
  vigencia: VigenciaDto;
  /** Lo que se le pide al diálogo para subir la versión nueva; `null` si se actualiza desde la revisión (formularios). */
  subir: SolicitudDeSubida | null;
  /** `aaaa-mm-dd` más próxima entre las empresas; ordena las líneas. */
  fecha: string | null;
}

const URGENCIA: Readonly<Record<VencimientoConEmpresa['estado'], number>> = { Vencida: 0, EnGracia: 1, PorVencer: 2, Vigente: 3 };

/** `aaaa-mm-dd` sin hora → «31/10», para el plazo («Renueva antes del 31/10»): el año ya va en la fecha de cada empresa. */
function diaYMes(valor: string): string {
  return formatearDiaCivil(valor).slice(0, 5);
}

/** Las fechas `aaaa-mm-dd` se ordenan como texto; sin fecha va al final. */
function compararFechas(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}

/**
 * Las empresas que reciben este documento y le calcularon una fecha. Las vigentes también cuentan: renovarlo antes las
 * deja al día a todas. Las que no lo reciben, las que no lo hacen vencer y un estado que la API agregue después, no.
 */
function vencimientos(documento: DocumentoBovedaDto): VencimientoConEmpresa[] {
  const lista: VencimientoConEmpresa[] = [];
  for (const c of documento.porEmpresa) {
    if (!c.compartido || c.version === null || !c.vigencia) continue;
    const estado = estadoDeVigencia(c.vigencia);
    if (!estado || estado === 'SinVencimiento' || (estado === 'Vigente' && !c.vigencia.vigenteHasta)) continue;
    lista.push({ empresa: c.empresa.nombre, estado, vigencia: c.vigencia });
  }
  return lista.sort(
    (a, b) => compararFechas(a.vigencia.vigenteHasta, b.vigencia.vigenteHasta) || URGENCIA[a.estado] - URGENCIA[b.estado] || a.empresa.localeCompare(b.empresa, 'es'),
  );
}

type FraseEmpresa = 'vencePara' | 'venceProntoPara' | 'vencioPara' | 'vencidoPara' | 'enGracia';

/** Cuando dos empresas seguidas llevan la misma frase, la segunda no repite el verbo: «vence para A el … y para B el …». */
const CONTINUACION: Readonly<Record<FraseEmpresa, 'paraEl' | 'para' | 'conHasta'>> = {
  vencePara: 'paraEl',
  vencioPara: 'paraEl',
  venceProntoPara: 'para',
  vencidoPara: 'para',
  enGracia: 'conHasta',
};

/** «vence para Constructora Norte el 31/10/2026», «está en el periodo de gracia con … hasta el …», «venció para …». */
function fraseEmpresa({ estado, vigencia }: VencimientoConEmpresa): { frase: FraseEmpresa; fecha: string | null } {
  const { vigenteHasta, finDeGracia } = vigencia;
  if (estado === 'EnGracia' && finDeGracia) return { frase: 'enGracia', fecha: finDeGracia };
  if (estado === 'EnGracia' || estado === 'Vencida') return vigenteHasta ? { frase: 'vencioPara', fecha: vigenteHasta } : { frase: 'vencidoPara', fecha: null };
  return vigenteHasta ? { frase: 'vencePara', fecha: vigenteHasta } : { frase: 'venceProntoPara', fecha: null };
}

function textosEmpresas(lista: readonly VencimientoConEmpresa[], t: TFunction): string[] {
  let anterior: FraseEmpresa | null = null;
  return lista.map((v) => {
    const { frase, fecha } = fraseEmpresa(v);
    const clave = frase === anterior ? CONTINUACION[frase] : frase;
    anterior = frase;
    return t(`boveda.porRenovar.${clave}`, { empresa: v.empresa, fecha: fecha ? formatearDiaCivil(fecha) : '' });
  });
}

/**
 * Con dos o más empresas, antes de cuándo renovarlo para quedar al día con todas: la fecha más próxima en que deja de
 * servirle a alguna (su vencimiento, o el fin de la gracia si ya venció). Si para alguna ya venció del todo, o no hay
 * fecha, «cuanto antes».
 */
function cierre(lista: readonly VencimientoConEmpresa[], t: TFunction): string | null {
  if (lista.length < 2) return null;
  const clave = lista.length === 2 ? 'dos' : lista.length === 3 ? 'tres' : 'todas';
  const empresas = t(`boveda.porRenovar.conLas.${clave}`);
  let plazo: string | null = null;
  for (const v of lista) {
    const limite = v.estado === 'Vencida' ? null : v.estado === 'EnGracia' ? v.vigencia.finDeGracia : v.vigencia.vigenteHasta;
    if (limite === null) return t('boveda.porRenovar.renuevaYa', { empresas });
    if (plazo === null || limite < plazo) plazo = limite;
  }
  return plazo === null ? t('boveda.porRenovar.renuevaYa', { empresas }) : t('boveda.porRenovar.renuevaAntes', { fecha: diaYMes(plazo), empresas });
}

/** «Vence el 30/11/2026», «En periodo de gracia hasta el 16/11/2026», «Venció el 01/11/2026»: lo que pasa con una empresa, para su lugar en el detalle. */
function textoDeVencimiento({ estado, vigencia }: VencimientoConEmpresa, t: TFunction): string {
  const { vigenteHasta, finDeGracia } = vigencia;
  if (estado === 'EnGracia' && finDeGracia) return t('boveda.porRenovar.detalle.enGracia', { fecha: formatearDiaCivil(finDeGracia) });
  if (estado === 'EnGracia' || estado === 'Vencida') return vigenteHasta ? t('vigencia.vencioEl', { fecha: formatearDiaCivil(vigenteHasta) }) : t('boveda.porRenovar.detalle.vencido');
  return vigenteHasta ? t('vigencia.venceEl', { fecha: formatearDiaCivil(vigenteHasta) }) : t('boveda.porRenovar.detalle.vencePronto');
}

/**
 * La frase de una línea con muchas empresas: la fecha más próxima, para cuántas empresas pide renovarlo y cuál es la primera («vence el
 * 30/11/2026 para 24 empresas (la primera, Constructora Norte)»). Cuenta solo las que piden atención; las demás (aún vigentes) quedan en
 * el detalle. Si entre ellas hay vencidas y por vencer, no dice «vence» ni «venció» para todas.
 */
function textoResumido(lista: readonly VencimientoConEmpresa[], t: TFunction): string {
  const atencion = lista.filter((v) => requiereAtencion(v.vigencia));
  const primera = atencion[0] ?? lista[0];
  if (!primera) return '';
  const fecha = primera.vigencia.vigenteHasta;
  const yaVencidas = atencion.filter((v) => v.estado === 'EnGracia' || v.estado === 'Vencida').length;
  const clase = !fecha ? 'sinFecha' : yaVencidas === 0 ? 'vence' : yaVencidas === atencion.length ? 'vencio' : 'mezcla';
  return t(`boveda.porRenovar.resumido.${clase}`, { count: atencion.length, empresa: primera.empresa, fecha: fecha ? formatearDiaCivil(fecha) : '' });
}

/** Une «a», «a y b», «a, b y c» como se dice en español. */
function enumerar(partes: readonly string[]): string {
  return new Intl.ListFormat('es-CO', { style: 'long', type: 'conjunction' }).format(partes);
}

/**
 * El aviso consolidado de la bóveda (docs/02 §8.3): una línea por documento que vence pronto, está en gracia o venció
 * para alguna empresa, con lo que pasa con cada una y antes de cuándo renovarlo. Primero lo que vence antes. Con más de
 * {@link MAXIMO_EMPRESAS_EN_FRASE} empresas la línea se resume (fecha más próxima, cuántas y la primera) y el detalle por empresa va aparte.
 */
export function lineasPorRenovar(documentos: readonly DocumentoBovedaDto[], t: TFunction): LineaPorRenovar[] {
  const lineas: LineaPorRenovar[] = [];
  for (const documento of documentos) {
    const lista = vencimientos(documento);
    if (!lista.some((v) => requiereAtencion(v.vigencia))) continue;
    const masUrgente = lista.reduce((a, b) => (URGENCIA[b.estado] < URGENCIA[a.estado] ? b : a));
    const final = cierre(lista, t);
    const enFrase = lista.length <= MAXIMO_EMPRESAS_EN_FRASE;
    const nombradas = `${enumerar(textosEmpresas(lista, t))}.`;
    lineas.push({
      documentoId: documento.id,
      documento: documento.tipo.nombre,
      texto: !enFrase ? textoResumido(lista, t) : final ? `${nombradas} ${final}` : nombradas,
      empresas: enFrase ? null : lista.map((v) => ({ empresa: v.empresa, estado: v.estado, texto: textoDeVencimiento(v, t) })),
      cierre: enFrase ? null : final,
      vigencia: masUrgente.vigencia,
      subir: sePuedeSubirVersion(documento) ? solicitudDeNuevaVersion(documento) : null,
      fecha: lista[0]?.vigencia.vigenteHasta ?? null,
    });
  }
  return lineas.sort((a, b) => compararFechas(a.fecha, b.fecha) || a.documento.localeCompare(b.documento, 'es'));
}
