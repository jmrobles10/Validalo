import { Alert, Divider, Stack, Typography } from '@mui/material';
import type { EmpresaDto } from '@validalo/api-client';
import { Dato, RejillaDatos } from '@validalo/ui';
import { Building2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tarjeta } from '../../../shared/componentes';
import { EstadoActivo } from '../EstadoActivo';
import { ejemploFolio, identificacionVisible } from './modelo';
import { TextosLegalesEmpresa } from './TextosLegalesEmpresa';

interface Props {
  empresa: EmpresaDto;
  puedeLeerTextos: boolean;
  puedeEscribirTextos: boolean;
}

/** El detalle de la empresa elegida en la lista: su identificación, su prefijo y su estado, y sus textos legales versionados. */
export function DetalleEmpresa({ empresa, puedeLeerTextos, puedeEscribirTextos }: Props) {
  const { t } = useTranslation();

  return (
    <Tarjeta
      etiqueta={empresa.nombre}
      titulo={empresa.nombre}
      icono={Building2}
      acciones={<EstadoActivo activo={empresa.activa} texto={empresa.activa ? t('empresasGrupo.activa') : t('empresasGrupo.inactiva')} />}
    >
      <Stack spacing={2.5}>
        <RejillaDatos columnas={2}>
          <Dato etiqueta={t('empresasGrupo.columnas.identificacion')}>
            <Typography component="span" variant="mono">
              {identificacionVisible(empresa.identificacion)} · {empresa.identificacion.pais}
            </Typography>
          </Dato>
          <Dato etiqueta={t('empresasGrupo.columnas.prefijo')}>
            <Typography component="span" variant="mono">
              {empresa.prefijoFolio}
            </Typography>
            <Typography component="span" variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
              {t('empresasGrupo.ejemploFolio', { folio: ejemploFolio(empresa.prefijoFolio, new Date().getFullYear()) })}
            </Typography>
          </Dato>
        </RejillaDatos>
        {!empresa.activa && <Alert severity="info">{t('empresasGrupo.inactivaAyuda')}</Alert>}
        {puedeLeerTextos && (
          <>
            <Divider />
            <TextosLegalesEmpresa key={empresa.id} empresa={empresa} puedeLeer={puedeLeerTextos} puedeEscribir={empresa.activa && puedeEscribirTextos} />
          </>
        )}
      </Stack>
    </Tarjeta>
  );
}
