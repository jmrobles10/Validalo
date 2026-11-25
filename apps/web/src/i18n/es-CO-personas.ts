/** Textos es-CO de las personas relacionadas vistas por la empresa (ADR-0010): se integran en `es-CO.ts` como `personasRelacionadas`. */

export const personasRelacionadas = {
  titulo: 'Personas relacionadas',
  ayuda:
    'Representantes, suplentes, socios y beneficiarios finales de este tercero cuyos documentos pide tu flujo. Cada persona tiene su propia bóveda: aquí ves solo lo que se compartió con este vínculo.',
  vacio: 'Tu flujo no pide documentos de personas relacionadas',
  vacioAyuda: 'Cuando el flujo pida la cédula del representante legal o de los socios, las personas aparecen aquí.',
  roles: {
    RepresentanteLegal: 'Representante legal',
    Suplente: 'Suplente del representante legal',
    Socio: 'Socio o accionista',
    BeneficiarioFinal: 'Beneficiario final',
    MiembroDe: 'Miembro del consorcio',
  },
  principal: 'Principal',
  rolConParticipacion: '{{rol}} · {{valor}} %',
  cargo: 'Cargo: {{cargo}}',
  desde: 'Desde el {{fecha}}',
  sinDocumentos: 'Aún no se comparte ningún documento de esta persona con el vínculo.',
  version: 'Versión {{n}} · {{fecha}}',
  versionesCompartidas_one: '{{count}} versión compartida',
  versionesCompartidas_other: '{{count}} versiones compartidas',
  requisito: {
    de: 'De {{nombre}} · {{rol}}',
    sinPersona: 'Sin persona: el tercero aún no registra a quién cumple este rol ({{rol}}).',
    todas: 'De cada persona con este rol',
  },
  editor: {
    documentoDe: 'Documento de',
    delTercero: 'El propio tercero',
    todas: 'De todas las personas con ese rol',
    ayuda: 'Se resuelve al abrir o recalcular el expediente: por defecto, la persona principal del rol; con «de todas», cada una cuenta como un requisito. Si nadie cumple el rol, el requisito queda pendiente y sin persona.',
  },
} as const;
