/* Valídalo: tema MUI v6 (dirección Registro, rework visual 2026-11). createValidaloTheme(modo, { app, colorEmpresa }). */
import { createTheme, type Theme } from '@mui/material';
import { esES } from '@mui/material/locale';
import type {} from '@mui/x-date-pickers/themeAugmentation';
import { ChevronDown, X } from 'lucide-react';
import { createElement, type CSSProperties } from 'react';
import { BORDE, COLOR, DENSIDAD, FUENTE, MOVIMIENTO, PESO, RADIO, SOMBRA, TIPOGRAFIA, TIPOGRAFIA_MOVIL, type Modo, type TokenColor } from './tokens';
import type { TonoEstado } from './estados';
import { OpcionesEnCarga } from './esqueletos';
import { derivarPaletaEmpresa, type PaletaEmpresa } from './marcaEmpresa';

export type App = 'web' | 'public';

export interface TonoPaleta {
  /** Punto, barra, nodo, ícono suelto (≥ 3:1). */
  solido: string;
  /** Texto e ícono del chip o alerta (≥ 4.5:1, también sobre `fondo`). */
  texto: string;
  fondo: string;
  borde: string;
}

declare module '@mui/material/styles' {
  interface Palette {
    estado: Record<TonoEstado, TonoPaleta>;
    /** `panel`: los paneles flotantes sobre el lienzo (barra lateral y contenido); `nivel1`: las tarjetas dentro del panel. */
    superficie: { panel: string; nivel1: string; nivel2: string; elevada: string };
    borde: { sutil: string; control: string; controlFuerte: string };
    acento: { main: string; tinte: string; borde: string };
    /** Encabezado de las tablas: fondo cian muy claro. */
    tabla: { encabezado: string };
    /** Cuarto acento del tablero (KPI); no es un estado de dominio. */
    violeta: TonoPaleta;
    marca: { azul: string; verde: string; profundo: string; degradado: string; soft: string; texto: string };
    tooltip: { fondo: string; texto: string };
    esqueleto: string;
    scrim: string;
    /** Paleta derivada de la empresa (solo public con color configurado). */
    empresa: PaletaEmpresa | null;
  }
  interface PaletteOptions {
    estado?: Record<TonoEstado, TonoPaleta>;
    superficie?: { panel: string; nivel1: string; nivel2: string; elevada: string };
    borde?: { sutil: string; control: string; controlFuerte: string };
    acento?: { main: string; tinte: string; borde: string };
    tabla?: { encabezado: string };
    violeta?: TonoPaleta;
    marca?: { azul: string; verde: string; profundo: string; degradado: string; soft: string; texto: string };
    tooltip?: { fondo: string; texto: string };
    esqueleto?: string;
    scrim?: string;
    empresa?: PaletaEmpresa | null;
  }
  interface Theme {
    app: App;
    radio: typeof RADIO;
    densidad: typeof DENSIDAD;
    sombra: { menu: string; dialogo: string; suave: string; pildora: string };
  }
  interface ThemeOptions {
    app?: App;
    radio?: typeof RADIO;
    densidad?: typeof DENSIDAD;
    sombra?: { menu: string; dialogo: string; suave: string; pildora: string };
  }
  interface TypographyVariants {
    mono: CSSProperties;
    monoTabla: CSSProperties;
    kpi: CSSProperties;
  }
  interface TypographyVariantsOptions {
    mono?: CSSProperties;
    monoTabla?: CSSProperties;
    kpi?: CSSProperties;
  }
}

declare module '@mui/material/Typography' {
  interface TypographyPropsVariantOverrides {
    mono: true;
    monoTabla: true;
    kpi: true;
  }
}

export interface OpcionesTema {
  /** `web` (revisor/admin, densidad compacta) o `public` (tercero, densidad cómoda). */
  app?: App;
  /** Color de la empresa que pide los documentos (solo public). Se deriva una paleta segura. */
  colorEmpresa?: string | null;
}

const TONOS: readonly TonoEstado[] = ['encurso', 'exito', 'advertencia', 'error', 'info', 'neutro'];
/** public en escritorio (bp-sm): densidad media; por debajo, densidad cómoda táctil. */
const ESCRITORIO = '@media (min-width:600px)';
const MOVIL = '@media (max-width:599.95px)';
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Alto de un campo y relleno de su texto: todos son «small» de MUI (`size="small"` por omisión): 36 px (texto de 13 px y renglón de 20) en las dos apps y en todos los anchos. */
const RELLENO_CAMPO = '8px 12px';

/** Chevron de trazo fino de los desplegables (Select, Autocomplete): 16 px, en el color secundario; MUI lo gira al abrir. */
const chevron = (className?: string) => createElement(ChevronDown, { size: 16, strokeWidth: 1.75, className, 'aria-hidden': true });

/**
 * Textos por omisión de MUI en español (UI-3): `esES` traduce los de todos los componentes (paginador, migas, aviso…); aquí se
 * ajusta lo del autocompletar a la voz de Valídalo («Abrir», no «Abierto») y, mientras busca, muestra un esqueleto de opciones
 * en lugar del texto «Cargando…».
 */
const textosPropios = {
  components: {
    MuiAutocomplete: {
      defaultProps: {
        size: 'small',
        popupIcon: chevron(),
        clearIcon: createElement(X, { size: 14, strokeWidth: 1.75, 'aria-hidden': true }),
        openText: 'Abrir',
        closeText: 'Cerrar',
        clearText: 'Limpiar',
        noOptionsText: 'Sin resultados',
        loadingText: createElement(OpcionesEnCarga),
      },
    },
  },
};

export function createValidaloTheme(modo: Modo = 'light', { app = 'web', colorEmpresa = null }: OpcionesTema = {}): Theme {
  const c = COLOR[modo];
  const s = SOMBRA[modo];
  const web = app === 'web';
  const empresa = !web && colorEmpresa ? derivarPaletaEmpresa(colorEmpresa, modo) : null;

  const tono = (t: TonoEstado): TonoPaleta => {
    const k = `estado${capital(t)}`;
    return { solido: c[k as TokenColor], texto: c[`${k}Texto` as TokenColor], fondo: c[`${k}Fondo` as TokenColor], borde: c[`${k}Borde` as TokenColor] };
  };
  const estado = Object.fromEntries(TONOS.map((t) => [t, tono(t)])) as Record<TonoEstado, TonoPaleta>;

  const primario = empresa ?? null;
  const acento = primario ? primario.enlace : c.acento;
  const acentoTinte = primario ? primario.tinte : c.acentoTinte;
  const acentoBorde = primario ? primario.accion : c.acentoBorde;
  const accion = primario ? primario.accion : c.accionPrimaria;
  const foco = primario ? primario.enlace : c.foco;
  const control = DENSIDAD.controlMedio;
  const radioControl = RADIO.sm;
  const radioMarco = RADIO.md;
  const radioDialogo = RADIO.lg;
  const severidad = { success: 'exito', info: 'info', warning: 'advertencia', error: 'error' } as const;
  /** Colores semánticos de MUI → tono de estado (chips tinteados, como los de estado). */
  const tonoDeColor = { primary: 'encurso', success: 'exito', warning: 'advertencia', error: 'error', info: 'info' } as const;
  const relleno = RELLENO_CAMPO;
  const verticalCampo = '8px';
  /** Una variante de la escala: en el tercero, por debajo de 600 px, sube un píxel (`TIPOGRAFIA_MOVIL`). */
  const variante = <K extends keyof typeof TIPOGRAFIA>(clave: K) =>
    web || !(clave in TIPOGRAFIA_MOVIL) ? TIPOGRAFIA[clave] : { ...TIPOGRAFIA[clave], [MOVIL]: TIPOGRAFIA_MOVIL[clave as keyof typeof TIPOGRAFIA_MOVIL] };
  const body2 = variante('body2');
  const subtitle1 = variante('subtitle1');
  const subtitle2 = variante('subtitle2');
  const caption = variante('caption');
  /** Tamaño del texto de los botones: lo fija cada tamaño porque MUI le da 13 y 15 px a `small` y `large` por su cuenta. */
  const textoBoton = { fontSize: TIPOGRAFIA.boton.fontSize, ...(web ? {} : { [MOVIL]: { fontSize: TIPOGRAFIA_MOVIL.boton.fontSize } }) };
  const textoCampo = { fontSize: TIPOGRAFIA.body2.fontSize, lineHeight: '20px', ...(web ? {} : { [MOVIL]: TIPOGRAFIA_MOVIL.campo }) };
  /** El campo se pinta con el borde y el relleno de la referencia: etiqueta encogida sobre el borde (el «notch» del outlined). */
  const marcoDeCampo = (clase: string) => ({
    borderRadius: radioControl,
    backgroundColor: c.superficieNivel1,
    [`& .${clase}-notchedOutline`]: { borderColor: c.bordeControl, '& legend': { fontSize: '0.857em' } },
    [`&:hover .${clase}-notchedOutline`]: { borderColor: c.bordeControlFuerte },
    [`&.Mui-focused .${clase}-notchedOutline`]: { borderColor: foco, borderWidth: BORDE.anilloFoco },
    [`&.Mui-error .${clase}-notchedOutline`]: { borderColor: c.accionDestructiva },
    // Solo lectura o deshabilitado: relleno gris claro y texto atenuado (la referencia los distingue por el fondo).
    '&.Mui-disabled, &.MuiInputBase-readOnly': { backgroundColor: c.superficieNivel2 },
    [`&.Mui-disabled .${clase}-notchedOutline`]: { borderColor: c.bordeSutil },
    [`&.MuiInputBase-readOnly .${clase}-notchedOutline`]: { borderColor: c.bordeSutil },
  });

  return createTheme({
    app,
    radio: RADIO,
    densidad: DENSIDAD,
    sombra: s,
    spacing: 8,
    shape: { borderRadius: radioControl },
    palette: {
      mode: modo,
      primary: primario
        ? { main: primario.accion, contrastText: primario.textoAccion, light: primario.enlace }
        : { main: c.accionPrimaria, dark: c.accionPrimariaHover, light: c.acento, contrastText: c.textoSobreAccion },
      // error.main = acción destructiva: el blanco pasa 4.5:1 en ambos modos; el texto de error usa estado.error.texto.
      error: { main: c.accionDestructiva, dark: c.estadoErrorTexto, light: c.estadoErrorFondo, contrastText: c.textoSobreAccion },
      success: { main: c.estadoExito, dark: c.estadoExitoTexto, light: c.estadoExitoFondo },
      warning: { main: c.estadoAdvertencia, dark: c.estadoAdvertenciaTexto, light: c.estadoAdvertenciaFondo },
      info: { main: c.estadoInfo, dark: c.estadoInfoTexto, light: c.estadoInfoFondo },
      background: { default: c.fondo, paper: c.superficieNivel1 },
      text: { primary: c.textoPrimario, secondary: c.textoSecundario, disabled: c.textoDeshabilitado },
      divider: c.bordeSutil,
      estado,
      superficie: { panel: c.superficiePanel, nivel1: c.superficieNivel1, nivel2: c.superficieNivel2, elevada: c.superficieElevada },
      borde: { sutil: c.bordeSutil, control: c.bordeControl, controlFuerte: c.bordeControlFuerte },
      acento: { main: acento, tinte: acentoTinte, borde: acentoBorde },
      tabla: { encabezado: c.encabezadoTabla },
      violeta: { solido: c.violeta, texto: c.violetaTexto, fondo: c.violetaFondo, borde: c.violetaBorde },
      marca: { azul: c.marcaAzul, verde: c.marcaVerde, profundo: c.marcaProfundo, degradado: `linear-gradient(135deg, ${c.marcaAzul}, ${c.marcaVerde})`, soft: c.marcaSoft, texto: c.marcaTexto },
      tooltip: { fondo: c.tooltipFondo, texto: c.tooltipTexto },
      esqueleto: c.esqueleto,
      scrim: c.scrim,
      empresa,
    },
    // La escala tipográfica (tamaño y peso) vive en `TIPOGRAFIA` (tokens.ts): las pantallas eligen la variante, no fijan `fontSize` ni `fontWeight`.
    // La base de MUI queda en 14 para no encoger los íconos que MUI dimensiona con `pxToRem` (casillas, chevrones, cerrar).
    typography: {
      fontFamily: FUENTE.sans,
      fontSize: 14,
      h1: TIPOGRAFIA.h1,
      h2: TIPOGRAFIA.h2,
      h3: TIPOGRAFIA.h3,
      h4: TIPOGRAFIA.h4,
      h5: variante('h5'),
      h6: variante('h6'),
      body1: variante('body1'),
      body2,
      subtitle1,
      subtitle2,
      caption,
      button: { ...variante('boton'), textTransform: 'none' },
      overline: { ...variante('overline'), textTransform: 'uppercase' },
      mono: TIPOGRAFIA.mono,
      monoTabla: TIPOGRAFIA.monoTabla,
      kpi: TIPOGRAFIA.monoKpi,
    },
    transitions: {
      duration: { shortest: 120, shorter: 120, short: 200, standard: 200, complex: 320, enteringScreen: 320, leavingScreen: 200 },
      easing: { easeInOut: MOVIMIENTO.curvaEstandar, easeOut: MOVIMIENTO.curvaEstandar, easeIn: MOVIMIENTO.curvaSalida, sharp: MOVIMIENTO.curvaSalida },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: { ...body2, backgroundColor: c.fondo, color: c.textoPrimario, WebkitFontSmoothing: 'antialiased' },
          // Sin salto lateral al pasar de una pantalla con barra de desplazamiento a una sin ella: el espacio de la barra
          // queda reservado siempre (invisible). Los diálogos y menús de MUI bloquean el scroll del documento y le suman
          // al body un `padding-right` del ancho de la barra para que no se corra; con el espacio ya reservado ese
          // relleno correría todo, así que se anula.
          '@supports (scrollbar-gutter: stable)': {
            html: { scrollbarGutter: 'stable' },
            body: { paddingRight: '0 !important' },
          },
          ':focus-visible': { outline: `${BORDE.anilloFoco}px solid ${c.foco}`, outlineOffset: BORDE.separacionFoco },
          '@media (prefers-reduced-motion: reduce)': {
            '*, *::before, *::after': { animationDuration: '1ms !important', transitionProperty: 'opacity !important', transitionDuration: `${MOVIMIENTO.duracionCorta} !important` },
          },
        },
      },
      MuiButtonBase: { defaultProps: { disableRipple: true } },
      // Botones sobrios (UI-2): `medium` por omisión y el mismo alto que el campo de al lado (36 px en web; en el tercero 40 px, y 40 en el
      // celular con el área táctil de 44 completada por un pseudoelemento invisible: el botón no se infla). `small` es para avisos, filas y
      // tarjetas; `large` solo para la acción principal de una pantalla. Primarios rellenos del acento; secundarios (`outlined`) con borde y
      // texto del acento; los de texto, del acento.
      MuiButton: {
        defaultProps: { disableElevation: true, size: 'medium' },
        styleOverrides: {
          root: {
            borderRadius: radioControl,
            gap: 6,
            whiteSpace: 'nowrap',
            '& .MuiButton-startIcon, & .MuiButton-endIcon': { margin: 0 },
            ...(web ? {} : { [MOVIL]: { '&::after': { content: '""', position: 'absolute', left: 0, right: 0, top: '50%', height: DENSIDAD.objetivoTactil, transform: 'translateY(-50%)' } } }),
          },
          // El texto de los tres tamaños es el de la variante `button` (13 px; 15 px en el celular del tercero): aquí solo el alto y el relleno.
          sizeSmall: {
            ...textoBoton,
            ...(web
              ? { minHeight: 30, padding: '4px 10px', lineHeight: '18px' }
              : { minHeight: 32, padding: '5px 12px', [ESCRITORIO]: { minHeight: 30, padding: '4px 12px', lineHeight: '18px' } }),
          },
          sizeMedium: {
            ...textoBoton,
            ...(web ? { minHeight: control, padding: '7px 14px' } : { minHeight: 40, padding: '9px 16px', [ESCRITORIO]: { minHeight: control, padding: '9px 16px' } }),
          },
          sizeLarge: {
            ...textoBoton,
            ...(web
              ? { minHeight: DENSIDAD.controlAmplio, padding: '9px 18px' }
              : { minHeight: DENSIDAD.objetivoTactil, padding: '11px 20px', lineHeight: '22px', [ESCRITORIO]: { minHeight: DENSIDAD.controlAmplio, padding: '9px 16px', lineHeight: '22px' } }),
          },
          outlined: {
            backgroundColor: c.superficieNivel1,
            '&.MuiButton-colorPrimary': { borderColor: acentoBorde, color: acento, '&:hover': { borderColor: acento, backgroundColor: acentoTinte } },
            '&.MuiButton-colorInherit': { borderColor: c.bordeControl, color: c.textoPrimario, '&:hover': { borderColor: c.bordeControlFuerte, backgroundColor: c.superficieNivel2 } },
            '&.MuiButton-colorError': { borderColor: c.estadoErrorBorde, color: c.estadoErrorTexto, '&:hover': { borderColor: c.accionDestructiva, backgroundColor: c.estadoErrorFondo } },
            '&.Mui-disabled': { borderColor: c.bordeSutil, backgroundColor: 'transparent' },
          },
          text: { '&.MuiButton-colorPrimary': { color: acento, '&:hover': { backgroundColor: acentoTinte } } },
          contained: { '&.MuiButton-colorPrimary:hover': { backgroundColor: primario ? primario.accion : c.accionPrimariaHover } },
        },
      },
      MuiIconButton: {
        defaultProps: { size: web ? 'small' : 'large' },
        styleOverrides: {
          root: { borderRadius: RADIO.sm, color: c.textoSecundario, '&:hover': { backgroundColor: c.superficieNivel2, color: c.textoPrimario } },
          sizeSmall: { width: DENSIDAD.controlCompacto, height: DENSIDAD.controlCompacto },
          sizeLarge: { width: DENSIDAD.objetivoTactil, height: DENSIDAD.objetivoTactil, [ESCRITORIO]: { width: control, height: control } },
        },
      },
      MuiTextField: { defaultProps: { size: 'small', slotProps: { inputLabel: { shrink: true } } } },
      MuiFormControl: { defaultProps: { size: 'small' }, styleOverrides: { root: { gap: 0 } } },
      // Rótulo de un grupo de opciones (sí/no, radios): pequeño y gris encima de las opciones.
      MuiFormLabel: {
        styleOverrides: {
          root: { ...subtitle2, color: c.textoSecundario, '&.Mui-focused': { color: c.textoSecundario }, '&.Mui-error': { color: c.estadoErrorTexto }, '&.Mui-disabled': { color: c.textoDeshabilitado } },
          asterisk: { color: c.estadoErrorTexto },
        },
      },
      // Etiqueta pequeña encogida sobre el borde del campo (outlined con label encogido): 11 px, gris; con foco toma el acento.
      MuiInputLabel: {
        styleOverrides: {
          root: {
            ...textoCampo,
            fontWeight: PESO.regular,
            color: c.textoSecundario,
            '&.MuiInputLabel-shrink': { transform: 'translate(14px, -9px) scale(0.857)', maxWidth: 'calc(116% - 28px)' },
            '&.Mui-focused': { color: acento },
            '&.Mui-error': { color: c.estadoErrorTexto },
            '&.Mui-disabled': { color: c.textoDeshabilitado },
          },
          asterisk: { color: c.estadoErrorTexto },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            ...marcoDeCampo('MuiOutlinedInput'),
            '&.MuiInputBase-sizeSmall .MuiInputBase-input': { padding: relleno },
          },
          input: {
            padding: relleno,
            ...textoCampo,
            height: 'auto',
            '&::placeholder': { color: c.textoDeshabilitado, opacity: 1 },
            '&.Mui-disabled': { WebkitTextFillColor: c.textoDeshabilitado, color: c.textoDeshabilitado },
          },
        },
      },
      // Sin los adornos del navegador (UI-7): ni la «x» de limpiar del `type="search"` ni el ojo de Edge en las claves.
      MuiInputBase: {
        styleOverrides: {
          root: { ...textoCampo },
          input: {
            '&[type="search"]::-webkit-search-cancel-button, &[type="search"]::-webkit-search-decoration': { display: 'none', WebkitAppearance: 'none' },
            '&::-ms-reveal, &::-ms-clear': { display: 'none' },
          },
        },
      },
      // Selector de fecha (UI-7, `CampoFecha`): mismo alto, borde, radio y etiqueta sobre el borde que los `TextField`. El calendario va en una
      // tarjeta con el estilo de los menús.
      MuiPickersOutlinedInput: {
        styleOverrides: {
          root: {
            ...marcoDeCampo('MuiPickersOutlinedInput'),
            padding: web ? '0 4px 0 12px' : '0 6px 0 14px',
            '&.Mui-disabled .MuiPickersOutlinedInput-notchedOutline': { borderColor: c.bordeSutil },
          },
          sectionsContainer: {
            '&&': {
              padding: `${verticalCampo} 0`,
              ...textoCampo,
            },
          },
        },
      },
      MuiPickerPopper: {
        styleOverrides: {
          paper: { backgroundColor: c.superficieElevada, backgroundImage: 'none', border: `1px solid ${c.bordeSutil}`, boxShadow: s.menu, borderRadius: radioMarco, marginTop: 4 },
        },
      },
      MuiPickersCalendarHeader: { styleOverrides: { label: { ...subtitle1, textTransform: 'capitalize' } } },
      MuiFormHelperText: {
        styleOverrides: {
          root: { margin: '4px 2px 0', ...caption, lineHeight: '16px', color: c.textoSecundario, '&.Mui-error': { color: c.estadoErrorTexto } },
        },
      },
      // El ícono de abrir queda centrado en el alto del campo (la posición por omisión de MUI: `calc(50% - .5em)`).
      MuiSelect: {
        defaultProps: { size: 'small', IconComponent: (propiedades: { className?: string }) => chevron(propiedades.className) },
        styleOverrides: { icon: { right: 10, fontSize: 16, width: '1em', height: '1em', color: c.textoSecundario }, select: { minHeight: 0 } },
      },
      MuiAutocomplete: {
        styleOverrides: {
          paper: { backgroundColor: c.superficieElevada, border: `1px solid ${c.bordeSutil}`, boxShadow: s.menu, borderRadius: RADIO.sm },
          listbox: { padding: 4, '& .MuiAutocomplete-option': { minHeight: control, borderRadius: RADIO.xs, ...body2, lineHeight: '20px' } },
          tag: { height: 24, borderRadius: RADIO.pill, margin: 2 },
          // MUI 9 ya centra el adorno (`top: 50%` + `translateY(-50%)`): sin tocar `top`, queda dentro del campo y a su altura media.
          endAdornment: { right: 6 },
          popupIndicator: { '&&': { width: 28, height: 28, padding: 0, marginRight: 0, color: c.textoSecundario } },
          clearIndicator: { '&&': { width: 28, height: 28, padding: 0, marginRight: 0, color: c.textoSecundario } },
          // Mismo alto que los demás campos (36 web, 44 public móvil, 40 public escritorio): el relleno lo pone el input,
          // no el contenedor (MUI le suma 9 px arriba y abajo al contenedor, más en size="small").
          inputRoot: {
            paddingTop: 0,
            paddingBottom: 0,
            paddingLeft: 0,
            '&.MuiInputBase-sizeSmall': { paddingTop: 0, paddingBottom: 0, paddingLeft: 0 },
            '& .MuiAutocomplete-input, &.MuiInputBase-sizeSmall .MuiAutocomplete-input': {
              padding: relleno,
            },
          },
        },
      },
      MuiCheckbox: {
        defaultProps: { size: 'small' },
        styleOverrides: { root: { color: c.bordeControlFuerte, padding: 6, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: accion } } },
      },
      MuiRadio: {
        defaultProps: { size: 'small' },
        styleOverrides: { root: { color: c.bordeControlFuerte, padding: 6, '&.Mui-checked': { color: accion } } },
      },
      // Apagado = «no», no «deshabilitado»: pista clara con borde de control y perilla en texto secundario (≥ 3:1 sobre la
      // superficie). Encendido: pista de acción y perilla blanca. Deshabilitado: pista nivel 2 con borde sutil y perilla en
      // texto deshabilitado (apagado) o la pista de acción al 40 % (encendido). Una pista sólida en borde-control se leía
      // como deshabilitada.
      MuiSwitch: {
        defaultProps: { disableRipple: true },
        styleOverrides: {
          root: {
            // La geometría va en la raíz y para todos los tamaños: con size="small" MUI aplica su propio relleno con más
            // especificidad y descentra la perilla. Pista 36 × 20 con borde de 1,5 px; perilla 14 con 3 px por lado.
            '&, &.MuiSwitch-sizeSmall, &.MuiSwitch-sizeMedium': {
              width: 36, height: 20, padding: 0, margin: 6, overflow: 'visible',
              '& .MuiSwitch-switchBase': { top: 0, left: 0, padding: 3, '&.Mui-checked': { transform: 'translateX(16px)' } },
              '& .MuiSwitch-thumb': { width: 14, height: 14 },
            },
          },
          switchBase: {
            color: c.textoSecundario,
            '&.Mui-checked': {
              color: '#FFFFFF',
              '& + .MuiSwitch-track': { backgroundColor: accion, borderColor: accion, opacity: 1 },
            },
            '&.Mui-focusVisible + .MuiSwitch-track': { outline: `${BORDE.anilloFoco}px solid ${c.foco}`, outlineOffset: 2 },
            '&.Mui-disabled': { color: c.textoDeshabilitado, '& + .MuiSwitch-track': { backgroundColor: c.superficieNivel2, borderColor: c.bordeSutil, opacity: 1 } },
            '&.Mui-checked.Mui-disabled': { color: '#FFFFFF', '& + .MuiSwitch-track': { backgroundColor: accion, borderColor: 'transparent', opacity: 0.4 } },
          },
          thumb: { boxShadow: 'none' },
          track: { boxSizing: 'border-box', borderRadius: 10, backgroundColor: c.superficieNivel1, border: `1.5px solid ${c.bordeControlFuerte}`, opacity: 1 },
        },
      },
      MuiFormControlLabel: { styleOverrides: { root: { marginLeft: -6, gap: 4 }, label: { ...body2, lineHeight: '20px' } } },
      MuiTabs: { styleOverrides: { root: { minHeight: web ? 40 : 44 }, indicator: { height: BORDE.grosorIndicador, backgroundColor: acento } } },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none', minWidth: 0, minHeight: web ? 40 : 44, padding: '0 10px', color: c.textoSecundario,
            '&.Mui-selected': { color: acento },
          },
        },
      },
      MuiBreadcrumbs: { styleOverrides: { root: { ...body2 }, separator: { marginLeft: 4, marginRight: 4, color: c.textoSecundario } } },
      MuiLink: { defaultProps: { underline: 'hover' }, styleOverrides: { root: { color: acento, fontWeight: PESO.medio, textUnderlineOffset: 3 } } },
      MuiDivider: { styleOverrides: { root: { borderColor: c.bordeSutil } } },
      MuiPopover: { styleOverrides: { paper: { backgroundColor: c.superficieElevada, backgroundImage: 'none', border: `1px solid ${c.bordeSutil}`, boxShadow: s.menu, borderRadius: RADIO.md } } },
      MuiMenu: { styleOverrides: { list: { padding: 6 } } },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            ...body2, lineHeight: '20px', minHeight: control, borderRadius: RADIO.sm, gap: 8,
            ...(web ? {} : { [ESCRITORIO]: { minHeight: control } }),
            '&:hover': { backgroundColor: c.superficieNivel2 },
            '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: acentoTinte },
          },
        },
      },
      // Texto de las listas: principal `body2` y secundario `caption` (MUI usa `body1` en el principal, y eso sería 14 px).
      MuiListItemText: { defaultProps: { slotProps: { primary: { variant: 'body2' }, secondary: { variant: 'caption' } } } },
      MuiListItemIcon: { styleOverrides: { root: { minWidth: 0, color: c.textoSecundario } } },
      MuiBackdrop: { styleOverrides: { root: ({ ownerState }) => (ownerState.invisible ? {} : { backgroundColor: c.scrim }) } },
      MuiDialog: {
        styleOverrides: { paper: { borderRadius: radioDialogo, backgroundColor: c.superficieNivel1, backgroundImage: 'none', boxShadow: s.dialogo } },
      },
      MuiDialogTitle: { styleOverrides: { root: { ...variante('h6'), padding: '18px 24px 4px' } } },
      MuiDialogContentText: { styleOverrides: { root: { ...body2, lineHeight: '20px' } } },
      // MUI quita el relleno superior del contenido que sigue al título; como el contenido desplaza (y recorta), la etiqueta del primer
      // campo, que va sobre su borde, quedaba cortada. Se devuelve el relleno.
      MuiDialogContent: { styleOverrides: { root: { padding: '12px 24px', '.MuiDialogTitle-root + &': { paddingTop: 10 } } } },
      MuiDialogActions: { styleOverrides: { root: { padding: '12px 24px 20px', gap: 8, flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { marginLeft: 0 } } } },
      MuiDrawer: {
        styleOverrides: { paper: { width: web ? 480 : '100%', backgroundColor: c.superficieNivel1, backgroundImage: 'none', borderLeft: `1px solid ${c.bordeSutil}`, boxShadow: s.dialogo } },
      },
      MuiSnackbarContent: {
        styleOverrides: {
          root: { backgroundColor: c.superficieElevada, color: c.textoPrimario, border: `1px solid ${c.bordeSutil}`, boxShadow: s.menu, borderRadius: RADIO.md, padding: '6px 12px', ...body2, lineHeight: '20px' },
          action: { marginRight: -4 },
        },
      },
      MuiAlert: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: {
          root: ({ ownerState }) => {
            const t = estado[severidad[ownerState.severity ?? 'info']];
            // Con botón de cerrar o acción, la fila mide lo que el botón (32 px): ícono y primera línea del texto se
            // centran en esa altura (antes quedaban arriba y el aviso se veía descentrado). En varias líneas, el ícono
            // sigue alineado con la primera.
            const conAccion = Boolean(ownerState.onClose ?? ownerState.action);
            return {
              // Avisos ligeros: tinte suave del tono, sin borde (la referencia no enmarca cada aviso) y esquinas de 10 px.
              borderRadius: RADIO.sm + 2,
              border: 'none',
              backgroundColor: t.fondo,
              color: c.textoPrimario,
              padding: '6px 14px',
              '& .MuiAlert-icon': { color: t.texto, opacity: 1, padding: conAccion ? '7px 0' : '2px 0', marginRight: 10, fontSize: 18 },
              ...(conAccion && { '& .MuiAlert-message': { padding: '6px 0' } }),
            };
          },
          message: { ...body2, lineHeight: '20px', padding: '1px 0' },
          action: { padding: '0 0 0 12px', marginRight: 0, alignItems: 'flex-start' },
        },
      },
      MuiAlertTitle: { styleOverrides: { root: { ...subtitle1, marginBottom: 0 } } },
      MuiTooltip: {
        defaultProps: { arrow: false, enterDelay: 400 },
        styleOverrides: { tooltip: { backgroundColor: c.tooltipFondo, color: c.tooltipTexto, ...body2, borderRadius: RADIO.sm, padding: '4px 8px' } },
      },
      MuiBadge: { styleOverrides: { badge: { height: 18, minWidth: 18, padding: '0 5px', ...caption, fontWeight: PESO.fuerte } } },
      MuiAvatar: { styleOverrides: { root: { width: 28, height: 28, ...caption, fontWeight: PESO.medio, backgroundColor: acentoTinte, color: acento } } },
      // Chips: píldora pequeña. Los de color semántico (`color="success"`…) van tinteados (fondo suave, borde y texto del tono), como los de estado.
      MuiChip: {
        styleOverrides: {
          root: ({ ownerState }) => {
            const clave = ownerState.color && ownerState.color !== 'default' && ownerState.color !== 'secondary' ? tonoDeColor[ownerState.color] : null;
            const t = clave ? estado[clave] : null;
            return {
              borderRadius: RADIO.pill,
              height: web ? 24 : 28,
              ...caption,
              fontWeight: PESO.medio,
              ...(web ? {} : { [ESCRITORIO]: { height: 24 } }),
              ...(t
                ? { backgroundColor: t.fondo, color: t.texto, border: `1px solid ${t.borde}`, '& .MuiChip-icon': { color: t.texto } }
                : { backgroundColor: c.superficieNivel2, color: c.textoSecundario }),
            };
          },
          outlined: ({ ownerState }) => (ownerState.color && ownerState.color !== 'default' && ownerState.color !== 'secondary' ? {} : { borderColor: c.bordeSutil, backgroundColor: 'transparent', color: c.textoPrimario }),
          icon: { marginLeft: 6, marginRight: -2 },
        },
      },
      MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { root: { backgroundImage: 'none' }, rounded: { borderRadius: radioMarco }, outlined: { borderColor: c.bordeSutil } } },
      // Plegable (UI-4): mismo borde y radio que las tarjetas en cualquier posición (MUI solo redondea el primero y el último
      // de una pila) y sin la línea superior que dibuja entre acordeones.
      MuiAccordion: {
        defaultProps: { disableGutters: true, elevation: 0, square: false },
        styleOverrides: {
          root: {
            '&, &:first-of-type, &:last-of-type': { borderRadius: radioMarco },
            border: `1px solid ${c.bordeSutil}`,
            backgroundColor: c.superficieNivel1,
            '&::before': { display: 'none' },
            '&.Mui-expanded': { margin: 0 },
          },
        },
      },
      MuiAccordionSummary: {
        styleOverrides: {
          root: { minHeight: web ? 48 : 52, padding: '0 16px', borderRadius: radioMarco, '&.Mui-expanded': { minHeight: web ? 48 : 52, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } },
          content: { margin: '10px 0', '&.Mui-expanded': { margin: '10px 0' } },
        },
      },
      MuiAccordionDetails: { styleOverrides: { root: { padding: '8px 16px 16px' } } },
      MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { borderRadius: radioMarco } } },
      MuiCardHeader: { styleOverrides: { root: { padding: '14px 20px 6px' }, title: variante('h6'), subheader: { ...body2, color: c.textoSecundario }, action: { margin: 0, alignSelf: 'center' } } },
      MuiCardContent: { styleOverrides: { root: { padding: '14px 20px', '&:last-child': { paddingBottom: 16 } } } },
      MuiCardActions: { styleOverrides: { root: { padding: '4px 20px 16px', gap: 8 } } },
      // Tablas: encabezado con fondo cian muy claro y rótulos en versalitas pequeñas; filas con divisores finos.
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: c.bordeSutil },
          head: {
            backgroundColor: c.encabezadoTabla,
            color: c.textoSecundario,
            ...variante('overline'),
            fontWeight: PESO.fuerte,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          },
          sizeSmall: { height: DENSIDAD.filaCompacta, padding: '0 12px' },
        },
      },
      MuiTableRow: { styleOverrides: { root: { '&:hover': { backgroundColor: c.superficieNivel2 }, '&.Mui-selected, &.Mui-selected:hover': { backgroundColor: acentoTinte } } } },
      MuiSkeleton: { styleOverrides: { root: { backgroundColor: c.esqueleto, borderRadius: RADIO.xs } } },
      MuiLinearProgress: { styleOverrides: { root: { height: 4, borderRadius: RADIO.pill, backgroundColor: c.superficieNivel2 }, bar: { borderRadius: RADIO.pill } } },
      // `body2` (13 px) es el texto normal: un `Typography` sin variante lo toma; `body1` (14 px) solo si se pide.
      MuiTypography: { defaultProps: { variant: 'body2', variantMapping: { mono: 'span', monoTabla: 'span', kpi: 'span' } } },
    },
  }, esES, textosPropios);
}
