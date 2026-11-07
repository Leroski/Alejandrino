"use client";

import { useEffect, useRef, useState } from "react";
import { checkLocalVideo, useNativeAndroid } from "../lib/native-bridge";
import { NativeCheckError, type LocalVideoStatus as Status } from "../lib/native-protocol";
import { getSupabase } from "../lib/supabase";

export default function LocalVideoStatus({ userId, techniqueId, disabled }: {
  userId: string; techniqueId: string; disabled: boolean;
}) {
  const native = useNativeAndroid();
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | "checking" | Status | "error">("idle");
  const [error, setError] = useState("");
  useEffect(() => () => {
    const current = pending.current;
    pending.current = null;
    current?.abort();
  }, []);

  async function check() {
    if (pending.current || disabled) return;
    const controller = new AbortController();
    pending.current = controller;
    setState("checking"); setError("");
    // Bound the session lookup as well as the native request.
    const deadline = window.setTimeout(() => controller.abort(), 25000);
    try {
      const sessionResult = await Promise.race([
        getSupabase().auth.getSession(),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort",
          () => reject(new NativeCheckError("TIMEOUT")), { once: true })),
      ]);
      const session = sessionResult.data.session;
      if (sessionResult.error || !session) throw new NativeCheckError("AUTH_REQUIRED");
      if (session.user.id !== userId) throw new NativeCheckError("SESSION_MISMATCH");
      const status = await checkLocalVideo({ userId, techniqueId, accessToken: session.access_token }, controller.signal);
      if (!controller.signal.aborted) setState(status);
    } catch (cause) {
      // Unmounted cards must never receive a late result from the previous account.
      if (pending.current === controller) {
        setState("error");
        setError(controller.signal.aborted ? new NativeCheckError("TIMEOUT").message :
          cause instanceof NativeCheckError ? cause.message : new NativeCheckError("UNAVAILABLE").message);
      }
    } finally {
      clearTimeout(deadline);
      if (pending.current === controller) pending.current = null;
    }
  }

  if (!native) return null;
  return <div className="mt-3 grid gap-2">
    <p role="status" className="text-sm text-zinc-300">
      {state === "available" ? "Disponible en este dispositivo" : state === "missing" ? "No descargado en este dispositivo" :
        state === "checking" ? "Comprobando archivo local…" : state === "error" ? error : "Archivo local sin comprobar"}
    </p>
    <button type="button" disabled={disabled || state === "checking"} onClick={() => void check()}
      className="min-h-11 rounded-xl bg-zinc-800 px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50">
      {state === "checking" ? "Comprobando…" : "Comprobar video local"}
    </button>
  </div>;
}
