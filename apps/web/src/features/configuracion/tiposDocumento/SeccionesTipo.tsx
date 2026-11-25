import { Box, Checkbox, FormControlLabel, FormGroup, FormHelperText, FormLabel, InputAdornment, MenuItem, Stack, Switch, TextField, Typography } from '@mui/material';
import type { TipoDocumentoCanonicoDto } from '@validalo/api-client';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AMBITOS, etiquetaDelCanonico, FORMATOS, frescuraSugerida, techoDelCanonico, UNIDADES_REVALIDACION, type BorradorTipo, type FormatoCorto, type UnidadRevalidacion } from './modelo';

export interface PropsSeccion {
  borrador: BorradorTipo;
  cambiar: (parcial: Partial<BorradorTipo>) => void;
  /** Error visible del campo (ya filtrado por «tocado»). */
  error: (campo: string) => string | null;
}

/** Bloque del panel con título y una línea que explica para qué sirve. */
export function Seccion({ titulo, ayuda, children }: { titulo: string; ayuda?: string; children: ReactNode }) {
  return (
    <Box component="section" sx={{ pb: 2.5, '& + &': { pt: 2.5, borderTop: 1, borderColor: 'divider' } }}>
      <Typography variant="subtitle1" component="h3">
        {titulo}
      </Typography>
      {ayuda && (
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.25, mb: 1.5 }}>
          {ayuda}
        </Typography>
      )}
      <Stack spacing={2} sx={{ mt: ayuda ? 0 : 1.5 }}>
        {children}
      </Stack>
    </Box>
  );
}

export function SeccionIdentidad({ borrador, cambiar, error, creando, canonicos }: PropsSeccion & { creando: boolean; canonicos: readonly TipoDocumentoCanonicoDto[] }) {
  const { t } = useTranslation();
  return (
    <Seccion titulo={t('tiposDocumento.secciones.identidad')}>
      {creando && (
        <TextField
          select
          label={t('tiposDocumento.campos.canonico')}
          value={borrador.tipoCanonico}
          onChange={(e) => {
            const canonico = canonicos.find((c) => c.codigo === e.target.value);
            // Las reglas de frescura que sugiere el canónico se precargan solo si aún no se escribió ninguna (la empresa las ajusta).
            const sinFrescura = !borrador.antiguedad && !borrador.revalidar && !borrador.periodo;
            cambiar({
              tipoCanonico: e.target.value,
              ...(canonico && { ambito: canonico.ambito, nombre: borrador.nombre || canonico.nombre, codigo: borrador.codigo || canonico.codigo }),
              ...(canonico && sinFrescura && frescuraSugerida(canonico)),
            });
          }}
          helperText={t('tiposDocumento.campos.canonicoAyuda')}
          slotProps={{ select: { displayEmpty: true } }}
        >
          <MenuItem value="">{t('tiposDocumento.campos.sinCanonico')}</MenuItem>
          {canonicos.filter((c) => c.cargaSoportada).map((c) => (
            <MenuItem key={c.codigo} value={c.codigo}>
              {etiquetaDelCanonico(c)}
            </MenuItem>
          ))}
        </TextField>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          required={creando}
          disabled={!creando}
          label={t('tiposDocumento.campos.codigo')}
          value={borrador.codigo}
          onChange={(e) => cambiar({ codigo: e.target.value.toUpperCase().replace(/\s+/g, '_') })}
          error={Boolean(error('codigo'))}
          helperText={error('codigo') ?? t('tiposDocumento.campos.codigoAyuda')}
          sx={{ width: { sm: 220 }, '& input': { fontFamily: (th) => th.typography.mono.fontFamily } }}
        />
        <TextField required label={t('tiposDocumento.campos.nombre')} value={borrador.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} error={Boolean(error('nombre'))} helperText={error('nombre') ?? ' '} sx={{ flex: 1 }} />
      </Stack>
      <TextField
        select
        label={t('tiposDocumento.campos.ambito')}
        value={borrador.ambito}
        onChange={(e) => cambiar({ ambito: e.target.value })}
        error={Boolean(error('ambito'))}
        helperText={error('ambito') ?? t(`tiposDocumento.ambitosAyuda.${borrador.ambito === 'Global' ? 'Global' : 'PorVinculo'}`)}
      >
        {AMBITOS.map((a) => (
          <MenuItem key={a} value={a}>
            {t(`tiposDocumento.ambitos.${a}`)}
          </MenuItem>
        ))}
      </TextField>
      <TextField multiline minRows={2} label={t('tiposDocumento.campos.textoAyuda')} value={borrador.textoAyuda} onChange={(e) => cambiar({ textoAyuda: e.target.value })} helperText={t('tiposDocumento.campos.textoAyudaAyuda')} />
      {!creando && <FormControlLabel control={<Switch checked={borrador.activo} onChange={(e) => cambiar({ activo: e.target.checked })} />} label={t('tiposDocumento.campos.activo')} />}
    </Seccion>
  );
}

export function SeccionArchivo({ borrador, cambiar, error, canonico, descripcion }: PropsSeccion & { canonico: TipoDocumentoCanonicoDto | undefined; descripcion: string | null }) {
  const { t } = useTranslation();
  const techo = techoDelCanonico(canonico);
  const alternar = (f: FormatoCorto) => cambiar({ formatos: borrador.formatos.includes(f) ? borrador.formatos.filter((x) => x !== f) : [...borrador.formatos, f] });
  return (
    <Seccion titulo={t('tiposDocumento.secciones.archivo')} ayuda={t('tiposDocumento.archivo.ayuda')}>
      <Box component="fieldset" sx={{ border: 0, m: 0, p: 0 }}>
        <FormLabel component="legend" sx={{ typography: 'subtitle2', color: 'text.primary', mb: 0.5 }}>
          {t('tiposDocumento.archivo.formatos')}
        </FormLabel>
        <FormGroup row>
          {FORMATOS.map((f) => {
            const fueraDelTecho = techo?.formatos ? !techo.formatos.includes(f.corto) : false;
            return (
              <FormControlLabel key={f.corto} disabled={fueraDelTecho} control={<Checkbox size="small" checked={borrador.formatos.includes(f.corto)} onChange={() => alternar(f.corto)} />} label={f.nombre} />
            );
          })}
        </FormGroup>
        <FormHelperText sx={{ mx: 0 }}>{techo?.formatos ? t('tiposDocumento.archivo.formatosTecho', { formatos: techo.formatos.join(', ').toUpperCase() }) : t('tiposDocumento.archivo.formatosAyuda')}</FormHelperText>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          label={t('tiposDocumento.archivo.tamano')}
          value={borrador.tamanoMb}
          onChange={(e) => cambiar({ tamanoMb: e.target.value.replace(/\D/g, '') })}
          error={Boolean(error('tamanoMb'))}
          helperText={error('tamanoMb') ?? (techo?.tamanoMb ? t('tiposDocumento.archivo.techo', { valor: String(techo.tamanoMb) }) : t('tiposDocumento.archivo.vacioGlobal'))}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          sx={{ flex: 1 }}
        />
        <TextField
          label={t('tiposDocumento.archivo.paginas')}
          value={borrador.paginas}
          onChange={(e) => cambiar({ paginas: e.target.value.replace(/\D/g, '') })}
          error={Boolean(error('paginas'))}
          helperText={error('paginas') ?? (techo?.paginas ? t('tiposDocumento.archivo.techo', { valor: String(techo.paginas) }) : t('tiposDocumento.archivo.vacioGlobal'))}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          sx={{ flex: 1 }}
        />
      </Stack>
      {descripcion && (
        <Typography variant="body2" sx={{ px: 1.5, py: 1, bgcolor: 'superficie.nivel2', borderRadius: (th) => `${String(th.radio.sm)}px` }}>
          {t('tiposDocumento.archivo.loQueVe', { descripcion })}
        </Typography>
      )}
    </Seccion>
  );
}

export function SeccionVigencia({ borrador, cambiar, error, canonico }: PropsSeccion & { canonico?: TipoDocumentoCanonicoDto }) {
  const { t } = useTranslation();
  // El periodo mínimo (regla heredada, aún sin fecha) solo se ofrece si el tipo ya lo trae o su canónico lo sugiere.
  const conPeriodo = borrador.periodo !== '' || canonico?.reglaFrescuraSugerida?.tipo === 'PeriodoMinimo';
  return (
    <Seccion titulo={t('tiposDocumento.secciones.vigencia')} ayuda={t('tiposDocumento.vigencia.ayuda')}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label={t('tiposDocumento.vigencia.antiguedad')}
          value={borrador.antiguedad}
          onChange={(e) => cambiar({ antiguedad: e.target.value.replace(/\D/g, '') })}
          error={Boolean(error('antiguedad'))}
          helperText={error('antiguedad') ?? t('tiposDocumento.vigencia.antiguedadAyuda')}
          slotProps={{ htmlInput: { inputMode: 'numeric' }, input: { endAdornment: <InputAdornment position="end">{t('tiposDocumento.vigencia.dias')}</InputAdornment> } }}
          sx={{ flex: 1 }}
        />
      </Stack>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
        <TextField
          label={t('tiposDocumento.vigencia.revalidar')}
          value={borrador.revalidar}
          onChange={(e) => cambiar({ revalidar: e.target.value.replace(/\D/g, '') })}
          error={Boolean(error('revalidar'))}
          helperText={error('revalidar') ?? t('tiposDocumento.vigencia.revalidarAyuda')}
          slotProps={{ htmlInput: { inputMode: 'numeric' } }}
          sx={{ flex: 1 }}
        />
        <TextField
          select
          label={t('tiposDocumento.vigencia.unidad')}
          value={borrador.unidadRevalidar}
          onChange={(e) => cambiar({ unidadRevalidar: e.target.value as UnidadRevalidacion })}
          helperText=" "
          sx={{ width: 140 }}
        >
          {UNIDADES_REVALIDACION.map((u) => (
            <MenuItem key={u} value={u}>
              {t(`tiposDocumento.vigencia.unidades.${u}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      {conPeriodo && (
        <TextField label={t('tiposDocumento.vigencia.periodo')} value={borrador.periodo} onChange={(e) => cambiar({ periodo: e.target.value })} helperText={t('tiposDocumento.vigencia.periodoAyuda')} />
      )}
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('tiposDocumento.vigencia.avisosIntro')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField label={t('tiposDocumento.vigencia.diasAviso')} value={borrador.diasAviso} onChange={(e) => cambiar({ diasAviso: e.target.value })} error={Boolean(error('diasAviso'))} helperText={error('diasAviso') ?? t('tiposDocumento.vigencia.diasAvisoAyuda')} sx={{ flex: 1 }} />
        <TextField label={t('tiposDocumento.vigencia.diasGracia')} value={borrador.diasGracia} onChange={(e) => cambiar({ diasGracia: e.target.value.replace(/\D/g, '') })} error={Boolean(error('diasGracia'))} helperText={error('diasGracia') ?? t('tiposDocumento.vigencia.diasGraciaAyuda')} slotProps={{ htmlInput: { inputMode: 'numeric' } }} sx={{ flex: 1 }} />
      </Stack>
    </Seccion>
  );
}
