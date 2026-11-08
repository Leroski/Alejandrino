package cl.alejandrino.nativeapp;

import android.app.Activity;
import android.app.AlertDialog;
import android.net.Uri;
import android.os.Bundle;
import android.widget.FrameLayout;
import android.widget.MediaController;
import android.widget.VideoView;

/** Internal player: only an authorized native OPEN can launch this unexported activity. */
public final class PlaybackActivity extends Activity {
    private VideoView video;
    private int position;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        String value = getIntent().getStringExtra("localVideo");
        Uri uri = value == null ? null : Uri.parse(value);
        if (uri == null || !LocalFileIndex.isMediaUri(uri)) { finish(); return; }
        position = state == null ? 0 : state.getInt("position", 0);
        FrameLayout frame = new FrameLayout(this);
        frame.setBackgroundColor(android.graphics.Color.BLACK);
        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        video = new VideoView(this);
        frame.addView(video, new FrameLayout.LayoutParams(-1, -1, android.view.Gravity.CENTER));
        MediaController controls = new MediaController(this);
        controls.setAnchorView(video); video.setMediaController(controls);
        video.setOnPreparedListener(media -> { video.seekTo(position); video.start(); });
        video.setOnErrorListener((player, what, extra) -> {
            new AlertDialog.Builder(this).setMessage("No se pudo reproducir este archivo. Vuelve a comprobarlo en la biblioteca.")
                .setPositiveButton("Volver", (dialog, which) -> finish()).setOnCancelListener(dialog -> finish()).show();
            return true;
        });
        setContentView(frame); video.setVideoURI(uri);
    }
    @Override protected void onPause() { if (video != null) { position = video.getCurrentPosition(); video.pause(); } super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (video != null) { video.seekTo(position); video.start(); } }
    @Override protected void onSaveInstanceState(Bundle state) { state.putInt("position", video == null ? position : video.getCurrentPosition()); super.onSaveInstanceState(state); }
    @Override protected void onDestroy() { if (video != null) video.stopPlayback(); super.onDestroy(); }
}
