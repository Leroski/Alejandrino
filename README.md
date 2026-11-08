# Alejandrino

Biblioteca personal de técnicas de judo y BJJ: guardar enlaces desde el teléfono,
encontrarlos después y clasificarlos por disciplina, posición y categoría.

## Funciones implementadas

- Inicio de sesión y biblioteca sincronizada mediante Supabase.
- Guardado de enlaces de Instagram, TikTok y YouTube, edición y búsqueda.
- Detección de enlaces repetidos e importación de la biblioteca local anterior.
- Recepción de enlaces compartidos desde Android.
- Metadatos de TikTok y YouTube mediante oEmbed, sin ejecutar el HTML recibido.
- APK Android de prueba: CHECK autenticado, descarga de publicaciones de Instagram
  y TikTok al dispositivo y reproducción local desde la ficha.

**Estado:** proyecto en desarrollo. CHECK fue validado en Galaxy A07. La fase
multimedia 0.4.0 incorpora descarga y reproducción y requiere aceptación en ese
mismo teléfono. Se busca calidad cercana a 720p con audio; depende de la fuente.
La descarga requiere mantener la app visible. La biblioteca offline, descargas
persistentes en segundo plano y recuperación/importación del índice siguen
pendientes. Los prototipos anteriores se conservan en ramas experimentales.

## Desarrollo local

Requiere Node.js 24 y un proyecto Supabase propio.

```bash
npm ci
cp .env.example .env.local
```

Completar la URL del proyecto y su clave **Publishable** en `.env.local`.
No usar una clave secreta ni `service_role`. En un proyecto nuevo, revisar y
aplicar `supabase/01-library.sql` y luego `supabase/02-video-metadata.sql`.
Crear una cuenta de prueba desde Supabase Auth; la interfaz actual permite
iniciar sesión, no registrar cuentas. No usar datos personales en ejemplos.

```bash
npm run dev
```

Abrir `http://localhost:3000`. Para probar desde el teléfono, usar la dirección
de red que muestra Next.js y conservar el servidor encendido.

## Verificación

```bash
node --test tests/*.test.cjs
npx eslint app
npx tsc --noEmit
npm run build
npm audit --audit-level=moderate
```

La compilación Android y su contrato se describen en
[android-native/README.md](android-native/README.md). La CI de pull requests
compila y prueba. El workflow **Authenticated native media** distribuye la APK
al integrar cambios en `main` o ejecutarlo manualmente, después de comprobar que
el dominio público `https://proyalejandrino.vercel.app` y las acciones CHECK, DOWNLOAD y OPEN están desplegadas.

## Arquitectura

- Next.js, React y TypeScript para la interfaz y las rutas del servidor.
- Supabase Auth y PostgreSQL con RLS para las fichas de cada cuenta.
- WebView Android, puente versionado, yt-dlp, FFmpeg y MediaStore para archivos locales.
- Vercel para el despliegue web; GitHub Actions para pruebas y compilación.

Los videos locales no se suben a Supabase ni a Vercel. La autorización de las operaciones
actuales necesita conexión; no se declara soporte completo sin conexión.

## Documentación

- [Seguridad y despliegue](SECURITY.md)
- [Contrato y pruebas de la APK](android-native/README.md)
- [Almacenamiento de videos](docs/almacenamiento-videos.md)
- [Metadatos](docs/metadatos.md)
- [Diagnóstico del puente Android](docs/diagnostico-bridge-android.md)

## Licencia

[MIT](LICENSE).
