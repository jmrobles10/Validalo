---
titulo: "Replica una empresa del SRM y prueba la validación de punta a punta"
seccion: "Flujo de punta a punta"
resumen: "Guía para Producto: con la base local en blanco, configura a mano una constructora como funciona hoy en el SRM (grupo, empresa, áreas, documentos, flujo, motivos y textos), invita a un proveedor y recorre la validación completa hasta verificar su certificado."
---

# Replica una empresa del SRM y prueba la validación de punta a punta

Guía para Producto: con la base local en blanco, configura a mano una constructora como funciona hoy en el SRM (grupo, empresa, áreas, documentos, flujo, motivos y textos), invita a un proveedor y recorre la validación completa hasta verificar su certificado.

Esta guía es para probar Valídalo **a mano**, en el entorno local, partiendo de una base en blanco: solo existe el operador de la consola de Plataforma (lo deja `pnpm semilla:plataforma`). Al terminar tendrás una constructora configurada como funciona hoy en el SRM y un proveedor validado de punta a punta, con su certificado verificado.

Está en tres partes: primero **los conceptos** en lenguaje llano y su equivalente en el SRM y el Portal; después **cómo está configurada hoy una constructora en el SRM** y dónde va cada cosa en Valídalo; y por último **los pasos, pantalla por pantalla**, con qué escribir en cada campo y cómo comprobar que quedó bien. Al final están los **errores típicos**.

Cada paso dice si es **Obligatorio** (sin él el flujo no avanza) u **Opcional** (enriquece la prueba, pero se puede saltar). El detalle de cada pantalla, con pantallazos, está en los recorridos del manual que se enlazan; aquí no se repiten.

## Antes de empezar

| Qué | Dónde |
|---|---|
| Consola de Plataforma | `http://localhost:5173/#/plataforma` → «Usar la sesión de desarrollo» → «Entrar como operador de Plataforma» |
| App de la empresa | `http://localhost:5173` |
| Portal del tercero | `http://localhost:5181` |
| API | `http://localhost:5080` |
| Correos (Mailpit) | `http://localhost:8025`: aquí llegan **todos** los correos (códigos, invitaciones, observaciones, aprobación). Ningún correo sale a internet. |

Tres cosas que conviene saber antes:

- **No hay contraseñas.** Las personas de la empresa entran con su correo y un código de 6 dígitos que llega a Mailpit. Ningún rol exige una **passkey**: el código basta, aun para el **Administrador**, el **Oficial de cumplimiento** y el **Auditor**; si quieres entrar más rápido, registra una desde Mi cuenta (huella, rostro o PIN de Windows Hello). Si tu equipo no tiene Windows Hello, en Chrome puedes usar *DevTools › More tools › WebAuthn › Enable virtual authenticator environment*, pero esa passkey se pierde al cerrar DevTools: prefiere Windows Hello.
- **Usarás varias personas a la vez.** La sesión vive en una cookie del navegador, así que para tener a dos personas abiertas al tiempo usa **perfiles distintos de Chrome** (o Chrome y Edge), o una ventana de incógnito. El tercero va en el puerto 5181, que es otro sitio, y no choca con la app.
- **Los correos pueden ser inventados.** Mailpit atrapa cualquier dirección. Usa el dominio `.test` para no confundirte con correos reales.

**Datos de ejemplo** (puedes cambiarlos; úsalos igual en todos los pasos):

| Quién | Nombre | Correo | Rol |
|---|---|---|---|
| Administrador del grupo | Ana Administradora | `ana@andina.test` | Administrador de todo el grupo (passkey opcional) |
| Revisora de compras | Rita Revisora | `rita@andina.test` | Revisor en la empresa (sin passkey) |
| Oficial de cumplimiento | Óscar Oficial | `oscar@andina.test` | Oficial de cumplimiento en la empresa (passkey opcional) |
| Proveedor (tercero) | Ferretería El Tornillo S.A.S., NIT 900777888 | `compras@tornillo.test` | — |

## Parte 1. Los conceptos, en lenguaje llano

### El mapa

![Cómo se relacionan los conceptos de Valídalo](diagramas/conceptos-empresa.svg)

Léelo de arriba abajo: **Plataforma** (Sincosoft) da de alta a un cliente, que es un **grupo empresarial**. El grupo tiene una o varias **empresas** (razones sociales). Cada empresa **invita** a un **tercero** en un **tipo de vínculo** (Proveedor); eso crea un **vínculo**. Cuando el tercero acepta, se abre un **expediente** con el **flujo aprobatorio** de la empresa; las **áreas** revisan por **etapas** y, si todo se aprueba, sale un **certificado**. El tercero es uno solo en toda la plataforma: su **bóveda** (documentos) y su **ficha** (información) le sirven para todas las empresas que lo invitan.

### Grupo empresarial y empresa

Esta es la distinción que más confunde. En Valídalo:

- La **empresa** es una **razón social** con NIT: la que exige documentos, revisa, decide y certifica. Es exactamente lo que en el SRM y en el Portal se llama **constructora**. Cada empresa tiene sus propias áreas, flujos, textos legales y folios, y **sus decisiones son privadas**: ni siquiera otra empresa del mismo grupo ve lo que aprobó u observó.
- El **grupo empresarial** (en el código, el *tenant*) es el **cliente** de Valídalo: el conjunto de empresas que comparten administración. Comparte las personas y sus roles, el catálogo de tipos de documento, los tipos de vínculo, los motivos, el sistema integrado y las API keys. En el ERP Sinco equivale a **la base de datos de un cliente**: cada cliente tiene su base, con una o varias empresas (`dbo.Empresas`), y la sesión del ERP trae el `IdEmpresa` de quien entra (`ConstruirSession`). En el Portal no existe como tal: cada constructora es una fila de `dbo.Constructoras`, enlazada al ERP de su cliente (`ConstRuta_API`), y un cliente con cinco constructoras son cinco filas sueltas.

> **Diferencia importante con el SRM:** allá los maestros de proveedores (`adp_srm.*`, `adp_srm_apr.*`: documentos requeridos, flujos, perfiles, sectores, grupos de acceso) **no tienen columna de empresa**: valen para toda la base, y en la práctica cada base opera una sola constructora. En Valídalo lo que es de la empresa (áreas, flujos, textos legales, plantillas, folios) se configura **por empresa**, y lo que es del cliente (personas, tipos de documento, motivos, grupos de acceso) **por grupo**.

Regla práctica: si tu cliente tiene **una sola** constructora, creas **un grupo con una empresa**. Si tiene varias razones sociales (por ejemplo, la constructora y la inmobiliaria), creas **un grupo con varias empresas**.

### El administrador del grupo

Es la primera persona del cliente: la que Plataforma nombra al crear el grupo. Tiene el rol **Administrador en todo el grupo**: crea personas, áreas, tipos de documento, flujos, motivos, plantillas y API keys, y puede aprobar en nombre de un área. En el SRM se parece al **perfil administrador del flujo** (`PerfilAdministradorFlujo`) y a los usuarios con todos los permisos del módulo. Debe registrar passkey.

### Sistema integrado y API key

El **sistema integrado** es el software del cliente que habla con Valídalo: en producción será el **SRM o el ERP Sinco**, que crea vínculos por API, consulta si un proveedor está certificado antes de pagarle y abre las pantallas de Valídalo dentro de las suyas (embebidas), firmando quién es la persona con una clave pública. La **API key** es la credencial de ese sistema (`X-Api-Key`), con permisos y empresas.

En el SRM el equivalente es el par de credenciales con que el SRM y el Portal se hablan hoy (`TokenAdproveedor.Token_Zuppla` hacia el Portal y `Constructoras.ConsApiKey` del lado del Portal). **Para esta prueba a mano no lo necesitas**: crea el grupo solo con «Directo a Valídalo» y todo se hace desde las pantallas.

### Tipo de vínculo y vínculo

- El **tipo de vínculo** dice qué clase de relación es: Proveedor, Cliente, Empleado, Usuario. Al crear el grupo se siembran los cuatro. El **Proveedor** sembrado exige **un código por correo** al abrir los enlaces y una **cuenta bancaria designada** aprobada por dos personas antes de aprobar el expediente. El SRM solo conoce proveedores.
- El **vínculo** es la relación concreta de **una empresa con un tercero en un tipo**: «El Tornillo es proveedor de Constructora Andina». Tiene estado (Invitado, En validación, Activo, Por vencer, Vencido, Bloqueado…). Es la **Solicitud** del SRM (`adp_srm.Solicitudes`) y el registro `TercerosConstructora` del Portal.

### Tercero y su bóveda

El **tercero** es el proveedor (persona jurídica, natural o consorcio), identificado por país, tipo y número de identificación. Es **uno solo en toda la plataforma**: si dos clientes lo invitan, es el mismo. Su **bóveda** guarda sus documentos con todas sus versiones: sube el RUT **una vez** y cada empresa que se lo pide lo revisa por su cuenta. Una empresa **solo ve** la bóveda cuando el tercero acepta **su** invitación, y solo lo que su flujo pide. En el Portal es la tabla `Terceros` con los archivos en disco (`Adjuntos`, `AdjuntoTercero`); allá cada constructora tenía una «copia espejo» (`AdjuntosConstructora`), que aquí se reemplaza por la versión aceptada por cada empresa.

### Flujo aprobatorio, etapas y áreas

- Un **área** es un equipo revisor de la empresa (Compras, Jurídica, Financiera, Cumplimiento) con sus **miembros**. En el SRM son los **perfiles de aprobación** (`adp_srm_apr.PerfilAprobacion`).
- El **flujo aprobatorio** es la receta de una empresa para un tipo de vínculo: **qué documentos y secciones de la ficha pide** (y a quién), **qué áreas revisan** y **en qué orden**, plazos, vigencia y verificaciones de cumplimiento. Se edita como borrador y se **publica**; los expedientes guardan la versión con la que nacieron. En el SRM es `FlujosAprobacion` + `PerfilAprobacion` + la matriz `DocumentosRequeridos`, que allá cambiaban en caliente.
- Las **etapas** van **en secuencia**; las áreas de una misma etapa revisan **en paralelo**. Es el `OrdenApr` de los perfiles del SRM: perfiles con el mismo orden son una etapa.

### Requisitos y tipos de documento (canónicos y propios)

- Un **tipo de documento** es lo que se puede pedir: RUT, Cámara de comercio, Certificación bancaria, un formato propio… Es del **grupo**. Define el formato (PDF, imagen), el peso, la **vigencia** («vale N días desde su expedición», «N días desde que se entrega» o «no vence»), los días de aviso y de gracia, una plantilla para descargar y, si quieres, un formulario con campos.
- Un tipo **canónico** («documento de la plataforma») parte de uno conocido por Valídalo (RUT, CAMARA_COMERCIO, CEDULA, ESTADOS_FINANCIEROS, CERTIFICACION_BANCARIA, POLIZA, FORMATO_VINCULACION…): es el que hace que el RUT de una empresa y el RUT de otra sean **el mismo documento** compartido en la bóveda, y trae techos de formato y vigencia que no se pueden relajar. Un tipo **propio** («Ninguno: es un documento propio») es privado de cada vínculo y no se comparte. En el Portal todo era `TipoAdjuntoTercero`, con ids mágicos (12 Cámara persona jurídica, 18 persona natural, 1011 tratamiento de datos…).
- Un **requisito** es una línea del expediente: «este expediente exige el RUT, obligatorio, lo revisa Compras». Sale del flujo al abrir el expediente. Es la `DocumentacionPendiente` del SRM.

### Expediente, certificado y ficha del tercero

- El **expediente** es una pasada del flujo sobre un vínculo: se abre cuando el tercero acepta, se llena con lo que entrega, lo revisan las áreas y termina **Aprobado**, **Rechazado**, **Caducado** o **Anulado**. Hay expedientes iniciales, de **actualización** (el tercero cambió algo ya aprobado) y de **renovación** (algo venció). Lleva folio `{PREFIJO}-E-{año}-{n}`. En el SRM no hay entidad aparte: es el estado de la `Solicitud` (`SolEstado` -3, -4, -7…).
- El **certificado** es la constancia verificable de que un vínculo quedó aprobado: folio `{PREFIJO}-C-{año}-{n}-{emisión}`, PDF con QR, sello digital y una página pública donde cualquiera lo verifica. **No existe en el SRM** (lo más cercano es el estado «Completada» y la hoja de vida en PDF).
- La **ficha del tercero** («Mi información» en el portal) es su información estructurada por **secciones**: general, tributaria, legal (representantes y socios), financiera, SST y especialidades, más cuentas bancarias y contactos. El tercero la llena **una vez** y le sirve para todas las empresas; cada empresa acepta su versión. Son los formularios del Portal (`TerInformacionGeneral`, `TerInfoTributaria`, `TerCamaraComercio`, `TerInfoFinanciera`, `TerSISO`, `TerCuentaBancaria`).

### Cuestionarios, grupos de acceso y sectores

- Un **cuestionario** evalúa al proveedor con preguntas que pesan, puntúan y pueden eliminar, con un umbral de aprobación; lo responde el tercero (autoevaluación) o alguien de la empresa. El flujo puede pedirlo. Es la **evaluación de proveedores** del SRM.
- Un **sector** es una sección de la ficha (información general, tributaria, legal, financiera, SST, especialidades). Sirve para dos cosas: acotar lo que ve o decide un **grupo de acceso**, y nombrar al **responsable** que revisa esa sección cuando el tercero la cambia después de aprobada. En el SRM son `SectoresAcceso` y `SectoresActualizacion` (allá eran dos listas; aquí son la misma).
- Un **grupo de acceso** es un paquete de permisos que se da a personas, por ejemplo «Tesorería: ve y decide solo la información financiera». Los cuatro roles fijos (Administrador, Revisor, Oficial de cumplimiento, Auditor) son grupos predefinidos y lo que puede una persona es la suma de sus roles y sus grupos. En el SRM son los **grupos de acceso** (`GruposAcceso` con sus opciones y sectores), pero allá solo ocultan pantallas; aquí el servidor los exige en cada consulta.

### Resumen de equivalencias

| Valídalo | SRM | Portal de Proveedores |
|---|---|---|
| Grupo empresarial (tenant) | La base del ERP de un cliente, con sus empresas (`dbo.Empresas`) | No existe: constructoras sueltas |
| Empresa | Empresa del ERP (`IdEmpresa`): la constructora | `dbo.Constructoras` |
| Administrador del grupo | Perfil administrador del flujo, usuario con todos los permisos | — |
| Sistema integrado y API key | `TokenAdproveedor.Token_Zuppla`, `ADPConfig` | `Constructoras.ConsApiKey` |
| Tipo de vínculo | Solo «proveedor» | Solo «proveedor» |
| Vínculo | `Solicitudes` | `TercerosConstructora` |
| Tercero | `Solicitudes.SolNIT` + tercero de AyF | `Terceros` |
| Bóveda y versiones | Copia al aprobar (`adp_srm.AdjuntoTercero`) | `Adjuntos`, `AdjuntoTercero`, `AdjuntosConstructora` |
| Ficha y secciones | Lee lo del Portal | `TerInformacionGeneral`, `TerInfoTributaria`, `TerCamaraComercio`, `TerInfoFinanciera`, `TerSISO`, `TerCuentaBancaria` |
| Tipo de documento | Matriz `DocumentosRequeridos` | `TipoAdjuntoTercero` |
| Flujo, etapas y áreas | `FlujosAprobacion`, `PerfilAprobacion.OrdenApr` | — |
| Requisito | `DocumentacionPendiente` | Documentos requeridos que pide al SRM |
| Expediente | Estado de la `Solicitud` | Estado de `TercerosConstructora` |
| Observación con motivos | Rechazo con motivos que el proveedor corrige («novedad», `LogAprobacionesRechazo`) | Novedades |
| Certificado | No existe | No existe |
| Grupo de acceso y sector | `GruposAcceso`, `SectoresAcceso`, `SectoresActualizacion` | — |
| Cuestionario | Evaluación de proveedores | — |

## Parte 2. Cómo está configurada hoy una constructora en el SRM

Lo que sigue se leyó del código del SRM y del Portal (sin conectarse a ninguna base). Los repositorios **no traen los datos** de los catálogos (los nombres de los tipos de documento, los motivos, los grupos y las especialidades): para replicar una constructora real, abre su SRM y copia de sus pantallas de maestros los valores de cada fila de esta tabla.

| Maestro en el SRM | Qué configura y dónde vive | Dónde va en Valídalo |
|---|---|---|
| **Tipos de documento** | Catálogo global del Portal (`dbo.TipoAdjuntoTercero`, por región). Un documento sirve para todas las constructoras, salvo las declaraciones propias de cada una (ids 1011, 1013, 1015, 1019, 1183, 1185). La constructora puede escribir una observación por tipo (`DocumentosObservacionConstructora`). | Configuración › **Tipos de documento** (del grupo). Los conocidos se crean desde su canónico y se comparten; las declaraciones propias son tipos **propios**, «solo de este vínculo». La observación es la **Ayuda de documentos** de la empresa. |
| **Matriz de exigencia** | `adp_srm.DocumentosRequeridos`: qué tipo se exige a quién (`TipoRequerido`: 0 Todos, 1 Grupos, 2 Categorías, 3 Especialidad, 4 Tipo de persona N/J, 5 Etiquetas), con días de vencimiento y plantilla. Pantalla «Maestro de especialidades». Se replica al Portal en `DocumentosVencimientoConstructora`. | **Documentos que pide** el flujo, con «Se pide a»: Todos, Solo jurídicas, Solo naturales o «Según la ficha» (especialidades o CIIU). Los días de vencimiento van en el **tipo de documento** y la plantilla también. Grupos, categorías y etiquetas: ver «Sin equivalente». |
| **Áreas aprobadoras** | `adp_srm_apr.PerfilAprobacion`: cada perfil del ERP es un aprobador, con su orden (`OrdenApr`) y banderas (`Sarlaft`, `Anular`, `EditarDoc`, `UsuariosNotifica`). Administradores en `PerfilAdministradorFlujo`. Pantalla «Flujo de aprobación». | Configuración › **Áreas** (una por perfil) y sus **miembros** (las personas que hoy tienen ese perfil). El administrador del flujo es el rol **Administrador**, que puede aprobar en nombre de un área. |
| **Flujos** | `FlujosAprobacion` (varios flujos) y la solicitud guarda el suyo (`SolFlujoId`). | Configuración › **Flujos aprobatorios**: uno por tipo de vínculo y por defecto; el lote puede indicar otro flujo por fila. Perfiles con el mismo `OrdenApr` = una **etapa** con áreas en paralelo. «Puede rechazar» reemplaza a `Anular`. |
| **Sectores** | Secciones de la ficha (`TipoSectoresEnum`: General, Legal, Bancaria, Tributaria, SISO, Documentos, Especialidades, Financiera, Sagrilaft…). Responsable de cada uno en las actualizaciones (`SectoresActualizacion.IdUsuarioResponsable`); interesados por sección (`NotificacionesGenerales`). | Las **secciones de la información** que pide el flujo y el **Responsable por sector** del flujo (un área, no una persona). La bancaria la cubre la **cuenta designada** con dos aprobadores. |
| **Grupos de acceso** | `GruposAcceso`, `UsuariosGrupo`, `OpcionesAcceso` (4 opciones) y `SectoresAcceso` (40 sectores de pantalla). Pantalla «Grupos de acceso». Solo ocultan pantallas. | Configuración › **Grupos de acceso**: permisos del catálogo más sectores de la ficha con «Ver» o «Ver y decidir»; el servidor los exige. |
| **Motivos** | Maestro global del Portal `apr.MotivoRechazo` (`MotCodigo`, `MotTexto`), más los propios tipos de documento como motivo; categoría documento, formulario o contacto (código que empieza por «20»). | Configuración › **Motivos**: ocho de la plataforma más los propios, con categoría (Documento, Formulario, Contacto, Otro), si sirven para observar o rechazar y el texto al tercero. |
| **Vigencias** | Tres fuentes que no se cruzan: días por documento en la matriz (`DiasVencimiento`), vigencia por sección (`SectoresVencimiento`: 365 días y 90 de aviso por defecto) y el plazo para completar la documentación (180 días). Parámetros en `ADPConfig` (`FechaOrigenVence`, `DiasVtoNotificaProv`). Proceso nocturno del Portal a las 22:00. | Una por cosa: la **vigencia del tipo de documento** (días desde la expedición o la entrega, avisos y gracia), la **vigencia de cada sección** en el flujo, la **vigencia del vínculo** del flujo y el **plazo de cargue** (30 días por defecto). Los ejecuta el propio Valídalo. |
| **SAGRILAFT y oficial de cumplimiento** | Estudio del oficial (`EstudioSeguridad`: estado, nivel de riesgo, días de vigencia; aprobación con lista restrictiva, conflicto de interés y debida diligencia), consulta a listas por un proveedor externo (`AdjuntosSarlaft`), listas vinculantes (`Listavinculantes`), y en `ADPConfig` si el oficial es obligatorio (`SRM_ValidaOficial`, `AplicaSarlaft`). PEP, socios y beneficiarios en la ficha legal. | **Verificaciones de cumplimiento** del flujo (Listas restrictivas y Estudio del oficial, bloqueantes), el rol **Oficial de cumplimiento** con su bandeja, la **matriz de riesgo** y las **listas restrictivas** de la empresa, y la **declaración PEP** y personas relacionadas del tercero. |
| **Evaluación del proveedor** | Preguntas de selección para proveedores nuevos (`PreguntaEvaluacionTerceroNuevo`, puntajes por solicitud). Sin reevaluación. | Configuración › **Cuestionarios**: preguntas con peso, eliminatorias, umbral, quién responde y repetición periódica; el flujo lo pide. |
| **Plantillas de correo** | 37 plantillas `.txt` por NIT de la empresa (`ADP_CS.PlantillasNotificacion`): invitación, rechazo, documentación pendiente, vencimientos… | Configuración › **Plantillas de correo**: asunto, cabecera y pie por correo; el cuerpo lo arma Valídalo. |
| **Textos legales** | Declaración y autorización por NIT (`Plantillas\DeclaracionAutorizacion\{NIT}_…txt`), aceptada en el Portal (`TercerosConstructora.Autorizo` y el adjunto 1011). | Configuración › **Empresas del grupo** › textos legales: autorización de datos y términos, versionados, con constancia de aceptación. |
| **Perfil de la constructora** | Datos, documentos y publicaciones de la constructora (`DatosConstructora`, `DocumentosConstructora`). | **Datos y marca** de la empresa (contacto de soporte, logo y color de marca). |
| **Invitación** | Desde el SRM (`Solicitudes` + correo con usuario y contraseña) o por lote (`InvitacionLote`); autorregistro en el Portal. | **Invitar tercero** (uno) o **Invitar por lote** (varios) en la app, `POST /vinculos` desde el sistema integrado o autorregistro. Sin contraseñas: enlace de un solo uso más código. |

### Lo que no tiene equivalente (o es distinto)

- **Grupos, categorías y etiquetas de proveedor** (`GruposTercero`, `CategoriasTercero`, `TagProveedor`) **no existen como catálogo**. Lo más cercano son los **atributos del tipo de vínculo** (el Proveedor sembrado trae `categorias` con Materiales, Servicios, Equipos y Mano de obra, y `nivelRiesgo`), que un flujo puede usar en «Se pide a» como `vinculo.atributos.categorias`; esa condición se arma por API (la pantalla la muestra como «personalizada») y la pantalla ofrece los atajos por tipo de persona y por la ficha. Las **especialidades** sí están, en la ficha del tercero.
- **Clasificación por tamaño de empresa** (`TamanoEmpresa`, UVT): no existe.
- **Aprobación inicial** (`UserAprInicial`, estado -7) como paso aparte: no existe tal cual. Se modela como una primera etapa del flujo o con la **aprobación antes de invitar** del tipo de vínculo.
- **Perfil de aprobación = perfil del ERP:** en Valídalo un área tiene personas, no perfiles. Las personas entran por correo o desde el sistema integrado.
- **Crear el proveedor en AyF** al aprobar: lo hace el sistema integrado al recibir el webhook `expediente.aprobado` o al consultar la certificación; Valídalo no escribe en el ERP.
- **Listas vinculantes** (maestro propio de listas): no existe. Las listas las consulta el proveedor configurado (Infolaft, Stradata, Compliance; en local, un simulador).
- **Formulario de origen de fondos o de conocimiento ampliado:** tampoco existe en el SRM; en Valídalo se puede crear como tipo de documento con formulario o como cuestionario.
- **El certificado verificable** y la **bóveda compartida con decisiones privadas** son nuevos: no existían en el SRM ni en el Portal.

## Parte 3. Los pasos, pantalla por pantalla

Sigue el orden: cada paso deja listo algo que el siguiente necesita.

### Paso 1. Crea el grupo, la empresa y su administrador (Obligatorio)

**Dónde:** consola de Plataforma, `http://localhost:5173/#/plataforma` → «Usar la sesión de desarrollo» → «Entrar como operador de Plataforma» → **Grupos y empresas** → **Nuevo grupo**.

| Campo | Qué escribir |
|---|---|
| Nombre del grupo | `Grupo Andino` |
| Identificador | Se propone solo (`grupo-andino`). Minúsculas, números y guiones; **no cambia después** y va dentro de las API keys. |
| Zona horaria | Déjala en `America/Bogota`. |
| Primera empresa: país y tipo | `CO` y `NIT` |
| Número | `900123456` (el dígito de verificación es opcional: Valídalo lo calcula y lo compara) |
| Razón social | `Constructora Andina S.A.S.` |
| Prefijo | `CAND` (de 2 a 10 mayúsculas o números; **después solo Plataforma puede corregirlo**, y los códigos ya emitidos conservan el anterior; encabeza los folios `CAND-E-2026-…` y `CAND-C-2026-…`) |
| Administrador: nombre y correo | `Ana Administradora`, `ana@andina.test` |
| Su usuario en el sistema | Vacío |
| Cómo entra la gente del grupo | Marca **solo «Directo a Valídalo»**. Así no aparece la sección del sistema integrado y no necesitas una clave pública. |

Pulsa **Crear grupo**. La pantalla muestra la **API key de administración una sola vez**: para esta prueba no la necesitas, pero si quieres probar la API después, cópiala ahora.

Al crear el grupo, Valídalo siembra solo los **tipos de vínculo** (Proveedor, Cliente, Empleado, Usuario) y seis **tipos de documento** enlazados a su canónico (RUT, Cámara de comercio, Cédula, Estados financieros, Certificación bancaria y Póliza). No se pide ninguno hasta que un flujo lo incluya. Con «Directo a Valídalo», Ana recibe además un correo de invitación en Mailpit.

**Comprueba:** «Volver a los grupos» muestra `Grupo Andino` con `Constructora Andina S.A.S.` dentro; en Mailpit hay un correo para `ana@andina.test`.

> **Recorridos:** [Crea un grupo con su primera empresa](../plataforma/crear-grupo-y-empresa.md) · [Busca un grupo y revisa sus empresas](../plataforma/lista-de-grupos.md) · [Agrega una empresa a un grupo existente](../plataforma/agregar-empresa-a-un-grupo.md)

### Paso 2. Plan de IA de la empresa (Opcional)

Sin plan de IA los documentos se revisan **a mano** (nivel Manual), que es como funciona hoy el SRM. Si quieres probar la lectura automática, en la misma pantalla pulsa «Configurar el plan de IA de Constructora Andina S.A.S.» (o desde la fila de la empresa): validaciones incluidas por mes (por ejemplo `100`), **Plan activo** y una **API key de OpenAI** propia (empieza por `sk-`; «Probar llave» comprueba que sirve sin gastar tokens). Sin llave, el plan no paga análisis y todo sigue siendo manual: la prueba de punta a punta funciona igual.

**Comprueba:** la fila de la empresa muestra el plan activo y la llave como «Configurada · ••••XXXX».

> **Recorridos:** [Configura el plan de IA de una empresa y su llave de OpenAI](../plataforma/plan-de-ia-y-llave-openai.md) · [Revisa el plan y el uso de IA de la empresa](../ia/plan-y-uso-de-ia.md) · [Elige el nivel de revisión automática con IA](../ia/revision-automatica-niveles.md)

### Paso 3. Entra como administradora con el código de Mailpit (Obligatorio)

1. En otro perfil del navegador abre `http://localhost:5173`, escribe `ana@andina.test` y pulsa **Continuar**.
2. En Mailpit abre el correo «Tu código para ingresar a Valídalo» y escribe el código (vale 5 minutos y admite 5 intentos).
3. Valídalo abre la sesión con el código y te **sugiere registrar una passkey** (es opcional): si quieres, acéptala desde Mi cuenta y usa tu huella, rostro o PIN de Windows Hello.

**Comprueba:** entras a `Inicio` de Constructora Andina con la barra lateral de Administrador y el engranaje de **Configuración**. Si recargas, no pide código otra vez.

> **Recorridos:** [Entra a Valídalo con tu correo y un código](../acceso/ingreso-directo-por-correo.md) · [Registra una passkey y entra con tu huella o tu rostro](../acceso/ingreso-con-passkey.md) · [Elige cómo entran las personas de tu grupo y exige passkey](../acceso/ingreso-configuracion-del-grupo.md)

### Paso 4. Publica los textos legales de la empresa (Obligatorio)

**Dónde:** Configuración › **Empresas del grupo** → fila de Constructora Andina.

Escribe y publica la **autorización de tratamiento de datos** y los **términos y condiciones** (cada uno queda como versión 1). Copia los que usa hoy la constructora en el Portal o escribe un texto de prueba. **Sin los dos, el tercero no puede aceptar la invitación.**

**Comprueba:** los dos textos aparecen con «Versión 1» y la fecha desde la que rigen.

> **Recorridos:** [Agrega una empresa del grupo y publica sus textos legales](../configuracion/empresas-y-textos-legales.md)

### Paso 5. Crea a las demás personas (Obligatorio)

**Dónde:** Configuración › **Usuarios y roles** → agregar persona.

| Persona | Roles |
|---|---|
| Rita Revisora, `rita@andina.test` | Revisor en `Constructora Andina S.A.S.` |
| Óscar Oficial, `oscar@andina.test` | Oficial de cumplimiento en `Constructora Andina S.A.S.` |

Deja marcada «Enviar una invitación por correo». Hacen falta **dos personas que puedan aprobar la cuenta bancaria** del proveedor (permiso `cuentas:aprobar`, que tienen Administrador y Oficial de cumplimiento): por eso está Óscar. Rita, como Revisor, revisa expedientes pero no aprueba cuentas.

**Comprueba:** la tabla muestra a cada persona con su rol y «Último ingreso: Nunca». Una persona «Sin roles» no puede hacer nada.

> **Recorridos:** [Agrega una persona, dale roles y desactívala](../configuracion/usuarios-y-roles.md) · [Comprueba qué secciones ve cada rol](../configuracion/permisos-por-rol.md)

### Paso 6. Crea las áreas y asígnales personas (Obligatorio)

**Dónde:** Configuración › **Áreas**. Replica los perfiles de aprobación de la constructora en el SRM. Para la prueba:

| Código | Nombre | Miembros |
|---|---|---|
| `COMPRAS` | Compras | Rita |
| `JURIDICA` | Jurídica | Ana |
| `FINANCIERA` | Financiera | Ana |
| `CUMPLIMIENTO` | Cumplimiento | Óscar (opcional: solo si vas a usarla en el flujo) |

El código va en mayúsculas y no cambia después. Solo se pueden agregar personas que ya tienen un rol en la empresa (paso 5). Un área sin miembros nunca aprueba.

**Comprueba:** cada área muestra su número de miembros y está activa.

> **Recorridos:** [Crea un área, asígnale personas y desactívala](../configuracion/areas-y-miembros.md)

### Paso 7. Revisa y ajusta los tipos de documento (Obligatorio revisar; crear propios es Opcional)

**Dónde:** Configuración › **Tipos de documento**. Ya están los seis sembrados. Ajústalos a la matriz de la constructora (Parte 2) abriendo cada fila:

| Tipo | Ajuste sugerido |
|---|---|
| RUT | Solo PDF; vale 365 días desde su expedición (lo sugiere la plataforma). |
| Cámara de comercio | Solo PDF; **vale 30 días desde su expedición**, como en el SRM. |
| Certificación bancaria | Vale 90 días desde su expedición. |
| Estados financieros | Periodo: último año fiscal cerrado; avisos 60, 30 y 7 días. |
| Póliza | Vence según la fecha que declare el documento. |

Opcional, para replicar los formatos propios de la constructora (los tipos «por constructora» del Portal): **Nuevo tipo** → «Ninguno: es un documento propio» o parte de **Formato de vinculación** → código `FORMATO_VINCULACION_ANDINA`, nombre `Formato de vinculación de proveedores`, se entrega como **Archivo**, y sube la **plantilla** (PDF, DOCX o XLSX) que el proveedor descarga, llena, firma y sube.

**Comprueba:** la tabla muestra cada tipo activo con su resumen (qué recibe y cuánto vale).

> **Recorridos:** [Configura un tipo de documento y publica un flujo que lo pide](../configuracion/tipo-de-documento-y-flujo.md) · [Crea un documento a partir de uno de la plataforma](../configuracion/tipo-de-documento-de-la-plataforma.md) · [Crea un documento con formulario y plantilla descargable](../configuracion/tipo-de-documento-solo-formulario-y-plantilla.md) · [Escribe la ayuda que ve el tercero al subir un documento](../operacion/ayuda-de-documentos.md)

### Paso 8. Revisa el tipo de vínculo Proveedor (Obligatorio revisar)

**Dónde:** Configuración › **Tipos de vínculo** → Proveedor. Viene con:

- **Exige un código por correo en el enlace:** Sí. El tercero, además del enlace, escribe un código que le llega a Mailpit.
- **Exige cuenta bancaria designada:** Sí. Aunque todas las áreas aprueben, el expediente espera hasta que **dos personas distintas** aprueben la cuenta que designa el proveedor.

Déjalo así para probar el flujo completo. Si solo tienes una persona con passkey, desmarca la cuenta designada: el expediente se aprobará apenas decida la última área.

> **Recorridos:** [Crea un tipo de vínculo y lo desactiva](../configuracion/tipos-de-vinculo.md) · [Aprueba la cuenta bancaria designada de un proveedor](../vinculos/cuenta-designada-aprobar.md)

### Paso 9. Motivos de observación y rechazo (Opcional)

**Dónde:** Configuración › **Motivos**. Ya existen ocho de la plataforma que no se editan: ilegible, incompleto, vencido, no corresponde al tercero, datos no coinciden, formato no vigente, firma faltante y frescura incumplida. Agrega los propios de la constructora (Parte 2), por ejemplo:

| Código | Nombre | Categoría | Se usa al | Texto al tercero |
|---|---|---|---|---|
| `camara-sin-firma-revisor` | Cámara sin revisor fiscal | Documento | Observar | `El certificado de Cámara debe mostrar el revisor fiscal vigente.` |
| `lista-restrictiva` | Reportado en listas restrictivas | Otro | Rechazar | `No es posible continuar con la vinculación.` |

**Comprueba:** los motivos aparecen activos en la tabla.

> **Recorridos:** [Crea un motivo de observación propio y lo desactiva](../configuracion/motivos.md)

### Paso 10. Arma y publica el flujo aprobatorio (Obligatorio)

**Dónde:** Configuración › **Flujos aprobatorios** → **Nuevo flujo**.

**Datos generales**

| Campo | Qué escribir |
|---|---|
| Código | `HABILITACION_PROVEEDORES` (no cambia después) |
| Nombre | `Habilitación de proveedores` |
| Tipo de vínculo | Proveedor (no cambia después) |
| Si un área observa | «Devolver de inmediato» (como el SRM: el primer rechazo vuelve al proveedor) |
| Separación de funciones | Déjala en No para esta prueba (si la activas, Ana no podrá decidir porque ella invita) |
| Plazo de cargue | `30` días (el SRM usaba 180) |
| Vigencia del vínculo | `0` (no vence por tiempo). Si pones días, el flujo debe pedir al menos una sección de la ficha. |

**Etapas y áreas** (las etapas van en secuencia; las áreas de una etapa, en paralelo):

| Etapa | Áreas | Aprobadores | Puede rechazar |
|---|---|---|---|
| 1 | Compras | 1 | No |
| 2 | Jurídica y Financiera («Agregar área en paralelo») | 1 cada una | Jurídica: Sí |

**Documentos que pide** (botón «Agregar documento» en «Documentos que pide»):

| Documento | Lo revisan | Se pide a | Obligatorio |
|---|---|---|---|
| RUT | Compras | Todos | Sí |
| Cámara de comercio | Jurídica | Solo personas jurídicas | Sí |
| Certificación bancaria | Financiera | Todos | Sí |
| Estados financieros | Financiera | Solo personas jurídicas | No |
| Formato de vinculación (si lo creaste) | Compras | Todos | Sí |

**Secciones de la información** (en la misma lista, «Agregar sección»): Información general (Compras), Información tributaria (Financiera) e Información legal (Jurídica). Toda área del flujo debe revisar al menos un requisito.

**Opcionales en el mismo editor:**

- **Verificaciones de cumplimiento:** agrega **Listas restrictivas** y, si quieres, el **Estudio del oficial (SAGRILAFT)**, ambas bloqueantes. En local las listas usan un **simulador**: solo hay coincidencia si el nombre del tercero o de una de sus personas relacionadas contiene la palabra «coincidencia».
- **Responsable por sector en las actualizaciones:** por ejemplo, Financiera responde por la información tributaria cuando el tercero la cambie después de aprobada.
- **Documento según la ficha:** «Se pide a» › «Según la ficha del tercero» pide un certificado solo a quien declara una especialidad.

Pulsa **Crear borrador**, revisa que no queden campos en rojo y pulsa **Publicar** (confirma). Como es el primer flujo publicado para Proveedor, queda **por defecto**; si no, pulsa «Usar por defecto para Proveedor».

**Comprueba:** la lista de flujos muestra `Habilitación de proveedores` con «v1» publicada y la marca «Por defecto». Sin un flujo publicado por defecto, los terceros que aceptan quedan en «aperturas pendientes».

> **Recorridos:** [Configura un tipo de documento y publica un flujo que lo pide](../configuracion/tipo-de-documento-y-flujo.md) · [Arma una etapa con dos áreas en paralelo y una automática](../configuracion/flujo-etapas-y-areas-en-paralelo.md) · [Pide cada documento según el tipo de persona](../configuracion/flujo-condiciones-por-tipo-de-persona.md) · [Pide secciones de «Mi información» como requisito del flujo](../configuracion/flujo-secciones-de-la-ficha.md) · [Pide listas restrictivas y el estudio SAGRILAFT en el flujo](../configuracion/flujo-verificaciones-de-cumplimiento.md) · [Asigna un responsable por sector para las actualizaciones](../configuracion/responsable-por-sector.md) · [Pide un documento según lo que el tercero declara en su ficha](../configuracion/documento-segun-la-ficha.md) · [Fija el plazo de cargue, los recordatorios y el reintento](../configuracion/flujo-plazo-reintento-y-recordatorios.md) · [Cambia un flujo publicado con un borrador nuevo](../configuracion/flujo-versiones-y-borradores.md) · [Cambia el flujo por defecto de un tipo de vínculo](../configuracion/flujo-por-defecto.md)

### Paso 11. Lo demás de la configuración (Opcional)

Nada de esto es necesario para el recorrido básico; agrégalo para parecerte más a la constructora real:

- **Plantillas de correo** (Configuración › Plantillas de correo): asunto, cabecera y pie de la invitación y de los demás correos, con variables como `{{empresa}}`. [Personaliza el correo de invitación y restablécelo](../configuracion/plantillas-de-correo.md)
- **Grupos de acceso** (Configuración › Grupos de acceso): por ejemplo `TESORERIA`, con «Leer terceros», «Leer expedientes» y «Revisar expedientes», acotado al sector «Información financiera» con «Ver y decidir»; asígnalo a una persona en «Editar roles». [Crea un grupo de acceso y asígnalo a una persona](../configuracion/grupos-de-acceso.md)
- **Cuestionario de evaluación** (Configuración › Cuestionarios): código, umbral, quién responde y una pregunta eliminatoria; publícalo y pídelo en el flujo. [Crea y publica un cuestionario de evaluación de proveedores](../configuracion/cuestionario-de-evaluacion.md)
- **Listas restrictivas y matriz de riesgo** de la empresa. [Elige con qué proveedor se consultan las listas restrictivas](../cumplimiento/listas-restrictivas-de-la-empresa.md) · [Configura la matriz de riesgo SAGRILAFT de la empresa](../cumplimiento/matriz-de-riesgo-configuracion.md)
- **Plazos de revisión** (SLA por área) y **revisión automática** con IA. [Fija el plazo de revisión de cada área](../operacion/plazos-de-revision.md) · [Elige el nivel de revisión automática con IA](../ia/revision-automatica-niveles.md)

### Paso 12. Invita al proveedor (Obligatorio)

**Dónde:** **Vínculos** → **Invitar tercero** (uno solo) o **Invitar por lote** → **Nuevo lote** (varios; una sola fila basta).

**Con el formulario.** Elige el país «Colombia» y el tipo «NIT», escribe el número `900777888` (el dígito de verificación se calcula), la razón social «Ferretería El Tornillo S.A.S.», el correo `compras@tornillo.test` y el tipo de vínculo «Proveedor»: los tipos de vínculo y los flujos que ofrece son los que configuraste en la empresa. Pulsa **Invitar**: aparece el aviso «Invitación enviada a compras@tornillo.test.» y se abre el vínculo, en estado «Invitado».

**Con un lote.** Descarga la plantilla (la de Excel trae listas desplegables con lo configurado en la empresa y una hoja de instrucciones; la de CSV, separador `;`, solo los encabezados) y llénala así:

```text
Tipo de identificación;Número de identificación;Razón social o nombres;Correo;Tipo de vínculo;Tipo de persona
NIT;900777888;Ferretería El Tornillo S.A.S.;compras@tornillo.test;PROVEEDOR;Juridica
```

Súbela, revisa la vista previa (una fila válida), deja la vigencia de la invitación en 7 días y pulsa **Invitar a 1 tercero**.

**Comprueba:** con el lote, termina «1 de 1» con la fila «Exitosa · Invitado»; con cualquiera de los dos, el vínculo aparece en **Vínculos** como «Invitado» y en Mailpit hay un correo para `compras@tornillo.test` con el enlace.

> **Recorridos:** [Invita a varios terceros con un archivo](../operacion/invitacion-por-lotes.md) · [Revisa la lista de vínculos y filtra por estado y tipo](../vinculos/lista-y-filtros.md) · [Revisa el detalle de un vínculo](../vinculos/detalle-del-vinculo.md) · [Reenvía la invitación a un tercero](../vinculos/reenviar-invitacion.md) · [Invita a un proveedor desde tu sistema con la API](../integracion/invitar-por-api.md)

### Paso 13. El proveedor acepta y completa su expediente (Obligatorio)

Todo esto en el **portal del tercero** (`http://localhost:5181`), en otra ventana o perfil:

1. **Abre el enlace** del correo de invitación en Mailpit. Es de un solo uso.
2. **Escribe el código** que llega en otro correo (lo exige el tipo Proveedor).
3. **Acepta los textos**: el aviso de privacidad de Valídalo y la autorización y los términos de Constructora Andina. En ese momento se abre el expediente y el vínculo pasa a «En validación».
4. **Mi información:** completa las secciones que pide el flujo (general, tributaria, legal con su representante legal). La barra muestra lo que falta.
5. **Sube los documentos** desde «Tu revisión con Constructora Andina»: RUT, Cámara de comercio (con fecha de expedición de menos de 30 días) y Certificación bancaria, en PDF de hasta 20 MB.
6. **Mis cuentas:** registra la cuenta bancaria, respáldala con la certificación bancaria y **desígnala** para Constructora Andina.

Cuando todos los obligatorios están cargados, el expediente **pasa solo a revisión**: no hay botón «enviar».

**Comprueba:** el tercero ve «En revisión»; en la app, el vínculo está «En validación» y el expediente `CAND-E-2026-000001` aparece en la bandeja de Compras.

> **Recorridos:** [Acepta la invitación y completa tu información como persona jurídica](../tercero/aceptar-invitacion-persona-juridica.md) · [Sube un documento a tu bóveda](../tercero/boveda-subir-un-documento.md) · [Sube un documento que pide una fecha de expedición](../tercero/subir-documento-con-formulario.md) · [Completa tu información paso a paso](../tercero/ficha-barra-y-pendientes.md) · [Agrega a su representante legal como persona relacionada](../tercero/personas-relacionadas.md) · [Designa la cuenta en la que te paga una empresa](../tercero/cuentas-bancarias.md) · [Qué pasa cuando un enlace de invitación ya se usó, venció o no existe](../tercero/invitacion-vencida-o-usada.md)

### Paso 14. Compras aprueba la primera etapa (Obligatorio)

Entra como **Rita** (`rita@andina.test`, código de Mailpit; no pide passkey). En **Inicio** o en la **Bandeja** abre el expediente, revisa el RUT y la información general en el visor y **aprueba el área**.

**Comprueba:** Compras queda «Aprobada» y la etapa 2 se activa: el expediente aparece ahora para Jurídica y Financiera.

> **Recorridos:** [Revisa lo que te toca desde Inicio](../revision/inicio-lo-que-te-toca.md) · [Filtra la bandeja de revisión y abre un expediente](../revision/bandeja-de-revision.md) · [Aprueba el área de Compras](../revision/aprobar-un-area.md) · [Aprueba el expediente documento por documento](../revision/aprobar-documento-por-documento.md) · [Abre un documento para verlo y descargarlo](../revision/visor-y-datos-de-un-documento.md)

### Paso 15. Jurídica observa, el proveedor corrige y reenvía (Obligatorio para probar la «novedad»)

1. Como **Ana**, abre el expediente, marca la **Cámara de comercio** y **observa** con un motivo (por ejemplo «Ilegible» o el propio `camara-sin-firma-revisor`) y un texto para el proveedor. El expediente pasa a «Observado».
2. El proveedor recibe un correo con un enlace nuevo (y su código). En el portal ve «Tienes observaciones», **sube una versión nueva** de la Cámara y pulsa **Enviar respuesta**. Solo lo observado vuelve a revisión.
3. Ana ve la versión nueva y **aprueba** Jurídica; luego aprueba **Financiera** (certificación bancaria y tributaria).

**Comprueba:** el historial del expediente muestra la observación, la respuesta y las aprobaciones. Si el proveedor reenvía sin corregir, la pantalla lo impide (`requisitos-sin-corregir`).

> **Recorridos:** [Observa un documento con motivos](../revision/observar-con-motivos.md) · [Corrige lo que la empresa observó y responde](../tercero/responder-observaciones.md) · [Revisa lo que corrigió el proveedor tras una observación](../revision/responder-con-lo-corregido.md) · [Lee el historial de un expediente](../revision/historial-del-expediente.md) · [Rechaza un expediente por un hallazgo grave](../revision/rechazar-expediente.md)

### Paso 16. Cumplimiento y cuenta bancaria: el expediente se aprueba (Obligatorio)

- Si pusiste **listas restrictivas** en el flujo, se consultaron solas al pasar a revisión. Sin la palabra «coincidencia» en los nombres, quedan satisfechas. Con ella, **Óscar** analiza la coincidencia en su bandeja y la descarta (homónimo) o la confirma. Si pusiste el **estudio SAGRILAFT**, Óscar lo registra con nivel de riesgo y concepto.
- Con todas las áreas aprobadas, el expediente sigue «En revisión» con el aviso **«Falta la cuenta bancaria designada»**. Abre el vínculo: en la tarjeta «Cuenta bancaria designada» **Ana aprueba** (primera aprobación) y luego **Óscar aprueba** (segunda). La misma persona no cuenta dos veces.

En ese instante el expediente pasa a **Aprobado**, el vínculo a **Activo**, se emite el **certificado** y el proveedor recibe el correo de aprobación.

**Comprueba:** el expediente dice «Expediente aprobado»; el vínculo, «Activo»; el proveedor ve su revisión aprobada en el portal.

> **Recorridos:** [Revisa las listas restrictivas consultadas al pasar a revisión](../cumplimiento/pedir-listas-restrictivas.md) · [Analiza una coincidencia en las listas y la descarta por homónimo](../cumplimiento/analizar-una-coincidencia.md) · [Registra el estudio de cumplimiento de un proveedor](../cumplimiento/estudio-de-cumplimiento.md) · [Atiende lo pendiente de Cumplimiento desde su bandeja](../cumplimiento/bandeja-del-oficial.md) · [Aprueba la cuenta bancaria designada de un proveedor](../vinculos/cuenta-designada-aprobar.md) · [Ve que tu expediente quedó aprobado](../tercero/expediente-aprobado.md)

### Paso 17. Revisa y verifica el certificado (Obligatorio)

1. En la app, **Certificados** (o el detalle del vínculo) muestra el certificado `CAND-C-2026-000001-1` «Vigente». Descarga el PDF (lo genera un proceso en segundo plano: si aún no está, espera unos segundos).
2. Abre `http://localhost:5181/verificar/CAND-C-2026-000001-1` en una ventana sin sesión, o escanea el QR del PDF. La página comprueba **en el navegador** el hash y el sello digital y muestra el estado, la vigencia y lo que se aprobó.

**Comprueba:** la verificación dice que el certificado es auténtico y vigente, y la huella coincide con la impresa en el PDF.

> **Recorridos:** [Encuentra los certificados de la empresa](../informes/certificados.md) · [Verifica que un certificado es auténtico](../publico/verificar-certificado-autentico.md) · [Compara la huella impresa en el PDF con la del certificado](../publico/verificar-con-el-pdf.md) · [Bloquea, desbloquea o revoca un certificado](../informes/certificado-bloquear-y-revocar.md)

### Paso 18. Para seguir probando (Opcional)

- **Una segunda empresa del grupo** (Configuración › Empresas del grupo, por ejemplo `Inmobiliaria Andina S.A.S.`, prefijo `IAND`): publica sus textos y su flujo, invita al **mismo NIT** y comprueba que el proveedor no vuelve a subir su RUT y que las decisiones de una empresa no se ven en la otra. [Revisa una versión nueva de un documento que comparten dos empresas](../documentos/documento-compartido-entre-empresas.md) · [Abre la ficha de un tercero que trabaja con dos empresas del grupo](../vinculos/tercero-360.md)
- **Una actualización:** el proveedor sube un RUT nuevo; la empresa revisa solo lo que cambió y el certificado se reemite. [Sube una versión nueva de un documento ya aprobado](../tercero/subir-version-nueva.md) · [Revisa una versión nueva que llega mientras decides](../revision/actualizacion-de-un-documento.md)
- **Vencimientos, bloqueo y rechazo:** [Revisa los documentos que vencen en la lista de vencimientos](../documentos/vencimientos.md) · [Bloquea un vínculo y luego lo desbloquea](../vinculos/bloquear-y-desbloquear.md) · [Rechaza un expediente por un hallazgo grave](../revision/rechazar-expediente.md)
- **Persona natural:** invita una fila con `CC` y `Natural`: no verá las secciones legal ni financiera ni la Cámara. [Acepta la invitación y completa tu información como persona natural](../tercero/aceptar-invitacion-persona-natural.md)

El recorrido completo, con todos los hitos y sus eventos, está en [Del vínculo a la validación, de punta a punta](flujo-del-vinculo-a-la-validacion.md).

## Parte 4. Errores típicos

| Lo que ves | Qué significa | Qué hacer |
|---|---|---|
| No llega el código a Mailpit | El correo no tiene cuenta: Valídalo responde igual para no revelar quién existe, pero no envía nada. | Revisa que el correo esté bien escrito y que la persona exista en Usuarios y roles. |
| El código ya no sirve | Vence a los 5 minutos y admite 5 intentos. | Pide otro desde la pantalla de ingreso. |
| Después del código pide registrar una passkey | El grupo activó «Exigir passkey a todas las personas» (o eres operador de Plataforma). | Regístrala con Windows Hello, o apaga la opción en Configuración › Ingreso. |
| «Tu grupo ahora exige passkey» y la sesión se cierra | Activaste «Exigir passkey a todas las personas» y la sesión se abrió solo con el código. | Que entre de nuevo y la registre. |
| Al cambiar roles pide confirmar con la passkey o con un código | Cambiar roles, desactivar personas o crear API keys piden reautenticación de los últimos 5 minutos. | Confirma con la passkey o con el código que te llega al correo (Mailpit). |
| El tercero ve «aún no publica sus textos» | Faltan la autorización o los términos de la empresa. | Paso 4. |
| El tercero aceptó, pero no hay expediente («aperturas pendientes») | No hay flujo publicado por defecto para Proveedor. | Paso 10: publica y marca por defecto. |
| El flujo no se publica | Hay un área sin requisitos, más aprobadores que miembros, un área inactiva o repetida, o cambios sin guardar. | Corrige lo que el editor marca en rojo y guarda el borrador antes de publicar. |
| El lote dice «Al archivo le faltan columnas de la plantilla» | Faltan columnas obligatorias. | Usa la plantilla descargada: tipo y número de identificación, razón social, correo y tipo de vínculo. |
| La fila del lote falla con `tipo-vinculo-invalido` o `digito-verificacion-invalido` | El tipo de vínculo no existe o el DV no corresponde al NIT. | Escribe `PROVEEDOR` y deja el DV vacío. |
| `prefijo-folio-duplicado`, `empresa-duplicada` o `slug-duplicado` | Ya existe ese prefijo o NIT en el grupo, o ese identificador de grupo. | Usa otro. |
| El enlace del tercero dice que ya se usó o venció | El enlace es de un solo uso. | Reenvía la invitación desde el vínculo, o que el tercero entre por `http://localhost:5181/entrar` con su correo. |
| Nadie ve el expediente en su bandeja | La persona no es miembro del área, o la etapa anterior no ha terminado. | Paso 6, o espera a que apruebe la etapa anterior. |
| `separacion-de-funciones` al decidir | El flujo la exige y quien decide fue quien invitó. | Que decida otra persona, o desactívala en el flujo (en una versión nueva). |
| Todas las áreas aprobaron, pero sigue «En revisión» | Falta la cuenta bancaria designada aprobada por dos personas, o hay una verificación bloqueante pendiente. | Paso 16. |
| «Falta la aprobación de otra persona» en la cuenta | La misma persona no cuenta dos veces. | Que apruebe otra con permiso `cuentas:aprobar` (Administrador u Oficial). |
| Las listas quedan «Coincidencia por analizar» | El simulador local encontró la palabra «coincidencia» en un nombre. | El oficial la analiza en su bandeja. |
| El tercero no puede «Enviar respuesta» (`requisitos-sin-corregir`) | Reenvió sin cambiar lo observado. | Debe subir una versión nueva o corregir la sección. |
| La Cámara sale vencida o con «frescura incumplida» | La fecha de expedición tiene más de 30 días. | Que suba una más reciente o ajusta la vigencia del tipo. |
| No hay sugerencias ni aprobación automática | La empresa no tiene plan de IA con llave, o el nivel es Manual. | Es lo esperado sin IA; ver el paso 2. |
| El PDF del certificado aún no está | Se genera en segundo plano. | Espera unos segundos y recarga. |
