import { Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { BloqueDeGrupo, ListaDeFilas, Rejilla } from './BloquesDeDatos';
import { DeclaracionPep } from './DeclaracionPep';
import type { DescargaDeclaracionPep } from './descargaDeclaracionPep';
import { declaracionActiva, esListaDeObjetos, esObjeto, etiquetaCampo, SIN_DATO, tieneValor } from './formato';
import { ordenarPares, ordenDeLaSeccion } from './ordenDeCampos';
import { agruparPersonas, faltantesPorFila } from './personas';
import { TarjetaDePersona } from './TarjetaDePersona';

/**
 * Los datos de una sección en solo lectura, en el orden del esquema (el que el tercero los llena, no el de la base de datos): valores simples en la rejilla; grupos
 * (dirección por partes, resoluciones, moneda extranjera) y filas (ICA) en bloques con su título; las personas relacionadas, una tarjeta por persona. La declaración jurada
 * PEP de una persona con «Sí» en PEP va dentro de su tarjeta, con su PDF (HU 49093): con `empresaId`, `terceroId` y `seccion` se puede descargar (`version`: la que se
 * está viendo; sin ella, la vigente).
 */
export function DatosDeSeccion({ datos, empresaId, terceroId, seccion, version = null, faltantes = [] }: Props) {
  const { t } = useTranslation();
  const descarga: DescargaDeclaracionPep | null = empresaId && terceroId && seccion ? { empresaId, terceroId, seccion, version } : null;
  const declaracionDelTercero = declaracionActiva(datos);
  const orden = ordenDeLaSeccion(seccion);
  // «Todo lo llenado»: lo vacío se omite; lo obligatorio que falta (los campos de primer nivel que la API marca en `faltantes`) sale como «Sin dato».
  const sinDato: [string, unknown][] = faltantes.filter((c): c is string => typeof c === 'string' && /^[a-z_]+$/.test(c) && !tieneValor(datos[c])).map((c) => [c, SIN_DATO]);
  const entradas = ordenarPares(
    [...Object.entries(datos).filter(([clave, v]) => clave !== 'declaracion_pep' && tieneValor(v)), ...sinDato],
    orden,
  );
  const simples = entradas.filter(([, v]) => v === SIN_DATO || (!esObjeto(v) && !esListaDeObjetos(v)));
  const grupos = entradas.filter(([, v]) => esObjeto(v));
  const filas = entradas.filter(([, v]) => esListaDeObjetos(v));

  if (entradas.length === 0 && !declaracionDelTercero) {
    return (
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('fichaMaestra.sinDatos')}
      </Typography>
    );
  }

  return (
    <Stack spacing={1.5}>
      {simples.length > 0 && <Rejilla datos={Object.fromEntries(simples)} />}
      {declaracionDelTercero && <DeclaracionPep declaracion={declaracionDelTercero} indice={null} descarga={descarga} />}
      {grupos.map(([clave, valor]) => (
        <BloqueDeGrupo key={clave} clave={clave} valor={esObjeto(valor) ? valor : {}} />
      ))}
      {filas.map(([clave, valor]) => {
        const lista = esListaDeObjetos(valor) ? valor : [];
        return clave === 'personas' ? (
          <PersonasRelacionadas key={clave} filas={lista} descarga={descarga} faltantes={faltantesPorFila(faltantes)} />
        ) : (
          <ListaDeFilas key={clave} clave={clave} filas={lista} />
        );
      })}
    </Stack>
  );
}

interface Props {
  datos: Record<string, unknown>;
  empresaId?: string;
  terceroId?: string;
  /** Código de la sección (`FICHA_LEGAL`): da el orden de los datos y, con el tercero, el PDF de la declaración PEP. */
  seccion?: string;
  version?: number | null;
  /** Las rutas de lo que la API dice que falta (`razon_social`, `personas[0].pep`): lo obligatorio vacío sale como «Sin dato». */
  faltantes?: readonly (string | null | undefined)[];
}

/** Las personas relacionadas: una tarjeta por persona (las filas de la misma identificación, juntas), con cuántas son. */
function PersonasRelacionadas({ filas, descarga, faltantes }: { filas: Record<string, unknown>[]; descarga: DescargaDeclaracionPep | null; faltantes: ReadonlyMap<number, ReadonlySet<string>> }) {
  const { t } = useTranslation();
  const personas = agruparPersonas(filas);
  const titulo = etiquetaCampo('personas', t);
  return (
    <Stack component="section" aria-label={titulo} spacing={1}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" component="h5">
          {titulo}
        </Typography>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {t('fichaMaestra.persona.cuantas', { count: personas.length })}
        </Typography>
      </Stack>
      <Stack component="ul" spacing={1} sx={{ p: 0, m: 0, listStyle: 'none' }}>
        {personas.map((persona) => (
          <TarjetaDePersona key={persona.filas.map((f) => f.indice).join('-')} persona={persona} descarga={descarga} faltantes={faltantes} />
        ))}
      </Stack>
    </Stack>
  );
}
