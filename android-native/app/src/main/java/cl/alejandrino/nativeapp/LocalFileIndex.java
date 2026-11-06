package cl.alejandrino.nativeapp;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import java.io.FileNotFoundException;
import java.io.InputStream;

/** Read-only lookup. Media and content URIs never leave this device. */
final class LocalFileIndex implements NativeCheckService.LocalIndex {
    private final Context context;
    private final SharedPreferences preferences;
    LocalFileIndex(Context context) {
        this.context = context.getApplicationContext();
        preferences = this.context.getSharedPreferences("alejandrino_local_media_v1", Context.MODE_PRIVATE);
    }

    @Override public boolean exists(String verifiedUser, String verifiedTechnique) throws Exception {
        String value = preferences.getString(verifiedUser + ":" + verifiedTechnique, null);
        if (value == null) return false;
        Uri uri = Uri.parse(value);
        if (!"content".equals(uri.getScheme()) || !"media".equals(uri.getAuthority())) return false;
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            return input != null && input.read() != -1;
        } catch (FileNotFoundException missing) { return false; }
    }
}
