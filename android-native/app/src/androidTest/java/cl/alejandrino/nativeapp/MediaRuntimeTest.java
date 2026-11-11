package cl.alejandrino.nativeapp;

import android.content.Context;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.chaquo.python.PyObject;
import com.chaquo.python.Python;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.ReturnCode;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the packaged Python -> Java -> FFmpeg -> MediaStore path on Android. */
@RunWith(AndroidJUnit4.class)
public class MediaRuntimeTest {
    private Context context;
    private File fixtureDirectory;
    private PyObject scope;
    private final String user = UUID.randomUUID().toString();
    private final String technique = UUID.randomUUID().toString();
    private static final String SOURCE = "https://www.instagram.com/reel/RuntimeFixture/";

    @Before public void prepare() throws Exception {
        var instrumentation = InstrumentationRegistry.getInstrumentation();
        context = instrumentation.getTargetContext();
        fixtureDirectory = new File(context.getCacheDir(), "runtime-fixtures-" + UUID.randomUUID());
        assertTrue(fixtureDirectory.mkdir());
        var assets = instrumentation.getContext().getAssets();
        for (String name : assets.list("media")) {
            try (var input = assets.open("media/" + name)) {
                Files.copy(input, new File(fixtureDirectory, name).toPath());
            }
        }
        String script;
        try (var input = assets.open("runtime_fixture.py")) {
            var bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int n;
            while ((n = input.read(buffer)) != -1) bytes.write(buffer, 0, n);
            script = new String(bytes.toByteArray(), StandardCharsets.UTF_8);
        }
        var python = Python.getInstance();
        scope = python.getBuiltins().callAttr("dict");
        python.getBuiltins().callAttr("exec", script, scope);
    }

    @After public void clean() throws Exception {
        if (scope != null) scope.callAttr("__getitem__", "restore").call();
        if (context != null) {
            LocalFileIndex index = new LocalFileIndex(context);
            Uri saved = index.uri(user, technique);
            if (saved != null) {
                context.getContentResolver().delete(saved, null, null);
                index.unlinkIfSame(user, technique, saved);
            }
            remove(fixtureDirectory);
            remove(new File(context.getCacheDir(), "runtime-extraction-" + technique));
            remove(new File(context.getNoBackupFilesDir(), "previews/" + user));
        }
    }

    private void mode(String mode) {
        scope.callAttr("__getitem__", "install").call(fixtureDirectory.getAbsolutePath(), mode);
    }

    @Test public void bundledFfmpegLoads() {
        var result = FFmpegKit.executeWithArguments(new String[] {"-hide_banner", "-version"});
        assertTrue(ReturnCode.isSuccess(result.getReturnCode()));
    }

    @Test public void pythonDownloadsTracksWithTheRealJavaGuard() throws Exception {
        mode("separate");
        File folder = new File(context.getCacheDir(), "runtime-extraction-" + technique);
        // Call extract directly here so a runtime error in this synthetic fixture is observable in CI.
        String raw = Python.getInstance().getModule("alejandrino_media").callAttr("extract", SOURCE,
            folder.getAbsolutePath(), new DownloadGuard(30000)).toString();
        JSONObject tracks = new JSONObject(raw);
        assertTrue(new File(tracks.getString("video_path")).length() > 0);
        assertTrue(new File(tracks.getString("audio_path")).length() > 0);
    }

    private void roundTrip(String mode, boolean audio) throws Exception {
        mode(mode);
        LocalFileIndex index = new LocalFileIndex(context);
        AndroidMediaFiles files = new AndroidMediaFiles(context, index, (uri, guard) -> {});
        JSONObject verified = new JSONObject().put("userId", user).put("techniqueId", technique).put("sourceUrl", SOURCE);
        var stages = new ArrayList<String>();
        int[] checks = {0};
        JSONObject result = files.download(verified, new DownloadGuard(60000), stages::add, () -> checks[0]++);
        assertEquals(1, checks[0]);
        assertEquals(audio, result.getBoolean("hasAudio"));
        assertEquals(160, result.getInt("width"));
        assertEquals(120, result.getInt("height"));
        assertTrue(stages.contains("merging")); assertTrue(stages.contains("saving"));
        assertTrue(index.exists(user, technique));
        try (var media = new MediaMetadataRetriever()) {
            media.setDataSource(context, index.uri(user, technique));
            assertEquals("yes", media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO));
            assertEquals(audio, "yes".equals(media.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_AUDIO)));
            assertNotNull(media.getFrameAtTime(500000));
        }
        assertTrue(new LocalFileIndex(context).exists(user, technique));
    }

    @Test public void progressiveMp4IsPublished() throws Exception { roundTrip("combined", true); }
    @Test public void separateTracksAreMergedAndPublished() throws Exception { roundTrip("separate", true); }
    @Test public void dashFragmentsAreMergedAndPublished() throws Exception { roundTrip("dash", true); }
    @Test public void silentOriginalIsPublished() throws Exception { roundTrip("silent", false); }

    @Test public void previewThenRepeatedDownloadsKeepTheBridgeModule() throws Exception {
        mode("combined");
        var python = Python.getInstance();
        var original = python.getModule("alejandrino_media");
        JSONObject metadata = new JSONObject(original.callAttr("preview", SOURCE, new DownloadGuard(30000)).toString());
        assertEquals("Android runtime fixture", metadata.getString("title"));
        File folder = new File(context.getCacheDir(), "runtime-extraction-" + technique);
        for (int attempt = 0; attempt < 2; attempt++) {
            // Resolve the module again, just as independent WebView requests do.
            var current = python.getModule("alejandrino_media");
            assertEquals(original.id(), current.id());
            JSONObject tracks = new JSONObject(current.callAttr("extract_result", SOURCE,
                folder.getAbsolutePath(), new DownloadGuard(30000)).toString());
            assertTrue(new File(tracks.getString("video_path")).length() > 0);
            remove(folder);
        }
        roundTrip("combined", true);
    }

    @Test public void rejectedTransferReportsAccessWithoutPublishing() throws Exception {
        mode("denied");
        LocalFileIndex index = new LocalFileIndex(context);
        AndroidMediaFiles files = new AndroidMediaFiles(context, index, (uri, guard) -> {});
        JSONObject verified = new JSONObject().put("userId", user).put("techniqueId", technique).put("sourceUrl", SOURCE);
        NativeCheckService.Failure failure = assertThrows(NativeCheckService.Failure.class,
            () -> files.download(verified, new DownloadGuard(30000), stage -> {}, () -> fail("No publication")));
        assertEquals("PROVIDER_ACCESS_REQUIRED", failure.code);
        assertFalse(index.exists(user, technique));
    }

    private static void remove(File file) {
        if (file == null) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) remove(child);
        file.delete();
    }
}
