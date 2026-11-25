import type { DocumentoVistaEmpresaDto, PersonaDelVinculoDto } from '@validalo/api-client';
import { agruparPorIdentificacion, claveDeIdentificacion } from '../terceros/ficha/personas';

/** Una persona relacionada con el tercero, con todas sus relaciones con el vínculo juntas. */
export interface PersonaDelVinculoAgrupada {
  nombre: string;
  identificacion: PersonaDelVinculoDto['identificacion'];
  /** Una por rol (representante legal, socio…): las de rol primero y la de Socio al final. */
  relaciones: PersonaDelVinculoDto[];
  /** Es la principal en alguna de sus relaciones. */
  principal: boolean;
  /** Los documentos de su bóveda compartidos con el vínculo, cada uno una sola vez aunque la persona tenga varias relaciones. */
  documentos: DocumentoVistaEmpresaDto[];
}

/** Los documentos de varias relaciones de la misma persona, sin repetir: el mismo documento (la cédula) sale una vez, con las versiones compartidas de todas. */
function documentosUnicos(relaciones: readonly PersonaDelVinculoDto[]): DocumentoVistaEmpresaDto[] {
  const porId = new Map<string, DocumentoVistaEmpresaDto>();
  for (const relacion of relaciones) {
    for (const documento of relacion.documentos) {
      const previo = porId.get(documento.documentoId);
      if (!previo) {
        porId.set(documento.documentoId, documento);
        continue;
      }
      const conocidas = new Set(previo.versionesCompartidas.map((v) => v.n));
      porId.set(documento.documentoId, { ...previo, versionesCompartidas: [...previo.versionesCompartidas, ...documento.versionesCompartidas.filter((v) => !conocidas.has(v.n))] });
    }
  }
  return [...porId.values()];
}

/**
 * Las relaciones de las personas con el vínculo, UNA persona por identificación (la misma regla de la ficha del tercero, `agruparPorIdentificacion`): quien es representante legal y
 * además socio tiene dos relaciones pero es una persona, con su cédula una sola vez. Sin número de identificación la relación queda sola.
 */
export function agruparRelaciones(relaciones: readonly PersonaDelVinculoDto[]): PersonaDelVinculoAgrupada[] {
  const grupos = agruparPorIdentificacion(
    relaciones,
    (r) => claveDeIdentificacion(r.identificacion.tipo, r.identificacion.numero),
    (r) => r.tipo === 'Socio',
  );
  return grupos.flatMap((grupo) => {
    const propias = grupo.map((g) => g.elemento);
    const [primera] = propias;
    if (!primera) return [];
    return {
      nombre: primera.nombre,
      identificacion: primera.identificacion,
      relaciones: propias,
      principal: propias.some((r) => r.principal),
      documentos: documentosUnicos(propias),
    };
  });
}
