package cl.alejandrino.nativeapp;

import java.net.URI;
import java.util.Set;

final class DownloadSource {
    static String validate(String value) throws NativeCheckService.Failure {
        try {
            if (value.length() > 2048 || value.matches("(?s).*[\\s\\\\].*")) throw new Exception();
            URI uri = new URI(value);
            if (!"https".equals(uri.getScheme()) || uri.getRawUserInfo() != null || uri.getPort() != -1 ||
                uri.getRawQuery() != null || uri.getRawFragment() != null) throw new Exception();
            String host = uri.getHost(), path = uri.getRawPath();
            boolean ig = Set.of("instagram.com", "www.instagram.com", "m.instagram.com").contains(host) &&
                path.matches("/(reel|reels|p)/[A-Za-z0-9_-]+/?");
            boolean tt = Set.of("tiktok.com", "www.tiktok.com", "m.tiktok.com").contains(host) &&
                path.matches("/@[A-Za-z0-9._-]+/video/[0-9]+/?");
            boolean shortLink = Set.of("vm.tiktok.com", "vt.tiktok.com").contains(host) && path.matches("/[A-Za-z0-9_-]+/?");
            if (!ig && !tt && !shortLink) throw new Exception();
            return value;
        } catch (Exception error) { throw new NativeCheckService.Failure("SOURCE_UNSUPPORTED"); }
    }
}
