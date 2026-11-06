import { getSupabase } from "./supabase";
import { cleanField, type Technique, type TechniqueDraft } from "../types/technique";

export const LEGACY_KEY = "grappling-library-techniques";

export function extractUrl(text: string): string {
  const match = text.match(/https?:\/\/[^\s<>"“”]+/i);
  let candidate = (match?.[0] ?? text.trim()).replace(/[.,;!?)]+$/, "");
  if (candidate.startsWith("www.")) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error();
    if (url.href.length > 2048) throw new Error();
    return url.href;
  } catch { throw new Error("Pega un enlace http o https válido, de hasta 2048 caracteres."); }
}

/** Normaliza solo enlaces cuya identidad de publicación es conocida.
 * No cambiamos enlaces ajenos porque sus parámetros pueden ser significativos. */
export function canonicalVideoUrl(value: string): string {
  const parsed = new URL(extractUrl(value));
  const host = parsed.hostname.toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);
  const instagram = ["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host);
  if (instagram && segments.length >= 2 &&
      ["p", "reel", "reels", "tv"].includes(segments[0]) &&
      /^[a-zA-Z0-9_-]{5,32}$/.test(segments[1])) {
    return `https://www.instagram.com/${segments[0] === "reels" ? "reel" : segments[0]}/${segments[1]}/`;
  }
  if (["www.tiktok.com", "m.tiktok.com", "tiktok.com"].includes(host) &&
      segments.length >= 3 && segments[0].startsWith("@") &&
      segments[1] === "video" && /^\d{8,30}$/.test(segments[2])) {
    return `https://www.tiktok.com/${segments[0]}/video/${segments[2]}`;
  }
  if (["vm.tiktok.com", "vt.tiktok.com"].includes(host) &&
      segments.length >= 1 && /^[a-zA-Z0-9]+$/.test(segments[0])) {
    return `https://${host}/${segments[0]}/`;
  }
  return parsed.href;
}

/** Identidad de una publicación independiente de parámetros y forma del enlace.
 * Enlaces cortos distintos de TikTok pueden requerir resolver la redirección. */
export function socialVideoIdentity(value: string): string | null {
  try {
    const url = new URL(extractUrl(value));
    const host = url.hostname.toLowerCase();
    const segments = url.pathname.split("/").filter(Boolean);
    if (["instagram.com", "www.instagram.com", "m.instagram.com"].includes(host) &&
        segments.length >= 2 && ["p", "reel", "reels", "tv"].includes(segments[0]) &&
        /^[a-zA-Z0-9_-]{5,32}$/.test(segments[1])) {
      return `instagram:${segments[1]}`;
    }
    if (["www.tiktok.com", "m.tiktok.com", "tiktok.com"].includes(host) &&
        segments.length >= 3 && segments[1] === "video" &&
        /^\d{8,30}$/.test(segments[2])) {
      return `tiktok:${segments[2]}`;
    }
    if (["vm.tiktok.com", "vt.tiktok.com"].includes(host) &&
        segments.length >= 1 && /^[a-zA-Z0-9]+$/.test(segments[0])) {
      return `tiktok-short:${segments[0]}`;
    }
  } catch {
    return null;
  }
  return null;
}

export async function findExistingTechnique(userId: string, value: string): Promise<Technique | null> {
  const url = canonicalVideoUrl(value);
  const { data, error } = await getSupabase().from("techniques")
    .select("*").eq("user_id", userId).eq("url", url).maybeSingle();
  if (error) throw error;
  if (data) return data;

  const identity = socialVideoIdentity(url);
  if (!identity) return null;
  // Detecta fichas anteriores guardadas con igsh, utm o /p/ frente a /reel/.
  const items = await listTechniques(userId);
  return items.find(item => socialVideoIdentity(item.url) === identity) ?? null;
}

export function detectSource(value: string): string {
  const host = new URL(value).hostname.toLowerCase();
  const belongsTo = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (belongsTo("tiktok.com")) return "TikTok";
  if (belongsTo("instagram.com")) return "Instagram";
  if (belongsTo("youtube.com") || belongsTo("youtu.be")) return "YouTube";
  return "Otra plataforma";
}

export function draftFromText(text: string): TechniqueDraft {
  const url = canonicalVideoUrl(text);
  const source = detectSource(url);
  const stamp = new Date().toLocaleString("es-CL", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  });
  return { url, source, name: `${source} · ${stamp}`, discipline: "", position: "", category: "" };
}

export function searchable(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Pagina para no quedar limitado a los primeros 1000 registros de la API.
export async function listTechniques(userId: string, signal?: AbortSignal): Promise<Technique[]> {
  const result: Technique[] = [];
  const pageSize = 500;
  let cursor: Technique | undefined;
  for (;;) {
    let request = getSupabase().from("techniques").select("*").eq("user_id", userId)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .limit(pageSize);
    if (cursor) request = request.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    if (signal) request = request.abortSignal(signal);
    const { data, error } = await request;
    if (error) throw error;
    result.push(...data);
    if (data.length < pageSize) return result;
    cursor = data[data.length - 1];
  }
}

export async function addTechnique(userId: string, draft: TechniqueDraft) {
  if (await findExistingTechnique(userId, draft.url)) return null;
  // El índice único y ON CONFLICT evitan duplicados de URL canonizada incluso entre dispositivos.
  const { data, error } = await getSupabase().from("techniques")
    .upsert({ ...draft, user_id: userId }, { onConflict: "user_id,url", ignoreDuplicates: true })
    .select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function editTechnique(userId: string, item: Technique): Promise<Technique> {
  const { data, error } = await getSupabase().from("techniques").update({
    name: item.name.trim(), discipline: cleanField(item.discipline),
    position: cleanField(item.position), category: cleanField(item.category),
  }).eq("id", item.id).eq("user_id", userId).eq("revision", item.revision)
    .select("*").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Este video cambió o se eliminó en otro dispositivo. Pulsa Actualizar y vuelve a abrir su edición.");
  return data;
}

export async function deleteTechnique(userId: string, item: Technique): Promise<void> {
  const { data, error } = await getSupabase().from("techniques").delete()
    .eq("id", item.id).eq("user_id", userId).eq("revision", item.revision).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Este video cambió o se eliminó en otro dispositivo. Pulsa Actualizar antes de eliminarlo.");
}

// Valida toda la copia antes de subir algo. No modifica ni borra localStorage.
export function parseLegacy(raw: string | null): TechniqueDraft[] {
  if (raw === null) return [];
  let values: unknown;
  try { values = JSON.parse(raw); }
  catch { throw new Error("La copia local no se puede leer. No la borres: podemos recuperarla."); }
  if (!Array.isArray(values)) throw new Error("La copia local no contiene una lista válida.");
  const drafts = values.map((value: unknown, index) => {
    if (typeof value !== "object" || value === null) throw new Error(`El registro ${index + 1} no es válido.`);
    const item = value as Record<string, unknown>;
    const keys = ["name", "discipline", "position", "category", "source", "url"];
    if (!keys.every(key => typeof item[key] === "string")) throw new Error(`El registro ${index + 1} tiene campos ilegibles.`);
    const draft = draftFromText(item.url as string);
    draft.name = (item.name as string).trim() || draft.name;
    draft.discipline = cleanField(item.discipline as string);
    draft.position = cleanField(item.position as string);
    draft.category = cleanField(item.category as string);
    if ([draft.name, draft.discipline, draft.position, draft.category].some(value => value.length > 200)) {
      throw new Error(`El registro ${index + 1} tiene un campo de más de 200 caracteres. No se importó nada.`);
    }
    return draft;
  });
  // Si la copia ya repetía una URL, conserva primero la que tiene más metadatos.
  const unique = new Map<string, TechniqueDraft>();
  for (const draft of drafts) {
    const previous = unique.get(draft.url);
    const score = (item: TechniqueDraft) => [item.discipline, item.position, item.category].filter(Boolean).length;
    if (!previous || score(draft) > score(previous)) unique.set(draft.url, draft);
  }
  return [...unique.values()];
}

export async function importTechniques(userId: string, drafts: TechniqueDraft[]): Promise<number> {
  let count = 0;
  for (let offset = 0; offset < drafts.length; offset += 100) {
    const rows = drafts.slice(offset, offset + 100).map(draft => ({ ...draft, user_id: userId }));
    const { data, error } = await getSupabase().from("techniques")
      .upsert(rows, { onConflict: "user_id,url", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`La importación se interrumpió después de confirmar ${count} enlaces nuevos. Puedes repetirla: los ya guardados se omiten y la copia local sigue intacta.`);
    count += data.length;
  }
  return count;
}
