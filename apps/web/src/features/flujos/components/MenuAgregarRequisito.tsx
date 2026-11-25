import { Button, ListItemIcon, ListItemText, Menu, MenuItem } from '@mui/material';
import { ChevronDown, ChevronRight, ClipboardList, FileText, Plus } from 'lucide-react';
import { useId, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { SECCIONES_FICHA } from '../../terceros/ficha/secciones';
import { ICONO_SECTOR, SECTORES_DE_REQUISITO, sectorDeSeccion } from '../../vinculos/ficha/sectores';
import { ANCHO_DEL_MENU, ANCHO_DEL_SUBMENU, colocarSubmenu, type ColocacionDelSubmenu } from './colocacionDelSubmenu';
import { focoVisible } from './estiloDeFilas';

export interface MenuAgregarRequisitoProps {
  /** Los códigos de las secciones de la información (`FICHA_GENERAL`…) que el flujo ya pide. */
  seccionesPedidas: ReadonlySet<string>;
  onAgregarDocumento: () => void;
  /** Suma una sección ya elegida: aparece en su sector, así que nunca hay una sección sin sector en la vista. */
  onAgregarSeccion: (seccion: string) => void;
}

/** Las secciones de la información en el orden de los sectores del menú lateral de la ficha. */
const SECCIONES_POR_SECTOR = [...SECCIONES_FICHA].sort(
  (a, b) => SECTORES_DE_REQUISITO.indexOf(sectorDeSeccion(a.codigo)) - SECTORES_DE_REQUISITO.indexOf(sectorDeSeccion(b.codigo)),
);

/**
 * Un solo botón «Agregar» que ofrece lo que el flujo puede pedir: un documento (sin tipo todavía, en «Por completar») o una sección de la información del
 * tercero, que se elige en un submenú entre las que el flujo aún no pide, con el ícono de su sector. Las ya pedidas salen apagadas con «Ya se pide»; si ya
 * se piden todas, el ítem queda apagado con esa explicación.
 */
export function MenuAgregarRequisito({ seccionesPedidas, onAgregarDocumento, onAgregarSeccion }: MenuAgregarRequisitoProps) {
  const { t } = useTranslation();
  const idMenu = useId();
  const idSecciones = useId();
  const [ancla, setAncla] = useState<HTMLElement | null>(null);
  const [submenu, setSubmenu] = useState<ColocacionDelSubmenu | null>(null);
  const todasPedidas = SECCIONES_POR_SECTOR.every((s) => seccionesPedidas.has(s.codigo));
  const cerrar = () => {
    setSubmenu(null);
    setAncla(null);
  };
  const abrirSecciones = (item: HTMLElement) =>
    setSubmenu((actual) => {
      if (actual) return null;
      const menu = item.closest('.MuiPaper-root')?.getBoundingClientRect();
      return menu ? colocarSubmenu({ menu, itemTop: item.getBoundingClientRect().top, anchoDePantalla: window.innerWidth }) : { lado: 'debajo' };
    });
  const enElMismoMenu = submenu?.lado === 'debajo';

  const itemsDeSecciones = (sangria: boolean) =>
    SECCIONES_POR_SECTOR.map((s) => {
      const Icono = ICONO_SECTOR[sectorDeSeccion(s.codigo)];
      const pedida = seccionesPedidas.has(s.codigo);
      return (
        <MenuItem
          key={s.codigo}
          disabled={pedida}
          sx={sangria ? { pl: 4.5 } : undefined}
          onClick={() => {
            cerrar();
            onAgregarSeccion(s.codigo);
          }}
        >
          <ListItemIcon>
            <Icono size={16} strokeWidth={1.75} aria-hidden />
          </ListItemIcon>
          <ListItemText primary={t(`fichaEmpresa.secciones.${s.codigo}`)} secondary={pedida ? t('flujoRequisitos.yaSePide') : undefined} />
        </MenuItem>
      );
    });

  return (
    <>
      <Button
        variant="outlined"
        size="small"
        startIcon={<Plus size={16} aria-hidden />}
        endIcon={<ChevronDown size={16} aria-hidden />}
        aria-haspopup="menu"
        aria-expanded={ancla !== null}
        aria-controls={ancla ? idMenu : undefined}
        onClick={(ev) => setAncla(ev.currentTarget)}
        sx={(th) => focoVisible(th, 2)}
      >
        {t('flujoRequisitos.agregar')}
      </Button>
      {/* Sin animación de entrada: el submenú se coloca según el tamaño final del menú principal, no el de un cuadro de su crecimiento. */}
      <Menu id={idMenu} anchorEl={ancla} open={ancla !== null} onClose={cerrar} transitionDuration={0} slotProps={{ paper: { sx: { minWidth: ANCHO_DEL_MENU } } }}>
        <MenuItem
          onClick={() => {
            cerrar();
            onAgregarDocumento();
          }}
        >
          <ListItemIcon>
            <FileText size={16} strokeWidth={1.75} aria-hidden />
          </ListItemIcon>
          <ListItemText primary={t('flujoRequisitos.agregarDocumento')} />
        </MenuItem>
        <MenuItem
          disabled={todasPedidas}
          aria-haspopup="menu"
          aria-expanded={submenu !== null}
          aria-controls={submenu && !enElMismoMenu ? idSecciones : undefined}
          onClick={(ev) => abrirSecciones(ev.currentTarget)}
          onKeyDown={(ev) => {
            if (ev.key === 'ArrowRight' && submenu === null) {
              ev.preventDefault();
              abrirSecciones(ev.currentTarget);
            }
          }}
        >
          <ListItemIcon>
            <ClipboardList size={16} strokeWidth={1.75} aria-hidden />
          </ListItemIcon>
          <ListItemText primary={t('flujoRequisitos.agregarSeccion')} secondary={todasPedidas ? t('flujoRequisitos.yaSePidenTodas') : undefined} />
          {enElMismoMenu ? <ChevronDown size={16} strokeWidth={1.75} aria-hidden /> : <ChevronRight size={16} strokeWidth={1.75} aria-hidden />}
        </MenuItem>
        {enElMismoMenu && itemsDeSecciones(true)}
      </Menu>
      {submenu && !enElMismoMenu && (
        <Menu
          id={idSecciones}
          open
          anchorReference="anchorPosition"
          anchorPosition={{ top: submenu.top, left: submenu.left }}
          // Pegado al borde del menú principal: la esquina que toca al ancla es la de ese lado.
          transformOrigin={{ vertical: 'top', horizontal: submenu.lado === 'derecha' ? 'left' : 'right' }}
          onClose={(_, motivo) => (motivo === 'backdropClick' ? cerrar() : setSubmenu(null))}
          slotProps={{
            paper: { sx: { width: ANCHO_DEL_SUBMENU } },
            list: {
              'aria-label': t('flujoRequisitos.seccionesQueFaltan'),
              onKeyDown: (ev: KeyboardEvent) => {
                // La flecha hacia el menú principal cierra el submenú y devuelve el foco a su ítem.
                if (ev.key === (submenu.lado === 'derecha' ? 'ArrowLeft' : 'ArrowRight')) {
                  ev.preventDefault();
                  setSubmenu(null);
                }
              },
            },
          }}
        >
          {itemsDeSecciones(false)}
        </Menu>
      )}
    </>
  );
}
