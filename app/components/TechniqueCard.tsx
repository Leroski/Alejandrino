"use client";

import { useEffect, useState, type FormEvent } from "react";
import { isNativeAndroid, sendNative, subscribeNative } from "../lib/native-bridge";
import { cleanField, isPending, type Technique } from "../types/technique";

import { metadataMessage, safeThumbnail, type VideoMetadata } from "../types/video-metadata";

type Props = {
  metadata?: VideoMetadata;
  metadataBusy: boolean;
  onRefreshMetadata: () => void;
  technique: Technique;
  disabled: boolean;
  onDelete: (technique: Technique) => Promise<void>;
  onUpdate: (technique: Technique) => Promise<string | null>;
};

const fields = [
  ["name", "Nombre", "Ejemplo: Uchi-mata"],
  ["discipline", "Disciplina", "Judo, BJJ, Wrestling..."],
  ["position", "Posición inicial", "De pie, bottom half guard..."],
  ["category", "Categoría", "Proyección, barrido, escape..."],
] as const;
const button = "min-h-11 rounded-xl px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50";

export default function TechniqueCard({ technique, disabled, onDelete, onUpdate, metadata, metadataBusy, onRefreshMetadata }: Props) {
  // Captura también la revisión: una actualización de fondo no pisa el borrador.
  const [draft, setDraft] = useState<Technique | null>(null);
  const [error, setError] = useState("");
  const [brokenThumbnail, setBrokenThumbnail] = useState("");
  const [native, setNative] = useState(false);
  const [localStatus, setLocalStatus] = useState<"missing" | "downloading" | "merging" | "available">("missing");
  const [nativeNotice, setNativeNotice] = useState("");

  useEffect(() => {
    if (!isNativeAndroid()) return;
    setNative(true);
    const unsubscribe = subscribeNative(result => {
      if (result.techniqueId !== technique.id) return;
      if (result.status) setLocalStatus(result.status);
      if (result.type === "ERROR") setNativeNotice(result.message || "No se pudo descargar.");
      else if (result.message) setNativeNotice(result.message);
    });
    sendNative({ type: "CHECK", userId: technique.user_id, techniqueId: technique.id });
    return unsubscribe;
  }, [technique.id, technique.user_id]);
  const thumbnail = safeThumbnail(metadata?.thumbnail_url);
  const previewMessage = metadataBusy ? "Buscando información del video…" : metadataMessage(metadata);
  const pending = isPending(technique);
  const labels = [technique.discipline, technique.position, technique.category].map(cleanField).filter(Boolean);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || disabled) return;
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    setError("");
    const failure = await onUpdate({ ...draft, name: text("name") || draft.name,
      discipline: text("discipline"), position: text("position"), category: text("category") });
    if (failure) setError(failure);
    else setDraft(null);
  }

  return (
    <article className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-zinc-800 px-3 py-1">{technique.source}</span>
        {pending && <span className="text-amber-300">Sin clasificar</span>}
      </div>
      <div className="flex min-w-0 items-start gap-3">
        {thumbnail && brokenThumbnail !== `${thumbnail}:${metadata?.attempted_at}` && (
          <a href={technique.url} target="_blank" rel="noopener noreferrer" aria-label="Abrir video original"
            className="h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-zinc-800 sm:w-28">
            {/* URL pública del proveedor; no pasa por un optimizador ni se almacena aquí. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnail} alt="" width={112} height={96} loading="lazy" decoding="async"
              referrerPolicy="no-referrer" className="h-full w-full object-cover"
              onError={() => setBrokenThumbnail(`${thumbnail}:${metadata?.attempted_at}`)} />
          </a>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-semibold">{technique.name}</h3>
          {metadata?.title && <p className="mt-1 line-clamp-3 break-words text-sm text-zinc-200">{metadata.title}</p>}
          {metadata?.author && <p className="mt-2 break-words text-sm text-zinc-400">Por {metadata.author}</p>}
        </div>
      </div>
      {previewMessage && <p className="mt-3 text-sm text-zinc-400">{previewMessage}</p>}
      {thumbnail && brokenThumbnail === `${thumbnail}:${metadata?.attempted_at}` &&
        <p className="mt-2 text-sm text-zinc-400">La miniatura ya no está disponible. Puedes actualizar la vista previa.</p>}
      {metadata?.reason !== "instagram" && metadata?.reason !== "unsupported" &&
        <button type="button" disabled={disabled || metadataBusy} onClick={onRefreshMetadata}
          className="mt-1 min-h-11 py-2 text-sm text-zinc-400 underline underline-offset-4 disabled:opacity-50">
          {metadataBusy ? "Consultando…" : "Actualizar vista previa"}
        </button>}
      <p className="mt-1 truncate text-sm text-zinc-400" title={technique.url}>{technique.url}</p>
      {labels.length > 0 && <p className="mt-3 break-words text-sm text-zinc-300">{labels.join(" · ")}</p>}
      {native && (
        <div className="mt-3 grid gap-2">
          <p role="status" className="text-sm text-zinc-300">
            {localStatus === "available" ? "Disponible en este dispositivo" :
              localStatus === "downloading" ? "Descargando…" :
              localStatus === "merging" ? "Uniendo audio y video…" :
              "No descargado en este dispositivo"}
          </p>
          {nativeNotice && <p role="status" className="text-xs text-zinc-400">{nativeNotice}</p>}
          {localStatus === "available" ? (
            <button type="button" className={button + " bg-emerald-700 text-white"}
              onClick={() => sendNative({ type: "OPEN", userId: technique.user_id, techniqueId: technique.id })}>
              Reproducir video local
            </button>
          ) : (
            <button type="button" disabled={localStatus === "downloading" || localStatus === "merging"}
              className={button + " bg-zinc-700 text-white disabled:opacity-50"}
              onClick={() => {
                setNativeNotice("");
                setLocalStatus("downloading");
                sendNative({ type: "DOWNLOAD", userId: technique.user_id,
                  techniqueId: technique.id, url: technique.url });
              }}>
              {localStatus === "downloading" || localStatus === "merging" ? "Procesando…" : "Descargar a este teléfono"}
            </button>
          )}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2">
        <a href={technique.url} target="_blank" rel="noopener noreferrer"
          className={`${button} bg-red-600 text-center text-white hover:bg-red-500`}>Ver video</a>
        <button type="button" disabled={disabled} aria-expanded={!!draft} aria-controls={`edit-${technique.id}`}
          className={`${button} bg-zinc-800 hover:bg-zinc-700`}
          onClick={() => { setError(""); setDraft(draft ? null : technique); }}>
          {draft ? "Cerrar" : pending ? "Clasificar" : "Editar"}
        </button>
        <button type="button" disabled={disabled} className={`${button} text-zinc-300 hover:bg-zinc-800`}
          onClick={() => void onDelete(technique)}>Eliminar</button>
      </div>
      {draft && (
        <form id={`edit-${technique.id}`} onSubmit={submit} className="mt-5 border-t border-zinc-700 pt-5">
          <fieldset disabled={disabled} className="grid min-w-0 gap-4">
            <p className="text-sm text-zinc-400">Todo es opcional. Completa lo que te sirva.</p>
            {draft.revision !== technique.revision && <p className="text-sm text-amber-300">Hay cambios de otro dispositivo. Cierra y vuelve a abrir la edición para usar la versión actual.</p>}
            {fields.map(([key, label, placeholder]) => (
              <label key={key} className="grid gap-2 text-sm text-zinc-300">{label}
                <input name={key} type="text" maxLength={200} defaultValue={key === "name" ? draft.name : cleanField(draft[key])}
                  placeholder={placeholder}
                  className="min-h-12 min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none focus:border-red-400" />
              </label>
            ))}
            {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
            <button type="submit" className={`${button} bg-red-600 text-white hover:bg-red-500`}>
              {disabled ? "Guardando…" : "Guardar cambios"}
            </button>
          </fieldset>
        </form>
      )}
    </article>
  );
}
