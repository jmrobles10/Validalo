import type { UsoIaDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import {
  aNumero,
  costoAtribuido,
  etiquetasDelEje,
  etiquetaMes,
  fechaCorta,
  formatearUsd,
  leerMes,
  marcasDelEje,
  mesActual,
  mesEnTitulo,
  momentosDelMes,
  nivelDeUso,
  porcentajeUsado,
  resumenDeLaSerie,
  serieDelMes,
  tokensAtribuidos,
  ultimosMeses,
} from './modelo';

const USO_BASE: UsoIaDto = {
  mes: '2026-11',
  plan: {
    configurado: true,
    validacionesIncluidasMes: 50,
    adicionalHabilitado: false,
    topeAdicionalMes: null,
    llaveConfigurada: true,
    modeloPorDefecto: 'gpt-6-luna',
    modeloEscalamiento: 'gpt-6.1-terra',
    umbralConfianza: 0.85,
    activo: true,
  },
  incluidasConsumidas: 10,
  adicionalesConsumidas: 0,
  incluidasRestantes: 40,
  adicionalesRestantes: 0,
  analisisPagados: 4,
  tokensEntrada: 4000,
  tokensEntradaEnCache: 800,
  tokensSalida: 1200,
  costoUsd: '0.001',
  porDia: [],
};

describe('modelo del uso de IA', () => {
  it('el mes actual es el de la zona del tenant', () => {
    // 1 de diciembre a las 02:00 UTC todavía es 30 de noviembre en Bogotá.
    expect(mesActual(new Date('2026-12-01T02:00:00Z'))).toBe('2026-11');
  });

  it('los últimos 12 meses cruzan el año', () => {
    const meses = ultimosMeses('2026-02');
    expect(meses).toHaveLength(12);
    expect(meses.slice(0, 3)).toEqual(['2026-02', '2026-01', '2025-12']);
    expect(meses.at(-1)).toBe('2025-03');
  });

  it('solo acepta de la URL un mes que esté en el selector', () => {
    const opciones = ultimosMeses('2026-11');
    expect(leerMes(new URLSearchParams('mes=2026-10'), opciones)).toBe('2026-10');
    expect(leerMes(new URLSearchParams('mes=2024-01'), opciones)).toBeNull();
    expect(leerMes(new URLSearchParams('mes=2026-13'), opciones)).toBeNull();
    expect(leerMes(new URLSearchParams(''), opciones)).toBeNull();
  });

  it('nombra el mes en español con mayúscula inicial', () => {
    expect(etiquetaMes('2026-03')).toBe('Marzo de 2026');
  });

  it('umbrales del 80 % y 100 %; sin incluidas cualquier consumo agota el cupo', () => {
    expect(nivelDeUso(porcentajeUsado(39, 50))).toBe('normal');
    expect(nivelDeUso(porcentajeUsado(40, 50))).toBe('alerta');
    expect(nivelDeUso(porcentajeUsado(50, 50))).toBe('agotado');
    expect(porcentajeUsado(0, 0)).toBe(0);
    expect(porcentajeUsado(1, 0)).toBe(100);
  });

  it('dólares con 4 decimales bajo 1 USD y 2 desde ahí', () => {
    expect(formatearUsd('0.1234')).toMatch(/^US\$\s0,1234$/);
    expect(formatearUsd(1234.5)).toMatch(/^US\$\s1\.234,50$/);
  });

  it('el costo de IA de la empresa es un solo total: lo de su llave más el costo de los análisis que recibió ya hechos', () => {
    const uso: UsoIaDto = { ...USO_BASE, costoUsd: '0.001', costoReutilizadoUsd: 0.0025, validacionesReutilizadas: 6 };

    expect(costoAtribuido(uso)).toBeCloseTo(0.0035, 10);
  });

  it('los tokens se suman por tipo (entrada con entrada, caché con caché, salida con salida) y nunca entrada con salida', () => {
    const uso: UsoIaDto = { ...USO_BASE, tokensEntradaReutilizados: 6000, tokensEntradaEnCacheReutilizados: 1200, tokensSalidaReutilizados: 1800 };

    expect(tokensAtribuidos(uso)).toEqual({ entrada: 10_000, enCache: 2000, salida: 3000 });
  });

  it('sin los campos reutilizados (un backend anterior) todo es de la llave de la empresa', () => {
    expect(costoAtribuido(USO_BASE)).toBe(0.001);
    expect(tokensAtribuidos(USO_BASE)).toEqual({ entrada: 4000, enCache: 800, salida: 1200 });
    expect(aNumero(undefined)).toBe(0);
    expect(aNumero(null)).toBe(0);
    expect(aNumero('0.5')).toBe(0.5);
  });

  it('las fechas del eje y el título dicen el mes en corto y en palabras', () => {
    expect(fechaCorta('2026-11', 5)).toBe('5 nov');
    expect(fechaCorta('2026-09', 30)).toMatch(/^30 sep/);
    expect(mesEnTitulo('2026-11')).toBe('noviembre de 2026');
  });

  it('marca hoy dentro del mes actual, los días que faltan como futuros y todo un mes anterior como pasado', () => {
    // 15 de noviembre de 2026, 10:00 en Bogotá.
    const ahora = new Date('2026-11-15T15:00:00Z');

    const actual = momentosDelMes('2026-11', 30, ahora);
    expect(actual[13]).toBe('pasado');
    expect(actual[14]).toBe('hoy');
    expect(actual[15]).toBe('futuro');
    expect(actual.filter((m) => m === 'hoy')).toHaveLength(1);
    expect(momentosDelMes('2026-10', 31, ahora).every((m) => m === 'pasado')).toBe(true);
  });

  it('rotula el 1 y cada 5 días con su fecha corta, deja «Hoy» a quien dibuja y omite las fechas que se encimarían con él', () => {
    const pasado = etiquetasDelEje('2026-10', momentosDelMes('2026-10', 31, new Date('2026-11-15T15:00:00Z')));
    expect(pasado.filter((e) => e !== null)).toEqual(['1 oct', '5 oct', '10 oct', '15 oct', '20 oct', '25 oct', '30 oct']);

    // Hoy es el 14: el 15 queda a un día y no se rotula; el 10 y el 20 sí; el día 14 no lleva fecha.
    const mes = etiquetasDelEje('2026-11', momentosDelMes('2026-11', 30, new Date('2026-11-14T15:00:00Z')));
    expect(mes[13]).toBeNull();
    expect(mes[14]).toBeNull();
    expect(mes[9]).toBe('10 nov');
    expect(mes[19]).toBe('20 nov');
  });

  it('el eje Y marca 0 y el máximo, y la mitad solo si es un entero', () => {
    expect(marcasDelEje(0)).toEqual([0, 1]);
    expect(marcasDelEje(3)).toEqual([0, 3]);
    expect(marcasDelEje(4)).toEqual([0, 2, 4]);
    expect(marcasDelEje(5)).toEqual([0, 5]);
    expect(marcasDelEje(12)).toEqual([0, 6, 12]);
  });

  it('resume las validaciones del mes y los días con uso', () => {
    const serie = serieDelMes('2026-11', [
      { fecha: '2026-11-03', incluidas: 4, adicionales: 0, analisisPagados: 0, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 },
      { fecha: '2026-11-10', incluidas: 2, adicionales: 3, analisisPagados: 0, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 },
    ]);

    expect(resumenDeLaSerie(serie)).toEqual({ validaciones: 9, diasConUso: 2 });
    expect(resumenDeLaSerie(serieDelMes('2026-11', []))).toEqual({ validaciones: 0, diasConUso: 0 });
  });

  it('la serie llena todos los días del mes', () => {
    const serie = serieDelMes('2026-02', [{ fecha: '2026-02-03', incluidas: 4, adicionales: 1, analisisPagados: 0, tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 }]);
    expect(serie).toHaveLength(28);
    expect(serie[2]).toEqual({ dia: 3, incluidas: 4, adicionales: 1 });
    expect(serie[0]).toEqual({ dia: 1, incluidas: 0, adicionales: 0 });
  });
});
