# Registro de cambios

Este archivo recoge los cambios relevantes del proyecto. El formato sigue Keep a Changelog y el proyecto adopta el esquema de versiones `major.minor.patch`.


## [2.2.0] - 2026-06-12

### Añadido

- **Compatibilidad con la configuración estándar de Kimi Code**: la GUI ahora trata Kimi Code como único objetivo de configuración; configuración principal, MCP, Skills y datos del panel usan las rutas estándar bajo `~/.kimi-code/`.
- **Almacenamiento de Profiles en SQLite**: Profiles, Profile activo y ajustes privados del panel se migran a `~/.kimi-code/.panel/app.db`; la app ya no escribe el archivo no estándar `config.profiles.toml`.
- **Entrada de inicio de sesión OAuth de Kimi**: la página de ajustes puede iniciar el flujo oficial `kimi login` con código de dispositivo y muestra mensajes más claros según la causa del fallo.
- **Visor completo de MCP JSON**: la página MCP incluye un diálogo de vista previa del `mcp.json` estándar completo con copia en un clic.

### Cambiado

- **Experiencia de edición MCP rediseñada**: stdio y http tienen formularios dedicados; argumentos, variables de entorno y cabeceras usan editores de código con números de línea; al editar un MCP existente se bloquea el tipo de transporte para evitar cambios accidentales de protocolo.
- **Rutas, copias e historial adaptados a Kimi Code**: historial de configuración, copias de seguridad, Usage Insights y vistas previas de documentos ahora trabajan con archivos estándar de Kimi Code y datos del panel en SQLite.
- **Objetivo de configuración renombrado a Instancia Kimi Code**: la página de ajustes muestra versión, ejecutable y ruta resuelta; la ruta resuelta ocupa una fila completa para mejorar la legibilidad.
- **Mejoras en la página de resumen**: las tarjetas de Profile y el resumen del Profile activo usan el modelo principal como respaldo; la vista general del sistema, las rutas de configuración y las capas de diálogo son más coherentes.

### Corregido

- Se corrigió que un `default_model` vacío se informara erróneamente como referencia a modelo faltante en el diagnóstico de configuración.
- Se corrigió que `profile_label` se informara erróneamente como campo desconocido en el diagnóstico de configuración.
- Se corrigió que la capa del diálogo de MCP JSON completo no cubriera toda la GUI.
- Se corrigieron fallos de inicio de sesión/arranque en terminal en paquetes Homebrew causados por permisos de pulsaciones de AppleScript.

## [2.1.2] - 2026-06-10

### Cambiado

- Se limpió el registro de depuración y el código duplicado en los módulos de bandeja y atajos globales para reducir el ruido de registro en tiempo de ejecución.
- Se fijó el título de la GitHub Release al número de versión; el cuerpo de la publicación ahora se genera de forma coherente a partir del contenido del CHANGELOG.

### Corregido

- Se corrigió que las estrategias de «copia de seguridad al cambiar» y «copia de seguridad programada» no se activaran: tras guardar la configuración, las copias ahora se ejecutan en silencio y se deduplican según una huella de la configuración principal, además de un nuevo temporizador programado (cada hora/diario/semanal) que ejecuta las copias automáticamente según la estrategia.

## [2.1.1] - 2026-06-09

### Cambiado

- **Atajo de mostrar/ocultar**: activado por defecto, con el atajo predeterminado cambiado a `Command+Shift+H`.
- **Guía de colaboración de agentes**: `AGENTS.md` actualizado para reflejar la arquitectura actual de Tauri v2, los comandos y las restricciones de publicación.

### Corregido

- Corregido que los atajos globales no se pudieran grabar/configurar y fallaran al registrarse tras reiniciar: ahora los registra y gestiona el proceso principal de Rust, por lo que siguen funcionando con la ventana oculta.
- Corregido el parpadeo del atajo de mostrar/ocultar, que ocultaba la ventana y la mostraba de nuevo inmediatamente.
- Corregida la interferencia de atajos de página durante la grabación; ahora se usa captura en fase capture y salida de aceleradores normalizada.
- Corregido que el icono del Dock no se restaurara al reabrir la ventana o Usage Insights desde la bandeja tras ocultar en bandeja, y limpiados listeners residuales de eventos de bandeja.
- Corregida la compatibilidad de snapshots/restauración del historial de configuración con `panel_settings` estructurado en SQLite; la detección del schema antiguo ahora usa `pragma_table_info`.

## [2.1.0] - 2026-06-08

### Añadido

- **Insights de uso**: analiza archivos de log de kimi-code-cli (`~/.kimi/logs/kimi.log`) para registrar automáticamente el uso de tokens, tasas de aciertos de caché, latencia de razonamiento, tendencias de llamadas y análisis de sesiones. Todos los datos se almacenan localmente y nunca se suben.
- **Control de versiones de configuración**: crea snapshots automáticamente en cada guardado de configuración, con filtrado por tipo de archivo, vista de diff y rollback de un clic.
- **Sistema de estimación de costos**: configura precios por modelo (entrada/salida/lectura de caché/creación de caché), con estimaciones de costo en tiempo real en la página de resumen de insights.
- **Visualización de costos en múltiples monedas**: admite CNY, USD, EUR, JPY, GBP con tipos de cambio personalizados; las páginas de insights convierten y muestran costos automáticamente.
- **Confirmación de borrado de datos de Insights**: muestra un diálogo de confirmación que enumera lo que se borrará (registros de eventos / estadísticas agregadas / progreso de logs) antes de eliminar todos los datos de Insights.

### Cambiado

- Internacionalización completa de la función de insights (zh-CN / zh-TW / en-US / ja-JP / de-DE / es-ES), cubriendo gráficos de tendencias, estadísticas de desglose, análisis de sesiones, página de ajustes, notificaciones toast, asistente de primera ejecución y diálogo de borrado de datos.
- Selector de moneda ahora usa iconos de banderas con etiquetas compactas para un diseño más limpio.

### Corregido

- Corregido el fallo del gráfico de tendencias de insights causado por la falta de definición de `maxVal`.
- Corregido el truncado del color de fondo de la barra lateral en ciertos temas.
- Eliminada la estructura redundante `ConfigHistoryState` y las claves i18n duplicadas.

## [2.0.1] - 2026-06-06

### Añadido

- **Vista centrada en perfiles**: la pestaña Profiles ha sido rediseñada con un enfoque centrado en el perfil. Cada tarjeta muestra el proveedor y el modelo asociado de un vistazo; los perfiles se pueden activar directamente desde la lista.
- **Asistente de creación**: un asistente de 3 pasos (elegir proveedor → probar conexión → nombrar) crea una configuración completa y funcional de una sola vez, sin necesidad de configurar Provider / Model / Profile por separado.
- **Guía de eliminación en cascada**: antes de eliminar un Provider o Model, la app analiza el impacto y muestra un diálogo con todos los modelos y perfiles que se eliminarán, con opción de degradar o confirmar la eliminación.
- **Banner de estado del proveedor**: aparece un banner en tiempo real en la parte superior de la página de configuración cuando se detecta un proveedor inalcanzable.

### Cambiado

- Nombres y descripciones de proveedores integrados del asistente completamente internacionalizados (zh-CN / zh-TW / en-US / ja-JP / de-DE / es-ES).
- Estilo del selector de modelo mejorado; botones de cambio de pestaña de perfil estrechados para un diseño más compacto.

### Corregido

- Corregido el estado de selección corrupto tras una eliminación en cascada (React 18 StrictMode invoca los productores de Immer dos veces, haciendo que las llamadas `setState` dentro del callback se ejecuten el doble).
- Corregido un fallo al abrir la vista previa de eliminación en cascada en estado vacío (faltaba una comprobación de null en `getCascadePreview`).
- Corregido que en el último paso del asistente se podía crear un perfil con un nombre ya existente; ahora se detecta el duplicado en tiempo real y se deshabilita el botón de envío.

## [2.0.0] - 2026-06-01

### Añadido

- El menú contextual de la bandeja del sistema ahora permite cambiar idioma, tema y perfil en tiempo real; la interfaz se actualiza de inmediato, sin reiniciar.
- El plegado/desplegado de la barra lateral ahora se anima de forma fluida.

### Cambiado

- **Reescritura de la arquitectura: migración de Electron a Tauri v2 (Rust + WebView del sistema).** Adopta una arquitectura de «capa fina de Rust + lógica de negocio en el frontend»; las ~5300 líneas de lógica de `src/shared/` se reutilizan casi sin cambios, mientras que la E/S de archivos, la ejecución de comandos, las peticiones HTTP, SQLite y la bandeja del sistema se exponen ahora mediante comandos de Rust.
- Instaladores mucho más pequeños: se elimina el runtime de Chromium incluido en favor de la WebView del sistema, reduciendo notablemente los paquetes DMG de macOS y NSIS de Windows.
- La barra de título usa ahora el estilo nativo Overlay de macOS, con los botones de semáforo dibujados y centrados verticalmente por el sistema.
- Nomenclatura del proyecto normalizada: configuración de Vite `vite.config.ts`, salida de compilación `dist/` y flujo de publicación `release.yml` (etiqueta de activación cambiada de `tauri-v*` a `v*`).

### Corregido

- La prueba de conexión WebDAV ahora muestra mensajes legibles ante fallos de autenticación (401/403) y limitación de tasa (429).
- Corregido que la interfaz no se actualizara en tiempo real tras cambiar idioma/tema desde la bandeja del sistema.

## [1.1.9] - 2026-05-25

### Añadido

- La página About muestra ahora una sección «Notas de la versión» que renderiza la entrada de la versión actual desde `CHANGELOGS/{locale}.md` según el idioma de la UI; a la derecha del título, el botón «Ver todas las versiones» lleva directamente a GitHub Releases.
- El diálogo de comprobación de actualizaciones obtiene y renderiza las notas de la nueva versión (desde el cuerpo del GitHub Release), permitiendo ver de un vistazo qué se va a actualizar.

### Cambiado

- El CHANGELOG se divide por idioma en `CHANGELOGS/{zh-CN,zh-TW,en-US,ja-JP,de-DE,es-ES}.md`; el `CHANGELOG.md` raíz pasa a ser un índice y el cuerpo del GitHub Release lo compone CI de forma bilingüe (zh-CN + en-US).
- Estrategia de carga del changelog en la app: en el primer arranque tras instalar/actualizar, la app descarga de una sola vez las 6 traducciones desde `raw.githubusercontent.com` y las cachea en `~/.kimi/.panel/changelog-cache/`; si falla, recae en los archivos empaquetados. La caché se marca con la `app.getVersion()` actual.
- El proceso principal de comprobación de actualizaciones introduce `~/.kimi/.panel/release-cache.json` con `If-None-Match` ETag + fallback al body cacheado en caso de fallo, mitigando el límite de 60 req/h de la API de GitHub sin autenticación.
- Eliminado el bloque «Historial de versiones» fijo de la página About junto con sus nueve cadenas i18n; el historial completo se consulta ahora desde el botón «Ver todas las versiones» en GitHub.

### Corregido

- Corregido que el bloque «Novedades» del diálogo de actualización mostrara la versión dos veces a través de `MarkdownView`: ahora se oculta la cabecera interna del panel y solo queda el título exterior.

## [1.1.8] - 2026-05-25

### Añadido

- Cinco nuevos temas de apariencia con degradados: Forest, Sakura, Mint, Cosmos y Amber, cada uno con paletas claro/oscuro emparejadas.
- La página de detalle de Skill ahora renderiza SKILL.md como markdown de forma predeterminada; junto al botón de copiar se añaden los iconos `</>` / `Eye` para alternar con la vista del código fuente con numeración de líneas.
- Cuando «Usage Insights» está desactivado, el panel vacío muestra un botón «Ir a ajustes para activar» que lleva directamente a Ajustes → Usage Insights.

### Cambiado

- El directorio de datos de Usage Insights se ha trasladado a `~/.kimi/.panel/usage/`. Al iniciar, el antiguo `~/.kimi/usage/` se migra automáticamente; los datos existentes en la nueva ubicación nunca se sobrescriben.
- Limpieza previa al lanzamiento: se eliminó la dependencia `mockttp` y el código muerto asociado, reduciendo 159 paquetes transitivos; el instalador se reduce aproximadamente 30–50 MB.
- Empaquetado endurecido: se declara explícitamente `asarUnpack` para el módulo nativo `better-sqlite3` y se añade `postinstall: electron-builder install-app-deps` para que CI y los checkouts nuevos funcionen sin más.

### Corregido

- Corregido que los temas nuevos volvieran silenciosamente al valor por defecto: tanto `parseAppearanceTheme` como la lista blanca de inicialización del preload no incluían las nuevas claves, lo que provocaba que la selección se normalizara o parpadeara hacia aurora en el arranque en frío.

## [1.1.7] - 2026-05-16

### Corregido

- Restaurado `scripts/render_homebrew_cask.py`, del que depende el pipeline de release, corrigiendo el fallo en la fase de actualización del tap de Homebrew que ya no podía renderizar el cask.

## [1.1.6] - 2026-05-16

### Añadido

- Añadido el chequeo de actualizaciones y la entrada de upgrade de Kimi CLI, además de selector de plantillas de Provider, favoritos, plantillas personalizadas, búsqueda global, cambio rápido, importación/exportación de configuración, comparación de Profile e historial de cambios.

### Cambiado

- Divididos los módulos IPC del proceso principal y los módulos de estilo del renderer; reforzada la detección de cambios externos de configuración y la gestión de conflictos antes de guardar.

### Corregido

- Corregido que al restaurar copias entre máquinas solo quedara el Profile por defecto porque no se migraba la ruta del Profile.
- Corregido que el conmutador del icono de la bandeja en la barra de estado superior solo guardara el ajuste sin crear o eliminar el icono al instante.
- Corregidos el ruido de logs CoreVideo display-link de Chromium en macOS, la interacción de búsqueda global en listas de configuración y los fallos de CI por dependencias de prueba ausentes en la suite de ErrorBoundary.

## [1.1.5] - 2026-05-10

### Corregido

- Corregidos los fallos al abrir Kimi con iTerm2 en builds de Homebrew, donde el envío de pulsaciones vía `System Events` provocaba errores de permisos de macOS; ahora se usa la escritura nativa AppleScript de iTerm2.

## [1.1.4] - 2026-05-10

### Añadido

- Los ajustes del panel ahora persisten el estado expandido/contraído de la barra lateral; el panel restaura el último estado en el siguiente inicio.

## [1.1.3] - 2026-05-09

### Corregido

- Corregido un crash de preload en builds empaquetadas cuando `documentElement` podía ser null durante la configuración inicial del tema.
- Corregido el error de arranque en cascada `Electron preload API is unavailable` derivado del crash de preload anterior.

## [1.1.2] - 2026-05-09

### Añadido

- Añadida la entrada «Abrir Kimi en la terminal» en el área del Profile activo en la parte superior de Profiles, que lanza la CLI con el Profile actualmente activo.
- Añadida una entrada de terminal al pasar el ratón en cada fila de Profile, que genera una configuración temporal y lanza Kimi con ese Profile sin cambiar el activo.
- Página de ajustes con selección de aplicación de terminal (Terminal del sistema o iTerm2).
- README enriquecido con capturas multipágina y recorridos de funcionalidades más detallados.

### Cambiado

- Los lanzamientos de terminal usan ahora `kimi --config-file <ruta>` de forma uniforme, con configuraciones temporales por Profile escritas en `~/.kimi/.panel/tmp/terminal/`.
- Terminal.app y iTerm2 abren ahora en una pestaña nueva y se ejecutan vía pegar + Enter para una ejecución de comandos más fiable.

## [1.1.1] - 2026-05-07

### Añadido

- La página de ajustes admite ahora gestión de atajos: grabación, activación/desactivación, restablecimiento y aviso de conflictos para atajos globales y de ventana.
- Las instantáneas de copia incluyen ahora `shortcuts.json`, conservando los ajustes de atajos al restaurar.
- README ampliado con secciones de atajos, Skills, comprobación de actualizaciones y restauración de copias.

### Cambiado

- Continuada la división del `App.tsx` del renderer: derivación de estado, persistencia de configuración, vínculo de atajos, acciones de copia, actualización de previsualización, intercepción de cambios sin guardar y paneles de pestaña pasan cada uno a su propio módulo.
- Divididos los módulos del proceso principal: acceso a archivos, entorno CLI, WebDAV, atajos y comprobación de actualizaciones, simplificando el archivo de entrada.
- Refinados el estado del diálogo de comprobación de actualizaciones y el flujo de respaldo basado en GitHub Release.

### Corregido

- Corregidos textos y etiquetas de versión del diálogo de comprobación de actualizaciones en ciertos estados.
- Corregidas regresiones potenciales en navegación de páginas, carga de configuración y límites de estado vacío introducidas por la división modular.

## [1.1.0] - 2026-04-26

### Añadido

- La página About incorpora comprobación de actualizaciones por GitHub Release, con indicaciones adaptadas según el origen de instalación (Homebrew, manual o build de desarrollo).
- Una vez detectada una nueva versión, el número de versión en la página About muestra un indicador de actualización hasta que el usuario completa la actualización.
- El diálogo de comprobación de actualizaciones permite ahora copiar el comando de upgrade de Homebrew, saltar al GitHub Release y muestra avisos de límite de tasa de GitHub.

### Cambiado

- Divididos los archivos grandes del renderer: página About, diálogos, visor de código, panel de resumen, espacio de Skills, controles rápidos superiores, layout común y widgets de formulario pasan cada uno a su propio módulo.
- Reforzada la política de apertura de enlaces externos con lista blanca explícita `https:` / `mailto:`.

### Corregido

- Corregidos fallos de renderizado en algunas páginas tras la división por imports de iconos ausentes.
- Corregidos problemas de límites de tipo `AppState | null` en los flujos de guardado, actualización de previsualización, actualización de Skills e intercepción de cambios sin guardar.
- Corregido que el grupo de ajustes generales no aceptara hijos `null` renderizados condicionalmente.

## [1.0.4] - 2026-04-24

### Añadido

- El menú de la bandeja ofrece ahora cambio rápido de idioma y tema: chino / inglés y Auto / Claro / Oscuro directamente desde la bandeja.
- El módulo de copias admite ahora restaurar desde un directorio local o desde un remoto WebDAV.

### Cambiado

- Mejorado el espacio de Skills: paginación, layout del resumen del diálogo de detalle y tamaño de las tarjetas de skill ajustados para una navegación más focalizada.
- Mejorado el análisis del frontmatter de Skills, ampliando la compatibilidad con descripciones multilínea y block scalars.

## [1.0.3] - 2026-04-23

### Cambiado

- Rediseñada la página de Skills como un espacio de dos columnas focalizado: alternancia rejilla/lista, diálogo de detalle para las skills y altura adaptable en el panel derecho.
- Página de ajustes con nueva opción de tamaño de fuente de UI, con lectura, normalización y persistencia integradas.
- Simplificadas las fuentes de escaneo de Skills eliminando los directorios extra y las entradas de directorio de proyecto personalizado; auto-descubrimiento como única estrategia.

### Corregido

- Corregidos crashes en tiempo de ejecución en varias páginas por imports de iconos ausentes en el componente desplegable.
- Corregido que el área principal de la página de Skills no llenara el viewport restante.

## [1.0.2] - 2026-04-22

### Añadido

- La página de ajustes permite ahora ver registros de copia desde directorios locales y remotos WebDAV.
- La lista de registros de copia tiene ahora una acción de eliminar, que deja un punto de entrada unificado para el futuro flujo de restauración.

### Corregido

- Corregido que la configuración MCP en `config.panel.toml` acumulara `extra.extra` de forma recursiva y escribiera `enabled` en el sitio equivocado tras ciclos repetidos de habilitar/deshabilitar.
- Corregida la deriva de indentación en las cabeceras de subtabla MCP al escribir la configuración del panel, evitando que campos como `headers` se salieran de su sección.
- Corregido que el diálogo de importación MCP tratara como modificado el contenido del ejemplo por defecto al pulsar `Esc`.

### Documentación

- Reescrita la introducción del README, cubriendo `mcp.json`, copias, acciones rápidas de la barra de estado y la visualización de configuración.

## [1.0.1] - 2026-04-21

### Cambiado

- Pulidos los grupos de ajustes, las tarjetas de estadísticas superiores, la lista de resumen y los estilos personalizados de desplegables.
- Reforzada la gestión de MCP: importación JSON, persistencia de habilitación/deshabilitación, retención de panel y filtrado por archivo de configuración.
- Reemplazados los logos de marca para app, bandeja y frontend por los nuevos recursos transparentes claro/oscuro, y reconstruido el `icon.icns` de macOS.
- El script de generación del cask de Homebrew avisa ahora sobre fallos de arranque por atributos de cuarentena de macOS.

## [1.0.0] - 2026-04-20

### Corregido

- Corregidos los fallos en el workflow de release de GitHub Actions donde `electron-builder` disparaba una publicación implícita en builds por tag y rompía los trabajos de instalador macOS / Windows.
- Ajustadas la autenticación de GitHub Release y la localización de repositorio en el workflow para que `gh release` no dependa del contexto local `.git`.

### Añadido

- Primer lanzamiento de la app de escritorio Electron para gestionar configuraciones de `kimi-code-cli`.
- Flujos visuales de edición y gestión para Providers, Models y Profiles.
- Al activar un Profile, los valores por defecto se sincronizan automáticamente a `config.toml`.
- Previsualización de `config.toml`, `config.profiles.toml` y `config.panel.toml`.
- Diff de los cambios de configuración antes de guardar.
- Interfaz bilingüe (chino e inglés).
- Integración con barra de estado / bandeja con cambio directo de Profile.
- Estrategias de apertura de ventana: pantalla recordada, pantalla actualmente activa o pantalla aleatoria.
- Página About con enlaces al repositorio, issues y autor.
- Builds de instalador Electron Builder para macOS y Windows.
- Pipeline de release de GitHub Actions disparado por tags `v*`.

### Tests

- Añadida cobertura Vitest para la lógica del almacén de configuración compartido.
