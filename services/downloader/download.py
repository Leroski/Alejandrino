#!/usr/bin/env python3
"""Motor local de descarga de Alejandrino.

Se ejecuta con Python + yt-dlp fuera del navegador. No expone un servidor HTTP
ni sube archivos a Supabase/Vercel. Requiere ffmpeg cuando hay pistas separadas.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
from urllib.parse import urlsplit
from uuid import UUID, uuid4

MEDIA_EXTENSIONS = {".mp4", ".webm", ".mkv", ".mov"}


def identify_platform(source_url: str) -> str:
    """Acepta exclusivamente enlaces de publicaciones de Instagram o TikTok."""
    if len(source_url) > 2048:
        raise ValueError("El enlace supera 2048 caracteres.")
    try:
        url = urlsplit(source_url.strip())
        host = (url.hostname or "").lower().rstrip(".")
        if url.scheme != "https" or url.username or url.password or url.port:
            raise ValueError()
    except ValueError as exc:
        raise ValueError("Se requiere un enlace HTTPS válido, sin credenciales ni puerto.") from exc

    if host in {"instagram.com", "www.instagram.com", "m.instagram.com"}:
        path = [part for part in url.path.split("/") if part]
        if len(path) >= 2 and path[0] in {"p", "reel", "reels", "tv"}:
            return "instagram"
    if host in {"tiktok.com", "www.tiktok.com", "m.tiktok.com"}:
        path = [part for part in url.path.split("/") if part]
        if len(path) >= 3 and path[0].startswith("@") and path[1] == "video":
            return "tiktok"
    if host in {"vm.tiktok.com", "vt.tiktok.com"} and url.path.strip("/"):
        return "tiktok"
    raise ValueError("Solo se admiten publicaciones/reels de Instagram o videos de TikTok.")


def download_video(source_url: str, output: Path, *, max_height: int = 1080,
                   technique_id: str | None = None) -> dict:
    platform = identify_platform(source_url)
    if max_height not in {720, 1080}:
        raise ValueError("max_height debe ser 720 o 1080.")
    if technique_id is not None:
        technique_id = str(UUID(technique_id))

    try:
        import yt_dlp
    except ImportError as exc:
        raise RuntimeError("Falta yt-dlp: instálalo en tu entorno Python.") from exc

    output = output.expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    job_dir = output / f"{platform}-{uuid4().hex[:12]}"
    job_dir.mkdir()

    options = {
        # Primero el mejor video dentro del límite + audio independiente.
        # Fallback para MP4 progresivo que ya trae audio.
        "format": f"bv[height<={max_height}]+ba/b[height<={max_height}]/bv+ba/b",
        "merge_output_format": "mp4",
        "outtmpl": str(job_dir / "%(extractor_key)s-%(id)s.%(ext)s"),
        "noplaylist": True,
        "restrictfilenames": True,
        "no_overwrites": True,
        "quiet": True,
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(source_url, download=True)
        if not info:
            raise RuntimeError("El extractor no entregó datos.")
        info = downloader.sanitize_info(info)

    files = sorted(path for path in job_dir.iterdir()
                   if path.is_file() and path.suffix.lower() in MEDIA_EXTENSIONS)
    if len(files) != 1:
        raise RuntimeError(
            f"Se esperaba un video y se encontraron {len(files)}. "
            "Los carruseles no están soportados en este prototipo."
        )
    video = files[0]
    result = {
        "status": "downloaded",
        "platform": platform,
        "source_url": source_url,
        "technique_id": technique_id,
        "provider_id": info.get("id"),
        "title": info.get("title"),
        "uploader": info.get("uploader"),
        "duration_seconds": info.get("duration"),
        "thumbnail_url": info.get("thumbnail"),
        "video_path": str(video),
        "bytes": video.stat().st_size,
        "downloaded_at": datetime.now(timezone.utc).isoformat(),
    }
    (job_dir / "metadata.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Descarga local de Alejandrino (yt-dlp)")
    parser.add_argument("url", help="URL de un reel/publicación o TikTok")
    parser.add_argument("--output", default="./downloads", help="Directorio local")
    parser.add_argument("--max-height", type=int, choices=[720, 1080], default=1080)
    parser.add_argument("--technique-id", help="UUID de una ficha existente (opcional)")
    args = parser.parse_args()

    try:
        result = download_video(
            args.url, Path(args.output),
            max_height=args.max_height,
            technique_id=args.technique_id
        )
    except Exception as error:
        print(f"Error de descarga: {error}", file=sys.stderr)
        return 1

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
