package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import org.junit.Test;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public class NativeCheckServiceTest {
    static final String USER = "123e4567-e89b-42d3-a456-426614174000";
    static final String TECHNIQUE = "019321ab-cdef-7abc-8def-0123456789ab";
    static final String OTHER = "00000000-0000-4000-8000-000000000001";
    static JSONObject request() throws Exception {
        return new JSONObject().put("protocolVersion", 1).put("type", "CHECK")
            .put("requestId", "550e8400-e29b-41d4-a716-446655440000")
            .put("userId", USER).put("techniqueId", TECHNIQUE).put("accessToken", "synthetic.test.token");
    }
    static JSONObject approved(JSONObject request) throws Exception { return new JSONObject(request.toString()).put("type", "AUTHORIZED"); }

    @Test public void checksOnlyAfterAuthorizationAndDoesNotReturnTokenOrUri() throws Exception {
        for (boolean available : new boolean[] { false, true }) {
            AtomicInteger calls = new AtomicInteger();
            NativeCheckService service = new NativeCheckService((message, token) -> {
                assertEquals(0, calls.getAndIncrement());
                assertFalse(message.has("accessToken")); assertFalse(message.has("url"));
                assertEquals("synthetic.test.token", token);
                return approved(message);
            }, (user, technique) -> {
                assertEquals(1, calls.getAndIncrement()); assertEquals(USER, user); assertEquals(TECHNIQUE, technique);
                return available;
            });
            JSONObject result = service.handle(request().put("url", "https://untrusted.example").toString());
            assertEquals("AVAILABILITY", result.getString("type"));
            assertEquals(available ? "available" : "missing", result.getString("status"));
            assertEquals(request().getString("requestId"), result.getString("requestId"));
            assertFalse(result.toString().contains("token")); assertEquals(2, calls.get());
        }
    }

    @Test public void invalidIdentifiersNeverReachAuthOrStorage() throws Exception {
        NativeCheckService service = new NativeCheckService((m, t) -> { fail("Unexpected authorization"); return null; },
            (u, t) -> { fail("Unexpected local read"); return false; });
        Object[] invalid = { "", JSONObject.NULL, 123, "null", "550e8400-e29b-41d4-a716-abcd-446655440000", USER + "\n", " " + USER };
        for (String field : new String[] { "requestId", "userId", "techniqueId" }) {
            for (Object value : invalid) assertEquals("BAD_REQUEST", service.handle(request().put(field, value).toString()).getString("errorCode"));
            JSONObject absent = request(); absent.remove(field);
            assertEquals("BAD_REQUEST", service.handle(absent.toString()).getString("errorCode"));
        }
        for (String raw : new String[] { "null", "[]", "{", "x".repeat(12289) }) {
            assertEquals("BAD_REQUEST", service.handle(raw).getString("errorCode"));
        }
        assertEquals("BAD_REQUEST", service.handle(null).getString("errorCode"));
    }

    @Test public void refusesUnversionedUnknownActionsAndMissingTokens() throws Exception {
        NativeCheckService service = new NativeCheckService((m, t) -> { fail(); return null; }, (u, t) -> { fail(); return false; });
        for (Object version : new Object[] { 2, "1", JSONObject.NULL }) {
            assertEquals("UNSUPPORTED_VERSION", service.handle(request().put("protocolVersion", version).toString()).getString("errorCode"));
        }
        assertEquals("UNSUPPORTED_ACTION", service.handle(request().put("type", "DOWNLOAD").toString()).getString("errorCode"));
        for (Object token : new Object[] { "", "bad\r\nheader", "x".repeat(8193), JSONObject.NULL }) {
            assertEquals("AUTH_REQUIRED", service.handle(request().put("accessToken", token).toString()).getString("errorCode"));
        }
    }

    @Test public void failedAuthAndForeignOrMismatchedRepliesNeverReadTheIndex() throws Exception {
        for (String code : new String[] { "AUTH_REQUIRED", "SESSION_MISMATCH", "NOT_FOUND", "UNAVAILABLE" }) {
            NativeCheckService service = new NativeCheckService((m, t) -> new JSONObject(m.toString()).put("type", "ERROR").put("errorCode", code),
                (u, t) -> { fail("No index read on authorization failure"); return false; });
            assertEquals(code, service.handle(request().toString()).getString("errorCode"));
        }
        for (String field : new String[] { "requestId", "userId", "techniqueId" }) {
            NativeCheckService service = new NativeCheckService((m, t) -> approved(m).put(field, OTHER),
                (u, t) -> { fail("Mismatched response cannot authorize"); return false; });
            assertEquals("BAD_RESPONSE", service.handle(request().toString()).getString("errorCode"));
        }
        NativeCheckService unavailable = new NativeCheckService((m, t) -> { throw new Exception("private token"); },
            (u, t) -> { fail(); return false; });
        JSONObject error = unavailable.handle(request().toString());
        assertEquals("UNAVAILABLE", error.getString("errorCode")); assertFalse(error.toString().contains("private"));
    }

    @Test public void validUppercaseIdsAreCanonicalizedBeforeIndexLookup() throws Exception {
        NativeCheckService service = new NativeCheckService((m, t) -> approved(m), (u, t) -> {
            assertEquals(USER, u); assertEquals(TECHNIQUE, t); return true;
        });
        JSONObject result = service.handle(request().put("userId", USER.toUpperCase(java.util.Locale.ROOT)).toString());
        assertEquals("available", result.getString("status"));
    }

    @Test public void localReadFailureIsNotReportedAsMissing() throws Exception {
        NativeCheckService service = new NativeCheckService((m, t) -> approved(m), (u, t) -> { throw new SecurityException("content://private"); });
        JSONObject result = service.handle(request().toString());
        assertEquals("LOCAL_READ_FAILED", result.getString("errorCode")); assertFalse(result.has("status"));
        assertFalse(result.toString().contains("content://"));
    }
}
