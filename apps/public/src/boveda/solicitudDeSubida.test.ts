import { describe, expect, it } from 'vitest';
import { destinoFijo, rutaSegura } from './parametrosSubida';
import { enlaceDeSolicitud, parametrosDeSolicitud } from './solicitudDeSubida';

describe('la solicitud de subida', () => {
  it('se convierte en los parámetros de la página en un orden fijo y sin los que no vienen', () => {
    const parametros = parametrosDeSolicitud({ vinculoId: 'v1', tipo: 'RUT', nombre: 'RUT', documento: undefined, persona: '' });

    expect(parametros.toString()).toBe('nombre=RUT&tipo=RUT&vinculoId=v1');
    expect(parametrosDeSolicitud({}).toString()).toBe('');
  });

  it('un tipo propio de la empresa lleva su vínculo, el requisito y la vuelta a la revisión', () => {
    const parametros = parametrosDeSolicitud({
      tipoDocumentoTenantId: 't1',
      vinculoId: 'v1',
      nombre: 'Anexo',
      expediente: 'e1',
      requisito: 'r1',
      volver: '/expediente/e1',
    });

    expect(parametros.toString()).toBe('nombre=Anexo&volver=%2Fexpediente%2Fe1&expediente=e1&requisito=r1&tipoDocumentoTenantId=t1&vinculoId=v1');
    expect(destinoFijo(parametros)).toEqual({ destino: { tipoDocumentoTenantId: 't1', vinculoId: 'v1' }, nombre: 'Anexo' });
    expect(rutaSegura(parametros.get('volver'))).toBe('/expediente/e1');
  });

  it('otra versión de un documento de la bóveda no fija el destino: la página lo lee de la bóveda', () => {
    const parametros = parametrosDeSolicitud({ documento: 'd1', tipo: 'RUT' });

    expect(parametros.toString()).toBe('tipo=RUT&documento=d1');
    expect(destinoFijo(parametros)).toBeNull();
  });

  it('el enlace a la página /boveda/subir lleva los mismos parámetros (el formulario de un requisito y los correos)', () => {
    expect(enlaceDeSolicitud({ nombre: 'Anexo', volver: '/expediente/e1', expediente: 'e1', requisito: 'r1', tipoDocumentoTenantId: 't1', vinculoId: 'v1' })).toBe(
      '/boveda/subir?nombre=Anexo&volver=%2Fexpediente%2Fe1&expediente=e1&requisito=r1&tipoDocumentoTenantId=t1&vinculoId=v1',
    );
    expect(enlaceDeSolicitud({})).toBe('/boveda/subir?');
  });
});
