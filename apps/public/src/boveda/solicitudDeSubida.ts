/**
 * Qué se va a subir y desde dónde: lo que cada botón «Subir…» le pide al diálogo de subida. Es el mismo lenguaje que los parámetros de
 * `/boveda/subir` (la página que usan los enlaces de los correos y el modo embebido): de una solicitud salen los parámetros que lee
 * `SubirArchivo` y, para lo que sí lleva a la página, el enlace.
 *
 * - `documento`: otra versión del mismo documento de la bóveda.
 * - `tipo` + `nombre`: un canónico global; con `vinculoId`, el contexto de la empresa para aplicar sus reglas de archivo.
 * - `tipoDocumentoTenantId` + `vinculoId` + `nombre`: un tipo propio de la empresa.
 * - `persona` + `tipo` + `nombre`: el documento de una persona relacionada (ADR-0010), que va a la bóveda de la persona.
 * - `expediente` + `requisito`: la revisión que lo pide, para leer las reglas, los campos y la plantilla del tipo.
 * - `volver`: ruta a la que regresa la página; el diálogo no navega, así que la ignora.
 */
export interface SolicitudDeSubida {
  tipo?: string;
  nombre?: string;
  documento?: string;
  persona?: string;
  vinculoId?: string;
  tipoDocumentoTenantId?: string;
  expediente?: string;
  requisito?: string;
  volver?: string;
}

/** Los parámetros de URL en un orden fijo (así el enlace es estable), sin los que no vienen. */
export function parametrosDeSolicitud(solicitud: SolicitudDeSubida): URLSearchParams {
  const parametros = new URLSearchParams();
  const orden = ['nombre', 'volver', 'expediente', 'requisito', 'tipo', 'persona', 'tipoDocumentoTenantId', 'vinculoId', 'documento'] as const;
  for (const clave of orden) {
    const valor = solicitud[clave];
    if (valor) parametros.set(clave, valor);
  }
  return parametros;
}

/** El enlace a la página `/boveda/subir` con esta solicitud (lo que no se sube en el diálogo: llenar un formulario). */
export function enlaceDeSolicitud(solicitud: SolicitudDeSubida): string {
  return `/boveda/subir?${parametrosDeSolicitud(solicitud).toString()}`;
}
