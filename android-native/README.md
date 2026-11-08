# Alejandrino: descarga y reproducción local · 0.4.0

La APK **Alejandrino prueba** permite guardar/consultar fichas, descargar una
publicación de Instagram o TikTok y reproducir su MP4 desde la misma ficha.
La APK 0.3.1 continúa funcionando con CHECK; las nuevas acciones solo aparecen
cuando existe el puente `AlejandrinoMediaV1` de la versión 0.4.0.

## Uso y límites de esta fase

1. Compartir un reel hacia Alejandrino y guardar/encontrar su ficha.
2. Pulsar **Descargar al dispositivo**. Mantener la app visible hasta terminar.
3. Pulsar **Reproducir video local**. El enlace original sigue disponible aparte.
4. Reiniciar la app y pulsar **Comprobar video local**: debe conservar la asociación.

Una única operación multimedia puede ejecutarse a la vez. Salir de la app,
bloquear el teléfono, cambiar de cuenta o cancelar detiene la descarga. El límite
es diez minutos y 256 MiB de pistas; no se reanudan tareas en segundo plano.
La pantalla permanece encendida mientras se descarga con la app visible.

Se busca una resolución cercana a 720p sin recodificar. Se muestra la resolución
real cuando termina. Se exige un MP4 con imagen y audio; si el proveedor requiere
login, no ofrece formatos compatibles o falla, se informa el error y se conserva
la ficha. No se importan cookies ni se evaden restricciones del proveedor.
YouTube, importación de archivos y biblioteca offline quedan para otra fase.
La verificación de cuenta/ficha requiere conexión, también antes de abrir el
reproductor local; el archivo audiovisual no se transmite a ningún servidor.

## Contratos y aislamiento

- `AlejandrinoBridgeV1`: CHECK, compatible con 0.3.1.
- `AlejandrinoMediaV1`: DOWNLOAD, OPEN y CANCEL. Mismo origen HTTPS exacto y
  frame principal. Todas las respuestas incluyen versión, acción, requestId,
  userId y techniqueId. La web descarta respuestas tardías o de otra cuenta.
- DOWNLOAD/OPEN envían el token únicamente al endpoint fijo
  `/api/native/authorize`. El servidor verifica `auth.getUser`, cuenta y ficha
  usando RLS y la clave Publishable; no utiliza `service_role`.
- La URL de descarga se obtiene de la ficha verificada en Supabase. La APK no
  acepta una URL ni una ruta de archivo enviadas por JavaScript.
- Antes de publicar el resultado se vuelven a verificar sesión, propiedad y URL.
  El token permanece en memoria durante la operación, sin logs ni persistencia.
- El índice privado usa usuario:ficha. Una copia existente evita otra descarga.
  Solo se marca disponible tras validar imagen/audio, cerrar la escritura,
  comprobar el tamaño, publicar MediaStore y persistir la asociación.
- Los archivos nuevos usan `IS_PENDING`. Un registro local permite limpiar una
  publicación interrumpida al volver a iniciar el proceso. Los errores revierten
  solamente el archivo nuevo de esa operación; nunca borran la ficha Supabase.
- Los MP4 quedan en **Download/Alejandrino**; son archivos visibles en el teléfono.
  El aislamiento entre cuentas de la app no cifra ni oculta estos MP4 a su dueño.
- OPEN inicia un reproductor interno no exportado. No devuelve URIs ni bytes a
  JavaScript. La APK no necesita permisos generales de almacenamiento.

## Compilación y pruebas

JDK 17, Gradle 8.11.1, Android SDK 35 y Python 3.10. Esta compilación incluye
`arm64-v8a` para el Galaxy A07. Chaquopy 17.1.0, yt-dlp 2026.8.19 y
FFmpegKit maintained min 8.1.9 conservan las versiones del prototipo probado;
`smart-exception-java` se declara explícitamente por el fallo de clase del prototipo.

```bash
npm ci
node --test tests/*.test.cjs
npx eslint app
npx tsc --noEmit
npm run build
bash scripts/check-native-uuid.sh
python -m pip install 'yt-dlp==2026.8.19'
python -m unittest discover -s tests/python -v
node scripts/check-apk-origin.cjs https://proyalejandrino.vercel.app --media
cd android-native
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug \
  -PALEJANDRINO_WEB_URL=https://proyalejandrino.vercel.app
```

El workflow **Authenticated native media** compila y prueba los PR sin distribuir
APK. En `main` o ejecución manual, exige que la web sea pública y que las tres
acciones rechacen solicitudes sin sesión, antes de publicar
`alejandrino-media-debug`. No se incluyen tokens de bypass de Vercel.

Las pruebas web/JVM/Python usan dobles de red, sesión y almacenamiento; no acreditan
una descarga real en Android. La validación CHECK en Galaxy A07 fue confirmada
por el usuario el 8/11/2026. La aceptación de DOWNLOAD/OPEN queda pendiente con
el siguiente recorrido, sin modificar las fichas existentes durante las pruebas.

## Aceptación en Galaxy A07

- Descargar una ficha propia: MP4 con imagen y audio; resolución efectiva visible.
- Abrir ese archivo desde la ficha; volver a la biblioteca.
- Reiniciar y comprobar: disponible, sin una segunda copia al repetir descarga.
- Cancelar/salir durante descarga: error recuperable, sin marcarla disponible.
- Cambiar de cuenta durante descarga: no se publica ni se muestra en la otra cuenta.
- Borrar el archivo desde el teléfono: CHECK detecta ausencia y permite reintentar.
- Proveedor inaccesible o espacio insuficiente: error, ficha conservada.

No fusionar automáticamente los antiguos PR #3–#5: esta línea integra módulos
revisados sobre la base estable. Ver también [dependencias](THIRD_PARTY_NOTICES.md).
