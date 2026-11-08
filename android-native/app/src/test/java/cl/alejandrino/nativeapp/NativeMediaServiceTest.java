package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import org.junit.Test;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Consumer;
import static org.junit.Assert.*;

public class NativeMediaServiceTest {
    private static final String SOURCE = "https://www.instagram.com/reel/OwnedClip/";
    static JSONObject request(String action) throws Exception { return NativeCheckServiceTest.request().put("type", action); }
    static JSONObject approved(JSONObject input) throws Exception {
        JSONObject output = new JSONObject(input.toString()).put("action", input.getString("type")).put("type", "AUTHORIZED");
        if ("DOWNLOAD".equals(input.getString("type"))) output.put("sourceUrl", SOURCE);
        return output;
    }
    static class Files implements NativeMediaService.Files {
        boolean available, opened;
        int reads, downloads;
        DownloadGuard cancelBeforePublish;
        @Override public boolean exists(String user, String technique) { reads++; return available; }
        @Override public JSONObject download(JSONObject verified, DownloadGuard guard, Consumer<String> stages,
                NativeMediaService.BeforePublish beforePublish) throws Exception {
            assertEquals(SOURCE, verified.getString("sourceUrl"));
            assertFalse(verified.has("accessToken"));
            downloads++; stages.accept("merging");
            if (cancelBeforePublish != null) cancelBeforePublish.cancel();
            beforePublish.verify(); guard.ensureActive(); available = true;
            return new JSONObject().put("width", 720).put("height", 1280);
        }
        @Override public void open(String user, String technique, DownloadGuard guard) throws Exception { guard.ensureActive(); opened = true; }
    }
    @Test public void downloadsCanonicalSourceReauthorizesAndReusesExistingFile() throws Exception {
        Files files = new Files(); int[] checks = {0};
        NativeMediaService service = new NativeMediaService((m,t) -> { checks[0]++; return approved(m); }, files);
        List<JSONObject> stages = new ArrayList<>();
        JSONObject input = request("DOWNLOAD").put("sourceUrl", "https://www.instagram.com/reel/Injected/");
        JSONObject result = service.handle(input.toString(), new DownloadGuard(1000), stages::add);
        assertEquals("AVAILABLE", result.getString("type")); assertEquals(2, checks[0]);
        assertEquals(720, result.getInt("width")); assertEquals(1, files.downloads);
        assertFalse(result.toString().contains("sourceUrl")); assertFalse(result.toString().contains("token"));
        assertEquals("PROGRESS", stages.get(0).getString("type"));
        assertEquals("AVAILABLE", service.handle(input.toString(), new DownloadGuard(1000), stages::add).getString("type"));
        assertEquals(1, files.downloads);
        assertEquals("OPENED", service.handle(request("OPEN").toString(), new DownloadGuard(1000), stages::add).getString("type"));
        assertTrue(files.opened);
    }
    @Test public void deniesExpiredForeignAndWrongActionBeforeAnyLocalAccess() throws Exception {
        for (String mode : new String[] {"auth", "account", "action", "source"}) {
            Files files = new Files();
            NativeMediaService service = new NativeMediaService((m,t) -> {
                JSONObject a = approved(m);
                if (mode.equals("auth")) return a.put("type", "ERROR").put("errorCode", "AUTH_REQUIRED");
                if (mode.equals("account")) return a.put("userId", "00000000-0000-4000-8000-000000000001");
                if (mode.equals("action")) return a.put("action", "OPEN");
                return a.put("sourceUrl", "https://127.0.0.1/private");
            }, files);
            JSONObject result = service.handle(request("DOWNLOAD").toString(), new DownloadGuard(1000), p -> fail());
            assertEquals("ERROR", result.getString("type")); assertEquals(0, files.downloads); assertFalse(files.opened);
            if (!mode.equals("source")) assertEquals(0, files.reads);
        }
    }
    @Test public void revocationOrCancellationBeforePublicationNeverCreatesAnAssociation() throws Exception {
        for (boolean cancel : new boolean[] {true,false}) {
            Files files = new Files(); DownloadGuard guard = new DownloadGuard(1000); int[] checks={0};
            if (cancel) files.cancelBeforePublish=guard;
            NativeMediaService service = new NativeMediaService((m,t)-> {
                JSONObject a=approved(m);
                return ++checks[0] == 2 ? a.put("type","ERROR").put("errorCode","AUTH_REQUIRED") : a;
            },files);
            JSONObject result=service.handle(request("DOWNLOAD").toString(),guard,p->{});
            assertEquals(cancel?"CANCELLED":"AUTH_REQUIRED",result.getString("errorCode")); assertFalse(files.available);
        }
    }
    @Test public void malformedAndAlreadyCancelledOperationsDoNotReachAuth() throws Exception {
        Files files=new Files(); NativeMediaService service=new NativeMediaService((m,t)->{fail();return null;},files);
        assertEquals("BAD_REQUEST",service.handle(request("DOWNLOAD").put("techniqueId","bad").toString(),new DownloadGuard(1000),p->{}).getString("errorCode"));
        DownloadGuard guard=new DownloadGuard(1000);guard.cancel();
        assertEquals("CANCELLED",service.handle(request("DOWNLOAD").toString(),guard,p->{}).getString("errorCode"));
        assertEquals(0,files.reads);
    }
    @Test public void missingFilesCannotOpenAndUnknownErrorsAreSanitized() throws Exception {
        Files files=new Files();NativeMediaService service=new NativeMediaService((m,t)->approved(m),files);
        assertEquals("LOCAL_MISSING",service.handle(request("OPEN").toString(),new DownloadGuard(1000),p->{}).getString("errorCode"));
        assertFalse(files.opened);
        NativeMediaService broken=new NativeMediaService((m,t)->{throw new Exception("private bearer");},files);
        JSONObject result=broken.handle(request("DOWNLOAD").toString(),new DownloadGuard(1000),p->{});
        assertEquals("UNAVAILABLE",result.getString("errorCode"));assertFalse(result.toString().contains("private"));
    }
    @Test public void canonicalSourcePolicyRejectsNonProviderOrNonPublicationUrls() throws Exception {
        assertEquals(SOURCE,DownloadSource.validate(SOURCE));
        for(String url:new String[]{"http://www.instagram.com/reel/x/","https://www.instagram.com.evil.example/reel/x/",
            "https://user:pass@www.instagram.com/reel/x/","https://www.instagram.com:8443/reel/x/",
            "https://www.instagram.com/","https://www.instagram.com/reel/x/?token=x","https://127.0.0.1/reel/x/"})
            assertThrows(NativeCheckService.Failure.class,()->DownloadSource.validate(url));
    }
}
