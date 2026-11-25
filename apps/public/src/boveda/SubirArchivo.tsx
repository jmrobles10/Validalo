import { Alert, Box, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { FaltaParaEnviar } from '@validalo/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CamposFormulario } from '../formulario/CamposFormulario';
import { camposDe, valoresIniciales } from '../formulario/formulario';
import { useFormulario } from '../formulario/useFormulario';
import { useSesionTercero } from '../sesion/sesionTercero';
import { useBoveda, type RequisitoEnContexto } from '../shared/api';
import { CabeceraPagina, EsqueletoTarjetas } from '../shared/componentes';
import { modoDe, reglasDe } from '../tipoDocumento/reglas';
import { Plantilla } from '../tipoDocumento/Plantilla';
import { tipoSubible, TIPOS_SUBIBLES } from './catalogo';
import { Dropzone } from './Dropzone';
import { EstadoDeSubida } from './EstadoDeSubida';
import { MarcoDelDialogoSubir } from './MarcoDelDialogoSubir';
import { destinoFijo, rutaSegura } from './parametrosSubida';
import { REGLAS_GLOBALES, type DestinoCarga, type VersionSubida } from './subida';
import { useSubida } from './useSubida';

/**
 * Subir el archivo de un documento. Con el requisito de la revisión (`delRequisito`) aplica las reglas de su tipo
 * (formatos, tamaño, páginas), ofrece su plantilla y, en un tipo `ArchivoYFormulario`, pide sus campos antes del archivo.
 * Es el contenido de la página `/boveda/subir` y, con `onCerrar`, el del diálogo de subida: ahí no navega a ningún lado (al terminar bien dice
 * «Listo» y cierra) y no se puede cerrar mientras sube.
 */
export function SubirArchivo({
  parametros,
  delRequisito,
  onCerrar,
  alSubir,
}: {
  parametros: URLSearchParams;
  delRequisito: RequisitoEnContexto | null;
  /** Presente solo en el diálogo: lo cierra. */
  onCerrar?: () => void;
  /** Presente solo en el diálogo: se llama con la versión que quedó en la bóveda cuando la subida termina bien. */
  alSubir?: (subida: VersionSubida) => void;
}) {
  const { t } = useTranslation();
  const documentoId = parametros.get('documento');
  const fijo = destinoFijo(parametros);
  const volver = onCerrar ? null : rutaSegura(parametros.get('volver'));
  // Solo se lee la bóveda para resubir sobre un documento suyo: subir lo que pide una empresa no la necesita (y una sesión aislada no la alcanza).
  const boveda = useBoveda(Boolean(documentoId));
  const [tipoElegido, setTipoElegido] = useState(parametros.get('tipo') ?? '');
  const aislada = useSesionTercero((s) => s.sesion?.aislada === true);
  const { estado, subir, cancelar, reiniciar } = useSubida(alSubir);
  const tipoRequisito = delRequisito?.requisito.tipoDocumento ?? null;
  const campos = modoDe(tipoRequisito) === 'ArchivoYFormulario' ? camposDe(tipoRequisito) : [];
  const formulario = useFormulario(campos, true, valoresIniciales(campos, delRequisito?.requisito.versionActual?.datosDeclarados));

  const existente = documentoId ? boveda.data?.documentos.find((d) => d.id === documentoId) : undefined;
  if (documentoId && boveda.isPending) {
    return onCerrar ? (
      <MarcoDelDialogoSubir titulo={t('subir.titulo')} onCerrar={onCerrar}>
        <EsqueletoTarjetas cantidad={1} />
      </MarcoDelDialogoSubir>
    ) : (
      <EsqueletoTarjetas cantidad={1} />
    );
  }

  const destino: DestinoCarga | null = fijo
    ? fijo.destino
    : existente
      ? existente.ambito === 'Global' || !existente.tipo.tipoDocumentoTenantId || !existente.vinculoId
        ? { tipoCanonico: existente.tipo.codigo }
        : { tipoDocumentoTenantId: existente.tipo.tipoDocumentoTenantId, vinculoId: existente.vinculoId }
      : tipoElegido
        ? { tipoCanonico: tipoElegido }
        : null;
  const reglas = tipoRequisito ? reglasDe(tipoRequisito.archivo) : REGLAS_GLOBALES;
  const nombreTipo = fijo?.nombre ?? existente?.tipo.nombre ?? tipoSubible(tipoElegido)?.nombre ?? null;
  const tituloFijo = fijo ? fijo.nombre : existente?.tipo.nombre;
  const titulo = fijo ? t('subir.tituloDocumento', { tipo: fijo.nombre }) : tituloFijo ? t('subir.tituloNueva', { tipo: tituloFijo }) : t('subir.titulo');
  const ayuda = tipoRequisito?.textoAyuda ?? undefined;
  const ocupado = estado.fase === 'en-curso';
  const mostrarZona = estado.fase === 'inicio' || estado.fase === 'problema';
  const conCampos = campos.length > 0 && estado.fase !== 'resultado';
  const empresa = delRequisito?.expediente.empresa.nombre ?? '';
  const extras = () => ({ reglas, datos: campos.length > 0 ? formulario.datos() : null, alFallar: formulario.marcarError });

  const cuerpo = (
    <Stack spacing={2}>
      {aislada && empresa !== '' && <Alert severity="info">{t('accesoAislado.aviso.enSubida', { empresa })}</Alert>}
      {!existente && !fijo && (
        <TextField
          select
          label={t('subir.tipo')}
          value={tipoElegido}
          onChange={(e) => setTipoElegido(e.target.value)}
          helperText={tipoSubible(tipoElegido)?.ayuda ?? t('subir.tipoAyuda')}
          disabled={ocupado}
          fullWidth
        >
          {TIPOS_SUBIBLES.map((tipo) => (
            <MenuItem key={tipo.codigo} value={tipo.codigo}>
              {tipo.nombre}
            </MenuItem>
          ))}
        </TextField>
      )}

      {delRequisito && tipoRequisito?.tienePlantilla && mostrarZona && (
        <Plantilla expedienteId={delRequisito.expediente.id} requisitoId={delRequisito.requisito.id} empresa={empresa} />
      )}

      {conCampos && (
        <Box component="section" aria-labelledby="titulo-datos-archivo">
          <Typography id="titulo-datos-archivo" component={onCerrar ? 'h3' : 'h2'} variant="h6">
            {t('subir.datosDelArchivo')}
          </Typography>
          <Typography sx={{ color: 'text.secondary', mb: 1.5 }}>{t('subir.datosAyuda', { empresa })}</Typography>
          <CamposFormulario campos={campos} formulario={formulario} deshabilitado={ocupado} />
        </Box>
      )}

      {estado.fase !== 'inicio' && (
        <EstadoDeSubida
          estado={estado}
          tipo={nombreTipo ?? ''}
          reglas={reglas}
          onCancelar={cancelar}
          onReintentar={estado.fase === 'fallo' && destino && formulario.completo ? () => subir(estado.archivo, destino, extras()) : undefined}
          onOtroArchivo={reiniciar}
          volver={volver}
          onListo={onCerrar}
        />
      )}

      {mostrarZona && (
        <Box>
          <Dropzone
            titulo={nombreTipo ? t('subir.zona', { tipo: nombreTipo }) : t('subir.zonaSinTipo')}
            deshabilitado={!destino || !formulario.completo}
            reglas={reglas}
            onArchivo={(archivo) => destino && subir(archivo, destino, extras())}
          />
          {formulario.falta && (
            <Box sx={{ mt: 1 }}>
              <FaltaParaEnviar>{formulario.falta}</FaltaParaEnviar>
            </Box>
          )}
        </Box>
      )}
    </Stack>
  );

  if (onCerrar) {
    return (
      <MarcoDelDialogoSubir titulo={titulo} sub={ayuda} ocupado={ocupado} onCerrar={onCerrar}>
        {cuerpo}
      </MarcoDelDialogoSubir>
    );
  }

  return (
    // Una zona de carga y un formulario corto no se estiran a 1400 px: la pantalla entera (título incluido) va en una columna centrada.
    <Box sx={{ maxWidth: 760, mx: 'auto' }}>
      <CabeceraPagina titulo={titulo} sub={ayuda} />
      {cuerpo}
    </Box>
  );
}
