# Seguridad

## Datos y credenciales

La biblioteca requiere una sesión de Supabase. Las políticas RLS incluidas en
`supabase/` limitan cada cuenta a sus fichas. Revisar que esas políticas estén
aplicadas en el proyecto real: que existan en Git no demuestra la configuración
del servidor.

`NEXT_PUBLIC_SUPABASE_URL` y una clave **Publishable** son configuración pública
del cliente. No usar `service_role`, `sb_secret_`, contraseñas de base de datos,
tokens personales ni claves de firma en variables `NEXT_PUBLIC_*` o en la APK.
Guardar los valores de despliegue en su proveedor y mantener `.env.local` fuera
de Git. `.env.example` contiene únicamente marcadores de posición.

La APK verifica la cuenta y la ficha antes de CHECK, DOWNLOAD y OPEN; verifica
de nuevo antes de publicar una descarga. La URL procede de la ficha autorizada.
Los MP4 quedan en Download/Alejandrino y son visibles en el teléfono. No
sube archivos multimedia. Su puente admite un único origen HTTPS y no sigue
redirecciones de autorización con el token. Las ramas `feat/android-*` y sus
APK históricas son prototipos: no utilizarlas como una versión estable.

## Despliegue Android

Una Preview protegida por Vercel no es un origen utilizable directamente por
esta APK. Hacer público el repositorio no cambia esa protección. Configurar un
dominio accesible que conserve la autenticación de Supabase; nunca incrustar
un token de bypass de Vercel en el código, la URL, Gradle o la APK.

Antes de distribuir una compilación:

```bash
node scripts/check-apk-origin.cjs https://DOMINIO_CONFIGURADO --media
```

La comprobación exige una página accesible y que cada acción de la API rechace una
solicitud sin sesión con el contrato esperado. Usa IDs sintéticos y no escribe
en Supabase. No reemplaza la prueba con sesión y dispositivo reales.

## Dependencias y controles

La CI ejecuta `npm audit --audit-level=moderate` y Gitleaks sobre el historial
alcanzable. Los hallazgos se muestran redactados. Revisar también los archivos
adjuntos y logs antes de cambiar la visibilidad de un repositorio.

Se usa Next.js 16.4.5 con sus correcciones de seguridad. El override acotado de
`minimatch` 11.0.5 corrige GHSA-g3hv-75wg-m249 en el parser de ESLint; requiere
Node 20 o 22+ (el proyecto usa 24) y se valida ejecutando ESLint y la compilación.
Revisarlo cuando `typescript-eslint` incorpore una versión corregida sin override.

## Reportar un problema

No publicar credenciales ni datos de cuentas en issues. Usar el reporte privado
de vulnerabilidades de GitHub si está habilitado. Si no está disponible,
solicitar al mantenedor un canal privado sin adjuntar detalles sensibles.
Ante una credencial expuesta, revocarla o rotarla: borrarla del último commit
no la elimina del historial ni de copias externas.
