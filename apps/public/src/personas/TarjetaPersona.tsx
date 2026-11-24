import { Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import type { RelacionEntreTercerosDto } from '@validalo/api-client';
import { ChipEstado } from '@validalo/ui';
import { Pencil, UserRoundX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { FilaDeDocumento } from './FilaDeDocumento';
import { comoNumero, documentosPorSubir, esRol, seRegistraEnLaFicha } from './modelo';

/**
 * Una persona relacionada con el tercero: quién es, cómo se relaciona (principal, participación, cargo) y los documentos de su bóveda. Los representantes
 * legales, suplentes y socios se registran en la información legal (el único lugar para ellos): la tarjeta lleva allí y no los quita. «Quitar» solo se
 * ofrece si la declaró el tercero a mano (un beneficiario final, un miembro de consorcio o, de antes de esta regla, otra persona).
 */
export function TarjetaPersona({ relacion, onQuitar }: { relacion: RelacionEntreTercerosDto; onQuitar: (relacion: RelacionEntreTercerosDto) => void }) {
  const { t } = useTranslation();
  const rol = esRol(relacion.tipo) ? t(`personas.roles.${relacion.tipo}`) : relacion.tipo;
  const participacion = comoNumero(relacion.participacion);
  const faltan = documentosPorSubir(relacion);
  const documento = `${relacion.identificacion.tipo} ${relacion.identificacion.numero}`;

  return (
    <Paper variant="outlined" component="li" sx={{ p: { xs: 1.5, sm: 2 }, listStyle: 'none' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', flexWrap: 'wrap', rowGap: 0.5 }}>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h3" variant="subtitle1" sx={{ overflowWrap: 'anywhere' }}>
            {relacion.nombre}
          </Typography>
          <Typography sx={{ color: 'text.secondary' }}>
            {documento} · {rol}
            {participacion !== null && ` · ${t('personas.participacion', { valor: participacion.toLocaleString('es-CO') })}`}
            {relacion.cargo && ` · ${t('personas.cargo', { cargo: relacion.cargo })}`}
          </Typography>
        </Box>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          {relacion.principal && <ChipEstado estado="Activo" size="medium" etiqueta={t('personas.principal')} />}
          {faltan > 0 && <Chip size="small" color="warning" variant="outlined" label={t('personas.documentos.pedido')} />}
        </Stack>
      </Stack>

      <Box component="ul" sx={{ listStyle: 'none', m: 0, mt: 1, p: 0, borderTop: 1, borderColor: 'divider' }} aria-label={t('personas.documentos.titulo', { nombre: relacion.nombre })}>
        {relacion.documentos.map((d) => (
          <FilaDeDocumento key={d.tipoCanonico} documento={d} personaId={relacion.personaId} />
        ))}
      </Box>

      {relacion.deFicha ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
          <Typography variant="caption" component="p" sx={{ color: 'text.secondary', flex: 1, minWidth: 220 }}>{t('personas.deFicha')}</Typography>
          <Button component={RouterLink} to="/ficha/legal" size="small" startIcon={<Pencil size={16} aria-hidden />}>
            {t('personas.editarEnLaFicha')}
          </Button>
        </Stack>
      ) : (
        <>
          {seRegistraEnLaFicha(relacion.tipo) && (
            <Typography variant="caption" component="p" sx={{ color: 'text.secondary', mt: 0.5 }}>{t('personas.fueraDeLaFicha')}</Typography>
          )}
          <Button color="error" size="small" startIcon={<UserRoundX size={16} aria-hidden />} onClick={() => onQuitar(relacion)} sx={{ mt: 0.5 }}>
            {t('personas.terminar.boton')}
          </Button>
        </>
      )}
    </Paper>
  );
}
