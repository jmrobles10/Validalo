import { ThemeProvider } from '@mui/material';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { configurarCliente, reiniciarCliente, SCOPES, type AreaExpedienteDto, type RequisitoExpedienteDto } from '@validalo/api-client';
import { createValidaloTheme } from '@validalo/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { area, areaDeRequisito, expediente, requisito } from '../datosPrueba';
import type { ContextoRevisor, DialogoExpediente } from '../reglas';
import { PanelRequisitos } from './PanelRequisitos';

const CONTEXTO: ContextoRevisor = {
  scopes: new Set([SCOPES.expedientesLeer, SCOPES.expedientesRevisar, SCOPES.expedientesAdministrar, SCOPES.documentosLeer]),
  usuarioId: 'u-1',
  esMiembro: true,
};

const ACCESO = area({ areaId: 'a1', codigo: 'ACCESO', nombre: 'Acceso Total', estado: 'Esperando' });
const VENTAS = area({ areaId: 'a2', codigo: 'VENTAS', nombre: 'Sala ventas', estado: 'Esperando' });
const SINCSOFT = area({ areaId: 'a3', codigo: 'SINC', nombre: 'Integración SincSoft', estado: 'Esperando' });

const tipo = (id: string, nombre: string) => ({ id, codigo: id.toUpperCase(), nombre, tipoCanonico: null, ambito: 'Global' as const });
const esperando = (...areas: AreaExpedienteDto[]) => areas.map((a) => areaDeRequisito({ areaId: a.areaId, codigo: a.codigo, estado: 'Esperando' }));

const PENDIENTES: RequisitoExpedienteDto[] = [
  requisito({ id: 'p1', tipoDocumento: tipo('iso', 'Certificados ISO'), obligatorio: true, estado: 'Pendiente', versionActual: null, areas: esperando(ACCESO, VENTAS, SINCSOFT) }),
  requisito({ id: 'p2', tipoDocumento: tipo('ref', 'Carta de referencias'), obligatorio: false, estado: 'Pendiente', versionActual: null, areas: esperando(ACCESO, VENTAS, SINCSOFT) }),
];
const POR_REVISAR = requisito({ id: 'r1', tipoDocumento: tipo('rut', 'Registro Único Tributario'), estado: 'EnRevision', areas: [areaDeRequisito({ areaId: 'a1', codigo: 'ACCESO', estado: 'Pendiente' })] });
const OBSERVADO = requisito({ id: 'o1', tipoDocumento: tipo('cam', 'Cámara de comercio'), estado: 'Observado', areas: [areaDeRequisito({ areaId: 'a1', codigo: 'ACCESO', estado: 'Observado' })] });
const APROBADO = requisito({ id: 'a1', tipoDocumento: tipo('ced', 'Cédula del representante'), estado: 'Aprobado', areas: [areaDeRequisito({ areaId: 'a1', codigo: 'ACCESO', estado: 'Aprobado', aprobaciones: 1 })] });
const EXIMIDO = requisito({ id: 'e1', tipoDocumento: tipo('sst', 'Certificado SST'), estado: 'Eximido', exencion: { por: 'u-1', fecha: '2026-11-02T10:00:00Z', justificacion: 'No aplica' }, areas: [] });

function montar(requisitos: RequisitoExpedienteDto[], onAccion: (d: DialogoExpediente) => void = () => undefined) {
  configurarCliente({ fetch: vi.fn(() => new Promise<Response>(() => undefined)) });
  const base = expediente('EnRevision', [ACCESO]);
  render(
    <ThemeProvider theme={createValidaloTheme('light')}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <PanelRequisitos
          expediente={{
            ...base,
            etapas: [
              { orden: 1, estado: 'Activa', activadaEn: null, aprobadaEn: null, areas: [ACCESO] },
              { orden: 2, estado: 'Esperando', activadaEn: null, aprobadaEn: null, areas: [VENTAS] },
              { orden: 3, estado: 'Esperando', activadaEn: null, aprobadaEn: null, areas: [SINCSOFT] },
            ],
            requisitos,
          }}
          contexto={() => CONTEXTO}
          nombres={new Map()}
          onAccion={onAccion}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

afterEach(() => reiniciarCliente());

describe('Requisitos del expediente agrupados por situación', () => {
  it('los grupos con su conteo, en orden: por revisar, observados, le toca al tercero, aprobados y eximidos; los vacíos no se muestran', () => {
    montar([...PENDIENTES, POR_REVISAR, OBSERVADO, APROBADO, EXIMIDO]);

    const titulos = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(titulos).toEqual(['Por revisar', 'Observados', 'Le toca al tercero', 'Aprobados', 'Eximidos o que no aplican']);
    expect(within(screen.getByRole('region', { name: 'Le toca al tercero' })).getByText('2')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Por revisar' })).getByText('1')).toBeInTheDocument();
  });

  it('un grupo sin requisitos no aparece', () => {
    montar(PENDIENTES);
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Le toca al tercero']);
    expect(screen.queryByRole('region', { name: 'Por revisar' })).not.toBeInTheDocument();
  });

  it('los pendientes del tercero son tarjetas compactas: nombre, «Opcional» solo si lo es, «Pendiente del tercero» y «Eximir»; sin «Obligatorio», sin «El tercero aún no lo carga» y SIN la fila de etapas', () => {
    montar(PENDIENTES);

    const grupo = within(screen.getByRole('region', { name: 'Le toca al tercero' }));
    const filas = grupo.getAllByRole('listitem');
    expect(filas).toHaveLength(2);
    expect(filas[0]).toHaveTextContent('Certificados ISO');
    expect(within(filas[0]!).queryByText('Opcional')).not.toBeInTheDocument();
    expect(within(filas[1]!).getByText('Opcional')).toBeInTheDocument();
    for (const fila of filas) {
      expect(within(fila).getByRole('button', { name: 'Eximir' })).toBeInTheDocument();
      expect(within(fila).getByText('Pendiente del tercero')).toBeInTheDocument();
    }
    expect(grupo.queryByText('Obligatorio')).not.toBeInTheDocument();
    expect(screen.queryByText(/El tercero aún no lo carga/)).not.toBeInTheDocument();
    // Ni «En espera» ni «0 de 1»: las áreas se dicen una vez, arriba.
    expect(screen.queryByText('En espera')).not.toBeInTheDocument();
    expect(screen.queryByText(/0 de 1/)).not.toBeInTheDocument();
  });

  it('cada requisito es una tarjeta propia (borde, radio y sombra) y el panel NO está envuelto en otra tarjeta: título y grupos directo sobre la página', () => {
    montar([POR_REVISAR, ...PENDIENTES]);

    // Cada requisito: su título (h4) vive dentro de su tarjeta (el `li` de la lista del grupo).
    const tarjetas = screen.getAllByRole('heading', { level: 4 }).map((titulo) => titulo.closest('li')!);
    expect(tarjetas).toHaveLength(3);
    for (const tarjeta of tarjetas) {
      const estilo = getComputedStyle(tarjeta);
      expect(estilo.borderTopWidth).toBe('1px');
      expect(estilo.boxShadow).not.toBe('none');
      expect(estilo.borderRadius).not.toBe('0px');
    }
    const panel = screen.getByRole('heading', { level: 2, name: 'Documentos que pide el flujo' }).closest('section')!;
    expect(getComputedStyle(panel).borderTopWidth).toBe('0px');
  });

  it('el borde de lo por revisar toma el color del acento; el de lo que le toca al tercero queda gris', () => {
    montar([POR_REVISAR, ...PENDIENTES]);

    const revisar = within(screen.getByRole('region', { name: 'Por revisar' })).getAllByRole('listitem')[0]!;
    const pendiente = within(screen.getByRole('region', { name: 'Le toca al tercero' })).getAllByRole('listitem')[0]!;
    expect(getComputedStyle(revisar).borderTopColor).not.toBe(getComputedStyle(pendiente).borderTopColor);
  });

  it('«Eximir» de la fila abre el diálogo de ese requisito', async () => {
    const acciones: DialogoExpediente[] = [];
    montar(PENDIENTES, (d) => acciones.push(d));

    await userEvent.setup().click(within(screen.getAllByRole('listitem')[1]!).getByRole('button', { name: 'Eximir' }));
    expect(acciones).toEqual([{ tipo: 'eximir', requisito: PENDIENTES[1] }]);
  });

  it('arriba, una sola línea dice qué áreas revisan, en el orden de las etapas', () => {
    montar(PENDIENTES);
    expect(screen.getByText('Revisan: Acceso Total → Sala ventas → Integración SincSoft')).toBeInTheDocument();
  });

  it('lo que hay por revisar conserva su tarjeta completa, con el estado, las áreas y sus acciones', () => {
    montar([POR_REVISAR, ...PENDIENTES]);

    const tarjeta = within(screen.getByRole('region', { name: 'Por revisar' }));
    expect(tarjeta.getByRole('heading', { name: 'Registro Único Tributario' })).toBeInTheDocument();
    expect(tarjeta.getByRole('button', { name: 'Eximir' })).toBeInTheDocument();
    // Las áreas que lo revisan, con su avance, solo aquí (no en los pendientes).
    expect(tarjeta.getByText('Acceso Total')).toBeInTheDocument();
    expect(tarjeta.getByText('0 de 1')).toBeInTheDocument();
  });

  it('lo aprobado y lo eximido van plegados mientras haya algo por atender; «Mostrar» los abre', async () => {
    montar([POR_REVISAR, APROBADO, EXIMIDO]);

    expect(screen.queryByText('Cédula del representante')).not.toBeInTheDocument();
    expect(screen.queryByText('Certificado SST')).not.toBeInTheDocument();
    const aprobados = within(screen.getByRole('region', { name: 'Aprobados' }));
    await userEvent.setup().click(aprobados.getByRole('button', { name: 'Mostrar' }));
    expect(await screen.findByText('Cédula del representante')).toBeInTheDocument();
    expect(aprobados.getByRole('button', { name: 'Ocultar' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('si todo está resuelto no hay nada que plegar: los aprobados se ven', () => {
    montar([APROBADO]);
    expect(screen.getByText('Cédula del representante')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mostrar' })).not.toBeInTheDocument();
  });
});
