import { Box, Button } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListaDeDatos, type FilaDeDato } from './ListaDeDatos';
import type { CampoIa, ValorIa } from './revisionIa';

/** Un valor: texto tal cual; una lista, como lista con viñetas; un objeto, como sus pares «Etiqueta: valor». */
function Valor({ valor }: { valor: ValorIa }) {
  if (valor.tipo === 'texto') return <>{valor.texto}</>;
  if (valor.tipo === 'lista') {
    return (
      <Box component="ul" sx={{ m: 0, pl: 2 }}>
        {valor.elementos.map((elemento, i) => (
          <li key={i}>
            <Valor valor={elemento} />
          </li>
        ))}
      </Box>
    );
  }
  return (
    <Box component="span" sx={{ display: 'block' }}>
      {valor.pares.map((par) => (
        <Box component="span" key={par.clave} sx={{ display: 'block' }}>
          <Box component="span" sx={{ color: 'text.secondary' }}>
            {par.etiqueta}:
          </Box>{' '}
          <Valor valor={par.valor} />
        </Box>
      ))}
    </Box>
  );
}

/**
 * Lo que leyó la IA, en la misma lista que `previas` (las filas que no cuentan para el límite, como «Legible» y «Tipo detectado»): con «Ver n datos más» si hay límite.
 * Los valores largos (listas y objetos) ocupan todo el ancho; los cortos comparten fila de a dos si el contenedor es ancho.
 */
export function CamposIa({ campos, titulo, limite, previas = [] }: { campos: readonly CampoIa[]; titulo: string; limite?: number; previas?: readonly FilaDeDato[] }) {
  const { t } = useTranslation();
  const [todos, setTodos] = useState(false);
  const visibles = limite && !todos ? campos.slice(0, limite) : campos;
  const ocultos = campos.length - visibles.length;
  const filas: FilaDeDato[] = [
    ...previas,
    ...visibles.map((campo) => ({ clave: campo.clave, etiqueta: campo.etiqueta, valor: <Valor valor={campo.valor} />, ancho: campo.valor.tipo !== 'texto' })),
  ];

  return (
    <Box>
      <ListaDeDatos filas={filas} etiqueta={titulo} />
      {limite !== undefined && campos.length > limite && (
        <Button size="small" variant="text" onClick={() => setTodos((v) => !v)} sx={{ mt: 0.5, px: 0.5, minWidth: 0 }} aria-expanded={todos}>
          {todos ? t('ia.revision.verMenos') : t('ia.revision.verTodos', { count: ocultos })}
        </Button>
      )}
    </Box>
  );
}
