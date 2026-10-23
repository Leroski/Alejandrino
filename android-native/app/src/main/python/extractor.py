"""Descarga pistas locales con yt-dlp. Java/FFmpegKit realiza la unión de audio y video."""
import json
from pathlib import Path
from urllib.parse import urlsplit
import yt_dlp

ALLOWED_HOSTS = {
    "instagram.com", "www.instagram.com", "m.instagram.com",
    "tiktok.com", "www.tiktok.com", "m.tiktok.com",
    "vm.tiktok.com", "vt.tiktok.com",
}
SAFE_EXTENSIONS = {"mp4", "m4a", "webm", "mp3", "aac", "mov", "mkv"}


def choose_tracks(info):
    """Selecciona la pista de video y, si existe, su pista independiente de audio."""
    formats = info.get("requested_formats") or [info]
    if not 1 <= len(formats) <= 2:
        raise ValueError("Se esperaban una o dos pistas multimedia")
    video = next((f for f in formats if f.get("vcodec") != "none"), None)
    if video is None:
        raise ValueError("La publicación no tiene pista de video")
    audio = next((f for f in formats
                  if f is not video and f.get("vcodec") == "none"
                  and f.get("acodec") != "none"), None)
    if len(formats) == 2 and audio is None:
        raise ValueError("Formato combinado no soportado")
    return video, audio


def extract(url, directory):
    parsed = urlsplit(url)
    if (len(url) > 2048 or parsed.scheme != "https" or
            parsed.hostname not in ALLOWED_HOSTS or
            parsed.username or parsed.password or parsed.port):
        raise ValueError("Enlace de Instagram o TikTok no válido")

    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    opts = {
        "format": "bv+ba/b",
        "format_sort": ["res:720"],
        "noplaylist": True,
        "quiet": True,
        "noprogress": True,
        "overwrites": False,
    }

    # download=False resuelve los formatos sin usar FFmpeg.
    # Cada pista se descarga individualmente; NO pedimos a yt-dlp que las una.
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        if not info or info.get("_type") == "playlist":
            raise ValueError("No se admite esta publicación")
        video, audio = choose_tracks(info)
        paths = {}
        for role, fmt in (("video", video), ("audio", audio)):
            if fmt is None:
                continue
            ext = str(fmt.get("ext") or "").lower()
            if ext not in SAFE_EXTENSIONS:
                raise ValueError("Formato de pista no soportado: " + ext)
            target = folder / f"{role}.{ext}"
            stream = dict(info)
            stream.pop("requested_formats", None)
            stream.pop("requested_downloads", None)
            stream.update(fmt)
            success, _ = ydl.dl(str(target), stream)
            if not success or not target.is_file() or target.stat().st_size == 0:
                raise RuntimeError("No se pudo descargar la pista " + role)
            paths[role] = str(target)

    return json.dumps({
        "source": url,
        "id": str(info.get("id", "")),
        "video_path": paths["video"],
        "audio_path": paths.get("audio"),
    }, ensure_ascii=False)
