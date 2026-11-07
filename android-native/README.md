# Alejandrino: APK de comprobación local

Esta versión permite abrir la biblioteca, compartir/guardar enlaces y pulsar
**Comprobar video local** en una ficha. Solo implementa `CHECK`: no descarga,
reproduce, importa ni modifica archivos. El descargador experimental se conserva
en los PR #3–#5 y se recuperará después de validar esta consulta en teléfono.

La variante debug se instala como **Alejandrino prueba**, con paquete
`cl.alejandrino.nativeapp.check`, separado de la APK anterior. Por ello **no
comparte su índice ni hereda asociaciones de videos**. En una instalación limpia,
una ficha autorizada debe devolver «No descargado en este dispositivo».
`available` se prueba automáticamente con un índice simulado; su validación con
un archivo real sigue pendiente junto con la recuperación/importación del índice.

## Compilar e instalar

Requiere JDK 17, Gradle 8.11.1 y Android SDK 35. Se puede abrir `android-native/`
en Android Studio o usar la APK del workflow **Authenticated native CHECK**.
Las ejecuciones de PR compilan y prueban, pero no distribuyen APK. Al integrar
cambios en `main`, el workflow verifica que la web y la API CHECK del dominio
público estén disponibles antes de publicar el artefacto `alejandrino-check-debug`,
que contiene `app-debug.apk`. También se puede ejecutar manualmente con
`web_origin`; en ese caso la verificación ocurre antes de compilar.

También se puede verificar antes de compilar:

```bash
node scripts/check-apk-origin.cjs https://DOMINIO_CONFIGURADO
```

Esta prueba no usa credenciales ni escribe en Supabase. Rechaza redirects, HTML
de login y una API que acepte peticiones sin sesión. No acredita una sesión
real ni la instalación en teléfono.

Para compilar localmente, desde `android-native/`:

```bash
gradle :app:testDebugUnitTest :app:lintDebug :app:assembleDebug \
  -PALEJANDRINO_WEB_URL=https://proyalejandrino.vercel.app
```

En Android Studio, la misma propiedad se puede poner en el archivo local
`~/.gradle/gradle.properties` como `ALEJANDRINO_WEB_URL=https://...`, o pasarla
en los argumentos de Gradle. La URL es configuración **de la APK**; no se
configura en Supabase ni mediante una variable del servidor Vercel.
`local.properties`, salidas de compilación y configuración del IDE no se versionan.

La versión 0.3.1-check usa `https://proyalejandrino.vercel.app`, el dominio público
estable. La APK 0.3.0 apuntaba a una Preview protegida y mostraba el error de
acceso a otro dominio. La web y `/api/native/authorize` deben desplegarse en
producción antes de distribuir la nueva APK. Se conserva la protección de las
Previews y la autenticación Supabase. La app no sigue redirects de autorización
con el bearer token ni amplía los orígenes permitidos.

Una APK de CI y una compilada en tu Android Studio pueden tener firmas debug
distintas. Para conservar la instalación de prueba entre actualizaciones, usa
el mismo origen de compilación/firma. La APK principal queda aparte.

## Contrato y autorización

El objeto inyectado es `window.AlejandrinoBridgeV1`. Solo se expone al origen HTTPS
configurado. Se rechazan mensajes de subframes. Cada petición lleva:

```json
{
  "protocolVersion": 1,
  "requestId": "550e8400-e29b-41d4-a716-446655440000",
  "type": "CHECK",
  "userId": "123e4567-e89b-42d3-a456-426614174000",
  "techniqueId": "019321ab-cdef-7abc-8def-0123456789ab",
  "accessToken": "token-de-sesion-transitorio"
}
```

Los identificadores del ejemplo son sintéticos; el token debe obtenerse de la
sesión Supabase. No pegar tokens reales en documentación, capturas ni Logcat.

1. Android valida versión, acción, formato de IDs y tamaño del mensaje.
2. Android llama por HTTPS a `/api/native/authorize` **del origen configurado**.
   Envía el token solo en `Authorization: Bearer ...`, sin persistirlo.
3. El servidor verifica el token mediante `auth.getUser(token)`. Compara el usuario
   verificado con el solicitado y consulta la ficha bajo RLS y ese mismo token.
   Solo utiliza la clave pública del proyecto; no usa `service_role`.
4. Android exige que la respuesta `AUTHORIZED` coincida con versión, solicitud,
   usuario y ficha. Solo entonces lee el índice local y comprueba que el archivo
   MediaStore es accesible y contiene datos.
5. La respuesta usa `JavaScriptReplyProxy`: `AVAILABILITY` con `missing/available`
   o `ERROR` con un código. Nunca incluye URI, bytes del archivo ni el token.

El protocolo anterior sin versión no se usa. Se permiten ocho consultas en vuelo;
hay tiempos límite en cliente y red. Los errores no se presentan como `missing`.
Cambiar de cuenta/desmontar la ficha cancela la espera y descarta respuestas tardías.
Navegar a otro documento invalida las respuestas nativas de la página anterior.

La verificación requiere conexión. Esta versión no implementa biblioteca offline.
El servidor autoriza la consulta; la disponibilidad se calcula exclusivamente en
Android. No se envía información del índice ni contenido multimedia al servidor.

## Pruebas y aceptación

Desde la raíz del repositorio:

```bash
node --test tests/*.test.cjs
bash scripts/check-native-uuid.sh
npx eslint app
npx tsc --noEmit
npm run build
```

La prueba UUID ahora usa por defecto `NativeCheckService.java`, el validador real
de esta APK. El workflow histórico conserva la reproducción del patrón defectuoso
del PR #5 en un checkout aislado.

Los tests web verifican autorización, errores, correlación, timeout y cancelación.
Los tests JVM verifican que no se lea el índice sin autorización, origen exacto,
respuesta del servidor, redirecciones, límites y errores de lectura. Son pruebas
con dobles de Auth/base de datos/red/índice; no acreditan una sesión real ni un
recorrido WebView en teléfono. La compilación y Android Lint se comprueban en CI.

Pendiente en Galaxy A07:

- Iniciar sesión y consultar una ficha propia: «No descargado» en instalación limpia.
- Cerrar sesión durante una comprobación: ningún resultado aparece en otra cuenta.
- Sin conexión: error visible y posibilidad de reintentar, sin quedarse esperando.
- Abrir el video original: se abre fuera de WebView y se puede volver a la biblioteca.
- Verificar asociación real y estado `available` cuando se recupere el índice/importación.

TA-06/TA-09 (descarga y reproducción) siguen pendientes; esta APK no los implementa.
