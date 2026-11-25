/**
 * Textos es-CO de «Lo que pide el flujo» en el editor de flujos (documentos y secciones de la información por sector, cada uno en una fila
 * compacta con su resumen). Se integran en `es-CO.ts` como `flujoRequisitos`.
 */
export const flujoRequisitos = {
  titulo: 'Lo que pide el flujo',
  /** Encabezado de la tarjeta y de cada sector: «14 documentos · 2 secciones · 3 con condición». */
  resumen: {
    documentos_one: '{{count}} documento',
    documentos_other: '{{count}} documentos',
    secciones_one: '{{count}} sección',
    secciones_other: '{{count}} secciones',
    conCondicion_one: '{{count}} con condición',
    conCondicion_other: '{{count}} con condición',
  },
  /** Los documentos de un tipo propio de la empresa, sin sector en la ficha. */
  otros: 'Otros documentos',
  /** El documento recién agregado al que aún no se le elige el tipo: al elegirlo pasa a su sector. */
  porCompletar: 'Por completar',
  porCompletarAyuda: 'Elige su tipo para ubicarlo en su sector',
  seccionDeLaInformacion: 'Sección de la información',
  agregar: 'Agregar',
  agregarDocumento: 'Documento',
  agregarSeccion: 'Sección de la información',
  yaSePide: 'Ya se pide',
  yaSePidenTodas: 'Ya se piden todas',
  seccionesQueFaltan: 'Secciones de la información que el flujo aún no pide',
  agregarAlSector: 'Agregar documento a {{sector}}',
  fila: {
    obligatorio: 'Obligatorio',
    opcional: 'Opcional',
    sePideATodos: 'Se pide a todos',
    revisanTodas: 'Lo revisan todas las áreas',
    revisa: 'Lo revisa {{areas}}',
    revisan: 'Lo revisan {{areas}}',
    yOtras: '{{primeras}} y {{count}} más',
    soporteDeSecciones: 'Soporte de secciones',
    exigeSoporte: 'Exige soporte',
    conError: 'Con errores',
    deLaPersona: {
      RepresentanteLegal: 'Del representante legal',
      Suplente: 'Del suplente del representante legal',
      Socio: 'Del socio o accionista',
      BeneficiarioFinal: 'Del beneficiario final',
      MiembroDe: 'Del miembro del consorcio',
    },
    todasLasPersonas: '{{texto}} (todas)',
  },
  /**
   * La condición de «Se pide a» en una frase corta: «Si en Especialidades declara G1 · Gestión y es persona natural». Cada comparación es un
   * fragmento que sigue a «Si» (o a «y» / «o» en una condición compuesta); los valores van con su nombre del catálogo y traducidos.
   */
  condicion: {
    si: 'Si {{condicion}}',
    alguno: 'en {{campo}} declara {{valores}}',
    todos: 'en {{campo}} declara {{valores}}',
    ninguno: 'en {{campo}} no declara {{valores}}',
    es: '{{campo}} es {{valores}}',
    noEs: '{{campo}} no es {{valores}}',
    esUnoDe: '{{campo}} es {{valores}}',
    noEsNingunoDe: '{{campo}} no es {{valores}}',
    mayor: '{{campo}} es mayor que {{valores}}',
    menor: '{{campo}} es menor que {{valores}}',
    entre: '{{campo}} está entre {{desde}} y {{hasta}}',
    declarado: '{{campo}} está declarado',
    noDeclarado: '{{campo}} no está declarado',
    sinValores: '{{campo}}: falta elegir los valores',
    noSeCumple: 'no se cumple que {{condicion}}',
    personaEs: 'es {{valores}}',
    personaNoEs: 'no es {{valores}}',
    personas: { Juridica: 'persona jurídica', Natural: 'persona natural', Consorcio: 'consorcio' },
    extranjeroEs: 'es extranjero',
    extranjeroNoEs: 'no es extranjero',
    conectores: { o: 'o', y: 'y', ni: 'ni' },
  },
} as const;
