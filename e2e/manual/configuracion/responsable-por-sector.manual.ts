import { abrirEmbebido } from '../../soporte/embebido';
import { agregarSeccion } from '../../soporte/editorDeFlujos';
import { crearEscenario } from '../../soporte/semilla';
import { expect, paso, recorrido } from '../nucleo';

recorrido(
  {
    dominio: 'configuracion',
    actor: 'Administrador de empresa',
    titulo: 'Asigna un responsable por sector para las actualizaciones',
    resumen:
      'La administradora arma un flujo de proveedores con la información tributaria y la general, y asigna el área Revisión como responsable de la sección tributaria. ' +
      'Cuando el tercero cambie su tributaria después de aprobada, la actualización llega solo a esa área y no a todas las del flujo.',
    precondiciones: [
      'Un grupo empresarial con la empresa «Constructora Sur S.A.S.» y su área «Revisión» con miembros.',
      'Una persona con el rol Administrador que entra a Valídalo desde el sistema integrado.',
    ],
    relacionados: ['configuracion/flujo-secciones-de-la-ficha', 'tercero/ficha-cambio-tras-aprobar'],
  },
  async ({ page }) => {
    const e = await crearEscenario();
    const app = await abrirEmbebido(page, e, e.ana, e.sur, 'flujos');
    await expect(app.getByRole('heading', { level: 1, name: `Flujos aprobatorios de ${e.sur.nombre}` })).toBeVisible();

    // 1. Flujo con dos secciones de la ficha y el área Revisión.
    await app.getByRole('button', { name: 'Nuevo flujo' }).click();
    await app.getByRole('textbox', { name: /^Código/ }).fill('PROV_RESPONSABLES');
    await app.getByRole('textbox', { name: /^Nombre/ }).fill('Proveedores con responsables por sector');
    await app.getByRole('combobox', { name: /^Tipo de vínculo/ }).click();
    await app.getByRole('option', { name: 'Proveedor', exact: true }).click();
    await app.getByRole('region', { name: 'Etapa 1' }).getByRole('combobox', { name: 'Área' }).click();
    await app.getByRole('option', { name: /^Revisión/ }).click();
    await agregarSeccion(app, 'Información tributaria');
    await agregarSeccion(app, 'Información general');
    await page.keyboard.press('Escape');

    // 2. La tarjeta de responsables por sector.
    const tarjeta = app.getByText('Responsable por sector en las actualizaciones', { exact: true });
    await expect(tarjeta).toBeVisible();
    await paso(page, {
      titulo: 'Abre la tarjeta «Responsable por sector en las actualizaciones»',
      explicacion:
        'Cuando el tercero cambia una sección después de aprobada, la actualización va al responsable de esa sección y no a todas las áreas del flujo. ' +
        'La tarjeta tiene una casilla por cada sección de «Mi información»; el responsable es un área del flujo, nunca una persona. La revisión inicial no cambia.',
      resaltar: tarjeta,
      configuracion: {
        ajuste: 'Responsable por sector en las actualizaciones',
        ruta: 'Configuración › Flujos aprobatorios (/flujos)',
        efecto: 'Una sección con responsable se revisa solo por esa área en sus actualizaciones.',
      },
    });

    // 3. Elegir el responsable de la tributaria.
    await app.getByRole('combobox', { name: 'Área responsable de Información tributaria' }).click();
    await app.getByRole('option', { name: /^Revisión/ }).click();
    await expect(app.getByRole('combobox', { name: 'Área responsable de Información tributaria' })).toContainText('Revisión');
    await paso(page, {
      titulo: 'Asigna el área responsable de la tributaria',
      explicacion:
        'Elige «Revisión» en «Área responsable de Información tributaria». Las áreas que aparecen son solo las que ya participan en las etapas del flujo; ' +
        'la sección general queda en «Sin responsable (como siempre)», así que su actualización sigue yendo a las áreas de su requisito.',
      resaltar: [
        app.getByRole('combobox', { name: 'Área responsable de Información tributaria' }),
        app.getByRole('combobox', { name: 'Área responsable de Información general' }),
      ],
      variantes: [
        { cuando: 'El flujo no tiene áreas', entonces: 'La tarjeta dice «Agrega áreas al flujo para elegir un responsable» y las casillas quedan deshabilitadas.' },
        { cuando: 'Quitas el área del flujo', entonces: 'Sus responsabilidades se quitan con ella.' },
      ],
    });

    // 4. Guardar el borrador.
    await app.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(app.getByRole('button', { name: 'Publicar v1' })).toBeVisible();
    await paso(page, {
      titulo: 'Guarda el flujo con sus responsables',
      explicacion:
        'Con «Crear borrador» el responsable queda en la versión v1. Como toda configuración de flujo, se congela al publicar: los expedientes que ya se abrieron conservan la versión con la que empezaron, y las actualizaciones nuevas usan la versión publicada.',
      resaltar: app.getByRole('button', { name: 'Publicar v1' }),
      avisos: true,
    });
  },
);
