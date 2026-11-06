package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import org.junit.Test;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class NativeAuthorizerTest {
    private static final class Connection extends HttpURLConnection {
        final ByteArrayOutputStream body = new ByteArrayOutputStream();
        final int status;
        final String response;
        String mime = "application/json";
        boolean closed;
        Connection(int status, String response) throws Exception { super(new URL("https://app.example")); this.status = status; this.response = response; }
        @Override public void disconnect() { closed = true; }
        @Override public boolean usingProxy() { return false; }
        @Override public void connect() { }
        @Override public OutputStream getOutputStream() { return body; }
        @Override public int getResponseCode() { return status; }
        @Override public String getContentType() { return mime; }
        @Override public InputStream getInputStream() { return new ByteArrayInputStream(response.getBytes(StandardCharsets.UTF_8)); }
        @Override public InputStream getErrorStream() { return getInputStream(); }
    }

    @Test public void sendsBearerOnlyToConfiguredEndpointWithoutRedirects() throws Exception {
        JSONObject request = NativeCheckServiceTest.request(); request.remove("accessToken");
        Connection connection = new Connection(200, NativeCheckServiceTest.approved(request).toString());
        NativeAuthorizer auth = new NativeAuthorizer(new AllowedOrigin("https://app.example"), url -> {
            assertEquals("https://app.example/api/native/authorize", url.toString()); return connection;
        });
        assertEquals("AUTHORIZED", auth.verify(request, "synthetic.test.token").getString("type"));
        assertEquals("Bearer synthetic.test.token", connection.getRequestProperty("Authorization"));
        assertEquals("POST", connection.getRequestMethod());
        assertFalse(connection.getInstanceFollowRedirects()); assertFalse(connection.getUseCaches());
        assertEquals(5000, connection.getConnectTimeout()); assertEquals(10000, connection.getReadTimeout());
        assertFalse(connection.body.toString().contains("token")); assertTrue(connection.closed);
    }

    @Test public void rejectsSsoRedirectsHtmlAndOversizedResponses() throws Exception {
        for (Connection connection : new Connection[] { new Connection(302, ""), new Connection(200, "x".repeat(4097)) }) {
            NativeAuthorizer auth = new NativeAuthorizer(new AllowedOrigin("https://app.example"), url -> connection);
            assertThrows(NativeCheckService.Failure.class, () -> auth.verify(new JSONObject(), "synthetic.test.token"));
            assertTrue(connection.closed);
        }
        Connection html = new Connection(200, "<html>Login</html>"); html.mime = "text/html";
        NativeAuthorizer auth = new NativeAuthorizer(new AllowedOrigin("https://app.example"), url -> html);
        assertEquals("DEPLOYMENT_UNAVAILABLE", assertThrows(NativeCheckService.Failure.class,
            () -> auth.verify(new JSONObject(), "synthetic.test.token")).code);
    }

    @Test public void anErrorStatusCannotAuthorize() throws Exception {
        Connection connection = new Connection(401, NativeCheckServiceTest.approved(NativeCheckServiceTest.request()).toString());
        NativeAuthorizer auth = new NativeAuthorizer(new AllowedOrigin("https://app.example"), url -> connection);
        assertEquals("BAD_RESPONSE", assertThrows(NativeCheckService.Failure.class,
            () -> auth.verify(new JSONObject(), "synthetic.test.token")).code);
    }
}
