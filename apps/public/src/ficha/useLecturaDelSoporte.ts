import type { PropuestaDeSeccionDto } from '@validalo/api-client';
import { useEffect, useRef, useState } from 'react';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { lecturaDelSoporte, TIEMPOS_DE_LECTURA, type LecturaDelSoporte, type SoporteSubido } from './propuestas';

/**
 * La lectura del documento que el tercero acaba de subir desde la sección (FD-10), para pintarla. Vuelve a pintar cuando se agota la espera (pasado ese
 * momento ya no se consulta y nada más lo haría) y lleva la vista a la zona **cuando el diálogo de subida se cierra** (con él abierto el foco no sale de
 * él): el tercero estaba abajo, en «Documento que respalda esta información», y lo que dice la lectura está arriba, junto a la propuesta.
 */
export function useLecturaDelSoporte(subido: SoporteSubido | null, propuestas: readonly PropuestaDeSeccionDto[] | undefined, actualizadaEn: number) {
  const zona = useRef<HTMLDivElement>(null);
  const enfocado = useRef<number | null>(null);
  const dialogoCerrado = useDialogoSubir((s) => s.solicitud === null);
  const [, repintar] = useState(0);

  useEffect(() => {
    if (!subido) return;
    const restante = subido.desde + TIEMPOS_DE_LECTURA.trasSubirMs - Date.now();
    if (restante <= 0) return;
    const espera = window.setTimeout(() => repintar((n) => n + 1), restante + 50);
    return () => window.clearTimeout(espera);
  }, [subido]);

  useEffect(() => {
    if (!subido || !dialogoCerrado || enfocado.current === subido.desde) return;
    enfocado.current = subido.desde;
    zona.current?.focus();
  }, [subido, dialogoCerrado]);

  const lectura: LecturaDelSoporte | null = subido ? lecturaDelSoporte(subido, propuestas, actualizadaEn, Date.now()) : null;
  return { zona, lectura };
}
