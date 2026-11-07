import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/technique";
import { isUuid, NativeCheckError, parseCheckRequest, type CheckRequest, type NativeErrorCode } from "./native-protocol";

type ClientFactory = (authorization: string) => SupabaseClient<Database>;
function createUserClient(authorization: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !key.startsWith("sb_publishable_")) throw new NativeCheckError("UNAVAILABLE");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization },
      fetch: (input, init) => fetch(input, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(4000) }) },
  });
}

export async function authorizeNativeCheck(request: Request, createDb: ClientFactory = createUserClient): Promise<Response> {
  let identity: Partial<CheckRequest> = {};
  function reply(type: "AUTHORIZED" | "ERROR", status: number, errorCode?: NativeErrorCode) {
    return Response.json({ protocolVersion: 1, requestId: identity.requestId ?? "",
      userId: identity.userId ?? "", techniqueId: identity.techniqueId ?? "", type,
      ...(errorCode ? { errorCode } : {}) }, {
      status, headers: { "Cache-Control": "private, no-store", "Vary": "Authorization" },
    });
  }
  let message: CheckRequest;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new NativeCheckError("BAD_REQUEST");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2048) throw new NativeCheckError("BAD_REQUEST");
        chunks.push(value);
      }
    } finally { await reader.cancel(); }
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (value && typeof value === "object" && "requestId" in value && isUuid(value.requestId)) {
      identity = { requestId: value.requestId };
    }
    message = parseCheckRequest(value);
    identity = message;
  } catch (cause) {
    return reply("ERROR", 400, cause instanceof NativeCheckError ? cause.code : "BAD_REQUEST");
  }
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer [A-Za-z0-9._~-]{1,8192}$/.test(authorization)) return reply("ERROR", 401, "AUTH_REQUIRED");
  try {
    // The native client calls this endpoint over the configured HTTPS origin.
    // Verify the token with Auth; userId from JavaScript is not an authority.
    const db = createDb(authorization);
    const { data: { user }, error } = await db.auth.getUser(authorization.slice(7));
    if (error && ((error.status ?? 0) >= 500 || error.name === "AuthRetryableFetchError")) return reply("ERROR", 503, "UNAVAILABLE");
    if (error || !user || !isUuid(user.id)) return reply("ERROR", 401, "AUTH_REQUIRED");
    if (user.id.toLowerCase() !== message.userId) return reply("ERROR", 403, "SESSION_MISMATCH");
    const { data: row, error: queryError } = await db.from("techniques")
      .select("id,user_id").eq("id", message.techniqueId).eq("user_id", user.id).maybeSingle();
    if (queryError) return reply("ERROR", 503, "UNAVAILABLE");
    // RLS is used with this user's bearer token, never a service_role key.
    if (!row || row.id !== message.techniqueId || row.user_id !== user.id) return reply("ERROR", 404, "NOT_FOUND");
    return reply("AUTHORIZED", 200);
  } catch { return reply("ERROR", 503, "UNAVAILABLE"); }
}
