package cl.alejandrino.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.provider.MediaStore;
import java.io.FileNotFoundException;
import java.io.InputStream;

/** Private account:ficha index. Only files created by this APK are journaled. */
final class LocalFileIndex implements NativeCheckService.LocalIndex {
    private final Context context;
    private final SharedPreferences preferences;
    LocalFileIndex(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences("alejandrino_local_media_v1", Context.MODE_PRIVATE);
    }
    private static String key(String user, String technique) { return user + ":" + technique; }
    static boolean isMediaUri(Uri uri) {
        return "content".equals(uri.getScheme()) && "media".equals(uri.getAuthority()) &&
            uri.getPath() != null && uri.getPath().matches("/external(?:_primary)?/downloads/[0-9]+");
    }
    Uri uri(String user, String technique) {
        String value = preferences.getString(key(user, technique), null);
        if (value == null) return null;
        Uri uri = Uri.parse(value);
        return isMediaUri(uri) ? uri : null;
    }
    @Override public boolean exists(String user, String technique) throws Exception {
        Uri uri = uri(user, technique);
        if (uri == null) return false;
        try (var cursor = context.getContentResolver().query(uri, new String[] {MediaStore.Downloads.IS_PENDING}, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst() || cursor.getInt(0) != 0) return false;
        }
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            return input != null && input.read() != -1;
        } catch (FileNotFoundException | SecurityException missing) { return false; }
    }
    void begin(String user, String technique, Uri uri) throws NativeCheckService.Failure {
        if (!isMediaUri(uri) || !preferences.edit().putString("pending|" + key(user, technique), uri.toString()).commit())
            throw new NativeCheckService.Failure("STORAGE_FAILED");
    }
    void link(String user, String technique, Uri uri) throws NativeCheckService.Failure {
        if (!isMediaUri(uri) || !preferences.edit().putString(key(user, technique), uri.toString()).commit())
            throw new NativeCheckService.Failure("STORAGE_FAILED");
    }
    void finish(String user, String technique) { preferences.edit().remove("pending|" + key(user, technique)).commit(); }
    void unlinkIfSame(String user, String technique, Uri uri) {
        if (uri.equals(uri(user, technique))) preferences.edit().remove(key(user, technique)).commit();
    }
    void recoverIncomplete() {
        for (var entry : preferences.getAll().entrySet()) {
            if (!entry.getKey().startsWith("pending|") || !(entry.getValue() instanceof String)) continue;
            String[] ids = entry.getKey().substring(8).split(":");
            if (ids.length != 2 || !NativeCheckService.isUuid(ids[0]) || !NativeCheckService.isUuid(ids[1])) continue;
            Uri pending = Uri.parse((String) entry.getValue());
            if (!isMediaUri(pending)) continue;
            try {
                if (!pending.equals(uri(ids[0], ids[1])) || !exists(ids[0], ids[1])) {
                    context.getContentResolver().delete(pending, null, null);
                    unlinkIfSame(ids[0], ids[1], pending);
                }
                finish(ids[0], ids[1]);
            } catch (Exception ignored) { /* Keep the journal for recovery on the next start. */ }
        }
    }
}
