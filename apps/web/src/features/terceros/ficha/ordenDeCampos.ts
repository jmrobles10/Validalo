/**
 * El orden en que el esquema de cada sección pide sus datos (el de `DatosDeSecciones.cs`, que es el del formulario del tercero). Los datos llegan guardados como JSON
 * de base de datos, que no conserva el orden (los reordena por largo de la clave y luego alfabéticamente): para mostrarlos como el tercero los llenó hay que ordenarlos aquí.
 * Una clave que el esquema agregue y aquí no esté se muestra al final, en el orden en que llegó: nada se pierde.
 */
const ORDEN_POR_SECCION: Readonly<Record<string, readonly string[]>> = {
  FICHA_GENERAL: [
    'razon_social', 'nombres', 'apellidos', 'tipo_persona', 'tipo_identificacion', 'numero', 'dv',
    'correo', 'telefono',
    'pais', 'ciudad', 'direccion', 'direccion_estructurada',
    'ciiu_principal', 'ciiu_secundarias', 'pagina_web', 'certificado_iso', 'anio_inicio',
    'pep', 'vinculo_pep', 'fecha_expedicion', 'lugar_expedicion', 'declaracion_pep',
  ],
  FICHA_TRIBUTARIA: [
    'responsabilidades', 'resolucion_gran_contribuyente', 'resolucion_autorretenedor',
    'responsable_ica', 'autorretenedor_ica', 'exento_rete_cree', 'ica',
    'regimen', 'contribuyente_impuesto_ventas', 'agente_de_retencion', 'exento_de_retenciones', 'certificado_exencion', 'emisor_comprobantes_electronicos',
  ],
  FICHA_FINANCIERA: [
    'periodo', 'fecha_corte', 'activos', 'pasivos', 'patrimonio', 'ingresos_brutos', 'ingresos_netos', 'gastos_operacionales', 'gastos_no_operacionales', 'otros_ingresos',
    'moneda_extranjera',
  ],
  FICHA_LEGAL: ['personas', 'revisor_fiscal_firma'],
  FICHA_SST: [
    'programa_salud_ocupacional', 'identifica_factores_de_riesgo', 'comite_paritario', 'programa_higiene_y_seguridad', 'gestion_ambiental', 'reglamento_interno', 'politica_hseq', 'licencias_y_permisos',
  ],
  FICHA_ESPECIALIDADES: ['especialidades'],
};

/** Lo que va dentro de un grupo o fila: la dirección por partes, las resoluciones, la moneda extranjera, la firma de revisoría y el municipio de ICA. */
const ORDEN_ANIDADO: Readonly<Record<string, readonly string[]>> = {
  direccion_estructurada: ['tipo_via', 'numero_via', 'letra_via', 'bis', 'cuadrante', 'numero_cruce', 'letra_cruce', 'placa', 'complemento'],
  resolucion_gran_contribuyente: ['numero', 'fecha'],
  resolucion_autorretenedor: ['numero', 'fecha'],
  certificado_exencion: ['numero', 'fecha'],
  moneda_extranjera: ['realiza', 'tipos', 'paises'],
  revisor_fiscal_firma: ['nit', 'razon_social'],
  ica: ['municipio', 'ciiu', 'tarifa_por_mil'],
};

/** Lo que no está en ninguna sección conocida (o la sección no se sabe) sigue el orden de todas, una tras otra. */
const ORDEN_GENERAL: readonly string[] = [...new Set(Object.values(ORDEN_POR_SECCION).flat())];

/** El orden de las claves de primer nivel de una sección; sin sección conocida, el de todas. */
export const ordenDeLaSeccion = (seccion: string | undefined): readonly string[] => (seccion ? (ORDEN_POR_SECCION[seccion] ?? ORDEN_GENERAL) : ORDEN_GENERAL);

/** El orden de las claves de lo que está dentro de `clave` (un grupo o las filas de una lista); sin orden conocido, el de llegada. */
export const ordenDeLoAnidado = (clave: string): readonly string[] => ORDEN_ANIDADO[clave] ?? [];

/** Los pares en el orden dado; los que el orden no nombra van al final, en el orden en que llegaron. */
export function ordenarPares<T>(pares: readonly (readonly [string, T])[], orden: readonly string[]): [string, T][] {
  const posicion = (clave: string) => {
    const i = orden.indexOf(clave);
    return i === -1 ? orden.length : i;
  };
  return pares
    .map(([clave, valor], llegada) => ({ par: [clave, valor] as [string, T], llegada }))
    .sort((a, b) => posicion(a.par[0]) - posicion(b.par[0]) || a.llegada - b.llegada)
    .map((x) => x.par);
}
