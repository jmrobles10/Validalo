import { Box, Chip } from '@mui/material';
import type { CondicionDto } from '@validalo/api-client';
import { useTranslation } from 'react-i18next';
import { useCamposDeFicha, useNombresDeCodigos } from '../api';
import { camposDeFichaEnCondicion, fraseDeCondicion } from '../fraseDeCondicion';
import { CHIP_DE_CONDICION, TEXTO_DE_CONDICION } from './estiloDeFilas';

function EtiquetaDeCondicion({ texto }: { texto: string }) {
  return (
    <Chip
      component="span"
      size="small"
      color="info"
      label={
        <Box component="span" sx={TEXTO_DE_CONDICION}>
          {texto}
        </Box>
      }
      title={texto}
      sx={CHIP_DE_CONDICION}
    />
  );
}

/**
 * Una condición que mira la ficha del tercero (sola o dentro de una compuesta) dice el campo como lo llama la API («Especialidades») y cada valor con el
 * nombre de su catálogo («G3 · Gestión de Residuos»). Las consultas se guardan, así que todas las filas comparten las del constructor.
 */
function CondicionConFicha({ condicion }: { condicion: CondicionDto }) {
  const { t } = useTranslation();
  const campos = useCamposDeFicha();
  const catalogoDe = (ruta: string) => campos.data?.find((c) => c.ruta === ruta)?.catalogo ?? null;
  const nombres = useNombresDeCodigos(camposDeFichaEnCondicion(condicion).flatMap(({ ruta, valores }) => valores.map((codigo) => ({ catalogo: catalogoDe(ruta), codigo }))));
  const texto = fraseDeCondicion(condicion, {
    t,
    etiquetaDeCampo: (ruta) => campos.data?.find((c) => c.ruta === ruta)?.etiqueta,
    nombreDeValor: (ruta, codigo) => nombres.get(`${catalogoDe(ruta) ?? ''}|${codigo}`),
  });
  return <EtiquetaDeCondicion texto={texto} />;
}

/**
 * «Se pide a» de un requisito que no es para todos, en una frase corta dentro de una etiqueta (la completa, en su título), igual para la condición
 * simple que para la compuesta.
 */
export function ChipDeCondicion({ condicion }: { condicion: CondicionDto }) {
  const { t } = useTranslation();
  return camposDeFichaEnCondicion(condicion).length > 0 ? <CondicionConFicha condicion={condicion} /> : <EtiquetaDeCondicion texto={fraseDeCondicion(condicion, { t })} />;
}
