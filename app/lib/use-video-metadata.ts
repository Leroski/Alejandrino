"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VideoMetadata } from "../types/video-metadata";
import { listVideoMetadata, MetadataRequestError, requestVideoMetadata } from "./video-metadata";

// Vive aparte de las mutaciones de técnicas: una consulta lenta no bloquea Guardar.
export function useVideoMetadata(ids: string[], userId: string, reload: number) {
  const [items, setItems] = useState<Record<string, VideoMetadata>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const [poll, setPoll] = useState(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(new Set<string>());
  const key = ids.join(",");

  const requestOne = useCallback(async (id: string, refresh: boolean, current: number, signal: AbortSignal) => {
    const requestKey = `${current}:${id}`;
    if (inFlight.current.has(requestKey)) return;
    inFlight.current.add(requestKey);
    if (!signal.aborted) setRunning(values => ({ ...values, [id]: true }));
    try {
      const item = await requestVideoMetadata(id, userId, refresh, signal);
      if (current === generation.current && !signal.aborted && item) {
        setItems(values => ({ ...values, [id]: item }));
        if (refresh) setMessage(item.status === "processing"
          ? "Esta ficha se está consultando. Se actualizará al terminar."
          : "Ficha consultada. Si acababas de solicitarla, conservamos el resultado para evitar consultas repetidas.");
      }
    } finally {
      inFlight.current.delete(requestKey);
      if (current === generation.current && !signal.aborted) setRunning(values => ({ ...values, [id]: false }));
    }
  }, [userId]);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const current = ++generation.current;
    const techniqueIds = key ? key.split(",") : [];
    let stopped = false;
    void (async () => {
      const rows = await listVideoMetadata(techniqueIds, abort.signal);
      if (abort.signal.aborted) return;
      setRunning({});
      setMessage("");
      const byId = Object.fromEntries(rows.map(row => [row.technique_id, row]));
      setItems(byId);
      const due = techniqueIds.filter(id => {
        const item = byId[id];
        return !item || (["processing", "error"].includes(item.status) && Date.parse(item.retry_at) <= Date.now());
      });
      let offset = 0;
      // Dos peticiones como máximo por biblioteca abierta.
      const worker = async () => {
        while (!abort.signal.aborted && !stopped && offset < due.length) {
          const id = due[offset++];
          try { await requestOne(id, false, current, abort.signal); }
          catch (cause) {
            if (abort.signal.aborted) return;
            stopped = true;
            setMessage(cause instanceof MetadataRequestError ? cause.message : "No pudimos completar las vistas previas. Tus enlaces siguen guardados.");
          }
        }
      };
      await Promise.all([worker(), worker()]);

    })().catch(() => {
      if (!abort.signal.aborted) {
        setRunning({});
        setMessage("No pudimos cargar las vistas previas. Puedes seguir guardando enlaces. Comprueba la conexión y la instalación del bloque de metadatos.");
      }
    });
    return () => abort.abort();
  }, [key, userId, reload, poll, requestOne]);

  useEffect(() => {
    const pending = Object.values(items).filter(row => row.status === "processing");
    if (!pending.length) return;
    const next = Math.min(...pending.map(row => Date.parse(row.retry_at)));
    const timer = setTimeout(() => setPoll(value => value + 1), Math.max(3000, next - Date.now() + 1000));
    return () => clearTimeout(timer);
  }, [items]);

  const refreshOne = useCallback(async (id: string) => {
    const abort = controller.current;
    if (!abort || abort.signal.aborted) return;
    setMessage("");
    try { await requestOne(id, true, generation.current, abort.signal); }
    catch (cause) {
      if (!abort.signal.aborted) setMessage(cause instanceof Error ? cause.message : "No pudimos actualizar la ficha.");
    }
  }, [requestOne]);

  return { metadata: items, metadataRunning: running, metadataMessage: message, refreshMetadata: refreshOne };
}
