import { Alert } from '@mui/material';
import type { AntiguedadDocumentoDto } from '@validalo/api-client';

/**
 * Lo que el tercero debe hacer cuando su documento no cumple la antigüedad máxima del tipo al subirlo (TD-10): la fecha leída y los días frente al máximo
 * (`detalle`) y el siguiente paso (`mensaje`: «Sube el documento … expedido hace menos de 30 días»). Aparece apenas llega la lectura, antes de que la empresa
 * decida; si la empresa o la revisión automática ya lo decidió (`decidido`), este aviso sobra: si lo observó, la observación lo dice, y si lo aprobó (p. ej. con una
 * justificación), ya no hay nada que subir.
 */
export function AvisoAntiguedad({ antiguedad, decidido = false }: { antiguedad: AntiguedadDocumentoDto | null | undefined; decidido?: boolean }) {
  if (decidido || !antiguedad?.mensaje) return null;
  return (
    <Alert severity="warning" sx={{ mt: 1 }} data-antiguedad={antiguedad.estado}>
      {`${antiguedad.detalle} ${antiguedad.mensaje}`}
    </Alert>
  );
}
