import { pdf } from '../../soporte/archivos';
import { cerrarDialogoDeSubida, completarInvitacion, elegirArchivo, esperarEstadoDelTercero } from '../../soporte/proveedor';
import { crearEscenario, invitar, nuevoTercero } from '../../soporte/semilla';
import { expect, paso, recorrido } from '../nucleo';

const RUT = 'Registro Único Tributario';

recorrido(
  {
    dominio: 'tercero',
    actor: 'Tercero',
    titulo: 'Sube un documento a tu bóveda',
    resumen:
      'Desde «Subir documento» llevas a tu bóveda un documento que quizá una empresa te pida después. Eliges el tipo, subes el archivo y, si ninguna empresa lo exige todavía, queda guardado y listo para cuando lo pidan.',
    precondiciones: [
      'Un grupo empresarial con «Constructora Sur S.A.S.», su flujo de Proveedor (RUT y certificado de seguridad y salud en el trabajo).',
      'Un tercero que ya completó su invitación de Sur, sin invitaciones pendientes, y que no tiene en su bóveda un certificado de existencia y representación legal.',
    ],
    relacionados: ['tercero/boveda-mis-documentos', 'tercero/boveda-documento-compartido'],
  },
  async ({ page }) => {
    const e = await crearEscenario();
    const tercero = nuevoTercero('Ferretería La Esquina S.A.S.');
    const invitacion = await invitar(e, e.sur, tercero, 'PROVEEDOR');
    await completarInvitacion(page, invitacion, [
      { nombre: RUT, archivo: pdf(`RUT ${tercero.identificacion.numero}`) },
      { nombre: 'Certificado de seguridad y salud en el trabajo', archivo: pdf(`SST ${tercero.identificacion.numero}`), campos: { 'Fecha de expedición': new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10) } },
    ]);
    await esperarEstadoDelTercero(page, 'EnRevision');

    // 1. Abrir «Subir documento» y elegir el tipo de documento.
    await page.goto('/boveda');
    await page.getByRole('button', { name: 'Subir documento' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Subir documento' });
    await expect(dialogo).toBeVisible();
    const tipo = dialogo.getByRole('combobox', { name: 'Tipo de documento' });
    await tipo.click();
    await page.getByRole('option', { name: 'Cámara de comercio', exact: true }).click();
    await expect(dialogo.getByText('Certificado de existencia y representación legal expedido por tu Cámara de comercio.')).toBeVisible();
    await paso(page, {
      titulo: 'Elige el tipo de documento',
      explicacion:
        '«Subir documento» abre una ventana, sin salir de tu bóveda. En «Tipo de documento» eliges qué vas a subir. Solo aparecen los tipos que Valídalo acepta en la bóveda. Al elegirlo, debajo ves qué debe contener el archivo. ' +
        'Si una empresa te pide ese documento más adelante, se lo compartimos sin que lo vuelvas a cargar.',
      resaltar: tipo,
    });

    // 2. Subir el archivo.
    await elegirArchivo(page, pdf(`Camara ${tercero.identificacion.numero}`), 'Listo. Es tu versión 1 de Cámara de comercio.');
    await expect(dialogo.getByText('Por ahora ninguna empresa la exige; queda en tu bóveda.')).toBeVisible();
    await paso(page, {
      titulo: 'Sube el archivo y revisa el resultado',
      explicacion:
        'Elige el archivo o arrástralo a la zona. Valídalo lo guarda como la versión 1 del documento, y el resultado te dice si alguna empresa lo está pidiendo. ' +
        'Aquí ninguna empresa la exige, así que queda en tu bóveda para cuando la pidan. Con «Listo» cierras la ventana y la encuentras en tu bóveda con su fecha de carga.',
      resaltar: dialogo.getByText('Listo. Es tu versión 1 de Cámara de comercio.'),
      variantes: [
        { cuando: 'Una empresa ya te pide ese documento', entonces: 'El resultado dice «Ya la tiene» seguido del nombre de la empresa, y la empresa empieza a revisarla.' },
        { cuando: 'Subes el mismo archivo que ya tienes', entonces: 'Valídalo lo detecta y no lo vuelve a guardar: indica que es idéntico a tu versión vigente.' },
      ],
    });
    await cerrarDialogoDeSubida(page);
    await expect(page.getByRole('article', { name: 'Cámara de comercio' })).toBeVisible();
  },
);
