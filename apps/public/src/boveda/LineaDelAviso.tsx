import { Box, Button, Stack, Typography } from '@mui/material';
import { Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChipVigencia } from '../vigencia/ChipVigencia';
import { DetalleVencimientos } from './DetalleVencimientos';
import type { LineaPorRenovar } from './porRenovar';
import { useDialogoSubir } from './useDialogoSubir';

/**
 * Una línea del bloque «Por renovar»: el chip de vigencia, el documento con lo que pasa y las acciones («Subir versión nueva» y, cuando la
 * línea resume muchas empresas, «Ver empresas», que abre debajo la fecha de cada una).
 */
export function LineaDelAviso({ linea }: { linea: LineaPorRenovar }) {
  const { t } = useTranslation();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const [abierta, setAbierta] = useState(false);
  const idDetalle = `por-renovar-${linea.documentoId}`;
  const empresas = linea.empresas;
  const subir = linea.subir;

  return (
    <Box component="li" sx={{ py: 0.5, pl: { sm: 4.25 }, listStyle: 'none' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, columnGap: 2, rowGap: 0.25 }}>
        <Box sx={{ minWidth: 0, flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 1, rowGap: 0.25 }}>
          <ChipVigencia vigencia={linea.vigencia} />
          <Typography component="span" sx={{ minWidth: 0 }}>
            <Box component="strong" sx={{ typography: 'subtitle2' }}>{`${linea.documento}:`}</Box> {linea.texto}
          </Typography>
        </Box>
        <Stack direction="row" sx={{ flex: 'none', flexWrap: 'wrap', alignItems: 'center', ml: { xs: -1, sm: 0 } }}>
          {empresas && (
            <Button
              variant="text"
              size="small"
              onClick={() => setAbierta((v) => !v)}
              aria-expanded={abierta}
              aria-controls={abierta ? idDetalle : undefined}
              aria-label={`${abierta ? t('boveda.porRenovar.ocultarEmpresas') : t('boveda.porRenovar.verEmpresas')}: ${linea.documento}`}
            >
              {abierta ? t('boveda.porRenovar.ocultarEmpresas') : t('boveda.porRenovar.verEmpresas')}
            </Button>
          )}
          {subir && (
            <Button
              onClick={() => abrirSubida(subir)}
              variant="text"
              startIcon={<Upload size={16} aria-hidden />}
              aria-label={`${t('boveda.porRenovar.subir')}: ${linea.documento}`}
              size="small"
            >
              {t('boveda.porRenovar.subir')}
            </Button>
          )}
        </Stack>
      </Stack>
      {abierta && empresas && (
        <Box sx={{ mt: 0.75, mb: 0.5 }}>
          <DetalleVencimientos id={idDetalle} empresas={empresas} cierre={linea.cierre} />
        </Box>
      )}
    </Box>
  );
}
