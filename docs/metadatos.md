# Metadatos automáticos

Los metadatos describen una publicación. No clasifican su técnica y no contienen
el archivo de video. Se guardan en `video_metadata`, relacionado por UUID con
`techniques`, para conservar los nombres y clasificaciones manuales.

## Fuentes

| Fuente | Comportamiento |
| --- | --- |
| TikTok, enlace público de video | Consulta oEmbed con un límite total de ocho segundos |
| TikTok, enlace vm/vt o /t/ | Resuelve un máximo de cuatro redirecciones a hosts y rutas permitidos |
| YouTube, watch/shorts/youtu.be/embed/live | Extrae el ID y consulta oEmbed |
| Instagram | Conserva el enlace; vista previa automática pendiente de integración |
| Otras fuentes | Conserva el enlace sin consultar URLs arbitrarias |

La disponibilidad depende del proveedor. Publicaciones privadas, eliminadas,
restricciones regionales o límites de acceso pueden impedir la vista previa.
El HTML recibido no se ejecuta. Solo se usan título, autor y URL de miniatura;
las imágenes se muestran desde dominios permitidos de los proveedores.

## Archivos y responsabilidades

| Archivo | Responsabilidad |
| --- | --- |
| `supabase/02-video-metadata.sql` | Tabla, RLS y funciones de consulta por usuario |
| `app/types/video-metadata.ts` | Modelo, estados y comprobación de URLs de miniaturas |
| `app/types/technique.ts` | Tipos de tablas y funciones disponibles en Supabase |
| `app/lib/metadata-provider.server.ts` | Consulta limitada a TikTok y YouTube |
| `app/api/video-metadata/route.ts` | Sesión, propiedad de la ficha y resultado persistente |
| `app/lib/video-metadata.ts` | Comunicación del navegador con el servidor y Supabase |
| `app/lib/use-video-metadata.ts` | Carga de resultados y consultas pendientes |
| `app/components/TechniqueCard.tsx` | Vista previa, edición manual y actualización opcional |
| `app/components/Library.tsx` | Integra resultados y permite buscar por título original y autor |
| `app/compartir/page.tsx` | Confirma el guardado sin esperar a oEmbed |
| `tests/video-metadata.test.cjs` | Casos de redirecciones, proveedores, fallos y límites |

## Seguridad y concurrencia

- La API recibe el UUID de una técnica. Su URL se lee desde Supabase.
- El servidor valida la sesión y trabaja con el token del usuario, sin service_role.
- RLS significa Row Level Security, seguridad por fila: cada usuario lee sus filas.
- Las funciones SQL de escritura derivan el propietario desde la sesión y comprueban
  la propiedad de la técnica. No aceptan un user_id elegido por el cliente.
- Las consultas repetidas comparten un turno de un minuto. Un token de turno evita
  que una respuesta antigua sobrescriba un resultado más reciente.
- Las respuestas remotas tienen límites de tiempo y tamaño. Las redirecciones solo
  pueden ir a los hosts y rutas TikTok previstos. No hay un proxy de URLs generales.
- El cliente verifica también las URLs de miniaturas antes de mostrarlas.

## Guardado y recuperación

Guardar una técnica no depende de que funcionen los metadatos. Se confirma primero
la escritura en `techniques`; las consultas de vista previa ocurren después.
Al abrir la biblioteca se leen los resultados y se consultan las fichas pendientes,
de dos en dos. El servidor limita las consultas recientes por usuario.

Los errores temporales conservan los datos anteriores y habilitan otro intento
tras cinco minutos. Los resultados disponibles no se renuevan automáticamente:
el botón Actualizar vista previa permite hacerlo, respetando el tiempo de espera.
Los resultados no disponibles también pueden consultarse de nuevo manualmente.

Si se cierra la aplicación, no se garantiza completar la consulta en ese momento.
Al volver a abrir la biblioteca, una ficha sin resultado o con un turno vencido
puede reintentarse. No hay una cola permanente de trabajo fuera de la aplicación.

Una miniatura remota puede caducar. Si deja de cargar, la tarjeta conserva el enlace
y los textos, y permite solicitar información actualizada.

## Instalación y pruebas

Ejecuta `supabase/02-video-metadata.sql` completo en SQL Editor de Supabase.
La aplicación usa las variables NEXT_PUBLIC_SUPABASE_URL y
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ya configuradas en local y en Vercel.

```bash
node --test tests/video-metadata.test.cjs
npm run build
```

Después verifica guardado rápido, recarga, sincronización entre dispositivos,
conservación de ediciones manuales y fallback de Instagram.

La biblioteca local futura usará el mismo identificador de técnica. Este bloque
no crea almacenamiento de videos y no accede a los archivos del dispositivo.

## Referencias

- [TikTok oEmbed](https://developers.tiktok.com/doc/embed-videos/)
- [YouTube oEmbed: respuesta de ejemplo](https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=jNQXAC9IVRw&format=json)
- [RLS en Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
