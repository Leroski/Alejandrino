package cl.alejandrino.nativeapp;

/** One foreground operation. No credentials or URLs are kept in this guard. */
public final class DownloadGuard {
    private boolean cancelled;
    private final long deadline;
    public DownloadGuard(long timeoutMillis) { deadline = System.nanoTime() + timeoutMillis * 1_000_000L; }
    public synchronized void cancel() { cancelled = true; }
    public synchronized boolean isStopped() { return cancelled || System.nanoTime() >= deadline; }
    public synchronized void ensureActive() throws NativeCheckService.Failure {
        if (cancelled) throw new NativeCheckService.Failure("CANCELLED");
        if (System.nanoTime() >= deadline) throw new NativeCheckService.Failure("TIMEOUT");
    }
}
