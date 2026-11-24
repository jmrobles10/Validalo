# API · Personas

6 operaciones en 2 recursos.

## Personas del vínculo

Las personas relacionadas del tercero de un vínculo, vistas por la empresa (ADR-0010, PR-7): solo las relaciones vigentes y, de cada persona, los documentos de su bóveda que **se compartieron con este vínculo**. La empresa no ve el resto de la bóveda de la persona ni las relaciones que la persona tenga con otros terceros.

### `GET /api/v1/vinculos/{id}/personas-relacionadas`

**Listar personas del vínculo.**

**Permiso documentos:leer · Empresa activa (`X-Empresa`) · API (`/api/v1`) · SDK: `listarPersonasDelVinculo`**

**Parámetros**

| Nombre | En | Tipo | Requerido | Detalle |
|---|---|---|---|---|
| `id` | path | uuid | sí |  |

**Respuestas**

- `200` OK — lista de PersonaDelVinculoDto
- `404` No encontrado

Campos de la respuesta `200`:

| Campo | Tipo | Requerido | Detalle |
|---|---|---|---|
| `[]` | lista de PersonaDelVinculoDto | sí |  |
| `[].relacionId` | uuid | sí |  |
| `[].personaId` | uuid | sí |  |
| `[].identificacion` | IdentificacionDto | sí |  |
| `[].identificacion.pais` | texto | sí |  |
| `[].identificacion.tipo` | texto | sí |  |
| `[].identificacion.numero` | texto | sí |  |
| `[].identificacion.digitoVerificacion` | texto o null | no |  |
| `[].nombre` | texto | sí |  |
| `[].tipo` | texto | sí |  |
| `[].principal` | booleano | sí |  |
| `[].participacion` | number \| string o null | no | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `[].cargo` | texto o null | no |  |
| `[].vigenteDesde` | fecha | sí |  |
| `[].documentos` | lista de DocumentoVistaEmpresaDto | sí |  |
| `[].documentos[].documentoId` | uuid | sí |  |
| `[].documentos[].tipo` | TipoDocumentoResumenDto | sí |  |
| `[].documentos[].tipo.codigo` | texto | sí |  |
| `[].documentos[].tipo.nombre` | texto | sí |  |
| `[].documentos[].tipo.tipoDocumentoTenantId` | uuid o null | no |  |
| `[].documentos[].ambito` | AmbitoDocumento (texto) | sí | valores: Global · PorVinculo |
| `[].documentos[].versionActual` | entero o null | no |  |
| `[].documentos[].versionesCompartidas` | lista de VersionDocumentoDto | sí |  |
| `[].documentos[].versionesCompartidas[].documentoId` | uuid | sí |  |
| `[].documentos[].versionesCompartidas[].n` | entero | sí |  |
| `[].documentos[].versionesCompartidas[].estado` | EstadoVersion (texto) | sí | valores: Recibida · EnAnalisis · Actual · Superada · Devuelta · Retirada |
| `[].documentos[].versionesCompartidas[].cargadaEn` | fecha y hora | sí |  |
| `[].documentos[].versionesCompartidas[].cargadaPor` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].clase` | ClaseDocumento (texto) | sí | valores: Archivo · Formulario |
| `[].documentos[].versionesCompartidas[].nombreOriginal` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].mime` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].tamanoBytes` | entero | sí |  |
| `[].documentos[].versionesCompartidas[].paginas` | entero o null | no |  |
| `[].documentos[].versionesCompartidas[].sha256` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].motivoDevolucion` | texto o null | no |  |
| `[].documentos[].versionesCompartidas[].detalleDevolucion` | texto o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos` | HechosDto o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos.conIa` | booleano | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.hashVerificado` | booleano | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.antivirus` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.mimeReal` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.paginas` | entero o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos.comparacion` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.camposCambiados` | lista de texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.camposCriticosCambiados` | lista de texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.pendienteRevisionHumana` | booleano | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia` | HechosIaDto o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.modelo` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.escalado` | booleano | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.confianza` | number \| string | sí | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `[].documentos[].versionesCompartidas[].hechos.ia.legible` | booleano | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.tipoDetectado` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.campos` | objeto libre | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.alertas` | lista de texto | sí |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.observaciones` | texto o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.paginasEnviadas` | entero o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.paginasOmitidas` | entero o null | no |  |
| `[].documentos[].versionesCompartidas[].hechos.ia.fecha` | fecha y hora | sí |  |
| `[].documentos[].versionesCompartidas[].datosDeclarados` | lista de DatoDeclaradoDto o null | no |  |
| `[].documentos[].versionesCompartidas[].datosDeclarados[].clave` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].datosDeclarados[].etiqueta` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].datosDeclarados[].tipo` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].datosDeclarados[].valor` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].vigencia` | VigenciaDto o null | no |  |
| `[].documentos[].versionesCompartidas[].vigencia.vigenteHasta` | fecha o null | no |  |
| `[].documentos[].versionesCompartidas[].vigencia.base` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].vigencia.estado` | texto | sí |  |
| `[].documentos[].versionesCompartidas[].vigencia.diasAviso` | lista de entero | sí |  |
| `[].documentos[].versionesCompartidas[].vigencia.diasGracia` | entero | sí |  |
| `[].documentos[].versionesCompartidas[].vigencia.finDeGracia` | fecha o null | no |  |
| `[].documentos[].versionesCompartidas[].vigencia.vencidaEn` | fecha y hora o null | no |  |

<details><summary>Ejemplo de petición y respuesta</summary>

```bash
curl -X GET "https://{host}/api/v1/vinculos/3fa85f64-5717-4562-b3fc-2c963f66afa6/personas-relacionadas" \
  -H "X-Api-Key: $API_KEY" \
  -H "X-Empresa: $EMPRESA_ID"
```

Respuesta `200`:

```json
[
  {
    "relacionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "personaId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "identificacion": {
      "pais": "CO",
      "tipo": "texto",
      "numero": "900123456",
      "digitoVerificacion": "texto"
    },
    "nombre": "Constructora Norte S.A.S.",
    "tipo": "texto",
    "principal": true,
    "participacion": 1,
    "cargo": "texto",
    "vigenteDesde": "2026-11-12",
    "documentos": [
      {
        "documentoId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "tipo": {
          "codigo": "CODIGO_EJEMPLO",
          "nombre": "Constructora Norte S.A.S.",
          "tipoDocumentoTenantId": "3fa85f64-5717-4562-b3fc-2c963f66afa6"
        },
        "ambito": "Global",
        "versionActual": 1,
        "versionesCompartidas": [
          {
            "documentoId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
            "n": 1,
            "estado": "Recibida",
            "cargadaEn": "2026-11-12T15:00:00Z",
            "cargadaPor": "texto",
            "clase": "Archivo",
            "nombreOriginal": "Nombre de ejemplo",
            "mime": "texto",
            "tamanoBytes": 1,
            "paginas": 1,
            "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            "motivoDevolucion": "Texto de ejemplo.",
            "detalleDevolucion": "Texto de ejemplo.",
            "hechos": {
              "conIa": null,
              "hashVerificado": null,
              "antivirus": null,
              "mimeReal": null,
              "paginas": null,
              "comparacion": null,
              "camposCambiados": null,
              "camposCriticosCambiados": null,
              "pendienteRevisionHumana": null,
              "ia": null
            },
            "datosDeclarados": [
              null
            ],
            "vigencia": {
              "vigenteHasta": null,
              "base": null,
              "estado": null,
              "diasAviso": null,
              "diasGracia": null,
              "finDeGracia": null,
              "vencidaEn": null
            }
          }
        ]
      }
    ]
  }
]
```

</details>

## Personas relacionadas

### `GET /public/v1/tercero/relaciones`

**Listar relaciones del tercero.** Personas relacionadas vigentes del tercero y las propuestas pendientes de confirmar (lo que la IA detectó en la Cámara de comercio). Antes de responder pone al día las que salen de su ficha legal (idempotente): quien ya tenía su ficha las ve sin hacer nada. Cada una trae el estado de los documentos de su bóveda y si alguna de las empresas del tercero se los pide.

**Sesión del tercero · Portal del tercero (`/public/v1`) · SDK: `listarRelacionesDelTercero`**

**Respuestas**

- `200` OK — lista de RelacionEntreTercerosDto
- `404` No encontrado

Campos de la respuesta `200`:

| Campo | Tipo | Requerido | Detalle |
|---|---|---|---|
| `[]` | lista de RelacionEntreTercerosDto | sí |  |
| `[].id` | uuid | sí |  |
| `[].personaId` | uuid | sí |  |
| `[].identificacion` | IdentificacionDto | sí |  |
| `[].identificacion.pais` | texto | sí |  |
| `[].identificacion.tipo` | texto | sí |  |
| `[].identificacion.numero` | texto | sí |  |
| `[].identificacion.digitoVerificacion` | texto o null | no |  |
| `[].nombre` | texto | sí |  |
| `[].tipo` | texto | sí |  |
| `[].principal` | booleano | sí |  |
| `[].participacion` | number \| string o null | no | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `[].cargo` | texto o null | no |  |
| `[].vigenteDesde` | fecha | sí |  |
| `[].vigenteHasta` | fecha o null | no |  |
| `[].estado` | texto | sí |  |
| `[].fuente` | texto | sí |  |
| `[].deFicha` | booleano | sí |  |
| `[].confianza` | number \| string o null | no | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `[].confirmadaEn` | fecha y hora o null | no |  |
| `[].documentos` | lista de DocumentoDePersonaDto | sí |  |
| `[].documentos[].tipoCanonico` | texto | sí |  |
| `[].documentos[].nombre` | texto | sí |  |
| `[].documentos[].documentoId` | uuid o null | no |  |
| `[].documentos[].version` | entero o null | no |  |
| `[].documentos[].estado` | texto o null | no |  |
| `[].documentos[].cargadaEn` | fecha y hora o null | no |  |
| `[].documentos[].pedido` | booleano | no | por omisión false |
| `[].reemplaza` | ReemplazaRelacionDto o null | no |  |
| `[].reemplaza.relacionId` | uuid | sí |  |
| `[].reemplaza.nombre` | texto | sí |  |
| `[].reemplaza.identificacion` | IdentificacionDto | sí | mismos campos que `[].identificacion` |

<details><summary>Ejemplo de petición y respuesta</summary>

```bash
curl -X GET "https://{host}/public/v1/tercero/relaciones" \
  -H "Authorization: Bearer $TOKEN_DE_LA_SESION_DEL_TERCERO"
```

Respuesta `200`:

```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "personaId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "identificacion": {
      "pais": "CO",
      "tipo": "texto",
      "numero": "900123456",
      "digitoVerificacion": "texto"
    },
    "nombre": "Constructora Norte S.A.S.",
    "tipo": "texto",
    "principal": true,
    "participacion": 1,
    "cargo": "texto",
    "vigenteDesde": "2026-11-12",
    "vigenteHasta": "2026-11-12",
    "estado": "texto",
    "fuente": "texto",
    "deFicha": true,
    "confianza": 1,
    "confirmadaEn": "2026-11-12T15:00:00Z",
    "documentos": [
      {
        "tipoCanonico": "texto",
        "nombre": "Constructora Norte S.A.S.",
        "documentoId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        "version": 1,
        "estado": "texto",
        "cargadaEn": "2026-11-12T15:00:00Z",
        "pedido": false
      }
    ],
    "reemplaza": {
      "relacionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "nombre": "Constructora Norte S.A.S.",
      "identificacion": {
        "pais": "CO",
        "tipo": "texto",
        "numero": "900123456",
        "digitoVerificacion": "texto"
      }
    }
  }
]
```

</details>

### `POST /public/v1/tercero/relaciones`

**Declarar relacion del tercero.** El tercero declara una persona relacionada que la ficha legal no maneja (beneficiario final o miembro de consorcio). Los representantes legales, suplentes y socios se registran en la información legal de la ficha, que es el único lugar para ellos (decisión de Producto del 2026-11-24): 422 `persona-se-registra-en-la-ficha`. Si ya figuraba terminada, descartada o como una propuesta de la IA, la declaración la devuelve a vigente; si ya era vigente, 409 `relacion-duplicada`. Con `principal`, la que era principal de ese tipo deja de serlo.

**Sesión del tercero · Portal del tercero (`/public/v1`) · SDK: `declararRelacionDelTercero`**

**Cuerpo de la petición** (`application/json`, DeclararRelacionDto)

| Campo | Tipo | Requerido | Detalle |
|---|---|---|---|
| `identificacion` | IdentificacionDto | sí |  |
| `identificacion.pais` | texto | sí |  |
| `identificacion.tipo` | texto | sí |  |
| `identificacion.numero` | texto | sí |  |
| `identificacion.digitoVerificacion` | texto o null | no |  |
| `nombre` | texto | sí |  |
| `tipo` | texto | sí |  |
| `principal` | booleano | no | por omisión false |
| `participacion` | number \| string o null | no | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `cargo` | texto o null | no |  |

**Respuestas**

- `201` Creado — RelacionEntreTercerosDto

Campos de la respuesta `201`:

| Campo | Tipo | Requerido | Detalle |
|---|---|---|---|
| `id` | uuid | sí |  |
| `personaId` | uuid | sí |  |
| `identificacion` | IdentificacionDto | sí |  |
| `identificacion.pais` | texto | sí |  |
| `identificacion.tipo` | texto | sí |  |
| `identificacion.numero` | texto | sí |  |
| `identificacion.digitoVerificacion` | texto o null | no |  |
| `nombre` | texto | sí |  |
| `tipo` | texto | sí |  |
| `principal` | booleano | sí |  |
| `participacion` | number \| string o null | no | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `cargo` | texto o null | no |  |
| `vigenteDesde` | fecha | sí |  |
| `vigenteHasta` | fecha o null | no |  |
| `estado` | texto | sí |  |
| `fuente` | texto | sí |  |
| `deFicha` | booleano | sí |  |
| `confianza` | number \| string o null | no | patrón ^-?(?:0\|[1-9]\d*)(?:\.\d+)?$ |
| `confirmadaEn` | fecha y hora o null | no |  |
| `documentos` | lista de DocumentoDePersonaDto | sí |  |
| `documentos[].tipoCanonico` | texto | sí |  |
| `documentos[].nombre` | texto | sí |  |
| `documentos[].documentoId` | uuid o null | no |  |
| `documentos[].version` | entero o null | no |  |
| `documentos[].estado` | texto o null | no |  |
| `documentos[].cargadaEn` | fecha y hora o null | no |  |
| `documentos[].pedido` | booleano | no | por omisión false |
| `reemplaza` | ReemplazaRelacionDto o null | no |  |
| `reemplaza.relacionId` | uuid | sí |  |
| `reemplaza.nombre` | texto | sí |  |
| `reemplaza.identificacion` | IdentificacionDto | sí | mismos campos que `identificacion` |

**Errores de negocio que lanza**

- `404` `tercero-no-encontrado`
- `409` `relacion-duplicada`
- `422` `identificacion-requerida`
- `422` `nombre-demasiado-largo`
- `422` `nombre-requerido`
- `422` `persona-no-natural`
- `422` `persona-se-registra-en-la-ficha`
- `422` `relacion-consigo-misma`
- `422` `tipo-relacion-invalido`

<details><summary>Ejemplo de petición y respuesta</summary>

```bash
curl -X POST "https://{host}/public/v1/tercero/relaciones" \
  -H "Authorization: Bearer $TOKEN_DE_LA_SESION_DEL_TERCERO" \
  -H "Content-Type: application/json" \
  -d '{"identificacion":{"pais":"CO","tipo":"texto","numero":"900123456","digitoVerificacion":"texto"},"nombre":"Constructora Norte S.A.S.","tipo":"texto","principal":false,"participacion":1,"cargo":"texto"}'
```

Respuesta `201`:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "personaId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "identificacion": {
    "pais": "CO",
    "tipo": "texto",
    "numero": "900123456",
    "digitoVerificacion": "texto"
  },
  "nombre": "Constructora Norte S.A.S.",
  "tipo": "texto",
  "principal": true,
  "participacion": 1,
  "cargo": "texto",
  "vigenteDesde": "2026-11-12",
  "vigenteHasta": "2026-11-12",
  "estado": "texto",
  "fuente": "texto",
  "deFicha": true,
  "confianza": 1,
  "confirmadaEn": "2026-11-12T15:00:00Z",
  "documentos": [
    {
      "tipoCanonico": "texto",
      "nombre": "Constructora Norte S.A.S.",
      "documentoId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "version": 1,
      "estado": "texto",
      "cargadaEn": "2026-11-12T15:00:00Z",
      "pedido": false
    }
  ],
  "reemplaza": {
    "relacionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "nombre": "Constructora Norte S.A.S.",
    "identificacion": {
      "pais": "CO",
      "tipo": "texto",
      "numero": "900123456",
      "digitoVerificacion": "texto"
    }
  }
}
```

</details>

### `DELETE /public/v1/tercero/relaciones/{id}`

**Terminar relacion del tercero.** Termina una relación vigente que el tercero declaró a mano (la persona deja de ser representante, socio…): desde mañana no cuenta. 409 `relacion-de-la-ficha` si la persona figura en su información legal (se quita de la ficha, que es la fuente) y `relacion-propuesta` si es una propuesta (se descarta).

**Sesión del tercero · Portal del tercero (`/public/v1`) · SDK: `terminarRelacionDelTercero`**

**Parámetros**

| Nombre | En | Tipo | Requerido | Detalle |
|---|---|---|---|---|
| `id` | path | uuid | sí |  |

**Respuestas**

- `204` Sin contenido

**Errores de negocio que lanza**

- `404` `relacion-no-encontrada`
- `409` `relacion-de-la-ficha`

<details><summary>Ejemplo de petición y respuesta</summary>

```bash
curl -X DELETE "https://{host}/public/v1/tercero/relaciones/3fa85f64-5717-4562-b3fc-2c963f66afa6" \
  -H "Authorization: Bearer $TOKEN_DE_LA_SESION_DEL_TERCERO"
```

</details>

### `POST /public/v1/tercero/relaciones/{id}/confirmar`

**Confirmar relacion del tercero.** Confirma lo que detectó la IA (una propuesta): la persona pasa a ser la relación vigente del tipo. Como la ficha legal es el único lugar donde se registran los representantes legales, suplentes y socios, confirmar también escribe a la persona en la sección `FICHA_LEGAL` (versión nueva, en la misma transacción) y la relación queda de la ficha. Si la propuesta es la principal, la que lo era sale (termina y deja la ficha) y, con ella, lo que se había validado de ella en los expedientes abiertos: sus requisitos de persona se eximen y los de la persona nueva se piden (ADR-0010, regla 5). Repetir la confirmación no cambia nada.

**Sesión del tercero · Portal del tercero (`/public/v1`) · SDK: `confirmarRelacionDelTercero`**

**Parámetros**

| Nombre | En | Tipo | Requerido | Detalle |
|---|---|---|---|---|
| `id` | path | uuid | sí |  |

**Respuestas**

- `200` OK — RelacionEntreTercerosDto
- `404` No encontrado

Campos de la respuesta `200`:

Mismos campos de `RelacionEntreTercerosDto` que se detallan en `POST /public/v1/tercero/relaciones`.

**Errores de negocio que lanza**

- `404` `relacion-no-encontrada`
- `404` `tercero-no-encontrado`

<details><summary>Ejemplo de petición y respuesta</summary>

```bash
curl -X POST "https://{host}/public/v1/tercero/relaciones/3fa85f64-5717-4562-b3fc-2c963f66afa6/confirmar" \
  -H "Authorization: Bearer $TOKEN_DE_LA_SESION_DEL_TERCERO"
```

Respuesta `200`:

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "personaId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "identificacion": {
    "pais": "CO",
    "tipo": "texto",
    "numero": "900123456",
    "digitoVerificacion": "texto"
  },
  "nombre": "Constructora Norte S.A.S.",
  "tipo": "texto",
  "principal": true,
  "participacion": 1,
  "cargo": "texto",
  "vigenteDesde": "2026-11-12",
  "vigenteHasta": "2026-11-12",
  "estado": "texto",
  "fuente": "texto",
  "deFicha": true,
  "confianza": 1,
  "confirmadaEn": "2026-11-12T15:00:00Z",
  "documentos": [
    {
      "tipoCanonico": "texto",
      "nombre": "Constructora Norte S.A.S.",
      "documentoId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "version": 1,
      "estado": "texto",
      "cargadaEn": "2026-11-12T15:00:00Z",
      "pedido": false
    }
  ],
  "reemplaza": {
    "relacionId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "nombre": "Constructora Norte S.A.S.",
    "identificacion": {
      "pais": "CO",
      "tipo": "texto",
      "numero": "900123456",
      "digitoVerificacion": "texto"
    }
  }
}
```

</details>

### `POST /public/v1/tercero/relaciones/{id}/descartar`

**Descartar relacion del tercero.** Descarta lo que detectó la IA: la propuesta no cambia nada y no vuelve a ofrecerse por esa versión del documento.

**Sesión del tercero · Portal del tercero (`/public/v1`) · SDK: `descartarRelacionDelTercero`**

**Parámetros**

| Nombre | En | Tipo | Requerido | Detalle |
|---|---|---|---|---|
| `id` | path | uuid | sí |  |

**Respuestas**

- `204` Sin contenido

**Errores de negocio que lanza**

- `404` `relacion-no-encontrada`

<details><summary>Ejemplo de petición y respuesta</summary>

```bash
curl -X POST "https://{host}/public/v1/tercero/relaciones/3fa85f64-5717-4562-b3fc-2c963f66afa6/descartar" \
  -H "Authorization: Bearer $TOKEN_DE_LA_SESION_DEL_TERCERO"
```

</details>
