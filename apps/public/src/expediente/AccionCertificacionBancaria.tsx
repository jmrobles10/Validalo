import { Button } from '@mui/material';
import { Landmark } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogoCertificacionDelRequisito } from './DialogoCertificacionDelRequisito';
import { propiedadesDeLaAccion, type AccionRequisito } from './requisitos';

/**
 * La acción del requisito «Certificación bancaria» (CB-8): en vez de subir un documento suelto, abre la elección de la cuenta a la que pertenece la certificación, que se sube con
 * ella y se propone a la empresa. Con el mismo aspecto que la acción de los demás documentos.
 */
export function AccionCertificacionBancaria({ accion, vinculoId, empresa }: { accion: Exclude<AccionRequisito, null>; vinculoId: string | null; empresa: string }) {
  const { t } = useTranslation();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Button onClick={() => setAbierto(true)} {...propiedadesDeLaAccion(accion)} startIcon={<Landmark size={16} aria-hidden />}>
        {t(`expediente.documentos.bancaria.acciones.${accion}`)}
      </Button>
      {abierto && <DialogoCertificacionDelRequisito vinculoId={vinculoId} empresa={empresa} onCerrar={() => setAbierto(false)} />}
    </>
  );
}
