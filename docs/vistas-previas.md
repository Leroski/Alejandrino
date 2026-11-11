# Vistas previas en Android · 0.5.1

La fase de vista previa añade portadas del MP4 local, tres posiciones seleccionables,
duración, autor, descripción y título original. El título de la ficha se sigue
editando y sincronizando por el flujo existente; actualizar metadatos no lo cambia.

## Uso

- Las copias descargadas muestran una portada al entrar en pantalla.
- Si faltan portada o descripción útil, se consulta automáticamente el proveedor
  después de mostrar los datos locales. Cada ficha tiene un intervalo de cinco
  minutos entre intentos automáticos durante la sesión de página; la consulta
  manual permite reintentar antes. No se descarga el video para obtener metadatos.
- Los nombres provisionales antiguos (plataforma y hora) se muestran usando el
  título original o la descripción, sin sobrescribir nombres personales en Supabase.
  Si no hay contexto disponible se muestra «Video guardado», sin inventar contenido.
  Los textos compartidos con el enlace se conservan como título inicial.
- **Cambiar portada** recorre fotogramas cercanos al 15 %, 50 % y 80 % del video.
  Se guarda la selección en este dispositivo. Si el formato solo ofrece pocos
  fotogramas clave, dos opciones pueden ser iguales.
- Las nuevas descargas conservan los metadatos públicos disponibles en la extracción.
- Para videos anteriores o enlaces sin descarga, **Actualizar datos** consulta el
  proveedor desde la APK, sin descargar el video. El resultado depende del proveedor.
- **Editar** cambia el título personal y clasificación. **Usar el título original**
  copia explícitamente ese texto al borrador, sin guardarlo hasta confirmar.
- La plataforma, fecha de guardado, URL y descripción se despliegan en **Detalles del video**.
  La búsqueda incluye los textos nativos ya cargados durante esa apertura de la biblioteca.

## Límites de esta entrega

Las miniaturas generadas y los metadatos extraídos por Android se guardan en el
teléfono. No se sincronizan imágenes, MP4 ni fotogramas. El nombre que el usuario
edita sí se sincroniza mediante la tabla existente; no se necesita una migración SQL.
La web y las APK anteriores conservan la vista previa pública y la edición,
sin enviar acciones nuevas a un puente que no existe.

La interfaz web y la comprobación de sesión/ficha siguen requiriendo conexión.
Esta entrega no implementa la biblioteca completamente offline ni análisis con IA.
Una lectura inicial utiliza primero el archivo y metadatos locales; si faltan
portada o contexto se consulta Instagram/TikTok automáticamente. Un fallo del
proveedor conserva la información previa y permite reintentar manualmente.

## Implementación y aislamiento

- Puente separado `AlejandrinoPreviewV1`, limitado al origen HTTPS de la APK y al
  documento principal. Contrato PREVIEW / PREVIEW_RESULT y CANCEL con IDs correlacionados.
- Se reutiliza la autorización DOWNLOAD del servidor para obtener la URL canónica
  de una ficha propia. Esto verifica propiedad y fuente; no inicia una descarga.
  No se acepta una URL, ruta o URI suministrada por JavaScript.
- La consulta al proveedor usa un extractor restringido y sin credenciales. Antes
  de guardar un resultado se vuelven a comprobar la sesión, ficha y URL.
- La respuesta contiene únicamente textos acotados, duración, estado y un JPEG
  reducido (hasta 96 KiB). El cliente valida el contrato y nunca recibe la URI de MediaStore.
- Los JPEG se muestran directamente como datos en la vista local, sin optimizador
  remoto, subida a Supabase, persistencia web ni almacenamiento público adicional.
- Archivos privados excluidos del backup; nombres separados por usuario/ficha,
  escrituras atómicas, caché vinculada a la URI actual y tres candidatos como máximo.
- Las peticiones web son secuenciales y solo se inician al acercarse una ficha a
  pantalla. Salir, cambiar de cuenta, navegar o agotar el plazo cancela la solicitud.
  Las respuestas antiguas se descartan.
- Fallar en metadatos no revierte una descarga completada. Un fallo al consultar
  el proveedor conserva los datos anteriores; un archivo ausente no devuelve su JPEG.

## Verificación

La batería incluye pruebas Node, JVM, Python y comprobaciones del contrato UUID.
TypeScript, ESLint y la compilación web se verifican también.
La compilación completa Android y el test de Chromium se ejecutan en CI;
el entorno local de desarrollo no dispone de Android SDK ni de un Chromium operativo.
El resultado de cada commit se registra en GitHub Actions.

Pruebas de Node: contrato, límites, cancelación, aislamiento, serialización de fichas,
respuestas tardías, dominios permitidos y compatibilidad con las operaciones previas.
Pruebas JVM: autorización antes de leer archivos, revalidación tras consultar datos,
validación de opciones y exclusión de campos privados.
Pruebas Python: metadatos acotados, ausencia de descargas durante la consulta,
cancelación y regresiones de la descarga de pistas.
La selección de formatos y el descargador HTTP real de yt-dlp también se prueban
con respuestas de red controladas: MP4 combinado, pistas separadas, original
sin audio, rechazo de una pista y alternativa sin reutilizar archivos parciales.

El workflow Android compila, ejecuta JUnit y Android Lint. El workflow web ejecuta
`tests/browser/preview.cjs` con Chromium y respuestas sintéticas de Supabase/Android:
portada, cambio de selección, edición con espacios, conservación del título,
fallo del proveedor, archivo ausente tras una comprobación previa satisfactoria,
cierre de sesión y compatibilidad web/APK anterior.
Estas pruebas no equivalen a comprobar un MP4 real en un teléfono.

Para repetir las pruebas de navegador, instalar Playwright 1.62.1 y su Chromium,
iniciar Next en el puerto 3015 con
`NEXT_PUBLIC_SUPABASE_URL=https://fixture.supabase.co` y
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_fixture`, y ejecutar
`node tests/browser/preview.cjs`. Todas las cuentas y respuestas del script son ficticias.

## Aceptación pendiente en Galaxy A07

1. Actualizar conservando paquete, firma beta y datos; no desinstalar la versión anterior.
2. Abrir una ficha con MP4 existente y comprobar portada, duración y reproducción.
3. Cambiar portada, cerrar y volver a abrir: comprobar que conserva la selección.
4. Guardar un enlace nuevo y comprobar que obtiene portada y descripción sin
   pulsar Actualizar datos. Editar su título y actualizar datos:
   el título personal debe mantenerse.
5. Descargar un nuevo reel: debe conservar imagen y sonido, asociarse a la misma
   ficha y mostrar metadatos disponibles sin una segunda descarga.
6. Borrar un MP4 desde el teléfono y volver a consultar: no debe seguir apareciendo
   como disponible ni mostrar una portada local del archivo ausente.
7. Cambiar de cuenta durante una consulta y comprobar que desaparece su información.
