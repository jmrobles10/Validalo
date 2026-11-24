import { create } from 'zustand';
import type { SolicitudDeSubida } from './solicitudDeSubida';

interface DialogoSubirState {
  /** Lo que se está subiendo en el diálogo; `null` con el diálogo cerrado. */
  solicitud: SolicitudDeSubida | null;
  /** Cambia con cada apertura: una solicitud nueva empieza el diálogo de cero (tipo elegido, campos, estado de la subida). */
  apertura: number;
  abrir: (solicitud: SolicitudDeSubida) => void;
  cerrar: () => void;
}

let secuencia = 0;

/**
 * El diálogo de subida es uno solo para toda la app (lo monta el marco, `AnfitrionDeSubida`) y no depende de la fila que lo abrió: al subir, esa
 * fila cambia (el documento ya no «vence», el requisito pasa de «Te toca» a «Lo revisa la empresa») y, si el diálogo viviera en ella, se
 * cerraría antes de que el tercero lea el resultado.
 */
export const useDialogoSubir = create<DialogoSubirState>()((set) => ({
  solicitud: null,
  apertura: 0,
  abrir: (solicitud) => set({ solicitud, apertura: ++secuencia }),
  cerrar: () => set({ solicitud: null }),
}));
