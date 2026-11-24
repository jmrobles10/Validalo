import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  configurarCliente,
  reiniciarCliente,
  type DocumentoBovedaDto,
  type ExpedientePublicoDto,
  type SesionTerceroDto,
  type TipoDocumentoRequisitoDto,
  type VersionDocumentoDto,
} from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { StrictMode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSesionTercero } from '../sesion/sesionTercero';
import { DialogoSubir } from './DialogoSubir';
import type { SolicitudDeSubida } from './solicitudDeSubida';
import type { OpcionesSubida, ResultadoSubida } from './subida';

/**
 * El diálogo de subida: el mismo contenido que la página `/boveda/subir`, sin navegar. La subida real (hash, `POST`, `PUT` y confirmar) se
 * cubre en `subida.test.ts`; aquí se simula para ver lo que el tercero ve en cada paso. Todo corre en StrictMode, como en desarrollo.
 */
const subirDocumentoSimulado = vi.hoisted(() => vi.fn<(opciones: OpcionesSubida) => Promise<ResultadoSubida>>());

vi.mock('./subida', async (importarOriginal) => ({ ...(await importarOriginal<typeof import('./subida')>()), subirDocumento: subirDocumentoSimulado }));

const json = (cuerpo: unknown) => new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } });

const TIPO: TipoDocumentoRequisitoDto = {
  id: 't1',
  codigo: 'CERT_NORTE',
  nombre: 'Certificado Norte',
  tipoCanonico: null,
  ambito: 'PorVinculo',
  modo: 'ArchivoYFormulario',
  campos: [{ clave: 'fecha_expedicion', etiqueta: 'Fecha de expedición', tipo: 'Fecha', obligatorio: true }],
  archivo: { formatos: ['application/pdf'], tamanoMaximoBytes: 5 * 1024 * 1024, paginasMaximas: 10, descripcion: 'Certificado Norte admite solo PDF de hasta 5 MB' },
  tienePlantilla: true,
  textoAyuda: 'Firmado por el representante legal.',
};

const expediente = (tipoDocumento: TipoDocumentoRequisitoDto): ExpedientePublicoDto => ({
  id: 'e1',
  folio: 'F-1',
  empresa: { id: 'emp', nombre: 'Constructora Norte', logoUrl: null },
  tipoVinculo: { id: 'tv', codigo: 'CLIENTE', nombre: 'Cliente' },
  estado: 'Abierto',
  observaciones: [],
  puedeReenviar: false,
  reenvios: 0,
  actualizadoEn: '2026-11-08T15:00:00Z',
  requisitos: [{ id: 'r1', tipoDocumento, obligatorio: true, estado: 'Pendiente', versionActual: null, observaciones: [] }],
});

const RUT_EN_LA_BOVEDA: DocumentoBovedaDto = {
  id: 'd1',
  tipo: { codigo: 'RUT', nombre: 'Registro Único Tributario', tipoDocumentoTenantId: null },
  ambito: 'Global',
  clase: 'Archivo',
  vinculoId: null,
  versionActual: null,
  versiones: 1,
  porEmpresa: [],
};

const version = (n: number) => ({ documentoId: 'd1', n, estado: 'Actual' }) as VersionDocumentoDto;
const archivo = (nombre = 'rut.pdf') => new File(['%PDF-1.4 un archivo'], nombre, { type: 'application/pdf' });

/** Una subida simulada que se resuelve cuando el test lo decide. */
function pendiente() {
  let resolver: (resultado: ResultadoSubida) => void = () => undefined;
  const promesa = new Promise<ResultadoSubida>((si) => {
    resolver = si;
  });
  return { promesa, resolver };
}

function montar(solicitud: SolicitudDeSubida, tipoDeRequisito: TipoDocumentoRequisitoDto = TIPO) {
  configurarCliente({
    fetch: vi.fn((url: RequestInfo | URL) => {
      const ruta = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      return Promise.resolve(json(ruta.includes('/expedientes/') ? expediente(tipoDeRequisito) : { terceroId: 't', documentos: [RUT_EN_LA_BOVEDA] }));
    }),
  });
  const alCerrar = vi.fn();
  render(
    <StrictMode>
      <ThemeProvider theme={createValidaloTheme('light', { app: 'public' })}>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <DialogoSubir solicitud={solicitud} onCerrar={alCerrar} />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </StrictMode>,
  );
  return alCerrar;
}

const SOLICITUD_DE_REQUISITO: SolicitudDeSubida = {
  nombre: TIPO.nombre,
  volver: '/expediente/e1',
  expediente: 'e1',
  requisito: 'r1',
  tipoDocumentoTenantId: 't1',
  vinculoId: 'v1',
};

beforeEach(() => {
  subirDocumentoSimulado.mockReset();
});
afterEach(() => {
  reiniciarCliente();
  useSesionTercero.setState({ estado: 'sin-sesion', sesion: null });
});

describe('subir desde el diálogo', () => {
  it('sin tipo, el tercero lo elige y sube; al terminar dice «Listo» y cierra, sin enlaces a otras pantallas', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    subirDocumentoSimulado.mockResolvedValue({ tipo: 'lista', version: version(1), compartidos: [] });
    const alCerrar = montar({});

    const dialogo = await screen.findByRole('dialog', { name: 'Subir documento' });
    const elegir = within(dialogo).getByRole('button', { name: 'Elegir archivo' });
    expect(elegir).toBeDisabled();

    await usuario.click(within(dialogo).getByRole('combobox', { name: 'Tipo de documento' }));
    await usuario.click(screen.getByRole('option', { name: 'RUT' }));
    expect(elegir).toBeEnabled();
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo());

    expect(await within(dialogo).findByText('Listo. Es tu versión 1 de RUT.')).toBeInTheDocument();
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'RUT' });
    expect(within(dialogo).queryByRole('link')).not.toBeInTheDocument();
    expect(alCerrar).not.toHaveBeenCalled();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('arranca la subida al elegir el archivo también en StrictMode (no se queda en «Preparando…»)', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    const subida = pendiente();
    subirDocumentoSimulado.mockReturnValue(subida.promesa);
    montar({ tipo: 'RUT', nombre: 'RUT' });

    const dialogo = await screen.findByRole('dialog', { name: 'Subir RUT' });
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo());

    expect(await within(dialogo).findByText('rut.pdf')).toBeInTheDocument();
    expect(within(dialogo).getByText('Preparando el archivo…')).toBeInTheDocument();
    expect(subirDocumentoSimulado).toHaveBeenCalledTimes(1);
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].senal?.aborted).toBe(false);
  });

  it('un tipo fijo de una revisión: título, reglas, plantilla y campos antes del archivo, sin «volver a mi revisión» al terminar', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    subirDocumentoSimulado.mockResolvedValue({ tipo: 'lista', version: version(1), compartidos: [] });
    montar(SOLICITUD_DE_REQUISITO);

    const dialogo = await screen.findByRole('dialog', { name: 'Subir Certificado Norte' });
    expect(await within(dialogo).findByText('Solo PDF de hasta 5 MB y 10 páginas')).toBeInTheDocument();
    expect(within(dialogo).getByText('Firmado por el representante legal.')).toBeInTheDocument();
    expect(within(dialogo).getByText('Descarga el formato, llénalo, fírmalo y súbelo.')).toBeInTheDocument();
    expect(within(dialogo).getByTestId('entrada-archivo')).toHaveAttribute('accept', 'application/pdf,.pdf');
    expect(within(dialogo).getByRole('button', { name: 'Elegir archivo' })).toBeDisabled();
    expect(within(dialogo).getByRole('status')).toHaveTextContent('Para subir el archivo, llena: Fecha de expedición.');
    // El tipo ya está fijado por la revisión: no hay selector de tipo.
    expect(within(dialogo).queryByRole('combobox', { name: 'Tipo de documento' })).not.toBeInTheDocument();

    await usuario.click(within(within(dialogo).getByRole('group', { name: /Fecha de expedición/ })).getByRole('spinbutton', { name: 'Día' }));
    await usuario.keyboard('01102026');
    expect(within(dialogo).getByRole('button', { name: 'Elegir archivo' })).toBeEnabled();
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo('certificado.pdf'));

    expect(await within(dialogo).findByText('Listo. Es tu versión 1 de Certificado Norte.')).toBeInTheDocument();
    const opciones = subirDocumentoSimulado.mock.calls[0]?.[0];
    expect(opciones?.destino).toEqual({ tipoDocumentoTenantId: 't1', vinculoId: 'v1' });
    expect(opciones?.datos).toMatchObject({ fecha_expedicion: '2026-10-01' });
    expect(within(dialogo).queryByRole('link', { name: 'Volver a mi revisión' })).not.toBeInTheDocument();
  });

  it('otra versión de un documento de la bóveda: el título lo dice y sube al mismo tipo', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    subirDocumentoSimulado.mockResolvedValue({ tipo: 'lista', version: version(2), compartidos: [] });
    montar({ documento: 'd1', tipo: 'RUT' });

    const dialogo = await screen.findByRole('dialog', { name: 'Nueva versión de Registro Único Tributario' });
    expect(within(dialogo).queryByRole('combobox', { name: 'Tipo de documento' })).not.toBeInTheDocument();
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo());

    expect(await within(dialogo).findByText('Listo. Es tu versión 2 de Registro Único Tributario.')).toBeInTheDocument();
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'RUT' });
  });

  it('el documento de una persona relacionada sube a la bóveda de la persona', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    subirDocumentoSimulado.mockResolvedValue({ tipo: 'lista', version: version(1), compartidos: [] });
    montar({ persona: 'p1', tipo: 'CEDULA', nombre: 'Cédula de ciudadanía' });

    const dialogo = await screen.findByRole('dialog', { name: 'Subir Cédula de ciudadanía' });
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo('cedula.pdf'));

    expect(await within(dialogo).findByText('Listo. Es tu versión 1 de Cédula de ciudadanía.')).toBeInTheDocument();
    expect(subirDocumentoSimulado.mock.calls[0]?.[0].destino).toEqual({ tipoCanonico: 'CEDULA', terceroRelacionadoId: 'p1' });
  });

  it('mientras sube no se puede cerrar (ni con «Cerrar» ni con Esc); cancelar la subida lo libera', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    subirDocumentoSimulado.mockReturnValue(pendiente().promesa);
    const alCerrar = montar({ tipo: 'RUT', nombre: 'RUT' });

    const dialogo = await screen.findByRole('dialog', { name: 'Subir RUT' });
    expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toBeEnabled();
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo());

    await within(dialogo).findByText('Preparando el archivo…');
    expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toBeDisabled();
    await usuario.keyboard('{Escape}');
    expect(alCerrar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Subir RUT' })).toBeInTheDocument();

    await usuario.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(within(dialogo).getByRole('button', { name: 'Cerrar' })).toBeEnabled();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Cerrar' }));
    expect(alCerrar).toHaveBeenCalledTimes(1);
  });

  it('un archivo que ya estaba, dice que es el mismo y deja elegir otro sin cerrar el diálogo', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    subirDocumentoSimulado.mockResolvedValue({ tipo: 'duplicado', numero: 3 });
    const alCerrar = montar({ tipo: 'RUT', nombre: 'RUT' });

    const dialogo = await screen.findByRole('dialog', { name: 'Subir RUT' });
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo());

    expect(await within(dialogo).findByText('Es el mismo archivo que ya tienes')).toBeInTheDocument();
    expect(within(dialogo).getByText('Es idéntico a tu versión 3: no hace falta subirlo de nuevo.')).toBeInTheDocument();
    await usuario.click(within(dialogo).getByRole('button', { name: 'Elegir otro archivo' }));
    expect(within(dialogo).getByRole('button', { name: 'Elegir archivo' })).toBeEnabled();
    expect(alCerrar).not.toHaveBeenCalled();
  });

  it('un archivo devuelto dice el motivo y deja elegir otro', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    const devuelta = { ...version(1), estado: 'Devuelta', motivoDevolucion: 'otro', detalleDevolucion: 'No se pudo leer el archivo.' } as VersionDocumentoDto;
    subirDocumentoSimulado.mockResolvedValue({ tipo: 'devuelta', version: devuelta });
    montar({ tipo: 'RUT', nombre: 'RUT' });

    const dialogo = await screen.findByRole('dialog', { name: 'Subir RUT' });
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), archivo());

    expect(await within(dialogo).findByText('Devolvimos este archivo')).toBeInTheDocument();
    expect(within(dialogo).getByText('No se pudo leer el archivo.')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Elegir otro archivo' })).toBeInTheDocument();
  });

  it('un archivo que no cumple las reglas del tipo se rechaza en el navegador y no sube nada', async () => {
    const usuario = userEvent.setup({ applyAccept: false });
    montar(SOLICITUD_DE_REQUISITO);

    const dialogo = await screen.findByRole('dialog', { name: 'Subir Certificado Norte' });
    await within(dialogo).findByText('Solo PDF de hasta 5 MB y 10 páginas');
    await usuario.click(within(within(dialogo).getByRole('group', { name: /Fecha de expedición/ })).getByRole('spinbutton', { name: 'Día' }));
    await usuario.keyboard('01102026');
    await usuario.upload(within(dialogo).getByTestId('entrada-archivo'), new File(['png'], 'foto.png', { type: 'image/png' }));

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Este formato no se acepta para este documento. Sube un archivo PDF.');
    expect(subirDocumentoSimulado).not.toHaveBeenCalled();
  });

  it('con acceso aislado avisa que lo que suba queda guardado solo para la empresa', async () => {
    const sesion: SesionTerceroDto = { accessToken: 't', expira: '2099-01-01T00:00:00Z', terceroId: 'ter', otpVerificado: false, vinculos: [], aislada: true, terceroEnmascarado: null };
    useSesionTercero.setState({ estado: 'activa', sesion });
    montar(SOLICITUD_DE_REQUISITO);

    const dialogo = await screen.findByRole('dialog', { name: 'Subir Certificado Norte' });
    expect(await within(dialogo).findByText('Lo que subas queda guardado solo para Constructora Norte hasta que aprueben tu acceso.')).toBeInTheDocument();
  });
});
