import type {
  ActualizarTipoDocumentoDto,
  CampoFormularioDto,
  CrearTipoDocumentoDto,
  TipoDocumentoCanonicoDto,
  TipoDocumentoTenantDto,
} from '@validalo/api-client';

/**
 * Tipos de documento configurables (docs/05 §2.9.4, TD-1…TD-10): reglas de archivo, modo y campos, frescura (antigüedad máxima al subirlo y revalidación) y plantilla.
 * Aquí vive el borrador del formulario y su validación, igual que la API, para avisar antes de guardar; la API decide
 * (422 `formato-mas-laxo`, `limite-mas-laxo`, `limite-sobre-el-global`, `campo-duplicado`, `campo-reservado`…).
 */

/** Formatos que admite la plataforma, por su nombre corto (la API los devuelve como MIME). */
export const FORMATOS = [
  { corto: 'pdf', mime: 'application/pdf', nombre: 'PDF' },
  { corto: 'jpg', mime: 'image/jpeg', nombre: 'JPG' },
  { corto: 'png', mime: 'image/png', nombre: 'PNG' },
  { corto: 'webp', mime: 'image/webp', nombre: 'WebP' },
] as const;
export type FormatoCorto = (typeof FORMATOS)[number]['corto'];

export const MODOS = ['Archivo', 'Formulario', 'ArchivoYFormulario'] as const;
export type Modo = (typeof MODOS)[number];
export const AMBITOS = ['Global', 'PorVinculo'] as const;
export const TIPOS_CAMPO = ['Texto', 'Numero', 'Fecha', 'Lista', 'SiNo'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];
/** Unidad en la que se escribe «Revalidar cada»: se guarda siempre en días (un mes cuenta como 365/12 días, así 12 meses son 365). */
export const UNIDADES_REVALIDACION = ['dias', 'meses'] as const;
export type UnidadRevalidacion = (typeof UNIDADES_REVALIDACION)[number];
export const MAXIMO_DIAS_FRESCURA = 3650;
/** Claves con significado propio: la fecha de expedición se coteja con la antigüedad máxima y el vencimiento propio acota la vigencia. */
export const CLAVES_RESERVADAS = ['fecha_expedicion', 'fecha_vencimiento'] as const;
export const MAXIMO_CAMPOS = 50;

export interface CampoBorrador {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  obligatorio: boolean;
  /** Opciones de una lista, una por línea. */
  opciones: string;
  ayuda: string;
}

export interface BorradorTipo {
  codigo: string;
  nombre: string;
  tipoCanonico: string;
  ambito: string;
  textoAyuda: string;
  activo: boolean;
  formatos: FormatoCorto[];
  tamanoMb: string;
  paginas: string;
  modo: Modo;
  campos: CampoBorrador[];
  /** Antigüedad máxima al subirlo, en días desde la expedición; vacío = no se exige. */
  antiguedad: string;
  /** Revalidar cada…, en la `unidadRevalidar` elegida, desde que la empresa lo aprueba; vacío = no vence por revalidación. */
  revalidar: string;
  unidadRevalidar: UnidadRevalidacion;
  /** Periodo mínimo (regla heredada, aún sin fecha): solo se muestra si el tipo ya lo trae o su canónico lo sugiere. */
  periodo: string;
  diasAviso: string;
  diasGracia: string;
}

export type CodigoError =
  | 'requerido'
  | 'codigo-invalido'
  | 'formulario-solo-por-vinculo'
  | 'limite-invalido'
  | 'campos-requeridos'
  | 'campos-excesivos'
  | 'etiqueta-requerida'
  | 'campo-invalido'
  | 'campo-duplicado'
  | 'campo-reservado'
  | 'opciones-requeridas'
  | 'dias-invalidos'
  | 'antiguedad-invalida'
  | 'revalidacion-invalida';

export type CampoDelBorrador = 'codigo' | 'nombre' | 'tamanoMb' | 'paginas' | 'antiguedad' | 'revalidar' | 'diasAviso' | 'diasGracia' | 'campos' | 'ambito';

export type ErrorBorrador = { campo: CampoDelBorrador; codigo: CodigoError } | { campo: 'campo'; indice: number; codigo: CodigoError };

const esModo = (v: string | undefined): v is Modo => MODOS.some((m) => m === v);
const esTipoCampo = (v: string): v is TipoCampo => TIPOS_CAMPO.some((t) => t === v);

export function formatoCortoDe(mime: string): FormatoCorto | null {
  return FORMATOS.find((f) => f.mime === mime || f.corto === mime)?.corto ?? null;
}

export function nombreDeFormato(mime: string): string {
  return FORMATOS.find((f) => f.mime === mime || f.corto === mime)?.nombre ?? mime;
}

export function borradorNuevo(): BorradorTipo {
  return {
    codigo: '',
    nombre: '',
    tipoCanonico: '',
    ambito: 'PorVinculo',
    textoAyuda: '',
    activo: true,
    formatos: [],
    tamanoMb: '',
    paginas: '',
    modo: 'Archivo',
    campos: [],
    antiguedad: '',
    revalidar: '',
    unidadRevalidar: 'dias',
    periodo: '',
    diasAviso: '30, 15, 5',
    diasGracia: '15',
  };
}

/** Días de un mes: 365/12, redondeado, así «12 meses» son 365 días (un año) y «6 meses», 183. */
export const mesesADias = (meses: number) => Math.round((meses * 365) / 12);

/**
 * Cómo se muestra un plazo en días al abrir el editor: en meses si es exactamente una cantidad entera de meses de dos o más (365 ⇒ 12 meses, 183 ⇒ 6 meses);
 * si no, en días (30 sigue siendo «30 días»).
 */
export function plazoParaEditar(dias: number | null | undefined): { valor: string; unidad: UnidadRevalidacion } {
  if (!dias) return { valor: '', unidad: 'dias' };
  const meses = Math.round((dias * 12) / 365);
  return meses >= 2 && mesesADias(meses) === dias ? { valor: String(meses), unidad: 'meses' } : { valor: String(dias), unidad: 'dias' };
}

export function borradorDe(tipo: TipoDocumentoTenantDto): BorradorTipo {
  const revalidar = plazoParaEditar(tipo.revalidarCadaDias);
  return {
    codigo: tipo.codigo,
    nombre: tipo.nombre,
    tipoCanonico: tipo.tipoCanonico ?? '',
    ambito: tipo.ambito,
    textoAyuda: tipo.textoAyuda ?? '',
    activo: tipo.activo,
    formatos: (tipo.formatosPermitidos ?? []).flatMap((m) => formatoCortoDe(m) ?? []),
    tamanoMb: tipo.tamanoMaximoMb ? String(tipo.tamanoMaximoMb) : '',
    paginas: tipo.paginasMaximas ? String(tipo.paginasMaximas) : '',
    modo: esModo(tipo.modo) ? tipo.modo : 'Archivo',
    campos: (tipo.campos ?? []).map((c) => ({
      clave: c.clave,
      etiqueta: c.etiqueta,
      tipo: esTipoCampo(c.tipo) ? c.tipo : 'Texto',
      obligatorio: c.obligatorio ?? false,
      opciones: (c.opciones ?? []).join('\n'),
      ayuda: c.ayuda ?? '',
    })),
    antiguedad: tipo.antiguedadMaximaDias ? String(tipo.antiguedadMaximaDias) : '',
    revalidar: revalidar.valor,
    unidadRevalidar: revalidar.unidad,
    periodo: tipo.reglaFrescura.tipo === 'PeriodoMinimo' ? (tipo.reglaFrescura.regla ?? '') : '',
    diasAviso: tipo.diasAviso.join(', '),
    diasGracia: String(tipo.diasGracia),
  };
}

export function campoNuevo(): CampoBorrador {
  return { clave: '', etiqueta: '', tipo: 'Texto', obligatorio: false, opciones: '', ayuda: '' };
}

/** «Fecha de expedición» → «fecha_de_expedicion»: la clave sugerida a partir de la etiqueta. */
export function claveDesdeEtiqueta(etiqueta: string): string {
  return etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^(\d)/, 'c_$1')
    .slice(0, 60);
}

const entero = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : null);
/** Antigüedad máxima al subirlo en días; nula si el campo está vacío o no es un número. */
export const diasDeAntiguedad = (b: Pick<BorradorTipo, 'antiguedad'>) => entero(b.antiguedad);
/** «Revalidar cada» en días, con la unidad elegida; nulo si el campo está vacío o no es un número. */
export function diasDeRevalidacion(b: Pick<BorradorTipo, 'revalidar' | 'unidadRevalidar'>): number | null {
  const cantidad = entero(b.revalidar);
  return cantidad === null ? null : b.unidadRevalidar === 'meses' ? mesesADias(cantidad) : cantidad;
}
const lista = (texto: string) => texto.split(/[\s,;]+/).filter(Boolean);
export const opcionesDe = (texto: string) => texto.split('\n').map((o) => o.trim()).filter(Boolean);
export const conCampos = (modo: Modo) => modo !== 'Archivo';

/** Errores del borrador, en el orden del formulario (el primero es el que se anuncia junto al botón de guardar). */
export function validarBorrador(b: BorradorTipo, creando: boolean): ErrorBorrador[] {
  const errores: ErrorBorrador[] = [];
  if (creando && !/^[A-Z][A-Z0-9_]{1,49}$/.test(b.codigo.trim())) errores.push({ campo: 'codigo', codigo: b.codigo.trim() ? 'codigo-invalido' : 'requerido' });
  if (!b.nombre.trim()) errores.push({ campo: 'nombre', codigo: 'requerido' });
  if (conCampos(b.modo) && b.ambito !== 'PorVinculo') errores.push({ campo: 'ambito', codigo: 'formulario-solo-por-vinculo' });
  if (b.tamanoMb.trim() && !(entero(b.tamanoMb) !== null && Number(b.tamanoMb) >= 1 && Number(b.tamanoMb) <= 1024)) errores.push({ campo: 'tamanoMb', codigo: 'limite-invalido' });
  if (b.paginas.trim() && !(entero(b.paginas) !== null && Number(b.paginas) >= 1 && Number(b.paginas) <= 1000)) errores.push({ campo: 'paginas', codigo: 'limite-invalido' });

  if (conCampos(b.modo)) {
    if (b.campos.length === 0) errores.push({ campo: 'campos', codigo: 'campos-requeridos' });
    if (b.campos.length > MAXIMO_CAMPOS) errores.push({ campo: 'campos', codigo: 'campos-excesivos' });
    const vistas = new Set<string>();
    b.campos.forEach((c, indice) => {
      const clave = c.clave.trim();
      if (!c.etiqueta.trim()) errores.push({ campo: 'campo', indice, codigo: 'etiqueta-requerida' });
      if (!/^[a-z][a-z0-9_]{0,59}$/.test(clave)) errores.push({ campo: 'campo', indice, codigo: 'campo-invalido' });
      else if (vistas.has(clave)) errores.push({ campo: 'campo', indice, codigo: 'campo-duplicado' });
      else if (CLAVES_RESERVADAS.some((r) => r === clave) && c.tipo !== 'Fecha') errores.push({ campo: 'campo', indice, codigo: 'campo-reservado' });
      if (c.tipo === 'Lista' && opcionesDe(c.opciones).length === 0) errores.push({ campo: 'campo', indice, codigo: 'opciones-requeridas' });
      vistas.add(clave);
    });
  }

  const antiguedad = diasDeAntiguedad(b);
  if (b.antiguedad.trim() && (antiguedad === null || antiguedad < 1 || antiguedad > MAXIMO_DIAS_FRESCURA)) errores.push({ campo: 'antiguedad', codigo: 'antiguedad-invalida' });
  const revalidar = diasDeRevalidacion(b);
  if (b.revalidar.trim() && (revalidar === null || revalidar < 1 || revalidar > MAXIMO_DIAS_FRESCURA)) errores.push({ campo: 'revalidar', codigo: 'revalidacion-invalida' });
  if (lista(b.diasAviso).some((d) => entero(d) === null || Number(d) < 1 || Number(d) > 365)) errores.push({ campo: 'diasAviso', codigo: 'dias-invalidos' });
  if (b.diasGracia.trim() && !(entero(b.diasGracia) !== null && Number(b.diasGracia) <= 365)) errores.push({ campo: 'diasGracia', codigo: 'dias-invalidos' });
  return errores;
}

function camposDto(b: BorradorTipo): CampoFormularioDto[] {
  return b.campos.map((c) => ({
    clave: c.clave.trim(),
    etiqueta: c.etiqueta.trim(),
    tipo: c.tipo,
    obligatorio: c.obligatorio,
    opciones: c.tipo === 'Lista' ? opcionesDe(c.opciones) : null,
    ayuda: c.ayuda.trim() || null,
  }));
}

function comunes(b: BorradorTipo) {
  return {
    nombre: b.nombre.trim(),
    ambito: b.ambito,
    textoAyuda: b.textoAyuda.trim() || null,
    formatosPermitidos: b.formatos,
    modo: b.modo,
    // La regla heredada solo conserva el periodo; la antigüedad máxima y la revalidación van en sus propios campos (TD-10).
    reglaFrescura: b.periodo.trim() ? { tipo: 'PeriodoMinimo', dias: null, regla: b.periodo.trim() } : { tipo: 'Ninguna', dias: null, regla: null },
    diasAviso: lista(b.diasAviso).map(Number),
    diasGracia: entero(b.diasGracia) ?? 0,
  };
}

export function cuerpoCrear(b: BorradorTipo): CrearTipoDocumentoDto {
  return {
    ...comunes(b),
    codigo: b.codigo.trim(),
    tipoCanonico: b.tipoCanonico || null,
    tamanoMaximoMb: entero(b.tamanoMb),
    paginasMaximas: entero(b.paginas),
    campos: conCampos(b.modo) ? camposDto(b) : null,
    antiguedadMaximaDias: diasDeAntiguedad(b),
    revalidarCadaDias: diasDeRevalidacion(b),
  };
}

/** En un PUT, `0` vuelve al límite global (o quita una regla de frescura) y `[]` quita los campos (solo con modo Archivo). */
export function cuerpoActualizar(b: BorradorTipo): ActualizarTipoDocumentoDto {
  return {
    ...comunes(b),
    activo: b.activo,
    tamanoMaximoMb: entero(b.tamanoMb) ?? 0,
    paginasMaximas: entero(b.paginas) ?? 0,
    campos: conCampos(b.modo) ? camposDto(b) : [],
    antiguedadMaximaDias: diasDeAntiguedad(b) ?? 0,
    revalidarCadaDias: diasDeRevalidacion(b) ?? 0,
  };
}

function nombresDePaises(): (codigo: string) => string {
  try {
    const nombres = new Intl.DisplayNames(['es'], { type: 'region' });
    return (codigo) => nombres.of(codigo) ?? codigo;
  } catch {
    return (codigo) => codigo;
  }
}

const nombrePais = nombresDePaises();

/**
 * «Certificado de RUC (DGI) · Panamá»: el canónico con el país al que pertenece cuando es de uno solo (el RUT y la Cámara son de Colombia; sus
 * equivalentes, de Panamá y República Dominicana, RG-5). Un canónico sin país es de cualquiera y va con su nombre.
 */
export function etiquetaDelCanonico(canonico: Pick<TipoDocumentoCanonicoDto, 'nombre' | 'paises'>): string {
  const paises = (canonico.paises ?? []).map(nombrePais);
  return paises.length > 0 ? `${canonico.nombre} · ${paises.join(', ')}` : canonico.nombre;
}

/** Techo que impone el canónico (los tipos de la plataforma solo admiten reglas más estrictas). */
export function techoDelCanonico(canonico: TipoDocumentoCanonicoDto | undefined) {
  if (!canonico) return null;
  const formatos = (canonico.formatosPermitidos ?? []).flatMap((m) => formatoCortoDe(m) ?? []);
  return { formatos: formatos.length > 0 ? formatos : null, tamanoMb: canonico.tamanoMaximoMb ?? null, paginas: canonico.paginasMaximas ?? null };
}

/** Peso legible: «5 MB», «1.5 MB»; por debajo de 1 MB, en KB («12 KB»). */
export function megas(bytes: number): string {
  if (bytes < 1024 * 1024) return `${String(Math.max(1, Math.round(bytes / 1024)))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 || Number.isInteger(mb) ? String(Math.round(mb)) : mb.toFixed(1)} MB`;
}

/**
 * Lo que sugiere el canónico para la frescura (TD-10): antigüedad máxima, revalidación y, si lo hay, el periodo. Al elegir el canónico al crear un tipo se
 * precarga (la empresa lo ajusta); la API aplica lo mismo si no se manda ninguna regla.
 */
export function frescuraSugerida(
  canonico: Pick<TipoDocumentoCanonicoDto, 'antiguedadMaximaSugeridaDias' | 'revalidarCadaSugeridoDias' | 'reglaFrescuraSugerida'>,
): Pick<BorradorTipo, 'antiguedad' | 'revalidar' | 'unidadRevalidar' | 'periodo'> {
  const revalidar = plazoParaEditar(canonico.revalidarCadaSugeridoDias);
  return {
    antiguedad: canonico.antiguedadMaximaSugeridaDias ? String(canonico.antiguedadMaximaSugeridaDias) : '',
    revalidar: revalidar.valor,
    unidadRevalidar: revalidar.unidad,
    periodo: canonico.reglaFrescuraSugerida?.tipo === 'PeriodoMinimo' ? (canonico.reglaFrescuraSugerida.regla ?? '') : '',
  };
}
