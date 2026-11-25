import { Button, Chip } from '@mui/material';
import type { RequisitoExpedienteDto } from '@validalo/api-client';
import { MarcoDeTarjetaDeEstado, textoDelPorQue } from '@validalo/ui';
import { ClipboardList, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { textoDelRequisito } from '../../personas/modelo';
import { aparienciaParaElRevisor } from '../requisitosAgrupados';

interface Props {
  requisito: RequisitoExpedienteDto;
  /** Quien mira puede eximirlo. */
  puedeEximir: boolean;
  onEximir: () => void;
}

/**
 * Un requisito que el tercero aún no carga, como tarjeta compacta del mismo marco que las demás y de una sola fila: el ícono gris (más tenue si es opcional), su nombre (con de
 * quién es, si es el documento de una persona relacionada) y «Pendiente del tercero» en texto secundario; a la derecha, centrados frente a ese bloque, «Opcional» como chip solo si lo
 * es (lo obligatorio es lo normal) y «Eximir» para quien puede. Sin fila de pie: con un título de dos líneas la tarjeta crece solo por el título. No tiene versión, lectura ni áreas que
 * mostrar: qué áreas revisan lo dice el resumen de arriba del panel, una sola vez.
 */
export function TarjetaDePendiente({ requisito, puedeEximir, onEximir }: Props) {
  const { t } = useTranslation();
  const apariencia = aparienciaParaElRevisor(requisito);
  const persona = textoDelRequisito(requisito.persona, t);
  const porQue = requisito.porQue && requisito.porQue.length > 0 ? t('expedientes.requisitos.porQue', { motivos: textoDelPorQue(requisito.porQue) }) : undefined;
  return (
    <MarcoDeTarjetaDeEstado
      compacta
      icono={requisito.seccion ? ClipboardList : FileText}
      tono={apariencia.tono}
      tenue={apariencia.tenue}
      titulo={requisito.tipoDocumento.nombre}
      persona={persona ? <span data-persona-del-requisito="">{persona}</span> : undefined}
      meta={<span title={porQue}>{t('expedientes.requisitos.pendienteDelTercero')}</span>}
      chip={requisito.obligatorio ? undefined : <Chip size="small" variant="outlined" label={t('expedientes.requisitos.opcional')} />}
      accionesDeCabecera={
        puedeEximir ? (
          <Button variant="text" onClick={onEximir} sx={{ color: 'text.secondary' }}>
            {t('expedientes.requisitos.eximirAccion')}
          </Button>
        ) : undefined
      }
    />
  );
}
