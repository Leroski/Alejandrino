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
