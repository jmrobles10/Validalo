import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BotonDescargarDeclaracion } from '../pep/BotonDescargarDeclaracion';
import type { PersonaRelacionada } from '../tipos';
import { hayEnLaTarjeta, indicesDeLaTarjeta, mensajeDeLaTarjeta, rolesDeLaTarjeta, type TarjetaDePersona } from './agrupacion';
import { DocumentoDeIdentidad } from './DocumentoDeIdentidad';
import { nombrePersona } from './personas';

interface Props {
  /** Las filas de `personas` (la de la tarjeta y, si también es socio, la de Socio). */
  personas: readonly PersonaRelacionada[];
  tarjeta: TarjetaDePersona;
  mensaje: (ruta: string) => string | null;
  hayEnRuta?: (prefijo: string) => boolean;
  onEditar: () => void;
  onQuitar: () => void;
  deshabilitado: boolean;
}

const CAMPOS = ['rol', 'tipo_identificacion', 'numero', 'dv', 'nombres', 'apellidos', 'cargo', 'porcentaje', 'pep', 'vinculo_pep', 'fecha_expedicion', 'lugar_expedicion', 'fecha_nacimiento', 'nacionalidad', 'residencia', 'correo', 'telefono', 'tipo_representacion'];

/**
 * Una persona de la información legal: nombre, roles (un representante que además es socio es UNA persona con «Representante legal · Socio o accionista»),
 * identificación, participación, su documento de identidad y cuántos datos le faltan según el servidor (de cualquiera de sus filas).
 */
export function TarjetaPersonaLegal({ personas, tarjeta, mensaje, hayEnRuta, onEditar, onQuitar, deshabilitado }: Props) {
  const { t } = useTranslation();
  const persona = personas[tarjeta.indice] ?? {};
  const socio = tarjeta.indiceSocio === null ? undefined : personas[tarjeta.indiceSocio];
  const nombre = nombrePersona(persona) || t('ficha.legal.sinNombre');
  const roles = rolesDeLaTarjeta(personas, tarjeta);
  const porcentaje = socio?.porcentaje ?? null;
  // La declaración PEP cuenta como un dato por corregir si el servidor señaló algo dentro de ella.
  const marcados = CAMPOS.filter((c) => mensajeDeLaTarjeta(mensaje, tarjeta, c)).length + (hayEnLaTarjeta(hayEnRuta ?? (() => false), tarjeta, 'declaracion_pep') ? 1 : 0);
  const faltaDeclaracion = persona.pep === true && !persona.declaracion_pep;
  const errorFila = mensajeDeLaTarjeta(mensaje, tarjeta);
  // La declaración está en las dos filas (la misma): se descarga la de la primera que la tenga firmada.
  const filaConDeclaracion = indicesDeLaTarjeta(tarjeta).find((i) => personas[i]?.pep === true && personas[i].declaracion_pep?.fecha_firma);

  return (
    <Paper component="li" variant="outlined" aria-label={nombre} sx={{ p: 1.5, border: 0, bgcolor: 'superficie.nivel2' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' } }}>
        <Stack sx={{ minWidth: 0, flex: 1 }} spacing={0.5}>
          <Typography variant="subtitle2" component="p">{nombre}</Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            {[...roles.map((rol) => t(`ficha.legal.roles.${rol}`)), persona.numero ? `${persona.tipo_identificacion ?? ''} ${persona.numero}`.trim() : null, porcentaje === null ? null : `${String(porcentaje)} %`]
              .filter(Boolean)
              .join(' · ')}
          </Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {marcados > 0 && <Chip size="small" color="warning" variant="outlined" label={t('ficha.legal.faltan', { count: marcados })} />}
            {faltaDeclaracion && <Chip size="small" color="warning" variant="outlined" label={t('ficha.pep.tarjeta.falta')} />}
          </Stack>
          {filaConDeclaracion !== undefined && <Box><BotonDescargarDeclaracion seccion="FICHA_LEGAL" persona={filaConDeclaracion} nombre={nombre} variante="text" /></Box>}
          {errorFila && <Typography sx={{ color: 'error.main' }}>{errorFila}</Typography>}
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<Pencil size={16} aria-hidden />} onClick={onEditar} disabled={deshabilitado} aria-label={t('ficha.legal.editarAccesible', { nombre })} sx={{ flex: { xs: 1, sm: 'none' } }}>
            {t('ficha.editar')}
          </Button>
          <Button variant="text" color="inherit" startIcon={<Trash2 size={16} aria-hidden />} onClick={onQuitar} disabled={deshabilitado} aria-label={t('ficha.legal.quitarAccesible', { nombre })} sx={{ flex: { xs: 1, sm: 'none' } }}>
            {t('ficha.quitar')}
          </Button>
        </Stack>
      </Stack>
      <DocumentoDeIdentidad persona={persona} roles={roles} />
    </Paper>
  );
}
