"""Android-only test fixture. Replaces provider/network IO, keeps actual yt-dlp and Java guard."""
import copy
import io
from pathlib import Path
from urllib.parse import urlsplit
import yt_dlp
from yt_dlp.networking.common import Response
from yt_dlp.networking.exceptions import HTTPError

_extract_info = yt_dlp.YoutubeDL.extract_info
_urlopen = yt_dlp.YoutubeDL.urlopen


def install(directory, mode):
    root = Path(directory)
    base = "https://fixture.example/"
    video = {"url": base + "video.mp4", "ext": "mp4", "vcodec": "h264", "acodec": "none", "height": 120}
    audio = {"url": base + "audio.m4a", "ext": "m4a", "vcodec": "none", "acodec": "aac"}
    combined = {**video, "url": base + "combined.mp4", "acodec": "aac"}
    if mode == "dash":
        video = {**video, "protocol": "http_dash_segments", "fragment_base_url": base,
                 "fragments": [{"url": base + "init-stream0.m4s"}] +
                              [{"url": base + p.name} for p in sorted(root.glob("chunk-stream0-*.m4s"))]}
    formats = [combined] if mode == "combined" else [video] if mode == "silent" else [video, audio]

    def info(ydl, url, download=False):
        assert download is False
        assert url == "https://www.instagram.com/reel/RuntimeFixture/"
        return ydl.process_ie_result({"id": "fixture", "title": "Android runtime fixture",
            "extractor": "Instagram", "extractor_key": "Instagram", "webpage_url": url,
            "formats": copy.deepcopy(formats)}, download=False)

    def response(ydl, request):
        url = urlsplit(request.url)
        assert url.scheme == "https" and url.hostname == "fixture.example"
        if mode == "denied":
            raise HTTPError(Response(io.BytesIO(), request.url, {}, 403))
        name = Path(url.path).name
        body = (root / name).read_bytes()
        return Response(io.BytesIO(body), request.url,
                        {"Content-Length": str(len(body)), "Content-Type": "video/mp4"}, 200)

    yt_dlp.YoutubeDL.extract_info = info
    yt_dlp.YoutubeDL.urlopen = response


def restore():
    yt_dlp.YoutubeDL.extract_info = _extract_info
    yt_dlp.YoutubeDL.urlopen = _urlopen
