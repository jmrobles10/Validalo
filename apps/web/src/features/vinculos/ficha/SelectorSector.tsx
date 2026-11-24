import { Box, ButtonBase, Divider, ListItemIcon, ListItemText, ListSubheader, Menu, MenuItem, type Theme } from '@mui/material';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GRUPOS_SECTORES, nombreAccesibleDeSector, type IndicadoresSector } from './gruposSectores';
import { ICONO_SECTOR, type IndicadorSector, type Sector } from './sectores';

interface Props {
  actual: Sector;
  indicadores: IndicadoresSector;
  onElegir: (sector: Sector) => void;
}

/**
 * Sectores de la ficha en pantallas angostas: un botón compacto de una línea con el ícono, el nombre y el contador de pendientes del sector
 * actual, que abre un menú con todos los sectores agrupados (Proceso, Información y Registro), cada uno con su ícono y su contador. Reemplaza la
 * fila de pestañas con scroll horizontal; en pantallas anchas la sustituye `BarraSectores`. La elección es la misma: el sector va en la URL.
 */
export function SelectorSector({ actual, indicadores, onElegir }: Props) {
  const { t } = useTranslation();
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const idMenu = useId();
  const abierto = ancla !== null;
  const Icono = ICONO_SECTOR[actual];
  const cerrar = () => setAncla(null);
  const elegir = (sector: Sector) => {
    cerrar();
    onElegir(sector);
  };

  return (
    <Box component="nav" aria-label={t('vinculos.ficha.sectores')} sx={{ minWidth: 0 }}>
      <ButtonBase
        onClick={(e) => setAncla(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        aria-controls={abierto ? idMenu : undefined}
        aria-label={nombreAccesibleDeSector(t, actual, indicadores[actual])}
        sx={(th: Theme) => ({
          typography: 'subtitle1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 1.25,
          width: '100%',
          height: 44,
          pl: 0.75,
          pr: 1.25,
          textAlign: 'left',
          border: 1,
          borderColor: 'divider',
          borderRadius: '12px',
          bgcolor: th.palette.superficie.panel,
          boxShadow: th.sombra.suave,
          '&:hover': { bgcolor: th.palette.superficie.nivel2 },
        })}
      >
        <Box
          aria-hidden
          sx={(th: Theme) => ({ display: 'grid', placeItems: 'center', flex: 'none', width: 30, height: 30, borderRadius: '9px', bgcolor: th.palette.acento.tinte, color: th.palette.acento.main })}
        >
          <Icono size={17} strokeWidth={1.75} />
        </Box>
        <Box component="span" sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t(`vinculos.ficha.sector.${actual}`)}
        </Box>
        <ContadorPendientes indicador={indicadores[actual]} />
        <Box aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: 'text.secondary', transition: 'transform 150ms', transform: abierto ? 'rotate(180deg)' : 'none' }}>
          <ChevronDown size={18} strokeWidth={1.75} />
        </Box>
      </ButtonBase>

      <Menu
        id={idMenu}
        anchorEl={ancla}
        open={abierto}
        onClose={cerrar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.75, minWidth: ancla?.clientWidth, maxWidth: 'calc(100vw - 16px)', maxHeight: 'min(calc(100dvh - 32px), 640px)' } } }}
      >
        {GRUPOS_SECTORES.flatMap((grupo, i) => [
          i > 0 ? <Divider key={`${grupo.clave}-linea`} component="li" sx={{ my: 0.5 }} /> : null,
          <ListSubheader
            key={`${grupo.clave}-titulo`}
            role="presentation"
            sx={{ typography: 'caption', px: 1.25, color: 'text.secondary', bgcolor: 'transparent', position: 'static' }}
          >
            {t(`vinculos.ficha.grupos.${grupo.clave}`)}
          </ListSubheader>,
          ...grupo.sectores.map((sector) => {
            const ItemIcono = ICONO_SECTOR[sector];
            return (
              <MenuItem
                key={sector}
                selected={sector === actual}
                aria-current={sector === actual ? 'page' : undefined}
                aria-label={nombreAccesibleDeSector(t, sector, indicadores[sector])}
                onClick={() => elegir(sector)}
              >
                <ListItemIcon aria-hidden>
                  <ItemIcono size={18} strokeWidth={1.75} />
                </ListItemIcon>
                <ListItemText primary={t(`vinculos.ficha.sector.${sector}`)} />
                <ContadorPendientes indicador={indicadores[sector]} />
              </MenuItem>
            );
          }),
        ])}
      </Menu>
    </Box>
  );
}

/** El número de requisitos pendientes del sector (decorativo: el nombre accesible ya lo dice); ámbar si alguno está observado o rechazado. */
function ContadorPendientes({ indicador }: { indicador: IndicadorSector | undefined }) {
  const pendientes = indicador?.pendientes ?? 0;
  if (pendientes === 0) return null;
  const advertencia = indicador?.conProblema === true;
  return (
    <Box
      component="span"
      aria-hidden
      data-testid="contador"
      sx={{
        typography: 'caption',
        lineHeight: 1,
        display: 'inline-grid',
        placeItems: 'center',
        flex: 'none',
        minWidth: 20,
        height: 20,
        px: 0.75,
        borderRadius: '10px',
        boxSizing: 'border-box',
        fontVariantNumeric: 'tabular-nums',
        bgcolor: advertencia ? 'estado.advertencia.fondo' : 'action.hover',
        color: advertencia ? 'estado.advertencia.texto' : 'text.secondary',
      }}
    >
      {pendientes}
    </Box>
  );
}
