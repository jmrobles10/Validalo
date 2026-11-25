import { Box, Chip, Stack, Typography } from '@mui/material';
import { ChipEstado, Dato, RejillaDatos } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { Bloque } from './BloquesDeDatos';
import { DeclaracionPep } from './DeclaracionPep';
import type { DescargaDeclaracionPep } from './descargaDeclaracionPep';
import { etiquetaCampo, formatearValor } from './formato';
import { resumirPersona, type DatoDePersona, type PersonaAgrupada } from './personas';

interface Props {
  persona: PersonaAgrupada;
  /** Sin esto no se ofrece el PDF de la declaración PEP (la pantalla no sabe de qué tercero ni versión es). */
  descarga: DescargaDeclaracionPep | null;
  /** Los campos que la API marca como faltantes de cada fila (por su posición en `personas`): salen como «Sin dato». */
  faltantes?: ReadonlyMap<number, ReadonlySet<string>>;
}

/**
 * Una persona relacionada, en una tarjeta (una por identificación, aunque la ficha guarde una fila por rol): arriba, compacto, el nombre con su documento en mono y sus roles
 * como chips; debajo, en una rejilla de tres columnas y en el orden del formulario del portal, TODO lo que el tercero llenó (los vacíos se omiten y lo obligatorio que falta
 * dice «Sin dato» en tono de advertencia). Con dos roles, lo propio de cada uno (tipo de representación, cargo, participación) lleva el nombre de su rol. Si es PEP, su
 * declaración jurada con un solo «Descargar PDF».
 */
export function TarjetaDePersona({ persona, descarga, faltantes }: Props) {
  const { t } = useTranslation();
  const resumen = resumirPersona(persona, faltantes);
  const nombre = resumen.nombre || t('fichaMaestra.persona.sinNombre');
  const nombreDelRol = (rol: string) => formatearValor('rol', rol, t);
  const conVariosRoles = resumen.roles.length > 1;

  const etiqueta = (dato: DatoDePersona) => (conVariosRoles && dato.rol ? `${etiquetaCampo(dato.clave, t)} · ${nombreDelRol(dato.rol)}` : etiquetaCampo(dato.clave, t));
  const valor = (dato: DatoDePersona) => {
    if (dato.sinDato) {
      return (
        <Typography component="span" variant="body2" sx={{ color: 'estado.advertencia.texto' }}>
          {t('fichaMaestra.sinDato')}
        </Typography>
      );
    }
    // «Sí» en PEP o vínculo con PEP se destaca en advertencia; «No» es un dato normal.
    if ((dato.clave === 'pep' || dato.clave === 'vinculo_pep') && dato.valor === true) return <ChipEstado estado="Observado" etiqueta={t('fichaMaestra.si')} />;
    return formatearValor(dato.clave, dato.valor, t);
  };

  return (
    <Bloque component="li" aria-label={[nombre, ...resumen.roles.map((r) => nombreDelRol(r.rol))].join(' · ')}>
      <Stack spacing={1.5}>
        <Stack direction="row" useFlexGap sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2, rowGap: 0.75 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" component="p">
              {nombre}
            </Typography>
            {resumen.identificacion && (
              <Typography variant="monoTabla" component="p" sx={{ color: 'text.secondary' }}>
                {resumen.identificacion}
              </Typography>
            )}
          </Box>
          {resumen.roles.length > 0 && (
            <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {resumen.roles.map((r) => (
                <Chip key={r.rol} size="small" variant="outlined" label={nombreDelRol(r.rol)} />
              ))}
            </Stack>
          )}
        </Stack>
        {resumen.datos.length > 0 && (
          <RejillaDatos columnas={3}>
            {resumen.datos.map((dato) => (
              <Dato key={`${dato.clave}-${dato.rol ?? ''}`} etiqueta={etiqueta(dato)}>
                {valor(dato)}
              </Dato>
            ))}
          </RejillaDatos>
        )}
        {resumen.declaracion && <DeclaracionPep declaracion={resumen.declaracion.datos} indice={resumen.declaracion.indice} descarga={descarga} />}
      </Stack>
    </Bloque>
  );
}
