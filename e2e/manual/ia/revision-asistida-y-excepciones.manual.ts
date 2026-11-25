import { pdf } from '../../soporte/archivos';
import { llamar } from '../../soporte/api';
import { abrirEmbebido } from '../../soporte/embebido';
import { abrirDesdeBandeja, regionDeArea } from '../../soporte/empresa';
import { completarInvitacionYEsperarRevisionOAprobacion } from '../../soporte/proveedor';
import { activarIa, crearEscenario, invitar, nuevoTercero, publicarFlujoConFicha } from '../../soporte/semilla';
import { expect, paso, recorrido } from '../nucleo';
import { irASector } from '../nucleo/ficha';
import { areaDe } from '../nucleo/semillas';

const RUT = 'Registro Único Tributario';

recorrido(
  {
    dominio: 'ia',
    actor: 'Revisor/área',
    titulo: 'Atiende una excepción de la revisión asistida',
    resumen:
      'Con el nivel Asistido la IA lee el RUT y sugiere, pero nunca aprueba sola. Cuando la lectura es dudosa, la IA sugiere revisar y muestra el motivo en el expediente; Sofía, de Revisión, lo abre y decide ella.',
    precondiciones: [
      'Un grupo con Constructora Sur, la IA activa, un flujo de Cliente que pide el RUT al área Revisión y la revisión automática en nivel Asistido.',
      'Un cliente que sube un RUT con lectura dudosa (confianza 55 %).',
    ],
    relacionados: ['ia/revision-automatica-niveles', 'ia/revision-automatica-aprueba-sola'],
  },
  async ({ browser }) => {
    const e = await crearEscenario();
    await activarIa(e, e.sur);
    await publicarFlujoConFicha(e, e.sur, 'CLIENTES_ASISTIDO', areaDe(e.sur, 'revision'), [{ tipoDocumento: 'RUT' }]);
    await llamar('PUT', '/api/v1/configuracion/revision-automatica', {
      llave: e.admin,
      empresa: e.sur.id,
      cuerpo: {
        nivel: 'Asistido',
        umbralConfianza: 0.95,
        porcentajeMuestreo: 0,
        topeMensualAprobaciones: null,
        tiposAutorizados: ['RUT'],
        areasAutorizadas: [areaDe(e.sur, 'revision').id],
        esperaIaMinutos: 10,
      },
    });

    const cliente = nuevoTercero('Aceros Dudosos S.A.S.');
    const invitacion = await invitar(e, e.sur, cliente, 'CLIENTE');
    const paginaCliente = await (await browser.newContext()).newPage();
    await completarInvitacionYEsperarRevisionOAprobacion(paginaCliente, invitacion, [
      { nombre: RUT, archivo: pdf(`RUT ${cliente.nombre} [[nit=${cliente.identificacion.numero}]][[razonSocial=${cliente.nombre}]][[confianza=0.55]]`) },
    ]);

    const paginaSofia = await (await browser.newContext()).newPage();
    const sofia = await abrirEmbebido(paginaSofia, e, e.sofia, e.sur, 'bandeja');
    await abrirDesdeBandeja(sofia, cliente.nombre, 'Revisión', 'Cliente');
    await irASector(sofia, 'Información tributaria');
    await expect(sofia.getByRole('heading', { level: 1, name: cliente.nombre })).toBeVisible();
    const conclusion = sofia.getByRole('region', { name: 'Conclusión de la IA' });
    await expect(conclusion).toContainText('Revisa antes de aprobar');
    await expect(conclusion).toContainText('La confianza del análisis');
    const aprobar = regionDeArea(sofia, 'Revisión').getByRole('button', { name: /^Aprobar área/ });
    await paso(paginaSofia, {
      titulo: 'Abre el expediente con la sugerencia de la IA',
      explicacion:
        'En Asistido, la IA lee el documento y abre su bloque «Revisión automática» con su conclusión. Cuando la lectura es dudosa, la conclusión dice «Revisa antes de aprobar» y el motivo concreto, por ejemplo que la confianza del análisis está bajo el umbral. Es una sugerencia: la IA nunca aprueba sola y la decisión es de quien revisa.',
      resaltar: [conclusion, sofia.getByRole('region', { name: 'Revisión automática', exact: true }).first()],
      variantes: [{ cuando: 'La lectura es limpia', entonces: 'La conclusión dice «Se sugiere aprobar» y, si puedes decidir en tu área, trae el botón «Aprobar»; la aprobación sigue siendo de una persona.' }],
    });

    await irASector(sofia, 'Aprobaciones');
    await paso(paginaSofia, {
      titulo: 'Decide el área después de revisar el documento',
      explicacion:
        'Revisa el documento y sus datos extraídos. Si todo está bien, «Aprobar área» registra la decisión de Revisión con tu nombre. Si no, usa las acciones de observar o rechazar del área como con cualquier expediente.',
      resaltar: aprobar,
    });
  },
);
