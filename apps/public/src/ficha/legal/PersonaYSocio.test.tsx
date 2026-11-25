import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reiniciarCliente, type DocumentoDePersonaDto, type RelacionEntreTercerosDto } from '@validalo/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDialogoSubir } from '../../boveda/useDialogoSubir';
import { completarPersona, escribir, estadoFicha, guardada, json, montarFicha, seccion } from '../pruebas/montar';

afterEach(() => {
  reiniciarCliente();
  useDialogoSubir.getState().cerrar();
});

type Usuario = ReturnType<typeof userEvent.setup>;

const JOEL = { tipo_identificacion: 'CC', numero: '1020304050', nombres: 'Joel Mateo', apellidos: 'Robles Atuesta', pep: false, vinculo_pep: false };
const REPRESENTANTE = { ...JOEL, rol: 'RepresentanteLegal' };
const SOCIO = { ...JOEL, rol: 'Socio', porcentaje: 100 };
const NOMBRE = 'Joel Mateo Robles Atuesta';

interface Opciones {
  alGuardar?: () => Response;
  faltantes?: { campo: string | null; regla: string; mensaje: string }[];
  relaciones?: RelacionEntreTercerosDto[];
}

const montarLegal = (personas: object[], { alGuardar, faltantes = [], relaciones }: Opciones = {}) =>
  montarFicha('/ficha/legal', {
    estado: estadoFicha(),
    secciones: {
      FICHA_LEGAL: seccion('FICHA_LEGAL', { version: 1, versiones: 1, datos: { personas }, completitud: { completa: faltantes.length === 0, faltantes, reglaVersion: 1 } }),
    },
    alGuardar: alGuardar ?? (() => json(200, guardada('FICHA_LEGAL', [], 'FICHA_FINANCIERA'))),
    relaciones,
  });

const abrirNueva = async (usuario: Usuario) => {
  await usuario.click(await screen.findByRole('button', { name: 'Agregar persona' }));
  return screen.getByRole('dialog', { name: 'Agregar persona' });
};

const elegirRol = async (usuario: Usuario, dialogo: HTMLElement, rol: string) => {
  await usuario.click(within(dialogo).getByRole('combobox', { name: 'Rol' }));
  await usuario.click(screen.getByRole('option', { name: rol }));
};

/** Los datos de identidad de Joel, escritos en el diálogo. */
const escribirIdentidad = async (usuario: Usuario, dialogo: HTMLElement) => {
  await usuario.click(within(dialogo).getByRole('combobox', { name: 'Tipo de identificación' }));
  await usuario.click(screen.getByRole('option', { name: 'CC' }));
  await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Número de identificación' }), '1020304050');
  await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Nombres' }), 'Joel Mateo');
  await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Apellidos' }), 'Robles Atuesta');
};

const lista = () => screen.getByRole('list', { name: 'Personas relacionadas' });
const listo = (dialogo: HTMLElement) => within(dialogo).getByRole('button', { name: 'Listo' });
const pie = (dialogo: HTMLElement) => within(dialogo).queryByRole('status');
const pregunta = (dialogo: HTMLElement, nombre: string) => within(dialogo).getByRole('radiogroup', { name: nombre });

describe('Información legal: el diálogo según el rol', () => {
  it('muestra los campos que aplican al rol elegido', async () => {
    const usuario = userEvent.setup();
    montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    // Sin rol todavía no hay tipo de representación, cargo sí, ni pregunta de socio.
    expect(within(dialogo).queryByRole('textbox', { name: 'Tipo de representación' })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('radiogroup', { name: '¿También es socio o accionista?' })).not.toBeInTheDocument();

    await elegirRol(usuario, dialogo, 'Representante legal');
    expect(within(dialogo).getByRole('textbox', { name: 'Tipo de representación' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('textbox', { name: 'Cargo' })).toBeInTheDocument();
    expect(pregunta(dialogo, '¿También es socio o accionista?')).toBeInTheDocument();
    // El porcentaje solo con «Sí»: la pregunta lo pide y se muestra con su etiqueta completa.
    expect(within(dialogo).queryByRole('textbox', { name: 'Porcentaje de participación (%)' })).not.toBeInTheDocument();
    await usuario.click(within(pregunta(dialogo, '¿También es socio o accionista?')).getByRole('radio', { name: 'Sí' }));
    expect(within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' })).toBeInTheDocument();
    await usuario.click(within(pregunta(dialogo, '¿También es socio o accionista?')).getByRole('radio', { name: 'No' }));
    expect(within(dialogo).queryByRole('textbox', { name: 'Porcentaje de participación (%)' })).not.toBeInTheDocument();

    await elegirRol(usuario, dialogo, 'Socio o accionista');
    expect(within(dialogo).queryByRole('textbox', { name: 'Tipo de representación' })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('textbox', { name: 'Cargo' })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('radiogroup', { name: '¿También es socio o accionista?' })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' })).toBeInTheDocument();

    await elegirRol(usuario, dialogo, 'Contador');
    expect(within(dialogo).queryByRole('textbox', { name: 'Tipo de representación' })).not.toBeInTheDocument();
    expect(within(dialogo).getByRole('textbox', { name: 'Cargo' })).toBeInTheDocument();
    expect(pregunta(dialogo, '¿También es socio o accionista?')).toBeInTheDocument();

    await elegirRol(usuario, dialogo, 'Apoderado');
    expect(within(dialogo).getByRole('textbox', { name: 'Tipo de representación' })).toBeInTheDocument();
  });

  it('los obligatorios del rol llevan asterisco y lo que no aplica no', async () => {
    const usuario = userEvent.setup();
    montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    await elegirRol(usuario, dialogo, 'Representante legal');
    expect(within(dialogo).getByRole('textbox', { name: 'Número de identificación' })).toBeRequired();
    expect(within(dialogo).getByRole('textbox', { name: 'Nombres' })).toBeRequired();
    expect(within(dialogo).getByRole('textbox', { name: 'Apellidos' })).toBeRequired();
    expect(within(dialogo).getByRole('textbox', { name: 'Cargo' })).not.toBeRequired();
    expect(within(dialogo).getByRole('textbox', { name: 'Correo electrónico' })).not.toBeRequired();
  });

  it('al cambiar de rol se vacían los campos que dejan de aplicar', async () => {
    const usuario = userEvent.setup();
    montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    await elegirRol(usuario, dialogo, 'Representante legal');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Tipo de representación' }), 'Principal');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Cargo' }), 'Gerente');

    await elegirRol(usuario, dialogo, 'Socio o accionista');
    await elegirRol(usuario, dialogo, 'Representante legal');
    // No queda basura del rol anterior al volver.
    expect(within(dialogo).getByRole('textbox', { name: 'Tipo de representación' })).toHaveValue('');
    expect(within(dialogo).getByRole('textbox', { name: 'Cargo' })).toHaveValue('');

    // Pasar a un rol que conserva el cargo no lo borra; el tipo de representación sí.
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Tipo de representación' }), 'Primer suplente');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Cargo' }), 'Jefe');
    await elegirRol(usuario, dialogo, 'Contador');
    expect(within(dialogo).getByRole('textbox', { name: 'Cargo' })).toHaveValue('Jefe');
    await elegirRol(usuario, dialogo, 'Suplente');
    expect(within(dialogo).getByRole('textbox', { name: 'Tipo de representación' })).toHaveValue('');
  });

  it('«Listo» está deshabilitado y el pie dice qué falta; al completar se habilita y el pie desaparece', async () => {
    const usuario = userEvent.setup();
    montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    expect(listo(dialogo)).toBeDisabled();
    expect(pie(dialogo)).toHaveTextContent('Falta: rol, tipo de identificación, número de identificación y 4 más');

    await elegirRol(usuario, dialogo, 'Representante legal');
    expect(pie(dialogo)).toHaveTextContent('Falta: ¿también es socio o accionista?, tipo de identificación, número de identificación y 4 más');

    await escribirIdentidad(usuario, dialogo);
    expect(pie(dialogo)).toHaveTextContent('Falta: ¿también es socio o accionista?, ¿es PEP?, ¿tiene vínculo con una PEP?');
    expect(listo(dialogo)).toBeDisabled();

    await usuario.click(within(pregunta(dialogo, '¿También es socio o accionista?')).getByRole('radio', { name: 'No' }));
    await usuario.click(within(pregunta(dialogo, '¿Es persona expuesta políticamente (PEP)?')).getByRole('radio', { name: 'No' }));
    expect(pie(dialogo)).toHaveTextContent('Falta: ¿tiene vínculo con una PEP?');
    await usuario.click(within(pregunta(dialogo, '¿Tiene vínculo con una persona expuesta políticamente?')).getByRole('radio', { name: 'No' }));
    expect(pie(dialogo)).not.toBeInTheDocument();
    expect(listo(dialogo)).toBeEnabled();
  });

  it('cambiar el rol a Socio exige el porcentaje y vuelve a deshabilitar «Listo»', async () => {
    const usuario = userEvent.setup();
    montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    await escribirIdentidad(usuario, dialogo);
    await completarPersona(usuario, dialogo, 'Representante legal');
    expect(listo(dialogo)).toBeEnabled();

    await elegirRol(usuario, dialogo, 'Socio o accionista');
    expect(listo(dialogo)).toBeDisabled();
    expect(pie(dialogo)).toHaveTextContent('Falta: porcentaje de participación');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' }), '40');
    expect(listo(dialogo)).toBeEnabled();
  });

  it('un formato inválido se marca al salir del campo, no antes, y se corrige solo al arreglarlo', async () => {
    const usuario = userEvent.setup();
    montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    await escribirIdentidad(usuario, dialogo);
    await completarPersona(usuario, dialogo, 'Socio o accionista', 'No', '150');
    const correo = within(dialogo).getByRole('textbox', { name: 'Correo electrónico' });
    await escribir(usuario, correo, 'sin-arroba');
    // Mientras escribe no se marca; «Listo» ya espera.
    expect(correo).toHaveAttribute('aria-invalid', 'false');
    expect(listo(dialogo)).toBeDisabled();
    expect(pie(dialogo)).toHaveTextContent('Revisa: porcentaje de participación, correo electrónico');

    await usuario.tab();
    expect(correo).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialogo).getByText('Escribe un correo válido, como nombre@empresa.com.')).toBeInTheDocument();
    const porcentaje = within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' });
    await usuario.click(porcentaje);
    await usuario.tab();
    expect(within(dialogo).getByText('El porcentaje va de 0 a 100.')).toBeInTheDocument();

    await usuario.clear(porcentaje);
    await escribir(usuario, porcentaje, '45');
    await usuario.clear(correo);
    await escribir(usuario, correo, 'joel@correo.co');
    await usuario.tab();
    expect(within(dialogo).queryByText('Escribe un correo válido, como nombre@empresa.com.')).not.toBeInTheDocument();
    expect(listo(dialogo)).toBeEnabled();
  });
});

describe('Información legal: una persona con dos roles', () => {
  it('representante legal y socio: una tarjeta, dos filas, y el porcentaje solo en la de Socio', async () => {
    const usuario = userEvent.setup();
    const guardados = montarLegal([]);
    const dialogo = await abrirNueva(usuario);
    await escribirIdentidad(usuario, dialogo);
    await completarPersona(usuario, dialogo, 'Representante legal', 'Sí', '100');
    await usuario.click(listo(dialogo));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Una sola persona con sus dos roles y la participación.
    expect(within(lista()).getAllByRole('listitem')).toHaveLength(1);
    expect(within(lista()).getByRole('listitem', { name: NOMBRE })).toHaveTextContent('Representante legal · Socio o accionista · CC 1020304050 · 100 %');

    await usuario.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    // Mismos datos de identidad en las dos filas; el porcentaje, solo en la de Socio (la del representante no lo lleva).
    expect(guardados[0]?.cuerpo).toEqual({ datos: { personas: [REPRESENTANTE, SOCIO] }, soportes: [] });
  });

  it('al editar abre con «Sí» y el porcentaje; guardar sincroniza las dos filas', async () => {
    const usuario = userEvent.setup();
    const guardados = montarLegal([REPRESENTANTE, SOCIO]);
    await usuario.click(await screen.findByRole('button', { name: `Editar a ${NOMBRE}` }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar persona' });
    expect(within(pregunta(dialogo, '¿También es socio o accionista?')).getByRole('radio', { name: 'Sí' })).toBeChecked();
    expect(within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' })).toHaveValue('100');

    await usuario.click(within(dialogo).getByRole('textbox', { name: 'Correo electrónico' }));
    await usuario.paste('joel@correo.co');
    await usuario.clear(within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' }), '60');
    await usuario.click(listo(dialogo));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(lista()).getByRole('listitem', { name: NOMBRE })).toHaveTextContent('Representante legal · Socio o accionista · CC 1020304050 · 60 %');

    await usuario.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toEqual({
      datos: { personas: [{ ...REPRESENTANTE, correo: 'joel@correo.co' }, { ...SOCIO, correo: 'joel@correo.co', porcentaje: 60 }] },
      soportes: [],
    });
  });

  it('desmarcar «también es socio» quita la fila de Socio', async () => {
    const usuario = userEvent.setup();
    const guardados = montarLegal([REPRESENTANTE, SOCIO]);
    await usuario.click(await screen.findByRole('button', { name: `Editar a ${NOMBRE}` }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar persona' });
    await usuario.click(within(pregunta(dialogo, '¿También es socio o accionista?')).getByRole('radio', { name: 'No' }));
    expect(within(dialogo).queryByRole('textbox', { name: 'Porcentaje de participación (%)' })).not.toBeInTheDocument();
    await usuario.click(listo(dialogo));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(within(lista()).getByRole('listitem', { name: NOMBRE })).toHaveTextContent('Representante legal · CC 1020304050');
    expect(within(lista()).getByRole('listitem', { name: NOMBRE })).not.toHaveTextContent('Socio');

    await usuario.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toEqual({ datos: { personas: [REPRESENTANTE] }, soportes: [] });
  });

  it('quitarla confirma qué se borra y quita las dos filas', async () => {
    const usuario = userEvent.setup();
    const guardados = montarLegal([REPRESENTANTE, SOCIO]);
    await usuario.click(await screen.findByRole('button', { name: `Quitar a ${NOMBRE}` }));
    const confirmacion = screen.getByRole('dialog', { name: `¿Quitar a ${NOMBRE}?` });
    expect(confirmacion).toHaveTextContent('Representante legal y Socio o accionista');
    // Cancelar no borra nada.
    await usuario.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
    expect(within(lista()).getAllByRole('listitem')).toHaveLength(1);

    await usuario.click(screen.getByRole('button', { name: `Quitar a ${NOMBRE}` }));
    await usuario.click(within(screen.getByRole('dialog', { name: `¿Quitar a ${NOMBRE}?` })).getByRole('button', { name: 'Quitar' }));
    expect(screen.getByText('Aún no registras personas.')).toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Guardar y continuar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toEqual({ datos: { personas: null }, soportes: [] });
  });

  it('los datos de antes (el representante con porcentaje y sin fila de Socio) abren como «también es socio»', async () => {
    const usuario = userEvent.setup();
    montarLegal([{ ...REPRESENTANTE, porcentaje: 100 }]);
    expect(within(await screen.findByRole('listitem', { name: NOMBRE })).queryByText(/100 %/)).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: `Editar a ${NOMBRE}` }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar persona' });
    expect(within(pregunta(dialogo, '¿También es socio o accionista?')).getByRole('radio', { name: 'Sí' })).toBeChecked();
    expect(within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' })).toHaveValue('100');
  });

  it('un error del servidor de la fila de Socio se ve en el diálogo de la persona y se limpia al tocar el campo', async () => {
    const usuario = userEvent.setup();
    montarLegal([REPRESENTANTE, { ...SOCIO, porcentaje: undefined }], {
      faltantes: [{ campo: 'personas[1].porcentaje', regla: 'valor-requerido', mensaje: 'Falta «Porcentaje de participación».' }],
    });
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    // La tarjeta cuenta el dato que falta aunque sea de la fila de Socio.
    expect(within(tarjeta).getByText('Le falta 1 dato')).toBeInTheDocument();
    await usuario.click(within(tarjeta).getByRole('button', { name: `Editar a ${NOMBRE}` }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar persona' });
    const porcentaje = within(dialogo).getByRole('textbox', { name: 'Porcentaje de participación (%)' });
    expect(porcentaje).toBeInvalid();
    expect(within(dialogo).getByText('Falta «Porcentaje de participación».')).toBeInTheDocument();
    expect(listo(dialogo)).toBeDisabled();

    await escribir(usuario, porcentaje, '35');
    expect(within(dialogo).queryByText('Falta «Porcentaje de participación».')).not.toBeInTheDocument();
    expect(listo(dialogo)).toBeEnabled();
  });

  it('un error de la fila del rol (el número) también se ve en el diálogo, aunque la tarjeta junte las dos filas', async () => {
    const usuario = userEvent.setup();
    montarLegal([REPRESENTANTE, SOCIO], { faltantes: [{ campo: 'personas[0].numero', regla: 'valor-invalido', mensaje: '«1020304050» no es un número de CC válido.' }] });
    await usuario.click(await screen.findByRole('button', { name: `Editar a ${NOMBRE}` }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar persona' });
    expect(within(dialogo).getByText('«1020304050» no es un número de CC válido.')).toBeInTheDocument();
  });
});

describe('Información legal: el documento de identidad de la persona', () => {
  const documento = (cambios: Partial<DocumentoDePersonaDto> = {}): DocumentoDePersonaDto => ({
    tipoCanonico: 'CEDULA',
    nombre: 'Cédula de ciudadanía',
    documentoId: null,
    version: null,
    estado: null,
    cargadaEn: null,
    pedido: true,
    ...cambios,
  });
  const relacion = (tipo: string, documentos: DocumentoDePersonaDto[]): RelacionEntreTercerosDto => ({
    id: `r-${tipo}`,
    personaId: 'persona-joel',
    identificacion: { pais: 'CO', tipo: 'CC', numero: '1020304050' },
    nombre: NOMBRE,
    tipo,
    principal: tipo === 'RepresentanteLegal',
    participacion: tipo === 'Socio' ? 100 : null,
    cargo: null,
    vigenteDesde: '2026-11-24',
    vigenteHasta: null,
    estado: 'Confirmada',
    fuente: 'Declarada',
    deFicha: true,
    confianza: null,
    confirmadaEn: '2026-11-24T10:00:00Z',
    documentos,
  });
  const CARGADA = documento({ documentoId: 'doc-1', version: 2, estado: 'Actual', cargadaEn: '2026-11-20T15:00:00Z', pedido: false });

  it('la tarjeta muestra el documento vigente de la persona, con su versión y la acción de reemplazarlo', async () => {
    montarLegal([REPRESENTANTE], { relaciones: [relacion('RepresentanteLegal', [CARGADA])] });
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    const lista = await within(tarjeta).findByRole('list', { name: 'Documento de identidad' });
    expect(lista).toHaveTextContent('Cédula de ciudadanía');
    expect(lista).toHaveTextContent('Versión 2');
    expect(lista).toHaveTextContent('Vigente');
    expect(within(lista).getByRole('button', { name: 'Subir otra versión: Cédula de ciudadanía' })).toBeInTheDocument();
  });

  it('sin documento muestra «Subir» y abre la subida con la persona y el tipo del requisito', async () => {
    const usuario = userEvent.setup();
    montarLegal([REPRESENTANTE], { relaciones: [relacion('RepresentanteLegal', [documento()])] });
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    const lista = await within(tarjeta).findByRole('list', { name: 'Documento de identidad' });
    expect(lista).toHaveTextContent('Te lo pide una empresa');
    await usuario.click(within(lista).getByRole('button', { name: 'Subir: Cédula de ciudadanía' }));
    // La misma solicitud que usa el requisito «Fotocopia de la cédula del representante legal»: va a la bóveda de la persona.
    expect(useDialogoSubir.getState().solicitud).toEqual({ persona: 'persona-joel', tipo: 'CEDULA', nombre: 'Cédula de ciudadanía' });
  });

  it('una persona con dos roles tiene un solo documento, no dos', async () => {
    montarLegal([REPRESENTANTE, SOCIO], { relaciones: [relacion('RepresentanteLegal', [CARGADA]), relacion('Socio', [CARGADA])] });
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    await within(tarjeta).findByRole('list', { name: 'Documento de identidad' });
    expect(within(tarjeta).getAllByRole('button', { name: /Subir otra versión/ })).toHaveLength(1);
    expect(screen.getAllByRole('list', { name: 'Documento de identidad' })).toHaveLength(1);
  });

  it('quien identifica con pasaporte sube el pasaporte', async () => {
    const pasaporte = documento({ tipoCanonico: 'PASAPORTE', nombre: 'Pasaporte' });
    montarLegal([{ ...REPRESENTANTE, tipo_identificacion: 'PA' }], {
      relaciones: [{ ...relacion('RepresentanteLegal', [documento(), pasaporte]), identificacion: { pais: 'CO', tipo: 'PA', numero: '1020304050' } }],
    });
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    const lista = await within(tarjeta).findByRole('list', { name: 'Documento de identidad' });
    expect(within(lista).getByRole('button', { name: 'Subir: Pasaporte' })).toBeInTheDocument();
    expect(within(lista).queryByRole('button', { name: 'Subir: Cédula de ciudadanía' })).not.toBeInTheDocument();
  });

  it('una persona que aún no se guardó dice que podrá subirlo al guardar la sección', async () => {
    const usuario = userEvent.setup();
    montarLegal([], { relaciones: [] });
    const dialogo = await abrirNueva(usuario);
    await escribirIdentidad(usuario, dialogo);
    await completarPersona(usuario, dialogo, 'Representante legal');
    await usuario.click(listo(dialogo));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    expect(await within(tarjeta).findByText('Podrás subir su documento de identidad cuando guardes esta sección.')).toBeInTheDocument();
    expect(within(tarjeta).queryByRole('button', { name: /Subir/ })).not.toBeInTheDocument();
  });

  it('un rol que no es una relación (contador) no ofrece documento de identidad', async () => {
    montarLegal([{ ...JOEL, rol: 'Contador' }], { relaciones: [relacion('RepresentanteLegal', [CARGADA])] });
    const tarjeta = await screen.findByRole('listitem', { name: NOMBRE });
    expect(within(tarjeta).queryByText('Documento de identidad')).not.toBeInTheDocument();
  });
});
