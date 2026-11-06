# Alejandrino

Biblioteca personal de técnicas de judo y BJJ, desarrollada con Next.js,
TypeScript y Supabase, para guardar y clasificar enlaces desde el teléfono.

## Funciones de la web

- Inicio de sesión y biblioteca sincronizada entre dispositivos.
- Guardado de enlaces de Instagram, TikTok y YouTube.
- Edición de nombre, disciplina, posición y categoría; búsqueda y filtrado.
- Detección de enlaces repetidos e importación de la biblioteca local anterior.
- Recepción de enlaces compartidos desde Android mediante la PWA.
- Metadatos de TikTok y YouTube mediante oEmbed.

La web guarda fichas y enlaces. No sube ni descarga archivos de video.
La APK nativa y la integración con archivos locales se desarrollan por separado
en el [PR #6](https://github.com/Leroski/Alejandrino/pull/6). Su recorrido completo
en teléfono sigue pendiente de validación. Las ramas experimentales no son una
versión estable para distribuir.

## Desarrollo local

Requiere Node.js 24 y un proyecto Supabase propio.

```bash
npm ci
cp .env.example .env.local
```

Completar `.env.local` con la URL del proyecto y su clave **Publishable**.
No usar una clave secreta ni `service_role`. Revisar y ejecutar, en un proyecto
nuevo, `supabase/01-library.sql` y luego `supabase/02-video-metadata.sql`.
Crear una cuenta de prueba en Supabase Auth: la interfaz permite iniciar sesión,
no registrar nuevas cuentas.

```bash
npm run dev
```

Abrir `http://localhost:3000`. Para probar desde el teléfono, usar la dirección
de red indicada por Next.js y mantener el servidor encendido.

## Verificación

```bash
node --test tests/*.test.cjs
npx eslint app
npx tsc --noEmit
npm run build
npm audit --audit-level=moderate
```

## Arquitectura y privacidad

- Next.js, React, TypeScript y Tailwind CSS para la web.
- Supabase Auth y PostgreSQL con RLS para aislar las fichas de cada cuenta.
- Vercel para el despliegue; GitHub Actions para controles automáticos.

Las claves privadas y variables locales no se versionan. La configuración de
RLS incluida debe estar aplicada también en el proyecto Supabase real.
Consultar [SECURITY.md](SECURITY.md), [metadatos](docs/metadatos.md) y
[almacenamiento de videos](docs/almacenamiento-videos.md).

## Licencia

[MIT](LICENSE).
