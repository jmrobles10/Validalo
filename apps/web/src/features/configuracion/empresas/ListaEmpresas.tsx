import { Box, Typography } from '@mui/material';
import type { EmpresaDto } from '@validalo/api-client';
import { AvatarActor } from '@validalo/ui';
import { Ban } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../../shared/componentes';
import { MenuFila } from '../../../shared/MenuFila';
import { identificacionVisible } from './modelo';

interface Props {
  empresas: readonly EmpresaDto[];
  /** La empresa cuyo detalle se ve al lado. */
  elegidaId: string | undefined;
  onElegir: (id: string) => void;
  onDesactivar: (empresa: EmpresaDto) => void;
}

/**
 * La lista de las razones sociales del grupo: una tarjeta con una fila por empresa (su nombre, su identificación y su prefijo), la elegida marcada con una barra del acento y el
 * menú «⋯» de cada una. Elegir una empresa muestra su detalle (`DetalleEmpresa`) al lado, o debajo en pantallas angostas. Con una sola empresa se ve igual que con varias.
 */
export function ListaEmpresas({ empresas, elegidaId, onElegir, onDesactivar }: Props) {
  const { t } = useTranslation();

  return (
    <Tarjeta etiqueta={t('empresasGrupo.lista')} titulo={t('empresasGrupo.lista')} ayuda={t('empresasGrupo.cuantas', { count: empresas.length })} sinRelleno>
      <Box component="ul" aria-label={t('empresasGrupo.lista')} sx={{ m: 0, p: 1, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {empresas.map((e) => {
          const actual = e.id === elegidaId;
          return (
            <Box component="li" key={e.id} sx={{ position: 'relative', opacity: e.activa ? 1 : 0.7 }}>
              <Box
                component="button"
                type="button"
                aria-current={actual ? 'true' : undefined}
                aria-label={t('empresasGrupo.ver', { nombre: e.nombre })}
                onClick={() => onElegir(e.id)}
                sx={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  width: '100%',
                  minWidth: 0,
                  py: 1.25,
                  pl: 1.5,
                  pr: 6,
                  border: 0,
                  borderRadius: (th) => `${String(th.radio.sm)}px`,
                  bgcolor: actual ? 'acento.tinte' : 'transparent',
                  color: 'text.primary',
                  font: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                  '&:hover': { bgcolor: actual ? 'acento.tinte' : 'superficie.nivel2' },
                  // La elegida lleva una barra del acento a la izquierda: se distingue sin depender solo del tinte.
                  '&::before': actual ? { content: '""', position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 3, bgcolor: 'acento.main' } : undefined,
                }}
              >
                <AvatarActor tipo="tercero" tamano={36} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle2" component="span" noWrap sx={{ display: 'block' }}>
                    {e.nombre}
                  </Typography>
                  <Typography variant="monoTabla" noWrap sx={{ display: 'block', color: 'text.secondary' }}>
                    {identificacionVisible(e.identificacion)} · {e.prefijoFolio}
                  </Typography>
                  {!e.activa && (
                    <Typography variant="caption" component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                      <Ban size={12} strokeWidth={1.75} aria-hidden />
                      {t('empresasGrupo.inactiva')}
                    </Typography>
                  )}
                </Box>
              </Box>
              {/* El menú es un hermano del botón (un botón dentro de otro no es válido): se posa sobre el extremo derecho de la fila. */}
              <Box sx={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}>
                <MenuFila
                  etiqueta={t('comun.accionesDe', { nombre: e.nombre })}
                  acciones={e.activa ? [{ etiqueta: t('empresasGrupo.desactivar'), icono: Ban, destructiva: true, onClick: () => onDesactivar(e) }] : []}
                />
              </Box>
            </Box>
          );
        })}
      </Box>
    </Tarjeta>
  );
}
