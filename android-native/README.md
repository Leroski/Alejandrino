# Fase 1 · Android APK (SPIKE experimental)

Proyecto nativo Java + Chaquopy/Python + FFmpegKit maintained (sin Termux).
**Código de prueba, aún no compilado ni validado en un Galaxy A07.**
No fusionar en main hasta superar compilación, descarga, mezcla y recepción
desde Instagram y TikTok.

## Compilar

1. Instala Android Studio + Android SDK 35 y JDK 17.
2. Abre la carpeta `android-native` como proyecto Android.
3. Sincroniza Gradle e instala herramientas del SDK que solicite.
4. Ejecuta `app` en el teléfono conectado por USB (depuración activada).
5. Abre Instagram → Compartir → Alejandrino (prueba).
6. Revisa `Almacenamiento interno/Download/Alejandrino`.

Chaquopy instala yt-dlp como biblioteca Python dentro de la APK;
FFmpegKit integra bibliotecas nativas para unión sin transcodificación.
La app debe recibir un enlace HTTPS público propio o autorizado.

## Limitaciones de este SPIKE

- Aún no reutiliza la interfaz Next.js ni la autenticación Supabase.
- No registra ni sincroniza una ficha al descargar.
- Descarga desde un Thread simple. En pruebas prolongadas, Android puede
  interrumpirla al cerrar la aplicación. Para el producto final cambiar
  a WorkManager o servicio que respete las restricciones de Android.
- Puede fallar por cambios de extractores, códigos o formatos no compatibles
  con MP4. Hay que inspeccionar los formatos reales en el Galaxy.
- No incluye aún tests instrumentados, integración continua o compilación
  verificable desde aquí (este entorno carece de Android SDK/Gradle).
- Revisar licencias de bibliotecas Python y FFmpeg antes de distribución.
- La versión y coordenadas del paquete FFmpegKit requieren resolución
  exitosa desde Maven Central antes de considerar el spike válido.
- Las tareas de descarga se guardan en el almacenamiento local del teléfono
  y no en Supabase/Vercel.

## Próximo criterio para completar esta fase

APK que compila, se instala en Galaxy A07, aparece en Compartir,
descarga un Instagram autorizado a 720p cuando esté disponible, y entrega
un MP4 con audio reproducible. Repetir con TikTok autorizado.

## Incidencia observada y corrección (23 octubre 2026)

La primera APK se compiló e instaló en el Galaxy A07. Tras compartir un reel,
yt-dlp lanzó `You have requested merging of multiple formats but ffmpeg is not installed`.
Esto ocurrió porque el motor Python pedía `bv+ba` y luego intentaba unirlos
internamente. La versión actual primero resuelve formatos con
`extract_info(download=False)`, descarga cada pista por separado a un archivo
temporal, y retorna rutas `video_path` / `audio_path`. La capa Java combina
ambas pistas con la biblioteca FFmpegKit ya empaquetada.

**Estado:** corrección pendiente de verificar tras recompilar en Android Studio.
No implica instalar ffmpeg en Termux. La unión no recodifica las pistas.

### Probar después del cambio

Desde Ubuntu: `git fetch origin && git switch feat/android-apk-spike && git pull --ff-only`.
En Android Studio sincroniza Gradle, pulsa Run e intenta Compartir → Alejandrino
con el mismo reel público. El resultado esperado es un MP4 con audio en
`Download/Alejandrino`. Si falla, copiar el nuevo mensaje de la pantalla o Logcat.

## Diagnóstico de cierre en la unión (23 octubre 2026)

En el Galaxy A07 la versión con FFmpegKit min 8.1.7 mostró «Uniendo audio y
video…» y luego se cerró sin guardar archivo. La versión 8.1.7 `min`
tenía un defecto conocido de empaquetado de `libc++_shared.so`, solucionado
en la versión 8.1.9. Por ello se actualizó esa dependencia y se incorporaron
logs Android con tag `AlejandrinoNative`, además de captura de `LinkageError`.

**Pendiente de validar en dispositivo**: que la actualización elimine el crash,
que FFmpegKit consiga unir pistas y que MediaStore entregue un archivo MP4.

Prueba tras actualizar Git y reinstalar mediante Run:

```bash
adb logcat -c
adb logcat -v time -s AlejandrinoNative:E AndroidRuntime:E linker:E DEBUG:E
```

Con esa terminal abierta, compartir un reel hacia Alejandrino.
Si la app vuelve a cerrarse, copiar el error fatal. Para registrar eventos
de éxito además de errores, cambiar `AlejandrinoNative:E` por
`AlejandrinoNative:V`.

## Fallo confirmado con Logcat: clase Java ausente

Logcat mostró `java.lang.NoClassDefFoundError: com.arthenica.smartexception.java.Exceptions` en `FFmpegKitConfig.<clinit>` durante la unión de pistas. Se añadió explícitamente `com.arthenica:smart-exception-java:0.2.1` a `app/build.gradle`, manteniendo FFmpegKit `8.1.9`.

Volver a sincronizar Gradle, ejecutar Run e intentar compartir un reel. Si se cierra, repetir `adb logcat -v time -s AlejandrinoNative:V AndroidRuntime:E linker:E DEBUG:E` y comprobar el siguiente error; no asumir que esta dependencia resuelve otros posibles fallos nativos.
