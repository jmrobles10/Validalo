import { abrirEmbebido } from '../../soporte/embebido';
import { agregarDocumento } from '../../soporte/editorDeFlujos';
import { crearEscenario, SST } from '../../soporte/semilla';
import { expect, paso, recorrido } from '../nucleo';

recorrido(
  {
    dominio: 'configuracion',
    actor: 'Administrador de empresa',
    titulo: 'Pide un documento según lo que el tercero declara en su ficha',
    resumen:
      'La administradora agrega al flujo de proveedores el certificado de seguridad y salud en el trabajo y elige «Según la ficha del tercero»: solo se le pide a quien declara la especialidad de concreto premezclado. ' +
      'El documento se pide por lo que el tercero declara, y el tercero ve por qué se le pide.',
    precondiciones: [
      'Un grupo empresarial con la empresa «Constructora Sur S.A.S.», su área «Revisión» y el certificado de seguridad y salud en el trabajo en los tipos de documento.',
      'Una persona con el rol Administrador que entra a Valídalo desde el sistema integrado.',
    ],
    relacionados: ['configuracion/flujo-condiciones-por-tipo-de-persona', 'configuracion/responsable-por-sector'],
  },
  async ({ page }) => {
    const e = await crearEscenario();
    const app = await abrirEmbebido(page, e, e.ana, e.sur, 'flujos');
    await expect(app.getByRole('heading', { level: 1, name: `Flujos aprobatorios de ${e.sur.nombre}` })).toBeVisible();

    // 1. Un flujo nuevo de proveedores con el documento de seguridad y salud.
    await app.getByRole('button', { name: 'Nuevo flujo' }).click();
    await app.getByRole('textbox', { name: /^Código/ }).fill('PROV_SEGUN_FICHA');
    await app.getByRole('textbox', { name: /^Nombre/ }).fill('Proveedores de obra según su especialidad');
    await app.getByRole('combobox', { name: /^Tipo de vínculo/ }).click();
    await app.getByRole('option', { name: 'Proveedor', exact: true }).click();
    await app.getByRole('region', { name: 'Etapa 1' }).getByRole('combobox', { name: 'Área' }).click();
    await app.getByRole('option', { name: /^Revisión/ }).click();
    // El RUT se pide a todos: al menos un documento debe pedirse siempre.
    await agregarDocumento(app, /^Registro Único Tributario/);
    await agregarDocumento(app, new RegExp(SST.nombre));

    // 2. El atajo «Según la ficha del tercero» (en el documento recién agregado, que es el que está abierto).
    await app.getByRole('combobox', { name: 'Se pide a' }).click();
    await app.getByRole('option', { name: 'Según la ficha del tercero', exact: true }).click();
    await expect(app.getByRole('combobox', { name: 'Campo de la ficha' })).toHaveText('Especialidades');
    await paso(page, {
      titulo: 'Elige «Según la ficha del tercero» en «Se pide a»',
      explicacion:
        'Además de «Todos» y de los dos tipos de persona, «Se pide a» ofrece «Según la ficha del tercero»: el documento se pide según lo que el tercero declara en su ficha, no según su tipo de persona. ' +
        'El atajo arma la condición sobre las especialidades del tercero; si quieres otro dato de la ficha, cambias el «Campo de la ficha».',
      resaltar: app.getByRole('combobox', { name: 'Se pide a' }),
      configuracion: {
        ajuste: 'Se pide a (por documento del flujo)',
        ruta: 'Configuración › Flujos aprobatorios (/flujos)',
        efecto: 'El documento solo aparece en la lista de los terceros que declaran lo que la condición pide.',
      },
      variantes: [
        { cuando: 'Cambias el campo a la actividad económica (CIIU)', entonces: 'Se elige un código de la actividad y, si quieres, también una división (2 dígitos) o un grupo (3).' },
      ],
    });

    // 3. El valor declarado: la especialidad de concreto premezclado.
    await app.getByRole('combobox', { name: 'Se cumple cuando' }).click();
    await app.getByRole('option', { name: 'incluye alguno de', exact: true }).click();
    await app.getByRole('combobox', { name: 'Valores' }).fill('premezclado');
    await app.getByRole('option', { name: /Concreto premezclado/ }).first().click();
    await page.keyboard.press('Escape');
    await paso(page, {
      titulo: 'Elige la especialidad que activa el documento',
      explicacion:
        'Con «incluye alguno de» y la especialidad «Concreto premezclado», el certificado se pide a quien la declara en «Mi información». «Busca por código o por nombre» trae las especialidades del catálogo; ' +
        'un valor de nivel superior, como un grupo, cubre las especialidades que están debajo.',
      resaltar: app.getByRole('combobox', { name: 'Se cumple cuando' }),
      variantes: [
        { cuando: 'El tercero no declara la especialidad', entonces: 'El certificado no le aparece: la condición no se cumple y no hay nada que entregar.' },
        { cuando: 'El valor de la condición es «no incluye ninguno de»', entonces: 'Se pide a quien no declara esa especialidad.' },
      ],
    });

    // 4. Guardar el borrador.
    await app.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(app.getByRole('button', { name: 'Publicar v1' })).toBeVisible();
    await paso(page, {
      titulo: 'Guarda el flujo como borrador',
      explicacion:
        'Con «Crear borrador» la condición queda guardada en el borrador v1. Al publicar, un tercero que aún no ha declarado su especialidad no ve el certificado; cuando la declara, aparece con el motivo: «Te lo pide Constructora Sur S.A.S. porque en tu ficha declaraste» la especialidad. ' +
        'Si después cambia lo que declara con el expediente abierto, el documento se suma o deja de aplicar solo.',
      resaltar: app.getByRole('button', { name: 'Publicar v1' }),
      avisos: true,
    });
  },
);
