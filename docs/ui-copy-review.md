# Inventario de mensajes de la interfaz — Dominodo Nodo

Documento para revisión de redacción (copy) del portal de administración del conjunto.
Recoge **todo el texto en español que el usuario puede llegar a ver**, agrupado por el momento
en que aparece.

**Cómo leerlo**

- **Mensaje**: el texto exacto que se muestra hoy. `{ }` marca valores dinámicos (nombre del
  conjunto, código de la solicitud, etc.).
- **Cuándo aparece**: el evento o pantalla que lo dispara.
- **Ubicación**: archivo y línea, para que el cambio sea directo de aplicar.

Al final, la sección **13** lista inconsistencias y textos dudosos que conviene mirar con atención.

---

## 1. Notificaciones emergentes (toasts)

Aparecen arriba a la derecha, sobre el contenido, y se cierran con la «x». No desaparecen solas.

### 1.1 Éxito (verde)

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Solicitud actualizada.` | Se guardan los campos editables de una PQRS (tipo, prioridad, visibilidad, categoría) desde la pestaña *Información*. | `request-detail.component.ts:258` |
| `Estado cambiado a «{estado}».` | Se confirma el cambio de estado de una PQRS desde el detalle (modal *Cambiar estado*). | `request-detail.component.ts:293` |
| `{código} movido a «{estado}».` | Se arrastra una tarjeta de PQRS a otra columna en la vista de tablero y el cambio se guarda. | `request-list.component.ts:282` |
| `Respuesta agregada.` | Se envía un comentario / progreso / evidencia / resolución en la pestaña *Comentarios*. | `request-detail.component.ts:320` |
| `Anuncio creado.` | Se crea un anuncio nuevo (queda en borrador). | `announcement-create.component.ts:83` |
| `Anuncio actualizado.` | Se guardan cambios de un anuncio existente. | `announcement-edit.component.ts:118` |
| `Anuncio publicado.` | Se confirma la publicación de un anuncio. | `announcement-detail.component.ts:105` |
| `Anuncio archivado.` | Se confirma el archivado de un anuncio. | `announcement-detail.component.ts:112` |

### 1.2 Error (rojo)

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Tu sesión expiró. Inicia sesión nuevamente.` | La sesión caducó y el intento automático de renovarla falló; el usuario es enviado al login. | `error.interceptor.ts:38` |
| `Ocurrió un error inesperado.` | Falla cualquier llamada al servidor y la respuesta **no** trae un mensaje propio (caída de red, error no tipificado). | `problem-details.ts:30` |
| *(texto que devuelve el servidor)* | Cualquier otro error de API: se muestra el mensaje que envía el backend, tal cual. Ver sección 12. | `problem-details.ts:26-30` |

Además, el botón de cerrar cada toast tiene la etiqueta accesible `Cerrar`
(`notifications.component.ts:19`).

---

## 2. Sesión, accesos y páginas de bloqueo

Pantallas a página completa, sin menú, cuando el usuario no puede entrar al portal.

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `404` / `Conjunto no encontrado` / `No pudimos identificar el conjunto residencial para esta dirección. Verifica el enlace o contacta al administrador de tu comunidad.` | La dirección web no corresponde a ningún conjunto, o el conjunto está suspendido. Se ve antes del login. | `tenant-not-found.component.ts:17-22` |
| `403` / `Sin acceso a este conjunto` / `Tu cuenta no tiene acceso a la administración de este conjunto residencial. Si crees que es un error, contacta al administrador de tu comunidad.` | El usuario se autenticó pero no es miembro activo del conjunto, o no tiene permiso para el módulo al que intenta entrar. | `no-access.component.ts:15-19` |

---

## 3. Inicio de sesión

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `{nombre del conjunto}` / `Dominodo` | Marca en la parte superior. Muestra el nombre del conjunto; si aún no se conoce, dice «Dominodo». | `login.component.html:10` |
| `Logo` | Texto alternativo de la imagen del logo cuando no carga. | `login.component.html:6` |
| `Inicia sesión en tu cuenta` | Título del formulario. | `login.component.html:16` |
| *(texto de bienvenida del conjunto)* | Párrafo opcional bajo el título; lo define cada conjunto en su configuración (dato de la API, no está en el código). | `login.component.html:19` |
| `Teléfono` | Etiqueta y además texto de ejemplo dentro del campo. | `login.component.html:27,33` |
| `Contraseña` | Etiqueta del campo. | `login.component.html:43` |
| `El teléfono es obligatorio.` | Se intenta enviar el formulario sin teléfono (o se sale del campo vacío). | `login.component.html:38` |
| `La contraseña es obligatoria.` | Igual, para la contraseña. | `login.component.html:53` |
| `Iniciar sesión` | Botón de envío. Muestra un indicador de carga mientras valida. | `login.component.html:62` |
| `No se pudo iniciar sesión. Verifica tus credenciales.` | Credenciales rechazadas **cuando el servidor no envía un mensaje propio**. Si el servidor sí lo envía, se muestra el del servidor. | `login.component.ts:64` |

---

## 4. Marco de la aplicación: encabezado, menú y pantalla de inicio

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `DominodoNodo` | Título de la pestaña del navegador durante el primer instante de carga; luego se reemplaza por el nombre del conjunto. | `index.html:5`, `tenant.bootstrap.ts:52` |
| `{nombre del conjunto}` / `Dominodo` | Marca del encabezado, siempre visible. | `header.component.html:9` |
| `Usuario` | Nombre en el menú de usuario cuando aún no se ha cargado el perfil. | `header.component.html:20` |
| `Cerrar sesión` | Opción del menú de usuario. | `header.component.html:29` |
| `PQRS` | Ítem del menú superior. Solo si el usuario tiene permiso y el módulo está habilitado. | `navbar.component.ts:48` |
| `Anuncios` | Ítem del menú superior, con las mismas condiciones. | `navbar.component.ts:56` |
| `Inicio` / `{nombre del conjunto}` | Encabezado de la pantalla de inicio. | `home.component.ts:15` |
| `Bienvenido a {nombre del conjunto}` / `Bienvenido a la administración de tu conjunto` | Título de la tarjeta de bienvenida. | `home.component.ts:18` |
| `Desde aquí administrarás tu comunidad. Los módulos de PQRS y anuncios aparecerán en el menú superior una vez habilitados.` | Texto de la pantalla de inicio. **Ver observación 13.6**: hoy es casi inalcanzable y está desactualizado. | `home.component.ts:20-22` |

---

## 5. Componentes compartidos (aparecen en varias pantallas)

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Cargando…` | Etiqueta del indicador de carga; no se ve en pantalla, la leen los lectores de pantalla. | `spinner.component.ts:21` |
| `No hay registros para mostrar.` | Cualquier tabla (PQRS, anuncios) que termina sin resultados, incluso al filtrar. | `data-table.component.html:45` |
| `Página {n} de {total} · {cantidad} registros` | Pie de toda tabla con resultados. | `data-table.component.html:56` |
| `Anterior` / `Siguiente` | Botones de paginación. | `data-table.component.html:61,68` |
| `Seleccionar…` | Texto por defecto de un filtro de selección múltiple sin nada elegido (hoy siempre se sobrescribe por pantalla). | `multi-select.component.ts:82` |
| `Sin opciones` | Menú de selección múltiple sin opciones disponibles (hoy siempre se sobrescribe). | `multi-select.component.ts:84` |
| `Limpiar selección` | Opción al principio del menú de selección múltiple, cuando ya hay algo elegido. | `multi-select.component.ts:58` |
| `Buscar…` | Texto por defecto de los campos de búsqueda con sugerencias (hoy siempre se sobrescribe). | `search-select.component.ts:106` |
| `Quitar filtro` | Etiqueta accesible por defecto del botón «x» de esos campos (hoy siempre se sobrescribe). | `search-select.component.ts:112` |
| `—` | Sustituye cualquier fecha o dato vacío en listados y detalles. | `format-date.ts:3,8`, `request-detail.component.ts:368` |

---

## 6. PQRS — Listado y tablero

### 6.1 Encabezado y filtros

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Solicitudes` / `PQRS` | Encabezado de la pantalla (línea superior / título). | `request-list.component.html:1` |
| `Cambiar vista` | Etiqueta accesible del grupo de botones listado/tablero. | `request-list.component.html:2` |
| `Vista de listado` | Tooltip del botón de tabla. | `request-list.component.html:8` |
| `Vista de tablero` | Tooltip del botón de tablero. | `request-list.component.html:18` |
| `Buscar por código o título…` | Texto de ejemplo del buscador. | `request-list.component.html:42` |
| `Todos los estados` | Primera opción del filtro de estado (sin filtrar). Le siguen `Nuevo`, `En progreso`, `Resuelto`, `Cerrado`. | `request-list.component.html:49-53` |
| `Todas las prioridades` | Primera opción del filtro de prioridad. Le siguen `Alta`, `Media`, `Baja`. | `request-list.component.html:58-61` |
| `Buscar por apartamento` | Texto de ejemplo del filtro de apartamento (busca mientras se escribe). | `request-list.component.html:68` |
| `Quitar filtro de apartamento` | Etiqueta accesible de la «x» que borra ese filtro. | `request-list.component.html:69` |
| `Buscar por residente` | Texto de ejemplo del filtro de residente. | `request-list.component.html:76` |
| `Quitar filtro de residente` | Etiqueta accesible de la «x» que borra ese filtro. | `request-list.component.html:77` |

### 6.2 Columnas de la tabla

`Código`, `Título`, `Estado`, `Prioridad`, `Fecha` — `request-list.component.ts:152-171`.

### 6.3 Vista de tablero

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Arrastra una tarjeta a otra columna para cambiar su estado.` | Aviso sobre el tablero, solo para quien tiene permiso de edición. | `request-list.component.html:108` |
| `Nuevo` / `En progreso` / `Resuelto` / `Cerrado` | Títulos de las cuatro columnas. | `request.models.ts:36-41` |
| `Sin solicitudes` | Columna del tablero sin tarjetas. | `request-list.component.html:134` |
| `Mostrando {n} de {total}` | Pie de una columna que tiene más solicitudes de las que se cargaron (más de 50). | `request-list.component.html:181` |
| `Ver detalle` | Tooltip del botón de la tarjeta que abre la PQRS. | `request-list.component.html:170` |

---

## 7. PQRS — Detalle

### 7.1 Encabezado y pestañas

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `{código} · {título}` | Título de la pantalla una vez cargada. | `request-detail.component.ts:107` |
| `Detalle` | Título mientras la solicitud está cargando o si no se pudo cargar. | `request-detail.component.ts:107` |
| `Volver` | Botón que regresa al listado. | `request-detail.component.html:5` |
| `Información` / `Comentarios` / `Histórico` | Nombres de las tres pestañas (las dos últimas con el número de elementos al lado). | `request-detail.component.html:34,47,63` |

### 7.2 Pestaña *Información*

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Progreso` | Título del avance por etapas. | `request-detail.component.html:89` |
| `Cambiar estado a {estado}` | Tooltip de una etapa en la que sí se puede hacer clic. | `request-detail.component.html:97` |
| `Haz clic en una etapa disponible para cambiar el estado.` | Ayuda bajo las etapas, solo con permiso de edición. | `request-detail.component.html:109` |
| `Información general` | Título del bloque de solo lectura. | `request-detail.component.html:117` |
| `Título` / `Descripción` / `Ubicación` | Etiquetas de los datos de la solicitud (*Ubicación* solo si la solicitud la trae). | `request-detail.component.html:125,129,134` |
| `Tipo` / `Prioridad` / `Visibilidad` / `Categoría` | Etiquetas del formulario editable y de la vista de solo lectura. | `request-detail.component.html:146-171, 203-215` |
| `Petición` / `Queja` / `Reclamo` / `Sugerencia` / `Mantenimiento` | Opciones del campo *Tipo*. | `request-detail.component.html:148-152` |
| `Alta` / `Media` / `Baja` | Opciones del campo *Prioridad*. | `request-detail.component.html:158-160` |
| `Privada` / `Pública` | Opciones del campo *Visibilidad*. | `request-detail.component.html:166-167` |
| `Seleccionar categoría…` | Primera opción del campo *Categoría* cuando no hay ninguna elegida. | `request-detail.component.html:177` |
| `Selecciona una categoría.` | Se intenta guardar sin categoría. | `request-detail.component.html:182` |
| `Guardar cambios` | Botón del formulario editable. | `request-detail.component.html:196` |
| `Adjuntos` | Título del panel lateral de archivos. | `request-detail.component.html:231` |
| `Sin adjuntos` | La solicitud no tiene archivos. | `request-detail.component.html:238` |
| `Descargar` | Tooltip del botón de descarga de cada archivo. | `request-detail.component.html:251` |
| `Creado` / `Actualizado` / `Resuelto` / `Cerrado` | Fechas del panel lateral (las tres últimas solo si aplican). | `request-detail.component.html:271-283` |

### 7.3 Pestaña *Comentarios*

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Historial de comentarios` | Título de la conversación. | `request-detail.component.html:307` |
| `Aún no hay comentarios en esta solicitud.` | La solicitud no tiene ninguna intervención registrada. | `request-detail.component.html:311` |
| `Comentario` / `Progreso` / `Evidencia` / `Resolución` | Etiqueta del tipo de cada intervención, y opciones del formulario de respuesta. | `request.models.ts:176-181`, `request-detail.component.html:358-361` |
| `Interno` | Distintivo en las notas que solo ve la administración. | `request-detail.component.html:332` |
| `Usuario` | Nombre del autor cuando no se pudo resolver quién es. | `request-detail.component.ts:351` |
| `?` | Iniciales del avatar cuando no se conoce el nombre. | `request-detail.component.ts:360` |
| `Agregar respuesta` | Título del formulario de respuesta. | `request-detail.component.html:352` |
| `Tipo` | Etiqueta del selector de tipo de respuesta. | `request-detail.component.html:356` |
| `Nota interna` | Casilla que marca la respuesta como interna (solo con permiso de edición). | `request-detail.component.html:368` |
| `Mensaje` | Etiqueta del cuadro de texto. | `request-detail.component.html:373` |
| `Escribe tu respuesta…` | Texto de ejemplo dentro del cuadro de texto. | `request-detail.component.html:378` |
| `El mensaje es requerido.` | Se intenta enviar sin escribir nada. | `request-detail.component.html:381` |
| `Enviar respuesta` | Botón de envío. | `request-detail.component.html:395` |
| `Participantes` | Título del panel lateral. | `request-detail.component.html:408` |
| `Sin participantes registrados.` | La solicitud no tiene participantes. | `request-detail.component.html:416` |
| `Solicitante` / `Seguidor` | Rol de cada participante. | `request.models.ts:190-193` |

### 7.4 Pestaña *Histórico*

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Histórico de estados` | Título. | `request-detail.component.html:462` |
| `Aún no hay cambios de estado registrados.` | La solicitud nunca cambió de estado. | `request-detail.component.html:466` |
| `Creación` | Origen del primer registro, cuando la solicitud nació directamente en un estado. | `request-detail.component.html:485` |
| `por {nombre} · {fecha y hora}` | Autoría y momento de cada cambio. | `request-detail.component.html:492-493` |

### 7.5 Modal de cambio de estado

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Cambiar estado a «{estado}»` | Título del modal, al hacer clic en una etapa válida. | `request-detail.component.html:521-525` |
| `Nota (opcional)` | Etiqueta del campo de nota. | `request-detail.component.html:530` |
| `Describe el motivo del cambio de estado…` | Texto de ejemplo del campo de nota. | `request-detail.component.html:535` |
| `Cancelar` / `Confirmar cambio` | Botones del modal. | `request-detail.component.html:539-540` |

---

## 8. Anuncios — Listado

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Comunidad` / `Anuncios` | Encabezado de la pantalla. | `announcement-list.component.html:1` |
| `Crear anuncio` | Botón principal, solo con permiso de creación. | `announcement-list.component.html:6` |
| `Todos los estados` | Primera opción del filtro de estado. Le siguen `Borrador`, `Publicado`, `Archivado`. | `announcement-list.component.ts:72-77` |
| `Todas las categorías` | Texto del filtro de categorías cuando no hay ninguna elegida. | `announcement-list.component.html:26` |
| `No hay categorías disponibles` | El conjunto no tiene categorías configuradas. | `announcement-list.component.html:27` |
| `Título` / `Categoría` / `Prioridad` / `Estado` / `Expira` | Columnas de la tabla. | `announcement-list.component.ts:87-98` |
| `Borrador` / `Activo` / `Expirado` / `Archivado` | Estado calculado de cada anuncio: *Activo* = publicado y aún vigente; *Expirado* = publicado pero pasada su fecha. | `announcement-status.util.ts:40-50` |

---

## 9. Anuncios — Crear y editar

Los dos formularios comparten prácticamente todo el texto.

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Comunidad` / `Nuevo anuncio` | Encabezado al crear. | `announcement-create.component.html:1` |
| `Comunidad` / `Editar anuncio` | Encabezado al editar (con el estado actual como distintivo al lado). | `announcement-edit.component.html:11-13` |
| `Título` | Etiqueta, campo obligatorio. | `…create:11` / `…edit:25` |
| `El título es obligatorio (máx. 200 caracteres).` | Se envía sin título o excediendo 200 caracteres. | `…create:20` / `…edit:34` |
| `Contenido` | Etiqueta del cuerpo del anuncio, obligatorio. | `…create:25` / `…edit:39` |
| `El contenido es obligatorio.` | Se envía sin contenido. | `…create:34` / `…edit:48` |
| `Prioridad` | Etiqueta del campo numérico. | `…create:40` / `…edit:54` |
| `0 es la prioridad más alta.` | Ayuda bajo el campo de prioridad. | `…create:49` / `…edit:63` |
| `Categoría` | Etiqueta del selector, opcional. | `…create:53` / `…edit:67` |
| `Sin categoría` | Opción para no clasificar el anuncio. | `…create:55` / `…edit:69` |
| `Fecha de expiración` | Etiqueta del campo de fecha y hora. | `…create:63` / `…edit:77` |
| `Déjalo vacío para que no expire.` | Ayuda bajo la fecha de expiración. | `…create:65` / `…edit:79` |
| `Audiencia` | Etiqueta del selector de destinatarios. | `…create:69` / `…edit:83` |
| `Todo el conjunto` / `Por torre` / `Por apartamentos` | Opciones de audiencia. | `audience.ts:16-19` |
| `Filtro de audiencia` | Etiqueta del campo que aparece solo si la audiencia no es todo el conjunto. | `…create:79` / `…edit:93` |
| `Ej. Torre 1, o 101,102,103` | Texto de ejemplo de ese campo. | `…create:85` / `…edit:99` |
| `Indica las torres o apartamentos destinatarios.` | Se envía con audiencia restringida y el filtro vacío. | `…create:91` / `…edit:105` |
| `Cancelar` | Enlace que sale del formulario sin guardar. | `…create:99` / `…edit:113` |
| `Crear anuncio` | Botón de envío al crear. | `…create:102` |
| `Guardar cambios` | Botón de envío al editar. | `…edit:116` |
| *(mensaje del servidor)* | Recuadro rojo dentro del formulario cuando el guardado es rechazado por la API. | `…create:7` / `…edit:21` |
| `Volver al listado` | Enlace bajo el recuadro rojo cuando el anuncio a editar no se pudo cargar. | `…edit:8` |

---

## 10. Anuncios — Detalle y confirmaciones

| Mensaje | Cuándo aparece | Ubicación |
|---|---|---|
| `Anuncio` / `{título del anuncio}` | Encabezado de la pantalla. | `announcement-detail.component.html:11` |
| `Anuncio` / `Comunidad` + `Volver al listado` | Encabezado y enlace cuando el anuncio no se pudo cargar (con el mensaje de error del servidor). | `announcement-detail.component.html:4-9` |
| `Volver` | Botón que regresa al listado. | `announcement-detail.component.html:15` |
| `Editar` | Botón, solo con permiso de edición. | `announcement-detail.component.html:20` |
| `Publicar` | Botón, solo si el anuncio está en borrador y hay permiso. | `announcement-detail.component.html:26` |
| `Archivar` | Botón, solo si el anuncio no está archivado y hay permiso. | `announcement-detail.component.html:32` |
| `Prioridad {n} · {audiencia} ({filtro})` | Resumen bajo el encabezado. **Ver observación 13.5.** | `announcement-detail.component.html:42-45` |
| `Publicado` / `Expira` / `Creado` / `Actualizado` | Fechas al pie de la tarjeta. | `announcement-detail.component.html:59-72` |
| `Publicar anuncio` | Título del modal de confirmación de publicación. | `announcement-detail.component.html:80` |
| `Al publicar, el anuncio quedará visible para los residentes y se enviarán las notificaciones correspondientes. ¿Deseas continuar?` | Cuerpo de ese modal. | `announcement-detail.component.html:84-85` |
| `Cancelar` / `Publicar` | Botones de ese modal. | `announcement-detail.component.html:88-89` |
| `Archivar anuncio` | Título del modal de confirmación de archivado. | `announcement-detail.component.html:95` |
| `El anuncio dejará de estar visible para los residentes. ¿Deseas archivarlo?` | Cuerpo de ese modal. | `announcement-detail.component.html:99` |
| `Cancelar` / `Archivar` | Botones de ese modal. | `announcement-detail.component.html:102-103` |

---

## 11. Glosario de etiquetas reutilizadas

Cambiar una de estas etiquetas la cambia **en todas** las pantallas donde aparece.

| Concepto | Etiquetas actuales | Ubicación |
|---|---|---|
| Estado de una PQRS | `Nuevo`, `En progreso`, `Resuelto`, `Cerrado` | `request.models.ts:36-41` |
| Prioridad de una PQRS | `Baja`, `Media`, `Alta` | `request.models.ts:59-63` |
| Tipo de PQRS | `Petición`, `Queja`, `Reclamo`, `Sugerencia`, `Mantenimiento` | `request.models.ts:90-96` |
| Tipo de intervención | `Progreso`, `Comentario`, `Evidencia`, `Resolución` | `request.models.ts:176-181` |
| Rol en la solicitud | `Solicitante`, `Seguidor` | `request.models.ts:190-193` |
| Estado de un anuncio | `Borrador`, `Activo`, `Expirado`, `Archivado` | `announcement-status.util.ts:40-50` |
| Audiencia de un anuncio | `Todo el conjunto`, `Por torre`, `Por apartamentos` | `audience.ts:4-19` |

---

## 12. Textos que no controlamos desde este portal

- **Mensajes de error del servidor.** Casi todos los errores de guardado, publicación o carga
  muestran el texto que devuelve la API, sin modificarlo (`problem-details.ts:26-30`). Si en la
  revisión aparecen mensajes con otro tono o en inglés, el cambio se hace en `dominodo.api`,
  no aquí.
- **Nombre del conjunto y texto de bienvenida del login.** Vienen de la configuración de cada
  conjunto.
- **Nombres de categorías.** Los define cada conjunto; aparecen en filtros y selectores.
- **Mensajes técnicos de consola** (invisibles para el usuario, solo para diagnóstico):
  `[tenant] Could not resolve a tenant slug from the host.` (`tenant.bootstrap.ts:25`),
  `[tenant] GET /tenant/current unavailable…` (`tenant.service.ts:35`),
  `[authz] GET /auth/current failed…` (`permission.service.ts:42`).

---

## 13. Observaciones para la revisión

1. **«Obligatorio» vs. «requerido».** Todas las validaciones usan *obligatorio*
   («El título es obligatorio», «La contraseña es obligatoria») menos una:
   `El mensaje es requerido.` en la respuesta a una PQRS (`request-detail.component.html:381`).
2. **Comillas angulares.** Solo dos mensajes las usan (`Estado cambiado a «Resuelto».`,
   `PQRS-001 movido a «Cerrado».`). Conviene decidir si se mantienen y, de ser así, aplicarlas
   de forma consistente.
3. **«Solicitudes» vs. «PQRS».** El encabezado del módulo combina las dos palabras
   (línea superior *Solicitudes*, título *PQRS*), mientras que el menú y los mensajes de éxito
   dicen indistintamente *PQRS* o *solicitud*. Vale unificar el término visible.
4. **Punto final.** Los mensajes emergentes y las validaciones sí llevan punto; las etiquetas de
   estados vacíos son mixtas: `Sin adjuntos`, `Sin solicitudes` (sin punto) frente a
   `Sin participantes registrados.` y `No hay registros para mostrar.` (con punto).
5. **Prioridad de los anuncios como número.** En el listado y en el detalle se muestra el valor
   crudo (`Prioridad 0`, `Prioridad 3`) y la única explicación es la ayuda del formulario
   («0 es la prioridad más alta»). A diferencia de las PQRS, no hay etiquetas Alta/Media/Baja.
6. **Pantalla de inicio desactualizada y casi inalcanzable.** El texto dice que «los módulos de
   PQRS y anuncios aparecerán en el menú superior una vez habilitados», pero ambos ya existen; y
   la raíz del portal redirige directamente a PQRS, así que solo se llega escribiendo `/home`.
   Decidir si se reescribe o se elimina la pantalla.
7. **Mensaje técnico que puede llegar a la pantalla de login.** `No hay refresh token disponible`
   (`auth.service.ts:37`) es un error interno, pero el login muestra el texto de cualquier error
   que reciba (`login.component.ts:60-62`), así que podría verse tal cual. Debería sustituirse por
   un mensaje de usuario.
8. **Tratamiento.** Todo el portal habla en segunda persona informal («Verifica», «Déjalo vacío»,
   «Haz clic», «Arrastra», «Tu sesión»). Conviene confirmarlo como norma antes de revisar.
9. **Dos textos para el mismo bloqueo.** La página `Sin acceso a este conjunto` se usa tanto para
   «no eres miembro del conjunto» como para «no tienes permiso para este módulo»; el texto actual
   solo describe el primer caso.
