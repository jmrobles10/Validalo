import { Landmark } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogoCertificacionDelRequisito } from './DialogoCertificacionDelRequisito';
import { BotonDeAccion } from './BotonDeAccion';
import type { AccionRequisito } from './requisitos';

/**
 * La acción del requisito «Certificación bancaria» (CB-8): en vez de subir un documento suelto, abre la elección de la cuenta a la que pertenece la certificación, que se sube con
 * ella y se propone a la empresa. Con el mismo aspecto que la acción de los demás documentos (`variant` la deja de borde cuando es la menos urgente).
 */
export function AccionCertificacionBancaria({ accion, vinculoId, empresa, variant }: { accion: Exclude<AccionRequisito, null>; vinculoId: string | null; empresa: string; variant?: 'contained' | 'outlined' }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <BotonDeAccion onClick={() => setAbierto(true)} icono={Landmark} variant={variant}>
        {t(`expediente.documentos.bancaria.acciones.${accion}`)}
      </BotonDeAccion>
      {abierto && <DialogoCertificacionDelRequisito vinculoId={vinculoId} empresa={empresa} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
