import { abrirEmbebido } from '../../soporte/embebido';
import { agregarDocumento } from '../../soporte/editorDeFlujos';
import { crearEscenario } from '../../soporte/semilla';
import { expect, paso, recorrido } from '../nucleo';

const RUT = 'Registro Único Tributario';
const CAMARA = 'Certificado de existencia y representación legal';
const CEDULA = 'Cédula de ciudadanía';

recorrido(
  {
    dominio: 'configuracion',
    actor: 'Administrador de empresa',
    titulo: 'Pide cada documento según el tipo de persona',
    resumen:
      'La administradora arma un flujo de proveedores en el que el RUT se pide a todos, la Cámara de comercio solo a personas jurídicas y la cédula solo a personas naturales. Así el tercero entrega lo que le corresponde y nada más.',
    precondiciones: [
      'Un grupo empresarial con la empresa «Constructora Sur S.A.S.», su área «Revisión» con miembros y los tipos de documento RUT, Cámara de comercio y Cédula.',
      'Una persona con el rol Administrador que entra a Valídalo desde el sistema integrado.',
    ],
    relacionados: ['configuracion/tipo-de-documento-y-flujo'],
  },
  async ({ page }) => {
    const e = await crearEscenario();
    const app = await abrirEmbebido(page, e, e.ana, e.sur, 'flujos');
    await expect(app.getByRole('heading', { level: 1, name: `Flujos aprobatorios de ${e.sur.nombre}` })).toBeVisible();

    // 1. Abrir el editor de un flujo nuevo.
    await paso(page, {
      titulo: 'Abre un flujo nuevo para proveedores',
      explicacion:
        'Cada documento de un flujo tiene un campo «Se pide a» (al abrir su fila en «Lo que pide el flujo») que decide a qué terceros se les pide. Por omisión es «Todos»; las otras tres opciones limitan el documento: «Solo personas jurídicas» y «Solo personas naturales» según el tipo de persona del tercero, y «Según la ficha del tercero» según lo que declara en su ficha. ' +
        'Para armar el ejemplo creamos un flujo nuevo de proveedores desde «Nuevo flujo».',
      resaltar: app.getByRole('button', { name: 'Nuevo flujo' }),
      configuracion: {
        ajuste: 'Se pide a (por documento del flujo)',
        ruta: 'Configuración › Flujos aprobatorios (/flujos)',
        efecto: 'Un documento que no aplica al tercero no aparece en su lista y el área que solo lo revisa no tiene nada que decidir.',
      },
    });
    await app.getByRole('button', { name: 'Nuevo flujo' }).click();
    await app.getByRole('textbox', { name: /^Código/ }).fill('PROV_PERSONA');
    await app.getByRole('textbox', { name: /^Nombre/ }).fill('Proveedores por tipo de persona');
    await app.getByRole('combobox', { name: /^Tipo de vínculo/ }).click();
    await app.getByRole('option', { name: 'Proveedor', exact: true }).click();
    await app.getByRole('region', { name: 'Etapa 1' }).getByRole('combobox', { name: 'Área' }).click();
    await app.getByRole('option', { name: /^Revisión/ }).click();

    // 2. Tres documentos con condiciones distintas.
    // Cada documento nuevo queda abierto y los anteriores se cierran con su resumen (ya dicen «Solo personas jurídicas»): «Se pide a» es el del abierto.
    await agregarDocumento(app, new RegExp(RUT));
    await agregarDocumento(app, new RegExp(CAMARA));
    await app.getByRole('combobox', { name: 'Se pide a' }).click();
    await app.getByRole('option', { name: 'Solo personas jurídicas', exact: true }).click();
    await agregarDocumento(app, new RegExp(CEDULA));
    await app.getByRole('combobox', { name: 'Se pide a' }).click();
    await app.getByRole('option', { name: 'Solo personas naturales', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(app.getByRole('combobox', { name: 'Se pide a' })).toContainText('Solo personas naturales');
    await paso(page, {
      titulo: 'Elige a quién se pide cada documento',
      explicacion:
        'El RUT queda en «Todos»: lo entregan las personas jurídicas y las naturales. La Cámara de comercio queda en «Solo personas jurídicas» y la cédula en «Solo personas naturales». ' +
        'Cada documento también elige qué áreas lo revisan: por omisión, «Todas las áreas del flujo»; como este flujo tiene una sola área, Revisión revisa los tres. «Aprobadores» dice cuántas personas deben aprobar, y «Los del área» usa a todos los miembros. Un documento que no le toca a un tercero no lo ve ni lo entrega. Las filas cerradas ya lo resumen: a quién se pide, quién lo revisa y, si la hay, su condición.',
      resaltar: app.getByRole('combobox', { name: 'Se pide a' }),
      variantes: [
        { cuando: 'Eliges «Solo personas jurídicas»', entonces: 'El documento aparece en la lista del tercero solo si es persona jurídica.' },
        { cuando: 'El documento tiene una condición que no coincide con ningún atajo', entonces: 'Aparece la opción «Condición personalizada» y dice en qué se pide, por ejemplo «Se pide cuando …».' },
      ],
    });

    // 3. Guardar el borrador.
    await app.getByRole('button', { name: 'Crear borrador' }).click();
    await expect(app.getByRole('button', { name: 'Publicar v1' })).toBeVisible();
    await paso(page, {
      titulo: 'Guarda el flujo como borrador',
      explicacion:
        'Con «Crear borrador» las condiciones quedan guardadas en el borrador v1. Todavía no se usan: el flujo se publica después, igual que cualquier otro, y solo entonces los terceros verán cada documento según su tipo de persona.',
      resaltar: app.getByRole('button', { name: 'Publicar v1' }),
      avisos: true,
    });
  },
);
