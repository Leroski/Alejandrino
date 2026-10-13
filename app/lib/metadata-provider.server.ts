import { safeThumbnail, type MetadataResult } from "../types/video-metadata";

const empty = { title: "", author: "", thumbnail_url: "" };
const unavailable = (reason: MetadataResult["reason"]): MetadataResult => ({ ...empty, status: "unavailable", reason });
const temporary = (): MetadataResult => ({ ...empty, status: "error", reason: "temporary" });
const tiktokHosts = new Set(["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com", "vt.tiktok.com"]);
const youtubeHosts = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "www.youtu.be"]);
const belongs = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

function webUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || value.length > 2048) return null;
    url.protocol = "https:";
    url.hash = "";
    return url;
  } catch { return null; }
}

export function youtubeVideoUrl(url: URL): string | null {
  if (!youtubeHosts.has(url.hostname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const id = belongs(url.hostname, "youtu.be") ? parts[0]
    : url.pathname === "/watch" ? url.searchParams.get("v")
    : ["shorts", "embed", "live"].includes(parts[0]) ? parts[1] : null;
  return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function tiktokVideoUrl(url: URL): string | null {
  if (!tiktokHosts.has(url.hostname)) return null;
  const match = url.pathname.match(/^\/@([\w.-]+)\/video\/(\d{10,25})\/?$/);
  return match ? `https://www.tiktok.com/@${match[1]}/video/${match[2]}` : null;
}

function isTikTokShort(url: URL): boolean {
  if (!tiktokHosts.has(url.hostname)) return false;
  if (["vm.tiktok.com", "vt.tiktok.com"].includes(url.hostname)) return /^\/[A-Za-z0-9]+\/?$/.test(url.pathname);
  return /^\/t\/[A-Za-z0-9]+\/?$/.test(url.pathname);
}

// Nunca sigue una redirección sin comprobar su destino; no consulta URLs arbitrarias.
async function resolveTikTok(url: URL, fetcher: typeof fetch, signal: AbortSignal): Promise<string | null> {
  for (let hop = 0; hop < 4; hop++) {
    const canonical = tiktokVideoUrl(url);
    if (canonical) return canonical;
    if (!isTikTokShort(url)) return null;
    const response = await fetcher(url.href, { method: "GET", redirect: "manual", signal, cache: "no-store" });
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (response.status === 429 || response.status >= 500) throw new Error("provider_unavailable");
    if (![301, 302, 303, 307, 308].includes(response.status) || !location) return null;
    const next = webUrl(new URL(location, url).href);
    if (!next || !tiktokHosts.has(next.hostname)) return null;
    url = next;
  }
  return tiktokVideoUrl(url);
}

// Limita también las respuestas sin Content-Length y las respuestas descomprimidas.
async function readJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("empty_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error("response_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  const text = value.toWellFormed().replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return Array.from(text).slice(0, limit).join("");
}

export async function fetchVideoMetadata(value: string, fetcher: typeof fetch = fetch): Promise<MetadataResult> {
  const url = webUrl(value);
  if (!url) return unavailable("unsupported");
  if (belongs(url.hostname, "instagram.com")) return unavailable("instagram");
  const signal = AbortSignal.timeout(8000);
  try {
    let endpoint: URL;
    if (youtubeHosts.has(url.hostname)) {
      const video = youtubeVideoUrl(url);
      if (!video) return unavailable("not_found");
      endpoint = new URL("https://www.youtube.com/oembed");
      endpoint.searchParams.set("url", video);
      endpoint.searchParams.set("format", "json");
    } else if (tiktokHosts.has(url.hostname)) {
      const video = await resolveTikTok(url, fetcher, signal);
      if (!video) return unavailable("not_found");
      endpoint = new URL("https://www.tiktok.com/oembed");
      endpoint.searchParams.set("url", video);
    } else return unavailable("unsupported");

    const response = await fetcher(endpoint.href, {
      headers: { Accept: "application/json" }, redirect: "error", cache: "no-store", signal,
    });
    if (!response.ok) {
      await response.body?.cancel();
      return [400, 404, 410].includes(response.status) ? unavailable("not_found") : temporary();
    }
    const value: unknown = await readJson(response);
    if (!value || typeof value !== "object" || Array.isArray(value)) return temporary();
    const json = value as Record<string, unknown>;
    // Nunca devuelve ni ejecuta el campo HTML proporcionado por oEmbed.
    const result = { title: cleanText(json.title, 1000), author: cleanText(json.author_name, 200),
      thumbnail_url: safeThumbnail(json.thumbnail_url) };
    return Object.values(result).some(Boolean) ? { ...result, status: "ready", reason: "" } : unavailable("not_found");
  } catch { return temporary(); }
}
