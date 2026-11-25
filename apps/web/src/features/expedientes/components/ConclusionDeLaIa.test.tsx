import { ThemeProvider } from '@mui/material';
import { render, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConclusionDeRevisionDto, RequisitoExpedienteDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { describe, expect, it, vi } from 'vitest';
import { areaDeRequisito, conclusionDeRevision, requisito } from '../datosPrueba';
import type { QuienDecideElRequisito } from '../requisitos';
import { ConclusionDeLaIa } from './ConclusionDeLaIa';

const ACCESO = { areaRequisito: areaDeRequisito({ areaId: 'a-acceso', codigo: 'ACCESO' }), nombre: 'Acceso Total' };
const PUEDE: QuienDecideElRequisito = { puede: ACCESO, pendientes: [] };
const NO_PUEDE: QuienDecideElRequisito = { puede: null, pendientes: ['Cumplimiento', 'Acceso Total'] };

const CEDULA = requisito({ tipoDocumento: { id: 'td-c', codigo: 'CEDULA', nombre: 'Fotocopia de la cédula del representante legal', tipoCanonico: 'CEDULA', ambito: 'Global' } });

function montar(conclusion: ConclusionDeRevisionDto, decide: QuienDecideElRequisito = PUEDE, doc: RequisitoExpedienteDto = CEDULA, onAprobar = vi.fn()) {
  const { container } = render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <ConclusionDeLaIa conclusion={conclusion} requisito={doc} decide={decide} onAprobar={onAprobar} />
    </ThemeProvider>,
  );
  return { onAprobar, region: within(container).getByRole('region', { name: 'Conclusión de la IA' }) };
}

describe('Conclusión de la IA: se sugiere aprobar', () => {
  it('todo coincide: «Se sugiere aprobar», lo que verificó y el botón «Aprobar» del área de quien puede decidir', async () => {
    const usuario = userEvent.setup();
    const { onAprobar, region } = montar(conclusionDeRevision());

    expect(region).toHaveAttribute('data-conclusion', 'Aprobar');
    expect(within(region).getByText('Se sugiere aprobar')).toBeInTheDocument();
    expect(region).toHaveTextContent('La IA verificó el documento: es legible, es del tipo pedido y lo que dice coincide con lo que declaró el tercero.');
    // Es una sugerencia y decide una persona: aquí, quien mira.
    expect(region).toHaveTextContent('Es una sugerencia de la IA: la decisión es tuya, por Acceso Total.');
    const boton = within(region).getByRole('button', { name: 'Aprobar Fotocopia de la cédula del representante legal por Acceso Total' });
    expect(boton).toHaveTextContent('Aprobar');
    await usuario.click(boton);
    expect(onAprobar).toHaveBeenCalledWith(ACCESO);
  });

  it('con la antigüedad verificada la suma a la frase, con «y» antes de lo último', () => {
    const { region } = montar(conclusionDeRevision({ antiguedadVerificada: true }));

    expect(region).toHaveTextContent('La IA verificó el documento: es legible, es del tipo pedido, lo que dice coincide con lo que declaró el tercero y su antigüedad está dentro del máximo.');
  });

  it('sin datos declarados con qué cruzar no dice que coincide con nada', () => {
    const { region } = montar(conclusionDeRevision({ cruzadoConLoDeclarado: false }));

    expect(region).toHaveTextContent('La IA verificó el documento: es legible y es del tipo pedido.');
    expect(region).not.toHaveTextContent('declaró el tercero');
  });

  it('la cédula de una persona relacionada que coincide dice con qué persona declarada coincide', () => {
    const { region } = montar(conclusionDeRevision({ persona: { nombre: 'JOEL MATEO ROBLES ATUESTA', identificacion: 'CC 1073250322' } }));

    expect(within(region).getByText('Se sugiere aprobar')).toBeInTheDocument();
    expect(region).toHaveTextContent('La IA verificó el documento: es legible, es del tipo pedido y coincide con la persona declarada JOEL MATEO ROBLES ATUESTA (CC 1073250322).');
    expect(within(region).getByRole('button', { name: /^Aprobar Fotocopia/ })).toBeInTheDocument();
  });

  it('el RUT con solo las actividades secundarias distintas: se sugiere aprobar, lo crítico coincide y la diferencia va aparte con lo declarado y lo leído', () => {
    const { region } = montar(conclusionDeRevision({ diferencias: [{ etiqueta: 'Actividades económicas secundarias', declarado: null, extraido: '8129, 4330, 4799' }] }));

    expect(within(region).getByText('Se sugiere aprobar')).toBeInTheDocument();
    expect(region).not.toHaveTextContent('Revisa antes de aprobar');
    expect(region).toHaveTextContent('La IA verificó el documento: es legible, es del tipo pedido y lo crítico coincide con lo que declaró el tercero.');
    expect(region.querySelector('[data-diferencias]')).toHaveTextContent('Difiere en un dato no crítico: Actividades económicas secundarias (declaró —; el documento trae 8129, 4330, 4799).');
    expect(within(region).getByRole('button', { name: /^Aprobar / })).toBeInTheDocument();
  });

  it('con varias diferencias no críticas las cuenta y las separa; una que el documento no trae lo dice', () => {
    const { region } = montar(
      conclusionDeRevision({
        diferencias: [
          { etiqueta: 'Dirección', declarado: 'Calle 1', extraido: 'Calle 2' },
          { etiqueta: 'Teléfono', declarado: '123', extraido: null },
        ],
      }),
    );

    expect(region.querySelector('[data-diferencias]')).toHaveTextContent('Difiere en 2 datos no críticos: Dirección (declaró Calle 1; el documento trae Calle 2); Teléfono (declaró 123; el documento no lo trae).');
  });

  it('lo crítico que el cruce no pudo verificar se dice, en advertencia, sin quitar la sugerencia', () => {
    const { region } = montar(conclusionDeRevision({ sinVerificar: ['Identificación del titular'] }));

    expect(within(region).getByText('Se sugiere aprobar')).toBeInTheDocument();
    expect(region.querySelector('[data-sin-verificar]')).toHaveTextContent('No se pudo verificar: identificación del titular.');
  });

  it('sin permiso o con otra área en turno no hay botón: dice quién decide', () => {
    const { region } = montar(conclusionDeRevision(), NO_PUEDE);

    expect(within(region).getByText('Se sugiere aprobar')).toBeInTheDocument();
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(region).toHaveTextContent('Es una sugerencia de la IA: decide una persona de Cumplimiento y Acceso Total.');
  });

  it('con el nivel Automático dice que el sistema tiene su propio flujo (y el botón sigue para quien puede decidir)', () => {
    const { region } = montar(conclusionDeRevision({ nivel: 'Automatico' }));

    expect(region).toHaveTextContent('La empresa tiene revisión automática: el sistema aprueba solo lo que cumple lo que autorizó y una persona decide lo demás.');
    expect(region).not.toHaveTextContent('Es una sugerencia de la IA');
    expect(within(region).getByRole('button', { name: /^Aprobar/ })).toBeInTheDocument();
  });

  it('con el requisito ya aprobado es un dato más: «Verificado por la IA», sin sugerir, sin botón y sin rol', () => {
    const { region } = montar(conclusionDeRevision(), PUEDE, requisito({ estado: 'Aprobado' }));

    expect(within(region).getByText('Verificado por la IA')).toBeInTheDocument();
    expect(region).not.toHaveTextContent('Se sugiere aprobar');
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent('Es una sugerencia');
  });
});

describe('Conclusión de la IA: revisa antes de aprobar', () => {
  const revisar = (codigo: string, texto: string) => conclusionDeRevision({ sugerencia: 'Revisar', cruzadoConLoDeclarado: false, motivos: [{ codigo, texto }] });

  it('discrepancia crítica: «Revisa antes de aprobar» con el motivo concreto y sin botón «Aprobar»', () => {
    const { region } = montar(revisar('discrepancia-critica-ficha', 'El documento difiere de lo declarado en: Número de la cuenta, Titular de la cuenta.'));

    expect(region).toHaveAttribute('data-conclusion', 'Revisar');
    expect(within(region).getByText('Revisa antes de aprobar')).toBeInTheDocument();
    expect(within(region).getByRole('list', { name: 'Qué revisar' })).toHaveTextContent('El documento difiere de lo declarado en: Número de la cuenta, Titular de la cuenta.');
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent('La IA verificó el documento');
    expect(region).toHaveTextContent('Es una sugerencia de la IA: la decisión es tuya, por Acceso Total.');
  });

  it('antigüedad excedida: dice los días y el máximo', () => {
    const { region } = montar(revisar('antiguedad-excedida', 'Expedida el 17/07/2024: 860 días; el máximo es 30.'));

    expect(within(region).getByText('Revisa antes de aprobar')).toBeInTheDocument();
    expect(within(region).getByRole('listitem')).toHaveTextContent('Expedida el 17/07/2024: 860 días; el máximo es 30.');
  });

  it('confianza baja: dice la confianza y el umbral', () => {
    const { region } = montar(revisar('confianza-baja', 'La confianza del análisis (62 %) está bajo el umbral de la empresa (85 %).'));

    expect(within(region).getByRole('listitem')).toHaveTextContent('La confianza del análisis (62 %) está bajo el umbral de la empresa (85 %).');
  });

  it('la cédula de otra persona: dice con quién no coincide y en qué', () => {
    const texto = 'El documento no coincide con la persona declarada, JOEL MATEO ROBLES ATUESTA (CC 1073250322): difiere en Número de identificación, Nombres y apellidos.';
    const { region } = montar(revisar('discrepancia-critica-ficha', texto));

    expect(within(region).getByText('Revisa antes de aprobar')).toBeInTheDocument();
    expect(within(region).getByRole('listitem')).toHaveTextContent(texto);
  });

  it('con varios motivos los lista todos, uno por línea', () => {
    const { region } = montar(
      conclusionDeRevision({
        sugerencia: 'Revisar',
        motivos: [
          { codigo: 'ilegible', texto: 'El documento no es legible.' },
          { codigo: 'tipo-detectado-distinto', texto: 'El documento parece ser de otro tipo (RUT).' },
        ],
      }),
    );

    expect(within(region).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['El documento no es legible.', 'El documento parece ser de otro tipo (RUT).']);
  });

  it('un hallazgo crítico se pinta distinto de uno que no lo es (error y advertencia)', () => {
    const { region: critico } = montar(revisar('discrepancia-critica-ficha', 'Difiere.'));
    const { region: leve } = montar(revisar('confianza-baja', 'Baja.'));
    const color = (region: HTMLElement) => getComputedStyle(within(region).getByText('Revisa antes de aprobar')).color;

    expect(color(leve)).not.toBe(color(critico));
  });
});

describe('Conclusión de la IA: sin análisis', () => {
  it('lo dice y manda a revisarlo a mano, sin sugerir ni mostrar botón', () => {
    const { region } = montar(conclusionDeRevision({ sugerencia: 'SinAnalisis', cruzadoConLoDeclarado: false, motivos: [{ codigo: 'sin-analisis-ia', texto: 'La empresa no recibió el análisis de IA de esta versión.' }] }));

    expect(region).toHaveAttribute('data-conclusion', 'SinAnalisis');
    expect(within(region).getByText('Sin análisis de la IA')).toBeInTheDocument();
    expect(region).toHaveTextContent('La IA no pudo analizarlo; revísalo a mano.');
    expect(within(region).queryByRole('button')).not.toBeInTheDocument();
    expect(region).not.toHaveTextContent('Es una sugerencia');
  });
});
