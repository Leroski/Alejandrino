package cl.alejandrino.nativeapp;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.view.ViewGroup;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;

import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import com.chaquo.python.Python;
import com.chaquo.python.PyObject;
import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.ReturnCode;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Native Android shell for Alejandrino. Web app owns auth & metadata; Android owns media. */
public final class MainActivity extends Activity {
    private static final String TAG = "AlejandrinoNative";
    private static final Pattern UUID_PATTERN = Pattern.compile(
        "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");
    private WebView web;
    private NativeFileIndex files;
    private volatile boolean busy = false;
    private String baseUrl;
    private String allowedOrigin;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        files = new NativeFileIndex(this);
        baseUrl = BuildConfig.ALEJANDRINO_WEB_URL.trim().replaceAll("/+$", "");
        try {
            URI parsed = new URI(baseUrl);
            if (!"https".equals(parsed.getScheme()) || parsed.getHost() == null ||
                parsed.getUserInfo() != null || parsed.getPort() != -1 ||
                (parsed.getPath() != null && !parsed.getPath().isEmpty()) ||
                parsed.getQuery() != null || parsed.getFragment() != null) {
                throw new Exception("URL no válida");
            }
            allowedOrigin = "https://" + parsed.getHost().toLowerCase();
        } catch (Exception invalid) {
            TextView error = new TextView(this);
            error.setPadding(32, 64, 32, 32);
            error.setText("Configura ALEJANDRINO_WEB_URL con el origen HTTPS de tu despliegue en android-native/gradle.properties.");
            setContentView(error);
            return;
        }

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(-1, -1));
        setContentView(web);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        Log.i(TAG, "Origen web configurado: " + allowedOrigin);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                Log.i(TAG, "WebView inició navegación: " + url);
            }
            @Override public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "WebView cargó: " + url);
                if (url.startsWith(allowedOrigin + "/")) {
                    view.evaluateJavascript("typeof window.AlejandrinoBridge", result ->
                        Log.i(TAG, "Puente JS en origen autorizado: " + result));
                } else {
                    Log.w(TAG, "La WebView terminó en otro origen; puente nativo deshabilitado");
                }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request,
                                                   WebResourceError error) {
                if (request.isForMainFrame()) {
                    Log.e(TAG, "Error de página WebView: " + request.getUrl() +
                        " (" + error.getErrorCode() + ") " + error.getDescription());
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame()) return false;
                String origin = uri.getScheme() + "://" + uri.getAuthority();
                Log.i(TAG, "Navegación de página principal: " + uri);
                if (allowedOrigin.equals(origin)) return false;
                // A redirect may point to another Vercel host. NEVER silently open
                // the main app in Chrome, because this hides the native controls.
                Log.e(TAG, "WebView bloqueó cambio de origen: " + origin +
                    " (permitido: " + allowedOrigin + ")");
                TextView warning = new TextView(MainActivity.this);
                warning.setPadding(32, 64, 32, 32);
                warning.setText("Alejandrino intentó abrir otro dominio:\\n" + origin +
                    "\\n\\nDominio autorizado:\\n" + allowedOrigin +
                    "\\n\\nComprueba la URL de Vercel configurada en Gradle.");
                setContentView(warning);
                return true;
            }
        });

        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            TextView error = new TextView(this);
            error.setPadding(32, 64, 32, 32);
            error.setText("Esta versión de Android System WebView no admite mensajes seguros. Actualiza Android System WebView.");
            setContentView(error);
            return;
        }
        WebViewCompat.addWebMessageListener(web, "AlejandrinoBridge",
            Collections.singleton(allowedOrigin), (view, message, origin, isMainFrame, replyProxy) -> {
                if (!isMainFrame || !allowedOrigin.equals(origin.toString()) || message.getData() == null) return;
                handleNativeMessage(message.getData());
            });
        navigateShared(getIntent());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (web != null && allowedOrigin != null) navigateShared(intent);
    }

    private void navigateShared(Intent intent) {
        if (Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() <= 20000) {
                Matcher matcher = Pattern.compile("https://[^\\s<>\\\"']+").matcher(text);
                if (matcher.find()) {
                    String shared = matcher.group().replaceAll("[.,;!?\\)]+$", "");
                    web.loadUrl(baseUrl + "/compartir?text=" +
                        URLEncoder.encode(shared, StandardCharsets.UTF_8));
                    return;
                }
            }
        }
        if (web.getUrl() == null) web.loadUrl(baseUrl + "/");
    }

    private void handleNativeMessage(String raw) {
        try {
            JSONObject m = new JSONObject(raw);
            String type = m.optString("type", "");
            Log.i(TAG, "Puente recibido: " + type);
            String user = m.optString("userId", "");
            String id = m.optString("techniqueId", "");
            if (!UUID_PATTERN.matcher(user).matches() || !UUID_PATTERN.matcher(id).matches()) {
                Log.w(TAG, "Puente rechazado por identificadores inválidos: " + type);
                return;
            }
            if (type.equals("CHECK")) {
                emit("AVAILABILITY", id, files.find(user, id) != null ? "available" : "missing", "");
            } else if (type.equals("OPEN")) {
                runOnUiThread(() -> {
                    try { files.open(user, id); }
                    catch (Exception error) { emit("ERROR", id, "missing", error.getMessage()); }
                });
            } else if (type.equals("DOWNLOAD")) {
                String url = m.optString("url", "");
                if (url.length() > 2048 || !url.startsWith("https://")) {
                    Log.w(TAG, "Descarga rechazada: URL inválida");
                    emit("ERROR", id, "missing", "URL de descarga no válida.");
                    return;
                }
                download(user, id, url);
            }
        } catch (Exception error) {
            Log.e(TAG, "Mensaje nativo no válido", error);
        }
    }

    private void emit(String type, String id, String status, String message) {
        try {
            JSONObject response = new JSONObject();
            response.put("type", type);
            response.put("techniqueId", id);
            response.put("status", status);
            response.put("available", "available".equals(status));
            response.put("message", message);
            String js = "window.dispatchEvent(new CustomEvent('alejandrino:native',{detail:" +
                response.toString() + "}))";
            runOnUiThread(() -> {
                if (web != null && web.getUrl() != null &&
                    web.getUrl().startsWith(allowedOrigin + "/")) web.evaluateJavascript(js, null);
            });
        } catch (Exception error) {
            Log.e(TAG, "No se pudo notificar a la biblioteca", error);
        }
    }

    private void download(String user, String id, String url) {
        if (busy) {
            emit("ERROR", id, "missing", "Ya hay otra descarga en curso.");
            return;
        }
        if (files.find(user, id) != null) {
            emit("AVAILABILITY", id, "available", "Este video ya está descargado.");
            return;
        }
        busy = true;
        emit("STATUS", id, "downloading", "Descargando video…");
        new Thread(() -> {
            File jobDir = new File(getCacheDir(), "job-" + UUID.randomUUID());
            try {
                PyObject module = Python.getInstance().getModule("extractor");
                JSONObject extracted = new JSONObject(module.callAttr("extract", url,
                    jobDir.getAbsolutePath()).toString());
                String video = extracted.getString("video_path");
                String audio = extracted.isNull("audio_path") ? "" : extracted.optString("audio_path", "");
                File merged = new File(jobDir, "final.mp4");
                if (!audio.isEmpty()) {
                    emit("STATUS", id, "merging", "Uniendo audio y video…");
                    String[] command = {
                        "-y", "-i", video, "-i", audio, "-map", "0:v:0",
                        "-map", "1:a:0", "-c", "copy", "-movflags", "+faststart",
                        merged.getAbsolutePath()
                    };
                    var session = FFmpegKit.executeWithArguments(command);
                    if (!ReturnCode.isSuccess(session.getReturnCode())) {
                        throw new Exception("FFmpegKit falló: " + session.getReturnCode());
                    }
                } else {
                    try (FileInputStream in = new FileInputStream(video);
                         FileOutputStream out = new FileOutputStream(merged)) {
                        in.transferTo(out);
                    }
                }
                if (!merged.isFile() || merged.length() == 0) throw new Exception("Archivo de salida vacío");
                files.store(user, id, merged);
                emit("STATUS", id, "available", "Video descargado y vinculado a tu ficha.");
            } catch (Exception | LinkageError error) {
                Log.e(TAG, "Fallo durante descarga local", error);
                emit("ERROR", id, "missing", "Falló la descarga: " + error.getMessage());
            } finally {
                File[] parts = jobDir.listFiles();
                if (parts != null) for (File part : parts) part.delete();
                jobDir.delete();
                busy = false;
            }
        }).start();
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
