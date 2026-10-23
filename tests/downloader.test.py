import importlib.util
from pathlib import Path
import unittest

module_path = Path(__file__).resolve().parents[1] / "services" / "downloader" / "download.py"
spec = importlib.util.spec_from_file_location("alejandrino_downloader", module_path)
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)


class SharedURLTests(unittest.TestCase):
    def test_instagram(self):
        self.assertEqual(downloader.identify_platform("https://www.instagram.com/p/Deq5Cdis7Jd/"), "instagram")
        self.assertEqual(downloader.identify_platform("https://www.instagram.com/reel/ABC123/"), "instagram")

    def test_tiktok(self):
        self.assertEqual(downloader.identify_platform("https://www.tiktok.com/@usuario/video/12345"), "tiktok")
        self.assertEqual(downloader.identify_platform("https://vm.tiktok.com/abc123/"), "tiktok")

    def test_deny_untrusted_urls(self):
        for url in [
            "https://instagram.com.ejemplo.com/p/abc/",
            "https://127.0.0.1/reel/abc",
            "http://www.instagram.com/p/abc/",
            "file:///etc/passwd",
            "https://www.instagram.com/",
            "https://evil.com@unsafe.example/path",
        ]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                downloader.identify_platform(url)

    def test_invalid_height_precedes_import(self):
        with self.assertRaisesRegex(ValueError, "target_resolution"):
            downloader.download_video("https://www.instagram.com/p/abc/", Path("/tmp/unused"), target_resolution=480)


if __name__ == "__main__":
    unittest.main()
