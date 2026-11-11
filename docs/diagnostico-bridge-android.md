# Estabilización de Alejandrino: INC-01

> Documento histórico: INC-01 quedó resuelto y validado en Galaxy A07 (8/11/2026).

Fecha: 6 de noviembre de 2026. Requisitos: ALE-SRS-001, secciones 8, 10, 12 y 14.

## Resultado y alcance de este incremento

El rechazo de UUID se reproduce con el patrón real de `MainActivity.java`:
exige **8-4-4-4-4-12**, seis grupos y 41 caracteres, en vez de **8-4-4-4-12**,
cinco grupos y 36 caracteres. Rechaza tanto un `userId` como un `techniqueId`
estándar; además acepta una cadena de seis grupos que no representa un UUID.

La corrección aislada elimina el grupo adicional. No desactiva la validación,
no admite ambos formatos ni cambia identificadores guardados. El formato textual
se contrasta con [RFC 9562, sección 4](https://www.rfc-editor.org/rfc/rfc9562.html#section-4).

El PR #6 parte de `main`. Su revisión inicial incorporó diagnóstico, prueba
ejecutable, parche aislado y CI. La revisión siguiente incorpora una carcasa
Android que solo implementa `CHECK`, con el validador correcto en
`NativeCheckService.java`, autorización y respuestas correlacionadas.
Ver [contrato, compilación y límites de la APK](../android-native/README.md).
**Aún no está validada en el Galaxy A07.** El parche histórico se conserva para
reproducir el defecto de PR #5 sin importar esa rama ni activar descargas.

## Fuentes inspeccionadas

| Referencia | Commit | Alcance revisado |
| --- | --- | --- |
| `main` | `4a4b5ac2c5221ac5c70c52e5972f3e995c2ad7e9` | Web, guardado, esquema/RLS, metadatos y pruebas existentes. |
| PR #3 | `7bce17ed83142081c248743f29eafd1c35f522f6` | Motor Python de descarga, pruebas de URLs y documentación de Termux. |
| PR #4 | `b296ae9ea3ce0538c680097d72d52076ec079d87` | APK aislada: recepción de enlace, extracción, unión y publicación. |
| PR #5 | `deff118ddc0a806a22decedf78ee0d41cb93cabc` | WebView, bridge, llamadas React, índice local, deduplicación y CI. |

El defecto está en [MainActivity.java, línea 41](https://github.com/Leroski/Alejandrino/blob/deff118ddc0a806a22decedf78ee0d41cb93cabc/android-native/app/src/main/java/cl/alejandrino/nativeapp/MainActivity.java#L41).
La misma expresión comprueba ambos campos antes de `CHECK`, `OPEN` y `DOWNLOAD`.
`OPEN_EXTERNAL` retorna antes de esa comprobación; que llegue ese mensaje no
demuestra que los otros tres funcionen.

`TechniqueCard` envía `technique.user_id` y `technique.id`; `/compartir` envía
`user.id` y el ID de la ficha confirmada. El SQL define ambos como `uuid`.
Esto identifica un defecto suficiente para rechazar entradas correctas. No revela
qué valores exactos recibió el teléfono ni descarta problemas adicionales.

## Prueba reproducible

Requiere Java con compilador de fuentes (JDK 17 o posterior) y Git. No necesita
Android Studio, Android SDK, Supabase, tokens ni descargas de videos.

Desde esta rama, con el commit de referencia disponible en el repositorio:

```bash
# Se crean dos copias temporales; el checkout actual y sus cambios no se editan.
repo_root=$(git rev-parse --show-toplevel)
uuid_check_dir=$(mktemp -d)
source_path=android-native/app/src/main/java/cl/alejandrino/nativeapp/MainActivity.java
mkdir -p "$uuid_check_dir/before/$(dirname "$source_path")"
mkdir -p "$uuid_check_dir/after/$(dirname "$source_path")"
git show "deff118ddc0a806a22decedf78ee0d41cb93cabc:$source_path" > "$uuid_check_dir/before/$source_path"
cp "$uuid_check_dir/before/$source_path" "$uuid_check_dir/after/$source_path"

bash scripts/check-native-uuid.sh "$uuid_check_dir/before/$source_path" --reproduce

# Debe FALLAR con AssertionError: canonical representation 0.
bash scripts/check-native-uuid.sh "$uuid_check_dir/before/$source_path"

git -C "$uuid_check_dir/after" apply --check "$repo_root/fixes/INC-01-native-uuid.patch"
git -C "$uuid_check_dir/after" apply "$repo_root/fixes/INC-01-native-uuid.patch"
bash scripts/check-native-uuid.sh "$uuid_check_dir/after/$source_path"
```

Si falta el commit, `git fetch origin deff118ddc0a806a22decedf78ee0d41cb93cabc`
lo trae sin cambiar de rama. En CI, `bridge-contract.yml` obtiene ese mismo commit
en un checkout separado, comprueba el fallo y aplica el parche allí.

Resultado local observado con Java 21:

```text
INC-01 reproduced: two valid 36-character IDs rejected; invalid 41-character ID accepted.
AssertionError: canonical representation 0
PASS: 52 UUID format checks. Session/ownership and Android routing are not tested here.
```

Las 52 comprobaciones cubren representación canónica en distintas combinaciones
de mayúsculas/minúsculas, IDs vacíos, longitudes incorrectas, sexto grupo,
caracteres no hexadecimales, espacios, saltos de línea y caracteres Unicode
parecidos. Cada entrada inválida se comprueba por separado como usuario y ficha.
Nil/Max se aceptan solo como representaciones sintácticas: eso **no autoriza**
ninguna operación ni acredita que exista la ficha o el usuario.

La prueba extrae y ejecuta el literal real con `java.util.regex.Pattern`; no
traduce el patrón a JavaScript ni compila toda la Activity. Si el validador cambia
de ubicación o deja de ser un literal, falla explícitamente y habrá que adaptar
la prueba. No comprueba transporte JSON, respuestas, sesión, MediaStore ni APK.

## Qué se conserva y qué se reemplaza

| Componente | Decisión para la estabilización |
| --- | --- |
| Web y Supabase de `main` | Conservar como base. Mantener RLS, edición con revisión, paginación y metadatos opcionales. |
| Extracción y unión local demostradas en PR #4 | Recuperar después por partes, con pruebas de pistas y errores. No reescribir el motor que ya tuvo una prueba positiva en teléfono. |
| Separación ficha sincronizada / MP4 local | Conservar. Ningún booleano global de disponibilidad ni subida de archivos locales. |
| Regla UUID de PR #5 | Reemplazar por el formato correcto mediante el parche probado. |
| Protocolo de mensajes sin correlación | Reemplazar en el siguiente incremento por solicitudes versionadas y respuestas por `requestId`. |
| IDs enviados por JavaScript como autorización | No recuperar así: verificar sesión y propiedad antes de acceder al índice o descargar. |
| Activity que concentra transporte, navegación y descarga | Separar gradualmente al importar; no copiar como nueva línea base de producto. |
| Canonización/deduplicación de PR #5 | Tratar como referencia, no como garantía transaccional: `/p/ID` y `/reel/ID` aún pueden generar URLs distintas. |
| PR #3, #4 y #5 | Conservar abiertos y sin fusionar; no borrar ramas, datos ni cambios locales. |

## Arquitectura mínima propuesta

1. **Dominio web existente:** ficha, clasificación, identidad de publicación y
   persistencia Supabase. Un fallo de descarga conserva la ficha.
2. **Adaptador del puente:** valida origen/documento principal, versión, acción,
   IDs y correlación; delega la autorización y devuelve errores explícitos.
3. **Autorización nativa:** verifica la sesión contra Supabase y consulta la ficha
   con RLS. El usuario y la URL para la operación se obtienen de datos verificados.
   Un UUID bien formado es solo una validación de entrada.
4. **Medios locales:** servicio de descarga/unión y repositorio del índice, separados
   de WebView. Disponibilidad comprobada por dispositivo, usuario y ficha.

Se mantiene Next.js + Supabase + Android. No se decide todavía una migración a
otro framework, Room o WorkManager dentro de este cambio acotado.

## Criterios de aceptación y siguiente incremento

Para este PR: se reproduce el fallo exacto en el commit fijado, el mismo contrato
falla antes y pasa después del parche, solo cambia una línea del código Android,
y la CI repite la prueba sin credenciales de aplicación. Una CI verde aquí no
equivale a los casos TA-06/TA-09 completados.

La revisión actual implementa ese `CHECK` mínimo con `protocolVersion`,
`requestId`, error visible y verificación de sesión/propiedad mediante el servidor
de Alejandrino y Supabase, **sin iniciar descargas**. Incluye pruebas de IDs
ausentes, malformados y de otra cuenta, acciones desconocidas, respuestas
ajenas/tardías y falta de respuesta. No registra tokens, IDs ni enlaces en Logcat.

Después, el Galaxy A07 debe comprobar `CHECK → missing/available`, un rechazo
visible y el regreso desde un enlace externo. Solo entonces se recupera el
recorrido con una ficha: guardar, descargar, vincular, reproducir y reiniciar.
La validación de la APK instalada con una cuenta real y ese recorrido permanecen
pendientes. La variante debug se instala aparte y no hereda el índice anterior.
