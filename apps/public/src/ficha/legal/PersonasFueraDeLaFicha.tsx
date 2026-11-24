import { Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRelaciones } from '../../personas/api';
import { useSesionTercero } from '../../sesion/sesionTercero';
import { usePropuestasDeSeccion } from '../api';
import type { PersonaRelacionada } from '../tipos';
import { esRol, relacionesFueraDeLaFicha, personaDesdeRelacion } from './personas';

/** Aviso con las personas registradas en Personas que faltan en la información legal, cada una con «Agregar aquí». */
export function PersonasFueraDeLaFicha({ personas, onAgregar, deshabilitado }: { personas: readonly PersonaRelacionada[]; onAgregar: (persona: PersonaRelacionada) => void; deshabilitado: boolean }) {
  const { t } = useTranslation();
  const completa = useSesionTercero((s) => s.sesion?.aislada !== true);
  const { data } = useRelaciones(completa);
  // La misma consulta que el aviso de documentos más nuevos (sale de la caché, no pide de nuevo).
  const propuestas = usePropuestasDeSeccion('FICHA_LEGAL', null);
  const faltan = relacionesFueraDeLaFicha(data ?? [], personas, propuestas.data ?? []);
  if (faltan.length === 0) return null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5, border: 0, bgcolor: 'superficie.nivel2' }}>
      <Typography variant="subtitle2" component="p">
        {t('ficha.legal.fueraDeLaFicha')}
      </Typography>
      <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mb: 1 }}>
        {t('ficha.legal.fueraDeLaFichaAyuda')}
      </Typography>
      <Stack component="ul" spacing={0.75} sx={{ p: 0, m: 0, listStyle: 'none' }}>
        {faltan.map((r) => (
          <Stack key={r.id} component="li" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body2">{r.nombre}</Typography>
              <Typography variant="caption" component="p" sx={{ color: 'text.secondary' }}>
                {[esRol(r.tipo) ? t(`ficha.legal.roles.${r.tipo}`) : r.tipo, `${r.identificacion.tipo} ${r.identificacion.numero}`].join(' · ')}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="outlined"
              startIcon={<Plus size={16} aria-hidden />}
              onClick={() => onAgregar(personaDesdeRelacion(r))}
              disabled={deshabilitado}
              aria-label={t('ficha.legal.agregarALaFichaAccesible', { nombre: r.nombre })}
            >
              {t('ficha.legal.agregarALaFicha')}
            </Button>
          </Stack>
        ))}
      </Stack>
    </Paper>
  );
}
