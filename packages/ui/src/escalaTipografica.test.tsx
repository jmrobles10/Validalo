import {
  Alert,
  Breadcrumbs,
  Button,
  Checkbox,
  Chip,
  DialogTitle,
  FormControlLabel,
  Link,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  MenuList,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ThemeProvider,
  Typography,
} from '@mui/material';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { createValidaloTheme, type App } from './tema';
import { PESO, TAMANO_TEXTO, TIPOGRAFIA, TIPOGRAFIA_MOVIL } from './tokens';

/**
 * La escala tipográfica del tema (la de Sinco React del SRM): títulos 16, subtítulos 14, texto 13 y auxiliares 11, con el peso EN la variante.
 * jsdom no evalúa las media queries, así que aquí se ven los valores de escritorio; los del celular del tercero se comprueban en el objeto del tema.
 */
const conTema = (nodo: ReactNode, app: App = 'web') => render(<ThemeProvider theme={createValidaloTheme('light', { app })}>{nodo}</ThemeProvider>);
const estilo = (nodo: Element) => getComputedStyle(nodo);
const tamano = (nodo: Element) => estilo(nodo).fontSize;
const peso = (nodo: Element) => estilo(nodo).fontWeight;

describe('escala tipográfica · variantes', () => {
  it.each([
    ['h5', '18px', String(PESO.fuerte)],
    ['h6', '16px', String(PESO.fuerte)],
    ['subtitle1', '14px', String(PESO.medio)],
    ['subtitle2', '13px', String(PESO.medio)],
    ['body1', '14px', String(PESO.regular)],
    ['body2', '13px', String(PESO.regular)],
    ['caption', '11px', String(PESO.regular)],
    ['overline', '11px', String(PESO.regular)],
    ['mono', '12px', String(PESO.regular)],
    ['monoTabla', '12px', String(PESO.regular)],
    ['kpi', '22px', String(PESO.medio)],
  ] as const)('%s mide %s y pesa %s en web y en public', (variante, esperado, pesoEsperado) => {
    for (const app of ['web', 'public'] as const) {
      const { unmount } = conTema(<Typography variant={variante}>Texto de muestra</Typography>, app);
      const nodo = screen.getByText('Texto de muestra');
      expect(tamano(nodo)).toBe(esperado);
      expect(peso(nodo)).toBe(pesoEsperado);
      unmount();
    }
  });

  it('un Typography sin variante es texto normal (13 px, 400)', () => {
    conTema(<Typography>Sin variante</Typography>);
    expect(tamano(screen.getByText('Sin variante'))).toBe('13px');
    expect(peso(screen.getByText('Sin variante'))).toBe('400');
  });

  it('la clave `typography` de sx toma la variante del tema (tamaño y peso)', () => {
    conTema(<Typography sx={{ typography: 'subtitle1' }}>Con sx</Typography>);
    expect(tamano(screen.getByText('Con sx'))).toBe('14px');
    expect(peso(screen.getByText('Con sx'))).toBe('500');
  });

  it('los cuatro escalones del pedido son 16, 14, 13 y 11', () => {
    expect(TAMANO_TEXTO).toEqual({ titulo: 16, subtitulo: 14, texto: 13, auxiliar: 11 });
    expect([TIPOGRAFIA.h6.fontSize, TIPOGRAFIA.subtitle1.fontSize, TIPOGRAFIA.body2.fontSize, TIPOGRAFIA.caption.fontSize]).toEqual([16, 14, 13, 11]);
  });

  it('el tercero (public) sube un píxel por debajo de 600 px, los campos pasan a 16 px y web no cambia', () => {
    const publico = createValidaloTheme('light', { app: 'public' }).typography;
    const web = createValidaloTheme('light', { app: 'web' }).typography;
    const movil = '@media (max-width:599.95px)';
    expect(publico.body2[movil as keyof typeof publico.body2]).toMatchObject({ fontSize: TIPOGRAFIA_MOVIL.body2.fontSize });
    expect(publico.caption[movil as keyof typeof publico.caption]).toMatchObject({ fontSize: 12 });
    expect(publico.h6[movil as keyof typeof publico.h6]).toMatchObject({ fontSize: 17 });
    expect(web.body2[movil as keyof typeof web.body2]).toBeUndefined();
    const campo = createValidaloTheme('light', { app: 'public' }).components?.MuiOutlinedInput?.styleOverrides?.input;
    expect(campo).toMatchObject({ fontSize: 13, [movil]: { fontSize: 16 } });
  });
});

describe('escala tipografica · los componentes de MUI usan la escala (nada queda en 14 px por omisión)', () => {
  it.each(['web', 'public'] as const)('campos, listas, menús, botones y pestañas en %s', (app) => {
    conTema(
      <>
        <TextField label="Nombre" value="Ana" onChange={() => undefined} helperText="Ayuda del campo" />
        <FormControlLabel control={<Checkbox />} label="Acepto" />
        <List>
          <ListItem>
            <ListItemText primary="Principal" secondary="Secundario" />
          </ListItem>
        </List>
        <MenuList>
          <MenuItem>Opción</MenuItem>
        </MenuList>
        <Button size="small">Pequeño</Button>
        <Button size="medium">Mediano</Button>
        <Button size="large">Grande</Button>
        <Tabs value={0}>
          <Tab label="Pestaña" />
        </Tabs>
        <Chip label="Chip" />
        <Alert severity="info">Aviso</Alert>
        <Breadcrumbs>
          <Link href="#a">Inicio</Link>
          <Typography>Aquí</Typography>
        </Breadcrumbs>
        <DialogTitle>Título del diálogo</DialogTitle>
      </>,
      app,
    );
    expect(tamano(screen.getByRole('textbox'))).toBe('13px');
    expect(tamano(screen.getByText('Ayuda del campo'))).toBe('11px');
    expect(tamano(screen.getByText('Acepto'))).toBe('13px');
    expect(tamano(screen.getByText('Principal'))).toBe('13px');
    expect(tamano(screen.getByText('Secundario'))).toBe('11px');
    expect(tamano(screen.getByRole('menuitem'))).toBe('13px');
    for (const nombre of ['Pequeño', 'Mediano', 'Grande']) expect(tamano(screen.getByRole('button', { name: nombre }))).toBe('13px');
    expect(tamano(screen.getByRole('tab'))).toBe('13px');
    expect(peso(screen.getByRole('tab'))).toBe('500');
    expect(tamano(screen.getByText('Chip'))).toBe('11px');
    expect(tamano(screen.getByText('Aviso'))).toBe('13px');
    expect(tamano(screen.getByText('Inicio'))).toBe('13px');
    expect(tamano(screen.getByText('Título del diálogo'))).toBe('16px');
    expect(peso(screen.getByText('Título del diálogo'))).toBe('600');
  });

  it('las tablas: encabezado en 11 px y celdas en 13 px', () => {
    conTema(
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Expediente</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>CON-E-2026-000002</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
    expect(tamano(screen.getByRole('columnheader'))).toBe('11px');
    expect(tamano(screen.getByRole('cell'))).toBe('13px');
  });
});
