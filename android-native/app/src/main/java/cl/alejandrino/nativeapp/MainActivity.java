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
import java.util.regex.Pattern;

/** CHECK-only shell: no downloader, file writes, or unverified index access. */
public final class MainActivity extends Activity {
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(6));
    private WebView web;
    private FrameLayout webContainer;
    private AllowedOrigin origin;
    private NativeCheckService checks;
    private int documentGeneration;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            origin = new AllowedOrigin(BuildConfig.ALEJANDRINO_WEB_URL);
            checks = new NativeCheckService(new NativeAuthorizer(origin), new LocalFileIndex(this));
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
                documentGeneration++;
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
    @Override protected void onDestroy() {
        documentGeneration++; workers.shutdownNow();
        if (web != null) { web.destroy(); web = null; }
        super.onDestroy();
    }
}
