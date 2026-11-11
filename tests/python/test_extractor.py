import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import yt_dlp

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('extractor', ROOT / 'android-native/app/src/main/python/extractor.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)
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
    def test_audio_required_and_two_track_selection(self):
        video={'vcodec':'h264','acodec':'none','ext':'mp4'}
        audio={'vcodec':'none','acodec':'aac','ext':'m4a'}
        self.assertEqual(extractor.choose_tracks({'requested_formats':[audio,video]}),(video,audio))
        for info in [video,audio,{'requested_formats':[video,dict(video)]},{'requested_formats':[video,audio,audio]}]:
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
                with self.assertRaises((RuntimeError,ValueError)):
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

if __name__ == '__main__':
    unittest.main()
