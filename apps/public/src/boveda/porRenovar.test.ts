import type { ComparticionPublicaDto, DocumentoBovedaDto, VigenciaDto } from '@validalo/api-client';
import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { lineasPorRenovar } from './porRenovar';

const t = i18n.t.bind(i18n);

const vigencia = (estado: string, vigenteHasta: string | null, cambios: Partial<VigenciaDto> = {}): VigenciaDto => ({
  vigenteHasta,
  base: 'FechaExpedicion',
  estado,
  diasAviso: [30, 7],
  diasGracia: 15,
  finDeGracia: null,
  vencidaEn: null,
  ...cambios,
});

const empresa = (nombre: string, v: VigenciaDto | null, cambios: Partial<ComparticionPublicaDto> = {}): ComparticionPublicaDto => ({
  vinculoId: `v-${nombre}`,
  empresa: { id: `e-${nombre}`, nombre, logoUrl: null },
  compartido: true,
  version: 1,
  versionActualCompartida: true,
  compartidaEn: '2026-10-01T12:00:00Z',
  vigencia: v,
  ...cambios,
});

const documento = (id: string, nombre: string, porEmpresa: ComparticionPublicaDto[], cambios: Partial<DocumentoBovedaDto> = {}): DocumentoBovedaDto => ({
  id,
  tipo: { codigo: id.toUpperCase(), nombre, tipoDocumentoTenantId: null },
  ambito: 'Global',
  clase: 'Archivo',
  vinculoId: null,
  versionActual: null,
  versiones: 1,
  porEmpresa,
  ...cambios,
});

const linea = (d: DocumentoBovedaDto) => lineasPorRenovar([d], t).map((l) => `${l.documento}: ${l.texto}`);

describe('aviso consolidado de la bóveda', () => {
  it('con una empresa dice cuándo vence y pide la subida de la versión nueva', () => {
    const lineas = lineasPorRenovar([documento('rut', 'Registro Único Tributario', [empresa('Constructora Norte', vigencia('PorVencer', '2026-11-30'))])], t);
    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.texto).toBe('vence para Constructora Norte el 30/11/2026.');
    expect(lineas[0]?.subir).toEqual({ documento: 'rut', tipo: 'RUT' });
  });

  it('con dos empresas y fechas distintas dice antes de cuándo renovar para quedar al día con las dos', () => {
    const camara = documento('camara', 'Cámara de comercio', [
      empresa('Constructora Sur', vigencia('Vigente', '2026-12-30')),
      empresa('Constructora Norte', vigencia('PorVencer', '2026-10-31')),
    ]);
    expect(linea(camara)).toEqual([
      'Cámara de comercio: vence para Constructora Norte el 31/10/2026 y para Constructora Sur el 30/12/2026. Renueva antes del 31/10 y quedas al día con las dos.',
    ]);
  });

  it('con tres empresas dice «las tres» y las nombra a todas', () => {
    const tres = documento('camara', 'Cámara de comercio', [
      empresa('A', vigencia('PorVencer', '2026-11-20')),
      empresa('B', vigencia('Vigente', '2027-01-10')),
      empresa('C', vigencia('Vigente', '2027-02-10')),
    ]);
    const [linea3] = lineasPorRenovar([tres], t);
    expect(linea3?.texto).toBe('vence para A el 20/11/2026, para B el 10/01/2027 y para C el 10/02/2027. Renueva antes del 20/11 y quedas al día con las tres.');
    // Con pocas empresas la frase lo dice todo: no hay detalle aparte.
    expect(linea3?.empresas).toBeNull();
    expect(linea3?.cierre).toBeNull();
  });

  describe('con más de tres empresas la línea se resume', () => {
    /** `cantidad` empresas «Empresa 01…» vigentes hasta una fecha lejana. */
    const lejanas = (cantidad: number) => Array.from({ length: cantidad }, (_, i) => empresa(`Empresa ${String(i + 4).padStart(2, '0')}`, vigencia('Vigente', '2027-06-01')));

    it('dice la fecha más próxima, cuántas empresas piden atención y cuál es la primera', () => {
      const camara = documento('camara', 'Cámara de comercio', [
        empresa('Empresa 03', vigencia('PorVencer', '2026-11-25')),
        empresa('Empresa 01', vigencia('PorVencer', '2026-11-20')),
        empresa('Empresa 02', vigencia('PorVencer', '2026-11-22')),
        ...lejanas(22),
      ]);
      const [resumida] = lineasPorRenovar([camara], t);
      expect(resumida?.texto).toBe('vence el 20/11/2026 para 3 empresas (la primera, Empresa 01).');
      // La línea es una sola frase corta: lo demás va en el detalle, con la fecha de cada empresa (la más próxima primero).
      expect(resumida?.empresas).toHaveLength(25);
      expect(resumida?.empresas?.slice(0, 3)).toEqual([
        { empresa: 'Empresa 01', estado: 'PorVencer', texto: 'Vence el 20/11/2026' },
        { empresa: 'Empresa 02', estado: 'PorVencer', texto: 'Vence el 22/11/2026' },
        { empresa: 'Empresa 03', estado: 'PorVencer', texto: 'Vence el 25/11/2026' },
      ]);
      expect(resumida?.empresas?.[3]).toEqual({ empresa: 'Empresa 04', estado: 'Vigente', texto: 'Vence el 01/06/2027' });
      expect(resumida?.cierre).toBe('Renueva antes del 20/11 y quedas al día con todas.');
      expect(resumida?.subir).toEqual({ documento: 'camara', tipo: 'CAMARA' });
    });

    it('con una sola empresa que pide atención la nombra sin hablar de cuántas', () => {
      const camara = documento('camara', 'Cámara de comercio', [empresa('Empresa 00', vigencia('PorVencer', '2026-11-20')), ...lejanas(3)]);
      expect(linea(camara)).toEqual(['Cámara de comercio: vence el 20/11/2026 para Empresa 00.']);
    });

    it('si todas las que piden atención ya vencieron dice «venció el»', () => {
      const rut = documento('rut', 'Registro Único Tributario', [
        empresa('Empresa 01', vigencia('Vencida', '2026-11-01')),
        empresa('Empresa 02', vigencia('EnGracia', '2026-11-05', { finDeGracia: '2026-11-20' })),
        empresa('Empresa 03', vigencia('Vencida', '2026-11-10')),
        ...lejanas(3),
      ]);
      const [resumida] = lineasPorRenovar([rut], t);
      expect(resumida?.texto).toBe('venció el 01/11/2026 para 3 empresas (la primera, Empresa 01).');
      expect(resumida?.vigencia.estado).toBe('Vencida');
      expect(resumida?.empresas?.map((e) => e.texto)).toEqual([
        'Venció el 01/11/2026',
        'En periodo de gracia hasta el 20/11/2026',
        'Venció el 10/11/2026',
        'Vence el 01/06/2027',
        'Vence el 01/06/2027',
        'Vence el 01/06/2027',
      ]);
    });

    it('si hay vencidas y por vencer no dice «vence» ni «venció» para todas', () => {
      const rut = documento('rut', 'Registro Único Tributario', [
        empresa('Empresa 01', vigencia('Vencida', '2026-11-01')),
        empresa('Empresa 02', vigencia('PorVencer', '2026-11-30')),
        ...lejanas(3),
      ]);
      expect(linea(rut)).toEqual(['Registro Único Tributario: ya venció o vence pronto para 2 empresas; la primera fecha, el 01/11/2026, es la de Empresa 01.']);
    });
  });

  it('en gracia dice hasta cuándo se acepta y ese es el plazo para quedar al día', () => {
    const rut = documento('rut', 'Registro Único Tributario', [
      empresa('Constructora Norte', vigencia('EnGracia', '2026-11-01', { finDeGracia: '2026-11-16' })),
      empresa('Constructora Sur', vigencia('PorVencer', '2026-11-30')),
    ]);
    expect(linea(rut)).toEqual([
      'Registro Único Tributario: está en el periodo de gracia con Constructora Norte hasta el 16/11/2026 y vence para Constructora Sur el 30/11/2026. Renueva antes del 16/11 y quedas al día con las dos.',
    ]);
  });

  it('vencido dice cuándo venció y, con otra empresa, que lo renueve cuanto antes', () => {
    const solo = documento('rut', 'Registro Único Tributario', [empresa('Constructora Norte', vigencia('Vencida', '2026-11-01'))]);
    expect(linea(solo)).toEqual(['Registro Único Tributario: venció para Constructora Norte el 01/11/2026.']);
    const conOtra = { ...solo, porEmpresa: [...solo.porEmpresa, empresa('Constructora Sur', vigencia('Vigente', '2027-01-15'))] };
    const lineas = lineasPorRenovar([conOtra], t);
    expect(lineas[0]?.texto).toBe('venció para Constructora Norte el 01/11/2026 y vence para Constructora Sur el 15/01/2027. Renueva cuanto antes y quedas al día con las dos.');
    expect(lineas[0]?.vigencia.estado).toBe('Vencida');
  });

  it('no avisa si todo está vigente, no vence o no se comparte', () => {
    const documentos = [
      documento('rut', 'Registro Único Tributario', [empresa('Constructora Norte', vigencia('Vigente', '2027-05-01'))]),
      documento('cedula', 'Cédula', [empresa('Constructora Norte', vigencia('SinVencimiento', null))]),
      documento('camara', 'Cámara de comercio', [empresa('Constructora Norte', vigencia('Vencida', '2026-10-01'), { compartido: false, version: null })]),
      documento('otro', 'Otro', [empresa('Constructora Norte', vigencia('Renovando', '2026-10-01'))]),
      documento('vacio', 'Sin empresas', []),
    ];
    expect(lineasPorRenovar(documentos, t)).toEqual([]);
  });

  it('ordena por la fecha más próxima y un formulario no lleva enlace de subida', () => {
    const documentos = [
      documento('camara', 'Cámara de comercio', [empresa('Constructora Norte', vigencia('PorVencer', '2026-12-01'))]),
      documento('form', 'Formulario de vinculación', [empresa('Constructora Norte', vigencia('PorVencer', '2026-11-20'))], { clase: 'Formulario' }),
      documento('rut', 'Registro Único Tributario', [empresa('Constructora Norte', vigencia('Vencida', '2026-11-01'))]),
    ];
    const lineas = lineasPorRenovar(documentos, t);
    expect(lineas.map((l) => l.documentoId)).toEqual(['rut', 'form', 'camara']);
    expect(lineas[1]?.subir).toBeNull();
  });
});
