package cl.alejandrino.nativeapp;

import org.json.JSONObject;
import java.util.Locale;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;
import java.util.regex.Pattern;

/** Read-only CHECK: no local lookup is allowed before a verified server response. */
final class NativeCheckService {
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private static final Set<String> SERVER_ERRORS = new HashSet<>(Arrays.asList("BAD_REQUEST", "UNSUPPORTED_VERSION",
        "UNSUPPORTED_ACTION", "AUTH_REQUIRED", "SESSION_MISMATCH", "NOT_FOUND", "UNAVAILABLE", "SOURCE_UNSUPPORTED"));

    interface Authorizer { JSONObject verify(JSONObject request, String accessToken) throws Exception; }
    interface LocalIndex { boolean exists(String userId, String techniqueId) throws Exception; }
    static final class Failure extends Exception {
        final String code;
        Failure(String code) { super(code); this.code = code; }
    }
    private final Authorizer authorizer;
    private final LocalIndex index;

    NativeCheckService(Authorizer authorizer, LocalIndex index) {
        this.authorizer = authorizer;
        this.index = index;
    }

    JSONObject handle(String raw) {
        JSONObject request = new JSONObject();
        try {
            if (raw == null || raw.length() > 12288) throw new Failure("BAD_REQUEST");
            JSONObject input = new JSONObject(raw);
            request = envelope(input, "CHECK");
            JSONObject verified = authorize(validate(input, "CHECK"), authorizer);
            boolean available;
            try { available = index.exists(verified.getString("userId"), verified.getString("techniqueId")); }
            catch (Exception error) { throw new Failure("LOCAL_READ_FAILED"); }
            return envelope(request, "AVAILABILITY").put("status", available ? "available" : "missing");
        } catch (Failure error) { return error(request, error.code); }
        catch (Exception error) { return error(request, "BAD_REQUEST"); }
    }

    static JSONObject validate(JSONObject input, String action) throws Exception {
        if (!(input.opt("protocolVersion") instanceof Number) || input.getDouble("protocolVersion") != 1)
            throw new Failure("UNSUPPORTED_VERSION");
        if (!action.equals(input.opt("type"))) throw new Failure("UNSUPPORTED_ACTION");
        for (String field : new String[] { "requestId", "userId", "techniqueId" })
            if (!isUuid(input.opt(field))) throw new Failure("BAD_REQUEST");
        Object token = input.opt("accessToken");
        if (!(token instanceof String) || !((String) token).matches("[A-Za-z0-9._~-]{1,8192}"))
            throw new Failure("AUTH_REQUIRED");
        return envelope(input, action).put("accessToken", token);
    }

    static JSONObject authorize(JSONObject input, Authorizer authorizer) throws Exception {
        JSONObject request = envelope(input, input.getString("type"));
        JSONObject verified;
        try { verified = authorizer.verify(request, input.getString("accessToken")); }
        catch (Failure error) { throw error; }
        catch (Exception error) { throw new Failure("UNAVAILABLE"); }
        if (verified == null || !(verified.opt("protocolVersion") instanceof Number) ||
            verified.getDouble("protocolVersion") != 1) throw new Failure("BAD_RESPONSE");
        for (String field : new String[] { "requestId", "userId", "techniqueId" })
            if (!request.getString(field).equals(verified.opt(field))) throw new Failure("BAD_RESPONSE");
        if (!"CHECK".equals(request.getString("type")) && !request.getString("type").equals(verified.opt("action")))
            throw new Failure("BAD_RESPONSE");
        if ("ERROR".equals(verified.opt("type"))) {
            String code = verified.optString("errorCode", "");
            throw new Failure(SERVER_ERRORS.contains(code) ? code : "BAD_RESPONSE");
        }
        if (!"AUTHORIZED".equals(verified.opt("type"))) throw new Failure("BAD_RESPONSE");
        return verified;
    }

    static boolean isUuid(Object value) {
        return value instanceof String && UUID_PATTERN.matcher((String) value).matches();
    }

    static JSONObject error(JSONObject request, String code) {
        try { return envelope(request, "ERROR").put("errorCode", code); }
        catch (Exception impossible) { throw new IllegalStateException("Cannot encode bridge error"); }
    }

    static JSONObject envelope(JSONObject input, String type) throws Exception {
        JSONObject result = new JSONObject().put("protocolVersion", 1).put("type", type);
        for (String field : new String[] { "requestId", "userId", "techniqueId" }) {
            Object value = input.opt(field);
            String text = isUuid(value) ? (String) value : "";
            result.put(field, field.equals("requestId") ? text : text.toLowerCase(Locale.ROOT));
        }
        return result;
    }
}
