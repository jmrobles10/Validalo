import { expect, test, type Browser, type FrameLocator, type Page } from '@playwright/test';
import { llamar } from '../soporte/api';
import { pdf } from '../soporte/archivos';
import { abrirEmbebido } from '../soporte/embebido';
import { abrirDesdeBandeja, aprobarArea, irASector, regionDeArea } from '../soporte/empresa';
import { enPantalla } from '../soporte/fechas';
import { aceptarInvitacion, entrarPorInvitacion, esperarEstadoDelTercero, subirDocumento, tarjeta } from '../soporte/proveedor';
import { activarIa, crearEscenario, expedienteAbierto, invitar, nuevoTercero, publicarFlujoConFicha, revisarVigencias, type Escenario, type Invitacion, type Tercero } from '../soporte/semilla';

/**
 * Frescura en dos reglas independientes (TD-10…TD-15): la antigüedad máxima al subir y revalidar cada N días desde que la empresa aprueba. Todo por pantalla: la
 * administradora configura el tipo en la web, el tercero sube su Cámara de comercio en el portal y Sofía la revisa. La IA es la simulada: la fecha de expedición que «lee»
 * sale de la marca `[[fechaExpedicion=aaaa-mm-dd]]` del PDF (sin la marca, no hay fecha). El tipo `CAMARA_COMERCIO` de un grupo nuevo trae lo que sugiere el catálogo:
 * antigüedad máxima de 30 días y revalidar cada 365 (1 año). Sur tiene un solo área, Revisión, que decide sobre la Cámara.
 */

const CAMARA = 'Certificado de existencia y representación legal';
const MENSAJE = `Sube el documento «${CAMARA}» expedido hace menos de 30 días`;
const BARRIDO = { timeout: 45_000 };

/** `aaaa-mm-dd` de hoy más `dias` días calendario en Bogotá (la zona horaria del grupo de las pruebas). */
function enDias(dias: number): string {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date());
  const [a, m, d] = hoy.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** La Cámara de un tercero: con `expedida` el analizador simulado «lee» esa fecha de expedición; sin ella, el documento no trae ninguna. */
function camara(tercero: Tercero, expedida: string | null) {
  return pdf(`Camara ${tercero.nombre} [[razonSocial=${tercero.nombre}]]${expedida ? `[[fechaExpedicion=${expedida}]]` : ''}`);
}

async function paginaDe(browser: Browser): Promise<Page> {
  return (await browser.newContext()).newPage();
}

/** La tarjeta de un documento en el expediente que ve la revisora. */
function tarjetaDeDocumento(app: FrameLocator, documento: string) {
  return app.getByRole('listitem').filter({ has: app.getByRole('heading', { level: 4, name: documento, exact: true }) }).first();
}

type Nivel = 'Asistido' | 'Automatico';

/**
 * Grupo con Sur pidiendo la Cámara de comercio a sus clientes, con IA (el simulado) y la revisión automática en `nivel`. En Automático la IA puede observar sola
 * lo que no cumple; en Asistido solo sugiere y decide una persona.
 */
async function prepararSur(nivel: Nivel): Promise<Escenario> {
  const e = await crearEscenario();
  await activarIa(e, e.sur);
  await publicarFlujoConFicha(e, e.sur, 'CLIENTES_ANTIGUEDAD', e.sur.areas.revision!, [{ tipoDocumento: 'CAMARA_COMERCIO' }]);
  const cuerpo =
    nivel === 'Automatico'
      ? { nivel, umbralConfianza: 0.95, porcentajeMuestreo: 0, topeMensualAprobaciones: null, tiposAutorizados: ['CAMARA_COMERCIO'], areasAutorizadas: [e.sur.areas.revision!.id], esperaIaMinutos: 10 }
      : { nivel };
  await llamar('PUT', '/api/v1/configuracion/revision-automatica', { llave: e.admin, empresa: e.sur.id, cuerpo });
  return e;
}

interface TerceroConCamara {
  tercero: Tercero;
  invitacion: Invitacion;
  pagina: Page;
  expedienteId: string;
}

/** El tercero entra por su invitación, acepta y sube su Cámara (expedida en `expedida`, o sin fecha). Queda en «Tu revisión con Constructora Sur S.A.S.». */
async function terceroSubeCamara(browser: Browser, e: Escenario, nombre: string, expedida: string | null): Promise<TerceroConCamara> {
  const tercero = nuevoTercero(nombre);
  const pagina = await paginaDe(browser);
  const invitacion = await invitar(e, e.sur, tercero, 'CLIENTE');
  await entrarPorInvitacion(pagina, invitacion);
  await aceptarInvitacion(pagina, invitacion);
  await subirDocumento(pagina, CAMARA, camara(tercero, expedida));
  return { tercero, invitacion, pagina, expedienteId: await expedienteAbierto(e, invitacion) };
}

/** Sofía abre el expediente por su dirección (un expediente observado ya no está en su bandeja) y va al sector de la Cámara. */
async function sofiaVeLaCamara(browser: Browser, e: Escenario, expedienteId: string, tercero: Tercero): Promise<FrameLocator> {
  const sofia = await abrirEmbebido(await paginaDe(browser), e, e.sofia, e.sur, `expedientes/${expedienteId}`);
  await expect(sofia.getByRole('heading', { level: 1, name: tercero.nombre })).toBeVisible();
  await irASector(sofia, 'Información legal');
  return sofia;
}

/** Aprobar el requisito en nombre del área por la API (lo que hace el sistema integrado): sin justificación, con una antigüedad incumplida, no se deja. */
async function aprobarPorApi(e: Escenario, expedienteId: string, cuerpo: Record<string, unknown>): Promise<unknown> {
  const delegado = () => e.delegado(e.sofia);
  const expediente = await llamar<{ requisitos: { id: string; tipoDocumento: { codigo: string } }[] }>('GET', `/api/v1/expedientes/${expedienteId}`, {
    llave: e.llave,
    empresa: e.sur.id,
    delegado: delegado(),
  });
  const requisito = expediente.requisitos.find((r) => r.tipoDocumento.codigo === 'CAMARA_COMERCIO');
  if (!requisito) throw new Error('El expediente no trae el requisito de la Cámara de comercio.');
  return llamar('POST', `/api/v1/expedientes/${expedienteId}/requisitos/${requisito.id}/areas/${e.sur.areas.revision!.id}/veredicto`, {
    llave: e.llave,
    empresa: e.sur.id,
    delegado: delegado(),
    cuerpo,
  });
}

test('el tipo se configura con antigüedad máxima de 30 días y revalidación cada 12 meses, se lee en palabras y el tercero lo ve en su portal antes de que la empresa apruebe', async ({ browser }) => {
  test.setTimeout(300_000);
  const e = await crearEscenario();
  await publicarFlujoConFicha(e, e.sur, 'CLIENTES_REGLAS', e.sur.areas.revision!, [{ tipoDocumento: 'CAMARA_COMERCIO' }]);

  // 1. La administradora abre el tipo en Configuración › Tipos de documento: un grupo nuevo ya trae lo que sugiere el catálogo para la Cámara.
  const ana = await abrirEmbebido(await paginaDe(browser), e, e.ana, e.sur, 'tipos-documento');
  await expect(ana.getByRole('heading', { level: 1, name: 'Tipos de documento' })).toBeVisible();
  const fila = ana.getByRole('row', { name: `Editar ${CAMARA}` });
  await expect(fila).toContainText('Expedido hace menos de 30 días · Se revalida cada 1 año desde que lo apruebas');

  const panel = ana.locator('[aria-labelledby="titulo-tipo-documento"]');
  const antiguedad = panel.getByRole('textbox', { name: 'Antigüedad máxima al subirlo' });
  const revalidar = panel.getByRole('textbox', { name: 'Revalidar cada' });
  await fila.click();
  await expect(panel).toBeVisible();
  await expect(antiguedad).toHaveValue('30');
  await expect(revalidar).toHaveValue('12');
  await expect(panel.getByRole('combobox', { name: 'Unidad' })).toHaveText('meses');

  // 2. Cambia las dos reglas (45 días y 6 meses): se guardan y la tabla las lee en palabras.
  await antiguedad.fill('45');
  await revalidar.fill('6');
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await expect(panel).toBeHidden();
  await expect(fila).toContainText('Expedido hace menos de 45 días · Se revalida cada 6 meses desde que lo apruebas');

  // 3. Las deja como pide el dueño del producto: antigüedad máxima de 30 días y revalidar cada 12 meses (que se guardan como 365 días).
  await fila.click();
  await expect(panel).toBeVisible();
  await expect(antiguedad).toHaveValue('45');
  await expect(revalidar).toHaveValue('6');
  await antiguedad.fill('30');
  await revalidar.fill('12');
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await expect(panel).toBeHidden();
  await expect(fila).toContainText('Expedido hace menos de 30 días · Se revalida cada 1 año desde que lo apruebas');
  const tipos = await llamar<{ codigo: string; antiguedadMaximaDias: number | null; revalidarCadaDias: number | null }[]>('GET', '/api/v1/tipos-documento', { llave: e.admin, empresa: e.sur.id });
  expect(tipos.find((t) => t.codigo === 'CAMARA_COMERCIO')).toMatchObject({ antiguedadMaximaDias: 30, revalidarCadaDias: 365 });

  // 4. El tercero ve la regla en su línea de reglas antes de subir…
  const tercero = nuevoTercero('Aceros Reglas S.A.S.');
  const pagina = await paginaDe(browser);
  const invitacion = await invitar(e, e.sur, tercero, 'CLIENTE');
  await entrarPorInvitacion(pagina, invitacion);
  await aceptarInvitacion(pagina, invitacion);
  await expect(tarjeta(pagina, CAMARA)).toContainText('expedido hace menos de 30 días');

  // 5. …y, ya subida, no le dice «No vence»: la fecha empieza a contar cuando Sur la apruebe.
  await subirDocumento(pagina, CAMARA, camara(tercero, enDias(-5)));
  await expect(tarjeta(pagina, CAMARA)).toContainText(`Vence 1 año después de que ${e.sur.nombre} lo apruebe`);
  await expect(tarjeta(pagina, CAMARA)).not.toContainText('No vence');
});

test('en Automático una Cámara expedida hace 860 días se observa sola: el tercero ve qué subir (y que la fecha debe verse) y la revisora ve el hallazgo crítico', async ({ browser }) => {
  test.setTimeout(360_000);
  const e = await prepararSur('Automatico');

  // Expedida hace 860 días: el sistema la observa sin pasar por una persona.
  const vieja = await terceroSubeCamara(browser, e, 'Aceros Viejos S.A.S.', enDias(-860));
  await esperarEstadoDelTercero(vieja.pagina, 'Observado');
  await expect(tarjeta(vieja.pagina, CAMARA)).toContainText(`${MENSAJE}.`);
  await expect(vieja.pagina.getByText(/Confianza|gpt-6/)).toHaveCount(0);

  // La revisora ve «Antigüedad del documento» como crítico, con los días contra el máximo y lo que pasa si la aprueba.
  const sofia = await sofiaVeLaCamara(browser, e, vieja.expedienteId, vieja.tercero);
  const deLaVieja = tarjetaDeDocumento(sofia, CAMARA);
  await expect(deLaVieja).toContainText('Antigüedad: 860 días, máximo 30');
  await expect(deLaVieja.getByRole('alert').filter({ hasText: 'Antigüedad del documento' })).toContainText(
    `Expedida el ${enPantalla(enDias(-860))}: 860 días; el máximo es 30. Aprobarlo pide una justificación.`,
  );

  // Sin fecha de expedición legible: no se puede verificar, así que también se observa y se le pide que el documento la muestre.
  const sinFecha = await terceroSubeCamara(browser, e, 'Aceros Sin Fecha S.A.S.', null);
  await esperarEstadoDelTercero(sinFecha.pagina, 'Observado');
  await expect(tarjeta(sinFecha.pagina, CAMARA)).toContainText(`${MENSAJE} y que muestre su fecha de expedición.`);
  const sofiaSinFecha = await sofiaVeLaCamara(browser, e, sinFecha.expedienteId, sinFecha.tercero);
  await expect(tarjetaDeDocumento(sofiaSinFecha, CAMARA)).toContainText('Antigüedad: sin fecha de expedición, máximo 30 días');
});

test('en Asistido la antigüedad excedida solo se sugiere revisar: el tercero lee el aviso, la revisora ve el hallazgo crítico y no puede aprobarla sin justificación', async ({ browser }) => {
  test.setTimeout(360_000);
  const e = await prepararSur('Asistido');
  const vieja = await terceroSubeCamara(browser, e, 'Aceros Asistidos S.A.S.', enDias(-860));

  // El tercero ve el aviso apenas llega la lectura, aunque nadie la haya decidido todavía: qué documento subir.
  await esperarEstadoDelTercero(vieja.pagina, 'EnRevision');
  await expect(async () => {
    await vieja.pagina.reload();
    await expect(tarjeta(vieja.pagina, CAMARA)).toContainText(MENSAJE, { timeout: 1500 });
  }).toPass(BARRIDO);

  // La IA no decide, sugiere revisar; el hallazgo crítico queda a la vista.
  const sofia = await abrirEmbebido(await paginaDe(browser), e, e.sofia, e.sur);
  await expect(async () => {
    await abrirDesdeBandeja(sofia, vieja.tercero.nombre, 'Revisión', 'Cliente');
    await irASector(sofia, 'Información legal');
    await expect(tarjetaDeDocumento(sofia, CAMARA).getByRole('region', { name: 'Decisión automática' })).toContainText('La IA sugiere revisar', { timeout: 1500 });
  }).toPass(BARRIDO);
  const tarjetaVieja = tarjetaDeDocumento(sofia, CAMARA);
  await expect(tarjetaVieja).toContainText('Antigüedad: 860 días, máximo 30');
  await expect(tarjetaVieja.getByRole('alert').filter({ hasText: 'Antigüedad del documento' })).toContainText('Aprobarlo pide una justificación.');

  // Aprobar el requisito sin justificación: la API responde con el error de justificación.
  await expect(aprobarPorApi(e, vieja.expedienteId, { veredicto: 'Aprobado', sobreVersion: 1 })).rejects.toMatchObject({ estado: 422, codigo: 'justificacion-por-discrepancias' });

  // Por pantalla, «Aprobar área» tampoco se deja enviar sin justificación; con ella el área aprueba y la justificación queda escrita.
  await irASector(sofia, 'Aprobaciones');
  await regionDeArea(sofia, 'Revisión').getByRole('button', { name: /^Aprobar área/ }).click();
  const dialogo = sofia.getByRole('dialog', { name: /^Aprobar Revisión/ });
  await expect(dialogo.getByRole('button', { name: /^Aprobar área/ })).toBeDisabled();
  const justificacion = 'La Cámara es de 2024 pero el estado de la matrícula se verificó en el RUES.';
  await dialogo.getByRole('textbox', { name: /Justificación de la aprobación/ }).fill(justificacion);
  await dialogo.getByRole('button', { name: /^Aprobar área/ }).click();
  await expect(dialogo).toBeHidden();
  await irASector(sofia, 'Información legal');
  await expect(tarjetaDeDocumento(sofia, CAMARA)).toContainText(justificacion);

  // El tercero ya no tiene nada que subir: con el documento aprobado el aviso de antigüedad desaparece.
  await esperarEstadoDelTercero(vieja.pagina, 'Aprobado');
  await expect(tarjeta(vieja.pagina, CAMARA)).not.toContainText('Sube el documento');
});

test('una Cámara expedida hace 5 días no se observa; aprobada, vence un año después de la aprobación (en la web y en el portal) y, avanzado el reloj, vence y se pide de nuevo', async ({ browser }) => {
  test.setTimeout(420_000);
  const e = await prepararSur('Asistido');
  const reciente = await terceroSubeCamara(browser, e, 'Aceros Recientes S.A.S.', enDias(-5));

  // Sin observación: el tercero solo espera, y la fecha de vencimiento aún no existe (cuenta desde que Sur apruebe).
  await esperarEstadoDelTercero(reciente.pagina, 'EnRevision');
  await expect(tarjeta(reciente.pagina, CAMARA)).not.toContainText('Sube el documento');
  await expect(tarjeta(reciente.pagina, CAMARA)).toContainText(`Vence 1 año después de que ${e.sur.nombre} lo apruebe`);

  // La revisora la ve cumpliendo la antigüedad, sin hallazgo, y con la vigencia por aprobar.
  const sofia = await abrirEmbebido(await paginaDe(browser), e, e.sofia, e.sur);
  await expect(async () => {
    await abrirDesdeBandeja(sofia, reciente.tercero.nombre, 'Revisión', 'Cliente');
    await irASector(sofia, 'Información legal');
    await expect(tarjetaDeDocumento(sofia, CAMARA).getByRole('region', { name: 'Decisión automática' })).toContainText('La IA sugiere aprobar', { timeout: 1500 });
  }).toPass(BARRIDO);
  const tarjetaReciente = tarjetaDeDocumento(sofia, CAMARA);
  await expect(tarjetaReciente).toContainText('Antigüedad: 5 días, máximo 30');
  await expect(tarjetaReciente.getByRole('alert').filter({ hasText: 'Antigüedad del documento' })).toHaveCount(0);
  await expect(tarjetaReciente).toContainText('Vence 1 año después de que lo apruebes');
  await expect(tarjetaReciente).not.toContainText('Sin vencimiento');
  await expect(tarjetaReciente).not.toContainText('no vence');

  // Sofía la aprueba: desde ese día cuenta un año.
  await irASector(sofia, 'Aprobaciones');
  await aprobarArea(sofia, 'Revisión');
  const vence = enDias(365);
  await esperarEstadoDelTercero(reciente.pagina, 'Aprobado');

  // En el portal, la fecha sale apenas corre el barrido de vigencias (sin sleeps largos: se recarga hasta que aparezca).
  await expect(async () => {
    await reciente.pagina.reload();
    await expect(tarjeta(reciente.pagina, CAMARA)).toContainText(`Vence el ${enPantalla(vence)}`, { timeout: 1500 });
  }).toPass(BARRIDO);
  await expect(tarjeta(reciente.pagina, CAMARA)).not.toContainText('después de que');

  // En la web, el expediente y «Vencimientos» dicen la misma fecha (el portal ya la mostró: el barrido corrió).
  const deLaAprobada = tarjetaDeDocumento(await sofiaVeLaCamara(browser, e, reciente.expedienteId, reciente.tercero), CAMARA);
  await expect(deLaAprobada).toContainText(`Vence el ${enPantalla(vence)}`);
  await expect(deLaAprobada).not.toContainText('Sin fecha aún');
  const ana = await abrirEmbebido(await paginaDe(browser), e, e.ana, e.sur, 'vencimientos?dias=0');
  await expect(ana.getByRole('heading', { level: 1, name: 'Vencimientos' })).toBeVisible();
  const filaVencimiento = ana.getByRole('row').filter({ hasText: reciente.tercero.nombre });
  await expect(filaVencimiento).toContainText('Vigente');
  await expect(filaVencimiento).toContainText(enPantalla(vence));

  // Se avanza el reloj hasta pasar el vencimiento y su gracia (job de vigencias con fecha simulada, solo Development): la versión vence.
  const resultado = await revisarVigencias(e, new Date(`${enDias(365 + 60)}T13:00:00Z`), { incluirDocumentos: true });
  expect(resultado.documentosVencidos).toBe(1);

  // El tercero ve el documento vencido y se le pide uno nuevo.
  await expect(async () => {
    await reciente.pagina.reload();
    await expect(tarjeta(reciente.pagina, CAMARA)).toContainText('Vencido', { timeout: 1500 });
  }).toPass(BARRIDO);
  await expect(tarjeta(reciente.pagina, CAMARA)).toContainText('Está vencido: sube una versión nueva.');
  await expect(tarjeta(reciente.pagina, CAMARA).getByRole('button', { name: /^Subir/ })).toBeVisible();

  // La empresa lo ve vencido en «Vencimientos».
  await expect(async () => {
    await ana.owner().page().reload();
    await expect(ana.getByRole('row').filter({ hasText: reciente.tercero.nombre })).toContainText('Vencida', { timeout: 1500 });
  }).toPass(BARRIDO);
});
