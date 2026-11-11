package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import java.util.function.Consumer;

/** Authenticated DOWNLOAD/OPEN; only the server's stored source may be downloaded. */
final class NativeMediaService {
    interface BeforePublish { void verify() throws Exception; }
    interface Files extends NativeCheckService.LocalIndex {
        JSONObject download(JSONObject verified, DownloadGuard guard, Consumer<String> progress, BeforePublish beforePublish) throws Exception;
        void open(String user, String technique, DownloadGuard guard) throws Exception;
    }
    private final NativeCheckService.Authorizer authorizer;
    private final Files files;
    NativeMediaService(NativeCheckService.Authorizer authorizer, Files files) { this.authorizer = authorizer; this.files = files; }

    JSONObject handle(String raw, DownloadGuard guard, Consumer<JSONObject> progress) {
        JSONObject identity = new JSONObject();
        String action = "DOWNLOAD";
        try {
            if (raw == null || raw.length() > 12288) throw new NativeCheckService.Failure("BAD_REQUEST");
            JSONObject input = new JSONObject(raw);
            action = input.optString("type", "");
            identity = NativeCheckService.envelope(input, action);
            if (!"DOWNLOAD".equals(action) && !"OPEN".equals(action)) throw new NativeCheckService.Failure("UNSUPPORTED_ACTION");
            JSONObject request = NativeCheckService.validate(input, action);
            guard.ensureActive();
            JSONObject verified = NativeCheckService.authorize(request, authorizer);
            guard.ensureActive();
            String user = verified.getString("userId"), technique = verified.getString("techniqueId");
            boolean available;
            try { available = files.exists(user, technique); }
            catch (Exception e) { throw new NativeCheckService.Failure("LOCAL_READ_FAILED"); }
            if ("OPEN".equals(action)) {
                if (!available) throw new NativeCheckService.Failure("LOCAL_MISSING");
                guard.ensureActive(); files.open(user, technique, guard);
                return response(identity, "OPEN", "OPENED");
            }
            if (available) return response(identity, "DOWNLOAD", "AVAILABLE");
            String source = DownloadSource.validate(verified.optString("sourceUrl", ""));
            JSONObject fixedIdentity = identity;
            Consumer<String> stages = stage -> {
                try { progress.accept(response(fixedIdentity, "DOWNLOAD", "PROGRESS").put("stage", stage)); }
                catch (Exception ignored) { /* UI removal does not expose task details. */ }
            };
            stages.accept("downloading");
            JSONObject quality = files.download(verified, guard, stages, () -> {
                guard.ensureActive();
                JSONObject latest = NativeCheckService.authorize(request, authorizer);
                if (!source.equals(latest.optString("sourceUrl"))) throw new NativeCheckService.Failure("BAD_RESPONSE");
                guard.ensureActive();
            });
            return response(identity, "DOWNLOAD", "AVAILABLE")
                .put("width", quality.getInt("width")).put("height", quality.getInt("height"))
                .put("hasAudio", quality.optBoolean("hasAudio", true));
        } catch (NativeCheckService.Failure error) { return error(identity, action, error.code); }
        catch (LinkageError error) { return error(identity, action, "OPEN".equals(action) ? "OPEN_FAILED" : "DOWNLOAD_ENGINE_FAILED"); }
        catch (Exception error) { return error(identity, action, "OPEN".equals(action) ? "OPEN_FAILED" : "DOWNLOAD_FAILED"); }
    }
    static JSONObject response(JSONObject identity, String action, String type) throws Exception {
        return NativeCheckService.envelope(identity, type).put("action", action);
    }
    static JSONObject error(JSONObject identity, String action, String code) {
        try { return response(identity, action, "ERROR").put("errorCode", code); }
        catch (Exception impossible) { throw new IllegalStateException("Cannot encode media response"); }
    }
}
