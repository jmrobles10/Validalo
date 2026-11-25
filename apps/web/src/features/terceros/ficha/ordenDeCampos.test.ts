import { describe, expect, it } from 'vitest';
import { ordenDeLaSeccion, ordenDeLoAnidado, ordenarPares } from './ordenDeCampos';

const pares = (claves: string[]): [string, number][] => claves.map((c, i) => [c, i]);
const claves = (r: readonly (readonly [string, unknown])[]) => r.map(([c]) => c);

describe('Orden de los datos de una sección', () => {
  it('las claves salen en el orden del esquema, no en el que las entrega la base de datos (por largo y luego alfabético)', () => {
    // Así llegan guardadas: pais, ciudad, correo… por largo de la clave.
    const llegada = ['pais', 'correo', 'ciudad', 'telefono', 'direccion', 'nombres', 'apellidos', 'razon_social', 'ciiu_principal', 'tipo_persona'];
    expect(claves(ordenarPares(pares(llegada), ordenDeLaSeccion('FICHA_GENERAL')))).toEqual([
      'razon_social', 'nombres', 'apellidos', 'tipo_persona', 'correo', 'telefono', 'pais', 'ciudad', 'direccion', 'ciiu_principal',
    ]);
  });

  it('las claves que el esquema no conoce van al final, en el orden en que llegaron', () => {
    const resultado = ordenarPares(pares(['zeta', 'telefono', 'alfa', 'correo']), ordenDeLaSeccion('FICHA_GENERAL'));
    expect(claves(resultado)).toEqual(['correo', 'telefono', 'zeta', 'alfa']);
  });

  it('cada sección tiene el suyo: la financiera empieza por el periodo y la tributaria por las responsabilidades', () => {
    expect(ordenDeLaSeccion('FICHA_FINANCIERA').slice(0, 3)).toEqual(['periodo', 'fecha_corte', 'activos']);
    expect(ordenDeLaSeccion('FICHA_TRIBUTARIA')[0]).toBe('responsabilidades');
    expect(ordenDeLaSeccion('FICHA_LEGAL')).toEqual(['personas', 'revisor_fiscal_firma']);
    expect(ordenDeLaSeccion('FICHA_SST')[0]).toBe('programa_salud_ocupacional');
  });

  it('sin sección conocida se usa el orden de todas, sin perder ninguna clave', () => {
    const general = ordenDeLaSeccion(undefined);
    expect(general).toContain('razon_social');
    expect(general).toContain('especialidades');
    expect(ordenDeLaSeccion('FICHA_NUEVA')).toBe(general);
  });

  it('lo anidado también tiene su orden (la dirección por partes, la resolución, la moneda extranjera)', () => {
    expect(claves(ordenarPares(pares(['placa', 'bis', 'tipo_via', 'numero_via']), ordenDeLoAnidado('direccion_estructurada')))).toEqual(['tipo_via', 'numero_via', 'bis', 'placa']);
    expect(claves(ordenarPares(pares(['fecha', 'numero']), ordenDeLoAnidado('resolucion_gran_contribuyente')))).toEqual(['numero', 'fecha']);
    expect(claves(ordenarPares(pares(['paises', 'tipos', 'realiza']), ordenDeLoAnidado('moneda_extranjera')))).toEqual(['realiza', 'tipos', 'paises']);
    expect(ordenDeLoAnidado('desconocido')).toEqual([]);
  });

  it('el orden es estable: sin orden conocido las claves quedan como llegaron', () => {
    expect(claves(ordenarPares(pares(['b', 'a', 'c']), []))).toEqual(['b', 'a', 'c']);
  });
});
