package cl.alejandrino.nativeapp;

import java.net.URI;
import java.util.Locale;

final class AllowedOrigin {
    final String value;

    AllowedOrigin(String configured) throws Exception {
        URI uri = new URI(configured.trim());
        if (!isHttps(uri) || !(uri.getPath().isEmpty() || uri.getPath().equals("/")) ||
            uri.getQuery() != null || uri.getFragment() != null) throw new IllegalArgumentException("Invalid web origin");
        value = "https://" + uri.getHost().toLowerCase(Locale.ROOT);
    }

    boolean allows(String url) {
        try {
            URI uri = new URI(url);
            return isHttps(uri) && value.equals("https://" + uri.getHost().toLowerCase(Locale.ROOT));
        } catch (Exception invalid) { return false; }
    }

    static boolean externalHttps(String url) {
        try { return isHttps(new URI(url)); }
        catch (Exception invalid) { return false; }
    }

    private static boolean isHttps(URI uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null &&
            uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }
}
