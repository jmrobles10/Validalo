import { Alert, AlertTitle, Box, Chip, Stack, Tooltip, Typography } from '@mui/material';
import type { HechosDto, HechosIaDto } from '@validalo/api-client';
import { LOCALE } from '@validalo/ui';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { camposExtraidos, confianzaDe, estadoRevision, textoDelAnalisis, tipoNoCoincide, UMBRAL_CONFIANZA } from './revisionIa';
import { CamposIa } from './CamposIa';
import { EncabezadoDeLectura } from './EncabezadoDeLectura';
import { LecturaAlPie } from './LecturaAlPie';
import type { FilaDeDato } from './ListaDeDatos';

/** El tipo canónico que pide el requisito y su nombre, para avisar si el archivo parece ser otro. */
export interface TipoEsperado {
  codigo: string | null;
  nombre: string;
}

export interface RevisionAutomaticaProps {
  hechos: HechosDto | null | undefined;
  tipoEsperado?: TipoEsperado | null;
  /** Cuántos datos extraídos se muestran antes de «Ver n datos más» (sin límite, todos). */
  limite?: number;
  /** Sin el pie «Analizado el … · modelo»: quien aloja el panel lo junta con otras notas en una sola línea (la tarjeta del requisito). */
  sinPie?: boolean;
  /** Hay un cruce con lo declarado que ya cuenta lo importante: los datos leídos quedan tras «Ver lo que leyó la IA» (la confianza, si es legible y el tipo siguen a la vista). */
  plegarCampos?: boolean;
  /**
   * La revisión dentro de un bloque propio (la tarjeta del requisito): el encabezado en una fila con el título y, a la derecha, «Analizado el … · modelo · Confianza 98 %»
   * (la confianza como dato, no como chip), un divisor y el contenido; sin el pie de abajo.
   */
  enBloque?: boolean;
  /** Lo que va primero en el contenido del bloque, antes de lo que leyó la IA (el resumen del cruce, lo importante). */
  resumen?: ReactNode;
  /** La conclusión de la IA (aprobar, revisar o sin análisis): abre el contenido del bloque, antes de sus razones; con ella, lo que leyó la IA queda plegado como detalle. */
  conclusion?: ReactNode;
  /** Lo que va en la zona de detalles del pie del bloque (lo que respalda el documento, `PieDelRequisito`), junto a «Legible · Tipo detectado» y «Ver lo que leyó la IA». */
  pie?: ReactNode;
  /** El umbral de confianza con el que concluyó la IA (el de la empresa o, en Manual, el del plan): bajo él la confianza se pinta en advertencia. Sin él, el 0,85 por omisión. */
  umbral?: number;
}

const PORCENTAJE = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 0 });

/**
 * Panel «Revisión automática» de una versión (ADR-0012, IA-11): confianza, si se escaló a un modelo mayor, alertas de
 * manipulación y, en una sola lista alineada, legibilidad, tipo detectado y los datos extraídos. Sin análisis visible para la
 * empresa (`conIa` falso), una línea discreta que pide revisarla a mano. El modelo solo va en texto pequeño.
 */
export function RevisionAutomatica({ hechos, tipoEsperado, limite, sinPie = false, plegarCampos = false, enBloque = false, resumen, conclusion, pie, umbral }: RevisionAutomaticaProps) {
  const { t } = useTranslation();
  const estado = estadoRevision(hechos);
  if (estado === 'nada' || !hechos) return null;
  if (estado === 'sinAnalisis' || !hechos.ia) {
    return (
      <Typography component="p" variant="caption" sx={{ color: 'text.secondary' }}>
        {t('ia.revision.sinAnalisis')}
      </Typography>
    );
  }
  return (
    <ConAnalisis ia={hechos.ia} tipoEsperado={tipoEsperado} limite={limite} sinPie={sinPie} plegarCampos={plegarCampos} enBloque={enBloque} resumen={resumen} conclusion={conclusion} pie={pie} umbral={umbral} />
  );
}

interface ConAnalisisProps extends Required<Pick<RevisionAutomaticaProps, 'sinPie' | 'plegarCampos' | 'enBloque'>>, Pick<RevisionAutomaticaProps, 'tipoEsperado' | 'limite' | 'resumen' | 'conclusion' | 'pie' | 'umbral'> {
  ia: HechosIaDto;
}

function ConAnalisis({ ia, tipoEsperado, limite, sinPie, plegarCampos, enBloque, resumen, conclusion, pie, umbral = UMBRAL_CONFIANZA }: ConAnalisisProps) {
  const { t } = useTranslation();
  const confianza = confianzaDe(ia);
  const alta = confianza !== null && confianza >= umbral;
  const tipos: Readonly<Record<string, string>> = t('ia.revision.tipos', { returnObjects: true });
  const nombreTipo = (codigo: string) => tipos[codigo.toUpperCase()] ?? codigo;
  const textos = { nombres: t('ia.revision.nombresCampos', { returnObjects: true }), si: t('ia.revision.si'), no: t('ia.revision.no'), vacio: t('ia.revision.vacio') };
  const campos = camposExtraidos(ia.campos, textos);
  const otroTipo = tipoNoCoincide(ia.tipoDetectado, tipoEsperado?.codigo);
  const recortado = (ia.paginasOmitidas ?? 0) > 0 && ia.paginasEnviadas !== null;
  // Legible y el tipo detectado van en la misma lista que los datos leídos (una sola grilla alineada), y no cuentan para el límite.
  const previas: FilaDeDato[] = [
    { clave: '#legible', etiqueta: t('ia.revision.legible'), valor: ia.legible ? t('ia.revision.legibleSi') : t('ia.revision.legibleNo'), advertencia: !ia.legible },
    { clave: '#tipoDetectado', etiqueta: t('ia.revision.tipoDetectado'), valor: nombreTipo(ia.tipoDetectado) },
  ];

  return (
    <Box component="section" aria-label={t('ia.revision.titulo')}>
      {enBloque ? (
        <EncabezadoDeLectura ia={ia} confianza={confianza} umbral={umbral} />
      ) : (
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.75 }}>
          <Sparkles size={14} strokeWidth={1.75} aria-hidden />
          <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
            {t('ia.revision.titulo')}
          </Typography>
          {confianza !== null && (
            <Tooltip title={t('ia.revision.confianzaAyuda', { umbral: PORCENTAJE.format(umbral) })}>
              <Chip size="small" variant="outlined" color={alta ? 'success' : 'warning'} label={t('ia.revision.confianza', { porcentaje: PORCENTAJE.format(confianza) })} />
            </Tooltip>
          )}
          {ia.escalado && <Chip size="small" variant="outlined" label={t('ia.revision.escalado')} />}
        </Stack>
      )}
      <Stack spacing={1}>
        {conclusion}
        {resumen}
        {otroTipo && tipoEsperado && (
          <Alert severity="warning">{t('ia.revision.tipoNoCoincide', { detectado: nombreTipo(ia.tipoDetectado), esperado: tipoEsperado.nombre })}</Alert>
        )}
        {ia.alertas.length > 0 && (
          <Alert severity="warning">
            <AlertTitle>{t('ia.revision.alertas')}</AlertTitle>
            <Box component="ul" sx={{ m: 0, pl: 2 }}>
              {ia.alertas.map((alerta) => (
                <li key={alerta}>{alerta}</li>
              ))}
            </Box>
          </Alert>
        )}
        {enBloque ? (
          // En el bloque, los detalles de la lectura van al pie, compactos y en gris.
          <LecturaAlPie ia={ia} nombreDelTipo={nombreTipo(ia.tipoDetectado)} campos={campos} limite={limite} pie={pie} recortado={recortado} />
        ) : (
          <>
            <CamposIa campos={campos} titulo={t('ia.revision.campos')} limite={limite} previas={previas} plegados={plegarCampos} />
            {campos.length === 0 && (
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('ia.revision.sinCampos')}
              </Typography>
            )}
            {ia.observaciones && <Typography variant="body2">{t('ia.revision.observaciones', { texto: ia.observaciones })}</Typography>}
            {recortado && (
              <Typography component="p" variant="caption" sx={{ color: 'text.secondary' }}>
                {t('ia.revision.paginasOmitidas', { count: ia.paginasEnviadas ?? 0 })}
              </Typography>
            )}
          </>
        )}
        {!sinPie && !enBloque && (
          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
            {textoDelAnalisis(ia, t)}
          </Typography>
        )}
      </Stack>
    </Box>
  );
}
