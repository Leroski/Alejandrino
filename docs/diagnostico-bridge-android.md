# Estabilización del puente Android

## Rechazo de CHECK y DOWNLOAD

En [MainActivity.java del PR #5](https://github.com/Leroski/Alejandrino/blob/feat/android-library-integration/android-native/app/src/main/java/cl/alejandrino/nativeapp/MainActivity.java#L39), Android exige bloques de longitud 8-4-4-4-4-12. Un UUID estándar usa 8-4-4-4-12. El patrón se aplica a ambos IDs antes de consultar el índice o iniciar una descarga. Esto explica por qué fallan los mensajes con IDs estándar, aunque el código fuente por sí solo no identifica el contenido exacto de los mensajes de una APK instalada.

En la web, `TechniqueCard` pasa `technique.user_id` y `technique.id` a CHECK. La página Compartir pasa `user.id` de Supabase Auth y `confirmed.id` de la ficha insertada o encontrada a DOWNLOAD. El esquema en `main` declara ambos campos de la ficha como UUID.

### Reproducción sin APK ni cuenta

Guardar como `AlejandrinoUuidProbe.java` y ejecutar `java AlejandrinoUuidProbe.java` con JDK 11 o superior. La segunda columna prueba el patrón del PR #5 y la tercera prueba la corrección propuesta.

```java
import java.util.UUID;
import java.util.regex.Pattern;

class AlejandrinoUuidProbe {
    public static void main(String[] args) {
        var current = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
        var canonical = Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
        for (var id : new String[] {
            UUID.randomUUID().toString(),
            "12345678-1234-1234-1234-1234-123456789abc",
            ""
        }) {
            System.out.printf("%d %b %b%n", id.length(),
                current.matcher(id).matches(), canonical.matcher(id).matches());
        }
    }
}
```

```text
36 false true
41 true false
0 false false
```

## Qué recuperar

| Base | Decisión |
|---|---|
| `main` | Conservar Next.js, Supabase Auth, RLS y el CRUD de fichas. |
| PR #3 | Conservar el descargador por terminal como referencia y sus casos de prueba. Excluir Termux del recorrido normal. |
| PR #4 | Recuperar el extractor, la mezcla con audio y la publicación en MediaStore como una unidad comprobable. La APK aislada ya produjo un MP4 según la prueba de traspaso. |
| PR #5 | Recuperar por separado el transporte WebView y la consulta del índice. Corregir el validador y correlacionar cada solicitud con su respuesta. Tratar el índice de SharedPreferences como prototipo. |

El origen WebView autorizado controla quién puede enviar mensajes al puente. La sesión autenticada y la propiedad de la ficha deben verificarse por separado antes de habilitar operaciones sobre archivos. La disponibilidad se calcula en el dispositivo. Supabase conserva las fichas y sus metadatos.

## Primera prueba de integración

1. Abrir en el Galaxy A07 una ficha real de la cuenta autenticada. Ejecutar solo CHECK con el validador corregido.
2. Verificar que la respuesta correlacionada sea `missing` si la ficha carece de un archivo y `available` si la asociación existe y se puede leer.
3. Repetir con IDs ausentes, de 41 caracteres y con un UUID bien formado de otra cuenta. Comprobar rechazo, error visible y ausencia de identificadores completos o tokens en Logcat.
4. Tras validar CHECK, probar la descarga y reproducción de una ficha autorizada. Reiniciar la APK y verificar que la asociación persiste sin duplicar el MP4.
