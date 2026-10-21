# Motor de descarga local (prototipo)

Estado: **implementado como módulo Python independiente; todavía no conectado al navegador ni a Android**.

## Objetivo

Compartir Instagram/TikTok → guardar la ficha existente en Supabase → descargar
el video al **dispositivo** → asociar su ruta local con `techniques.id`.
El video no se subirá a Supabase ni a Vercel. Una descarga fallida nunca
debe borrar la ficha.

El motor usa yt-dlp y ffmpeg, no la API de un sitio de descargas externo.

## Probar en Ubuntu

Requisitos: Python 3, ffmpeg y conexión a Internet.

```bash
sudo apt install -y ffmpeg python3-venv
python3 -m venv .venv-downloader
.venv-downloader/bin/pip install -U yt-dlp
.venv-downloader/bin/python -m unittest discover -s tests -p 'downloader.test.py' -v
.venv-downloader/bin/python services/downloader/download.py \
  'https://www.instagram.com/p/Deq5Cdis7Jd/' \
  --max-height 1080 \
  --output ./downloads
```

Cada operación crea una carpeta y `metadata.json` con la información extraída.
No requiere credenciales, servidor externo propio ni API comercial. La operación
puede fallar si el contenido no es accesible o si la plataforma cambia.

## Contrato del módulo

Entrada: `url`, `max_height` (720 o 1080), `output` y `technique_id` opcional
(UUID de la ficha almacenada en Supabase).

Salida JSON con `status`, `source_url`, `platform`, `technique_id`,
`video_path`, `bytes`, `provider_id`, `title`, `uploader`,
`duration_seconds` y `thumbnail_url`.

**Importante:** `video_path` identifica un archivo en el dispositivo que ejecuta
el motor; nunca debe interpretarse como una ruta transferible a otro dispositivo.

## Limitaciones / siguiente integración

- Una PWA no puede ejecutar Python ni ffmpeg de manera nativa. No se ha añadido
  un endpoint Vercel para ejecutar este módulo ni se debe subir el video al backend.
- Próximo paso: comprobar una app Android nativa o híbrida que permita ejecutar
  el extractor y escribir el archivo en almacenamiento local. Evaluar permisos,
  fiabilidad en segundo plano, formatos/decodificación y recepción de ACTION_SEND.
- El formato MP4 es un contenedor: un archivo VP9+AAC dentro de MP4 podría
  reproducirse en unos dispositivos y no en otros. Validar en Chrome/Android.
- Los carruseles y las publicaciones privadas quedan fuera de esta primera prueba.
- La extracción no promete 1080p ni descargas sin marcas para todos los videos.
- Falta diseñar una tabla o índice **local al dispositivo** para asociar
  `techniques.id` con el archivo sin mezclar usuarios; nunca asignar un
  estado global «descargado» en Supabase.
- Antes de automatizar las descargas, confirmar uso sobre contenido propio,
  autorizado o cuya descarga esté permitida.

No modifica el flujo Compartir, la tabla `techniques` ni el guardado de enlaces.
