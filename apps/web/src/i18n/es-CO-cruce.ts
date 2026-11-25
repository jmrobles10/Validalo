/**
 * Textos es-CO del cruce sección ↔ documento (F5, FM-8, FM-13): el panel del requisito de sección, el del documento usado como
 * soporte, la justificación al aprobar con discrepancias y la opción «Usar como soporte» del editor de flujos. Se integran en
 * `es-CO.ts` como `cruce`.
 */
export const cruce = {
  titulo: 'Cruce con el documento',
  tituloCon: 'Cruce con {{documento}} · versión {{n}}',
  confianza: 'Confianza de la lectura: {{valor}}',
  ilegible: 'El documento no se lee con seguridad: nada se pudo verificar.',
  resumen: '{{coinciden}} coinciden · {{difieren}} difieren · {{noVerificables}} sin verificar',
  campo: 'Campo',
  declarado: 'Lo declarado',
  documento: 'Lo que dice el documento',
  resultado: 'Resultado',
  critico: 'Crítico',
  vacio: '—',
  resultados: { Coincide: 'Coincide', Discrepa: 'Difiere', NoVerificable: 'Sin verificar' },
  discrepanciaCritica:
    'Hay diferencias en campos críticos: no se aprueba en lote. Observa el documento, observa la sección o aprueba con una justificación.',
  manual: 'Sin cruce automático: tu empresa no recibió la lectura de {{documentos}}. Revísalo manualmente.',
  sinDocumento: 'Ningún documento de la bóveda respalda esta sección todavía.',
  evidencia: 'Es evidencia para la revisión: el cruce no aprueba ni observa nada por sí mismo.',
  // El resumen de lo crítico en una frase, con los nombres cortos de los campos (los de la cuenta; otro campo va con su etiqueta en minúscula).
  criticos: {
    coincide: 'Coincide: {{campos}}',
    difiere: 'No coincide: {{campos}}',
    falta: 'Sin verificar: {{campos}}',
    tambienDifiere: 'También difiere: {{campos}}',
    sinDiferencias: 'Sin diferencias',
    noSeLee: 'No se lee con seguridad: nada se pudo verificar',
    cortos: {
      numero: 'número',
      titular: 'titular',
      identificacion_titular: 'identificación',
      titular_es_el_tercero: 'titular = tercero',
      banco: 'banco',
      tipo_cuenta: 'tipo de cuenta',
    },
  },
  // La antigüedad del documento frente al máximo de su tipo (TD-10): una línea con el tono de su resultado.
  antiguedad: {
    linea_one: 'Antigüedad: {{count}} día, máximo {{maximo}}',
    linea_other: 'Antigüedad: {{count}} días, máximo {{maximo}}',
    sinFecha: 'Antigüedad: sin fecha de expedición, máximo {{maximo}} días',
  },
  soporte: {
    titulo: 'Soporte de la información',
    respalda: 'Respalda: {{secciones}}',
    sinAnalisis: 'Tu empresa no recibió la lectura automática de esta versión: compara a mano con las secciones.',
    sinCruceAutomatico: 'Sin cruce automático con lo declarado: no hay una cuenta o sección con la que compararlo todavía. Revísalo a mano.',
    seccionSinDiligenciar: '{{seccion}}: sin diligenciar.',
    seccionSinDiligenciarCorta: '{{seccion}} (sin diligenciar)',
    seccionSinCruce: '{{seccion}} (versión {{n}}): sin cruce.',
    seccion: '{{seccion}} (versión {{n}})',
    sinCruce: 'Sin cruce con esta versión.',
    coincide: 'Coincide',
    criticas: 'Difiere en campos críticos',
    sinVerificar: 'Sin verificar',
    noSeLee: 'No se lee',
    lineaDeCuenta: '{{cuenta}} — {{resumen}}',
    difiere_one: 'Difiere en {{count}} campo',
    difiere_other: 'Difiere en {{count}} campos',
  },
  justificacion: {
    etiqueta: 'Justificación de la aprobación',
    ayuda: 'Los campos críticos de {{requisitos}} no tienen soporte: el cruce con el documento difiere o el cambio no trae un documento nuevo. Explica por qué apruebas (al menos 10 caracteres).',
    falta: 'Escribe la justificación de la aprobación (al menos 10 caracteres).',
  },
  editor: {
    usarComoSoporte: 'Usar como soporte de las secciones',
    ayuda: 'El documento se cruza con {{secciones}} y el revisor ve las diferencias.',
  },
} as const;

export const erroresCruce = {
  'justificacion-por-discrepancias': 'Hay campos críticos sin soporte (el cruce difiere o el cambio no trae un documento nuevo): escribe una justificación para aprobar.',
  'cruce-con-discrepancias': 'Tiene campos críticos sin soporte (el cruce difiere o el cambio no trae un documento nuevo): revísalo en su expediente.',
  'soporte-no-aplica': 'Ese documento no respalda ninguna sección de la información.',
} as const;
