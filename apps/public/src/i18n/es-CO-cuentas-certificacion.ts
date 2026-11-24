/**
 * Textos es-CO de la certificación bancaria de cada cuenta (CB-1): cada cuenta se registra con la suya, la IA la lee y se compara con lo que declaraste.
 * Se integran en `es-CO.ts` como `cuentas.certificacion`.
 */

export const certificacionDeCuenta = {
  titulo: 'Certificación bancaria',
  falta: 'Falta la certificación de esta cuenta',
  faltaAyuda: 'Sube la certificación que expide tu banco para esta cuenta. Sin ella no puedes designarla con una empresa.',
  subir: 'Subir certificación',
  reemplazar: 'Reemplazar',
  version: 'Versión {{n}} · subida el {{fecha}}',
  chip: {
    Falta: 'Falta certificación',
    SinAnalisis: 'Sin leer',
    Coincide: 'Coincide',
    Discrepa: 'No coincide',
    NoVerificable: 'Sin verificar',
    NoSeLee: 'No se lee',
    Devuelta: 'Devuelta',
  },
  verificacion: {
    SinAnalisis: 'Aún no la hemos leído: se lee cuando una empresa la recibe al designar esta cuenta con ella.',
    Coincide: 'Lo que dice tu certificación coincide con la cuenta que registraste.',
    Discrepa: 'Tu certificación no coincide con lo que registraste. Revisa: {{campos}}.',
    NoVerificable: 'No pudimos verificar en tu certificación: {{campos}}.',
    NoSeLee: 'No pudimos leer tu certificación con claridad.',
    Devuelta: 'Devolvimos tu certificación: {{motivo}}',
  },
  siguientePaso: {
    Discrepa:
      'Sube la certificación correcta de esta cuenta. Si lo que está mal son los datos que registraste, retira la cuenta y agrégala de nuevo con los de tu banco.',
    NoVerificable: 'Sube una certificación reciente que traiga el número de la cuenta, el titular y su identificación.',
    NoSeLee: 'Sube una copia más clara: el PDF que te da tu banco, o una foto nítida y completa.',
    Devuelta: 'Sube de nuevo la certificación de esta cuenta.',
  },
  diferencia: '{{etiqueta}}: registraste {{declarado}} y la certificación dice {{extraido}}',
  sinDato: 'sin dato',
  dialogo: {
    tituloSubir: 'Certificación de {{cuenta}}',
    tituloReemplazar: 'Reemplazar la certificación de {{cuenta}}',
    ayudaSubir: 'Sube la certificación que expide tu banco para esta cuenta. Cada cuenta lleva la suya.',
    ayudaReemplazar:
      'Sube una versión nueva de la certificación de esta cuenta. La anterior queda en tu historial y las empresas que ya tienen la cuenta reciben la nueva.',
    cerrar: 'Cerrar',
    exito: 'Subiste la certificación de {{cuenta}} (versión {{n}}).',
    duplicado: 'Ese es el mismo archivo de la versión {{n}} de esta cuenta. Sube uno distinto.',
  },
  nueva: {
    campo: 'Certificación bancaria de esta cuenta',
    ayuda: 'La que expide tu banco para esta cuenta, con el número, el titular y su identificación. Cada cuenta lleva la suya y la usamos para verificar los datos que escribiste.',
    requerida: 'Adjunta la certificación bancaria de esta cuenta.',
    elegido: 'Certificación: {{archivo}}',
    cambiar: 'Cambiar archivo',
    zona: 'Sube la certificación de la cuenta',
    guardando: 'Guardando tu cuenta…',
    subiendo: 'Cuenta guardada. Subiendo la certificación…',
    fallo: 'Tu cuenta quedó guardada, pero no pudimos subir la certificación: {{motivo}}',
    falloAyuda: 'Puedes reintentar ahora o subirla después desde la tarjeta de la cuenta; mientras no la subas no podrás designarla.',
    reintentar: 'Reintentar',
    despues: 'Subirla después',
  },
};
