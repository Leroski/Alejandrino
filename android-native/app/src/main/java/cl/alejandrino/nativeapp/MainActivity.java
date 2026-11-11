package cl.alejandrino.nativeapp;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.webkit.WebMessageCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONObject;
import java.util.Collections;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.FutureTask;
import java.util.concurrent.atomic.AtomicReference;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

/** Fixed-origin shell. Every media operation verifies session and ownership first. */
public final class MainActivity extends Activity {
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(6));
    private WebView web;
    private FrameLayout webContainer;
    private AllowedOrigin origin;
    private NativeCheckService checks;
    private NativeMediaService media;
    private NativePreviewService previews;
    private final ConcurrentHashMap<String, DownloadGuard> previewJobs = new ConcurrentHashMap<>();
    private static boolean recovered;
    private final AtomicReference<MediaOperation> activeMedia = new AtomicReference<>();
    private static final class MediaOperation {
        final JSONObject identity;
        final String action;
        final DownloadGuard guard;
        MediaOperation(JSONObject input) throws Exception {
            action = input.getString("type");
            identity = NativeCheckService.envelope(input, action);
            guard = new DownloadGuard("DOWNLOAD".equals(action) ? 600000 : 20000);
        }
        boolean matches(JSONObject input) {
            for (String key : new String[] {"requestId", "userId", "techniqueId"})
                if (!identity.optString(key).equals(input.optString(key))) return false;
            return input.optInt("protocolVersion") == 1;
        }
    }
    private int documentGeneration;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            origin = new AllowedOrigin(BuildConfig.ALEJANDRINO_WEB_URL);
            LocalFileIndex index = new LocalFileIndex(this);
            if (!recovered) { index.recoverIncomplete(); recovered = true; }
            NativeAuthorizer authorizer = new NativeAuthorizer(origin);
            checks = new NativeCheckService(authorizer, index);
            previews = new NativePreviewService(authorizer, new LocalPreviewFiles(this, index));
            media = new NativeMediaService(authorizer, new AndroidMediaFiles(this, index, (uri, guard) -> {
                FutureTask<Void> open = new FutureTask<>(() -> {
                    guard.ensureActive();
                    if (isFinishing() || isDestroyed()) throw new NativeCheckService.Failure("OPEN_FAILED");
                    startActivity(new Intent(this, PlaybackActivity.class).putExtra("localVideo", uri.toString()));
                    return null;
                });
                runOnUiThread(open);
                try { open.get(5, TimeUnit.SECONDS); }
                catch (Exception error) { guard.cancel(); open.cancel(false); throw new NativeCheckService.Failure("OPEN_FAILED"); }
            }));
        } catch (Exception invalid) {
            showError("Falta configurar el origen HTTPS de Alejandrino al compilar esta APK."); return;
        }
        web = new WebView(this);
        webContainer = new FrameLayout(this);
        webContainer.addView(web, new FrameLayout.LayoutParams(-1, -1));
        webContainer.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                documentGeneration++; cancelMedia(false); cancelPreviews();
                if (!origin.allows(url)) { view.stopLoading(); showError("El despliegue cambió de dominio. Revisa su acceso en Vercel."); }
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("No se pudo cargar tu biblioteca. Revisa la conexión y vuelve a intentarlo.");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                if (origin.allows(url)) return false;
                if (request.hasGesture() && AllowedOrigin.externalHttps(url)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, request.getUrl())); }
                    catch (Exception unavailable) { showError("No hay una aplicación disponible para abrir el enlace."); }
                } else showError("El despliegue web requiere acceso a otro dominio. Revisa la protección de esta Preview en Vercel.");
                return true;
            }
        });
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            showError("Actualiza Android System WebView para comprobar archivos locales."); return;
        }
        WebViewCompat.addWebMessageListener(web, "AlejandrinoBridgeV1", Collections.singleton(origin.value),
            (view, message, source, mainFrame, reply) -> {
                if (!mainFrame || !origin.allows(source.toString()) || message.getType() != WebMessageCompat.TYPE_STRING) return;
                final String raw = message.getData();
                if (raw == null || raw.length() > 12288) {
                    reply.postMessage(NativeCheckService.error(new JSONObject(), "BAD_REQUEST").toString()); return;
                }
                final int generation = documentGeneration;
                Runnable task = () -> {
                    JSONObject response = checks.handle(raw);
                    runOnUiThread(() -> {
                        if (web != null && generation == documentGeneration && origin.allows(web.getUrl())) reply.postMessage(response.toString());
                    });
                };
                try { workers.execute(task); }
                catch (RejectedExecutionException busy) {
                    JSONObject input = new JSONObject();
                    try { if (raw != null && raw.length() <= 12288) input = new JSONObject(raw); }
                    catch (Exception ignored) { /* Return only bounded, validated correlation fields. */ }
                    reply.postMessage(NativeCheckService.error(input, "BUSY").toString());
                }
            });
        WebViewCompat.addWebMessageListener(web, "AlejandrinoMediaV1", Collections.singleton(origin.value),
            (view, message, source, mainFrame, reply) -> {
                if (!mainFrame || !origin.allows(source.toString()) || message.getType() != WebMessageCompat.TYPE_STRING) return;
                String raw = message.getData();
                JSONObject input = new JSONObject();
                try {
                    if (raw == null || raw.length() > 12288) throw new Exception();
                    input = new JSONObject(raw);
                } catch (Exception invalid) { reply.postMessage(NativeMediaService.error(input, "DOWNLOAD", "BAD_REQUEST").toString()); return; }
                if ("CANCEL".equals(input.opt("type"))) {
                    MediaOperation current = activeMedia.get();
                    if (current != null && current.matches(input)) current.guard.cancel();
                    return;
                }
                MediaOperation operation;
                try {
                    String action = input.getString("type");
                    if (!"DOWNLOAD".equals(action) && !"OPEN".equals(action)) throw new NativeCheckService.Failure("UNSUPPORTED_ACTION");
                    NativeCheckService.validate(input, action);
                    operation = new MediaOperation(input);
                } catch (Exception invalid) {
                    reply.postMessage(NativeMediaService.error(input, input.optString("type", "DOWNLOAD"),
                        invalid instanceof NativeCheckService.Failure ? ((NativeCheckService.Failure) invalid).code : "BAD_REQUEST").toString()); return;
                }
                if (!activeMedia.compareAndSet(null, operation)) {
                    reply.postMessage(NativeMediaService.error(operation.identity, operation.action, "BUSY").toString()); return;
                }
                web.setKeepScreenOn("DOWNLOAD".equals(operation.action));
                final int generation = documentGeneration;
                java.util.function.Consumer<JSONObject> post = response -> runOnUiThread(() -> {
                    if (web != null && generation == documentGeneration && origin.allows(web.getUrl())) reply.postMessage(response.toString());
                });
                try {
                    workers.execute(() -> {
                        try { post.accept(media.handle(raw, operation.guard, post)); }
                        finally {
                            activeMedia.compareAndSet(operation, null);
                            runOnUiThread(() -> {
                                MediaOperation current = activeMedia.get();
                                if (web != null) web.setKeepScreenOn(current != null && "DOWNLOAD".equals(current.action));
                            });
                        }
                    });
                } catch (RejectedExecutionException busy) {
                    activeMedia.compareAndSet(operation, null); web.setKeepScreenOn(false);
                    post.accept(NativeMediaService.error(operation.identity, operation.action, "BUSY"));
                }
            });
        WebViewCompat.addWebMessageListener(web, "AlejandrinoPreviewV1", Collections.singleton(origin.value),
            (view, message, source, mainFrame, reply) -> {
                if (!mainFrame || !origin.allows(source.toString()) || message.getType() != WebMessageCompat.TYPE_STRING) return;
                String raw = message.getData();
                JSONObject input = new JSONObject();
                try {
                    if (raw == null || raw.length() > 12288) throw new Exception();
                    input = new JSONObject(raw);
                    for (String field : new String[] {"requestId", "userId", "techniqueId"})
                        if (!NativeCheckService.isUuid(input.opt(field))) throw new Exception();
                } catch (Exception invalid) {
                    reply.postMessage(NativeMediaService.error(input, "PREVIEW", "BAD_REQUEST").toString()); return;
                }
                String key = input.optString("userId") + ":" + input.optString("techniqueId") + ":" + input.optString("requestId");
                if ("CANCEL".equals(input.opt("type"))) {
                    DownloadGuard current = previewJobs.get(key);
                    if (current != null) current.cancel();
                    return;
                }
                if (previewJobs.size() >= 2) {
                    reply.postMessage(NativeMediaService.error(input, "PREVIEW", "BUSY").toString()); return;
                }
                DownloadGuard guard = new DownloadGuard(60000);
                if (previewJobs.putIfAbsent(key, guard) != null) {
                    reply.postMessage(NativeMediaService.error(input, "PREVIEW", "BUSY").toString()); return;
                }
                final int generation = documentGeneration;
                try {
                    workers.execute(() -> {
                        try {
                            JSONObject response = previews.handle(raw, guard);
                            runOnUiThread(() -> {
                                if (web != null && generation == documentGeneration && origin.allows(web.getUrl())) reply.postMessage(response.toString());
                            });
                        } finally { previewJobs.remove(key, guard); }
                    });
                } catch (RejectedExecutionException busy) {
                    previewJobs.remove(key, guard);
                    reply.postMessage(NativeMediaService.error(input, "PREVIEW", "BUSY").toString());
                }
            });
        setContentView(webContainer);
        navigate(getIntent());
    }

    private void showError(String message) {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(32, 64, 32, 32);
        TextView text = new TextView(this); text.setText(message); panel.addView(text);
        if (web != null && origin != null) {
            Button retry = new Button(this); retry.setText("Volver a la biblioteca");
            retry.setOnClickListener(v -> { setContentView(webContainer); web.loadUrl(origin.value + "/"); });
            panel.addView(retry);
        }
        setContentView(panel);
    }

    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); navigate(intent); }

    private void navigate(Intent intent) {
        if (web == null || origin == null) return;
        if (intent != null && Intent.ACTION_SEND.equals(intent.getAction()) && "text/plain".equals(intent.getType())) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (text != null && text.length() <= 20000) {
                var match = Pattern.compile("https://[^\\s<>\"']+").matcher(text);
                if (match.find()) {
                    String shared = match.group().replaceAll("[.,;!?)]+$", "");
                    web.loadUrl(origin.value + "/compartir?text=" + Uri.encode(shared));
                    return;
                }
            }
        }
        if (web.getUrl() == null) web.loadUrl(origin.value + "/");
    }

    @Override public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    private void cancelMedia(boolean downloadsOnly) {
        MediaOperation current = activeMedia.get();
        if (current != null && (!downloadsOnly || "DOWNLOAD".equals(current.action))) current.guard.cancel();
    }
    private void cancelPreviews() { for (DownloadGuard guard : previewJobs.values()) guard.cancel(); }
    @Override protected void onStop() { cancelMedia(true); cancelPreviews(); super.onStop(); }
    @Override protected void onDestroy() {
        documentGeneration++; cancelMedia(false); cancelPreviews(); workers.shutdownNow();
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
