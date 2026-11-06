package cl.alejandrino.nativeapp;

import android.content.Context;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.content.SharedPreferences;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;

/** La relación usuario/ficha/archivo SOLO existe en este dispositivo. */
final class NativeFileIndex {
    private final Context context;
    private final SharedPreferences prefs;

    NativeFileIndex(Context context) {
        this.context = context;
        this.prefs = context.getSharedPreferences("alejandrino_local_media_v1", Context.MODE_PRIVATE);
    }

    private String key(String userId, String techniqueId) {
        return userId + ":" + techniqueId;
    }

    Uri find(String userId, String techniqueId) {
        String key = key(userId, techniqueId);
        String value = prefs.getString(key, null);
        if (value == null) return null;
        try {
            Uri uri = Uri.parse(value);
            if (!"content".equals(uri.getScheme())) throw new IllegalArgumentException();
            try (ParcelFileDescriptor file = context.getContentResolver().openFileDescriptor(uri, "r")) {
                if (file == null || file.getStatSize() == 0) throw new IllegalArgumentException();
            }
            return uri;
        } catch (Exception ignored) {
            prefs.edit().remove(key).apply();
            return null;
        }
    }

    Uri store(String userId, String techniqueId, File source) throws Exception {
        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, "Alejandrino-" + techniqueId + ".mp4");
        values.put(MediaStore.Downloads.MIME_TYPE, "video/mp4");
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Alejandrino");
        values.put(MediaStore.Downloads.IS_PENDING, 1);
        Uri destination = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (destination == null) throw new Exception("No se pudo crear el archivo en Descargas.");
        boolean success = false;
        try (FileInputStream in = new FileInputStream(source);
             OutputStream out = context.getContentResolver().openOutputStream(destination, "w")) {
            if (out == null) throw new Exception("No se pudo abrir el archivo de destino.");
            in.transferTo(out);
            success = true;
        } finally {
            if (!success) context.getContentResolver().delete(destination, null, null);
        }
        values.clear();
        values.put(MediaStore.Downloads.IS_PENDING, 0);
        if (context.getContentResolver().update(destination, values, null, null) != 1) {
            context.getContentResolver().delete(destination, null, null);
            throw new Exception("No se pudo publicar el archivo descargado.");
        }
        prefs.edit().putString(key(userId, techniqueId), destination.toString()).apply();
        return destination;
    }

    void open(String userId, String techniqueId) throws Exception {
        Uri uri = find(userId, techniqueId);
        if (uri == null) throw new Exception("El archivo ya no está disponible en este teléfono.");
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "video/mp4");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(Intent.createChooser(intent, "Reproducir video"));
    }
}
