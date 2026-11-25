import { abrirEmbebido } from '../../soporte/embebido';
import { agregarDocumento } from '../../soporte/editorDeFlujos';
import { abrirExpedienteManual } from '../../soporte/flujos';
import { crearEscenario, expedienteAbierto, invitar, nuevoTercero } from '../../soporte/semilla';
import { expect, paso, recorrido } from '../nucleo';
import { areaDe, publicarFlujoPorDefecto } from '../nucleo/semillas';

const JURIDICO = 'Proveedores jurídicos';

recorrido(
  {
    dominio: 'configuracion',
    actor: 'Administrador de empresa',
    titulo: 'Escoge el flujo solo según el tercero',
    resumen:
      'Ana, administradora de Constructora Sur, agrega a un flujo de proveedores una regla de selección automática: si el tercero es persona jurídica, su expediente usa el flujo de jurídicas en vez del flujo por defecto. Cuando se abre un expediente nuevo, el sistema aplica la regla y lo deja registrado.',
    precondiciones: [
      'Un grupo con Constructora Sur, su área «Revisión» con miembros y un flujo por defecto de proveedores que pide el RUT.',
      'Una persona con el rol Administrador que entra a Valídalo desde el sistema integrado.',
    ],
    relacionados: ['configuracion/flujo-por-defecto', 'configuracion/flujo-condiciones-por-tipo-de-persona'],
  },
  async ({ page, browser }) => {
    const e = await crearEscenario();
    await publicarFlujoPorDefecto(e, e.sur, areaDe(e.sur, 'revision'), 'PROVEEDOR_BASE', 'PROVEEDOR', [{ tipoDocumento: 'RUT' }]);

    const app = await abrirEmbebido(page, e, e.ana, e.sur, 'flujos');
    await expect(app.getByRole('heading', { level: 1, name: `Flujos aprobatorios de ${e.sur.nombre}` })).toBeVisible();

    // 1. Un flujo nuevo con su regla de selección.
    await app.getByRole('button', { name: 'Nuevo flujo' }).click();
    await app.getByRole('textbox', { name: /^Código/ }).fill('PROV_JURIDICO');
    await app.getByRole('textbox', { name: /^Nombre/ }).fill(JURIDICO);
    await app.getByRole('combobox', { name: /^Tipo de vínculo/ }).click();
    await app.getByRole('option', { name: 'Proveedor', exact: true }).click();
    await app.getByRole('region', { name: 'Etapa 1' }).getByRole('combobox', { name: 'Área' }).click();
    await app.getByRole('option', { name: /^Revisión/ }).click();
    await expect(app.getByText('Selección automática', { exact: true })).toBeVisible();
    await paso(page, {
      titulo: 'Abre la selección automática del flujo',
      explicacion:
        'La tarjeta «Selección automática» decide cuándo el sistema usa este flujo sin que nadie lo elija a mano. Al abrir un expediente sin flujo indicado, Valídalo revisa los flujos publicados del tipo de vínculo por prioridad (la menor primero) y usa el primero cuya condición cumpla el tercero. ' +
        'Si ninguno cumple, usa el flujo por defecto del tipo de vínculo.',
      resaltar: app.getByText('Selección automática', { exact: true }),
      configuracion: {
        ajuste: 'Selección automática del flujo',
        ruta: 'Configuración › Flujos aprobatorios (/flujos)',
        efecto: 'Sin regla, el flujo solo se usa si alguien lo elige al abrir el expediente o si es el flujo por defecto.',
      },
    });

    // 2. La condición y la prioridad.
    await app.getByRole('combobox', { name: 'Se escoge cuando' }).click();
    await app.getByRole('option', { name: 'El tercero es persona jurídica', exact: true }).click();
    await app.getByRole('textbox', { name: 'Prioridad' }).fill('10');
    await paso(page, {
      titulo: 'Elige cuándo se escoge este flujo y su prioridad',
      explicacion:
        'Con «El tercero es persona jurídica», el flujo se escoge solo para proveedores jurídicos. La prioridad es un número de 1 a 999 y no se puede repetir entre los flujos publicados del mismo tipo: la menor se evalúa primero. ' +
        'Una condición sin prioridad no se guarda, y una prioridad sin condición no tiene sentido, porque sería un flujo que siempre gana.',
      resaltar: [app.getByRole('combobox', { name: 'Se escoge cuando' }), app.getByRole('textbox', { name: 'Prioridad' })],
      variantes: [
        { cuando: 'Eliges «Sin condición»', entonces: 'El campo de prioridad desaparece y el flujo solo se usa si se elige a mano o es el flujo por defecto.' },
        { cuando: 'Eliges «Condición personalizada»', entonces: 'Se conserva la condición de la versión y se describe debajo; se edita con la API o la vista previa.' },
      ],
    });

    // 3. El RUT y la publicación.
    await agregarDocumento(app, /Registro Único Tributario/);
    await app.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(app.getByRole('button', { name: 'Publicar v1' })).toBeVisible();
    await app.getByRole('button', { name: 'Publicar v1' }).click();
    await app.getByRole('dialog', { name: /^Publicar v1 de/ }).getByRole('button', { name: 'Publicar v1', exact: true }).click();
    await expect(app.getByRole('dialog', { name: /^Publicar v1 de/ })).toBeHidden();
    await expect(app.getByText('Versión 1 publicada.')).toBeVisible();
    await paso(page, {
      titulo: 'Publica la versión con su regla',
      explicacion:
        'La regla se guarda en el borrador y se congela al publicar, junto con los documentos del flujo: la regla y el flujo que escoge quedan versionados juntos. ' +
        'Publicar no cambia el flujo por defecto: los expedientes nuevos de jurídicas ya lo usan, y los demás siguen con el suyo.',
      resaltar: app.getByText('Versión 1 publicada.'),
      avisos: true,
    });

    // 4. Un expediente nuevo de una persona jurídica: la regla lo escoge.
    const tercero = nuevoTercero('Ferretería Sur S.A.S.');
    const invitacion = await invitar(e, e.sur, tercero, 'PROVEEDOR');
    await abrirExpedienteManual(e, invitacion);
    const pagina = await (await browser.newContext()).newPage();
    const expediente = await abrirEmbebido(pagina, e, e.ana, e.sur, `expedientes/${await expedienteAbierto(e, invitacion)}`);
    await expect(expediente.getByRole('heading', { level: 1, name: tercero.nombre })).toBeVisible();
    const origen = expediente.locator('[data-origen-flujo="Regla"]');
    await expect(origen).toContainText('Se escogió por regla');
    await paso(pagina, {
      titulo: 'Comprueba qué flujo y por qué lo escogió',
      explicacion:
        'El detalle del expediente dice que se escogió por regla, con la condición tal como quedó publicada, la prioridad y cuántas reglas se evaluaron hasta la que cumplió. ' +
        'Si el tercero hubiera sido persona natural, la regla no se habría cumplido y el expediente usaría el flujo por defecto, y lo diría así.',
      resaltar: origen,
    });
  },
);
