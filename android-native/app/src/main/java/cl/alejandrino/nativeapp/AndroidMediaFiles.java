package cl.alejandrino.nativeapp;

import android.content.ContentValues;
import android.content.Context;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import com.chaquo.python.Python;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.ReturnCode;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

final class AndroidMediaFiles implements NativeMediaService.Files {
    interface Player { void open(Uri uri, DownloadGuard guard) throws Exception; }
    private final Context context;
    private final LocalFileIndex index;
    private final Player player;
    AndroidMediaFiles(Context context, LocalFileIndex index, Player player) {
        this.context = context.getApplicationContext(); this.index = index; this.player = player;
    }
    @Override public boolean exists(String user, String technique) throws Exception { return index.exists(user, technique); }
    @Override public void open(String user, String technique, DownloadGuard guard) throws Exception {
        Uri uri = index.uri(user, technique);
        if (uri == null) throw new NativeCheckService.Failure("LOCAL_MISSING");
        player.open(uri, guard);
    }
    @Override public JSONObject download(JSONObject verified, DownloadGuard guard, Consumer<String> progress,
            NativeMediaService.BeforePublish beforePublish) throws Exception {
        File folder = new File(context.getCacheDir(), "media-job-" + UUID.randomUUID());
        if (!folder.mkdir()) throw new NativeCheckService.Failure("STORAGE_FAILED");
        try {
            if (folder.getUsableSpace() < 128L * 1024 * 1024) throw new NativeCheckService.Failure("STORAGE_FAILED");
            JSONObject tracks;
            try {
                tracks = new JSONObject(Python.getInstance().getModule("extractor").callAttr("extract_result",
                    verified.getString("sourceUrl"), folder.getAbsolutePath(), guard).toString());
            } catch (Exception error) { guard.ensureActive(); throw new NativeCheckService.Failure("DOWNLOAD_ENGINE_FAILED"); }
            guard.ensureActive();
            DownloadErrors.check(tracks);
            File video = localTrack(folder, tracks.getString("video_path"));
            File audio = tracks.isNull("audio_path") ? null : localTrack(folder, tracks.getString("audio_path"));
            File output = new File(folder, "final.mp4");
            long bytes = video.length() + (audio == null ? 0 : audio.length());
            if (bytes > 256L * 1024 * 1024 || folder.getUsableSpace() < bytes * 2 + 32L * 1024 * 1024)
                throw new NativeCheckService.Failure("STORAGE_FAILED");
            progress.accept("merging");
            boolean audioRequired = tracks.optBoolean("audio_required", true);
            remux(video, audio, output, audioRequired, guard);
            guard.ensureActive();
            JSONObject quality = inspect(output, audioRequired);
            progress.accept("saving");
            publish(output, verified.getString("userId"), verified.getString("techniqueId"), guard, beforePublish);
            // Optional preview data must never turn a completed download into a failure.
            try { new LocalPreviewFiles(context, index).saveMetadata(verified, tracks.optJSONObject("metadata")); }
            catch (Exception ignored) { /* A manual preview refresh can retry later. */ }
            return quality;
        } finally { removeTemporary(folder); }
    }
    private static File localTrack(File folder, String path) throws Exception {
        File file = new File(path).getCanonicalFile();
        if (!folder.getCanonicalFile().equals(file.getParentFile()) || !file.isFile() || file.length() == 0)
            throw new NativeCheckService.Failure("MEDIA_INVALID");
        return file;
    }
    private static void remux(File video, File audio, File output, boolean audioRequired, DownloadGuard guard) throws Exception {
        List<String> args = new ArrayList<>(List.of("-y", "-nostdin", "-loglevel", "error",
            "-protocol_whitelist", "file,pipe", "-i", video.getAbsolutePath()));
        if (audio != null) args.addAll(List.of("-protocol_whitelist", "file,pipe", "-i", audio.getAbsolutePath()));
        // Always create a real MP4, including when the source already combines both tracks.
        args.addAll(List.of("-map", "0:v:0", "-map", audio == null ? (audioRequired ? "0:a:0" : "0:a:0?") : "1:a:0", "-c", "copy",
            "-movflags", "+faststart", output.getAbsolutePath()));
        CountDownLatch finished = new CountDownLatch(1);
        var session = FFmpegKit.executeWithArgumentsAsync(args.toArray(new String[0]), result -> finished.countDown());
        try {
            while (!finished.await(250, TimeUnit.MILLISECONDS)) guard.ensureActive();
            guard.ensureActive();
            if (!ReturnCode.isSuccess(session.getReturnCode())) throw new NativeCheckService.Failure("MEDIA_INVALID");
        } catch (Exception error) {
            FFmpegKit.cancel(session.getSessionId());
            finished.await(10, TimeUnit.SECONDS);
            throw error;
        }
    }
    private static JSONObject inspect(File output, boolean audioRequired) throws Exception {
        if (!output.isFile() || output.length() == 0 || output.length() > 260L * 1024 * 1024)
            throw new NativeCheckService.Failure("MEDIA_INVALID");
        try (MediaMetadataRetriever media = new MediaMetadataRetriever()) {
            media.setDataSource(output.getAbsolutePath());
            int width = Integer.parseInt(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH));
            int height = Integer.parseInt(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT));
            long duration = Long.parseLong(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION));
            boolean hasAudio = "yes".equals(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO));
            if ((audioRequired && !hasAudio) ||
                !"yes".equals(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO)) ||
                width <= 0 || height <= 0 || width > 16384 || height > 16384 || duration <= 0)
                throw new NativeCheckService.Failure("MEDIA_INVALID");
            return new JSONObject().put("width", width).put("height", height).put("hasAudio", hasAudio);
        } catch (Exception error) { throw new NativeCheckService.Failure("MEDIA_INVALID"); }
    }
    private void publish(File output, String user, String technique, DownloadGuard guard,
            NativeMediaService.BeforePublish beforePublish) throws Exception {
        Uri destination = null;
        boolean linked = false;
        try {
            guard.ensureActive();
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, "Alejandrino-" + UUID.randomUUID() + ".mp4");
            values.put(MediaStore.Downloads.MIME_TYPE, "video/mp4");
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Alejandrino");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            destination = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (destination == null) throw new NativeCheckService.Failure("STORAGE_FAILED");
            index.begin(user, technique, destination);
            try (OutputStream out = context.getContentResolver().openOutputStream(destination);
                    FileInputStream in = new FileInputStream(output)) {
                if (out == null) throw new NativeCheckService.Failure("STORAGE_FAILED");
                byte[] buffer = new byte[64 * 1024]; int n;
                while ((n = in.read(buffer)) != -1) { guard.ensureActive(); out.write(buffer, 0, n); }
                out.flush();
            }
            try (var saved = context.getContentResolver().openAssetFileDescriptor(destination, "r")) {
                if (saved == null || saved.getLength() != output.length()) throw new NativeCheckService.Failure("STORAGE_FAILED");
            }
            // Recheck session, ownership and canonical source after all long-running work.
            beforePublish.verify();
            synchronized (guard) {
                guard.ensureActive();
                values.clear(); values.put(MediaStore.Downloads.IS_PENDING, 0);
                if (context.getContentResolver().update(destination, values, null, null) != 1)
                    throw new NativeCheckService.Failure("STORAGE_FAILED");
                index.link(user, technique, destination);
                linked = true;
            }
        } catch (NativeCheckService.Failure error) { throw error; }
        catch (Exception error) { throw new NativeCheckService.Failure("STORAGE_FAILED"); }
        finally {
            if (destination != null && !linked) {
                try {
                    context.getContentResolver().delete(destination, null, null);
                    index.unlinkIfSame(user, technique, destination);
                    index.finish(user, technique);
                } catch (Exception ignored) { /* Journal remains for cleanup after process restart. */ }
            } else if (linked) index.finish(user, technique);
        }
    }
    private static void removeTemporary(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) removeTemporary(child);
        file.delete();
    }
}
