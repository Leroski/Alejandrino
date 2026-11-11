# Contexto del producto (resumen para desarrollo)

Fuentes: SRS ALE-SRS-001 (6/11/2026) y hoja de ruta (9/11/2026), condensadas.
Actualizado: 11/11/2026, APK 0.5.2.

## Objetivo

Biblioteca personal de videos de grappling (judo, BJJ, lucha). Guardar desde
Compartir sin escribir nada, clasificar después, encontrar rápido y reproducir
una copia local en el teléfono. Android es prioritario; la web es complemento.

## Reglas que no se negocian

- Los MP4, el audio y los fotogramas/miniaturas generados en el teléfono nunca
  se suben (RNF-001). Sí se sincronizan fichas y metadatos públicos.
- La disponibilidad local se calcula por dispositivo; no hay un "descargado"
  global en Supabase (RF-025).
- La APK no confía en IDs de JavaScript: verifica sesión y propiedad (RF-003).
- Guardar no espera a metadatos ni descargas; un fallo no borra la ficha.
- Sin migraciones destructivas ni limpieza masiva de duplicados sin inventario,
  respaldo y plan de reversión. No desactivar validaciones para "hacerlo andar".
- Descargar solo contenido permitido; no evadir login ni restricciones.
- CI verde no equivale a aceptación: la prueba real es en el Galaxy A07.
- La IA solo sugiere; nunca sobrescribe la clasificación manual (RF-030).

## Estado (11/11/2026)

Hecho: login Supabase con RLS, guardado/edición/búsqueda, Compartir desde
Android, metadatos oEmbed (TikTok/YouTube), APK con CHECK/DOWNLOAD/OPEN,
reproductor interno, vistas previas locales (portada, duración, descripción).
Descarga y reproducción confirmadas en Galaxy A07 con la 0.5.2.

## Pendiente, en orden propuesto

1. Identidad canónica de publicación (RF-007/008/009): hoy la unicidad es por
   URL exacta; `?igsh=` o `/p/` vs `/reel/` duplican fichas.
2. Biblioteca y notas (fase 2): colecciones (varias por ficha), etiquetas,
   notas, estado de uso (por revisar / por practicar / archivado), filtro
   "Disponible en este dispositivo".
3. Sin conexión (fase 3, RF-026/027): la UI se carga desde Vercel y OPEN pide
   autorización al servidor, así que hoy nada funciona en modo avión. Requiere
   UI e índice locales (evaluar Room/SQLite en vez de SharedPreferences).
4. Descargas persistentes (RF-023, WorkManager) y vinculación manual de MP4
   existentes (RF-024).
5. Metadatos de Instagram obtenidos en la APK: hoy quedan solo en el teléfono;
   sus textos públicos podrían sincronizarse.
6. Recordatorios locales (fase 5, WorkManager + notificaciones) y luego
   clasificación asistida por texto (fase 4, endpoint con esquema validado).
7. Sensei (hábitos/lectura) es otra app; puede reutilizar la lógica de avisos.

Decisiones abiertas: taxonomía fija o libre, proveedor/presupuesto de IA,
MediaStore público vs almacenamiento privado, firma automática en CI.

## Firma de la APK

La CI entrega `alejandrino-media-unsigned`; se firma localmente con la clave
del usuario (ver `android-native/README.md`). Huella en
`android-native/beta-signing-certificate.txt`.
