import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { SCOPES, type HechosDto, type HechosIaDto, type RequisitoExpedienteDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it } from 'vitest';
import { areaDeRequisito, expediente, requisito, veredicto } from '../datosPrueba';
import type { ContextoRevisor } from '../reglas';
import { TarjetaRequisito } from './TarjetaRequisito';

const CONTEXTO: ContextoRevisor = { scopes: new Set([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.documentosLeer]), usuarioId: 'u-1', esMiembro: true };

const IA: HechosIaDto = {
  modelo: 'gpt-6-luna',
  escalado: false,
  confianza: 0.99,
  legible: true,
  tipoDetectado: 'CERTIFICACION_BANCARIA',
  campos: { banco: 'Bancolombia', titular: 'Aceros del Norte S.A.S.', tipoCuenta: 'Ahorros', estadoCuenta: 'Activa', numero: '****5678', fechaExpedicion: '2026-11-24', identificacionTitular: '900123456' },
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

function montar(requisito: RequisitoExpedienteDto, hechos: HechosDto | null, opciones: { decidirPorDocumento?: boolean } = {}) {
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ul>
          <TarjetaRequisito
            expediente={{ ...expediente('EnRevision'), requisitos: [requisito] }}
            requisito={requisito}
            areas={new Map()}
            contexto={() => CONTEXTO}
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
    // «Analizado…» y «Respalda…» comparten una sola línea de texto secundario; la nota del cruce va junto, sin alerta.
    expect(screen.getByText(/^Analizado el/)).toHaveTextContent('Analizado el 24/11/2026 · gpt-6-luna · Respalda: Cuentas bancarias (ninguna designada con esta empresa)');
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
    expect(screen.getByText(/^Analizado el/)).toHaveTextContent('Respalda: Cuenta de Bancolombia ****5678');
  });

  it('legible, tipo detectado y los datos leídos van en una sola lista, y el pie no se repite dentro de la revisión', () => {
    montar(CERTIFICACION_SIN_CUENTA, LEIDO);

    const revision = within(screen.getByRole('region', { name: 'Revisión automática' }));
    const lista = within(revision.getByLabelText('Datos extraídos'));
    expect(lista.getAllByRole('term').map((t) => t.textContent)).toEqual(['Legible', 'Tipo detectado', 'Banco', 'Titular', 'Tipo de cuenta', 'Estado de la cuenta', 'Número', 'Fecha de expedición']);
    expect(lista.getByText('Certificación bancaria')).toBeInTheDocument();
    // Legible y el tipo detectado no cuentan para el límite de la tarjeta (6 datos): el séptimo queda tras «Ver 1 dato más».
    expect(revision.getByRole('button', { name: 'Ver 1 dato más' })).toBeInTheDocument();
    expect(revision.queryByText(/Analizado el/)).not.toBeInTheDocument();
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
