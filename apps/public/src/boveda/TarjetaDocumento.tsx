import { Box, Button, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Stack, Typography } from '@mui/material';
import type { DocumentoBovedaDto, VersionDocumentoDto } from '@validalo/api-client';
import { formatearFecha } from '@validalo/ui';
import { Archive, Download, EllipsisVertical, FileText, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { estadoDeVigencia, textoSinVencimiento, textoVigencia } from '../vigencia/vigencia';
import { ChipDeVersion } from './ChipDeVersion';
import { COLUMNAS_DOCUMENTO } from './columnas';
import { DetalleEmpresas } from './DetalleEmpresas';
import { DialogoRetirar } from './DialogoRetirar';
import { EmpresasDelDocumento } from './EmpresasDelDocumento';
import { BOTON_DE_TEXTO_PEQUENO } from './estilos';
import { comparticionesDeLaEmpresa, resumirEmpresas } from './resumenEmpresas';
import { useDescargar } from './useDescargar';
import { useDialogoSubir } from './useDialogoSubir';
import {
  empresaConLaFechaMasProxima,
  sePuedeDescargar,
  sePuedeRetirar,
  sePuedeSubirVersion,
  solicitudDeNuevaVersion,
  venceEnCabecera,
} from './versiones';
import { VersionesDocumento } from './VersionesDocumento';

/** El ícono del documento y el espacio hasta su nombre: las versiones desplegadas se indentan a ese nivel. */
const TAMANO_ICONO = 28;
const SEPARACION_ICONO = 12;

/**
 * Un documento de la bóveda como **una fila** de la lista, alineada en columnas como una tabla: el documento (con su versión, cuándo se
 * cargó y cuándo vence en una línea gris), su estado en un solo chip, las empresas y las acciones («Subir versión» y el menú «…»).
 * Con pocas empresas (`MAXIMO_EMPRESAS_POR_NOMBRE`) cada una es un chip compacto («Norte · aprobada v1») con la frase larga en
 * el tooltip y, si pide algo del tercero (corregir, revalidar, subir), en una línea breve bajo su chip. Con más, la columna es un resumen
 * por estado («24 aprobadas», «3 revalidan») que abre el detalle bajo la fila. Con una empresa elegida en el filtro de la bóveda
 * (`empresaId`), la columna dice solo lo de esa empresa. En el celular las columnas se apilan. El aviso de «por vencer» vive en el bloque
 * «Por renovar» de arriba: aquí solo está el chip.
 */
export function TarjetaDocumento({ documento, empresaId = null }: { documento: DocumentoBovedaDto; empresaId?: string | null }) {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [retirando, setRetirando] = useState<VersionDocumentoDto | null>(null);
  const [verVersiones, setVerVersiones] = useState(false);
  const [verEmpresas, setVerEmpresas] = useState(false);
  const descargar = useDescargar();
  const abrirSubida = useDialogoSubir((s) => s.abrir);
  const actual = documento.versionActual;
  const titulo = documento.tipo.nombre;
  const subible = sePuedeSubirVersion(documento);
  // Cada empresa cuenta la vigencia con su regla: si las fechas difieren, la cabecera dice la más próxima y por qué.
  const referencia = venceEnCabecera(documento);
  const masProxima = empresaConLaFechaMasProxima(documento);
  const resumen = resumirEmpresas(comparticionesDeLaEmpresa(documento.porEmpresa, empresaId));
  const idEmpresas = `empresas-${documento.id}`;
  const vigencia = actual?.vigencia;
  const vence = !vigencia ? null : estadoDeVigencia(vigencia) === 'SinVencimiento' ? textoSinVencimiento(vigencia, t) : textoVigencia(vigencia, t);

  return (
    <Box
      component="article"
      aria-labelledby={`doc-${documento.id}`}
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'minmax(0, 1fr) auto', ...COLUMNAS_DOCUMENTO },
        gridTemplateAreas: { xs: '"doc doc" "est acc" "emp emp"', md: '"doc est emp acc"' },
        columnGap: 2,
        rowGap: 0.5,
        alignItems: 'center',
        py: 1,
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Stack sx={{ gridArea: 'doc', minWidth: 0 }} direction="row" spacing={1.5}>
        <Box
          aria-hidden
          sx={(th) => ({ display: 'grid', placeItems: 'center', flex: 'none', width: TAMANO_ICONO, height: TAMANO_ICONO, borderRadius: '8px', bgcolor: th.palette.acento.tinte, color: th.palette.acento.main })}
        >
          <FileText size={15} strokeWidth={1.75} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" id={`doc-${documento.id}`} component="h2">
            {titulo}
          </Typography>
          {/* Una línea gris auxiliar (`caption`): «Versión 7 · cargada el …» y «Vence el …» no se parten por dentro; si no caben juntos, el vencimiento baja. */}
          <Typography variant="caption" component="div" sx={{ color: 'text.secondary' }}>
            <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
              {actual ? t('boveda.cargadaEl', { n: String(actual.n), fecha: formatearFecha(actual.cargadaEn) }) : t('boveda.sinVigente')}
              {vence && ' ·'}
            </Box>
            {vence && (
              <>
                {' '}
                <Box component="span" sx={{ whiteSpace: 'nowrap' }}>
                  {vence}
                </Box>
              </>
            )}
          </Typography>
          {/* En su propia línea: junto a la meta quedaba un «·» suelto al partirse la línea. */}
          {documento.versiones > 1 && (
            <Button
              variant="text"
              size="small"
              onClick={() => setVerVersiones((v) => !v)}
              aria-expanded={verVersiones}
              sx={{ display: 'block', ...BOTON_DE_TEXTO_PEQUENO }}
            >
              {verVersiones ? t('boveda.ocultarVersiones') : t('boveda.versiones', { n: String(documento.versiones) })}
            </Button>
          )}
          {masProxima && (
            <Typography variant="caption" component="p" sx={{ m: 0, mt: 0.25, color: 'text.secondary' }}>
              {t('boveda.venceDistinto', { empresa: masProxima })}
            </Typography>
          )}
        </Box>
      </Stack>

      <Box sx={{ gridArea: 'est', justifySelf: 'start' }}>{actual && <ChipDeVersion version={actual} />}</Box>

      <Box sx={{ gridArea: 'emp', minWidth: 0 }}>
        <EmpresasDelDocumento
          resumen={resumen}
          referencia={referencia}
          filtrada={empresaId !== null}
          abierto={verEmpresas}
          onAlternar={() => setVerEmpresas((v) => !v)}
          idDetalle={idEmpresas}
        />
      </Box>

      <Stack direction="row" sx={{ gridArea: 'acc', alignItems: 'center', justifySelf: 'end' }}>
        {subible && (
          <Button onClick={() => abrirSubida(solicitudDeNuevaVersion(documento))} variant="text" size="small" startIcon={<Upload size={16} aria-hidden />}>
            {t('boveda.nuevaVersion')}
          </Button>
        )}
        {actual && (
          <IconButton aria-label={`${t('comun.version', { n: String(actual.n) })}: ${titulo}`} aria-haspopup="menu" onClick={(e) => setMenu(e.currentTarget)}>
            <EllipsisVertical size={20} strokeWidth={3} />
          </IconButton>
        )}
      </Stack>

      {actual && (
        <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
          {sePuedeDescargar(actual) && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                descargar(documento.id, actual.n);
              }}
            >
              <ListItemIcon>
                <Download size={18} aria-hidden />
              </ListItemIcon>
              <ListItemText primary={t('boveda.descargar')} />
            </MenuItem>
          )}
          {sePuedeRetirar(actual) && (
            <MenuItem
              onClick={() => {
                setMenu(null);
                setRetirando(actual);
              }}
            >
              <ListItemIcon>
                <Archive size={18} aria-hidden />
              </ListItemIcon>
              <ListItemText primary={t('boveda.retirar')} />
            </MenuItem>
          )}
        </Menu>
      )}

      {verEmpresas && resumen.modo === 'resumen' && (
        <Box sx={{ gridColumn: '1 / -1' }}>
          <DetalleEmpresas id={idEmpresas} grupos={resumen.grupos} referencia={referencia} />
        </Box>
      )}
      {/* Las versiones, anidadas bajo el documento a la altura de su nombre (pasado el ícono). */}
      {verVersiones && (
        <Box sx={{ gridColumn: '1 / -1', pl: `${String(TAMANO_ICONO + SEPARACION_ICONO)}px`, minWidth: 0 }}>
          <VersionesDocumento documentoId={documento.id} onRetirar={setRetirando} />
        </Box>
      )}
      {retirando && (
        <DialogoRetirar
          documentoId={documento.id}
          tipo={titulo}
          version={retirando}
          subirCorregida={subible ? solicitudDeNuevaVersion(documento) : null}
          onCerrar={() => setRetirando(null)}
        />
      )}
    </Box>
  );
}
