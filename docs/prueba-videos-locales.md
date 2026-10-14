# Prueba de videos locales — versión 1

Estado: instrumento de diagnóstico. No implementa todavía la biblioteca local.

## Objetivo

Comprobar en el Galaxy A07 y Samsung Internet si se puede seleccionar un archivo,
conservar su referencia en IndexedDB, recuperar acceso tras cerrar y abrir la
página, y reproducir el archivo sin Internet. El selector por sí solo no prueba
que la referencia funcione después de cerrar el navegador.

Esta prueba añade `public/prueba-local.html` y `public/prueba-local-sw.js`.
Se abre mediante HTTPS en `/prueba-local.html`. No requiere SQL, claves ni paquetes.

## Datos y permisos

- Solo pide permiso de lectura para el archivo elegido.
- Solo guarda un `FileSystemFileHandle`, un identificador de apertura y una fecha
  en la base local `alejandrino-local-probe-v1`. El nombre está incluido en el handle.
- Nunca guarda un `File` o `Blob` en IndexedDB. No usa OPFS para copiar el video.
- La reproducción usa una URL `blob:` de ese archivo; se revoca al sustituirlo
  o dejar la página. Una URL `blob:` no es la referencia persistente.
- No consulta Supabase ni las APIs de metadatos; no hay llamadas de subida.
- La política CSP prohíbe conexiones de datos desde la página y permite solo
  video `blob:`. No carga bibliotecas, fuentes, imágenes ni telemetría externas.
- La selección temporal por `<input type="file">` se identifica como temporal.
  No cuenta como prueba de persistencia ni guarda el video en otro lugar.
- El resultado que se copia excluye nombre, tamaño, ruta y contenido del archivo.
  Incluye navegador, dominio y resultados técnicos para diagnosticar compatibilidad.

La prueba es independiente de la cuenta de Alejandrino. No asocia videos a
`techniques.id` y no implementa aislamiento de referencias entre cuentas.
No debe reutilizarse como biblioteca de producción sin añadir esa separación.

## Preparación sin conexión

El botón registra un service worker cuyo alcance es `/prueba-local.html`.
Solo guarda esa página pública en `alejandrino-local-probe-shell-v1`.
No intercepta la biblioteca, `/compartir`, APIs o imágenes. No guarda videos,
sesiones, credenciales ni respuestas de Supabase. No hace offline a toda la app.

La página se abre desde la red cuando es posible y usa su copia local al fallar
la conexión. El botón de limpieza elimina únicamente la referencia, el registro
del worker de prueba y sus cachés. Conserva los videos originales y los datos
de la biblioteca. Cierra la pestaña tras limpiar para liberar su controlador.

## Prueba manual en el teléfono

1. Abre el Preview directamente en Samsung Internet. Añade `/prueba-local.html`
   a su dominio. Usa siempre la misma dirección durante toda la prueba.
2. Elige un video corto que realmente esté descargado en el almacenamiento
   interno; por ejemplo, graba un MP4 con la cámara. Un archivo alojado solo en
   Google Drive o Google Fotos no sirve para comprobar acceso a un archivo local.
3. Pulsa **Elegir y recordar video** y luego reproduce el video. Si el navegador
   no ofrece esa capacidad, la página lo indica sin simular que la tiene.
4. Cierra la pestaña. Vuelve a abrir esa misma URL en el mismo navegador.
5. Debe indicar **Referencia recuperada**. Pulsa **Abrir video guardado**.
   Anota si solicita permiso y si permite reproducir sin volver a elegir el archivo.
6. Pulsa **Preparar prueba sin conexión** y espera la confirmación.
7. Activa modo avión y desactiva también Wi-Fi. Cierra y reabre la misma URL.
   Intenta abrir el video guardado y reproducirlo.
8. Pulsa **Copiar resultado** y pégalo en la conversación. Explica si cerraste
   solo la pestaña o también el navegador y si la prueba fue realmente en modo avión.
9. Termina con **Borrar datos de esta prueba** y cierra esa pestaña.

El dato `navigator.onLine` es solo el estado que informa el navegador. No prueba
por sí solo que Internet esté cortado; por eso se pide una comprobación manual.

## Interpretación

| Resultado | Qué permite concluir |
| --- | --- |
| Selector persistente ausente | Ese navegador no ofrece el método usado; abrir temporalmente un archivo no resuelve la persistencia. |
| Guardado en IndexedDB falla | No se ha demostrado persistencia de la referencia. |
| Referencia recuperada, permiso solicitado de nuevo | La referencia persiste, pero el navegador exige renovar permiso. No es necesario volver a seleccionar si al autorizar abre el archivo. |
| Referencia recuperada y video reproducido | Hay evidencia de acceso persistente en ese navegador y esa prueba. |
| Abre sin conexión y reproduce tras cerrar | El archivo y la pantalla de prueba funcionan offline en ese caso. |
| Video no se reproduce | Puede ser acceso al archivo o formato/códec; el reporte separa lectura y reproducción. |
| Error preparando offline en Preview | Investigar registro, respuesta del despliegue o protección de Vercel; no concluir que el teléfono carece de acceso a archivos. |

No cambiar de navegador ni de dominio a mitad de la prueba. El almacenamiento
y los permisos dependen de ambos. Una prueba en un Preview no transfiere sus
referencias al dominio de producción. Si la prueba web funciona, el módulo
definitivo también deberá verificarse en la aplicación instalada.

## Fuera de alcance

Navegar por todas las carpetas, detectar videos nuevos, sincronizar fichas,
descargar TikTok/Instagram/YouTube, generar miniaturas y asociar varios usuarios
son trabajos posteriores. La prueba no elige definitivamente entre web y Android
nativo: proporciona evidencia del teléfono para tomar esa decisión.

## Referencias

- https://developer.chrome.com/docs/capabilities/web-apis/file-system-access
- https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api
- https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register
