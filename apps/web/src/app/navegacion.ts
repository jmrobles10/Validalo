import { BadgeCheck, CalendarClock, ChartColumn, ClipboardCheck, FileWarning, History, House, Inbox, Link2, RefreshCw, Scale, type LucideIcon } from 'lucide-react';

/** Claves de las secciones de la web de empresa (`AppShell`): su nombre está en `nav.{clave}`. */
export type ClavePestana = 'inicio' | 'bandeja' | 'excepciones' | 'revalidaciones' | 'evaluaciones' | 'vencimientos' | 'cumplimiento' | 'certificados' | 'vinculos' | 'informes' | 'auditoria';

export interface Pestana {
  clave: ClavePestana;
  /** Ruta de la sección, relativa a `rutaBase`. */
  ruta: string;
  /** Rutas que marcan la sección como activa. */
  prefijos: readonly string[];
  /** Pendientes de la sección (texto, p. ej. «3» o «200+»): una insignia sobre el ícono. Sin pendientes, no se pasa. */
  conteo?: string;
}

/** Lo que necesita cualquier menú de secciones (el riel de escritorio y el cajón del celular): una sola fuente de secciones, permisos y estado. */
export interface PropsNavegacion {
  pestanas: readonly Pestana[];
  rutaBase: string;
  activa: ClavePestana | null;
  nombreDe: (clave: ClavePestana) => string;
  /** Destino y estado de Configuración; sin él (sin permisos) no se muestra. */
  configuracion?: { destino: string; activo: boolean };
}

/** Ícono de cada sección de la web de empresa en el riel y en el cajón. */
export const ICONO_SECCION: Record<ClavePestana, LucideIcon> = {
  inicio: House,
  bandeja: Inbox,
  excepciones: FileWarning,
  revalidaciones: RefreshCw,
  vencimientos: CalendarClock,
  cumplimiento: Scale,
  evaluaciones: ClipboardCheck,
  certificados: BadgeCheck,
  vinculos: Link2,
  informes: ChartColumn,
  auditoria: History,
};
