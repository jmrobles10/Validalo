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
 * Con `plegados` (hay un cruce que ya cuenta lo importante) solo quedan las `previas` y el resto va tras «Ver lo que leyó la IA».
 * Los valores largos (listas y objetos) ocupan todo el ancho; los cortos comparten fila de a dos si el contenedor es ancho.
 *
 * `alPie` (el bloque «Revisión automática»): solo el enlace «Ver lo que leyó la IA», en gris, y la lista únicamente cuando se despliega; lo de `previas` ya va en la línea
 * de la lectura (`LecturaAlPie`).
 */
export function CamposIa({
  campos,
  titulo,
  limite,
  previas = [],
  plegados = false,
  alPie = false,
}: {
  campos: readonly CampoIa[];
  titulo: string;
  limite?: number;
  previas?: readonly FilaDeDato[];
  plegados?: boolean;
  alPie?: boolean;
}) {
  const { t } = useTranslation();
  const [todos, setTodos] = useState(false);
  const visibles = plegados ? (todos ? campos : []) : limite && !todos ? campos.slice(0, limite) : campos;
  const ocultos = campos.length - visibles.length;
  const conBoton = plegados ? campos.length > 0 : limite !== undefined && campos.length > limite;
  const textoDelBoton = todos ? (plegados ? t('ia.revision.ocultarLoLeido') : t('ia.revision.verMenos')) : plegados ? t('ia.revision.verLoLeido') : t('ia.revision.verTodos', { count: ocultos });
  const filas: FilaDeDato[] = [
    ...previas,
    ...visibles.map((campo) => ({ clave: campo.clave, etiqueta: campo.etiqueta, valor: <Valor valor={campo.valor} />, ancho: campo.valor.tipo !== 'texto' })),
  ];

  if (alPie) {
    return (
      <Box>
        {campos.length > 0 && (
          <Button
            variant="text"
            color="inherit"
            onClick={() => setTodos((v) => !v)}
            aria-expanded={todos}
            sx={{ px: 0, minWidth: 0, color: 'text.secondary', textDecoration: 'underline', '&:hover': { color: 'text.primary', bgcolor: 'transparent', textDecoration: 'underline' } }}
          >
            {textoDelBoton}
          </Button>
        )}
        {todos && (
          <Box sx={{ mt: 0.5 }}>
            <ListaDeDatos filas={filas} etiqueta={titulo} />
          </Box>
        )}
      </Box>
    );
  }

  return (
    <Box>
      <ListaDeDatos filas={filas} etiqueta={titulo} />
      {conBoton && (
        <Button variant="text" onClick={() => setTodos((v) => !v)} sx={{ mt: 0.5, px: plegados ? 0 : 0.5, minWidth: 0 }} aria-expanded={todos}>
          {textoDelBoton}
        </Button>
      )}
    </Box>
  );
}
