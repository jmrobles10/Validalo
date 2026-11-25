import { Box } from '@mui/material';
import { CircleAlert, CircleCheck, CircleX, type LucideIcon } from 'lucide-react';
import type { TonoDelResumen } from '../resumenDeCruce';

/** El ícono de cada tono del resumen de un cruce; el color por sí solo no dice nada: la frase de al lado dice qué coincide y qué no. */
const ICONO: Record<TonoDelResumen, LucideIcon> = { exito: CircleCheck, advertencia: CircleAlert, error: CircleX };

/**
 * `sobrio`: lo que está bien no lleva verde, solo el check en gris secundario (el bloque «Revisión automática» reserva el color para lo que pide atención: la conclusión de
 * la IA y lo que difiere). Ámbar y rojo siguen igual.
 */
export function IconoDelResumen({ tono, sobrio = false }: { tono: TonoDelResumen; sobrio?: boolean }) {
  const Icono = ICONO[tono];
  return (
    <Box component="span" aria-hidden sx={{ display: 'inline-flex', flex: 'none', color: sobrio && tono === 'exito' ? 'text.secondary' : `estado.${tono}.texto` }}>
      <Icono size={16} strokeWidth={1.75} />
    </Box>
  );
}
