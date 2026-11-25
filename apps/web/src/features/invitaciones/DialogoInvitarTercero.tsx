import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import { esErrorApi, SCOPES, type EmpresaDto, type InvitacionDeTerceroDto } from '@validalo/api-client';
import { FaltaParaEnviar, FormularioDeDialogo } from '@validalo/ui';
import { ExternalLink } from 'lucide-react';
import { useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { IconoCarga } from '../../shared/componentes';
import { esCO } from '../../i18n/es-CO';
import { mensajeDeError } from '../../shared/errores';
import { useAvisos } from '../../shared/useAvisos';
import { usePermisos } from '../../shared/usePermisos';
import { usePaises } from '../configuracion/empresas/api';
import { useFlujos } from '../flujos/api';
import { useTiposVinculo } from '../vinculos/api';
import { CamposDeAtributos } from '../vinculos/atributos/CamposDeAtributos';
import { etiquetaDeAtributo, validarAtributos, type ValorDeAtributo } from '../vinculos/atributos/modelo';
import { useInvitarTercero } from './api';
import { CamposInvitarTercero } from './CamposInvitarTercero';
import {
  borradorInvitacionNuevo,
  cuerpoInvitacion,
  erroresDeAtributosDeLaApi,
  erroresDeLaApi,
  LONGITUD_MAXIMA_TEXTO,
  validarInvitacion,
  type BorradorInvitacion,
  type CampoInvitacion,
  type ErrorInvitacion,
} from './modeloInvitar';

interface Props {
  /** Las empresas desde las que la persona puede invitar (al menos la activa); con más de una el formulario deja elegir. */
  empresas: readonly EmpresaDto[];
  empresaInicial: string;
  onCerrar: () => void;
}

/** Lo que el diálogo dice sin cerrarse: que el tercero ya aceptó, o que el vínculo ya existe y no se puede invitar (con su enlace). */
interface AvisoDelDialogo {
  severidad: 'info' | 'warning' | 'error';
  texto: string;
  vinculoId?: string;
}

/**
 * «Invitar tercero» (decisión IM): el formulario de una invitación a mano, con los campos de la plantilla del lote y lo que el sistema tiene configurado en sus listas (países,
 * tipos de identificación, tipos de vínculo y flujos publicados). Envía a `POST /invitaciones`, que hace exactamente lo que una fila del lote: crea o reutiliza el tercero, crea el
 * vínculo e invita. Si el vínculo ya existía, la respuesta o el error lo dicen y el diálogo ofrece abrirlo.
 */
export function DialogoInvitarTercero({ empresas, empresaInicial, onCerrar }: Props) {
  const { t } = useTranslation();
  const navegar = useNavigate();
  const mostrar = useAvisos((s) => s.mostrar);
  const [empresaId, setEmpresaId] = useState(empresaInicial);
  const [b, setB] = useState<BorradorInvitacion>(borradorInvitacionNuevo);
  const [tocados, setTocados] = useState<ReadonlySet<CampoInvitacion>>(new Set());
  const [deLaApi, setDeLaApi] = useState<Partial<Record<CampoInvitacion, string>>>({});
  // Los atributos del vínculo (los del tipo elegido): los que la persona ya tocó y lo que la API dijo de cada uno.
  const [atributosTocados, setAtributosTocados] = useState<ReadonlySet<string>>(new Set());
  const [atributosDeLaApi, setAtributosDeLaApi] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<AvisoDelDialogo | null>(null);
  // Una clave por contenido del formulario: lo que se reintenta tal cual no duplica; si algo cambia, es otra invitación.
  const [clave, setClave] = useState(() => crypto.randomUUID());

  const empresa = empresas.find((e) => e.id === empresaId);
  const permisos = usePermisos(empresaId);
  const paises = usePaises(true);
  const tipos = useTiposVinculo(empresaId, permisos.puede(SCOPES.configuracionLeer));
  const flujos = useFlujos(empresaId, b.tipoVinculo || undefined, Boolean(b.tipoVinculo) && permisos.puede(SCOPES.flujosLeer));
  const invitar = useInvitarTercero(empresaId, clave);

  const tipoIdentificacion = paises.data?.find((p) => p.codigo === b.pais)?.tiposIdentificacion.find((x) => x.codigo === b.tipoIdentificacion);
  const errores = validarInvitacion(b, tipoIdentificacion);
  const primero = errores[0];
  // Al elegir el tipo de vínculo se piden los valores de sus atributos (los obligatorios bloquean el envío; la API los vuelve a validar).
  const permitidos = tipos.data?.find((x) => x.codigo === b.tipoVinculo)?.atributosPermitidos ?? [];
  const erroresAtributos = validarAtributos(permitidos, b.atributos);
  const primerAtributo = permitidos.find((a) => erroresAtributos[a.clave] !== undefined);
  const erroresAtributosVisibles = Object.fromEntries(Object.entries(erroresAtributos).filter(([clave]) => atributosTocados.has(clave)));
  const textoDe = (codigo: ErrorInvitacion) => t(`invitaciones.invitarTercero.errores.${codigo}`, { tipo: tipoIdentificacion?.nombre ?? b.tipoIdentificacion, maximo: String(LONGITUD_MAXIMA_TEXTO) });
  const mensaje = (campo: CampoInvitacion) => {
    const error = errores.find((x) => x.campo === campo);
    return deLaApi[campo] ?? (error && tocados.has(campo) ? textoDe(error.codigo) : null);
  };

  /** Cualquier cambio es otra invitación: otra clave y fuera lo que dijo la API del contenido anterior. */
  const cambiar = (parcial: Partial<BorradorInvitacion>) => {
    // Los valores de los atributos son del tipo de vínculo elegido: con otro tipo empiezan de nuevo.
    const otroTipo = parcial.tipoVinculo !== undefined && parcial.tipoVinculo !== b.tipoVinculo;
    setB((previo) => ({ ...previo, ...parcial, ...(otroTipo ? { atributos: {} } : {}) }));
    if (otroTipo) setAtributosTocados(new Set());
    setDeLaApi({});
    setAtributosDeLaApi({});
    setAviso(null);
    setClave(crypto.randomUUID());
  };
  const cambiarAtributo = (claveDelAtributo: string, valor: ValorDeAtributo) => {
    cambiar({ atributos: { ...b.atributos, [claveDelAtributo]: valor } });
    setAtributosTocados((previos) => new Set([...previos, claveDelAtributo]));
  };
  const tocar = (campo: CampoInvitacion) => setTocados((previos) => new Set([...previos, campo]));
  const cambiarEmpresa = (id: string) => {
    setEmpresaId(id);
    cambiar({ tipoVinculo: '', flujo: '' });
  };

  const abrirVinculo = (id: string) => {
    onCerrar();
    void navegar(`/e/${empresaId}/vinculos/${id}`);
  };

  const exito = (respuesta: InvitacionDeTerceroDto) => {
    if (respuesta.accion === 'SinCambios') {
      setAviso({ severidad: 'info', texto: t('invitaciones.invitarTercero.yaAcepto', { empresa: empresa?.nombre ?? '' }), vinculoId: respuesta.vinculoId });
      setClave(crypto.randomUUID());
      return;
    }
    const resultado = (
      respuesta.accion === 'Reinvitado' ? (respuesta.porAprobar ? 'ReinvitadoPorAprobar' : 'Reinvitado') : respuesta.porAprobar ? 'InvitadoPorAprobar' : 'Invitado'
    ) satisfies keyof typeof esCO.invitaciones.invitarTercero.resultado;
    mostrar(t(`invitaciones.invitarTercero.resultado.${resultado}`, { correo: b.correo.trim() }), 'success');
    abrirVinculo(respuesta.vinculoId);
  };

  const falla = (error: unknown) => {
    if (esErrorApi(error)) {
      // El vínculo ya existe y no se puede invitar (bloqueado, terminado o con su invitación por aprobar): el mensaje de la API y el enlace al vínculo.
      const vinculoId = error.esConflicto && typeof error.extensiones.vinculoId === 'string' ? error.extensiones.vinculoId : undefined;
      if (vinculoId) {
        setAviso({ severidad: 'warning', texto: error.detalle, vinculoId });
        return;
      }
      // Los errores por campo que ve la vista previa de un lote, bajo cada campo.
      const porCampo = erroresDeLaApi(error.errores);
      const porAtributo = erroresDeAtributosDeLaApi(error.errores);
      if (Object.keys(porCampo).length > 0 || Object.keys(porAtributo).length > 0) {
        setDeLaApi(porCampo);
        setAtributosDeLaApi(porAtributo);
        return;
      }
    }
    setAviso({ severidad: 'error', texto: mensajeDeError(error, t) });
  };

  const enviar = (evento: SubmitEvent) => {
    evento.preventDefault();
    if (primero || primerAtributo) return;
    invitar.mutate(cuerpoInvitacion(b, tipoIdentificacion, permitidos), { onSuccess: exito, onError: falla });
  };

  return (
    <Dialog open onClose={invitar.isPending ? undefined : onCerrar} maxWidth={false} slotProps={{ paper: { sx: { width: 680, maxWidth: 'calc(100% - 32px)' } } }} aria-labelledby="titulo-invitar-tercero">
      <FormularioDeDialogo onSubmit={enviar}>
        <DialogTitle id="titulo-invitar-tercero">
          {t('invitaciones.invitarTercero.titulo')}
          <Typography variant="body2" component="span" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
            {t('invitaciones.invitarTercero.subtitulo', { empresa: empresa?.nombre ?? '' })}
          </Typography>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {paises.isError && <Alert severity="error">{mensajeDeError(paises.error, t)}</Alert>}
            {aviso && (
              <Alert
                severity={aviso.severidad}
                action={
                  aviso.vinculoId ? (
                    <Button color="inherit" size="small" startIcon={<ExternalLink size={14} aria-hidden />} onClick={() => abrirVinculo(aviso.vinculoId ?? '')}>
                      {t('invitaciones.invitarTercero.abrirVinculo')}
                    </Button>
                  ) : undefined
                }
              >
                {aviso.texto}
              </Alert>
            )}
            <CamposInvitarTercero
              b={b}
              catalogos={{
                empresas,
                paises: paises.data,
                tipoIdentificacion,
                tiposVinculo: permisos.puede(SCOPES.configuracionLeer) ? (tipos.data?.filter((x) => x.activo) ?? []) : undefined,
                cargandoTipos: tipos.isPending && permisos.puede(SCOPES.configuracionLeer),
                flujos: (flujos.data ?? []).filter((f) => f.publicada !== null),
              }}
              empresaId={empresaId}
              onEmpresa={cambiarEmpresa}
              cambiar={cambiar}
              tocar={tocar}
              mensaje={mensaje}
            />
            {permitidos.length > 0 && (
              <>
                <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
                  {t('atributosVinculo.titulo')}
                </Typography>
                <CamposDeAtributos atributos={permitidos} valores={b.atributos} onCambiar={cambiarAtributo} errores={erroresAtributosVisibles} deLaApi={atributosDeLaApi} />
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          {primero && <FaltaParaEnviar>{textoDe(primero.codigo)}</FaltaParaEnviar>}
          {!primero && primerAtributo && <FaltaParaEnviar>{t('atributosVinculo.falta', { atributo: etiquetaDeAtributo(primerAtributo.clave) })}</FaltaParaEnviar>}
          <Button variant="text" onClick={onCerrar} disabled={invitar.isPending} sx={{ color: 'text.primary' }}>
            {t('invitaciones.invitarTercero.cancelar')}
          </Button>
          <Button type="submit" variant="contained" disabled={invitar.isPending || primero !== undefined || primerAtributo !== undefined} startIcon={invitar.isPending ? <IconoCarga /> : undefined}>
            {t('invitaciones.invitarTercero.enviar')}
          </Button>
        </DialogActions>
      </FormularioDeDialogo>
    </Dialog>
  );
}
