import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import type { DocumentoDePersonaDto } from '@validalo/api-client';
import { formatearFecha } from '@validalo/ui';
import { FileText, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { solicitudDeDocumentoDePersona } from './modelo';

const ESTADOS_DE_VERSION = ['Actual', 'EnAnalisis', 'Recibida', 'Devuelta', 'Superada', 'Vencida', 'Retirada'] as const;
type EstadoDeVersion = (typeof ESTADOS_DE_VERSION)[number];
const esEstadoDeVersion = (valor: string): valor is EstadoDeVersion => (ESTADOS_DE_VERSION as readonly string[]).includes(valor);

/**
 * Un documento de la bóveda de la persona: su estado y la acción de subirlo (o subir otra versión), que abre el diálogo de subida. Lo que pide una
 * empresa va destacado. Lo usan la tarjeta de la persona (todos sus documentos) y «Mi bóveda» (los ya cargados).
 */
export function FilaDeDocumento({ documento, personaId }: { documento: DocumentoDePersonaDto; personaId: string }) {
  const { t } = useTranslation();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const nombre = documento.tipoCanonico === 'CEDULA' || documento.tipoCanonico === 'PASAPORTE' || documento.tipoCanonico === 'CERTIFICADO_ANTECEDENTES'
    ? t(`personas.documentos.${documento.tipoCanonico}`)
    : documento.nombre;
  const tiene = documento.version !== null && documento.estado !== null;
  return (
    // El documento, su estado y su acción en una fila; en el celular la acción baja a su propia línea (no caben las tres cosas en 340 px).
    <Box
      component="li"
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', sm: 'minmax(0, 1fr) auto auto' },
        gridTemplateAreas: { xs: '"doc est" "acc acc"', sm: '"doc est acc"' },
        columnGap: 1.25,
        alignItems: 'center',
        py: 0.75,
        minHeight: 44,
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ gridArea: 'doc', alignItems: 'center', minWidth: 0 }}>
        <Box sx={{ color: 'text.secondary', display: 'flex' }} aria-hidden>
          <FileText size={16} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" component="p">{nombre}</Typography>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
            {tiene && documento.cargadaEn
              ? t('personas.documentos.cargado', { n: String(documento.version), fecha: formatearFecha(documento.cargadaEn) })
              : documento.pedido
                ? t('personas.documentos.pedido')
                : t('personas.documentos.sinCargar')}
          </Typography>
        </Box>
      </Stack>
      {tiene && documento.estado && (
        <Chip
          size="small"
          variant="outlined"
          label={esEstadoDeVersion(documento.estado) ? t(`personas.documentos.estado.${documento.estado}`) : documento.estado}
          sx={{ gridArea: 'est', justifySelf: 'start' }}
        />
      )}
      <Button
        onClick={() => abrirSubida(solicitudDeDocumentoDePersona(personaId, documento.tipoCanonico, nombre))}
        size="small"
        variant={documento.pedido && documento.estado !== 'Actual' ? 'contained' : 'text'}
        startIcon={<Upload size={16} aria-hidden />}
        aria-label={`${t(tiene ? 'personas.documentos.reemplazar' : 'personas.documentos.subir')}: ${nombre}`}
        sx={{ gridArea: 'acc', justifySelf: { xs: 'start', sm: 'end' }, ml: { xs: 2.5, sm: 0 } }}
      >
        {t(tiene ? 'personas.documentos.reemplazar' : 'personas.documentos.subir')}
      </Button>
    </Box>
  );
}
