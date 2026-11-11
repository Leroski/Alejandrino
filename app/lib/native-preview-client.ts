import { NativeCheckError, isNativeErrorCode, parseCheckRequest, type CheckRequest } from "./native-protocol";
import type { NativeBridge } from "./native-check-client";
import { safeThumbnail } from "../types/video-metadata";

export type NativePreview = {
  metadata: { title: string; author: string; description: string; thumbnail_url: string; duration: number };
  available: boolean; image: string; frame: number; duration: number; metadataFailed: boolean; frameFailed: boolean;
};
export type PreviewOptions = { refresh?: boolean; frame?: number };
type Request = Omit<CheckRequest, "type"> & { type: "PREVIEW" };
type Job = { request: Request; send: () => void; finish: (result?: NativePreview, error?: NativeCheckError) => void };

export function parseNativePreview(value: unknown): NativePreview {
  const bad = () => { throw new NativeCheckError("BAD_RESPONSE"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return bad();
  const v = value as Record<string, unknown>, m = v.metadata as Record<string, unknown> | undefined;
  if (!m || typeof m !== "object" || Array.isArray(m)) return bad();
  for (const [key, limit] of [["title", 500], ["author", 200], ["description", 2000], ["thumbnail_url", 4096]] as const)
    if (typeof m[key] !== "string" || m[key].length > limit) return bad();
  const duration = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 86400;
  if (!duration(v.duration) || !duration(m.duration) || !Number.isInteger(v.frame) ||
      Number(v.frame) < 0 || Number(v.frame) > 2 ||
      typeof v.available !== "boolean" || typeof v.metadataFailed !== "boolean" || typeof v.frameFailed !== "boolean") return bad();
  if (typeof v.image !== "string" || v.image.length > 131100 ||
      (v.image !== "" && (!v.available || !/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/]*={0,2}$/.test(v.image)))) return bad();
  return { metadata: { title: m.title as string, author: m.author as string, description: m.description as string,
    thumbnail_url: safeThumbnail(m.thumbnail_url), duration: m.duration },
    available: v.available, image: v.image, frame: Number(v.frame), duration: v.duration,
    metadataFailed: v.metadataFailed, frameFailed: v.frameFailed };
}

/** One active request: loading visible cards must not flood the Android worker pool. */
export class NativePreviewClient {
  private queue: Job[] = [];
  private active: Job | undefined;
  constructor(private readonly bridge: NativeBridge, private readonly timeoutMs = 65000) {
    bridge.onmessage = event => this.receive(event.data);
  }
  run(input: { userId: string; techniqueId: string; accessToken: string }, options: PreviewOptions,
      signal: AbortSignal): Promise<NativePreview> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new NativeCheckError("CANCELLED")); return; }
      if (this.queue.length >= 32) { reject(new NativeCheckError("BUSY")); return; }
      const request: Request = { ...parseCheckRequest({ protocolVersion: 1, type: "CHECK", requestId: crypto.randomUUID(),
        userId: input.userId, techniqueId: input.techniqueId }), type: "PREVIEW" };
      if (!/^[A-Za-z0-9._~-]{1,8192}$/.test(input.accessToken)) { reject(new NativeCheckError("AUTH_REQUIRED")); return; }
      if ((options.frame !== undefined && (!Number.isInteger(options.frame) || options.frame < 0 || options.frame > 2)) ||
          (options.refresh !== undefined && typeof options.refresh !== "boolean")) {
        reject(new NativeCheckError("BAD_REQUEST")); return;
      }
      let timer: ReturnType<typeof setTimeout> | undefined, settled = false;
      const finish: Job["finish"] = (result, error) => {
        if (settled) return;
        settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
        this.queue = this.queue.filter(item => item !== job);
        if (this.active === job) {
          this.active = undefined;
          if (error) try { this.bridge.postMessage(JSON.stringify({ ...request, type: "CANCEL" })); } catch { /* Already settled. */ }
        }
        if (error) reject(error); else resolve(result!);
        queueMicrotask(() => this.pump());
      };
      const abort = () => finish(undefined, new NativeCheckError("CANCELLED"));
      const job: Job = { request, finish, send: () => {
        timer = setTimeout(() => finish(undefined, new NativeCheckError("TIMEOUT")), this.timeoutMs);
        try { this.bridge.postMessage(JSON.stringify({ ...request, ...options, accessToken: input.accessToken })); }
        catch { finish(undefined, new NativeCheckError("UNAVAILABLE")); }
      } };
      signal.addEventListener("abort", abort, { once: true });
      this.queue.push(job); this.pump();
    });
  }
  private pump() {
    if (this.active || !this.queue.length) return;
    this.active = this.queue.shift()!; this.active.send();
  }
  private receive(raw: unknown) {
    if (typeof raw !== "string" || raw.length > 180000 || !this.active) return;
    let value: Record<string, unknown>;
    try { value = JSON.parse(raw); } catch { return; }
    if (!value || typeof value !== "object" || value.requestId !== this.active.request.requestId) return;
    const { request, finish } = this.active;
    if (value.protocolVersion !== 1 || value.action !== "PREVIEW" || value.userId !== request.userId ||
        value.techniqueId !== request.techniqueId) { finish(undefined, new NativeCheckError("BAD_RESPONSE")); return; }
    if (value.type === "ERROR" && isNativeErrorCode(value.errorCode)) { finish(undefined, new NativeCheckError(value.errorCode)); return; }
    try {
      if (value.type !== "PREVIEW_RESULT") throw new NativeCheckError("BAD_RESPONSE");
      finish(parseNativePreview(value.preview));
    } catch { finish(undefined, new NativeCheckError("BAD_RESPONSE")); }
  }
}
