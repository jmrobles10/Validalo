import { MenuItem, Stack, TextField, Typography, type Theme } from '@mui/material';
import type { EmpresaDto, FlujoDto, PaisDto, TipoIdentificacionDto, TipoVinculoDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import type { BorradorInvitacion, CampoInvitacion } from './modeloInvitar';
import { decideElNumero, tipoDePersonaDe } from './tipoDePersona';

/** Lo que ofrecen las listas del formulario: lo configurado en el sistema y en la empresa. */
export interface CatalogosInvitacion {
  /** Las empresas desde las que la persona puede invitar; con más de una se ofrece elegir. */
  empresas: readonly EmpresaDto[];
  paises: readonly PaisDto[] | undefined;
  tipoIdentificacion: TipoIdentificacionDto | undefined;
  /** Los tipos de vínculo activos; `undefined` si la persona no puede leer la configuración (entonces el tipo se escribe como código). */
  tiposVinculo: readonly TipoVinculoDto[] | undefined;
  /** Los tipos de vínculo aún se están cargando (no se dice todavía que no hay). */
  cargandoTipos: boolean;
  /** Los flujos publicados del tipo de vínculo elegido. */
  flujos: readonly FlujoDto[];
}

interface Props {
  b: BorradorInvitacion;
  catalogos: CatalogosInvitacion;
  empresaId: string;
  onEmpresa: (id: string) => void;
  cambiar: (parcial: Partial<BorradorInvitacion>) => void;
  tocar: (campo: CampoInvitacion) => void;
  /** El error que se ve en el campo (el de la validación tocada o el que devolvió la API). */
  mensaje: (campo: CampoInvitacion) => string | null;
}

/** Estilo de un campo con la fuente de las identificaciones y los códigos. */
const mono = (th: Theme) => ({ '& input': { fontFamily: th.typography.mono.fontFamily } });

/**
 * Los campos de «Invitar tercero»: identificación (país, tipo, número y DV), datos del tercero y vínculo (tipo y flujo), con los mismos nombres y reglas de una fila del lote. El tipo de
 * persona no se elige: lo dice el tipo de identificación (`tipoDePersonaDe`) y se muestra como texto junto a él.
 */
export function CamposInvitarTercero({ b, catalogos, empresaId, onEmpresa, cambiar, tocar, mensaje }: Props) {
  const { t } = useTranslation();
  const { paises, tipoIdentificacion: tipo, tiposVinculo, cargandoTipos, flujos, empresas } = catalogos;
  const tiposDelPais = paises?.find((p) => p.codigo === b.pais)?.tiposIdentificacion ?? [];
  // El tipo de persona, solo de lectura: sale del tipo de identificación (y, en el RUC de Panamá y el RNC dominicano, también del número).
  const persona = tipoDePersonaDe(tipo, b.numero);
  const ayudaPersona = persona ? t(`invitaciones.invitarTercero.campos.personaDerivada.${persona}`) : decideElNumero(tipo) ? t('invitaciones.invitarTercero.campos.personaSegunNumero') : undefined;
  const e = (campo: CampoInvitacion) => mensaje(campo);

  return (
    <Stack spacing={2}>
      {empresas.length > 1 && (
        <TextField select required label={t('invitaciones.invitarTercero.campos.empresa')} value={empresaId} onChange={(ev) => onEmpresa(ev.target.value)}>
          {empresas.map((x) => (
            <MenuItem key={x.id} value={x.id}>
              {x.nombre}
            </MenuItem>
          ))}
        </TextField>
      )}

      <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
        {t('invitaciones.invitarTercero.seccionIdentificacion')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          select
          required
          label={t('invitaciones.invitarTercero.campos.pais')}
          value={paises ? b.pais : ''}
          onChange={(ev) => cambiar({ pais: ev.target.value, tipoIdentificacion: '', digito: '' })}
          sx={{ flex: 1, minWidth: 0 }}
        >
          {(paises ?? []).map((p) => (
            <MenuItem key={p.codigo} value={p.codigo}>
              {p.nombre}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          required
          label={t('invitaciones.invitarTercero.campos.tipoIdentificacion')}
          value={tipo ? b.tipoIdentificacion : ''}
          onChange={(ev) => cambiar({ tipoIdentificacion: ev.target.value, digito: '' })}
          onBlur={() => tocar('tipoIdentificacion')}
          error={e('tipoIdentificacion') !== null}
          helperText={e('tipoIdentificacion') ?? ayudaPersona}
          sx={{ flex: 1.4, minWidth: 0 }}
        >
          {tiposDelPais.map((x) => (
            <MenuItem key={x.codigo} value={x.codigo}>
              {x.codigo} · {x.nombre}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
      <Stack direction="row" spacing={1.5}>
        <TextField
          required
          label={t('invitaciones.invitarTercero.campos.numero')}
          value={b.numero}
          onChange={(ev) => cambiar({ numero: ev.target.value })}
          onBlur={() => tocar('numero')}
          error={e('numero') !== null}
          helperText={e('numero') ?? t(tipo?.tieneDv ? 'invitaciones.invitarTercero.campos.numeroAyudaDv' : 'invitaciones.invitarTercero.campos.numeroAyuda')}
          slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off' } }}
          sx={[{ flex: 1, minWidth: 0 }, mono]}
        />
        {tipo?.tieneDv && (
          <TextField
            label={t('invitaciones.invitarTercero.campos.digito')}
            value={b.digito}
            onChange={(ev) => cambiar({ digito: ev.target.value })}
            error={e('digito') !== null}
            helperText={e('digito') ?? t('invitaciones.invitarTercero.campos.digitoAyuda')}
            slotProps={{ htmlInput: { maxLength: 2, spellCheck: false, autoComplete: 'off' } }}
            sx={[{ width: 150 }, mono]}
          />
        )}
      </Stack>

      <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
        {t('invitaciones.invitarTercero.seccionTercero')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          required
          label={t('invitaciones.invitarTercero.campos.nombre')}
          value={b.nombre}
          onChange={(ev) => cambiar({ nombre: ev.target.value })}
          onBlur={() => tocar('nombre')}
          error={e('nombre') !== null}
          helperText={e('nombre')}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <TextField
          label={t('invitaciones.invitarTercero.campos.nombreComercial')}
          value={b.nombreComercial}
          onChange={(ev) => cambiar({ nombreComercial: ev.target.value })}
          error={e('nombreComercial') !== null}
          helperText={e('nombreComercial')}
          sx={{ flex: 1, minWidth: 0 }}
        />
      </Stack>
      <TextField
        required
        type="email"
        label={t('invitaciones.invitarTercero.campos.correo')}
        value={b.correo}
        onChange={(ev) => cambiar({ correo: ev.target.value })}
        onBlur={() => tocar('correo')}
        error={e('correo') !== null}
        helperText={e('correo') ?? t('invitaciones.invitarTercero.campos.correoAyuda')}
        slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off' } }}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        <TextField
          label={t('invitaciones.invitarTercero.campos.contacto')}
          value={b.contacto}
          onChange={(ev) => cambiar({ contacto: ev.target.value })}
          error={e('contacto') !== null}
          helperText={e('contacto')}
          sx={{ flex: 1, minWidth: 0 }}
        />
        <TextField
          label={t('invitaciones.invitarTercero.campos.telefono')}
          value={b.telefono}
          onChange={(ev) => cambiar({ telefono: ev.target.value })}
          error={e('telefono') !== null}
          helperText={e('telefono')}
          slotProps={{ htmlInput: { inputMode: 'tel', autoComplete: 'off' } }}
          sx={{ flex: 1, minWidth: 0 }}
        />
      </Stack>

      <Typography variant="overline" component="h3" sx={{ color: 'text.secondary' }}>
        {t('invitaciones.invitarTercero.seccionVinculo')}
      </Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
        {tiposVinculo ? (
          <TextField
            select
            required
            label={t('invitaciones.invitarTercero.campos.tipoVinculo')}
            value={tiposVinculo.some((x) => x.codigo === b.tipoVinculo) ? b.tipoVinculo : ''}
            onChange={(ev) => cambiar({ tipoVinculo: ev.target.value, flujo: '' })}
            onBlur={() => tocar('tipoVinculo')}
            error={e('tipoVinculo') !== null}
            helperText={e('tipoVinculo') ?? (tiposVinculo.length === 0 && !cargandoTipos ? t('invitaciones.invitarTercero.sinTiposAyuda') : undefined)}
            sx={{ flex: 1, minWidth: 0 }}
          >
            {tiposVinculo.map((x) => (
              <MenuItem key={x.id} value={x.codigo}>
                {x.nombre}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            required
            label={t('invitaciones.invitarTercero.campos.tipoVinculoCodigo')}
            value={b.tipoVinculo}
            onChange={(ev) => cambiar({ tipoVinculo: ev.target.value.toUpperCase().trim(), flujo: '' })}
            onBlur={() => tocar('tipoVinculo')}
            error={e('tipoVinculo') !== null}
            helperText={e('tipoVinculo') ?? t('invitaciones.invitarTercero.campos.tipoVinculoCodigoAyuda')}
            slotProps={{ htmlInput: { spellCheck: false, autoComplete: 'off' } }}
            sx={[{ flex: 1, minWidth: 0 }, mono]}
          />
        )}
        <TextField
          select
          label={t('invitaciones.invitarTercero.campos.flujo')}
          value={flujos.some((x) => x.codigo === b.flujo) ? b.flujo : ''}
          onChange={(ev) => cambiar({ flujo: ev.target.value })}
          disabled={flujos.length === 0}
          error={e('flujo') !== null}
          helperText={e('flujo') ?? t('invitaciones.invitarTercero.campos.flujoAyuda')}
          slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true } }}
          sx={{ flex: 1, minWidth: 0 }}
        >
          <MenuItem value="">{t('invitaciones.invitarTercero.campos.flujoAuto')}</MenuItem>
          {flujos.map((x) => (
            <MenuItem key={x.id} value={x.codigo}>
              {x.nombre}
            </MenuItem>
          ))}
        </TextField>
      </Stack>
    </Stack>
  );
}
