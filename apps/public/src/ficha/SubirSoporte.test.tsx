import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reiniciarCliente, type PerfilDeFichaDto, type PropuestaDeSeccionDto } from '@validalo/api-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VersionSubida } from '../boveda/subida';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { TIEMPOS_DE_LECTURA } from './propuestas';
import { documento, estadoFicha, filaEstado, guardada, json, montarFicha, seccion } from './pruebas/montar';

/**
 * «Subir un soporte» en una sección (FD-10): el tercero indica qué documento es, se sube por el diálogo de siempre con ese tipo canónico y la sección
 * marca el documento como soporte y lo lee: «Leyendo…», la propuesta con valores o por qué no la hay. El diálogo de subida y la carga en sí se prueban en
 * `DialogoSubir.test.tsx` y `subida.test.ts`; aquí se simula su final llamando a lo que el diálogo le avisa a la sección (`alSubir`).
 */

const TIEMPOS_ORIGINALES = { ...TIEMPOS_DE_LECTURA };

beforeEach(() => {
  // La lectura de verdad tarda segundos: en las pruebas se pregunta cada 25 ms y se espera 1,5 s antes de decir que no se pudo.
  TIEMPOS_DE_LECTURA.cadaMs = 25;
  TIEMPOS_DE_LECTURA.trasSubirMs = 1500;
});

afterEach(() => {
  Object.assign(TIEMPOS_DE_LECTURA, TIEMPOS_ORIGINALES);
  reiniciarCliente();
  useDialogoSubir.getState().cerrar();
});

const GENERAL = seccion('FICHA_GENERAL', {
  version: 1,
  versiones: 1,
  datos: { razon_social: 'Aceros del Norte S.A.S.', tipo_persona: 'Juridica', tipo_identificacion: 'NIT', numero: '900123456', dv: '8', correo: 'compras@aceros.co', pais: 'CO', direccion: 'Calle 45 # 12-08', telefono: '601 555 1234' },
  completitud: { completa: true, faltantes: [], reglaVersion: 1 },
});

const RUT_V2 = { documentoId: 'd-rut', version: 2, tipoDocumento: 'RUT', nombreDocumento: 'Registro Único Tributario', cargadaEn: '2026-11-25T15:00:00Z' };

/** Lo que el RUT que acaba de subir el tercero propone para la general. */
const CON_LECTURA: PropuestaDeSeccionDto = {
  seccion: 'FICHA_GENERAL',
  nombreSeccion: 'Información general',
  periodo: null,
  documento: RUT_V2,
  disponible: true,
  motivo: null,
  campos: [{ campo: 'direccion', etiqueta: 'Dirección', actual: 'Calle 45 # 12-08', propuesto: 'Cl 80 # 10-20' }],
  datos: { ...GENERAL.datos, direccion: 'Cl 80 # 10-20' },
};

const SIN_LECTURA: PropuestaDeSeccionDto = { ...CON_LECTURA, disponible: false, motivo: 'sin-lectura-automatica', campos: [], datos: undefined };

const PREGUNTA = '¿Qué documento vas a subir?';
const RUT = 'Registro Único Tributario (RUT)';

/** El RUT en la bóveda del tercero (versión 2), como lo deja la subida. */
const BOVEDA = [documento('d-rut', 'RUT', 'Registro Único Tributario')];

/** Elige qué documento es en «Subir un soporte» y lo sube: el diálogo queda pedido con ese tipo. */
async function elegirYSubir(usuario: ReturnType<typeof userEvent.setup>, nombre: string | null) {
  if (nombre) {
    await usuario.click(await screen.findByRole('combobox', { name: PREGUNTA }));
    await usuario.click(screen.getByRole('option', { name: nombre }));
  }
  await usuario.click(screen.getByRole('button', { name: 'Subir un soporte' }));
}

/** El diálogo de subida terminó de subir la versión: se lo avisa a la sección, como `useSubida`. */
async function terminarSubida(subida: VersionSubida) {
  await act(async () => {
    useDialogoSubir.getState().solicitud?.alSubir?.(subida);
    await Promise.resolve();
  });
}

const RUT_SUBIDO: VersionSubida = { documentoId: 'd-rut', version: 2, compartida: true };
const estadoDeLaLectura = (nombre: string) => screen.queryByRole('status', { name: nombre });

describe('Subir un soporte: elegir qué documento es', () => {
  it('con varios documentos posibles no se supone cuál es: hay que elegir, y se sube como ese tipo canónico', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', { estado: estadoFicha(), secciones: { FICHA_GENERAL: GENERAL } });

    const pregunta = await screen.findByRole('combobox', { name: PREGUNTA });
    expect(screen.getByRole('button', { name: 'Subir un soporte' })).toBeDisabled();
    expect(screen.getByText('Elige cuál es para guardarlo como tal y, si lo podemos leer, proponerte los datos.')).toBeInTheDocument();

    await usuario.click(pregunta);
    // La general de una jurídica: el RUT o la Cámara; «Otro documento» queda de último.
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([RUT, 'Cámara de comercio', 'Otro documento']);
    await usuario.click(screen.getByRole('option', { name: 'Cámara de comercio' }));
    expect(screen.getByText('Certificado de existencia y representación legal expedido por tu Cámara de comercio.')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Subir un soporte' }));

    expect(useDialogoSubir.getState().solicitud).toMatchObject({ tipo: 'CAMARA_COMERCIO', nombre: 'Certificado de existencia y representación legal' });
    // Va como documento global de la bóveda: sin vínculo, sin persona ni requisito.
    expect(useDialogoSubir.getState().solicitud).not.toHaveProperty('vinculoId');
  });

  it('la general de una persona natural ofrece el RUT y la cédula', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', { estado: estadoFicha({ tipoPersona: 'Natural' }), secciones: { FICHA_GENERAL: GENERAL } });

    await usuario.click(await screen.findByRole('combobox', { name: PREGUNTA }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([RUT, 'Cédula de ciudadanía', 'Otro documento']);
  });

  it('con un solo documento posible (el RUT en la tributaria) va preseleccionado y se sube sin elegir', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/tributaria', { estado: estadoFicha() });

    const pregunta = await screen.findByRole('combobox', { name: PREGUNTA });
    expect(pregunta).toHaveTextContent(RUT);
    expect(screen.getByRole('button', { name: 'Subir un soporte' })).toBeEnabled();
    await elegirYSubir(usuario, null);

    expect(useDialogoSubir.getState().solicitud).toMatchObject({ tipo: 'RUT', nombre: 'Registro Único Tributario' });
  });

  it('la financiera ofrece los estados financieros, preseleccionados', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/financiera?periodo=2025', { estado: estadoFicha() });

    expect(await screen.findByRole('combobox', { name: PREGUNTA })).toHaveTextContent('Estados financieros');
    await elegirYSubir(usuario, null);
    expect(useDialogoSubir.getState().solicitud).toMatchObject({ tipo: 'ESTADOS_FINANCIEROS', nombre: 'Estados financieros' });
  });

  it('«Otro documento» conserva el soporte genérico, con un nombre claro', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/tributaria', { estado: estadoFicha() });

    await elegirYSubir(usuario, 'Otro documento');
    expect(useDialogoSubir.getState().solicitud).toMatchObject({ tipo: 'SOPORTE_FICHA', nombre: 'Otro soporte' });
    // Y dice que ese no se lee (no se propone nada de él).
    expect(screen.getByText('Cualquier otro documento que respalde estos datos. No lo leemos para proponerte valores.')).toBeInTheDocument();
  });

  it('una sección sin documentos propios (SST) no pregunta: sube un soporte genérico', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/sst', { estado: estadoFicha() });

    const boton = await screen.findByRole('button', { name: 'Subir un soporte' });
    expect(screen.queryByRole('combobox', { name: PREGUNTA })).not.toBeInTheDocument();
    await usuario.click(boton);
    expect(useDialogoSubir.getState().solicitud).toMatchObject({ tipo: 'SOPORTE_FICHA', nombre: 'Otro soporte' });
  });

  it('un tercero de otro país no ve el RUT, la Cámara ni la cédula (no se leen): solo sube «Otro documento»', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    const perfil = { pais: 'PA', tipoIdentificacion: 'RUC', dvDeclarado: true, modeloTributario: 'Generico', autoridadTributaria: 'DGI', impuestoVentas: 'ITBMS', regimenes: [], tiposDePersona: ['RUC'], tiposConDvDeclarado: ['RUC'] } satisfies PerfilDeFichaDto;
    montarFicha('/ficha/general', { estado: estadoFicha({ perfil }), secciones: { FICHA_GENERAL: { ...GENERAL, datos: { ...GENERAL.datos, pais: 'PA' } } } });

    const boton = await screen.findByRole('button', { name: 'Subir un soporte' });
    expect(screen.queryByRole('combobox', { name: PREGUNTA })).not.toBeInTheDocument();
    await usuario.click(boton);
    expect(useDialogoSubir.getState().solicitud).toMatchObject({ tipo: 'SOPORTE_FICHA' });
  });
});

describe('Subir un soporte: lo que sube queda marcado y la sección lo lee', () => {
  it('queda marcado como soporte, dice que lo está leyendo y, al terminar la IA, propone los valores campo por campo', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    const propuestas: PropuestaDeSeccionDto[] = [];
    const guardados = montarFicha('/ficha/general', {
      estado: estadoFicha(),
      secciones: { FICHA_GENERAL: GENERAL },
      documentos: BOVEDA,
      propuestas,
      alGuardar: () => json(200, guardada('FICHA_GENERAL', [], 'FICHA_TRIBUTARIA')),
    });
    await elegirYSubir(usuario, RUT);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    // El RUT quedó en la bóveda y la IA aún no lo lee.
    propuestas.push(SIN_LECTURA);
    await terminarSubida(RUT_SUBIDO);

    const leyendo = await screen.findByRole('status', { name: 'Leyendo el documento que subiste' });
    expect(leyendo).toHaveTextContent('Registro Único Tributario · versión 2');
    expect(within(leyendo).getByRole('progressbar', { name: 'Leyendo el documento' })).toBeInTheDocument();
    // La línea del RUT sin lectura no se repite en el aviso de propuestas: habla solo el de la lectura.
    expect(screen.queryByRole('alert', { name: 'Tienes documentos más nuevos que esta sección' })).not.toBeInTheDocument();
    expect(await screen.findByRole('checkbox', { name: 'Registro Único Tributario · versión 2 · cargada el 01/10/2026' })).toBeChecked();
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    expect(guardados).toHaveLength(0);

    // La IA terminó: la sección propone, como en «Actualizar desde mi RUT».
    propuestas[0] = CON_LECTURA;
    const propuesta = await screen.findByRole('alert', { name: 'Tienes documentos más nuevos que esta sección' });
    expect(propuesta).toHaveTextContent('Tu RUT · versión 2');
    expect(within(propuesta).getByText('1 dato distinto')).toBeInTheDocument();
    expect(estadoDeLaLectura('Leyendo el documento que subiste')).not.toBeInTheDocument();
    await usuario.click(within(propuesta).getByRole('button', { name: 'Ver los cambios de mi RUT' }));
    expect(within(propuesta).getByRole('table', { name: 'Datos que cambian según tu RUT' })).toHaveTextContent('Cl 80 # 10-20');
    // Nada cambió en el formulario hasta que el tercero use los valores.
    expect(screen.getByRole('textbox', { name: 'Dirección' })).toHaveValue('Calle 45 # 12-08');

    await usuario.click(within(propuesta).getByRole('button', { name: 'Usar los valores de mi RUT' }));
    expect(screen.getByRole('textbox', { name: 'Dirección' })).toHaveValue('Cl 80 # 10-20');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toMatchObject({ datos: { direccion: 'Cl 80 # 10-20' }, soportes: [{ documentoId: 'd-rut', version: 2 }] });
  });

  it('al cerrarse el diálogo de subida lleva la vista al aviso de la lectura (con el diálogo abierto el foco no sale de él)', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', { estado: estadoFicha(), secciones: { FICHA_GENERAL: GENERAL }, documentos: BOVEDA, propuestas: [SIN_LECTURA] });
    await elegirYSubir(usuario, RUT);
    await terminarSubida(RUT_SUBIDO);

    const zona = (await screen.findByRole('status', { name: 'Leyendo el documento que subiste' })).parentElement;
    expect(zona).not.toHaveFocus();

    // «Listo» en el diálogo: la sección estaba abajo, en el soporte, y lo que dice la lectura está arriba.
    act(() => useDialogoSubir.getState().cerrar());
    await vi.waitFor(() => expect(zona).toHaveFocus());
  });

  it('si la IA no está disponible (o se agotó el cupo) lo dice al agotarse la espera y deja el soporte marcado, sin propuesta', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    TIEMPOS_DE_LECTURA.trasSubirMs = 400;
    montarFicha('/ficha/general', { estado: estadoFicha(), secciones: { FICHA_GENERAL: GENERAL }, documentos: BOVEDA, propuestas: [SIN_LECTURA] });
    await elegirYSubir(usuario, RUT);
    await terminarSubida(RUT_SUBIDO);

    expect(await screen.findByRole('status', { name: 'Leyendo el documento que subiste' })).toBeInTheDocument();
    const aviso = await screen.findByRole('status', { name: 'No pudimos leer el documento' });
    expect(aviso).toHaveTextContent('Registro Único Tributario (versión 2) quedó como soporte de esta sección. Diligencia los datos con el documento a la vista.');
    expect(estadoDeLaLectura('Leyendo el documento que subiste')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Registro Único Tributario · versión 2/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: /^Usar los valores/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: 'Tienes documentos más nuevos que esta sección' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Dirección' })).toHaveValue('Calle 45 # 12-08');

    // El aviso se cierra.
    await usuario.click(within(aviso).getByRole('button', { name: 'Cerrar' }));
    expect(estadoDeLaLectura('No pudimos leer el documento')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Registro Único Tributario · versión 2/ })).toBeChecked();
  });

  it('si ninguna empresa lo recibió no hay quién pague la lectura: no espera, lo dice de una vez', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', { estado: estadoFicha(), secciones: { FICHA_GENERAL: GENERAL }, documentos: BOVEDA, propuestas: [SIN_LECTURA] });
    await elegirYSubir(usuario, RUT);
    await terminarSubida({ ...RUT_SUBIDO, compartida: false });

    expect(await screen.findByRole('status', { name: 'No pudimos leer el documento' })).toBeInTheDocument();
    expect(estadoDeLaLectura('Leyendo el documento que subiste')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Registro Único Tributario · versión 2/ })).toBeChecked();
  });

  it('un documento ilegible lo dice y pide una copia más clara, sin esperar', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', {
      estado: estadoFicha(),
      secciones: { FICHA_GENERAL: GENERAL },
      documentos: BOVEDA,
      propuestas: [{ ...SIN_LECTURA, motivo: 'documento-ilegible' }],
    });
    await elegirYSubir(usuario, RUT);
    await terminarSubida(RUT_SUBIDO);

    const aviso = await screen.findByRole('status', { name: 'El documento no se lee bien' });
    expect(aviso).toHaveTextContent('Sube una copia más clara');
    expect(estadoDeLaLectura('Leyendo el documento que subiste')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Registro Único Tributario · versión 2/ })).toBeChecked();
  });

  it('si lo leyó y no trae nada distinto, lo dice y el documento queda como soporte', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', { estado: estadoFicha(), secciones: { FICHA_GENERAL: GENERAL }, documentos: BOVEDA, propuestas: [] });
    await elegirYSubir(usuario, RUT);
    await terminarSubida(RUT_SUBIDO);

    const aviso = await screen.findByRole('status', { name: 'Leímos el documento' });
    expect(aviso).toHaveTextContent('no trae datos distintos a los de esta sección');
    expect(screen.getByRole('checkbox', { name: /Registro Único Tributario · versión 2/ })).toBeChecked();
  });

  it('«Otro documento» solo queda marcado como soporte: no hay nada que leer', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    montarFicha('/ficha/general', {
      estado: estadoFicha(),
      secciones: { FICHA_GENERAL: GENERAL },
      documentos: [documento('d-otro', 'SOPORTE_FICHA', 'Otro soporte')],
    });
    await elegirYSubir(usuario, 'Otro documento');
    await terminarSubida({ documentoId: 'd-otro', version: 2, compartida: false });

    // La lista muestra el nombre claro y el documento ya está marcado.
    expect(await screen.findByRole('checkbox', { name: 'Otro soporte · versión 2 · cargada el 01/10/2026' })).toBeChecked();
    expect(screen.getByText('Tienes cambios sin guardar')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('una versión nueva del mismo documento reemplaza a la anterior en los soportes de lo que se guarda', async () => {
    const usuario = userEvent.setup({ delay: 0 });
    const anterior = { documentoId: 'd-rut', version: 1, tipoDocumento: 'RUT', nombre: 'Registro Único Tributario' };
    const guardados = montarFicha('/ficha/general', {
      estado: estadoFicha(),
      secciones: { FICHA_GENERAL: { ...GENERAL, soportes: [anterior] } },
      documentos: BOVEDA,
      propuestas: [],
      alGuardar: () => json(200, guardada('FICHA_GENERAL', [], null)),
    });
    await elegirYSubir(usuario, RUT);
    await terminarSubida(RUT_SUBIDO);
    await screen.findByRole('status', { name: 'Leímos el documento' });

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toMatchObject({ soportes: [{ documentoId: 'd-rut', version: 2 }] });
    // Guardar cierra lo que se esperaba del documento: ya no hay aviso.
    expect(estadoDeLaLectura('Leímos el documento')).not.toBeInTheDocument();
  });

  it('la lista muestra el nombre real del documento y un soporte genérico de antes se ve como «Otro soporte»', async () => {
    montarFicha('/ficha/general', {
      estado: estadoFicha({ secciones: [filaEstado('FICHA_GENERAL', { version: 1, completa: true })] }),
      secciones: { FICHA_GENERAL: GENERAL },
      documentos: [documento('d-rut', 'RUT', 'Registro Único Tributario'), documento('d-viejo', 'SOPORTE_FICHA', 'Otro soporte')],
    });

    const lista = await screen.findByRole('group', { name: 'Documento que respalda esta información' });
    expect(await within(lista).findByRole('checkbox', { name: 'Registro Único Tributario · versión 2 · cargada el 01/10/2026' })).toBeInTheDocument();
    expect(within(lista).getByRole('checkbox', { name: 'Otro soporte · versión 2 · cargada el 01/10/2026' })).toBeInTheDocument();
    expect(within(lista).queryByText(/Soporte de la ficha/)).not.toBeInTheDocument();
  });
});
