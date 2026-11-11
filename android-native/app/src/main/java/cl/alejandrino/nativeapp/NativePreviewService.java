package cl.alejandrino.nativeapp;

import org.json.JSONObject;

/** Preview capability. Reuses DOWNLOAD authorization, never its download operation. */
final class NativePreviewService {
    interface Files {
        JSONObject preview(JSONObject verified, boolean refresh, int frame, DownloadGuard guard,
            NativeMediaService.BeforePublish verify) throws Exception;
    }
    private final NativeCheckService.Authorizer authorizer;
    private final Files files;
    NativePreviewService(NativeCheckService.Authorizer authorizer, Files files) {
        this.authorizer = authorizer; this.files = files;
    }
    JSONObject handle(String raw, DownloadGuard guard) {
        JSONObject identity = new JSONObject();
        try {
            if (raw == null || raw.length() > 12288) throw new NativeCheckService.Failure("BAD_REQUEST");
            JSONObject input = new JSONObject(raw);
            identity = NativeCheckService.envelope(input, "PREVIEW");
            JSONObject request = NativeCheckService.validate(input, "PREVIEW");
            if (input.has("refresh") && !(input.opt("refresh") instanceof Boolean))
                throw new NativeCheckService.Failure("BAD_REQUEST");
            int frame = -1;
            if (input.has("frame")) {
                Object value = input.opt("frame");
                if (!(value instanceof Number) || input.getDouble("frame") != input.getInt("frame") ||
                    input.getInt("frame") < 0 || input.getInt("frame") > 2)
                    throw new NativeCheckService.Failure("BAD_REQUEST");
                frame = input.getInt("frame");
            }
            // The existing endpoint supplies the canonical URL only for an owned, supported row.
            request.put("type", "DOWNLOAD");
            guard.ensureActive();
            JSONObject verified = NativeCheckService.authorize(request, authorizer);
            String source = DownloadSource.validate(verified.optString("sourceUrl", ""));
            guard.ensureActive();
            JSONObject result = files.preview(verified, input.optBoolean("refresh", false), frame, guard, () -> {
                guard.ensureActive();
                JSONObject latest = NativeCheckService.authorize(request, authorizer);
                if (!source.equals(latest.optString("sourceUrl"))) throw new NativeCheckService.Failure("BAD_RESPONSE");
                guard.ensureActive();
            });
            guard.ensureActive();
            return NativeMediaService.response(identity, "PREVIEW", "PREVIEW_RESULT").put("preview", result);
        } catch (NativeCheckService.Failure error) { return NativeMediaService.error(identity, "PREVIEW", error.code); }
        catch (Exception | LinkageError error) { return NativeMediaService.error(identity, "PREVIEW", "PREVIEW_FAILED"); }
    }
}
