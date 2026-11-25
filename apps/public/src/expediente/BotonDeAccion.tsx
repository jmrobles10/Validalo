import { Button, type ButtonProps } from '@mui/material';
import type { LucideIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { Link as RouterLink } from 'react-router';

type Props = Omit<ButtonProps, 'size' | 'startIcon' | 'endIcon' | 'variant'> & {
  /** Con `to` navega; sin él, ejecuta `onClick` (abre un diálogo). */
  to?: ComponentProps<typeof RouterLink>['to'];
  /** El ícono de la acción (subir, llenar, registrar…), pequeño y antes del texto. */
  icono?: LucideIcon;
  /** `contained` (la acción que le toca, del color primario) u `outlined` (la menos urgente: reemplazar una versión vigente). */
  variant?: 'contained' | 'outlined';
};

/**
 * La acción de una tarjeta de la revisión (subir, corregir, completar, registrar a la persona…): botón pequeño, relleno del color primario
 * y con el ícono de lo que hace, al pie de la tarjeta. Con `variant="outlined"` queda como acción secundaria.
 */
export function BotonDeAccion({ to, icono: Icono, variant = 'contained', children, ...resto }: Props) {
  const comunes = { variant, startIcon: Icono ? <Icono size={16} aria-hidden /> : undefined, ...resto } as const;
  return to === undefined ? (
    <Button {...comunes}>{children}</Button>
  ) : (
    <Button component={RouterLink} to={to} {...comunes}>
      {children}
    </Button>
  );
}
