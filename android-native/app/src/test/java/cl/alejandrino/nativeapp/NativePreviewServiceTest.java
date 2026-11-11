package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class NativePreviewServiceTest {
    static JSONObject request() throws Exception { return NativeCheckServiceTest.request().put("type", "PREVIEW"); }
    static class Files implements NativePreviewService.Files {
        int reads;
        String source;
        boolean refresh;
        int frame;
        @Override public JSONObject preview(JSONObject verified, boolean refresh, int frame, DownloadGuard guard,
                NativeMediaService.BeforePublish verify) throws Exception {
            reads++; this.source = verified.getString("sourceUrl"); this.refresh = refresh; this.frame = frame;
            assertFalse(verified.has("accessToken"));
            if (refresh) verify.verify();
            return new JSONObject().put("available", true);
        }
    }
    @Test public void onlyServerOwnedSourceIsUsedAndOptionsStayLocal() throws Exception {
        Files files = new Files(); int[] checks = {0};
        NativePreviewService service = new NativePreviewService((m,t) -> {
            checks[0]++;
            assertEquals("DOWNLOAD", m.getString("type"));
            assertFalse(m.has("refresh")); assertFalse(m.has("sourceUrl"));
            return NativeMediaServiceTest.approved(m);
        }, files);
        JSONObject result = service.handle(request().put("refresh", true).put("frame", 2)
            .put("sourceUrl", "https://evil.example/").toString(), new DownloadGuard(1000));
        assertEquals("PREVIEW_RESULT", result.getString("type")); assertEquals("PREVIEW", result.getString("action"));
        assertEquals("https://www.instagram.com/reel/OwnedClip/", files.source);
        assertTrue(files.refresh); assertEquals(2, files.frame); assertEquals(2, checks[0]);
        assertFalse(result.toString().contains("token")); assertFalse(result.toString().contains("sourceUrl"));
    }
    @Test public void deniesForeignExpiredAndUnsupportedSourcesBeforeReadingFiles() throws Exception {
        for (String mode : new String[]{"account","auth","source","action"}) {
            Files files = new Files();
            NativePreviewService service = new NativePreviewService((m,t) -> {
                JSONObject a = NativeMediaServiceTest.approved(m);
                if (mode.equals("account")) return a.put("userId", "00000000-0000-4000-8000-000000000001");
                if (mode.equals("auth")) return a.put("type", "ERROR").put("errorCode", "AUTH_REQUIRED");
                if (mode.equals("action")) return a.put("action", "OPEN");
                return a.put("sourceUrl", "https://127.0.0.1/private");
            }, files);
            assertEquals("ERROR", service.handle(request().toString(), new DownloadGuard(1000)).getString("type"));
            assertEquals(0, files.reads);
        }
    }
    @Test public void invalidOptionsAndCancelledRequestsNeverReadFiles() throws Exception {
        Files files = new Files();
        NativePreviewService service = new NativePreviewService((m,t) -> { fail(); return null; }, files);
        for (Object frame : new Object[]{-1, 3, 0.5, "1", JSONObject.NULL}) {
            assertEquals("BAD_REQUEST", service.handle(request().put("frame", frame).toString(), new DownloadGuard(1000)).getString("errorCode"));
        }
        assertEquals("BAD_REQUEST", service.handle(request().put("refresh", "yes").toString(), new DownloadGuard(1000)).getString("errorCode"));
        DownloadGuard guard = new DownloadGuard(1000); guard.cancel();
        assertEquals("CANCELLED", service.handle(request().toString(), guard).getString("errorCode"));
        assertEquals(0, files.reads);
    }
    @Test public void rechecksOwnershipBeforeSavingRefreshedMetadata() throws Exception {
        Files files = new Files(); int[] checks = {0};
        NativePreviewService service = new NativePreviewService((m,t) -> {
            JSONObject a = NativeMediaServiceTest.approved(m);
            return ++checks[0] == 2 ? a.put("type", "ERROR").put("errorCode", "AUTH_REQUIRED") : a;
        }, files);
        JSONObject result = service.handle(request().put("refresh", true).toString(), new DownloadGuard(1000));
        assertEquals("AUTH_REQUIRED", result.getString("errorCode"));
        assertFalse(result.has("preview"));
    }
    @Test public void metadataWhitelistBoundsTextAndRemovesPrivateFields() throws Exception {
        JSONObject clean = PreviewMetadata.clean(new JSONObject().put("title", "x".repeat(900))
            .put("duration", -5).put("cookies", "private").put("filepath", "/private/video.mp4"));
        assertEquals(500, clean.getString("title").length()); assertEquals(0, clean.getDouble("duration"), 0);
        assertFalse(clean.has("cookies")); assertFalse(clean.has("filepath"));
        assertEquals("", PreviewMetadata.clean(null).getString("title"));
    }
}
