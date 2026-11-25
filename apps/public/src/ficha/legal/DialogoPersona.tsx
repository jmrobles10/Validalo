import { Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import type { PerfilDeFichaDto } from '@validalo/api-client';
import { useMemo, useState, type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { CampoCifra, CampoFechaFicha, CampoSiNo, CampoTexto, Rejilla } from '../campos';
import { PreguntaPep } from '../pep/PreguntaPep';
import { hoyIso } from '../pep/validarDeclaracionPep';
import { PAISES } from '../paises';
import { SelectorUnico } from '../selectores';
import { ROLES, TIPOS_IDENTIFICACION_PERSONA, type PersonaRelacionada } from '../tipos';
import { erroresDeFormato, faltantesDePersona, limpiezaAlCambiarDeRol, presenciaDeCampos, type CampoDePersona, type ErrorDeFormato } from './camposPorRol';
import { esRol, esSociedad } from './personas';

interface Props {
  inicial: PersonaRelacionada;
  /** ¿Ya es socio (tiene su fila de Socio)? `null` en una persona nueva: debe responderlo. */
  tambienSocioInicial: boolean | null;
  nueva: boolean;
  /** Mensaje del servidor para un campo de esta persona (`pep` ⇒ `personas[i].pep`), ya combinado con el de su fila de socio. */
  mensaje: (campo: string) => string | null;
  /** ¿Hay un error o faltante del servidor en alguna ruta de esta persona bajo el prefijo (`declaracion_pep`)? */
  hayEnRuta?: (prefijo: string) => boolean;
  /** La persona con su rol y, si no es Socio, si también lo es (el porcentaje viaja en la persona). */
  onGuardar: (persona: PersonaRelacionada, tambienSocio: boolean) => void;
  onCerrar: () => void;
  /** Los tipos de identificación del país del tercero y los que declaran su DV (RG-4); sin perfil, los de siempre. */
  perfil?: PerfilDeFichaDto | null;
}

/** Los nombres de lo que falta para el pie del diálogo: hasta tres y «y N más». */
const MAXIMO_EN_EL_PIE = 3;

/**
 * Agregar o editar una persona relacionada. Solo cambia la lista del formulario: se guarda con la sección. Los campos dependen del rol (tabla en
 * `camposPorRol`): el tipo de representación solo para quien representa, el cargo no para un socio, y a quien no es socio se le pregunta si
 * también lo es (con «Sí», su porcentaje). «Listo» espera a que estén los obligatorios del rol; el pie dice cuáles faltan. En el celular ocupa toda
 * la pantalla. El DV de un NIT lo calcula Valídalo.
 */
export function DialogoPersona({ inicial, tambienSocioInicial, nueva, mensaje: mensajeServidor, hayEnRuta, onGuardar, onCerrar, perfil }: Props) {
  const { t } = useTranslation();
  const tema = useTheme();
  const pantallaCompleta = useMediaQuery(tema.breakpoints.down('sm'));
  const hoy = useMemo(() => hoyIso(), []);
  const [p, setP] = useState<PersonaRelacionada>(inicial);
  const [tambienSocio, setTambienSocio] = useState<boolean | null>(tambienSocioInicial);
  // Campos que la persona ya tocó en este diálogo: el faltante o error del servidor es de la versión guardada y deja de
  // aplicar en cuanto cambia el valor (la sección se valida de nuevo al guardarla).
  const [tocados, setTocados] = useState<ReadonlySet<string>>(() => new Set());
  // Campos de los que ya salió: un formato inválido se marca al perder el foco, no mientras escribe.
  const [visitados, setVisitados] = useState<ReadonlySet<string>>(() => new Set());
  const cambiar = (cambio: PersonaRelacionada) => {
    setP((actual) => ({ ...actual, ...cambio }));
    setTocados((actuales) => new Set([...actuales, ...Object.keys(cambio)]));
  };
  const salirDe = (campo: CampoDePersona) => () => setVisitados((actuales) => new Set([...actuales, campo]));

  const contexto = { tambienSocio, perfil };
  const presencia = presenciaDeCampos(p, contexto);
  const formato: Partial<Record<string, ErrorDeFormato>> = erroresDeFormato(p, contexto, hoy);
  const faltantes = faltantesDePersona(p, contexto, hoy);
  const requerido = (campo: CampoDePersona) => presencia[campo] === 'obligatorio';
  const visible = (campo: CampoDePersona) => presencia[campo] !== 'oculto';
  // Solo los campos simples: los de la declaración PEP (`declaracion_pep.*`) se revisan dentro de ella.
  const mensaje = (campo: string): string | null => {
    const error = formato[campo];
    if (error !== undefined && visitados.has(campo)) return t(`ficha.legal.errores.${error}`);
    if (tocados.has(campo) || (campo === 'dv' && tocados.has('numero'))) return null;
    return mensajeServidor(campo);
  };
  const esNit = esSociedad(p.tipo_identificacion, p.numero);
  const tipos = perfil?.tiposDePersona ?? TIPOS_IDENTIFICACION_PERSONA;
  const titulo = nueva ? t('ficha.legal.nueva') : t('ficha.legal.editarPersona');

  const cambiarRol = (valor: string) => {
    const rol = esRol(valor) ? valor : null;
    // Quien era solo socio y pasa a otro rol sigue siendo socio con su participación: se conserva como «también es socio».
    if (p.rol === 'Socio' && rol !== null && rol !== 'Socio') setTambienSocio(p.porcentaje !== null && p.porcentaje !== undefined ? true : null);
    cambiar({ rol, ...limpiezaAlCambiarDeRol(p, rol) });
  };
  const responderSocio = (si: boolean) => {
    setTambienSocio(si);
    if (!si) cambiar({ porcentaje: null });
  };

  const nombreDe = (campo: CampoDePersona) => t(`ficha.legal.faltante.${campo === 'nombres' && esNit ? 'razon_social' : campo}`);
  const faltan = faltantes.filter((f) => f.motivo === 'falta').map((f) => nombreDe(f.campo));
  const invalidos = faltantes.filter((f) => f.motivo === 'invalido').map((f) => nombreDe(f.campo));
  const resumen = [
    faltan.length === 0
      ? null
      : faltan.length > MAXIMO_EN_EL_PIE
        ? t('ficha.legal.falta', { campos: faltan.slice(0, MAXIMO_EN_EL_PIE).join(', '), count: faltan.length - MAXIMO_EN_EL_PIE })
        : t('ficha.legal.falta', { campos: faltan.join(', ') }),
    invalidos.length === 0 ? null : t('ficha.legal.revisa', { campos: invalidos.join(', ') }),
  ]
    .filter(Boolean)
    .join(' ');

  const enviar = (evento: SubmitEvent) => {
    evento.preventDefault();
    if (faltantes.length > 0) return;
    onGuardar(esNit ? { ...p, apellidos: null } : p, tambienSocio === true);
  };

  return (
    <Dialog open onClose={onCerrar} fullWidth maxWidth="sm" fullScreen={pantallaCompleta} aria-labelledby="titulo-persona">
      <form onSubmit={enviar} noValidate>
        <DialogTitle id="titulo-persona">{titulo}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField select required label={t('ficha.legal.rol')} value={p.rol ?? ''} onChange={(e) => cambiarRol(e.target.value)} error={Boolean(mensaje('rol'))} helperText={mensaje('rol')} fullWidth>
              {ROLES.map((rol) => (
                <MenuItem key={rol} value={rol}>
                  {t(`ficha.legal.roles.${rol}`)}
                </MenuItem>
              ))}
            </TextField>
            {visible('tipo_representacion') && (
              <CampoTexto etiqueta={t('ficha.legal.tipoRepresentacion')} valor={p.tipo_representacion} onCambiar={(v) => cambiar({ tipo_representacion: v })} mensaje={mensaje('tipo_representacion')} ayuda={t('ficha.legal.tipoRepresentacionAyuda')} maxLength={100} />
            )}
            {visible('tambien_socio') && <CampoSiNo etiqueta={t('ficha.legal.tambienSocio')} valor={tambienSocio} onCambiar={responderSocio} requerido />}
            {visible('porcentaje') && (
              <CampoCifra etiqueta={t('ficha.legal.porcentaje')} valor={p.porcentaje} onCambiar={(v) => cambiar({ porcentaje: v })} mensaje={mensaje('porcentaje')} onBlur={salirDe('porcentaje')} requerido />
            )}
            <Rejilla>
              <TextField
                select
                required
                label={t('ficha.legal.tipoIdentificacion')}
                value={p.tipo_identificacion ?? ''}
                onChange={(e) => cambiar({ tipo_identificacion: e.target.value || null })}
                error={Boolean(mensaje('tipo_identificacion'))}
                helperText={mensaje('tipo_identificacion')}
                fullWidth
              >
                {tipos.map((tipo) => (
                  <MenuItem key={tipo} value={tipo}>
                    {tipo}
                  </MenuItem>
                ))}
              </TextField>
              <CampoTexto etiqueta={t('ficha.legal.numero')} valor={p.numero} onCambiar={(v) => cambiar({ numero: v })} mensaje={mensaje('numero') ?? (visible('dv') ? null : mensaje('dv'))} maxLength={20} requerido />
              {visible('dv') && <CampoTexto etiqueta={t('ficha.legal.dv')} valor={p.dv} onCambiar={(v) => cambiar({ dv: v })} mensaje={mensaje('dv')} onBlur={salirDe('dv')} ayuda={t('ficha.general.dvAyuda')} inputMode="numeric" maxLength={2} requerido />}
            </Rejilla>
            <Rejilla>
              <CampoTexto etiqueta={esNit ? t('ficha.legal.razonSocial') : t('ficha.legal.nombres')} valor={p.nombres} onCambiar={(v) => cambiar({ nombres: v })} mensaje={mensaje('nombres')} maxLength={200} requerido />
              {visible('apellidos') && <CampoTexto etiqueta={t('ficha.legal.apellidos')} valor={p.apellidos} onCambiar={(v) => cambiar({ apellidos: v })} mensaje={mensaje('apellidos')} maxLength={150} requerido />}
              {visible('cargo') && <CampoTexto etiqueta={t('ficha.legal.cargo')} valor={p.cargo} onCambiar={(v) => cambiar({ cargo: v })} mensaje={mensaje('cargo')} maxLength={150} />}
            </Rejilla>
            <PreguntaPep etiqueta={t('ficha.legal.pep')} pep={p.pep} declaracion={p.declaracion_pep} origen={{ tipo: 'persona', persona: p }} onCambiar={cambiar} mensaje={mensaje} hayEnRuta={hayEnRuta} requerido={requerido('pep')} />
            <CampoSiNo etiqueta={t('ficha.legal.vinculoPep')} valor={p.vinculo_pep} onCambiar={(v) => cambiar({ vinculo_pep: v })} mensaje={mensaje('vinculo_pep')} requerido={requerido('vinculo_pep')} />
            <Rejilla>
              <CampoFechaFicha etiqueta={t('ficha.legal.fechaExpedicion')} valor={p.fecha_expedicion} onCambiar={(v) => cambiar({ fecha_expedicion: v })} mensaje={mensaje('fecha_expedicion')} onBlur={salirDe('fecha_expedicion')} maximo={hoy} />
              <CampoTexto etiqueta={t('ficha.legal.lugarExpedicion')} valor={p.lugar_expedicion} onCambiar={(v) => cambiar({ lugar_expedicion: v })} mensaje={mensaje('lugar_expedicion')} maxLength={100} />
              <CampoFechaFicha etiqueta={t('ficha.legal.fechaNacimiento')} valor={p.fecha_nacimiento} onCambiar={(v) => cambiar({ fecha_nacimiento: v })} mensaje={mensaje('fecha_nacimiento')} onBlur={salirDe('fecha_nacimiento')} maximo={hoy} />
              <SelectorUnico etiqueta={t('ficha.legal.nacionalidad')} opciones={PAISES} valor={p.nacionalidad} onCambiar={(v) => cambiar({ nacionalidad: v })} mensaje={mensaje('nacionalidad')} />
              <SelectorUnico etiqueta={t('ficha.legal.residencia')} opciones={PAISES} valor={p.residencia} onCambiar={(v) => cambiar({ residencia: v })} mensaje={mensaje('residencia')} />
              <CampoTexto etiqueta={t('ficha.legal.correo')} valor={p.correo} onCambiar={(v) => cambiar({ correo: v })} mensaje={mensaje('correo')} onBlur={salirDe('correo')} tipo="email" inputMode="email" maxLength={254} />
              <CampoTexto etiqueta={t('ficha.legal.telefono')} valor={p.telefono} onCambiar={(v) => cambiar({ telefono: v })} mensaje={mensaje('telefono')} onBlur={salirDe('telefono')} tipo="tel" inputMode="tel" maxLength={25} />
            </Rejilla>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 1 }}>
          {resumen !== '' && (
            <Typography variant="caption" role="status" sx={{ color: 'text.secondary', flex: { xs: '1 1 100%', sm: 1 }, minWidth: 0, textAlign: 'left' }}>
              {resumen}
            </Typography>
          )}
          <Button variant="text" onClick={onCerrar} sx={{ color: 'text.primary' }}>
            {t('comun.cancelar')}
          </Button>
          <Button type="submit" variant="contained" disabled={faltantes.length > 0}>
            {t('ficha.legal.listo')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
