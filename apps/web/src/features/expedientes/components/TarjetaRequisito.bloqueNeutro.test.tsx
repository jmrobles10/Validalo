import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { SCOPES, type CampoCruzadoDto, type CruceDeSeccionDto, type HechosDto, type RequisitoExpedienteDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { antiguedad, area, areaDeRequisito, conclusionDeRevision, expediente, requisito } from '../datosPrueba';
import type { ContextoRevisor } from '../reglas';
import { TarjetaRequisito } from './TarjetaRequisito';

const CONTEXTO: ContextoRevisor = { scopes: new Set([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.documentosLeer]), usuarioId: 'u-1', esMiembro: true };

const campo = (etiqueta: string, resultado: CampoCruzadoDto['resultado'], critico = false): CampoCruzadoDto => ({
  campo: etiqueta,
  etiqueta,
  declarado: 'x',
  extraido: resultado === 'NoVerificable' ? null : 'x',
  resultado,
  critico,
  detalle: null,
});

const cruce = (campos: CampoCruzadoDto[]): CruceDeSeccionDto => ({
  documentoId: 'doc-rut',
  versionDocumento: 1,
  tipoDocumento: 'RUT',
  nombreDocumento: 'Registro Único Tributario',
  confianza: 0.99,
  legible: true,
  fecha: '2026-11-25T15:00:00Z',
  coincidencias: campos.filter((c) => c.resultado === 'Coincide').length,
  discrepancias: campos.filter((c) => c.resultado === 'Discrepa').length,
  noVerificables: campos.filter((c) => c.resultado === 'NoVerificable').length,
  discrepanciaCritica: campos.some((c) => c.critico && c.resultado === 'Discrepa'),
  campos,
});

const HECHOS: HechosDto = {
  conIa: true,
  hashVerificado: true,
  antivirus: 'Limpio',
  mimeReal: 'application/pdf',
  paginas: 1,
  comparacion: 'SinCambios',
  camposCambiados: [],
  camposCriticosCambiados: [],
  pendienteRevisionHumana: true,
  ia: {
    modelo: 'gpt-6-luna',
    escalado: false,
    confianza: 0.99,
    legible: true,
    tipoDetectado: 'RUT',
    campos: { nit: '900123456', razonSocial: 'ACEROS DEL NORTE SAS' },
    alertas: [],
    observaciones: null,
    paginasEnviadas: 1,
    paginasOmitidas: 0,
    fecha: '2026-11-25T15:00:00Z',
  },
};

/** Como el RUT de ATLAS: tres secciones que coinciden por completo, con la antigüedad cumplida. */
const RUT_QUE_COINCIDE: RequisitoExpedienteDto = requisito({
  versionActual: {
    documentoId: 'doc-rut',
    n: 1,
    sha256: 'abc',
    cargadaEn: '2026-11-25T14:00:00Z',
    antiguedad: antiguedad({ estado: 'Cumple', dias: 3, critico: false, campo: { campo: 'antiguedad', etiqueta: 'Antigüedad del documento', declarado: 'Máximo 30 días', extraido: '3 días', resultado: 'Coincide', critico: false, detalle: null } }),
  },
  areas: [areaDeRequisito({ areaId: 'a-juridica', codigo: 'JURIDICA', estado: 'Pendiente' })],
  soporteDeSecciones: {
    sinAnalisis: false,
    discrepanciaCritica: false,
    secciones: ['Información general', 'Información tributaria', 'Información legal'].map((nombre, i) => ({
      seccion: `FICHA_${String(i)}`,
      nombre,
      periodo: null,
      version: 1,
      cruce: cruce([campo('Número de identificación', 'Coincide', true), campo('Razón social', 'Coincide', true), campo('Correo', 'Coincide')]),
    })),
  },
});

const tema = createValidaloTheme('light');

/** «#1F9D63» → «rgb(31, 157, 99)»: como lo devuelve `getComputedStyle`. */
const rgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${String((n >> 16) & 255)}, ${String((n >> 8) & 255)}, ${String(n & 255)})`;
};

function montar(requisitoDelTest: RequisitoExpedienteDto, cuentasEnSuTarjeta = false) {
  const areaDelExpediente = area({ areaId: 'a-juridica', codigo: 'JURIDICA', nombre: 'Jurídica' });
  render(
    <ThemeProvider theme={tema}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ul>
          <TarjetaRequisito
            expediente={{ ...expediente('EnRevision', [areaDelExpediente]), requisitos: [requisitoDelTest] }}
            requisito={requisitoDelTest}
            areas={new Map([[areaDelExpediente.areaId, areaDelExpediente]])}
            contexto={() => CONTEXTO}
            nombres={new Map()}
            puedeVer
            onVer={() => undefined}
            onAccion={() => undefined}
            hechos={HECHOS}
            cuentasEnSuTarjeta={cuentasEnSuTarjeta}
          />
        </ul>
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return screen.getByRole('group', { name: 'Lectura y cruce del documento' });
}

const PINTURAS = ['color', 'backgroundColor', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderRightColor'] as const;

/** Todo lo que pinta el bloque fuera de su conclusión, con las propiedades de color que usa. */
function pinturasFueraDeLaConclusion(bloque: HTMLElement): string[] {
  const conclusion = within(bloque).queryByRole('region', { name: 'Conclusión de la IA' });
  return [...bloque.querySelectorAll<HTMLElement>('*')]
    .filter((el) => !conclusion?.contains(el))
    .flatMap((el) => PINTURAS.map((propiedad) => getComputedStyle(el)[propiedad]));
}

describe('El bloque «Revisión automática»: neutro, el color es solo de la conclusión', () => {
  it('es el gris suave del tema con un borde fino, no el teal del encabezado de las tablas ni el tinte del acento', () => {
    const bloque = montar({ ...RUT_QUE_COINCIDE, conclusionDeRevision: conclusionDeRevision() });

    const estilo = getComputedStyle(bloque);
    expect(estilo.backgroundColor).toBe(rgb(tema.palette.superficie.nivel2));
    expect(estilo.backgroundColor).not.toBe(rgb(tema.palette.tabla.encabezado));
    expect(estilo.backgroundColor).not.toBe(rgb(tema.palette.acento.tinte));
    expect(estilo.borderTopColor).toBe(rgb(tema.palette.borde.sutil));
    expect(estilo.borderTopWidth).toBe('1px');
  });

  it('con «Revisa antes de aprobar» y todo coincidiendo, nada del bloque fuera de la conclusión usa el verde del éxito ni el del acento', () => {
    const bloque = montar({ ...RUT_QUE_COINCIDE, conclusionDeRevision: conclusionDeRevision({ sugerencia: 'Revisar', motivos: [{ codigo: 'confianza-baja', texto: 'La confianza del análisis (80 %) está bajo el umbral del plan (85 %).' }] }) });

    const prohibidos = [tema.palette.estado.exito, tema.palette.acento].flatMap((p) => Object.values(p).filter((v): v is string => typeof v === 'string' && v.startsWith('#')).map(rgb));
    const pinturas = pinturasFueraDeLaConclusion(bloque);
    expect(pinturas.length).toBeGreaterThan(0);
    for (const pintura of pinturas) expect(prohibidos).not.toContain(pintura);
  });

  it('lo mismo con «Se sugiere aprobar»: el verde queda dentro de la conclusión y en ninguna otra parte del bloque', () => {
    const bloque = montar({ ...RUT_QUE_COINCIDE, conclusionDeRevision: conclusionDeRevision({ antiguedadVerificada: true }) });

    const conclusion = within(bloque).getByRole('region', { name: 'Conclusión de la IA' });
    const verde = rgb(tema.palette.estado.exito.texto);
    expect(getComputedStyle(within(conclusion).getByText('Se sugiere aprobar')).color).toBe(verde);
    expect(pinturasFueraDeLaConclusion(bloque)).not.toContain(verde);
    expect(pinturasFueraDeLaConclusion(bloque)).not.toContain(rgb(tema.palette.estado.exito.solido));
    expect(pinturasFueraDeLaConclusion(bloque)).not.toContain(rgb(tema.palette.estado.exito.borde));
    expect(pinturasFueraDeLaConclusion(bloque)).not.toContain(rgb(tema.palette.estado.exito.fondo));
  });

  it('el certificado bancario (sus cuentas en una línea y la antigüedad) tampoco lleva check verde si está bien', () => {
    const certificacion = requisito({
      ...RUT_QUE_COINCIDE,
      conclusionDeRevision: conclusionDeRevision({ nivel: 'Asistido' }),
      soporteDeSecciones: {
        sinAnalisis: false,
        discrepanciaCritica: false,
        secciones: [{ seccion: 'CUENTAS_BANCARIAS', nombre: 'Cuenta de Banco Davivienda ****7097', periodo: null, version: null, cruce: cruce([campo('Número de la cuenta', 'Coincide', true), campo('Titular', 'Coincide', true)]) }],
      },
    });
    const bloque = montar(certificacion, true);

    expect(bloque).toHaveTextContent('Cuenta de Banco Davivienda ****7097');
    expect(bloque.querySelector('[data-antiguedad]')).toHaveTextContent('Antigüedad: 3 días, máximo 30');
    const verdes = [tema.palette.estado.exito.texto, tema.palette.estado.exito.solido].map(rgb);
    for (const pintura of pinturasFueraDeLaConclusion(bloque)) expect(verdes).not.toContain(pintura);
  });

  it('el encabezado va en gris: el título y la línea «Analizado el …», con la confianza sin color si está sobre el umbral', () => {
    const bloque = montar({ ...RUT_QUE_COINCIDE, conclusionDeRevision: conclusionDeRevision() });

    const gris = rgb(tema.palette.text.secondary);
    expect(getComputedStyle(within(bloque).getByRole('heading', { name: 'Revisión automática' })).color).toBe(gris);
    const confianza = within(bloque).getByText(/^Confianza 99\s?%$/);
    expect(getComputedStyle(confianza).color).toBe(gris);
  });

  it('las secciones que coinciden quedan cerradas: ninguna tabla de comparación, solo sus líneas de resumen', () => {
    const bloque = montar({ ...RUT_QUE_COINCIDE, conclusionDeRevision: conclusionDeRevision() });

    expect(within(bloque).queryByRole('table')).not.toBeInTheDocument();
    expect(within(bloque).getAllByRole('button', { name: /· versión 1/ })).toHaveLength(3);
  });
});
