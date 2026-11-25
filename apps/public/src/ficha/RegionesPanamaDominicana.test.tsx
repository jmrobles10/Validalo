import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reiniciarCliente, type PerfilDeFichaDto } from '@validalo/api-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { datosParaEnviar } from './useEditorSeccion';
import { esSociedad } from './legal/personas';
import { completarPersona, escribir, estadoFicha, guardada, json, montarFicha, seccion } from './pruebas/montar';

afterEach(() => reiniciarCliente());

const TIPOS_PA = ['CC', 'CE', 'CIP', 'ID_FISCAL', 'NIT', 'PA', 'PASAPORTE', 'PPT', 'RUC', 'TI'];
const TIPOS_DO = ['CC', 'CE', 'CED', 'ID_FISCAL', 'NIT', 'PA', 'PASAPORTE', 'PPT', 'RNC', 'TI'];

/** El perfil de la ficha de un tercero de Panamá: modelo tributario genérico (ITBMS) y DV del RUC declarado. */
const PERFIL_PANAMA: PerfilDeFichaDto = {
  pais: 'PA',
  tipoIdentificacion: 'RUC',
  dvDeclarado: true,
  modeloTributario: 'Generico',
  autoridadTributaria: 'DGI',
  impuestoVentas: 'ITBMS',
  regimenes: [
    { codigo: 'GENERAL', nombre: 'Régimen general' },
    { codigo: 'ZONA_LIBRE', nombre: 'Zona Libre de Colón' },
    { codigo: 'OTRO', nombre: 'Otro' },
  ],
  tiposDePersona: TIPOS_PA,
  tiposConDvDeclarado: ['RUC'],
};

const PERFIL_DOMINICANA: PerfilDeFichaDto = {
  pais: 'DO',
  tipoIdentificacion: 'RNC',
  dvDeclarado: false,
  modeloTributario: 'Generico',
  autoridadTributaria: 'DGII',
  impuestoVentas: 'ITBIS',
  regimenes: [
    { codigo: 'ORDINARIO', nombre: 'Régimen ordinario' },
    { codigo: 'RST', nombre: 'Régimen Simplificado de Tributación (RST)' },
  ],
  tiposDePersona: TIPOS_DO,
  tiposConDvDeclarado: [],
};

const PERFIL_COLOMBIA: PerfilDeFichaDto = {
  pais: 'CO',
  tipoIdentificacion: 'NIT',
  dvDeclarado: false,
  modeloTributario: 'Colombiano',
  autoridadTributaria: 'DIAN',
  impuestoVentas: 'IVA',
  regimenes: [],
  tiposDePersona: ['CC', 'CE', 'ID_FISCAL', 'NIT', 'PA', 'PASAPORTE', 'PPT', 'TI'],
  tiposConDvDeclarado: [],
};

describe('Mi información de un tercero de Panamá o República Dominicana: Información tributaria', () => {
  it('Panamá no pide la casilla 53 ni ICA: pide régimen, ITBMS, retención y exención, y guarda solo lo suyo', async () => {
    const usuario = userEvent.setup();
    const guardados = montarFicha('/ficha/tributaria', {
      estado: estadoFicha({ perfil: PERFIL_PANAMA }),
      alGuardar: () => json(200, guardada('FICHA_TRIBUTARIA', [], 'FICHA_LEGAL')),
    });

    const regimen = await screen.findByRole('combobox', { name: 'Régimen tributario' });
    expect(screen.queryByRole('combobox', { name: 'Responsabilidades (casilla 53 del RUT)' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: '¿Eres contribuyente del impuesto de industria y comercio (ICA)?' })).not.toBeInTheDocument();

    await usuario.click(regimen);
    expect(await screen.findAllByRole('option')).toHaveLength(3);
    await usuario.click(screen.getByRole('option', { name: 'Régimen general' }));
    await usuario.click(within(screen.getByRole('radiogroup', { name: '¿Eres contribuyente de ITBMS?' })).getByRole('radio', { name: 'Sí' }));
    await usuario.click(within(screen.getByRole('radiogroup', { name: '¿Eres agente de retención?' })).getByRole('radio', { name: 'No' }));
    const exento = screen.getByRole('radiogroup', { name: '¿Estás exento de retenciones?' });
    await usuario.click(within(exento).getByRole('radio', { name: 'No' }));
    expect(screen.queryByRole('textbox', { name: 'Número del certificado' })).not.toBeInTheDocument();

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.ruta).toBe('/public/v1/ficha/FICHA_TRIBUTARIA');
    expect(guardados[0]?.cuerpo).toEqual({
      datos: { regimen: 'GENERAL', contribuyente_impuesto_ventas: true, agente_de_retencion: false, exento_de_retenciones: false },
      soportes: [],
    });
  });

  it('con exención pide el certificado; al quitar la exención el certificado no se envía', async () => {
    const usuario = userEvent.setup();
    const guardados = montarFicha('/ficha/tributaria', {
      estado: estadoFicha({ perfil: PERFIL_DOMINICANA }),
      secciones: {
        FICHA_TRIBUTARIA: seccion('FICHA_TRIBUTARIA', {
          version: 1,
          versiones: 1,
          datos: { regimen: 'RST', contribuyente_impuesto_ventas: true, agente_de_retencion: false, exento_de_retenciones: true, certificado_exencion: { numero: 'DGII-123', fecha: '2025-03-01' } },
          completitud: { completa: true, faltantes: [], reglaVersion: 2 },
        }),
      },
      alGuardar: () => json(200, guardada('FICHA_TRIBUTARIA', [], 'FICHA_LEGAL')),
    });

    expect(await screen.findByRole('combobox', { name: 'Régimen tributario' })).toHaveValue('Régimen Simplificado de Tributación (RST)');
    expect(screen.getByRole('radiogroup', { name: '¿Eres contribuyente de ITBIS?' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Número del certificado' })).toHaveValue('DGII-123');

    await usuario.click(within(screen.getByRole('radiogroup', { name: '¿Estás exento de retenciones?' })).getByRole('radio', { name: 'No' }));
    expect(screen.queryByRole('textbox', { name: 'Número del certificado' })).not.toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toEqual({
      datos: { regimen: 'RST', contribuyente_impuesto_ventas: true, agente_de_retencion: false, exento_de_retenciones: false, certificado_exencion: null },
      soportes: [],
    });
  });

  it('Colombia (con perfil o sin él) conserva la casilla 53 y el ICA de siempre', async () => {
    montarFicha('/ficha/tributaria', { estado: estadoFicha({ perfil: PERFIL_COLOMBIA }) });
    expect(await screen.findByRole('combobox', { name: 'Responsabilidades (casilla 53 del RUT)' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: '¿Eres contribuyente del impuesto de industria y comercio (ICA)?' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Régimen tributario' })).not.toBeInTheDocument();
  });
});

describe('Mi información de un tercero de Panamá: Información general', () => {
  it('el DV del RUC lo declara el tercero y viaja con la sección; la identificación se muestra sin él', async () => {
    const usuario = userEvent.setup();
    const general = seccion('FICHA_GENERAL', {
      version: 1,
      versiones: 1,
      datos: { razon_social: 'Inversiones Istmo S.A.', tipo_persona: 'Juridica', tipo_identificacion: 'RUC', numero: '15561234522019', correo: 'compras@istmo.pa', pais: 'PA' },
      completitud: { completa: false, faltantes: [{ campo: 'dv', regla: null, mensaje: 'Falta «Dígito de verificación (DV)».' }], reglaVersion: 3 },
    });
    const guardados = montarFicha('/ficha/general', { estado: estadoFicha({ perfil: PERFIL_PANAMA }), secciones: { FICHA_GENERAL: general }, alGuardar: () => json(200, guardada('FICHA_GENERAL', [], 'FICHA_TRIBUTARIA')) });

    expect(await screen.findByRole('textbox', { name: 'Identificación' })).toHaveValue('RUC 15561234522019');
    const dv = screen.getByRole('textbox', { name: 'Dígito de verificación (DV)' });
    expect(dv).toHaveAttribute('maxlength', '2');
    await escribir(usuario, dv, '56');
    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    // El tipo, el número y el tipo de persona los fija la API; el DV declarado sí viaja.
    expect(guardados[0]?.cuerpo).toEqual({ datos: { razon_social: 'Inversiones Istmo S.A.', correo: 'compras@istmo.pa', pais: 'PA', dv: '56' }, soportes: [] });
  });

  it('sin DV declarado (Colombia, República Dominicana) no hay campo de DV', async () => {
    montarFicha('/ficha/general', { estado: estadoFicha({ perfil: PERFIL_DOMINICANA }) });
    await screen.findByRole('textbox', { name: 'Identificación' });
    expect(screen.queryByRole('textbox', { name: 'Dígito de verificación (DV)' })).not.toBeInTheDocument();
  });
});

describe('Mi información de un tercero de República Dominicana: Información legal', () => {
  it('ofrece la cédula y el RNC dominicanos, no la CIP de Panamá; una sociedad lleva razón social', async () => {
    const usuario = userEvent.setup();
    const guardados = montarFicha('/ficha/legal', {
      estado: estadoFicha({ perfil: PERFIL_DOMINICANA }),
      secciones: { FICHA_LEGAL: seccion('FICHA_LEGAL') },
      alGuardar: () => json(200, guardada('FICHA_LEGAL', [], 'FICHA_FINANCIERA')),
    });

    await usuario.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    const dialogo = screen.getByRole('dialog', { name: 'Agregar persona' });
    await usuario.click(within(dialogo).getByRole('combobox', { name: 'Tipo de identificación' }));
    const opciones = screen.getAllByRole('option').map((o) => o.textContent);
    expect(opciones).toEqual(TIPOS_DO);
    expect(opciones).not.toContain('CIP');
    await usuario.click(screen.getByRole('option', { name: 'RNC' }));

    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Número de identificación' }), '101-85004-3');
    // Un RNC de 9 dígitos es una sociedad: razón social y sin apellidos ni DV.
    expect(within(dialogo).getByRole('textbox', { name: 'Razón social' })).toBeInTheDocument();
    expect(within(dialogo).queryByRole('textbox', { name: 'Apellidos' })).not.toBeInTheDocument();
    expect(within(dialogo).queryByRole('textbox', { name: 'Dígito de verificación (DV)' })).not.toBeInTheDocument();
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Razón social' }), 'Inversiones del Caribe S.R.L.');
    await completarPersona(usuario, dialogo, 'Contador');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toMatchObject({ datos: { personas: [{ tipo_identificacion: 'RNC', numero: '101-85004-3', nombres: 'Inversiones del Caribe S.R.L.', apellidos: null }] } });
  });

  it('en Panamá el RUC de la sociedad pide su DV y viaja; el de una persona natural con otro tipo, no', async () => {
    const usuario = userEvent.setup();
    const guardados = montarFicha('/ficha/legal', {
      estado: estadoFicha({ perfil: PERFIL_PANAMA }),
      secciones: { FICHA_LEGAL: seccion('FICHA_LEGAL') },
      alGuardar: () => json(200, guardada('FICHA_LEGAL', [], 'FICHA_FINANCIERA')),
    });

    await usuario.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    const dialogo = screen.getByRole('dialog', { name: 'Agregar persona' });
    await usuario.click(within(dialogo).getByRole('combobox', { name: 'Tipo de identificación' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(TIPOS_PA);
    await usuario.click(screen.getByRole('option', { name: 'RUC' }));
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Número de identificación' }), '155612345-2-2019');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Dígito de verificación (DV)' }), '56');
    await escribir(usuario, within(dialogo).getByRole('textbox', { name: 'Razón social' }), 'Inversiones Istmo S.A.');
    await completarPersona(usuario, dialogo, 'Contador');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Listo' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await usuario.click(screen.getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(guardados).toHaveLength(1));
    expect(guardados[0]?.cuerpo).toMatchObject({ datos: { personas: [{ tipo_identificacion: 'RUC', numero: '155612345-2-2019', dv: '56' }] } });
  });

  it('sin perfil ofrece los tipos de siempre', async () => {
    const usuario = userEvent.setup();
    montarFicha('/ficha/legal', { estado: estadoFicha(), secciones: { FICHA_LEGAL: seccion('FICHA_LEGAL') } });
    await usuario.click(await screen.findByRole('button', { name: 'Agregar persona' }));
    await usuario.click(within(screen.getByRole('dialog', { name: 'Agregar persona' })).getByRole('combobox', { name: 'Tipo de identificación' }));
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['CC', 'CE', 'NIT', 'PA', 'PPT', 'TI', 'PASAPORTE', 'ID_FISCAL']);
  });
});

describe('lo que se envía y cómo se reconoce una sociedad', () => {
  it('el DV solo viaja cuando lo declara el tercero; el que calcula Valídalo nunca', () => {
    const general = { razon_social: 'X', tipo_persona: 'Juridica', tipo_identificacion: 'RUC', numero: '1', dv: '56', pais: 'PA' };
    expect(datosParaEnviar('FICHA_GENERAL', general, PERFIL_PANAMA)).toEqual({ razon_social: 'X', pais: 'PA', dv: '56' });
    expect(datosParaEnviar('FICHA_GENERAL', general, PERFIL_COLOMBIA)).toEqual({ razon_social: 'X', pais: 'PA' });
    expect(datosParaEnviar('FICHA_GENERAL', general)).toEqual({ razon_social: 'X', pais: 'PA' });

    const legal = { personas: [{ tipo_identificacion: 'RUC', numero: '1', dv: '56' }, { tipo_identificacion: 'NIT', numero: '2', dv: '5' }, { tipo_identificacion: 'CIP', numero: '3' }] };
    expect(datosParaEnviar('FICHA_LEGAL', legal, PERFIL_PANAMA)).toEqual({
      personas: [{ tipo_identificacion: 'RUC', numero: '1', dv: '56' }, { tipo_identificacion: 'NIT', numero: '2' }, { tipo_identificacion: 'CIP', numero: '3' }],
    });
    expect(datosParaEnviar('FICHA_LEGAL', legal)).toEqual({ personas: [{ tipo_identificacion: 'RUC', numero: '1' }, { tipo_identificacion: 'NIT', numero: '2' }, { tipo_identificacion: 'CIP', numero: '3' }] });
  });

  it('un NIT, un RNC de 9 dígitos y un RUC panameño largo son sociedades; las cédulas no', () => {
    expect(esSociedad('NIT', '900373913')).toBe(true);
    expect(esSociedad('RNC', '101-85004-3')).toBe(true);
    expect(esSociedad('RNC', '001-1391820-5')).toBe(false);
    expect(esSociedad('RUC', '155612345-2-2019')).toBe(true);
    expect(esSociedad('RUC', '8-123-456')).toBe(false);
    expect(esSociedad('CED', '00113918205')).toBe(false);
    expect(esSociedad(null, null)).toBe(false);
  });
});
