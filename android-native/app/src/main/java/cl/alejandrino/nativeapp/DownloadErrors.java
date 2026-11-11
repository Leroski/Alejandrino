package cl.alejandrino.nativeapp;

import java.util.Set;
import org.json.JSONObject;

final class DownloadErrors {
    private static final Set<String> ALLOWED = Set.of("DOWNLOAD_FAILED", "DOWNLOAD_NETWORK_FAILED",
        "PROVIDER_ACCESS_REQUIRED", "PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE",
        "FORMAT_UNAVAILABLE", "FILE_TOO_LARGE", "STORAGE_FAILED");

    static void check(JSONObject result) throws NativeCheckService.Failure {
        if (!result.has("error_code")) return;
        String code = result.optString("error_code", "");
        throw new NativeCheckService.Failure(ALLOWED.contains(code) ? code : "DOWNLOAD_FAILED");
    }
}
