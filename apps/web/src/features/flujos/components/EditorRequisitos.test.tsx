import { ThemeProvider } from '@mui/material';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorApi, type AreaDto, type CondicionDto, type TipoDocumentoTenantDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { montarPantalla } from '../../../pruebas/montar';
import { simularApi } from '../../../pruebas/simularApi';
import { areaNueva, requisitoDeSeccionNuevo, requisitoNuevo, type ErrorFlujo, type RequisitoEnEditor } from '../editor';
import { errorDeApiEnRequisitos } from '../requisitosDeSeccion';
import { EditorRequisitos } from './EditorRequisitos';

const area = (id: string, nombre: string): AreaDto => ({ id, empresaId: 'e', codigo: id.toUpperCase(), nombre, miembros: ['u1'], activa: true });
const tipo = { id: 'rut', codigo: 'RUT', nombre: 'Registro Único Tributario', clase: 'Archivo', activo: true } as TipoDocumentoTenantDto;
const tipoRut = { ...tipo, tipoCanonico: 'RUT' } as TipoDocumentoTenantDto;

/** Abre la fila de un requisito: vienen cerradas y su botón se llama como el requisito (seguido de su resumen). */
const abrir = (nombre: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${nombre}`) }));

function editor(requisitos: RequisitoEnEditor[], onCambiar = vi.fn(), tipos = [tipo]) {
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <EditorRequisitos
        requisitos={requisitos}
        etapas={[{ clave: 'e1', areas: [areaNueva('compras'), areaNueva('cumplimiento'), areaNueva('juridica'), areaNueva('tesoreria')] }]}
        areas={[area('compras', 'Compras'), area('cumplimiento', 'Cumplimiento'), area('juridica', 'Jurídica'), area('tesoreria', 'Tesorería')]}
        tiposDocumento={tipos}
        onCambiar={onCambiar}
        errores={[]}
        soloLectura={false}
      />
    </ThemeProvider>,
  );
}

describe('EditorRequisitos: documento de una persona relacionada', () => {
  const cedula = { id: 'ced', codigo: 'CEDULA', nombre: 'Cédula de ciudadanía', clase: 'Archivo', activo: true, tipoCanonico: 'CEDULA' } as TipoDocumentoTenantDto;

  it('«Documento de» elige entre el propio tercero y cada rol; al elegir uno se pide el de la persona principal', () => {
    const onCambiar = vi.fn();
    editor([requisitoNuevo('ced')], onCambiar, [cedula]);
    abrir('Cédula de ciudadanía');

    expect(screen.queryByRole('switch', { name: 'De todas las personas con ese rol' })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Documento de' }));
    const opciones = within(screen.getByRole('listbox'));
    expect(opciones.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'El propio tercero',
      'Representante legal',
      'Suplente del representante legal',
      'Socio o accionista',
      'Beneficiario final',
      'Miembro del consorcio',
    ]);
    fireEvent.click(opciones.getByRole('option', { name: 'Socio o accionista' }));
    expect(onCambiar).toHaveBeenCalledWith([expect.objectContaining({ dePersonaRelacionada: 'Socio', todasLasRelaciones: false })]);
  });

  it('con un rol ofrece «todas» y explica cuándo se resuelve; volver al propio tercero apaga «todas»', () => {
    const onCambiar = vi.fn();
    editor([{ ...requisitoNuevo('ced'), dePersonaRelacionada: 'Socio' }], onCambiar, [cedula]);
    abrir('Cédula de ciudadanía');

    expect(screen.getByText(/Se resuelve al abrir o recalcular el expediente/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'De todas las personas con ese rol' }));
    expect(onCambiar).toHaveBeenCalledWith([expect.objectContaining({ dePersonaRelacionada: 'Socio', todasLasRelaciones: true })]);
  });

  it('un documento que no es de una persona (el RUT) no ofrece rol', () => {
    editor([requisitoNuevo('rut')], vi.fn(), [tipoRut]);
    abrir('Registro Único Tributario');

    expect(screen.queryByRole('combobox', { name: 'Documento de' })).not.toBeInTheDocument();
  });
});

describe('EditorRequisitos', () => {
  it('«Lo revisan» muestra las áreas como chips en una sola línea: dos a la vista y el resto en «+N»', () => {
    editor([{ ...requisitoNuevo('rut'), areasQueRevisan: ['compras', 'cumplimiento', 'juridica', 'tesoreria'] }]);
    // Cerrada, la fila las resume en una línea: ningún chip de área.
    expect(document.querySelectorAll('.MuiChip-root')).toHaveLength(0);
    expect(screen.getByText('Obligatorio · Se pide a todos · Lo revisan Compras, Cumplimiento y 2 más')).toBeInTheDocument();
    abrir('Registro Único Tributario');
    const chips = [...document.querySelectorAll('.MuiChip-root')].map((c) => c.textContent);
    expect(chips).toEqual(['Compras', 'Cumplimiento', '+2']);
    expect(screen.getByText('+2').closest('.MuiChip-root')).toHaveAttribute('title', 'Jurídica, Tesorería');
    // Los chips se pueden quitar uno a uno, como antes.
    expect(document.querySelectorAll('.MuiChip-deleteIcon')).toHaveLength(2);
  });

  it('«Obligatorio» queda en la celda alineada con los campos y la papelera, en la fila, quita el requisito sin abrirla', () => {
    const onCambiar = vi.fn();
    editor([requisitoNuevo('rut')], onCambiar);
    // Cerrada: ya está la papelera, pero no el formulario.
    expect(screen.queryByRole('switch', { name: 'Obligatorio' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar documento' }));
    expect(onCambiar).toHaveBeenCalledWith([]);

    abrir('Registro Único Tributario');
    expect(screen.getByRole('switch', { name: 'Obligatorio' }).closest('label')?.parentElement).toHaveStyle({ alignItems: 'center', minHeight: '36px' });
  });

  it('«Se pide a» elige entre todos, solo jurídicas, solo naturales o según la ficha del tercero', () => {
    const onCambiar = vi.fn();
    editor([requisitoNuevo('rut')], onCambiar);
    abrir('Registro Único Tributario');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Se pide a' }));
    const opciones = within(screen.getByRole('listbox'));
    expect(opciones.getAllByRole('option').map((o) => o.textContent)).toEqual(['Todos', 'Solo personas jurídicas', 'Solo personas naturales', 'Según la ficha del tercero']);
    fireEvent.click(opciones.getByRole('option', { name: 'Solo personas jurídicas' }));
    expect(onCambiar).toHaveBeenCalledWith([
      expect.objectContaining({ condicion: { tipo: 'Predicado', nodos: null, atributo: 'tercero.tipoPersona', operador: 'Igual', valores: ['Juridica'] } }),
    ]);
  });

  it('una condición armada por la API se muestra descrita y como «Condición personalizada»', () => {
    editor([{ ...requisitoNuevo('rut'), condicion: { tipo: 'Predicado', atributo: 'tercero.pais', operador: 'Distinto', valores: ['CO'] } }]);
    // Cerrada, la condición va en la fila en una frase corta y legible (el país por su nombre).
    expect(screen.getByText('Si país no es Colombia')).toBeInTheDocument();
    abrir('Registro Único Tributario');
    expect(screen.getByRole('combobox', { name: 'Se pide a' })).toHaveTextContent('Condición personalizada');
    expect(screen.getByText('Se pide cuando país no es CO.')).toBeInTheDocument();
  });
});

describe('EditorRequisitos: secciones de la información del tercero (F2)', () => {
  const financiera = { ...requisitoDeSeccionNuevo('FICHA_FINANCIERA'), periodos: 2 };

  it('«Agregar» › «Sección de la información» › una sección suma un requisito de esa sección', async () => {
    const onCambiar = vi.fn();
    editor([], onCambiar);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sección de la información' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Información financiera' }));
    expect(onCambiar).toHaveBeenCalledWith([expect.objectContaining({ seccion: 'FICHA_FINANCIERA', tipoDocumentoTenantId: '', exigeSoporte: false, periodos: null })]);
  });

  it('la financiera pide periodos y «Exige soporte», con la nota de que no aplica a persona natural', () => {
    const onCambiar = vi.fn();
    editor([financiera], onCambiar);
    abrir('Información financiera');
    const fila = within(screen.getByRole('region', { name: 'Información financiera' }));
    expect(fila.getByRole('combobox', { name: 'Sección de la información del tercero' })).toHaveTextContent('Información financiera');
    expect(fila.queryByRole('combobox', { name: 'Tipo de documento' })).not.toBeInTheDocument();
    expect(fila.getByRole('textbox', { name: 'Periodos' })).toHaveValue('2');
    expect(fila.getByText('Legal y Financiera no aplican a persona natural: a ella no se le piden.')).toBeInTheDocument();

    fireEvent.change(fila.getByRole('textbox', { name: 'Periodos' }), { target: { value: '3' } });
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ seccion: 'FICHA_FINANCIERA', periodos: 3 })]);
    fireEvent.click(fila.getByRole('checkbox', { name: 'Exige soporte' }));
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ exigeSoporte: true })]);
    expect(fila.getByRole('button', { name: 'Quitar sección' })).toBeInTheDocument();
  });

  it('otra sección no tiene periodos; al elegir una que no va por periodo se limpian', () => {
    const onCambiar = vi.fn();
    editor([financiera], onCambiar);
    abrir('Información financiera');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sección de la información del tercero' }));
    fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: 'Seguridad y salud en el trabajo' }));
    expect(onCambiar).toHaveBeenCalledWith([expect.objectContaining({ seccion: 'FICHA_SST', periodos: null })]);
  });

  it('muestra el 422 de la API en su campo: el duplicado en la fila y los periodos inválidos en «Periodos»', () => {
    const requisitos = [financiera, { ...financiera, clave: 'otra' }];
    const duplicado = errorDeApiEnRequisitos(new ErrorApi(422, 'requisito-duplicado', 'El flujo ya pide FICHA_FINANCIERA.', null, null, {}, { requisito: 1 }), requisitos);
    const periodos = errorDeApiEnRequisitos(new ErrorApi(422, 'periodos-invalidos', 'Se piden entre 1 y 5 periodos de Información financiera.', null, null, {}, { requisito: 0 }), [financiera]);
    if (!duplicado || !periodos) throw new Error('los 422 debían ir a un requisito');

    render(
      <ThemeProvider theme={createValidaloTheme('light')}>
        <EditorRequisitos requisitos={requisitos} etapas={[{ clave: 'e1', areas: [areaNueva('compras')] }]} areas={[area('compras', 'Compras')]} tiposDocumento={[]} onCambiar={vi.fn()} errores={[duplicado, periodos]} soloLectura={false} />
      </ThemeProvider>,
    );
    const [primera, segunda] = screen.getAllByRole('region', { name: 'Información financiera' });
    if (!primera || !segunda) throw new Error('faltan las filas');
    // La primera trae un error y se abre sola; la segunda lo trae en la fila (una etiqueta) y su mensaje sale al abrirla.
    expect(within(primera).getByRole('textbox', { name: 'Periodos' })).toHaveAccessibleDescription('Entre 1 y 5 periodos.');
    expect(within(primera).queryByText('Esa sección ya está en la lista.')).not.toBeInTheDocument();
    expect(within(segunda).getByText('Con errores').closest('.MuiChip-root')).toHaveAttribute('title', 'Esa sección ya está en la lista.');
    fireEvent.click(within(segunda).getByRole('button', { name: /^Información financiera/ }));
    expect(within(segunda).getByText('Esa sección ya está en la lista.')).toBeInTheDocument();
    expect(within(primera).queryByRole('textbox', { name: 'Periodos' })).not.toBeInTheDocument();
  });

  it('una sección trae su vigencia propia y el plazo de revalidación (vacíos: no vence y 15 días); un documento no', () => {
    const onCambiar = vi.fn();
    editor([financiera, requisitoNuevo('rut')], onCambiar);
    abrir('Información financiera');
    const fila = within(screen.getByRole('region', { name: 'Información financiera' }));
    expect(fila.getByRole('textbox', { name: 'Vigencia (días)' })).toHaveValue('');
    expect(fila.getByRole('textbox', { name: 'Vigencia (días)' })).toHaveAttribute('placeholder', 'No vence');
    expect(fila.getByRole('textbox', { name: 'Plazo de revalidación (días)' })).toHaveAttribute('placeholder', '15');

    fireEvent.change(fila.getByRole('textbox', { name: 'Vigencia (días)' }), { target: { value: '180' } });
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ seccion: 'FICHA_FINANCIERA', vigenciaDias: 180 }), expect.anything()]);
    fireEvent.change(fila.getByRole('textbox', { name: 'Plazo de revalidación (días)' }), { target: { value: '7' } });
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ diasRevalidacion: 7 }), expect.anything()]);
    fireEvent.change(fila.getByRole('textbox', { name: 'Vigencia (días)' }), { target: { value: '' } });
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ vigenciaDias: null }), expect.anything()]);

    // El documento no los lleva: su vigencia y su revalidación se configuran en el tipo.
    abrir('Registro Único Tributario');
    expect(screen.queryByRole('textbox', { name: 'Vigencia (días)' })).not.toBeInTheDocument();
  });

  it('muestra los errores de vigencia y de revalidación de la sección en su campo', () => {
    render(
      <ThemeProvider theme={createValidaloTheme('light')}>
        <EditorRequisitos
          requisitos={[{ ...financiera, vigenciaDias: 0, diasRevalidacion: 400 }]}
          etapas={[{ clave: 'e1', areas: [areaNueva('compras')] }]}
          areas={[area('compras', 'Compras')]}
          tiposDocumento={[]}
          onCambiar={vi.fn()}
          errores={[
            { codigo: 'vigencia-seccion-invalida', campo: 'requisito.0.vigencia' },
            { codigo: 'dias-revalidacion-invalidos', campo: 'requisito.0.revalidacion' },
          ]}
          soloLectura={false}
        />
      </ThemeProvider>,
    );
    const fila = within(screen.getByRole('region', { name: 'Información financiera' }));
    expect(fila.getByRole('textbox', { name: 'Vigencia (días)' })).toHaveAccessibleDescription('Entre 1 y 3650 días, o vacío si no vence.');
    expect(fila.getByRole('textbox', { name: 'Plazo de revalidación (días)' })).toHaveAccessibleDescription('Entre 1 y 365 días, o vacío para 15.');
  });

  it('«Usar como soporte» aparece solo en documentos que respaldan secciones, activo por omisión, y se apaga', () => {
    const onCambiar = vi.fn();
    editor([requisitoNuevo('rut')], onCambiar, [tipoRut]);
    abrir('Registro Único Tributario');

    const interruptor = screen.getByRole('switch', { name: 'Usar como soporte de las secciones' });
    expect(interruptor).toBeChecked();
    expect(screen.getByText(/El documento se cruza con Información general, Información tributaria, Información legal/)).toBeInTheDocument();
    fireEvent.click(interruptor);
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ usarComoSoporte: false })]);
  });

  it('«Usar como soporte» apagado se muestra apagado', () => {
    editor([{ ...requisitoNuevo('rut'), usarComoSoporte: false }], vi.fn(), [tipoRut]);
    abrir('Registro Único Tributario');
    expect(screen.getByRole('switch', { name: 'Usar como soporte de las secciones' })).not.toBeChecked();
  });

  it('un tipo que no respalda secciones no ofrece «Usar como soporte»', () => {
    editor([requisitoNuevo('rut')]);
    abrir('Registro Único Tributario');
    expect(screen.queryByRole('switch', { name: 'Usar como soporte de las secciones' })).not.toBeInTheDocument();
  });
});

describe('EditorRequisitos: documentos según la ficha del tercero (EF-1)', () => {
  const camara = { id: 'camara', codigo: 'CAMARA_COMERCIO', nombre: 'Cámara de comercio', clase: 'Archivo', activo: true } as TipoDocumentoTenantDto;
  const porEspecialidad: CondicionDto = { tipo: 'Predicado', nodos: null, atributo: 'ficha.especialidades.especialidades', operador: 'ContieneAlguno', valores: ['OG'] };

  beforeEach(() => {
    simularApi({
      'GET /api/v1/flujos/campos-de-ficha': [
        { ruta: 'ficha.especialidades.especialidades', seccion: 'especialidades', etiqueta: 'Especialidades', tipo: 'ListaOpciones', operadores: ['ContieneAlguno', 'ContieneTodos', 'Existe'], catalogo: 'especialidades', jerarquica: true },
      ],
      'GET /api/v1/catalogos/especialidades': { datos: [{ codigo: 'OG', nombre: 'Obra gris', nivel: 1, activo: true }], siguiente: null },
    });
  });

  function montar(requisitos: RequisitoEnEditor[], onCambiar = vi.fn(), errores: ErrorFlujo[] = []) {
    montarPantalla(
      <EditorRequisitos
        requisitos={requisitos}
        etapas={[{ clave: 'e1', areas: [areaNueva('compras')] }]}
        areas={[area('compras', 'Compras')]}
        tiposDocumento={[tipo, camara]}
        onCambiar={onCambiar}
        errores={errores}
        soloLectura={false}
      />,
    );
    return onCambiar;
  }

  it('elegir «Según la ficha del tercero» arma la condición de las especialidades, sin valores, y muestra el constructor', async () => {
    const usuario = userEvent.setup();
    const onCambiar = montar([requisitoNuevo('camara')]);

    await usuario.click(screen.getByRole('button', { name: /^Cámara de comercio/ }));
    await usuario.click(screen.getByRole('combobox', { name: 'Se pide a' }));
    await usuario.click(await screen.findByRole('option', { name: 'Según la ficha del tercero' }));
    expect(onCambiar).toHaveBeenLastCalledWith([
      expect.objectContaining({ condicion: { tipo: 'Predicado', nodos: null, atributo: 'ficha.especialidades.especialidades', operador: 'ContieneAlguno', valores: [] } }),
    ]);
  });

  it('un documento que se pide según la ficha muestra su constructor y cambiar los valores lo guarda en el requisito', async () => {
    const usuario = userEvent.setup();
    const onCambiar = montar([{ ...requisitoNuevo('camara'), condicion: porEspecialidad }]);

    // Cerrada, la fila dice la condición con el nombre del campo que le da la API y el del valor en su catálogo.
    expect(await screen.findByText('Si en Especialidades declara OG · Obra gris')).toBeInTheDocument();
    await usuario.click(screen.getByRole('button', { name: /^Cámara de comercio/ }));
    expect(screen.getByRole('combobox', { name: 'Se pide a' })).toHaveTextContent('Según la ficha del tercero');
    expect(await screen.findByRole('combobox', { name: 'Campo de la ficha' })).toHaveTextContent('Especialidades');
    expect(await screen.findByText('OG · Obra gris')).toBeInTheDocument();
    expect(screen.queryByText(/Se pide cuando/)).not.toBeInTheDocument(); // no es «personalizada»: el constructor la entiende

    await usuario.click(screen.getByRole('combobox', { name: 'Se cumple cuando' }));
    await usuario.click(await screen.findByRole('option', { name: 'no incluye ninguno de' }));
    expect(onCambiar).toHaveBeenLastCalledWith([
      expect.objectContaining({ condicion: { tipo: 'No', nodos: [porEspecialidad], atributo: null, operador: null, valores: null } }),
    ]);
  });

  it('una condición compuesta se dice con las mismas frases (campo, valor con su nombre del catálogo y persona en palabras) y el texto completo va en el título', async () => {
    const natural: CondicionDto = { tipo: 'Predicado', nodos: null, atributo: 'tercero.tipoPersona', operador: 'Igual', valores: ['natural'] };
    montar([{ ...requisitoNuevo('camara'), condicion: { tipo: 'Y', nodos: [porEspecialidad, natural], atributo: null, operador: null, valores: null } }]);

    const frase = 'Si en Especialidades declara OG · Obra gris y es persona natural';
    expect(await screen.findByText(frase)).toBeInTheDocument();
    expect(screen.getByText(frase).closest('.MuiChip-root')).toHaveAttribute('title', frase);
    // Ni los códigos ni los enums sin traducir de la forma cruda.
    expect(screen.queryByText(/ContieneAlguno|tipo de persona|especialidades declaradas/)).not.toBeInTheDocument();
  });

  it('«es uno de Jurídica, Natural» se dice «Si es persona jurídica o natural»', () => {
    editor([{ ...requisitoNuevo('rut'), condicion: { tipo: 'Predicado', nodos: null, atributo: 'tercero.tipoPersona', operador: 'En', valores: ['Juridica', 'Natural'] } }]);
    expect(screen.getByText('Si es persona jurídica o natural')).toBeInTheDocument();
  });

  it('volver a «Todos» quita la condición y el constructor desaparece', async () => {
    const usuario = userEvent.setup();
    const onCambiar = montar([{ ...requisitoNuevo('camara'), condicion: porEspecialidad }]);

    await usuario.click(screen.getByRole('button', { name: /^Cámara de comercio/ }));
    await usuario.click(screen.getByRole('combobox', { name: 'Se pide a' }));
    await usuario.click(await screen.findByRole('option', { name: 'Todos' }));
    expect(onCambiar).toHaveBeenLastCalledWith([expect.objectContaining({ condicion: null })]);
  });

  it('el error de una condición inválida (valores que faltan o que no existen en el catálogo) sale en el requisito', async () => {
    montar([{ ...requisitoNuevo('camara'), condicion: porEspecialidad }], vi.fn(), [{ codigo: 'condicion-invalida', campo: 'requisito.0' }]);

    expect(await screen.findByText('La condición no es válida: revisa el campo, el operador y los valores (que existan en el catálogo).')).toBeInTheDocument();
  });

  it('un error 422 de la API sobre la condición de un requisito se lleva a su campo', () => {
    const error = new ErrorApi(422, 'condicion-invalida', 'La condición no es válida.', null, null, {}, { requisito: 1 });
    const requisitos = [requisitoNuevo('rut'), requisitoNuevo('camara')];

    expect(errorDeApiEnRequisitos(error, requisitos)).toEqual({ codigo: 'condicion-invalida', campo: 'requisito.1' });
  });
});
