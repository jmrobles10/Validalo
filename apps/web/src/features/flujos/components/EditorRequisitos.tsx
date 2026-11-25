import { Box, Stack, Typography } from '@mui/material';
import type { AreaDto, AtributoPermitidoDto, TipoDocumentoTenantDto } from '@validalo/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fichaEmpresa } from '../../../i18n/es-CO-ficha-empresa';
import type { SectorDeRequisito } from '../../vinculos/ficha/sectores';
import { requisitoDeSeccionNuevo, requisitoNuevo, sePuedePedir, type ErrorFlujo, type EtapaEnEditor, type RequisitoEnEditor } from '../editor';
import { agruparPorSector, contarRequisitos, entradasEnOrdenVisual, POR_COMPLETAR, posicionesConError, textoDelConteo, tiposPorPedirEnSector, type SectorEnVista, type UbicacionesProvisionales } from '../requisitosPorSector';
import { FilaDeRequisito } from './FilaDeRequisito';
import type { MensajesDelRequisito } from './FormularioDeRequisito';
import { GrupoDeSector } from './GrupoDeSector';
import { MenuAgregarRequisito } from './MenuAgregarRequisito';

export interface EditorRequisitosProps {
  requisitos: RequisitoEnEditor[];
  etapas: readonly EtapaEnEditor[];
  areas: readonly AreaDto[];
  tiposDocumento: readonly TipoDocumentoTenantDto[];
  onCambiar: (requisitos: RequisitoEnEditor[]) => void;
  errores: readonly ErrorFlujo[];
  soloLectura: boolean;
  /** Los atributos permitidos del tipo de vínculo del flujo: con ellos «Se pide a» ofrece «según un atributo del vínculo». */
  atributos?: readonly AtributoPermitidoDto[];
}

type CodigoErrorSeccion = keyof typeof fichaEmpresa.editor.errores;
const esErrorDeSeccion = (codigo: string): codigo is CodigoErrorSeccion => codigo in fichaEmpresa.editor.errores;

/**
 * Lo que pide el flujo (RQ-1): documentos o secciones de la información del tercero (F2, FM-25). Cada uno con obligatorio, qué áreas lo revisan
 * (ninguna elegida = todas las del flujo), cuántas personas deben aprobarlo (vacío = las del área) y a quién se le pide (RQ-12: todos, solo
 * personas jurídicas o naturales; una condición armada por la API se describe y se conserva). Una sección suma periodos (la financiera) y «Exige
 * soporte». Sin requisitos, el flujo decide por área (FL-1).
 *
 * Se ve por sector, como el menú lateral de la ficha (el documento nuevo sin tipo, en «Por completar» hasta que se elige), y cada requisito es una fila cerrada con su resumen; abrirla (una a la vez) muestra todos sus
 * controles. Es solo diagramación: los requisitos siguen en el orden del borrador, que es el que se guarda, y los errores apuntan a su posición.
 */
export function EditorRequisitos({ requisitos, etapas, areas, tiposDocumento, onCambiar, errores, soloLectura, atributos = [] }: EditorRequisitosProps) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState<number | null>(null);
  const [ubicaciones, setUbicaciones] = useState<UbicacionesProvisionales>({});
  const [conErrorVistas, setConErrorVistas] = useState<readonly number[]>([]);
  const areasDelFlujo = etapas.flatMap((e) => e.areas.map((a) => a.areaId)).filter(Boolean);
  const nombreArea = (id: string) => areas.find((a) => a.id === id)?.nombre ?? id;
  const elegibles = tiposDocumento.filter(sePuedePedir);
  const grupos = agruparPorSector(requisitos, tiposDocumento, ubicaciones);

  // Un requisito que recibe un error de validación se abre solo (el primero, en el orden en que se ven) para mostrarlo.
  const conError = posicionesConError(errores);
  if (conError.join() !== conErrorVistas.join()) {
    setConErrorVistas(conError);
    const primero = entradasEnOrdenVisual(grupos).find((e) => conError.includes(e.indice) && !conErrorVistas.includes(e.indice));
    if (primero) setAbierto(primero.indice);
  }

  const cambiar = (k: number, cambio: Partial<RequisitoEnEditor>) => onCambiar(requisitos.map((r, i) => (i === k ? { ...r, ...cambio } : r)));
  const quitar = (k: number) => {
    onCambiar(requisitos.filter((_, i) => i !== k));
    setAbierto((a) => (a === null || a === k ? null : a > k ? a - 1 : a));
  };
  const agregar = (nuevo: RequisitoEnEditor, sector?: SectorDeRequisito) => {
    onCambiar([...requisitos, nuevo]);
    setAbierto(requisitos.length);
    if (sector) setUbicaciones((u) => ({ ...u, [nuevo.clave]: sector }));
  };
  // Desde un sector, el documento nuevo se queda en él mientras no se elija su tipo y, si el sector solo tiene un tipo por pedir, ya viene elegido.
  const agregarAlSector = (sector: SectorDeRequisito) => {
    const porPedir = tiposPorPedirEnSector(sector, requisitos, elegibles);
    agregar(requisitoNuevo(porPedir.length === 1 ? (porPedir[0]?.id ?? '') : ''), sector);
  };
  // «Por completar» no ofrece agregar: es el paso del documento nuevo hacia su sector.
  const alSector = (sector: SectorEnVista) => (soloLectura || sector === POR_COMPLETAR ? undefined : () => agregarAlSector(sector));

  const mensajesDe = (k: number, esSeccion: boolean): MensajesDelRequisito => {
    const de = (campo: string, deSeccion: boolean) => {
      const e = errores.find((x) => x.campo === campo);
      if (!e) return null;
      return deSeccion && esErrorDeSeccion(e.codigo)
        ? t(`fichaEmpresa.editor.errores.${e.codigo}`)
        : e.codigo === 'condicion-invalida'
          ? t('flujos.editor.requisitos.condicionInvalida')
          : t(`flujos.editor.errores.${e.codigo}`);
    };
    return {
      general: de(`requisito.${String(k)}`, esSeccion),
      periodos: de(`requisito.${String(k)}.periodos`, true),
      vigencia: de(`requisito.${String(k)}.vigencia`, true),
      revalidacion: de(`requisito.${String(k)}.revalidacion`, true),
    };
  };

  return (
    <Stack spacing={2}>
      <Box>
        {requisitos.length > 0 && (
          <Typography variant="subtitle1" data-resumen-requisitos="">
            {textoDelConteo(contarRequisitos(requisitos), t, true)}
          </Typography>
        )}
        <Typography sx={{ color: 'text.secondary' }}>{requisitos.length === 0 ? t('flujos.editor.requisitos.vacio') : t('flujos.editor.requisitos.ayuda')}</Typography>
      </Box>
      {grupos.map((grupo) => (
        <GrupoDeSector key={grupo.sector} grupo={grupo} onAgregar={alSector(grupo.sector)}>
          {[...grupo.secciones, ...grupo.documentos].map(({ indice, requisito }) => (
            <Box component="li" key={requisito.clave}>
              <FilaDeRequisito
                requisito={requisito}
                onCambiar={(cambio) => cambiar(indice, cambio)}
                tipo={requisito.seccion === null ? tiposDocumento.find((x) => x.id === requisito.tipoDocumentoTenantId) : undefined}
                elegibles={elegibles}
                areasDelFlujo={areasDelFlujo}
                nombreArea={nombreArea}
                atributos={atributos}
                mensajes={mensajesDe(indice, requisito.seccion !== null)}
                soloLectura={soloLectura}
                abierto={abierto === indice}
                sector={grupo.sector}
                conError={conError.includes(indice)}
                onAlternar={() => setAbierto(abierto === indice ? null : indice)}
                onQuitar={() => quitar(indice)}
              />
            </Box>
          ))}
        </GrupoDeSector>
      ))}
      {!soloLectura && (
        <Box>
          <MenuAgregarRequisito
            seccionesPedidas={new Set(requisitos.flatMap((r) => (r.seccion ? [r.seccion] : [])))}
            onAgregarDocumento={() => agregar(requisitoNuevo())}
            onAgregarSeccion={(seccion) => agregar(requisitoDeSeccionNuevo(seccion))}
          />
        </Box>
      )}
    </Stack>
  );
}
