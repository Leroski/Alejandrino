package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** The origin is build configuration, never a URL supplied by JavaScript. */
final class NativeAuthorizer implements NativeCheckService.Authorizer {
    private final URL endpoint;
    interface Connections { HttpURLConnection open(URL url) throws Exception; }
    private final Connections connections;
    NativeAuthorizer(AllowedOrigin origin) throws Exception {
        this(origin, url -> (HttpURLConnection) url.openConnection());
    }
    NativeAuthorizer(AllowedOrigin origin, Connections connections) throws Exception {
        endpoint = new URL(origin.value + "/api/native/authorize");
        this.connections = connections;
    }

    @Override public JSONObject verify(JSONObject request, String token) throws Exception {
        HttpURLConnection connection = connections.open(endpoint);
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(10000);
            connection.setRequestMethod("POST");
            connection.setDoOutput(true);
            connection.setUseCaches(false);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            byte[] body = request.toString().getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(body.length);
            try (var output = connection.getOutputStream()) { output.write(body); }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new NativeCheckService.Failure("DEPLOYMENT_UNAVAILABLE");
            String mime = connection.getContentType();
            if (mime == null || !mime.toLowerCase(java.util.Locale.ROOT).startsWith("application/json")) {
                throw new NativeCheckService.Failure("DEPLOYMENT_UNAVAILABLE");
            }
            try (InputStream input = status == 200 ? connection.getInputStream() : connection.getErrorStream()) {
                if (input == null) throw new NativeCheckService.Failure("UNAVAILABLE");
                ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                byte[] buffer = new byte[1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 4096) throw new NativeCheckService.Failure("BAD_RESPONSE");
                    bytes.write(buffer, 0, count);
                }
                JSONObject response = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
                if ((status == 200) != "AUTHORIZED".equals(response.opt("type"))) {
                    if (status == 200 || !"ERROR".equals(response.opt("type"))) throw new NativeCheckService.Failure("BAD_RESPONSE");
                }
                return response;
            }
        } finally { connection.disconnect(); }
    }
}
