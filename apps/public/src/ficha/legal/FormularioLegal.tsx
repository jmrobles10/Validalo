import { Alert, Button, Stack, Typography } from '@mui/material';
import type { PerfilDeFichaDto } from '@validalo/api-client';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { CampoTexto, Rejilla, Subtitulo } from '../campos';
import type { DatosLegales, PersonaRelacionada, PropsFormulario } from '../tipos';
import { guardarPersona, hayEnLaTarjeta, mensajeDeLaTarjeta, personaParaEditar, quitarPersona, rolesDeLaTarjeta, tarjetasDePersonas, tieneDosFilas, type TarjetaDePersona } from './agrupacion';
import { ConfirmarQuitarPersona } from './ConfirmarQuitarPersona';
import { DialogoPersona } from './DialogoPersona';
import { PersonasFueraDeLaFicha } from './PersonasFueraDeLaFicha';
import { esRol, nombrePersona, PARAMETRO_AGREGAR } from './personas';
import { TarjetaPersonaLegal } from './TarjetaPersonaLegal';

/** Lo que abre el diálogo: la persona, si ya es socio (`null` = no se ha respondido) y de qué tarjeta viene (`null` = una persona nueva). */
interface Edicion {
  tarjeta: TarjetaDePersona | null;
  persona: PersonaRelacionada;
  tambienSocio: boolean | null;
}

/**
 * Información legal (`FICHA_LEGAL`, fase 1 de FM-7): las personas relacionadas como tarjetas (una por persona aunque tenga dos roles: agregar, editar en un
 * diálogo, quitar) y la firma de revisoría fiscal si el revisor actúa por una firma. Por debajo, una fila por rol (ver `agrupacion`).
 */
export function FormularioLegal({ datos, onCambiar, mensaje, hayEnRuta, deshabilitado, perfil }: PropsFormulario<DatosLegales> & { perfil?: PerfilDeFichaDto | null }) {
  const { t } = useTranslation();
  const personas = datos.personas ?? [];
  const tarjetas = tarjetasDePersonas(personas);
  const [parametros, setParametros] = useSearchParams();
  // «Registrar a la persona» de un documento pedido llega con `?agregar=<rol>`: se abre el diálogo de una persona nueva con ese rol ya elegido.
  const rolPedido = parametros.get(PARAMETRO_AGREGAR);
  const [editando, setEditando] = useState<Edicion | null>(() => (rolPedido && esRol(rolPedido) ? { tarjeta: null, persona: { rol: rolPedido }, tambienSocio: null } : null));
  const [quitando, setQuitando] = useState<TarjetaDePersona | null>(null);
  useEffect(() => {
    // El parámetro se consume una vez: al recargar o volver no se reabre el diálogo.
    if (rolPedido === null) return;
    setParametros(
      (actuales) => {
        const siguientes = new URLSearchParams(actuales);
        siguientes.delete(PARAMETRO_AGREGAR);
        return siguientes;
      },
      { replace: true },
    );
  }, [rolPedido, setParametros]);
  const firma = datos.revisor_fiscal_firma ?? {};

  // Una persona nueva: con los datos que ya se sepan (el rol pedido o una persona registrada en Personas que falta en la sección).
  const agregar = (persona: PersonaRelacionada = {}) => setEditando({ tarjeta: null, persona, tambienSocio: null });
  const editar = (tarjeta: TarjetaDePersona) => setEditando({ tarjeta, ...personaParaEditar(personas, tarjeta) });
  const guardar = (edicion: Edicion, persona: PersonaRelacionada, tambienSocio: boolean) => {
    onCambiar({ personas: guardarPersona(personas, edicion.tarjeta, persona, tambienSocio) });
    setEditando(null);
  };
  const quitar = (tarjeta: TarjetaDePersona) => {
    const resto = quitarPersona(personas, tarjeta);
    onCambiar({ personas: resto.length > 0 ? resto : null });
    setQuitando(null);
  };
  const cambiarFirma = (cambio: { nit?: string | null; razon_social?: string | null }) => {
    const nueva = { ...firma, ...cambio };
    onCambiar({ revisor_fiscal_firma: nueva.nit || nueva.razon_social ? nueva : null });
  };
  const rolesDe = (tarjeta: TarjetaDePersona) => rolesDeLaTarjeta(personas, tarjeta).map((rol) => t(`ficha.legal.roles.${rol}`)).join(' y ');

  return (
    <Stack spacing={2}>
      <Subtitulo ayuda={t('ficha.legal.personasAyuda')}>{t('ficha.legal.personas')}</Subtitulo>
      {mensaje('personas') && <Alert severity="error">{mensaje('personas')}</Alert>}
      {tarjetas.length === 0 ? (
        <Typography sx={{ color: 'text.secondary' }}>{t('ficha.legal.sinPersonas')}</Typography>
      ) : (
        <Stack component="ul" spacing={1.5} aria-label={t('ficha.legal.personas')} sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {tarjetas.map((tarjeta) => (
            <TarjetaPersonaLegal
              key={`${personas[tarjeta.indice]?.rol ?? ''}-${personas[tarjeta.indice]?.numero ?? ''}-${String(tarjeta.indice)}`}
              personas={personas}
              tarjeta={tarjeta}
              mensaje={mensaje}
              hayEnRuta={hayEnRuta}
              onEditar={() => editar(tarjeta)}
              onQuitar={() => (tieneDosFilas(tarjeta) ? setQuitando(tarjeta) : quitar(tarjeta))}
              deshabilitado={deshabilitado}
            />
          ))}
        </Stack>
      )}
      <PersonasFueraDeLaFicha personas={personas} deshabilitado={deshabilitado} onAgregar={agregar} />
      <Button variant="outlined" startIcon={<Plus size={18} aria-hidden />} onClick={() => agregar()} disabled={deshabilitado} sx={{ alignSelf: { xs: 'stretch', sm: 'flex-start' } }}>
        {t('ficha.legal.agregar')}
      </Button>
      <Subtitulo>{t('ficha.legal.firma')}</Subtitulo>
      <Rejilla>
        <CampoTexto etiqueta={t('ficha.legal.firmaNit', { tipo: perfil?.pais === 'DO' ? 'RNC' : perfil?.pais === 'PA' ? 'RUC' : 'NIT' })} valor={firma.nit} onCambiar={(nit) => cambiarFirma({ nit })} mensaje={mensaje('revisor_fiscal_firma.nit')} maxLength={20} deshabilitado={deshabilitado} />
        <CampoTexto etiqueta={t('ficha.legal.firmaRazonSocial')} valor={firma.razon_social} onCambiar={(razon) => cambiarFirma({ razon_social: razon })} mensaje={mensaje('revisor_fiscal_firma.razon_social')} deshabilitado={deshabilitado} />
      </Rejilla>
      {editando !== null && (
        <DialogoPersona
          inicial={editando.persona}
          tambienSocioInicial={editando.tambienSocio}
          nueva={editando.tarjeta === null}
          // Los errores del servidor de cualquiera de las dos filas de la persona (`personas[i].campo`) se ven en su diálogo.
          mensaje={(campo) => (editando.tarjeta ? mensajeDeLaTarjeta(mensaje, editando.tarjeta, campo) : null)}
          hayEnRuta={hayEnRuta && editando.tarjeta ? (prefijo) => (editando.tarjeta ? hayEnLaTarjeta(hayEnRuta, editando.tarjeta, prefijo) : false) : undefined}
          onGuardar={(persona, tambienSocio) => guardar(editando, persona, tambienSocio)}
          onCerrar={() => setEditando(null)}
          perfil={perfil}
        />
      )}
      {quitando !== null && (
        <ConfirmarQuitarPersona
          nombre={nombrePersona(personas[quitando.indice] ?? {}) || t('ficha.legal.sinNombre')}
          roles={rolesDe(quitando)}
          onConfirmar={() => quitar(quitando)}
          onCancelar={() => setQuitando(null)}
        />
      )}
    </Stack>
  );
}
