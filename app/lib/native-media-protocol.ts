import { NativeCheckError, parseCheckRequest, type CheckRequest } from "./native-protocol";

export type MediaAction = "DOWNLOAD" | "OPEN";
export type MediaRequest = Omit<CheckRequest, "type"> & { type: MediaAction };
export type AuthorizedRequest = CheckRequest | MediaRequest;
export type MediaStage = "authorizing" | "downloading" | "merging" | "saving";
export type MediaResult = { type: "AVAILABLE"; width?: number; height?: number } | { type: "OPENED" };

export function parseAuthorizedRequest(value: unknown): AuthorizedRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new NativeCheckError("BAD_REQUEST");
  const m = value as Record<string, unknown>;
  if (m.type !== "CHECK" && m.type !== "DOWNLOAD" && m.type !== "OPEN") throw new NativeCheckError("UNSUPPORTED_ACTION");
  return { ...parseCheckRequest({ ...m, type: "CHECK" }), type: m.type };
}

// Shared UI/server policy. The server resolves the URL from the owned row.
export function downloadSource(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048 || /[\s\\]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const host = url.hostname;
    const instagram = ["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host) &&
      /^\/(?:reel|reels|p)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    const tiktok = ["tiktok.com", "www.tiktok.com", "m.tiktok.com"].includes(host) &&
      /^\/@[A-Za-z0-9._-]+\/video\/\d+\/?$/.test(url.pathname);
    const short = ["vm.tiktok.com", "vt.tiktok.com"].includes(host) && /^\/[A-Za-z0-9_-]+\/?$/.test(url.pathname);
    if (!instagram && !tiktok && !short) return null;
    url.search = ""; url.hash = "";
    return url.href;
  } catch { return null; }
}
