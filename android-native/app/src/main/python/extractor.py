"""Download bounded local tracks; Java remuxes, validates and publishes the MP4."""
import json
import math
import re
import errno
import socket
from pathlib import Path
from urllib.parse import urlsplit
import yt_dlp
from yt_dlp.utils import DownloadError
from yt_dlp.networking.exceptions import HTTPError, TransportError

MAX_BYTES = 256 * 1024 * 1024
SAFE_EXTENSIONS = {"mp4", "m4a"}


class ExtractionFailure(ValueError):
    def __init__(self, code):
        self.code = code
        super().__init__(code)


def failure_code(error):
    """Only a fixed diagnostic code crosses the bridge, never an exception or signed media URL."""
    chain, seen = [], set()
    while error is not None and id(error) not in seen and len(chain) < 8:
        seen.add(id(error))
        chain.append(error)
        detail = getattr(error, "exc_info", None)
        error = detail[1] if detail and detail[1] else getattr(error, "cause", None) or error.__cause__
    for item in chain:
        if isinstance(item, ExtractionFailure):
            return item.code
        if isinstance(item, HTTPError):
            if item.status == 429:
                return "PROVIDER_RATE_LIMITED"
            if item.status in (401, 403):
                return "PROVIDER_ACCESS_REQUIRED"
            if item.status in (404, 410):
                return "PROVIDER_UNAVAILABLE"
        if isinstance(item, OSError) and item.errno == errno.ENOSPC:
            return "STORAGE_FAILED"
    message = " ".join(str(item)[:2000].lower() for item in chain)
    if "429" in message or "rate-limit" in message or "too many requests" in message:
        return "PROVIDER_RATE_LIMITED"
    if any(word in message for word in ("login required", "log in", "sign in", "private video", "registered users", "http error 403")):
        return "PROVIDER_ACCESS_REQUIRED"
    if any(word in message for word in ("requested format", "no video formats", "missing audio", "missing video", "unsupported track")):
        return "FORMAT_UNAVAILABLE"
    if any(isinstance(item, (TransportError, socket.timeout, ConnectionError)) for item in chain):
        return "DOWNLOAD_NETWORK_FAILED"
    return "DOWNLOAD_FAILED"


def extract_result(url, directory, guard):
    try:
        return extract(url, directory, guard)
    except Exception as error:
        # Java checks the guard again, so cancellation/expiry always takes precedence.
        return json.dumps({"error_code": failure_code(error)})


def valid_source(url):
    if not isinstance(url, str) or len(url) > 2048 or re.search(r"[\s\\]", url):
        return False
    try:
        p = urlsplit(url)
        if p.scheme != "https" or p.username or p.password or p.port or p.query or p.fragment:
            return False
        if p.hostname in {"instagram.com", "www.instagram.com", "m.instagram.com"}:
            return bool(re.fullmatch(r"/(?:reel|reels|p)/[A-Za-z0-9_-]+/?", p.path))
        if p.hostname in {"tiktok.com", "www.tiktok.com", "m.tiktok.com"}:
            return bool(re.fullmatch(r"/@[A-Za-z0-9._-]+/video/\d+/?", p.path))
        return p.hostname in {"vm.tiktok.com", "vt.tiktok.com"} and bool(re.fullmatch(r"/[A-Za-z0-9_-]+/?", p.path))
    except ValueError:
        return False


def choose_tracks(info):
    formats = info.get("requested_formats") or [info]
    if not 1 <= len(formats) <= 2:
        raise ValueError("Unsupported tracks")
    video = next((f for f in formats if f.get("vcodec") != "none"), None)
    if video is None:
        raise ValueError("Missing video")
    audio = next((f for f in formats if f is not video and f.get("vcodec") == "none" and f.get("acodec") != "none"), None)
    if len(formats) == 2 and audio is None:
        raise ValueError("Missing audio")
    return video, audio


class QuietLogger:
    def debug(self, _message):
        pass
    def info(self, _message):
        pass
    def warning(self, _message):
        pass
    def error(self, _message):
        pass


def public_metadata(info):
    def text(key, limit):
        value = info.get(key)
        return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", value).strip()[:limit] if isinstance(value, str) else ""
    duration = info.get("duration")
    if isinstance(duration, bool) or not isinstance(duration, (int, float)) or not math.isfinite(duration) or not 0 < duration <= 86400:
        duration = 0
    return {"title": text("title", 500), "author": text("uploader", 200) or text("channel", 200),
            "description": text("description", 2000), "thumbnail_url": text("thumbnail", 4096), "duration": duration}


def preview(url, guard):
    """Read public metadata; never download audiovisual data."""
    if not valid_source(url):
        raise ValueError("Unsupported source")
    if guard.isStopped():
        raise RuntimeError("Cancelled")
    opts = {"skip_download": True, "noplaylist": True, "quiet": True, "noprogress": True,
            "logger": QuietLogger(), "socket_timeout": 10, "retries": 0, "extractor_retries": 0,
            "cachedir": False, "allowed_extractors": ["Instagram", "InstagramIOS", "TikTok", "vm[.]tiktok"]}
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
    if guard.isStopped():
        raise RuntimeError("Cancelled")
    if not info or info.get("_type") in {"playlist", "multi_video"} or info.get("is_live"):
        raise ValueError("Unsupported publication")
    return json.dumps(public_metadata(info))


def extract(url, directory, guard):
    if not valid_source(url):
        raise ValueError("Unsupported source")
    folder = Path(directory)
    folder.mkdir(parents=True, exist_ok=True)
    completed_bytes = 0

    def check(progress=None):
        if guard.isStopped():
            raise RuntimeError("Cancelled")
        if progress and completed_bytes + (progress.get("downloaded_bytes") or 0) > MAX_BYTES:
            raise ExtractionFailure("FILE_TOO_LARGE")

    opts = {
        "format": "bv[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv[ext=mp4]",
        "format_sort": ["res:720", "vcodec:h264", "acodec:aac"],
        "noplaylist": True, "quiet": True, "noprogress": True,
        "logger": QuietLogger(), "overwrites": False, "socket_timeout": 15,
        "retries": 1, "fragment_retries": 1, "extractor_retries": 1,
        "max_filesize": MAX_BYTES, "progress_hooks": [check],
        "cachedir": False, "hls_prefer_native": True,
        # Never fall back to a generic URL downloader after an extractor redirect.
        "allowed_extractors": ["Instagram", "InstagramIOS", "TikTok", "vm[.]tiktok"],
    }
    check()
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=False)
        check()
        if not info or info.get("_type") in {"playlist", "multi_video"} or info.get("is_live"):
            raise ValueError("Unsupported publication")
        video, audio = choose_tracks(info)
        # A publication can expose DASH tracks which fail while its progressive MP4 works.
        # Retry at most one public alternate; never reuse a partial file from the first attempt.
        fallback = next((f for f in reversed(info.get("formats") or [])
                         if f.get("ext") == "mp4" and f.get("vcodec") != "none"
                         and f.get("acodec") != "none" and f.get("url") != video.get("url")
                         and f.get("protocol") in ("http", "https")), None)
        candidates = [(video, audio)] + ([(fallback, None)] if fallback else [])
        for attempt, (video, audio) in enumerate(candidates):
            paths = {}
            completed_bytes = 0
            try:
                for role, fmt in (("video", video), ("audio", audio)):
                    if fmt is None:
                        continue
                    check()
                    if (fmt.get("filesize") or 0) + completed_bytes > MAX_BYTES:
                        raise ExtractionFailure("FILE_TOO_LARGE")
                    ext = str(fmt.get("ext") or "").lower()
                    if ext not in SAFE_EXTENSIONS:
                        raise ValueError("Unsupported track format")
                    target = folder / f"{role}-{attempt}.{ext}"
                    stream = dict(info)
                    for key in ("requested_formats", "requested_downloads", "fragments", "fragment_base_url", "protocol", "manifest_url"):
                        stream.pop(key, None)
                    stream.update(fmt)
                    success, _ = ydl.dl(str(target), stream)
                    check()
                    if not success or not target.is_file() or target.stat().st_size == 0:
                        raise DownloadError("Incomplete track")
                    completed_bytes += target.stat().st_size
                    if completed_bytes > MAX_BYTES:
                        raise ExtractionFailure("FILE_TOO_LARGE")
                    paths[role] = str(target)
                break
            except (DownloadError, HTTPError, TransportError) as error:
                check()
                if attempt + 1 == len(candidates) or failure_code(error) in {"PROVIDER_RATE_LIMITED", "FILE_TOO_LARGE", "STORAGE_FAILED"}:
                    raise
                for partial in folder.iterdir():
                    if partial.is_file():
                        partial.unlink()
    return json.dumps({"video_path": paths["video"], "audio_path": paths.get("audio"),
                       "audio_required": audio is not None or video.get("acodec") != "none",
                       "metadata": public_metadata(info)})
