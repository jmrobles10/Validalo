import { Box, FormControl, FormControlLabel, FormHelperText, FormLabel, Radio, RadioGroup, TextField, Typography } from '@mui/material';
import { CampoFecha } from '@validalo/ui';
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { escribirCifra, leerCifra } from './cifras';

/** Vacío ⇒ `null` (sin diligenciar); el servidor recorta y normaliza el resto. */
const textoONulo = (valor: string) => (valor.trim() === '' ? null : valor);

interface PropsCampoTexto {
  etiqueta: string;
  valor: string | null | undefined;
  onCambiar: (valor: string | null) => void;
  mensaje?: string | null;
  ayuda?: string;
  tipo?: 'text' | 'email' | 'tel' | 'url';
  inputMode?: 'text' | 'numeric' | 'email' | 'tel' | 'url';
  autoComplete?: string;
  maxLength?: number;
  deshabilitado?: boolean;
  /** Lo marca con el asterisco del tema. */
  requerido?: boolean;
  onBlur?: () => void;
}

/** Campo de texto a todo el ancho; el mensaje del servidor (faltante o error) va en su ayuda. */
export function CampoTexto({ etiqueta, valor, onCambiar, mensaje, ayuda, tipo = 'text', inputMode, autoComplete = 'off', maxLength = 300, deshabilitado = false, requerido = false, onBlur }: PropsCampoTexto) {
  return (
    <TextField
      label={etiqueta}
      value={valor ?? ''}
      onChange={(e) => onCambiar(textoONulo(e.target.value))}
      type={tipo}
      error={Boolean(mensaje)}
      helperText={mensaje ?? ayuda}
      disabled={deshabilitado}
      required={requerido}
      onBlur={onBlur}
      fullWidth
      slotProps={{ htmlInput: { inputMode, autoComplete, maxLength } }}
    />
  );
}

interface PropsCampoFechaFicha {
  etiqueta: string;
  /** Fecha ISO `aaaa-mm-dd`. */
  valor: string | null | undefined;
  onCambiar: (valor: string | null) => void;
  mensaje?: string | null;
  ayuda?: string;
  deshabilitado?: boolean;
  /** Última fecha elegible (ISO), p. ej. hoy en una fecha que no puede ser futura. */
  maximo?: string;
  requerido?: boolean;
  onBlur?: () => void;
}

/** Fecha con el selector de la aplicación (`dd/mm/aaaa` y calendario); sin fecha es `null`, como en `CampoTexto`. */
export function CampoFechaFicha({ etiqueta, valor, onCambiar, mensaje, ayuda, deshabilitado = false, maximo, requerido = false, onBlur }: PropsCampoFechaFicha) {
  return (
    <CampoFecha etiqueta={etiqueta} valor={valor} onCambiar={(iso) => onCambiar(iso === '' ? null : iso)} error={Boolean(mensaje)} ayuda={mensaje ?? ayuda} deshabilitado={deshabilitado} maximo={maximo} requerido={requerido} onBlur={onBlur} fullWidth />
  );
}

interface PropsCampoCifra {
  etiqueta: string;
  valor: number | null | undefined;
  onCambiar: (valor: number | null) => void;
  mensaje?: string | null;
  ayuda?: string;
  entero?: boolean;
  deshabilitado?: boolean;
  requerido?: boolean;
  onBlur?: () => void;
}

/**
 * Cifra escrita como en Colombia (puntos de miles, coma decimal). Guarda el texto mientras se escribe y entrega el
 * número; lo ilegible queda vacío para el servidor y se avisa en el campo.
 */
export function CampoCifra({ etiqueta, valor, onCambiar, mensaje, ayuda, entero = false, deshabilitado = false, requerido = false, onBlur }: PropsCampoCifra) {
  const { t } = useTranslation();
  const [texto, setTexto] = useState(() => (entero && valor !== null && valor !== undefined ? String(valor) : escribirCifra(valor)));
  const leido = leerCifra(texto);
  const invalido = leido === undefined || (entero && leido !== null && !Number.isInteger(leido));
  return (
    <TextField
      label={etiqueta}
      value={texto}
      onChange={(e) => {
        setTexto(e.target.value);
        const numero = leerCifra(e.target.value);
        onCambiar(numero === undefined || (entero && numero !== null && !Number.isInteger(numero)) ? null : numero);
      }}
      error={invalido || Boolean(mensaje)}
      helperText={invalido ? t('ficha.numeroInvalido') : (mensaje ?? ayuda)}
      disabled={deshabilitado}
      required={requerido}
      onBlur={onBlur}
      fullWidth
      slotProps={{ htmlInput: { inputMode: entero ? 'numeric' : 'decimal', autoComplete: 'off', maxLength: 30 } }}
    />
  );
}

interface PropsCampoSiNo {
  etiqueta: string;
  valor: boolean | null | undefined;
  onCambiar: (valor: boolean) => void;
  mensaje?: string | null;
  deshabilitado?: boolean;
  /** Pregunta y opciones en la misma fila (desde tableta), para listas de preguntas como SST. */
  enLinea?: boolean;
  /** La marca con el asterisco del tema. */
  requerido?: boolean;
}

/** Pregunta sí/no compacta, con la pregunta y las opciones en la misma fila (desde tableta); sin responder es `null` (un «No» sí es respuesta). */
export function CampoSiNo({ etiqueta, valor, onCambiar, mensaje, deshabilitado = false, enLinea = true, requerido = false }: PropsCampoSiNo) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <FormControl
      error={Boolean(mensaje)}
      disabled={deshabilitado}
      required={requerido}
      sx={enLinea ? { display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) auto' }, columnGap: 3, alignItems: 'center' } : undefined}
    >
      <FormLabel id={`${id}-etiqueta`} sx={enLinea ? { typography: 'body2', color: 'text.primary' } : undefined}>
        {etiqueta}
      </FormLabel>
      <RadioGroup
        row
        aria-labelledby={`${id}-etiqueta`}
        value={valor === null || valor === undefined ? '' : String(valor)}
        onChange={(e) => onCambiar(e.target.value === 'true')}
      >
        <FormControlLabel value="true" control={<Radio />} label={t('ficha.si')} sx={{ minHeight: 32, mr: 2 }} />
        <FormControlLabel value="false" control={<Radio />} label={t('ficha.no')} sx={{ minHeight: 32 }} />
      </RadioGroup>
      {mensaje && <FormHelperText sx={enLinea ? { gridColumn: '1 / -1', mx: 0 } : undefined}>{mensaje}</FormHelperText>}
    </FormControl>
  );
}

/** Campos apilados en el celular y en dos columnas desde tableta. */
export function Rejilla({ children }: { children: ReactNode }) {
  return <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{children}</Box>;
}

/** Subtítulo de un grupo de campos dentro de la sección. */
export function Subtitulo({ children, ayuda }: { children: ReactNode; ayuda?: ReactNode }) {
  return (
    <Box>
      <Typography variant="h6" component="h2">
        {children}
      </Typography>
      {ayuda && <Typography sx={{ color: 'text.secondary', mt: 0.25 }}>{ayuda}</Typography>}
    </Box>
  );
}
