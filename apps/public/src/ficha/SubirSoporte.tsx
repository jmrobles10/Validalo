import { Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { tipoSubible } from '../boveda/catalogo';
import type { VersionSubida } from '../boveda/subida';
import { useDialogoSubir } from '../boveda/useDialogoSubir';
import { SOPORTE_FICHA, type DocumentoDeSoporte, type DocumentosParaSubir } from './secciones';

interface Props {
  /** Los documentos de la sección que se pueden elegir (`documentosParaSubir`), sin «Otro documento», que va siempre al final. */
  documentos: DocumentosParaSubir['natural'];
  deshabilitado: boolean;
  /** El documento terminó de subirse (con el diálogo aún abierto): la sección lo marca como soporte y, si es de los que se leen, espera su lectura. */
  onSubido: (subida: VersionSubida, tipo: DocumentoDeSoporte) => void;
}

/**
 * «Subir un soporte» (FD-10): el tercero indica qué documento es y se sube por el diálogo de subida de siempre, con ese tipo canónico, como un documento
 * global de su bóveda (versión nueva si ya lo tenía). Con un solo documento posible en la sección (el RUT en la tributaria) va preseleccionado y no hay
 * nada que elegir; con varios no se supone cuál es, porque un RUT guardado como Cámara no se lee. «Otro documento» queda al final para lo que no es
 * ninguno: conserva el soporte genérico, sin lectura. En una sección sin documentos propios (SST, Especialidades) no se pregunta: es siempre ese soporte.
 */
export function SubirSoporte({ documentos, deshabilitado, onSubido }: Props) {
  const { t } = useTranslation();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const opciones: readonly DocumentoDeSoporte[] = [...documentos, SOPORTE_FICHA];
  const [elegido, setElegido] = useState<DocumentoDeSoporte | ''>(documentos.length === 1 ? (documentos[0] ?? '') : '');
  const conPregunta = documentos.length > 0;
  const tipo = conPregunta ? elegido : SOPORTE_FICHA;

  const subir = () => {
    if (tipo === '') return;
    abrirSubida({ tipo, nombre: t(`ficha.soporte.tipos.${tipo}.nombre`), alSubir: (subida) => onSubido(subida, tipo) });
  };

  return (
    <Stack spacing={1} sx={{ mt: 1.5 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap sx={{ alignItems: { sm: 'flex-start' }, flexWrap: { sm: 'wrap' } }}>
        {conPregunta && (
          <TextField
            select
            label={t('ficha.soporte.queDocumento')}
            value={elegido}
            onChange={(e) => setElegido(opciones.find((o) => o === e.target.value) ?? '')}
            helperText={elegido === SOPORTE_FICHA ? t('ficha.soporte.otroAyuda') : (tipoSubible(elegido)?.ayuda ?? t('ficha.soporte.queDocumentoAyuda'))}
            disabled={deshabilitado}
            sx={{ flex: { sm: '1 1 280px' }, maxWidth: { sm: 440 } }}
          >
            {opciones.map((codigo) => (
              <MenuItem key={codigo} value={codigo}>
                {t(`ficha.soporte.tipos.${codigo}.opcion`)}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Button
          onClick={subir}
          disabled={deshabilitado || tipo === ''}
          variant={conPregunta ? 'outlined' : 'text'}
          startIcon={<Upload size={18} aria-hidden />}
          sx={{ flex: 'none' }}
        >
          {t('ficha.soporte.subir')}
        </Button>
      </Stack>
      <Typography sx={{ color: 'text.secondary' }}>{t('ficha.soporte.subirAyuda')}</Typography>
    </Stack>
  );
}
