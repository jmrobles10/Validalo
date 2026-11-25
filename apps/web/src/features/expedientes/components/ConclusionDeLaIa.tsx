import { Box, Button, Stack, Typography } from '@mui/material';
import type { ConclusionDeRevisionDto, RequisitoExpedienteDto } from '@validalo/api-client';
import { LOCALE } from '@validalo/ui';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { puedeAprobarDesdeLaConclusion, rolDeLaIa, vistaDeLaConclusion, type RolDeLaIa, type VistaDeLaConclusion } from '../conclusionDeRevision';
import type { QuienDecideElRequisito } from '../requisitos';
import { IconoDelResumen } from './IconoDelResumen';

export interface ConclusionDeLaIaProps {
  conclusion: ConclusionDeRevisionDto;
  requisito: Pick<RequisitoExpedienteDto, 'estado' | 'tipoDocumento'>;
  /** Quién decide el requisito: si quien mira puede hacerlo ahora (y en qué área) y qué otras áreas aún no lo deciden. */
  decide: QuienDecideElRequisito;
  /** Abre «Aprobar u observar» del área de quien mira: la misma acción del botón del área. Sin él no hay botón. */
  onAprobar?: (area: NonNullable<QuienDecideElRequisito['puede']>) => void;
}

/**
 * Lo primero del bloque «Revisión automática»: qué concluye la IA del documento, con ícono y color de estado, y lo que se hace con eso. La regla (aprobar, revisar con sus
 * motivos o sin análisis) la calcula el servidor con el mismo motor de la revisión automática, en cualquier nivel de la empresa; aquí solo se dice:
 *
 * - «Se sugiere aprobar» con lo que la IA verificó (legible, del tipo pedido, lo que dice coincide con lo declarado —con la persona declarada, en la cédula de una persona
 *   relacionada—, antigüedad dentro del máximo) y, si quien mira puede decidir ahora en su área, el botón «Aprobar» de esa área (el mismo diálogo del botón del área).
 * - «Revisa antes de aprobar» con los motivos concretos que manda el servidor.
 * - «Sin análisis de la IA»: no pudo analizarlo; se revisa a mano.
 *
 * Debajo, en una línea, el rol de la IA: es una sugerencia y decide una persona (quién), salvo el nivel Automático, que tiene su propio flujo.
 */
export function ConclusionDeLaIa({ conclusion, requisito, decide, onAprobar }: ConclusionDeLaIaProps) {
  const { t } = useTranslation();
  const vista = vistaDeLaConclusion(conclusion, requisito);
  const rol = rolDeLaIa(vista, decide);
  const aprobar = puedeAprobarDesdeLaConclusion(vista, decide) && onAprobar && decide.puede ? decide.puede : null;

  return (
    <Box
      component="section"
      aria-label={t('ia.conclusion.titulo')}
      data-conclusion={vista.sugerencia}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'auto minmax(0, 1fr)', sm: 'auto minmax(0, 1fr) auto' },
        columnGap: 1.25,
        rowGap: 1,
        alignItems: 'start',
        p: 1.5,
        // Fondo blanco (el del papel, también en oscuro) para que resalte sobre el bloque de la revisión; el borde dice lo que sugiere la IA.
        border: 1,
        borderColor: `estado.${vista.tono}.borde`,
        bgcolor: 'background.paper',
        borderRadius: (th) => `${String(th.radio.sm)}px`,
      }}
    >
      <Box sx={{ pt: 0.25, display: 'flex' }}>
        <IconoDelResumen tono={vista.tono} />
      </Box>
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" component="p" sx={{ color: `estado.${vista.tono}.texto` }}>
          {tituloDe(vista, t)}
        </Typography>
        <Cuerpo vista={vista} />
        {rol && (
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }} data-rol-de-la-ia={rol.tipo}>
            {textoDelRol(rol, t)}
          </Typography>
        )}
      </Stack>
      {aprobar && (
        <Box sx={{ gridColumn: { xs: 2, sm: 'auto' }, alignSelf: 'center', justifySelf: 'start' }}>
          <Button
            size="small"
            variant="contained"
            onClick={() => onAprobar?.(aprobar)}
            aria-label={t('ia.conclusion.aprobarAccesible', { documento: requisito.tipoDocumento.nombre, area: aprobar.nombre })}
          >
            {t('ia.conclusion.aprobarAccion')}
          </Button>
        </Box>
      )}
    </Box>
  );
}

function tituloDe(vista: VistaDeLaConclusion, t: TFunction): string {
  switch (vista.sugerencia) {
    case 'Aprobar':
      return vista.abierta ? t('ia.conclusion.aprobar') : t('ia.conclusion.aprobarCerrado');
    case 'Revisar':
      return vista.abierta ? t('ia.conclusion.revisar') : t('ia.conclusion.revisarCerrado');
    case 'SinAnalisis':
      return t('ia.conclusion.sinAnalisis');
  }
}

function Cuerpo({ vista }: { vista: VistaDeLaConclusion }) {
  const { t } = useTranslation();
  if (vista.sugerencia === 'SinAnalisis') return <Typography variant="body2">{t('ia.conclusion.sinAnalisisTexto')}</Typography>;
  if (vista.sugerencia === 'Revisar') {
    // Un solo motivo va como un párrafo (sin viñeta); con varios, uno por línea.
    const varios = vista.motivos.length > 1;
    return (
      <Box component="ul" sx={{ m: 0, pl: varios ? 2.5 : 0, listStyle: varios ? 'disc' : 'none' }} aria-label={t('ia.conclusion.motivos')}>
        {vista.motivos.map((motivo) => (
          <Typography key={motivo} component="li" variant="body2">
            {motivo}
          </Typography>
        ))}
      </Box>
    );
  }
  return (
    <>
      <Typography variant="body2">{t('ia.conclusion.verificado', { puntos: new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' }).format(puntosDe(vista, t)) })}</Typography>
      {vista.diferencias.length > 0 && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }} data-diferencias="">
          {t('ia.conclusion.diferencias', { count: vista.diferencias.length, campos: vista.diferencias.map((d) => textoDeLaDiferencia(d, t)).join('; ') })}
        </Typography>
      )}
      {vista.sinVerificar.length > 0 && (
        <Typography variant="body2" sx={{ color: 'estado.advertencia.texto' }} data-sin-verificar="">
          {t('ia.conclusion.sinVerificar', { campos: new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' }).format(vista.sinVerificar.map(enMinuscula)) })}
        </Typography>
      )}
    </>
  );
}

/** «Actividades económicas secundarias (declaró —; el documento trae 8129, 4330, 4799)»: el campo, lo declarado y lo que trae el documento. */
function textoDeLaDiferencia(diferencia: VistaDeLaConclusion['diferencias'][number], t: TFunction): string {
  const declaradoTexto = (diferencia.declarado ?? '').trim();
  const declarado = declaradoTexto.length > 0 ? declaradoTexto : t('ia.conclusion.sinValor');
  return diferencia.extraido?.trim()
    ? t('ia.conclusion.diferencia', { etiqueta: diferencia.etiqueta, declarado, extraido: diferencia.extraido.trim() })
    : t('ia.conclusion.diferenciaSinLeer', { etiqueta: diferencia.etiqueta, declarado });
}

/** Las frases de lo que se verificó, en el orden en que se dicen («es legible», «es del tipo pedido», «lo que dice coincide con lo que declaró el tercero»…). */
function puntosDe(vista: VistaDeLaConclusion, t: TFunction): string[] {
  return vista.verificado.map((punto) => {
    if (punto !== 'persona') return t(`ia.conclusion.puntos.${punto}`);
    const persona = vista.persona;
    if (!persona) return t('ia.conclusion.puntos.cruce');
    return persona.identificacion
      ? t('ia.conclusion.puntos.persona', { nombre: persona.nombre, identificacion: persona.identificacion })
      : t('ia.conclusion.puntos.personaSinIdentificacion', { nombre: persona.nombre });
  });
}

function textoDelRol(rol: RolDeLaIa, t: TFunction): string {
  switch (rol.tipo) {
    case 'automatico':
      return t('ia.conclusion.rol.automatico');
    case 'puedes':
      return t('ia.conclusion.rol.puedes', { area: rol.area });
    case 'decide':
      return t('ia.conclusion.rol.decide', { areas: new Intl.ListFormat(LOCALE, { style: 'long', type: 'conjunction' }).format(rol.areas) });
    case 'sinAreas':
      return t('ia.conclusion.rol.sinAreas');
  }
}

/** «Identificación del titular» → «identificación del titular»; una sigla («NIT») se deja como está. */
const enMinuscula = (etiqueta: string) => (/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(etiqueta) ? etiqueta.charAt(0).toLocaleLowerCase(LOCALE) + etiqueta.slice(1) : etiqueta);
