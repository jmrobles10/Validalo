import { Accordion, AccordionDetails, AccordionSummary, Box, Typography } from '@mui/material';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/**
 * «¿Cómo funciona?» como bloque plegable al final de la página, a todo el ancho: qué cuenta como una validación, qué incluye el costo de IA, qué pasa al agotar el cupo y
 * cuándo llegan los avisos (IA-3, IA-4). Plegado por omisión: es ayuda, no lo primero que se lee.
 */
export function AyudaUsoIa() {
  const { t } = useTranslation();
  return (
    <Accordion>
      <AccordionSummary expandIcon={<ChevronDown size={18} strokeWidth={1.75} aria-hidden />} aria-controls="ayuda-uso-ia" id="titulo-ayuda-ia">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Box aria-hidden sx={{ display: 'inline-flex', color: (th) => th.palette.acento.main }}>
            <CircleHelp size={18} strokeWidth={1.75} />
          </Box>
          <Typography variant="subtitle1" component="span">
            {t('ia.uso.comoFunciona')}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails>
        <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'text.secondary', '& li': { mb: 0.5 }, '& li:last-child': { mb: 0 } }}>
          <Typography component="li" variant="body2">
            {t('ia.uso.ayudaValidacion')}
          </Typography>
          <Typography component="li" variant="body2">
            {t('ia.uso.ayudaCosto')}
          </Typography>
          <Typography component="li" variant="body2">
            {t('ia.uso.ayudaEstimacion')}
          </Typography>
          <Typography component="li" variant="body2">
            {t('ia.uso.ayudaCupo')}
          </Typography>
          <Typography component="li" variant="body2">
            {t('ia.uso.ayudaAvisos')}
          </Typography>
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}
