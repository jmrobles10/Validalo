# apps/public: pantallas del tercero

App del tercero (docs/06 §3.2), **móvil primero** y en es-CO: enlace con OTP, mis empresas, invitación con textos legales, mi bóveda con subida en dos pasos y mi revisión con cada empresa. Usa el tema `createValidaloTheme('light', { app: 'public' })` del design system «Registro»: densidad cómoda, controles de 44 px y radio 18 en tarjetas y diálogos.

Comandos, lint, pruebas y build: los del workspace (ver [apps/web/README.md](../web/README.md)). Esta app agrega:

```bash
pnpm --filter @validalo/public dev        # Vite en :5181 (proxy de /public/v1 a la API y de /__mailpit a Mailpit)
pnpm --filter @validalo/public build      # dist/ (sin /dev/correos)
```

## Rutas

| Ruta | Qué hace |
|---|---|
| `/e/:token` | Canjea el enlace del correo **una sola vez** (`POST /public/v1/enlaces/{token}/canjear`; StrictMode no lo repite). Si el tipo de vínculo exige OTP (202), pide el código de 6 dígitos y muestra los intentos restantes (`otp-invalido` trae `intentosRestantes`). Enlace vencido o usado (410), inexistente (404), OTP vencido o bloqueado: pantalla con el siguiente paso. Con un solo vínculo en la sesión va directo a su invitación. |
| `/empresas` | Mis empresas: `GET /public/v1/vinculos` con estado, «Revisar y aceptar» o «Ver mi revisión». |
| `/empresas/:vinculoId` | Invitación: textos vigentes (`GET /public/v1/invitaciones/{id}`) en orden aviso de la plataforma (solo si falta), autorización y términos de la empresa, cada uno con versión y fecha y su casilla. «Aceptar» envía tipo y versión exactos. `texto-desactualizado` recarga y desmarca el texto que cambió; `textos-legales-faltantes`, `otp-requerido` e `invitacion-ya-aceptada` tienen su mensaje. |
| `/boveda` | Mi bóveda (`GET /public/v1/boveda`): cada documento con su versión vigente y, por empresa, qué versión tiene. Menú: descargar (URL prefirmada) y retirar con motivo; «Ver versiones» es una lista compacta (una fila por versión: archivo, tamaño, fecha, «Descargar» y «Retirar») con las devueltas y su motivo. Con más de 2 empresas la columna «Empresas» se resume por estado («24 aprobadas», «3 revalidan») y se abre en un detalle con buscador (más de 8); las empresas que no exigen el documento no se listan. «Por renovar» resume una línea por documento (más de 3 empresas) y muestra 4 líneas con «Ver N más». Con dos o más empresas hay un filtro «Empresa» (`?empresa=<id>`) que limita las filas y «Por renovar» a una. Debajo de los documentos, «De tus personas relacionadas» muestra a cada representante, suplente o socio con lo que ya tiene cargado en **su** bóveda (ADR-0010; `GET /public/v1/tercero/relaciones`) y «Subir otra versión»; no aparece sin personas ni documentos cargados, ni con acceso aislado. «Subir documento», «Subir versión» y «Por renovar › Subir versión nueva» abren el diálogo de subida. |
| Diálogo de subida | **Todas** las subidas del tercero (bóveda, tarjetas de su revisión, Personas, «Subir un soporte» de la ficha y «Subir una versión corregida» del retiro) se hacen en un diálogo, sin salir de la pantalla: `useDialogoSubir().abrir(solicitud)` y lo monta `AnfitrionDeSubida` en el marco (un solo diálogo, independiente de la fila que lo abrió, que cambia al subir). Mismo contenido que la página de abajo; no se cierra mientras sube, al terminar dice «Listo» y se cierra; en el celular ocupa toda la pantalla. Llenar un formulario sin archivo sigue siendo la página. |
| `/boveda/subir` | Se conserva para los enlaces de los correos, las pruebas e2e y el modo embebido: el mismo contenido del diálogo (`SubirArchivo`) como página. Tipo (canónicos globales de archivo) y Dropzone con «Tomar foto» (`capture="environment"`) y «Elegir archivo» (y arrastrar en escritorio). Valida 20 MB y formato en el navegador, calcula el SHA-256, `POST …/documentos` → `PUT` directo al almacenamiento con progreso → `…/confirmar`. Estados: lista (con qué empresas la recibieron), duplicado, devuelta con motivo, 413, 415, sin red y URL vencida. `?documento=` sube una versión nueva del mismo documento. |
| `/expediente/:id` | Mi revisión: estado («te faltan N documentos» en la fase de carga), los documentos que pide la empresa agrupados en «Te toca», «Lo revisa la empresa» y «Listo», cada observado con sus motivos y su observación, y desde cada tarjeta «Subir documento», «Subir versión corregida» u «Subir otra versión» (abre el diálogo de subida con el tipo fijo, sin salir de la revisión; un tipo solo-formulario lleva a su página, que vuelve aquí). «Enviar respuesta» reenvía con o sin respuesta escrita (`requisitos-sin-corregir` se explica). Se refresca solo mientras esté abierto o devuelto: la versión subida llega al expediente por una cola. |
| `/dev/correos` | Solo `vite dev`: lee Mailpit por el proxy `/__mailpit` y muestra «Abrir enlace» y el código OTP de cada correo. |

**Sesión** (`src/sesion/`, contrato de `feature/H2-reingreso`): el access (JWT de 30 min) vive en memoria y viaja como `Authorization: Bearer`; la cookie `vs_tercero` (HttpOnly, SameSite=Lax, `Path=/public/v1/sesion`, hasta 8 h desde el canje) lo renueva con `POST /public/v1/sesion/renovar` (cabecera `X-Validalo-Cliente: public`):
- al arrancar se intenta renovar: con cookie vigente la persona sigue dentro tras recargar; sin ella (401) ve «Entrar con mi correo»;
- dos minutos antes de vencer se renueva solo (una sola petición aunque la pidan varias llamadas: la cookie rota);
- si una llamada responde 401, se renueva una vez y se repite (`sesion/renovacion.ts`); si tampoco, «Tu sesión terminó»;
- «Salir» llama a `POST /public/v1/sesion/cerrar` (borra la cookie);
- la cookie rota en cada renovación y no hay periodo de gracia (presentar una ya rotada revoca la sesión): las renovaciones se serializan entre pestañas con Web Locks (`conCandado`) y un 409 `renovacion-concurrente` se reintenta una vez (`renovarUnaVez`).

**Entrar con mi correo** (`/entrar`, y en lugar de «abre el enlace de tu correo»): `POST /public/v1/acceso { correo }` responde siempre igual (solo 422 `correo-invalido` si está mal formado) y la pantalla también; el enlace llega al correo de la invitación y vence en 1 h (el del correo de observación, en 72 h). Los enlaces usados, vencidos o bloqueados ofrecen esta entrada. En desarrollo, el proxy de Vite deja pasar `Set-Cookie` sin `Domain`, así la cookie queda en :5181 (mismo origen que la app).

## Probar el recorrido

```bash
docker compose -f infra/compose/compose.yaml up -d      # PostgreSQL, Mailpit (:8025) y MinIO (:9000, consola :9001)
ASPNETCORE_ENVIRONMENT=Development Validalo__Correo__UrlPublica=http://localhost:5181 dotnet run --project src/Validalo.Api --urls http://localhost:5080
pnpm semilla:dev                                         # PROVEEDOR con OTP, flujo con requisitos (RUT y Cámara) publicado y textos de Norte
pnpm --filter @validalo/public dev
```

1. `http://localhost:5181/dev/correos` → «Abrir enlace» del correo de `contacto1…` (Aceros del Norte, proveedor de Norte).
2. El código llega en otro correo (aparece en la misma página): escríbelo y acepta los tres textos. Se abre el expediente: «Abierto» mientras falte un documento (si el tercero ya tenía el RUT en su bóveda, falta solo la Cámara).
3. Mi bóveda → Subir documento → RUT → elegir un PDF: queda como versión 1 y «Ya la tiene: Constructora Norte S.A.S.».
4. En `apps/web` (embed-demo, Ana): vínculo de Aceros del Norte → «Documentos compartidos» → «Ver o descargar».

## Pedidos al backend

0. ~~Volver a entrar a un vínculo aceptado~~: lo resuelve `feature/H2-reingreso` (acceso por correo, enlace en el correo de observación y sesión renovable con cookie).
1. **Catálogo para el tercero.** Para subir por su cuenta (sin requisito), la lista de tipos está fija en `src/boveda/catalogo.ts` (canónicos globales de archivo) porque `GET /api/v1/catalogos/tipos-documento` no acepta su sesión. Desde la revisión ya sube lo que pide cada requisito. `ExpedientePublicoDto` tampoco trae `vinculoId` (hace falta para un tipo propio de la empresa); hoy se toma de `GET /public/v1/vinculos`.
2. **Contexto del enlace antes de canjear** (`EnlaceContexto` de docs/06 §5): empresa, tipo de vínculo, `requiereOtp` y correo enmascarado. Sin eso la landing no puede decir «Constructora Norte te pide…» antes del código. El 202 del canje (`OtpRequeridoDto`) ya trae el correo enmascarado (`correoEnmascarado`) y la pantalla del código dice a cuál buzón llegó.
3. **Marca y soporte de la empresa**: `EmpresaPublicaDto` no trae color (para `derivarPaletaEmpresa`) ni correo de soporte, que el design system muestra en el pie y en Mis empresas.
4. **Estado por empresa en la bóveda**: `ComparticionPublicaDto` dice qué versión tiene cada empresa pero no si la aprobó u observó (llega con los requisitos).
5. **CORS del almacenamiento en producción**: el `PUT` prefirmado sale del origen de `apps/public` directo a S3/MinIO. En desarrollo MinIO acepta cualquier origen; en producción el bucket necesita CORS para ese origen (`PUT`, cabecera `Content-Type`).
6. Canje, inicio de carga y autorregistro siguen publicándose como `IResult` en OpenAPI; `transformar.ts` declara sus respuestas reales (`SesionTerceroDto | OtpRequeridoDto`, `CargaPrefirmadaDto`, `SolicitudRecibidaDto`).

Pedido al backend: la sesión que abre el enlace del correo de observación llega con `expedienteOrigen: null`; con el id del expediente, el tercero entraría directo a su revisión (hoy pasa por la invitación aceptada, que lo redirige).

## Pendiente

Conversión HEIC y unir varias fotos en un PDF (el Dropzone del design system usa `pdf-lib` y `heic2any` en un chunk aparte); SSE de la bóveda; ratificar una versión duplicada; personas relacionadas, cuentas bancarias, certificado y verificador; marca de la empresa en el tema; embed `/embed/expediente/:token`; PWA y cola sin conexión.
