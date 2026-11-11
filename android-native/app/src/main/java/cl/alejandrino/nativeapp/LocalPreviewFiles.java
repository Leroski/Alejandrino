package cl.alejandrino.nativeapp;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.util.AtomicFile;
import android.util.Base64;
import com.chaquo.python.Python;
import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** Private previews: no upload, no content URI exposed to the web, no backup. */
final class LocalPreviewFiles implements NativePreviewService.Files {
    private final Context context;
    private final LocalFileIndex index;
    private static final int MAX_JPEG = 96 * 1024;
    LocalPreviewFiles(Context context, LocalFileIndex index) {
        this.context = context.getApplicationContext(); this.index = index;
    }
    private File folder(String user, String technique) throws Exception {
        if (!NativeCheckService.isUuid(user) || !NativeCheckService.isUuid(technique))
            throw new NativeCheckService.Failure("BAD_REQUEST");
        File folder = new File(context.getNoBackupFilesDir(), "previews/" + user + "/" + technique);
        if (!folder.isDirectory() && !folder.mkdirs()) throw new NativeCheckService.Failure("STORAGE_FAILED");
        return folder;
    }
    private static JSONObject read(File file) {
        try {
            if (!file.isFile() || file.length() > 32768) return new JSONObject();
            return new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8));
        } catch (Exception ignored) { return new JSONObject(); }
    }
    private static synchronized void write(File file, byte[] bytes) throws Exception {
        AtomicFile atomic = new AtomicFile(file);
        FileOutputStream stream = null;
        try { stream = atomic.startWrite(); stream.write(bytes); atomic.finishWrite(stream); }
        catch (Exception error) { if (stream != null) atomic.failWrite(stream); throw error; }
    }
    void saveMetadata(JSONObject verified, JSONObject metadata) throws Exception {
        File file = new File(folder(verified.getString("userId"), verified.getString("techniqueId")), "metadata.json");
        JSONObject saved = new JSONObject().put("source", verified.getString("sourceUrl"))
            .put("metadata", PreviewMetadata.clean(metadata));
        write(file, saved.toString().getBytes(StandardCharsets.UTF_8));
    }
    @Override public JSONObject preview(JSONObject verified, boolean refresh, int requestedFrame, DownloadGuard guard,
            NativeMediaService.BeforePublish verify) throws Exception {
        String user = verified.getString("userId"), technique = verified.getString("techniqueId");
        String source = verified.getString("sourceUrl");
        File directory = folder(user, technique);
        JSONObject stored = read(new File(directory, "metadata.json"));
        JSONObject metadata = PreviewMetadata.clean(source.equals(stored.optString("source")) ? stored.optJSONObject("metadata") : null);
        boolean metadataFailed = false;
        if (refresh) {
            JSONObject updated = null;
            try {
                updated = new JSONObject(Python.getInstance().getModule("alejandrino_media").callAttr("preview", source, guard).toString());
            } catch (Exception error) { guard.ensureActive(); metadataFailed = true; }
            if (updated != null) {
                verify.verify();
                metadata = PreviewMetadata.clean(updated);
                try { saveMetadata(verified, metadata); }
                catch (Exception error) { metadataFailed = true; }
            }
        }
        guard.ensureActive();
        boolean available = index.exists(user, technique);
        JSONObject selection = read(new File(directory, "selection.json"));
        int frame = requestedFrame >= 0 ? requestedFrame : selection.optInt("frame", 0);
        if (frame < 0 || frame > 2) frame = 0;
        String image = "";
        boolean frameFailed = false;
        double duration = metadata.optDouble("duration", 0);
        if (available) {
            Uri uri = index.uri(user, technique);
            File jpg = new File(directory, "frame-" + frame + ".jpg");
            boolean cached = uri != null && uri.toString().equals(selection.optString("uri")) && jpg.isFile() && jpg.length() <= MAX_JPEG;
            try {
                byte[] bytes;
                if (cached) {
                    bytes = Files.readAllBytes(jpg.toPath());
                    duration = selection.optDouble("duration", duration);
                } else {
                    try (MediaMetadataRetriever media = new MediaMetadataRetriever()) {
                        media.setDataSource(context, uri);
                        long millis = Long.parseLong(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
                        duration = millis / 1000.0;
                        double fraction = new double[] {0.15, 0.50, 0.80}[frame];
                        Bitmap bitmap = media.getScaledFrameAtTime((long) (millis * 1000 * fraction),
                            MediaMetadataRetriever.OPTION_CLOSEST_SYNC, 320, 320);
                        if (bitmap == null) throw new Exception("No frame");
                        try (ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                            if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 70, output)) throw new Exception("No JPEG");
                            bytes = output.toByteArray();
                        } finally { bitmap.recycle(); }
                    }
                    if (bytes.length == 0 || bytes.length > MAX_JPEG) throw new Exception("Frame size");
                    guard.ensureActive();
                    // An association change invalidates all cached candidates.
                    if (!uri.toString().equals(selection.optString("uri")))
                        for (int i = 0; i < 3; i++) new File(directory, "frame-" + i + ".jpg").delete();
                    write(jpg, bytes);
                }
                guard.ensureActive();
                JSONObject choice = new JSONObject().put("frame", frame).put("uri", uri.toString()).put("duration", duration);
                write(new File(directory, "selection.json"), choice.toString().getBytes(StandardCharsets.UTF_8));
                image = "data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP);
            } catch (NativeCheckService.Failure error) { throw error; }
            catch (Exception error) {
                frameFailed = true;
                // Keep the previous usable cover when a different candidate cannot be decoded.
                int previous = selection.optInt("frame", -1);
                if (uri != null && uri.toString().equals(selection.optString("uri")) && previous >= 0 && previous <= 2) {
                    File fallback = new File(directory, "frame-" + previous + ".jpg");
                    if (fallback.isFile() && fallback.length() > 0 && fallback.length() <= MAX_JPEG)
                        image = "data:image/jpeg;base64," + Base64.encodeToString(Files.readAllBytes(fallback.toPath()), Base64.NO_WRAP);
                }
            }
        }
        guard.ensureActive();
        return new JSONObject().put("metadata", metadata).put("available", available).put("image", image)
            .put("frame", frame).put("duration", Double.isFinite(duration) && duration > 0 && duration <= 86400 ? duration : 0)
            .put("metadataFailed", metadataFailed).put("frameFailed", frameFailed);
    }
}
