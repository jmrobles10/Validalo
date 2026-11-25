import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCOPES, type CampoCruzadoDto, type CruceDeSeccionDto, type HechosDto, type HechosIaDto, type RequisitoExpedienteDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { antiguedad, areaDeRequisito, expediente, requisito, veredicto } from '../datosPrueba';
import type { ContextoRevisor } from '../reglas';
import { TarjetaRequisito } from './TarjetaRequisito';

const CONTEXTO: ContextoRevisor = { scopes: new Set([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.documentosLeer]), usuarioId: 'u-1', esMiembro: true };

const IA: HechosIaDto = {
  modelo: 'gpt-6-luna',
  escalado: false,
  confianza: 0.99,
  legible: true,
  tipoDetectado: 'CERTIFICACION_BANCARIA',
  campos: { banco: 'Bancolombia', titular: 'Aceros del Norte S.A.S.', tipoCuenta: 'Ahorros', numero: '****5678', fechaExpedicion: '2026-11-24', identificacionTitular: '900123456' },
  alertas: [],
  observaciones: null,
  paginasEnviadas: 1,
  paginasOmitidas: 0,
  fecha: '2026-11-24T15:00:00Z',
};

const LEIDO: HechosDto = {
  conIa: true,
  hashVerificado: true,
  antivirus: 'Limpio',
  mimeReal: 'application/pdf',
  paginas: 1,
  comparacion: 'SinCambios',
  camposCambiados: [],
  camposCriticosCambiados: [],
  pendienteRevisionHumana: true,
  ia: IA,
};

/** El archivo llegó a la empresa sin la lectura automática (no tiene plan de IA o no la recibió). */
const SIN_LEER: HechosDto = { ...LEIDO, conIa: false, ia: null };

/** La certificación respalda las cuentas y el tercero no ha designado ninguna con esta empresa: no hay con qué cruzarla. */
const CERTIFICACION_SIN_CUENTA = requisito({
  tipoDocumento: { id: 'tc', codigo: 'CERTIFICACION_BANCARIA', nombre: 'Certificación bancaria', tipoCanonico: 'CERTIFICACION_BANCARIA', ambito: 'Global', modo: 'Archivo' },
  soporteDeSecciones: {
    sinAnalisis: true,
    discrepanciaCritica: false,
    secciones: [{ seccion: 'CUENTAS_BANCARIAS', nombre: 'Cuentas bancarias (ninguna designada con esta empresa)', periodo: null, version: null, cruce: null }],
  },
});

function montar(requisito: RequisitoExpedienteDto, hechos: HechosDto | null, { administrar = false, ...opciones }: { decidirPorDocumento?: boolean; cuentasEnSuTarjeta?: boolean; administrar?: boolean } = {}) {
  const contexto: ContextoRevisor = administrar ? { ...CONTEXTO, scopes: new Set([...CONTEXTO.scopes, SCOPES.expedientesAdministrar]) } : CONTEXTO;
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ul>
          <TarjetaRequisito
            expediente={{ ...expediente('EnRevision'), requisitos: [requisito] }}
            requisito={requisito}
            areas={new Map()}
            contexto={() => contexto}
            nombres={new Map()}
            puedeVer
            onVer={() => undefined}
            onAccion={() => undefined}
            hechos={hechos}
            {...opciones}
          />
        </ul>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Tarjeta del requisito: la lectura del archivo y el cruce con lo que respalda', () => {
  it('archivo leído y cruce sin con qué compararse: no dice «Sin lectura automática», lo explica en el pie', () => {
    montar(CERTIFICACION_SIN_CUENTA, LEIDO);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin lectura automática/)).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Revisión automática' })).toBeInTheDocument();
    // «Analizado…» va en el encabezado de la revisión; «Respalda…» y la nota del cruce, debajo y en texto secundario, sin alerta.
    expect(screen.getByText(/^Analizado el/)).toHaveTextContent(/^Analizado el 24\/11\/2026 · gpt-6-luna · Confianza 99\s?%$/);
    expect(screen.getByText(/^Respalda:/)).toHaveTextContent('Respalda: Cuentas bancarias (ninguna designada con esta empresa)');
    expect(screen.getByText(/Sin cruce automático con lo declarado/)).toBeInTheDocument();
  });

  it('archivo sin la lectura automática: alerta que se revise a mano y sin nota de cruce', () => {
    montar(CERTIFICACION_SIN_CUENTA, SIN_LEER);

    expect(screen.getByRole('alert')).toHaveTextContent('Sin lectura automática: revísalo y compáralo a mano con lo que declaró el tercero.');
    expect(screen.queryByText(/Sin cruce automático con lo declarado/)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Revisión automática' })).not.toBeInTheDocument();
  });

  it('archivo leído y cruzado con sus cuentas: sin alerta ni nota', () => {
    const cruzada = requisito({
      ...CERTIFICACION_SIN_CUENTA,
      soporteDeSecciones: { sinAnalisis: false, discrepanciaCritica: false, secciones: [{ seccion: 'CUENTAS_BANCARIAS', nombre: 'Cuenta de Bancolombia ****5678', periodo: null, version: null, cruce: null }] },
    });
    montar(cruzada, LEIDO);

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Sin cruce automático con lo declarado/)).not.toBeInTheDocument();
    expect(screen.getByText(/^Respalda:/)).toHaveTextContent('Respalda: Cuenta de Bancolombia ****5678');
  });

  it('legible, tipo detectado y los datos leídos van en una sola lista, y el pie no se repite dentro de la revisión', () => {
    montar(CERTIFICACION_SIN_CUENTA, LEIDO);

    const revision = within(screen.getByRole('region', { name: 'Revisión automática' }));
    const lista = within(revision.getByLabelText('Datos extraídos'));
    expect(lista.getAllByRole('term').map((t) => t.textContent)).toEqual(['Legible', 'Tipo detectado', 'Banco', 'Titular', 'Tipo de cuenta', 'Número', 'Fecha de expedición', 'Identificación del titular']);
    expect(lista.getByText('Certificación bancaria')).toBeInTheDocument();
    // Legible y el tipo detectado no cuentan para el límite de la tarjeta (6 datos): con seis datos leídos no hay «Ver más».
    expect(revision.queryByRole('button', { name: /dato más/ })).not.toBeInTheDocument();
    // «Analizado el …» va una sola vez, en el encabezado de la revisión.
    expect(screen.getAllByText(/Analizado el/)).toHaveLength(1);
  });
});

/** El bloque de la máquina: un grupo con su nombre, con la revisión automática (encabezado, divisor, resumen del cruce, lo leído) y las etapas fuera. */
const campo = (codigo: string, etiqueta: string, resultado: 'Coincide' | 'Discrepa' | 'NoVerificable', critico: boolean): CampoCruzadoDto => ({
  campo: codigo,
  etiqueta,
  declarado: 'x',
  extraido: resultado === 'NoVerificable' ? null : 'x',
  resultado,
  critico,
  detalle: null,
});

const CAMPOS_CUENTA: CampoCruzadoDto[] = [
  campo('numero', 'Número de la cuenta', 'Coincide', true),
  campo('titular', 'Titular de la cuenta', 'Coincide', true),
  campo('identificacion_titular', 'Identificación del titular', 'NoVerificable', true),
  campo('banco', 'Banco', 'Coincide', false),
];

const cruceCuenta = (campos: CampoCruzadoDto[]): CruceDeSeccionDto => ({
  documentoId: 'doc-cert',
  versionDocumento: 1,
  tipoDocumento: 'CERTIFICACION_BANCARIA',
  nombreDocumento: 'Certificación bancaria',
  confianza: 0.98,
  legible: true,
  fecha: '2026-11-24T15:00:00Z',
  coincidencias: campos.filter((c) => c.resultado === 'Coincide').length,
  discrepancias: campos.filter((c) => c.resultado === 'Discrepa').length,
  noVerificables: campos.filter((c) => c.resultado === 'NoVerificable').length,
  discrepanciaCritica: campos.some((c) => c.critico && c.resultado === 'Discrepa'),
  campos,
});

const certificacionCruzada = (campos: CampoCruzadoDto[] = CAMPOS_CUENTA) =>
  requisito({
    ...CERTIFICACION_SIN_CUENTA,
    areas: [areaDeRequisito({ areaId: 'a1', codigo: 'ACCESO', estado: 'Esperando' })],
    soporteDeSecciones: {
      sinAnalisis: false,
      discrepanciaCritica: campos.some((c) => c.critico && c.resultado === 'Discrepa'),
      secciones: [{ seccion: 'CUENTAS_BANCARIAS', nombre: 'Cuenta de Davivienda ****7097', periodo: null, version: null, cruce: cruceCuenta(campos) }],
    },
  });

describe('Tarjeta del requisito: el bloque de la revisión automática', () => {
  it('reúne el encabezado, el resumen del cruce y lo que leyó la IA en un grupo aparte, con las etapas fuera', () => {
    montar(certificacionCruzada(), LEIDO, { cuentasEnSuTarjeta: true });

    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    const revision = within(bloque).getByRole('region', { name: 'Revisión automática' });
    expect(within(revision).getByRole('heading', { name: 'Revisión automática' })).toBeInTheDocument();
    expect(bloque).toHaveTextContent(/Analizado el 24\/11\/2026 · gpt-6-luna · Confianza 99\s?%/);
    expect(bloque).toHaveTextContent('Cuenta de Davivienda ****7097 — Coincide: número y titular · Sin verificar: identificación');
    // El bloque tiene el fondo del encabezado de las tablas y el radio del tema; las etapas (áreas) quedan fuera.
    expect(within(bloque).queryByText('ACCESO')).not.toBeInTheDocument();
    expect(screen.getByText('ACCESO')).toBeInTheDocument();
  });

  it('la confianza es un dato en texto, no un chip, y el encabezado va separado del contenido por un divisor', () => {
    montar(certificacionCruzada(), LEIDO, { cuentasEnSuTarjeta: true });

    const revision = screen.getByRole('region', { name: 'Revisión automática' });
    expect(revision.querySelector('.MuiChip-root')).toBeNull();
    expect(within(revision).getByText(/^Confianza 99\s?%$/).tagName).toBe('SPAN');
    expect(revision.querySelector('hr')).not.toBeNull();
    // El resumen del cruce va antes que lo que leyó la IA.
    const textos = revision.textContent;
    expect(textos.indexOf('Cuenta de Davivienda')).toBeGreaterThan(-1);
    expect(textos.indexOf('Cuenta de Davivienda')).toBeLessThan(textos.indexOf('Legible'));
  });

  it('una confianza baja pinta solo el dato en tono de advertencia', () => {
    montar(certificacionCruzada(), { ...LEIDO, ia: { ...IA, confianza: 0.62 } }, { cuentasEnSuTarjeta: true });

    const confianza = within(screen.getByRole('region', { name: 'Revisión automática' })).getByText(/^Confianza 62\s?%$/);
    expect(getComputedStyle(confianza).color).not.toBe(getComputedStyle(screen.getByText(/^Analizado el/)).color);
  });

  it('con un cruce, lo leído queda plegado tras «Ver lo que leyó la IA»; legible y el tipo siguen a la vista', async () => {
    const usuario = userEvent.setup();
    montar(certificacionCruzada(), LEIDO, { cuentasEnSuTarjeta: true });

    const revision = within(screen.getByRole('region', { name: 'Revisión automática' }));
    const lista = within(revision.getByLabelText('Datos extraídos'));
    expect(lista.getAllByRole('term').map((t) => t.textContent)).toEqual(['Legible', 'Tipo detectado']);
    expect(revision.queryByText('Aceros del Norte S.A.S.')).not.toBeInTheDocument();

    await usuario.click(revision.getByRole('button', { name: 'Ver lo que leyó la IA' }));
    expect(within(revision.getByLabelText('Datos extraídos')).getByText('Aceros del Norte S.A.S.')).toBeInTheDocument();
    expect(revision.queryByRole('button', { name: /dato más/ })).not.toBeInTheDocument();
    await usuario.click(revision.getByRole('button', { name: 'Ocultar lo que leyó la IA' }));
    expect(revision.queryByText('Aceros del Norte S.A.S.')).not.toBeInTheDocument();
  });

  it('en el sector de la cuenta (la tarjeta de la cuenta trae la comparación) la cuenta queda en una línea, sin tabla ni «Respalda» repetido', () => {
    montar(certificacionCruzada(), LEIDO, { cuentasEnSuTarjeta: true });

    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    expect(within(bloque).queryByRole('table')).not.toBeInTheDocument();
    expect(within(bloque).queryByText(/Cruce con/)).not.toBeInTheDocument();
    expect(within(bloque).queryByText(/coinciden ·/)).not.toBeInTheDocument();
    expect(within(bloque).queryByText(/^Respalda:/)).not.toBeInTheDocument();
    expect(within(bloque).getAllByText(/Cuenta de Davivienda \*\*\*\*7097/)).toHaveLength(1);
  });

  it('fuera de ese sector (el detalle del expediente) la tabla del cruce sigue, con su chip y sin repetir los conteos', () => {
    montar(certificacionCruzada(), LEIDO);

    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    expect(within(bloque).getByRole('table', { name: /Cruce con Certificación bancaria/ })).toBeInTheDocument();
    expect(within(bloque).getByText(/^Respalda:/)).toBeInTheDocument();
    // «3 coinciden · 0 difieren · 1 sin verificar» va una sola vez (en el encabezado de la tabla).
    expect(within(bloque).getAllByText(/3 coinciden/)).toHaveLength(1);
  });

  it('el chip del resultado dice «Sin verificar» si algo crítico quedó sin verificar, aunque nada difiera (no «Coincide»)', () => {
    montar(certificacionCruzada(), LEIDO);

    const fila = screen.getByText('Cuenta de Davivienda ****7097').closest('li')!;
    expect(within(fila).getByText('Sin verificar', { selector: '.MuiChip-label' })).toBeInTheDocument();
    expect(within(fila).queryByText('Coincide', { selector: '.MuiChip-label' })).not.toBeInTheDocument();
  });

  it('el chip dice «Coincide» solo si todo lo crítico coincide', () => {
    const coincide = CAMPOS_CUENTA.map((c) => (c.campo === 'identificacion_titular' ? campo('identificacion_titular', 'Identificación del titular', 'Coincide', true) : c));
    montar(certificacionCruzada(coincide), LEIDO);

    const fila = screen.getByText('Cuenta de Davivienda ****7097').closest('li')!;
    expect(within(fila).getByText('Coincide', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });

  it('el chip dice «Difiere en campos críticos» si un crítico discrepa', () => {
    const difiere = CAMPOS_CUENTA.map((c) => (c.campo === 'numero' ? campo('numero', 'Número de la cuenta', 'Discrepa', true) : c));
    montar(certificacionCruzada(difiere), LEIDO);

    const fila = screen.getByText('Cuenta de Davivienda ****7097').closest('li')!;
    expect(within(fila).getByText('Difiere en campos críticos', { selector: '.MuiChip-label' })).toBeInTheDocument();
  });

  it('sin la lectura ni cruce no se pinta el bloque', () => {
    montar(requisito({ ...CERTIFICACION_SIN_CUENTA, soporteDeSecciones: null }), SIN_LEER);

    expect(screen.queryByRole('group', { name: 'Lectura y cruce del documento' })).not.toBeInTheDocument();
  });
});

describe('Tarjeta del requisito: el encabezado', () => {
  it('el estado y las acciones van juntos en una fila centrada, con botones del mismo tamaño del tema', () => {
    montar(requisito({ estado: 'Pendiente', areas: [] }), LEIDO, { administrar: true });

    const chip = document.querySelector('[data-estado="Pendiente"]')!;
    const grupo = chip.parentElement!;
    expect(grupo).toHaveStyle({ display: 'flex', flexDirection: 'row', alignItems: 'center' });
    const ver = within(grupo).getByRole('button', { name: /^Ver / });
    const eximir = within(grupo).getByRole('button', { name: 'Eximir' });
    expect(ver.className).toEqual(expect.stringContaining('MuiButton-sizeSmall'));
    expect(eximir.className).toEqual(expect.stringContaining('MuiButton-sizeSmall'));
    // El grupo va a la derecha de la cabecera de la tarjeta (ícono | título y subtítulo | grupo), centrado frente al bloque título + subtítulo.
    expect(grupo).toHaveStyle({ alignSelf: 'center' });
    expect(grupo.parentElement).toHaveStyle({ display: 'grid' });
  });
});


describe('Tarjeta del requisito: las áreas que lo revisan', () => {
  const DOS_AREAS = requisito({
    areas: [
      areaDeRequisito({ areaId: 'a1', codigo: 'ACCESO', estado: 'Esperando' }),
      areaDeRequisito({ areaId: 'a2', codigo: 'VENTAS', estado: 'Esperando', aprobadoresRequeridos: 2 }),
    ],
  });

  it('cada área junta en su fila el nombre, el estado y las aprobaciones', () => {
    montar(DOS_AREAS, null);

    expect(screen.getByText('ACCESO').closest('li')).toHaveTextContent('ACCESOEn espera0 de 1');
    expect(screen.getByText('VENTAS').closest('li')).toHaveTextContent('VENTASEn espera0 de 2');
  });

  it('conserva «Decidir» y los veredictos del área para quien revisa', () => {
    const conVeredicto = requisito({
      areas: [areaDeRequisito({ veredictos: [{ ...veredicto({ veredicto: 'Observado', usuario: 'u-2', observacion: 'Falta el sello' }), sobreVersion: 1 }] })],
    });
    montar(conVeredicto, null, { decidirPorDocumento: true });

    expect(screen.getByText(/observó · v1 · “Falta el sello”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprobar u observar Registro Único Tributario por JURIDICA' })).toBeInTheDocument();
  });
});

describe('Tarjeta del requisito: la antigüedad del documento en el bloque de revisión', () => {
  const conAntiguedad = (dato: ReturnType<typeof antiguedad> | null, base = certificacionCruzada()) => ({ ...base, versionActual: base.versionActual ? { ...base.versionActual, antiguedad: dato } : null });

  it('si pasa el máximo de su tipo, la línea de resumen dice «Antigüedad: 860 días, máximo 30» con tono de error (difiere crítico) y el detalle de la API', () => {
    montar(conAntiguedad(antiguedad()), LEIDO, { cuentasEnSuTarjeta: true });

    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    const linea = bloque.querySelector('[data-antiguedad]')!;
    expect(linea).toHaveTextContent('Antigüedad: 860 días, máximo 30');
    expect(linea).toHaveAttribute('title', 'Expedida el 17/07/2024: 860 días; el máximo es 30.');
    expect(linea.querySelector('svg.lucide-circle-x')).not.toBeNull();
    // Va junto al resumen del cruce, dentro del mismo bloque.
    expect(bloque).toHaveTextContent('Cuenta de Davivienda ****7097');
    // Y como aviso de la tarjeta: es un hallazgo crítico.
    expect(screen.getByRole('alert')).toHaveTextContent('Expedida el 17/07/2024: 860 días; el máximo es 30.');
  });

  it('dentro del máximo va en éxito, sin aviso; sin fecha verificable, en advertencia con su texto', () => {
    const campo = antiguedad().campo!;
    const cumple = antiguedad({ estado: 'Cumple', dias: 12, critico: false, campo: { ...campo, resultado: 'Coincide', extraido: '12 días' } });
    montar(conAntiguedad(cumple), LEIDO, { cuentasEnSuTarjeta: true });
    const linea = screen.getByRole('group', { name: 'Lectura y cruce del documento' }).querySelector('[data-antiguedad]')!;
    expect(linea).toHaveTextContent('Antigüedad: 12 días, máximo 30');
    expect(linea.querySelector('svg.lucide-circle-check')).not.toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin fecha de expedición verificable lo dice con tono de advertencia', () => {
    const campo = antiguedad().campo!;
    montar(conAntiguedad(antiguedad({ estado: 'SinFecha', dias: null, fechaExpedicion: null, campo: { ...campo, resultado: 'NoVerificable', extraido: null } })), LEIDO, { cuentasEnSuTarjeta: true });

    const linea = screen.getByRole('group', { name: 'Lectura y cruce del documento' }).querySelector('[data-antiguedad]')!;
    expect(linea).toHaveTextContent('Antigüedad: sin fecha de expedición, máximo 30 días');
    expect(linea.querySelector('svg.lucide-circle-alert')).not.toBeNull();
  });

  it('en la tabla de comparación (fuera del sector de la cuenta) la antigüedad es una fila más, una sola vez', () => {
    montar(conAntiguedad(antiguedad()), LEIDO);

    const tabla = within(screen.getByRole('group', { name: 'Lectura y cruce del documento' })).getByRole('table', { name: /Cruce con Certificación bancaria/ });
    const fila = within(tabla).getByRole('row', { name: 'Antigüedad del documento: Difiere' });
    expect(fila).toHaveTextContent('Máximo 30 días');
    expect(fila).toHaveTextContent('860 días');
    expect(within(tabla).getAllByRole('row').filter((f) => f.textContent.includes('Antigüedad'))).toHaveLength(1);
  });

  it('si el tipo no tiene regla de antigüedad no aparece en ninguna parte', () => {
    montar(conAntiguedad(null), LEIDO);

    const bloque = screen.getByRole('group', { name: 'Lectura y cruce del documento' });
    expect(bloque.querySelector('[data-antiguedad]')).toBeNull();
    expect(bloque).not.toHaveTextContent('Antigüedad');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
