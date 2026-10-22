# Prototipo Android: compartir a Termux

Estado: **experimental, requiere validación en el teléfono**. No sustituye a
Alejandrino ni sincroniza automáticamente archivos con sus fichas Supabase.

Este paso utiliza la función nativa de Termux `~/bin/termux-url-opener`:
cuando Android comparte una URL con Termux, la aplicación ejecuta el script
y pasa el texto compartido como primer argumento.

## Instalación desde Ubuntu usando ADB (opcional)

Con el teléfono configurado para desarrollo y conectado a ADB:

```bash
adb push scripts/android/termux-url-opener /sdcard/Download/termux-url-opener
```

Después, en Termux (con `termux-setup-storage` ejecutado):

```bash
mkdir -p ~/bin
cp ~/storage/downloads/termux-url-opener ~/bin/termux-url-opener
chmod +x ~/bin/termux-url-opener
```

Si se descarga el script desde un archivo adjunto, basta copiarlo a
`~/storage/downloads` y ejecutar esas dos últimas órdenes.

## Probar

En Termux:

```bash
~/bin/termux-url-opener 'https://www.instagram.com/p/Deq5Cdis7Jd/'
tail -n 25 ~/alejandrino-descargas.log
```

En Instagram: Compartir → Termux. Consultar los videos en
`Download/Alejandrino` y el registro `~/alejandrino-descargas.log`.

Se requiere Python, yt-dlp, FFmpeg, permisos de almacenamiento y un Termux
que pueda recibir enlaces compartidos. Android/One UI pueden restringir su
actividad en segundo plano; algunos teléfonos necesitan autorizar ventanas
sobre otras aplicaciones. Algunas publicaciones pueden requerir autenticación.

## Siguiente etapa

El flujo deseado es **Compartir → Alejandrino → guardar ficha → descargar →
asociar archivo local**. El paso provisional Termux solo hace **Compartir →
Termux → descargar**.

Para la app definitiva evaluar un receptor nativo de `ACTION_SEND`, con un
motor yt-dlp Android (y FFmpeg integrado) y un índice local que asocie
`techniques.id` al archivo descargado. La UI de Next.js puede mantenerse
por separado; una PWA no puede invocar procesos de Termux de forma fiable.
No exponer servidores locales HTTP sin autenticación para ejecutar descargas.

Ver también `docs/almacenamiento-videos.md` y
`docs/descargador-local.md`.
