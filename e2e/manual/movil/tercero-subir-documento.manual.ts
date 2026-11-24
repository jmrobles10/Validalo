import { expect, paso, recorrido } from '../nucleo';
import { pdf } from '../../soporte/archivos';
import { abrirEmpresa, cerrarDialogoDeSubida, elegirArchivo, tarjeta } from '../../soporte/proveedor';
import { CAMARA, terceroEnRevision } from './siembra';

recorrido(
  {
    dominio: 'movil',
    actor: 'Tercero',
    titulo: 'Sube un documento pendiente desde el celular',
    resumen:
      'Desde el celular, el tercero abre la revisión de una empresa, toca «Subir» en el documento que falta, elige el archivo de su teléfono en la ventana que se abre y, al cerrarla, sigue en su revisión con la versión ya guardada en su bóveda.',
    precondiciones: [
      'Un tercero invitado por Constructora Norte que ya entregó el RUT, pero no el certificado de existencia y representación legal.',
      'La pantalla se ve a 390 × 844 (celular).',
    ],
    relacionados: ['tercero/aceptar-invitacion-persona-juridica', 'movil/tercero-boveda'],
  },
  async ({ page }) => {
    await terceroEnRevision(page, 'Aceros del Caribe S.A.S.', false);
    await page.goto('/empresas');
    await abrirEmpresa(page, 'Constructora Norte S.A.S.');
    await expect(page.getByRole('heading', { level: 1, name: 'Tu revisión con Constructora Norte S.A.S.' })).toBeVisible();

    // 1. El documento que falta.
    const pendiente = tarjeta(page, CAMARA);
    await expect(pendiente.getByRole('button', { name: /^Subir/ })).toBeVisible();
    await paso(page, {
      titulo: 'Localiza el documento que falta',
      explicacion:
        'En «Tu revisión con» cada requisito aparece como una tarjeta con su nombre y su estado. El certificado de existencia y representación legal está pendiente: la tarjeta trae el botón «Subir» para cargarlo. ' +
        'El RUT ya aparece como entregado y no tienes que volver a subirlo.',
      resaltar: pendiente,
      variantes: [
        { cuando: 'El documento fue observado', entonces: 'La tarjeta muestra la observación de la empresa y el botón cambia a una nueva versión.' },
        { cuando: 'Ya subiste el documento y está en revisión', entonces: 'La tarjeta no ofrece «Subir»: solo muestra que la empresa lo está revisando.' },
      ],
    });

    // 2. Abrir la ventana de subida.
    await pendiente.getByRole('button', { name: /^Subir/ }).click();
    const dialogo = page.getByRole('dialog', { name: `Subir ${CAMARA}` });
    await expect(dialogo).toBeVisible();
    await paso(page, {
      titulo: 'Abre la ventana para subir el archivo',
      explicacion:
        'La ventana «Subir» recuerda qué documento es y qué debe traer: formatos, tamaño y, si lo pide, los datos del formulario; en el celular ocupa toda la pantalla y no sales de tu revisión. Para cargar el archivo, toca «Elegir archivo» y selecciona el PDF guardado en tu teléfono.',
      resaltar: dialogo.getByRole('button', { name: 'Elegir archivo' }),
    });

    // 3. Elegir el archivo.
    await elegirArchivo(page, pdf('Camara Aceros del Caribe'), `Es tu versión 1 de ${CAMARA}`);
    await paso(page, {
      titulo: 'Comprueba la versión guardada',
      explicacion:
        'Al terminar de subirlo, la ventana dice «Es tu versión 1» del documento. Esa versión queda en tu bóveda y es la que la empresa revisa; si la vuelves a subir, se guarda como una versión nueva.',
      resaltar: dialogo.getByText(`Es tu versión 1 de ${CAMARA}`),
      avisos: true,
    });

    // 4. Cerrar la ventana y seguir en la revisión.
    await cerrarDialogoDeSubida(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Tu revisión con Constructora Norte S.A.S.' })).toBeVisible();
    await paso(page, {
      titulo: 'Sigue en tu revisión',
      explicacion:
        'Con «Listo» cierras la ventana y sigues en la lista de requisitos de la empresa. La tarjeta del certificado ya muestra el documento que subiste; cuando todos los requisitos están entregados, la revisión sigue con la empresa.',
      resaltar: tarjeta(page, CAMARA),
    });
  },
);
