package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class DownloadErrorsTest {
    @Test public void onlyKnownCodesCrossThePythonBoundary() throws Exception {
        for (String code : new String[] {"DOWNLOAD_FAILED", "DOWNLOAD_NETWORK_FAILED", "PROVIDER_ACCESS_REQUIRED",
                "PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE", "FORMAT_UNAVAILABLE", "FILE_TOO_LARGE", "STORAGE_FAILED"}) {
            NativeCheckService.Failure error = assertThrows(NativeCheckService.Failure.class,
                () -> DownloadErrors.check(new JSONObject().put("error_code", code)));
            assertEquals(code, error.code);
        }
        for (Object value : new Object[] {"private URL or credentials", JSONObject.NULL, 42, new JSONObject()}) {
            NativeCheckService.Failure error = assertThrows(NativeCheckService.Failure.class,
                () -> DownloadErrors.check(new JSONObject().put("error_code", value)));
            assertEquals("DOWNLOAD_FAILED", error.code);
        }
        DownloadErrors.check(new JSONObject().put("video_path", "/private/file"));
    }
}
