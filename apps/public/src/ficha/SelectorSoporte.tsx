import { Alert, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel, Skeleton, Typography } from '@mui/material';
import type { DocumentoBovedaDto, SoporteSeccionDto } from '@validalo/api-client';
import { formatearFecha, SeccionPlana, visualmenteOculto } from '@validalo/ui';
import { FileCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { VersionSubida } from '../boveda/subida';
import { useBoveda } from '../shared/api';
import { documentosDeSoporte, type DefinicionSeccion, type DocumentosParaSubir, type DocumentoDeSoporte } from './secciones';
import { SubirSoporte } from './SubirSoporte';

interface Props {
  definicion: DefinicionSeccion;
  soportes: readonly SoporteSeccionDto[];
  /** Soportes de la versión guardada que el tercero retiró de su bóveda (RT-4): no se pueden elegir ni se reenvían. */
  retirados?: readonly SoporteSeccionDto[];
  onCambiar: (soportes: SoporteSeccionDto[]) => void;
  /** Los documentos que se pueden elegir al subir un soporte de esta sección (`documentosParaSubir`); «Otro documento» va siempre. */
  subibles: DocumentosParaSubir['natural'];
  /** Un documento terminó de subirse con «Subir un soporte»: la sección lo marca como soporte y, si se lee, espera su lectura. */
  onSubido: (subida: VersionSubida, tipo: DocumentoDeSoporte) => void;
  /** «Falta el soporte del cambio» (FM-20), tal como lo devolvió el servidor. */
  faltaSoporte: string | null;
  /** Error 422 del soporte (`soporte-invalido`, `soporte-tipo-invalido`…). */
  error: string | null;
  deshabilitado: boolean;
}

interface OpcionSoporte {
  soporte: SoporteSeccionDto;
  etiqueta: string;
}

const mismo = (a: SoporteSeccionDto, b: SoporteSeccionDto) => a.documentoId === b.documentoId && a.version === b.version;

/**
 * «Documento que respalda esta información»: los documentos globales de la bóveda del tercero de los tipos que admite la
 * sección (FM-20), en su versión vigente, más los soportes que ya tenía la versión guardada. «Subir un soporte» pregunta qué documento es y abre el diálogo
 * de subida con ese tipo (FD-10): no saca al tercero de la sección, así que sus cambios sin guardar siguen ahí, y lo que sube queda marcado.
 */
export function SelectorSoporte({ definicion, soportes, retirados = [], onCambiar, subibles, onSubido, faltaSoporte, error, deshabilitado }: Props) {
  const { t } = useTranslation();
  const boveda = useBoveda();
  const documentos = boveda.data?.documentos ?? [];
  const tipoDe = (documentoId: string) => documentos.find((d) => d.id === documentoId)?.tipo.nombre ?? null;

  const vigentes: OpcionSoporte[] = documentosDeSoporte(documentos, definicion).flatMap((d: DocumentoBovedaDto) =>
    d.versionActual
      ? [{ soporte: { documentoId: d.id, version: d.versionActual.n }, etiqueta: t('ficha.soporte.opcion', { tipo: d.tipo.nombre, n: String(d.versionActual.n), fecha: formatearFecha(d.versionActual.cargadaEn) }) }]
      : [],
  );
  // Un soporte guardado que ya no es la versión vigente (o de un documento que no aparece) sigue elegible.
  const anteriores: OpcionSoporte[] = soportes
    .filter((s) => !vigentes.some((o) => mismo(o.soporte, s)))
    .map((s) => {
      const tipo = tipoDe(s.documentoId);
      return { soporte: s, etiqueta: tipo ? t('ficha.soporte.anterior', { tipo, n: String(s.version) }) : t('ficha.soporte.otroDocumento', { n: String(s.version) }) };
    });
  const opciones = [...vigentes, ...anteriores];

  const alternar = (opcion: OpcionSoporte, marcado: boolean) =>
    onCambiar(marcado ? [...soportes, opcion.soporte] : soportes.filter((s) => !mismo(s, opcion.soporte)));

  const mensaje = error ?? faltaSoporte;

  return (
    <SeccionPlana titulo={t('ficha.soporte.titulo')} ayuda={definicion.soportes === null ? t('ficha.soporte.ayudaOpcional') : t('ficha.soporte.ayuda')} icono={FileCheck}>
      <FormControl component="fieldset" error={Boolean(mensaje)} disabled={deshabilitado} fullWidth>
        <FormLabel component="legend" sx={visualmenteOculto}>
          {t('ficha.soporte.titulo')}
        </FormLabel>
        {retirados.length > 0 && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            {retirados.map((s) => (
              <Typography key={`${s.documentoId}-${String(s.version)}`}>
                {t('ficha.soporte.retirado', { tipo: s.nombre ?? s.tipoDocumento ?? '', n: String(s.version) })}
              </Typography>
            ))}
            <Typography>{t('ficha.soporte.retiradoAyuda')}</Typography>
          </Alert>
        )}
        {boveda.isPending ? (
          <Skeleton variant="rounded" height={44} />
        ) : opciones.length === 0 ? (
          <Typography sx={{ color: 'text.secondary', mb: 1 }}>{t('ficha.soporte.ninguno')}</Typography>
        ) : (
          <FormGroup>
            {opciones.map((o) => (
              <FormControlLabel
                key={`${o.soporte.documentoId}-${String(o.soporte.version)}`}
                control={<Checkbox checked={soportes.some((s) => mismo(s, o.soporte))} onChange={(e) => alternar(o, e.target.checked)} />}
                label={o.etiqueta}
                sx={{ minHeight: 32, alignItems: 'center' }}
              />
            ))}
          </FormGroup>
        )}
        {mensaje && (
          <Alert severity={error ? 'error' : 'warning'} sx={{ mt: 1 }}>
            {mensaje}
          </Alert>
        )}
      </FormControl>
      <SubirSoporte documentos={subibles} deshabilitado={deshabilitado} onSubido={onSubido} />
    </SeccionPlana>
  );
}
