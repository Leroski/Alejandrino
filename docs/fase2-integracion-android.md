# Fase 2 — Android y biblioteca sincronizada

Estado: **implementación inicial pendiente de verificación en Galaxy A07**.

## Qué hace este cambio

- Abre en una WebView protegida el sitio Next.js de Alejandrino, conservando
  el inicio de sesión y la biblioteca Supabase existente.
- Recibe ACTION_SEND desde Instagram/TikTok; carga `/compartir?text=...`.
- La página web guarda primero la ficha (o busca la existente por URL);
  después solicita al módulo Android descargar el archivo.
- Android ejecuta yt-dlp/FFmpegKit que ya se probó en el Galaxy A07,
  guarda MP4 mediante MediaStore y asocia **user_id + techniques.id** con
  la URI del archivo en SharedPreferences locales.
- Cada tarjeta de la biblioteca puede comprobar disponibilidad, descargar y
  abrir el video local sin reenviarlo a Supabase.
- El servidor sigue proporcionando `POST /api/video-metadata`.
  La APK **no copia ni ejecuta Next.js en Android**.

## Cómo probar sin modificar main ni desplegar prematuramente en producción

1. Cambia a la rama `feat/android-library-integration`.
2. Despliega **esa misma rama web** en Vercel, con las variables actuales
   de Supabase. El despliegue debe abrir sin barreras de autenticación de
   Vercel en la WebView (Supabase sí puede exigir iniciar sesión).
3. En `android-native/gradle.properties`, añade una línea con la URL HTTPS
   raíz del despliegue **sin barra final ni ruta**:

   ```properties
   ALEJANDRINO_WEB_URL=https://TU-DESPLIEGUE.vercel.app
   ```

   No agregues tokens de Supabase ni contraseñas. La URL es configuración
   pública y representa un origen permitido para operaciones nativas.
4. Abre `android-native` en Android Studio y sincroniza Gradle.
5. Compila e instala desde Run. Abre Alejandrino e inicia sesión con Supabase.
6. Desde Instagram, selecciona Compartir → Alejandrino; pulsa Guardar.
7. Comprueba que se crea la ficha y que el MP4 aparece en
   `Almacenamiento interno/Download/Alejandrino`.
8. Vuelve a la biblioteca y usa **Reproducir video local**.

Para validar errores: `adb logcat -v time -s AlejandrinoNative:V AndroidRuntime:E`.
En Ubuntu, revisar `npm run lint` y `npx tsc --noEmit` antes de fusionar.

## Arquitectura y límites de seguridad

La comunicación usa `WebViewCompat.addWebMessageListener`, que solo inyecta
`AlejandrinoBridge` al origen HTTPS configurado. Android también valida que
el mensaje proceda del documento principal. Las páginas externas se abren en
el navegador de Android, no en la WebView de confianza.

**Esta integración es una beta de desarrollo**, no es apta aún para
distribución pública:

- La vista web requiere conexión para iniciar sesión y consultar Supabase.
  Tener un MP4 descargado no significa que la **biblioteca completa** ya sea
  offline (eso corresponde a Fase 3).
- La descarga corre en un Thread no persistente. Si Android finaliza el proceso,
  puede interrumpirse. Falta WorkManager y reintentos.
- El enlace entre user_id y archivo se almacena localmente, pero el puente
  todavía no valida de forma independiente el JWT del usuario en Android.
  Antes de un entorno multiusuario de producción, el receptor nativo debe
  comprobar la identidad y rechazar lecturas de otras sesiones.
- No hay aún migración automática de videos descargados con Termux ni de
  videos de la APK anterior (carecen de una ficha vinculada).
- Los sitios Vercel Preview protegidos con Vercel Authentication pueden impedir
  que WebView cargue el sitio. No desactives la protección de producción;
  usa un origen de staging apropiado.
- Solo se validó extracción real de Instagram; TikTok y otros proveedores
  requieren pruebas propias.
- El estado «Disponible en este dispositivo» no se sincroniza globalmente.
- Revisar licencias, derechos y condiciones de las plataformas antes de distribuir.

Este cambio no toca las tablas existentes ni ejecuta migraciones de Supabase.
