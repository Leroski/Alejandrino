import { getSupabase } from "./supabase";
import type { VideoMetadata } from "../types/video-metadata";

const columns = "technique_id,user_id,status,reason,title,author,thumbnail_url,attempted_at,retry_at" as const;

export class MetadataRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function listVideoMetadata(ids: string[], signal: AbortSignal): Promise<VideoMetadata[]> {
  const all: VideoMetadata[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await getSupabase().from("video_metadata").select(columns)
      .in("technique_id", ids.slice(offset, offset + 100)).abortSignal(signal);
    if (error) throw error;
    all.push(...data);
  }
  return all;
}

export async function requestVideoMetadata(id: string, userId: string, refresh = false, signal?: AbortSignal): Promise<VideoMetadata | null> {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session || data.session.user.id !== userId) {
    throw new MetadataRequestError("Vuelve a iniciar sesión para consultar la vista previa.", 401);
  }
  const response = await fetch("/api/video-metadata", {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: JSON.stringify({ id, refresh }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(28000)]) : AbortSignal.timeout(28000),
  });
  let body: { metadata?: VideoMetadata | null; error?: string };
  try { body = await response.json(); }
  catch { throw new MetadataRequestError("No pudimos leer la vista previa. El enlace sigue guardado.", response.status); }
  if (!response.ok) throw new MetadataRequestError(body.error || "No pudimos consultar la vista previa.", response.status);
  return body.metadata ?? null;
}
