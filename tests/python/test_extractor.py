import importlib
import io
import json
from pathlib import Path
import tempfile
import sys
import unittest
from unittest.mock import patch
import yt_dlp
from yt_dlp.networking.common import Response
from yt_dlp.networking.exceptions import HTTPError, TransportError
from yt_dlp.utils import DownloadError

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'android-native/app/src/main/python'))
extractor = importlib.import_module('alejandrino_media')
SOURCE = 'https://www.instagram.com/reel/OwnedClip/'

class Guard:
    stopped = False
    def isStopped(self):
        return self.stopped

class FakeYdl:
    instances = []
    info = {'ext':'mp4', 'vcodec':'h264', 'acodec':'aac'}
    fail = False
    overflow = False
    def __init__(self, opts):
        self.opts = opts
        self.urls = []
        self.instances.append(self)
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def extract_info(self, url, download):
        assert download is False
        self.urls.append(url)
        return self.info
    def dl(self, target, stream):
        for hook in self.opts['progress_hooks']:
            hook({'downloaded_bytes':extractor.MAX_BYTES+1 if self.overflow else 4})
        if self.fail:
            return False, None
        Path(target).write_bytes(b'fake')
        return True, None

class ExtractionTests(unittest.TestCase):
    def setUp(self):
        FakeYdl.instances=[]; FakeYdl.fail=False; FakeYdl.overflow=False
        FakeYdl.info={'ext':'mp4','vcodec':'h264','acodec':'aac'}
    def test_sources_are_exact_and_publication_only(self):
        for url in [SOURCE, 'https://vm.tiktok.com/Example/', 'https://www.tiktok.com/@example/video/123/']:
            self.assertTrue(extractor.valid_source(url))
        for url in ['https://instagram.com/', 'https://instagram.com.evil.example/reel/x/',
                    'https://u:p@instagram.com/reel/x/', 'https://instagram.com:8443/reel/x/',
                    'http://instagram.com/reel/x/', 'https://127.0.0.1/reel/x/', SOURCE+'?cookie=x', SOURCE+'\n']:
            self.assertFalse(extractor.valid_source(url),url)
    def test_two_track_selection_and_explicitly_silent_sources(self):
        video={'vcodec':'h264','acodec':'none','ext':'mp4'}
        audio={'vcodec':'none','acodec':'aac','ext':'m4a'}
        self.assertEqual(extractor.choose_tracks({'requested_formats':[audio,video]}),(video,audio))
        self.assertEqual(extractor.choose_tracks(video), (video, None))
        for info in [audio,{'requested_formats':[video,dict(video)]},{'requested_formats':[video,audio,audio]}]:
            with self.assertRaises(ValueError):
                extractor.choose_tracks(info)
    def test_progressive_download_is_bounded_quiet_and_no_credentials(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(extractor.yt_dlp,'YoutubeDL',FakeYdl):
            result=json.loads(extractor.extract(SOURCE,folder,Guard()))
            self.assertEqual(Path(result['video_path']).read_bytes(),b'fake')
            self.assertIsNone(result['audio_path'])
        opts=FakeYdl.instances[0].opts
        self.assertEqual(opts['format_sort'][0],'res:720')
        self.assertNotIn('cookiefile',opts); self.assertNotIn('http_headers',opts)
        self.assertFalse(opts['cachedir']); self.assertEqual(opts['socket_timeout'],15)
    def test_cancel_failure_and_size_limit_never_return_complete_result(self):
        for mode in ['cancel','failure','overflow']:
            guard=Guard();guard.stopped=mode=='cancel'
            FakeYdl.fail=mode=='failure'; FakeYdl.overflow=mode=='overflow'
            with tempfile.TemporaryDirectory() as folder, patch.object(extractor.yt_dlp,'YoutubeDL',FakeYdl):
                with self.assertRaises((RuntimeError,ValueError,DownloadError)):
                    extractor.extract(SOURCE,folder,guard)
    def test_no_playlist_or_live_download(self):
        for info in [{'_type':'playlist'}, {'_type':'multi_video'}, {'is_live':True}]:
            FakeYdl.info=info
            with tempfile.TemporaryDirectory() as folder, patch.object(extractor.yt_dlp,'YoutubeDL',FakeYdl):
                with self.assertRaises(ValueError):
                    extractor.extract(SOURCE,folder,Guard())
    def test_exact_extractors_include_short_tiktok_without_generic(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(extractor.yt_dlp,'YoutubeDL',FakeYdl):
            extractor.extract(SOURCE,folder,Guard())
        with yt_dlp.YoutubeDL(FakeYdl.instances[0].opts) as actual:
            self.assertEqual(set(actual._ies),{'Instagram','InstagramIOS','TikTok','TikTokVM'})

    def test_preview_never_downloads_and_returns_only_public_metadata(self):
        FakeYdl.info={'title':'Technique', 'uploader':'Author', 'description':'Notes', 'duration':42,
                      'thumbnail':'https://scontent.cdninstagram.com/test.jpg', 'cookies':'secret',
                      'filepath':'/private/video.mp4', 'formats':[{'url':'private-stream'}]}
        with patch.object(extractor.yt_dlp,'YoutubeDL',FakeYdl), patch.object(FakeYdl,'dl',side_effect=AssertionError('No media download')):
            value=json.loads(extractor.preview(SOURCE,Guard()))
        self.assertEqual(set(value), {'title','author','description','duration','thumbnail_url'})
        self.assertEqual(value['title'],'Technique'); self.assertEqual(value['duration'],42)
        self.assertTrue(FakeYdl.instances[0].opts['skip_download'])
        self.assertNotIn('secret',json.dumps(value)); self.assertNotIn('private',json.dumps(value))

    def test_metadata_limits_and_missing_fields(self):
        value=extractor.public_metadata({'title':'x'*900, 'description':'y'*3000, 'uploader':{}, 'duration':float('nan')})
        self.assertEqual(len(value['title']),500); self.assertEqual(len(value['description']),2000)
        self.assertEqual(value['author'],''); self.assertEqual(value['duration'],0)
        self.assertEqual(extractor.public_metadata({'duration':True})['duration'],0)

    def test_cancelled_preview_never_reaches_provider(self):
        guard=Guard(); guard.stopped=True
        with patch.object(extractor.yt_dlp,'YoutubeDL',side_effect=AssertionError('No network')):
            with self.assertRaises(RuntimeError): extractor.preview(SOURCE,guard)

    def test_diagnostics_are_bounded_and_do_not_return_provider_messages(self):
        cases = [(TransportError('private signed URL'), 'DOWNLOAD_NETWORK_FAILED'),
                 (DownloadError('Requested format is not available'), 'FORMAT_UNAVAILABLE'),
                 (extractor.ExtractionFailure('FILE_TOO_LARGE'), 'FILE_TOO_LARGE'),
                 (RuntimeError('private unknown detail'), 'DOWNLOAD_FAILED')]
        for status, code in [(401, 'PROVIDER_ACCESS_REQUIRED'), (403, 'PROVIDER_ACCESS_REQUIRED'),
                             (404, 'PROVIDER_UNAVAILABLE'), (429, 'PROVIDER_RATE_LIMITED')]:
            cases.append((HTTPError(Response(io.BytesIO(), 'https://private.example/token', {}, status)), code))
        for error, code in cases:
            wrapped = DownloadError('provider private details', exc_info=(type(error), error, None))
            with patch.object(extractor, 'extract', side_effect=wrapped):
                self.assertEqual(json.loads(extractor.extract_result(SOURCE, '/unused', Guard())), {'error_code': code})


class RealDownloaderTests(unittest.TestCase):
    """Real yt-dlp format selection and HTTP downloader; only provider/network IO is replaced."""
    def download(self, formats, reject_url=None):
        urls = []
        def info(ydl, url, download=False):
            return ydl.process_ie_result({'id':'fixture', 'title':'Technique', 'extractor':'Instagram',
                'extractor_key':'Instagram', 'webpage_url':url, 'formats':formats}, download=False)
        def response(ydl, request):
            urls.append(request.url)
            if request.url == reject_url:
                raise HTTPError(Response(io.BytesIO(), request.url, {}, 403))
            body = ('bytes:' + request.url).encode()
            return Response(io.BytesIO(body), request.url,
                            {'Content-Length':str(len(body)), 'Content-Type':'video/mp4'}, 200)
        with tempfile.TemporaryDirectory() as folder, patch.object(yt_dlp.YoutubeDL, 'extract_info', info), \
                patch.object(yt_dlp.YoutubeDL, 'urlopen', response):
            result = json.loads(importlib.import_module('alejandrino_media').extract_result(SOURCE, folder, Guard()))
            if 'error_code' not in result:
                result['video_bytes'] = Path(result['video_path']).read_bytes()
                result['audio_bytes'] = Path(result['audio_path']).read_bytes() if result['audio_path'] else None
                result['files'] = sorted(p.name for p in Path(folder).iterdir())
        return result, urls

    def test_preview_then_repeated_downloads_preserve_the_module(self):
        formats = [{'url':'https://media.example/combined.mp4', 'ext':'mp4', 'vcodec':'h264', 'acodec':'aac'}]
        def info(ydl, url, download=False):
            return ydl.process_ie_result({'id':'fixture', 'title':'Technique', 'extractor':'Instagram',
                'extractor_key':'Instagram', 'webpage_url':url, 'formats':formats}, download=False)
        with patch.object(yt_dlp.YoutubeDL, 'extract_info', info):
            self.assertEqual(json.loads(extractor.preview(SOURCE, Guard()))['title'], 'Technique')
        for _ in range(2):
            self.assertIs(importlib.import_module('alejandrino_media'), extractor)
            result, urls = self.download(formats)
            self.assertNotIn('error_code', result)
            self.assertEqual(urls, [formats[0]['url']])

    def test_progressive_video_and_source_without_audio(self):
        for audio in ['aac', 'none']:
            url = 'https://media.example/progressive.mp4'
            result, urls = self.download([{'url':url, 'ext':'mp4', 'vcodec':'h264', 'acodec':audio}])
            self.assertEqual(urls, [url])
            self.assertEqual(result['video_bytes'], ('bytes:'+url).encode())
            self.assertEqual(result['audio_required'], audio != 'none')
            self.assertIsNone(result['audio_path'])

    def test_separate_audio_is_downloaded_and_never_silently_discarded(self):
        formats = [{'url':'https://media.example/video.mp4', 'ext':'mp4', 'vcodec':'h264', 'acodec':'none'},
                   {'url':'https://media.example/audio.m4a', 'ext':'m4a', 'vcodec':'none', 'acodec':'aac'}]
        result, urls = self.download(formats)
        self.assertEqual(len(urls), 2)
        self.assertTrue(result['audio_required'])
        self.assertIn(b'audio.m4a', result['audio_bytes'])
        failed, _ = self.download(formats, reject_url=formats[1]['url'])
        self.assertEqual(failed, {'error_code':'PROVIDER_ACCESS_REQUIRED'})

    def test_one_progressive_fallback_removes_failed_attempt_files(self):
        formats = [{'url':'https://media.example/video.mp4', 'ext':'mp4', 'vcodec':'h264', 'acodec':'none', 'height':720},
                   {'url':'https://media.example/audio.m4a', 'ext':'m4a', 'vcodec':'none', 'acodec':'aac'},
                   {'url':'https://media.example/combined.mp4', 'ext':'mp4', 'vcodec':'h264', 'acodec':'aac', 'height':720}]
        result, urls = self.download(formats, reject_url=formats[1]['url'])
        self.assertEqual(urls, [formats[0]['url'], formats[1]['url'], formats[2]['url']])
        self.assertIn(b'combined.mp4', result['video_bytes'])
        self.assertEqual(result['files'], ['video-1.mp4'])
        self.assertTrue(result['audio_required'])

if __name__ == '__main__':
    unittest.main()
