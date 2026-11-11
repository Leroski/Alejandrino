# Componentes de la APK

El código de Alejandrino conserva su licencia MIT. Sus dependencias conservan
sus propias licencias; la licencia MIT del proyecto no las sustituye.

| Componente | Versión | Licencia y fuente |
| --- | --- | --- |
| Chaquopy | 17.1.0 | MIT · https://github.com/chaquo/chaquopy/tree/17.1.0 |
| Python | 3.11 (runtime Chaquopy) | PSF y avisos del runtime · https://docs.python.org/3.11/license.html |
| yt-dlp | 2026.10.26 | Unlicense y avisos de componentes · https://github.com/yt-dlp/yt-dlp/tree/2026.10.26 |
| FFmpegKit maintained min | 8.1.9 | LGPL-3.0 · https://github.com/ffmpegkit-maintained/ffmpeg/releases/tag/v8.1.9-lts-android |
| smart-exception-java | 0.2.1 | BSD-3-Clause · https://github.com/arthenica/smart-exception |
| AndroidX WebKit | 1.14.0 | Apache-2.0 · https://android.googlesource.com/platform/frameworks/support/ |

FFmpegKit se integra como bibliotecas compartidas en la variante `min`, sin
variantes `-gpl` ni recodificación con x264/x265. El repositorio público incluye
el código de la aplicación y sus instrucciones de compilación. Los paquetes
originales incluyen sus avisos; se deben conservar al redistribuirlos.

Antes de una distribución general o Play Store, comprobar la documentación de
los binarios exactos, sus componentes nativos y las obligaciones de sus licencias.
Esta APK sigue siendo una compilación de prueba, con aceptación en teléfono
pendiente para la fase multimedia.
