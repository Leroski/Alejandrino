# Videos locales y fichas sincronizadas

Estado: principios vigentes. La descarga, el índice local y la reproducción
están implementados en la APK (ver `android-native/README.md`); se optó por un
WebView propio en vez de Capacitor. Siguen pendientes la vinculación de archivos
existentes, la biblioteca sin conexión y los videos sin enlace original.

## Objetivo

Alejandrino debe permitir guardar enlaces rápidamente y navegar por una
biblioteca que combine enlaces originales y videos disponibles en el dispositivo.
El nombre y la clasificación siguen siendo opcionales al guardar.

Los archivos de video locales no se suben a Supabase, Vercel ni a otro servicio.
Tampoco se envían fotogramas o miniaturas generadas a partir de esos archivos.

## Separación de datos

| Información | Ubicación |
| --- | --- |
| Identificador de la ficha y propietario | Supabase |
| Enlace original, título y clasificación | Supabase |
| Autor y URL de miniatura pública, si el proveedor los ofrece | Supabase |
| Archivo de video descargado o seleccionado | Dispositivo |
| Referencia de acceso al archivo y su relación con la ficha | Dispositivo |
| Miniatura generada desde un video local | Dispositivo |
| Índice necesario para consultar la biblioteca local sin conexión | Dispositivo |

No se necesita un bucket de videos para este diseño. Un enlace a Instagram,
TikTok o YouTube representa contenido alojado por esa plataforma, no una copia
del video respaldada por Alejandrino.

## Identificadores

La ficha existente conserva su UUID (`techniques.id`). Un archivo local tendrá
su propio identificador y una relación local con ese UUID y el usuario.

La relación local debe registrar, como mínimo:

- Usuario propietario y UUID de la ficha.
- Identificador local del archivo.
- Referencia de acceso concedida por el sistema o navegador.
- Nombre, tamaño y tipo del archivo.
- Resultado y fecha de la última comprobación de disponibilidad.

La referencia puede ser un `FileSystemFileHandle` en un navegador compatible
o una URI `content://` en Android nativo. No son intercambiables y no se
sincronizan como si pudieran abrirse desde otros equipos.

El nombre del archivo no es un identificador único. Se podrá añadir una huella
del contenido para ayudar a reconocer copias, sin subir el archivo para calcularla.
Una huella no concede acceso al archivo ni lo recupera si se borra.

## Comportamiento esperado

- Una misma ficha puede tener un enlace original y una o varias copias locales.
- La disponibilidad se calcula en cada dispositivo, no con un booleano global
  `descargado` guardado en Supabase.
- En el teléfono puede aparecer "Disponible en este dispositivo"; en el PC,
  esa misma ficha puede ofrecer solamente "Abrir enlace original".
- El archivo local debe reproducirse sin Internet. Esto también requiere guardar
  localmente la interfaz y el índice necesarios; disponer del MP4 no basta.
- Si desaparece el archivo o se pierde el permiso, se ofrece volver a vincularlo.
- Quitar una ficha de la biblioteca y borrar un archivo del teléfono son acciones
  diferentes. Una eliminación sincronizada no debe borrar archivos locales.
- Cerrar sesión o cambiar de cuenta no debe mostrar las asociaciones privadas
  de otro usuario. Tampoco debe borrar sus archivos de video.
- Desinstalar la aplicación o borrar sus datos puede eliminar asociaciones y
  permisos. La recuperación de esas asociaciones debe contemplarse por separado.

## Descargas e importación

Guardar la URL de una publicación no equivale a descargar el archivo de video.
La descarga automática se implementará solamente cuando exista un mecanismo
disponible y permitido para obtenerlo. El resto de los casos permitirá vincular
un video que el usuario ya haya descargado.

La primera integración local vinculará archivos existentes sin subirlos y,
cuando el acceso por referencia lo permita, sin duplicarlos en el almacenamiento.

También se contemplarán videos locales sin enlace original. Eso requerirá una
migración explícita del modelo actual, donde `techniques.url` es obligatorio;
no se inventarán URLs para cumplir esa restricción.

## Acceso desde Android

La instalación como aplicación web no garantiza todas las capacidades de una
galería nativa. Antes de elegir la implementación se comprobará en Samsung
Internet la selección de archivos, la persistencia de referencias y permisos,
el acceso tras cerrar y reabrir la aplicación y la reproducción sin conexión.

Si esas capacidades no bastan, se añadirá una aplicación Android con una capa
nativa, por ejemplo mediante Capacitor y una integración con MediaStore o el
selector del sistema. Capacitor por sí solo no implementa la biblioteca ni sus
permisos. Se reutilizará la interfaz React que resulte compatible; el código
servidor de Next.js permanecerá fuera del dispositivo.

## Orden de implementación

1. Metadatos de los enlaces: título, autor y miniatura pública cuando estén
   disponibles, sin bloquear el guardado ni sustituir la clasificación manual.
2. Prueba de acceso persistente en el teléfono y elección del adaptador local.
3. Vinculación de archivos, reproducción local e índice disponible sin conexión.
4. Navegación por los videos autorizados, filtros de disponibilidad y revinculación.
5. Descarga directa al dispositivo en las fuentes compatibles.

## Referencias técnicas

- [Acceso web a carpetas](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)
- [Archivos y permisos persistentes en Android](https://developer.android.com/training/data-storage/shared/documents-files)
- [Biblioteca multimedia de Android](https://developer.android.com/training/data-storage/shared/media)
- [Capacitor](https://capacitorjs.com/docs)
