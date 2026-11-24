import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { DialogoSubir } from './DialogoSubir';
import { useDialogoSubir } from './useDialogoSubir';

/**
 * Monta el diálogo de subida que abren los botones «Subir…» de toda la app (`useDialogoSubir`). Vive en el marco, fuera de las pantallas, para
 * que el resultado no desaparezca cuando la fila que lo abrió cambia al subir. Si la persona cambia de pantalla (el botón «atrás» del navegador),
 * el diálogo se cierra: no se queda abierto sobre otra.
 */
export function AnfitrionDeSubida() {
  const solicitud = useDialogoSubir((s) => s.solicitud);
  const apertura = useDialogoSubir((s) => s.apertura);
  const cerrar = useDialogoSubir((s) => s.cerrar);
  const { pathname } = useLocation();
  const anterior = useRef(pathname);

  useEffect(() => {
    if (anterior.current === pathname) return;
    anterior.current = pathname;
    cerrar();
  }, [pathname, cerrar]);

  return solicitud ? <DialogoSubir key={apertura} solicitud={solicitud} onCerrar={cerrar} /> : null;
}
