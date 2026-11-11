package cl.alejandrino.nativeapp;

import org.json.JSONObject;

/** Whitelist of public text fields. Never serialize an extractor's complete info object. */
final class PreviewMetadata {
    static JSONObject clean(JSONObject input) throws Exception {
        if (input == null) input = new JSONObject();
        double duration = input.optDouble("duration", 0);
        return new JSONObject().put("title", text(input.opt("title"), 500))
            .put("author", text(input.opt("author"), 200))
            .put("description", text(input.opt("description"), 2000))
            .put("thumbnail_url", text(input.opt("thumbnail_url"), 4096))
            .put("duration", Double.isFinite(duration) && duration > 0 && duration <= 86400 ? duration : 0);
    }
    private static String text(Object value, int limit) {
        if (!(value instanceof String)) return "";
        String text = ((String) value).replaceAll("[\\p{Cntrl}&&[^\\n\\t]]", "").trim();
        int end = Math.min(text.length(), limit);
        if (end > 0 && Character.isHighSurrogate(text.charAt(end - 1))) end--;
        return text.substring(0, end);
    }
}
