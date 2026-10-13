import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../types/technique";
import { fetchVideoMetadata } from "../../lib/metadata-provider.server";

export const runtime = "nodejs";
export const maxDuration = 30;

function reply(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer \S+$/.test(authorization) || authorization.length > 8192) {
    return reply({ error: "Inicia sesión para completar la ficha." }, 401);
  }
  let body: { id?: unknown; refresh?: unknown };
  try {
    // La petición solo transporta un UUID y un booleano, nunca archivos ni URLs.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    let content = "";
    const decoder = new TextDecoder();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        content += decoder.decode(value, { stream: true });
        if (content.length > 512) throw new Error();
      }
    } finally { await reader.cancel(); }
    body = JSON.parse(content);
    if (!body || typeof body.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.id) ||
      (body.refresh !== undefined && typeof body.refresh !== "boolean")) throw new Error();
  } catch { return reply({ error: "La petición de metadatos no es válida." }, 400); }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return reply({ error: "Falta configurar Supabase en este despliegue." }, 503);

  try {
    // Usa el permiso del usuario. No requiere una clave service_role.
    const db = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        headers: { Authorization: authorization },
        fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(5000) }),
      },
    });
    const { data: identity, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !identity.user) return reply({ error: "Tu sesión expiró. Vuelve a iniciar sesión." }, 401);

    const { data: claim, error: claimError } = await db.rpc("claim_video_metadata", {
      p_id: body.id as string, p_refresh: body.refresh === true,
    });
    if (claimError) {
      if (claimError.code === "42501") return reply({ error: "Este enlace no está disponible en tu cuenta." }, 404);
      if (claimError.message.includes("RATE_LIMIT")) return reply({ error: "Ya consultamos varias fichas. Vuelve a actualizar la biblioteca en un minuto." }, 429);
      return reply({ error: "No pudimos preparar los metadatos. Comprueba que ejecutaste 02-video-metadata.sql." }, 503);
    }
    if (!claim?.claimed) return reply({ metadata: claim?.metadata ?? null });
    if (!claim.url || !claim.token) throw new Error("invalid_claim");

    const result = await fetchVideoMetadata(claim.url);
    const { data: metadata, error: finishError } = await db.rpc("finish_video_metadata", {
      p_id: body.id as string, p_token: claim.token, p_status: result.status, p_reason: result.reason,
      p_title: result.title, p_author: result.author, p_thumbnail: result.thumbnail_url,
    });
    if (finishError) throw finishError;
    return reply({ metadata });
  } catch {
    return reply({ error: "La consulta se interrumpió. El enlace sigue guardado; puedes reintentar desde la biblioteca." }, 503);
  }
}
