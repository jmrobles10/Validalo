/**
 * Textos es-CO del requisito «Certificación bancaria» del expediente (CB-8): se sube con la cuenta a la que pertenece y se propone esa cuenta a la empresa que lo pide.
 * Se integran en `es-CO.ts` como `expediente.documentos.bancaria`.
 */

export const requisitoBancario = {
  ayuda: 'Es la certificación de la cuenta en la que quieres que te pague {{empresa}}: se sube con su cuenta. Cada cuenta lleva la suya.',
  acciones: { subir: 'Subir certificación de una cuenta', corregir: 'Subir certificación corregida', reemplazar: 'Subir otra versión' },
  elegir: {
    titulo: 'Certificación bancaria para {{empresa}}',
    ayuda: '¿De cuál de tus cuentas es la certificación? Se sube con esa cuenta.',
    opciones: 'Tus cuentas activas',
    sinCertificacion: 'Falta su certificación: la subes ahora.',
    conCertificacion: 'Ya tiene su certificación.',
    deLaEmpresa: 'Es la cuenta que tienes con {{empresa}}.',
    otraCuenta: 'Agregar otra cuenta',
    continuar: 'Continuar',
  },
  proponer: {
    titulo: '¿Designar esta cuenta para {{empresa}}?',
    texto:
      '{{empresa}} recibe la certificación de {{cuenta}} cuando la designas como la cuenta en la que te paga, y la aprueba antes de usarla. Sin designarla, el documento no le llega.',
    ahoraNo: 'Ahora no',
    confirmar: 'Designar con {{empresa}}',
    exito: 'Designaste {{cuenta}} para {{empresa}}. Queda pendiente de su aprobación.',
  },
};
