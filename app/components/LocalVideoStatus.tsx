"use client";

import { useEffect, useRef, useState } from "react";
import { checkLocalVideo, runLocalMedia, useNativeAndroid, useNativeMedia } from "../lib/native-bridge";
import { NativeCheckError, type LocalVideoStatus as Status } from "../lib/native-protocol";
import { downloadSource, type MediaStage } from "../lib/native-media-protocol";
import { getSupabase } from "../lib/supabase";

const stageText: Record<MediaStage, string> = {
  authorizing: "Verificando ficha…", downloading: "Descargando video…",
  merging: "Uniendo audio y video…", saving: "Guardando en el dispositivo…",
};
export default function LocalVideoStatus({ userId, techniqueId, sourceUrl, disabled, availability, onLocalChange }: {
  userId: string; techniqueId: string; sourceUrl: string; disabled: boolean;
  availability?: { available: boolean }; onLocalChange?: () => void;
}) {
  const native = useNativeAndroid();
  const media = useNativeMedia();
  const pending = useRef<AbortController | null>(null);
  const [state, setState] = useState<"idle" | Status | "error">("idle");
  const [busy, setBusy] = useState<"CHECK" | "DOWNLOAD" | "OPEN" | null>(null);
  const [stage, setStage] = useState<MediaStage>("authorizing");
  const [error, setError] = useState("");
  const [quality, setQuality] = useState("");
  const [previousAvailability, setPreviousAvailability] = useState(availability);
  // Each new preview supersedes older operations; a later CHECK/OPEN can still win.
  if (availability !== previousAvailability) {
    setPreviousAvailability(availability);
    setState("idle");
  }
  useEffect(() => {
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) pending.current?.abort();
    });
    return () => {
      subscription.unsubscribe();
      const current = pending.current; pending.current = null; current?.abort();
    };
  }, [userId]);

  async function run(action: "CHECK" | "DOWNLOAD" | "OPEN") {
    if (pending.current || disabled) return;
    const controller = new AbortController(); pending.current = controller;
    setBusy(action); setStage("authorizing"); setError("");
    let sessionTimedOut = false;
    const deadline = window.setTimeout(() => { sessionTimedOut = true; controller.abort(); }, 25000);
    try {
      const sessionResult = await Promise.race([
        getSupabase().auth.getSession(),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort",
          () => reject(new NativeCheckError("CANCELLED")), { once: true })),
      ]);
      clearTimeout(deadline);
      const session = sessionResult.data.session;
      if (sessionResult.error || !session) throw new NativeCheckError("AUTH_REQUIRED");
      if (session.user.id !== userId) throw new NativeCheckError("SESSION_MISMATCH");
      const input = { userId, techniqueId, accessToken: session.access_token };
      if (action === "CHECK") {
        const status = await checkLocalVideo(input, controller.signal);
        if (!controller.signal.aborted) { setState(status); onLocalChange?.(); }
      } else {
        const result = await runLocalMedia(action, input, controller.signal, next => {
          if (pending.current === controller && !controller.signal.aborted) setStage(next);
        });
        if (!controller.signal.aborted) {
          setState("available");
          if (result.type === "AVAILABLE" && result.width && result.height) setQuality(`${result.width} × ${result.height} · con audio`);
          if (action === "DOWNLOAD") onLocalChange?.();
        }
      }
    } catch (cause) {
      if (pending.current === controller) {
        setState("error");
        if (cause instanceof NativeCheckError && cause.code === "LOCAL_MISSING") onLocalChange?.();
        setError(sessionTimedOut ? new NativeCheckError("TIMEOUT").message :
          cause instanceof NativeCheckError ? cause.message : new NativeCheckError("UNAVAILABLE").message);
      }
    } finally {
      clearTimeout(deadline);
      if (pending.current === controller) { pending.current = null; setBusy(null); }
    }
  }

  if (!native) return null;
  const visibleState = state === "idle" && availability ? availability.available ? "available" : "missing" : state;
  const button = "min-h-11 rounded-xl bg-zinc-800 px-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50";
  return <div className="mt-3 grid gap-2">
    <p role="status" aria-live="polite" className="text-sm text-zinc-300">
      {busy === "DOWNLOAD" ? stageText[stage] : busy === "CHECK" ? "Comprobando archivo local…" :
        busy === "OPEN" ? "Abriendo video local…" : visibleState === "available" ? "Disponible en este dispositivo" :
        visibleState === "missing" ? "No descargado en este dispositivo" : state === "error" ? error : "Archivo local sin comprobar"}
    </p>
    {quality && visibleState === "available" && <p className="text-xs text-zinc-400">{quality}</p>}
    {busy === "DOWNLOAD" && <>
      <p className="text-xs text-zinc-400">Mantén Alejandrino abierto. Al salir o bloquear el teléfono, la descarga se cancela y puedes reintentar.</p>
      <button type="button" className={button} onClick={() => pending.current?.abort()}>Cancelar descarga</button>
    </>}
    {media && visibleState === "available" && <button type="button" className={`${button} bg-emerald-900`}
      disabled={disabled || !!busy} onClick={() => void run("OPEN")}>Reproducir video local</button>}
    {media && visibleState !== "available" && downloadSource(sourceUrl) && <button type="button" className={`${button} bg-red-700`}
      disabled={disabled || !!busy} onClick={() => void run("DOWNLOAD")}>Descargar al dispositivo</button>}
    <button type="button" disabled={disabled || !!busy} onClick={() => void run("CHECK")} className={button}>
      {busy === "CHECK" ? "Comprobando…" : "Comprobar video local"}
    </button>
  </div>;
}
