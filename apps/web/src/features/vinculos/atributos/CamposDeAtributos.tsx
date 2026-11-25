import { Autocomplete, MenuItem, Stack, TextField } from '@mui/material';
import type { AtributoPermitidoDto } from '@validalo/api-client';
import { CampoFecha } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { etiquetaDeAtributo, valorActual, type ErrorDeAtributo, type ValorDeAtributo, type ValoresDeAtributos } from './modelo';

interface Props {
  atributos: readonly AtributoPermitidoDto[];
  valores: ValoresDeAtributos;
  onCambiar: (clave: string, valor: ValorDeAtributo) => void;
  /** El error de cada atributo (ya filtrado por lo que la persona tocó); el texto de la API, si lo hay, va en `deLaApi`. */
  errores: Readonly<Record<string, ErrorDeAtributo | undefined>>;
  deLaApi?: Readonly<Record<string, string | undefined>>;
  deshabilitado?: boolean;
}

/**
 * El formulario de los atributos del vínculo, generado desde los atributos permitidos de su tipo de vínculo: un control por tipo (texto, número, fecha, sí/no, una opción o
 * varias), con los obligatorios marcados y la etiqueta legible del atributo (`etiquetaDeAtributo`: su código no se muestra tal cual). Lo usan «Invitar tercero» y el diálogo de editar los atributos de un vínculo.
 */
export function CamposDeAtributos({ atributos, valores, onCambiar, errores, deLaApi = {}, deshabilitado = false }: Props) {
  const { t } = useTranslation();

  return (
    <Stack spacing={2}>
      {atributos.map((a) => {
        const valor = valorActual(a, valores);
        const etiqueta = etiquetaDeAtributo(a.clave);
        const error = errores[a.clave];
        const mensaje = deLaApi[a.clave] ?? (error ? t(`atributosVinculo.errores.${error}`) : undefined);
        const comunes = { size: 'small', required: a.obligatorio, label: etiqueta, error: mensaje !== undefined, disabled: deshabilitado } as const;

        if (a.tipo === 'ListaOpciones') {
          return (
            <Autocomplete<string, true>
              key={a.clave}
              multiple
              disableCloseOnSelect
              size="small"
              options={a.opciones ?? []}
              value={Array.isArray(valor) ? valor : []}
              onChange={(_, elegidas) => onCambiar(a.clave, elegidas)}
              disabled={deshabilitado}
              renderInput={(parametros) => <TextField {...parametros} required={a.obligatorio} label={etiqueta} error={mensaje !== undefined} helperText={mensaje ?? t('atributosVinculo.listaAyuda')} />}
            />
          );
        }

        if (a.tipo === 'Opcion' || a.tipo === 'Booleano') {
          const opciones = a.tipo === 'Booleano' ? ['true', 'false'] : (a.opciones ?? []);
          return (
            <TextField
              key={a.clave}
              {...comunes}
              select
              value={typeof valor === 'string' && opciones.includes(valor) ? valor : ''}
              onChange={(ev) => onCambiar(a.clave, ev.target.value)}
              helperText={mensaje}
              slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            >
              {!a.obligatorio && <MenuItem value="">{t('atributosVinculo.sinDefinir')}</MenuItem>}
              {opciones.map((o) => (
                <MenuItem key={o} value={o}>
                  {a.tipo === 'Booleano' ? t(`atributosVinculo.${o === 'true' ? 'si' : 'no'}`) : o}
                </MenuItem>
              ))}
            </TextField>
          );
        }

        if (a.tipo === 'Fecha') {
          return (
            <CampoFecha
              key={a.clave}
              etiqueta={etiqueta}
              valor={typeof valor === 'string' ? valor : ''}
              onCambiar={(iso) => onCambiar(a.clave, iso)}
              requerido={a.obligatorio}
              deshabilitado={deshabilitado}
              error={mensaje !== undefined}
              ayuda={mensaje}
              fullWidth
            />
          );
        }

        return (
          <TextField
            key={a.clave}
            {...comunes}
            value={typeof valor === 'string' ? valor : ''}
            onChange={(ev) => onCambiar(a.clave, ev.target.value)}
            helperText={mensaje ?? (a.tipo === 'Numero' ? t('atributosVinculo.numeroAyuda') : undefined)}
            slotProps={{ htmlInput: { inputMode: a.tipo === 'Numero' ? 'decimal' : undefined, autoComplete: 'off' } }}
          />
        );
      })}
    </Stack>
  );
}
