import { NativeCheckError, isNativeErrorCode } from "./native-protocol";
import { parseAuthorizedRequest, type MediaAction, type MediaRequest, type MediaResult, type MediaStage } from "./native-media-protocol";
import type { NativeBridge } from "./native-check-client";

type Pending = { request: MediaRequest; progress: (stage: MediaStage) => void;
  finish: (result?: MediaResult, error?: NativeCheckError) => void };
export class NativeMediaClient {
  private readonly pending = new Map<string, Pending>();
  constructor(private readonly bridge: NativeBridge, private readonly downloadTimeout = 630000) {
    bridge.onmessage = event => this.receive(event.data);
  }
  run(action: MediaAction, input: { userId: string; techniqueId: string; accessToken: string },
      signal: AbortSignal, progress: (stage: MediaStage) => void): Promise<MediaResult> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new NativeCheckError("CANCELLED")); return; }
      if (this.pending.size >= 1) { reject(new NativeCheckError("BUSY")); return; }
      const request = parseAuthorizedRequest({ protocolVersion: 1, type: action, requestId: crypto.randomUUID(),
        userId: input.userId, techniqueId: input.techniqueId }) as MediaRequest;
      if (!/^[A-Za-z0-9._~-]{1,8192}$/.test(input.accessToken)) { reject(new NativeCheckError("AUTH_REQUIRED")); return; }
      const cancelNative = () => {
        try { this.bridge.postMessage(JSON.stringify({ ...request, type: "CANCEL" })); } catch { /* Local timeout still settles. */ }
      };
      const finish: Pending["finish"] = (result, error) => {
        if (!this.pending.delete(request.requestId)) return;
        clearTimeout(timer); signal.removeEventListener("abort", abort);
        if (error) { cancelNative(); reject(error); } else resolve(result!);
      };
      const abort = () => finish(undefined, new NativeCheckError("CANCELLED"));
      const timer = setTimeout(() => finish(undefined, new NativeCheckError("TIMEOUT")),
        action === "DOWNLOAD" ? this.downloadTimeout : 25000);
      this.pending.set(request.requestId, { request, progress, finish });
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
    if (!entry) return;
    const { request, progress, finish } = entry;
    if (value.protocolVersion !== 1 || value.userId !== request.userId || value.techniqueId !== request.techniqueId || value.action !== request.type) {
      finish(undefined, new NativeCheckError("BAD_RESPONSE")); return;
    }
    if (value.type === "ERROR" && isNativeErrorCode(value.errorCode)) finish(undefined, new NativeCheckError(value.errorCode));
    else if (value.type === "PROGRESS" && request.type === "DOWNLOAD" &&
      ["authorizing", "downloading", "merging", "saving"].includes(String(value.stage))) progress(value.stage as MediaStage);
    else if (value.type === "AVAILABLE" && request.type === "DOWNLOAD") {
      const validSize = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0 && n <= 16384;
      finish({ type: "AVAILABLE", ...(validSize(value.width) && validSize(value.height) ? { width: value.width, height: value.height } : {}) });
    } else if (value.type === "OPENED" && request.type === "OPEN") finish({ type: "OPENED" });
    else finish(undefined, new NativeCheckError("BAD_RESPONSE"));
  }
}
