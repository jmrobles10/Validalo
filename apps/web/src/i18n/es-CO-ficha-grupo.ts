/**
 * Textos es-CO de la ficha del grupo de la consola de Plataforma (decisión FG): el grupo, sus empresas, quien lo administra, cómo entran sus personas y sus
 * sistemas, cada sección en solo lectura con su «Editar». Se integran en `es-CO-plataforma.ts` como `plataforma.ficha`; los errores de la API van en `errores`.
 */

export const fichaGrupo = {
  titulo: 'Ficha del grupo',
  subtitulo: 'Lo que se dio de alta y quién lo administra. Cada sección se corrige por separado; lo que no se puede cambiar dice por qué.',
  volver: 'Grupos y empresas',
  verFicha: 'Ver ficha',
  verFichaDe: 'Ver la ficha de {{grupo}}',
  cargando: 'Cargando la ficha del grupo',
  planDelGrupo: 'Plan y límites',
  editarSeccion: 'Editar {{seccion}}',
  grupo: {
    titulo: 'Grupo',
    editar: 'Editar el grupo',
    nombre: 'Nombre del grupo',
    identificador: 'Identificador',
    zona: 'Zona horaria',
    region: 'Región',
    estado: 'Estado',
    creado: 'Creado',
    identificadorAyuda:
      'El identificador no se edita: va dentro de cada API key del grupo (vsk_…_identificador_…) y con él se encuentra al grupo cuando se presenta una llave; cambiarlo dejaría sin servir todas las llaves ya emitidas.',
    nombreAyuda: 'Aparece en esta consola, en las invitaciones por correo y en la lista de cuentas al ingresar. Lo que ya se envió conserva el nombre anterior.',
    zonaAyuda: 'Nombre IANA, como America/Bogota. La usan las fechas de los certificados y de la validación, y el mes en que cuenta el uso de IA.',
    regionAyuda: 'Código de país en minúsculas, como co. Por ahora solo se muestra.',
    sandboxAyuda: 'Si el grupo tiene sandbox, su nombre, región y zona horaria siguen estos.',
    guardado: 'Corregiste el grupo {{grupo}}.',
    errores: {
      'nombre-requerido': 'Escribe el nombre del grupo.',
      'zona-invalida': 'Esa zona horaria no existe. Usa un nombre IANA, como America/Bogota.',
    },
  },
  empresas: {
    titulo: 'Empresas',
    ayuda: 'La razón social, la identificación y el prefijo se corrigen aquí. Los códigos ya emitidos conservan el prefijo anterior.',
    vacio: 'Este grupo aún no tiene empresas.',
    agregar: 'Agregar empresa',
    planIa: 'Plan de IA',
  },
  administradores: {
    titulo: 'Administradores',
    ayuda: 'Quienes tienen el rol Administrador en el grupo. Corrige su nombre, su correo y el usuario con el que el sistema integrado los reconoce.',
    lista: 'Administradores del grupo',
    vacio: 'Este grupo no tiene administradores.',
    vacioAyuda: 'Sin un administrador nadie del grupo puede crear usuarios, áreas ni flujos.',
    error: 'No pudimos cargar los administradores.',
    usuarioEn: 'Usuario en {{sistema}}',
    sinEnlazar: 'Sin usuario enlazado en el sistema integrado: se enlaza por su correo la primera vez que entre.',
    ultimoIngreso: 'Último ingreso {{fecha}}',
    nuncaIngreso: 'Aún no ha ingresado',
    passkeys_one: '{{count}} passkey',
    passkeys_other: '{{count}} passkeys',
    sinPasskey: 'Sin passkey: entra con el código del correo',
    invitadoEl: 'Invitado el {{fecha}}',
    editar: 'Editar',
    editarA: 'Editar a {{nombre}}',
    reenviar: 'Reenviar invitación',
    reenviarA: 'Reenviar la invitación a {{nombre}}',
    reenviarTitulo: 'Reenviar la invitación',
    reenviarTexto:
      'Enviamos a {{correo}} el correo con la dirección de Valídalo: ahí pide un código y entra; la passkey es opcional. No lleva ningún secreto.',
    reenviarConfirmar: 'Enviar invitación',
    reenviada: 'Enviamos la invitación a {{correo}}.',
    dialogo: {
      titulo: 'Editar al administrador',
      nombre: 'Nombre',
      correo: 'Correo',
      usuarioEn: 'Usuario en {{sistema}} (opcional)',
      usuarioEnAyuda: 'El «sub» con el que ese sistema lo identifica. Vacío: se enlaza por su correo la primera vez que entre.',
      avisoCorreo:
        'Al cambiar el correo se cierran las sesiones de esta persona y se revocan sus passkeys: quien tuvo el correo anterior no se queda dentro. La persona entra con el código del correo nuevo y registra otra passkey.',
      avisoSistema: 'Si entra desde un sistema integrado, ese sistema manda su nombre y su correo en cada ingreso y pisa lo que corrijas aquí: corrígelos también allá.',
      invitar: 'Enviar la invitación al correo nuevo',
      guardado: 'Corregiste a {{nombre}}.',
      guardadoConAviso: 'Corregiste a {{nombre}}: se cerraron sus sesiones y se revocaron sus passkeys.',
      cargandoSistemas: 'Cargando los sistemas del grupo',
      errores: {
        'nombre-requerido': 'Escribe el nombre.',
        'correo-invalido': 'Escribe un correo válido.',
      },
    },
  },
  ingreso: {
    titulo: 'Cómo entran sus personas',
    ayuda: 'La política de ingreso del grupo, la misma que su administrador ve en Configuración › Ingreso.',
    editar: 'Editar cómo entran',
    modos: 'Modos de ingreso',
    sesion: 'Duración de la sesión directa',
    inactividad: 'Cierre por inactividad',
    passkeyParaTodos: 'Passkey para todas las personas',
    guardado: 'Guardaste cómo entran las personas de {{grupo}}.',
    dialogoAyuda: 'Elige uno o ambos modos. La duración y la inactividad aplican solo a quien entra directo.',
  },
  sistemas: {
    titulo: 'Sistemas integrados',
    ayuda: 'Los sistemas del cliente que autentican a sus personas y firman sus aserciones.',
    gestionar: 'Gestionar',
    gestionarDe: 'Gestionar los sistemas de {{grupo}}',
    error: 'No pudimos cargar los sistemas.',
  },
};

/** Textos de los códigos que devuelve la API al corregir el grupo y a su gente (se suman a `errores`). */
export const erroresDeFichaGrupo = {
  'identidad-duplicada': 'Otra persona del grupo ya está enlazada con ese usuario del sistema integrado.',
  'identidades-repetidas': 'Solo puede haber un usuario por sistema integrado.',
  'identidad-externa-invalida': 'Escribe el usuario del sistema integrado o déjalo vacío.',
  'sistema-invalido': 'Ese sistema ya no existe en el grupo. Recarga la ficha e inténtalo de nuevo.',
  'zona-horaria-invalida': 'Esa zona horaria no existe. Usa un nombre IANA, como America/Bogota.',
};
