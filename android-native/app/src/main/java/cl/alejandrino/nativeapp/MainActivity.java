package cl.alejandrino.nativeapp;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.Gravity;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.chaquo.python.Python;
import com.chaquo.python.PyObject;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.ReturnCode;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.OutputStream;
import java.util.UUID;

public final class MainActivity extends Activity {
    private TextView status;
    private volatile boolean busy = false;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(32, 64, 32, 24);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView heading = new TextView(this);
        heading.setText("Alejandrino · prueba Android");
        heading.setTextSize(22);
        root.addView(heading);
        status = new TextView(this);
        status.setText("Comparte un enlace público desde Instagram o TikTok hacia Alejandrino.");
        status.setPadding(0, 36, 0, 32);
        root.addView(status);
        Button info = new Button(this);
        info.setText("Cómo probar");
        info.setOnClickListener(v -> status.setText(
            "Abre Instagram → Compartir → Alejandrino. El MP4 se guarda en Download/Alejandrino."));
        root.addView(info);
        setContentView(root);
        consume(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        consume(intent);
    }

    private void consume(Intent intent) {
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return;
        if (!"text/plain".equals(intent.getType())) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null) return;
        java.util.regex.Matcher matcher = java.util.regex.Pattern
            .compile("https://[^\\s<>\\\"']+").matcher(text);
        if (!matcher.find()) { status.setText("No se encontró una URL."); return; }
        download(matcher.group());
    }

    private void show(String message) {
        runOnUiThread(() -> status.setText(message));
    }

    private void download(String url) {
        if (busy) { show("Ya hay una descarga en curso."); return; }
        busy = true;
        show("Descargando…");
        new Thread(() -> {
            File taskDir = new File(getCacheDir(), "job-" + UUID.randomUUID());
            try {
                PyObject module = Python.getInstance().getModule("extractor");
                JSONObject result = new JSONObject(module.callAttr("extract", url,
                    taskDir.getAbsolutePath()).toString());
                String videoPath = result.getString("video_path");
                String audioPath = result.optString("audio_path", "");
                File merged = new File(taskDir, "final.mp4");
                if (!audioPath.isEmpty()) {
                    show("Uniendo audio y video…");
                    String[] command = {
                        "-y", "-i", videoPath, "-i", audioPath,
                        "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
                        "-movflags", "+faststart", merged.getAbsolutePath()
                    };
                    var session = FFmpegKit.executeWithArguments(command);
                    if (!ReturnCode.isSuccess(session.getReturnCode())) {
                        throw new Exception("FFmpeg no pudo unir las pistas. Código: "
                            + session.getReturnCode());
                    }
                } else {
                    // Una pista progresiva puede traer video y audio combinados.
                    File original = new File(videoPath);
                    try (FileInputStream in = new FileInputStream(original);
                         java.io.FileOutputStream out = new java.io.FileOutputStream(merged)) {
                        in.transferTo(out);
                    }
                }

                if (!merged.exists() || merged.length() == 0)
                    throw new Exception("Archivo de salida vacío.");
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME,
                    "Alejandrino-" + result.getString("id") + "-" +
                    UUID.randomUUID().toString().substring(0, 8) + ".mp4");
                values.put(MediaStore.Downloads.MIME_TYPE, "video/mp4");
                values.put(MediaStore.Downloads.RELATIVE_PATH,
                    Environment.DIRECTORY_DOWNLOADS + "/Alejandrino");
                values.put(MediaStore.Downloads.IS_PENDING, 1);
                android.net.Uri destination =
                    getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (destination == null) throw new Exception("No se pudo crear el archivo.");
                boolean success = false;
                try (OutputStream out = getContentResolver().openOutputStream(destination);
                     FileInputStream in = new FileInputStream(merged)) {
                    if (out == null) throw new Exception("No se pudo abrir almacenamiento.");
                    in.transferTo(out);
                    success = true;
                } finally {
                    if (!success) getContentResolver().delete(destination, null, null);
                }
                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                getContentResolver().update(destination, values, null, null);
                show("Descarga lista en Download/Alejandrino.");
            } catch (Exception error) {
                show("Error: " + error.getMessage());
            } finally {
                busy = false;
                File[] files = taskDir.listFiles();
                if (files != null) for (File file : files) file.delete();
                taskDir.delete();
            }
        }).start();
    }
}
