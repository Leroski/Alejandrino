"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { readLocalPreview, useNativePreview } from "./native-bridge";
import { NativeCheckError } from "./native-protocol";
import type { NativePreview, PreviewOptions } from "./native-preview-client";
import { downloadSource } from "./native-media-protocol";
import { getSupabase } from "./supabase";
import { claimPreviewRefresh, needsPreviewMetadata } from "./preview-refresh-policy";

export function useLocalPreview(userId: string, techniqueId: string, sourceUrl: string) {
  const supported = useNativePreview() && !!downloadSource(sourceUrl);
  const element = useRef<HTMLElement | null>(null);
  const pending = useRef<AbortController | null>(null);
  const [preview, setPreview] = useState<NativePreview>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (options: PreviewOptions = {}) => {
    if (!supported) return;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setBusy(true); setError("");
    let timeout = false;
    const deadline = setTimeout(() => { timeout = true; controller.abort(); }, 90000);
    const aborted = () => new NativeCheckError(timeout ? "TIMEOUT" : "CANCELLED");
    let rejectSession: (() => void) | undefined;
    try {
      const result = await Promise.race([
        getSupabase().auth.getSession(),
        new Promise<never>((_, reject) => {
          rejectSession = () => reject(aborted());
          controller.signal.addEventListener("abort", rejectSession, { once: true });
        }),
      ]);
      if (controller.signal.aborted) throw aborted();
      const session = result.data.session;
      if (result.error || !session) throw new NativeCheckError("AUTH_REQUIRED");
      if (session.user.id !== userId) throw new NativeCheckError("SESSION_MISMATCH");
      const input = { userId, techniqueId, accessToken: session.access_token };
      const key = `${userId}:${techniqueId}:${sourceUrl}`;
      if (options.refresh) claimPreviewRefresh(key, true);
      let value = await readLocalPreview(input, options, controller.signal);
      if (!controller.signal.aborted && pending.current === controller) setPreview(value);
      // Show cached/offline data immediately, then fill missing context automatically once.
      if (!controller.signal.aborted && !options.refresh && options.frame === undefined &&
          needsPreviewMetadata(value) && claimPreviewRefresh(key)) {
        value = await readLocalPreview(input, { refresh: true }, controller.signal);
      }
      if (!controller.signal.aborted && pending.current === controller) {
        setPreview(value);
        if (value.metadataFailed) setError("No pudimos actualizar los datos del proveedor. Conservamos la vista previa disponible.");
        else if (value.frameFailed) setError("No pudimos obtener esta portada. Puedes intentar otra; tu video sigue guardado.");
      }
    } catch (cause) {
      if (pending.current === controller) {
        // Do not retain a private image after an authorization failure.
        if (cause instanceof NativeCheckError && ["AUTH_REQUIRED", "SESSION_MISMATCH", "NOT_FOUND"].includes(cause.code)) setPreview(undefined);
        setError(timeout ? new NativeCheckError("TIMEOUT").message :
          cause instanceof NativeCheckError ? cause.message : "No pudimos cargar la vista previa.");
      }
    } finally {
      clearTimeout(deadline);
      if (rejectSession) controller.signal.removeEventListener("abort", rejectSession);
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }, [supported, userId, techniqueId, sourceUrl]);

  useEffect(() => {
    if (!supported) return;
    const { data: { subscription } } = getSupabase().auth.onAuthStateChange((_event, session) => {
      if (session?.user.id !== userId) {
        pending.current?.abort(); pending.current = null;
        setPreview(undefined); setBusy(false); setError("");
      }
    });
    return () => { subscription.unsubscribe(); pending.current?.abort(); pending.current = null; };
  }, [supported, userId]);

  useEffect(() => {
    if (!supported || !element.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: "100px" });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [supported, load]);

  const attach = useCallback((node: HTMLElement | null) => { element.current = node; }, []);
  return { attach, preview, supported, busy, error, load };
}
