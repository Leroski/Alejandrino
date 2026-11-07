import { isNativeErrorCode, NativeCheckError, parseCheckRequest, type CheckRequest, type LocalVideoStatus } from "./native-protocol";

export type NativeBridge = {
  postMessage: (message: string) => void;
  onmessage: ((event: { data: unknown }) => void) | null;
};
type Pending = { request: CheckRequest; finish: (status?: LocalVideoStatus, error?: NativeCheckError) => void };

export class NativeCheckClient {
  private readonly pending = new Map<string, Pending>();
  constructor(private readonly bridge: NativeBridge, private readonly timeoutMs = 20000) {
    bridge.onmessage = event => this.receive(event.data);
  }

  check(input: { userId: string; techniqueId: string; accessToken: string }, signal: AbortSignal): Promise<LocalVideoStatus> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new NativeCheckError("CANCELLED")); return; }
      if (this.pending.size >= 8) { reject(new NativeCheckError("BUSY")); return; }
      const request = parseCheckRequest({ protocolVersion: 1, type: "CHECK", requestId: crypto.randomUUID(),
        userId: input.userId, techniqueId: input.techniqueId });
      if (!/^[A-Za-z0-9._~-]{1,8192}$/.test(input.accessToken)) {
        reject(new NativeCheckError("AUTH_REQUIRED")); return;
      }
      const finish: Pending["finish"] = (status, error) => {
        if (!this.pending.delete(request.requestId)) return;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        if (error) reject(error);
        else resolve(status!);
      };
      const abort = () => finish(undefined, new NativeCheckError("CANCELLED"));
      const timer = setTimeout(() => finish(undefined, new NativeCheckError("TIMEOUT")), this.timeoutMs);
      // Register before posting: even a synchronous reply must find its request.
      this.pending.set(request.requestId, { request, finish });
      signal.addEventListener("abort", abort, { once: true });
      try { this.bridge.postMessage(JSON.stringify({ ...request, accessToken: input.accessToken })); }
      catch { finish(undefined, new NativeCheckError("UNAVAILABLE")); }
    });
  }

  private receive(raw: unknown) {
    if (typeof raw !== "string" || raw.length > 4096) return;
    let value: Record<string, unknown>;
    try { value = JSON.parse(raw); } catch { return; }
    if (!value || typeof value !== "object" || typeof value.requestId !== "string") return;
    const entry = this.pending.get(value.requestId);
    if (!entry) return; // Includes stale replies after cancellation/account changes.
    const { request, finish } = entry;
    if (value.protocolVersion !== 1) { finish(undefined, new NativeCheckError("UNSUPPORTED_VERSION")); return; }
    if (value.userId !== request.userId || value.techniqueId !== request.techniqueId) {
      finish(undefined, new NativeCheckError("BAD_RESPONSE")); return;
    }
    if (value.type === "ERROR" && isNativeErrorCode(value.errorCode)) {
      finish(undefined, new NativeCheckError(value.errorCode));
    } else if (value.type === "AVAILABILITY" && (value.status === "missing" || value.status === "available")) {
      finish(value.status);
    } else finish(undefined, new NativeCheckError("BAD_RESPONSE"));
  }
}
