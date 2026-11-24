import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link, Stack, Typography } from '@mui/material';
import type { RelacionEntreTercerosDto } from '@validalo/api-client';
import { EstadoVacio } from '@validalo/ui';
import { Plus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router';
import { CabeceraPagina, ErrorRecuperable, EsqueletoTarjetas } from '../shared/componentes';
import { mensajeDeError } from '../shared/errores';
import { useAvisos } from '../shared/useAvisos';
import { useRelaciones, useTerminarRelacion } from './api';
import { DialogoDeclararPersona } from './DialogoDeclararPersona';
import { esRol, propuestasDe, vigentesPorRol } from './modelo';
import { TarjetaPersona } from './TarjetaPersona';
import { TarjetaPropuesta } from './TarjetaPropuesta';

/** Confirmar que se quita a una persona que el tercero declaró a mano. Sus documentos siguen en su bóveda. */
function DialogoQuitar({ relacion, onCerrar }: { relacion: RelacionEntreTercerosDto; onCerrar: () => void }) {
  const { t } = useTranslation();
  const mostrar = useAvisos((s) => s.mostrar);
  const terminar = useTerminarRelacion();
  const rol = (esRol(relacion.tipo) ? t(`personas.roles.${relacion.tipo}`) : relacion.tipo).toLowerCase();
  return (
    <Dialog open onClose={terminar.isPending ? undefined : onCerrar} fullWidth maxWidth="xs" aria-labelledby="titulo-quitar-persona">
      <DialogTitle id="titulo-quitar-persona">{t('personas.terminar.titulo', { nombre: relacion.nombre })}</DialogTitle>
      <DialogContent>
        {terminar.isError && <Alert severity="error" sx={{ mb: 1.5 }}>{mensajeDeError(terminar.error, t)}</Alert>}
        <DialogContentText>{t('personas.terminar.texto', { nombre: relacion.nombre, rol })}</DialogContentText>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCerrar} disabled={terminar.isPending}>
          {t('comun.cancelar')}
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={terminar.isPending}
          onClick={() =>
            terminar.mutate(relacion.id, {
              onSuccess: () => {
                mostrar(t('personas.terminar.hecha', { nombre: relacion.nombre, rol }));
                onCerrar();
              },
            })
          }
        >
          {t('personas.terminar.confirmar')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Personas relacionadas del tercero (ADR-0010): representantes, suplentes, socios, beneficiarios finales y miembros, cada uno con su
 * bóveda. Arriba, lo que la IA detectó en la Cámara de comercio y espera que el tercero confirme o descarte; luego las vigentes por rol,
 * con el estado de la cédula y los antecedentes de cada una y la acción de subirlos.
 */
export function PaginaPersonas() {
  const { t } = useTranslation();
  const consulta = useRelaciones();
  const [agregando, setAgregando] = useState(false);
  const [quitando, setQuitando] = useState<RelacionEntreTercerosDto | null>(null);
  // Los representantes legales, suplentes y socios se registran en la información legal: la cabecera lo dice y lleva allí.
  const sub = (
    <>
      {t('personas.sub')}{' '}
      <Link component={RouterLink} to="/ficha/legal">
        {t('personas.irAFicha')}
      </Link>
    </>
  );
  const agregar = (
    <Button variant="contained" onClick={() => setAgregando(true)} startIcon={<Plus size={18} aria-hidden />} sx={{ width: { xs: '100%', sm: 'auto' } }}>
      {t('personas.agregar')}
    </Button>
  );

  if (consulta.isPending) {
    return (
      <>
        <CabeceraPagina titulo={t('personas.titulo')} sub={sub} />
        <EsqueletoTarjetas cantidad={2} />
      </>
    );
  }
  if (consulta.isError) {
    return (
      <>
        <CabeceraPagina titulo={t('personas.titulo')} sub={sub} />
        <ErrorRecuperable error={consulta.error} onReintentar={() => void consulta.refetch()} />
      </>
    );
  }

  const propuestas = propuestasDe(consulta.data);
  const grupos = vigentesPorRol(consulta.data);
  return (
    <>
      <CabeceraPagina titulo={t('personas.titulo')} sub={sub} accion={agregar} />
      {propuestas.length > 0 && (
        <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, mb: 2.5, p: 0 }} aria-label={t('personas.propuesta.titulo')}>
          {propuestas.map((p) => (
            <TarjetaPropuesta key={p.id} relacion={p} />
          ))}
        </Stack>
      )}
      {grupos.length === 0 ? (
        <EstadoVacio
          icono={UsersRound}
          titulo={t('personas.vacio')}
          texto={t('personas.vacioTexto')}
          accion={
            <Button component={RouterLink} to="/ficha/legal" variant="outlined">
              {t('personas.irAFicha')}
            </Button>
          }
        />
      ) : (
        <Stack spacing={3}>
          {grupos.map(({ rol, personas }) => (
            <Box component="section" key={rol} aria-labelledby={`personas-${rol}`}>
              <Typography id={`personas-${rol}`} component="h2" variant="h6" sx={{ mb: 1 }}>
                {t(`personas.rolPlural.${rol}`)}
              </Typography>
              <Stack component="ul" spacing={1.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {personas.map((r) => (
                  <TarjetaPersona key={r.id} relacion={r} onQuitar={setQuitando} />
                ))}
              </Stack>
            </Box>
          ))}
        </Stack>
      )}
      {agregando && <DialogoDeclararPersona onCerrar={() => setAgregando(false)} />}
      {quitando && <DialogoQuitar relacion={quitando} onCerrar={() => setQuitando(null)} />}
    </>
  );
}
