import { NavegacionLateral } from '@validalo/ui';
import { useTranslation } from 'react-i18next';
import { gruposDeNavegacion, type IndicadoresSector } from './gruposSectores';
import { ESTILO_BARRA_SECTORES } from './medidasDeLaFicha';
import type { Sector } from './sectores';

interface Props {
  actual: Sector;
  indicadores: IndicadoresSector;
  onElegir: (sector: Sector) => void;
}

/**
 * Barra lateral de la ficha del vínculo: la misma navegación agrupada de la consola de Plataforma (panel flotante, títulos de grupo en gris
 * y el sector activo como una píldora blanca con sombra suave), fija al desplazar la página y siempre del alto disponible. Cada sector muestra cuántos requisitos del
 * expediente siguen pendientes (en ámbar si alguno está observado o rechazado). Va sin el rótulo ni el control de colapsar: es una lista
 * corta que debe verse entera, así que los ítems son compactos y, si la pantalla es muy baja, la lista desplaza dentro del panel. En
 * pantallas angostas la reemplaza `SelectorSector`.
 */
export function BarraSectores({ actual, indicadores, onElegir }: Props) {
  const { t } = useTranslation();
  return (
    <NavegacionLateral
      etiqueta={t('vinculos.ficha.sectores')}
      grupos={gruposDeNavegacion(t, actual, indicadores, onElegir)}
      densidad="compacta"
      sx={ESTILO_BARRA_SECTORES}
    />
  );
}
