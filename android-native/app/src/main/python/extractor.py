"""Extracts authorized public video using bundled yt-dlp, with no external downloader API."""
import json
from pathlib import Path
from urllib.parse import urlsplit
import yt_dlp

def extract(url, directory):
    host = (urlsplit(url).hostname or "").lower()
    if urlsplit(url).scheme != "https" or host not in {
        "instagram.com", "www.instagram.com", "m.instagram.com",
        "tiktok.com", "www.tiktok.com", "m.tiktok.com",
        "vm.tiktok.com", "vt.tiktok.com"}:
        raise ValueError("Enlace de Instagram o TikTok no válido")
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    opts = {
        "format": "bv+ba/b",
        "format_sort": ["res:720"],
        "outtmpl": str(folder / "%(id)s.%(format_id)s.%(ext)s"),
        "noplaylist": True,
        "nooverwrites": True,
        "quiet": True,
        "noprogress": True,
    }
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        if not info or info.get("_type") == "playlist":
            raise ValueError("No se admite esta publicación")
        info = ydl.sanitize_info(info)
    paths = []
    requested = info.get("requested_downloads") or []
    for item in requested:
        path = item.get("filepath")
        if path and Path(path).is_file():
            paths.append(path)
    if not paths:
        raise ValueError("No se encontraron archivos descargados")
    return json.dumps({"source": url, "id": str(info.get("id", "")), "paths": paths}, ensure_ascii=False)
