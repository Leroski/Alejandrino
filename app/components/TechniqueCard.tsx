"use client";

import { useState, type FormEvent } from "react";
import { cleanField, isPending, type Technique } from "../types/technique";
import LocalVideoStatus from "./LocalVideoStatus";
import { useNativeAndroid } from "../lib/native-bridge";
import { useLocalPreview } from "../lib/use-local-preview";

import { formatDuration, metadataMessage, safeThumbnail, type VideoMetadata } from "../types/video-metadata";

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
  ["name", "Título de tu ficha", "Ejemplo: Entrada de Uchi-mata con agarre de manga"],
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
  const native = useNativeAndroid();
  const { attach: previewRef, ...local } = useLocalPreview(technique.user_id, technique.id, technique.url);
  const originalTitle = local.preview?.metadata.title || metadata?.title || "";
  const author = local.preview?.metadata.author || metadata?.author || "";
  const thumbnail = local.preview?.image || safeThumbnail(local.preview?.metadata.thumbnail_url) || safeThumbnail(metadata?.thumbnail_url);
  const imageKey = `${thumbnail}:${metadata?.attempted_at}`;
  const hasImage = thumbnail && brokenThumbnail !== imageKey;
  const duration = formatDuration(local.preview?.duration || local.preview?.metadata.duration || 0);
  const previewMessage = local.supported
    ? (local.busy ? "Preparando vista previa…" : !thumbnail && !originalTitle ? "Puedes actualizar los datos o descargar el video para obtener su portada." : "")
    : metadataBusy ? "Buscando información del video…" : metadataMessage(metadata);
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
    <article ref={previewRef} className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-zinc-800 px-3 py-1">{technique.source}</span>
        {pending && <span className="text-amber-300">Sin clasificar</span>}
      </div>
      <div className="flex min-w-0 items-start gap-3">
        <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl bg-zinc-950 sm:w-32">
          {hasImage ? <>
            {/* Los JPEG locales permanecen en memoria de la vista, sin optimizador ni envío al servidor. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnail} alt="Vista previa del video guardado" width={128} height={171} loading="lazy" decoding="async"
              referrerPolicy="no-referrer" className="h-full w-full object-contain"
              onError={() => setBrokenThumbnail(imageKey)} />
          </> : <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center text-xs text-zinc-400">
            <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="3" y="4" width="18" height="16" rx="3" /><path d="m10 8 6 4-6 4Z" />
            </svg>
            <span>{local.busy || metadataBusy ? "Cargando portada…" : "Sin portada"}</span>
          </div>}
          {duration && <span className="absolute bottom-2 right-2 rounded bg-black/80 px-2 py-1 text-xs text-white" aria-label={`Duración ${duration}`}>{duration}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-lg font-semibold">{technique.name}</h3>
          {originalTitle && originalTitle !== technique.name && <p className="mt-2 line-clamp-4 break-words text-sm text-zinc-200">
            <span className="mb-1 block text-xs text-zinc-400">Título original</span>{originalTitle}
          </p>}
          {author && <p className="mt-2 break-words text-sm text-zinc-400">Por {author}</p>}
          {local.preview?.image && <p className="mt-2 text-xs text-zinc-400">Portada guardada en este dispositivo</p>}
        </div>
      </div>
      {local.preview?.metadata.description && <details className="mt-3 text-sm text-zinc-300">
        <summary className="min-h-11 cursor-pointer py-3 text-zinc-400">Descripción original</summary>
        <p className="whitespace-pre-wrap break-words">{local.preview.metadata.description}</p>
      </details>}
      {previewMessage && <p className="mt-3 text-sm text-zinc-400">{previewMessage}</p>}
      {thumbnail && brokenThumbnail === imageKey &&
        <p className="mt-2 text-sm text-zinc-400">La miniatura ya no está disponible. Puedes actualizar la vista previa.</p>}
      {local.error && <p role="status" className="mt-2 text-sm text-amber-200">{local.error}</p>}
      {local.supported ? <div className="mt-1 flex flex-wrap gap-x-4">
        <button type="button" disabled={disabled || local.busy} onClick={() => void local.load({ refresh: true })}
          className="min-h-11 py-2 text-sm text-zinc-300 underline underline-offset-4 disabled:opacity-50">
          {local.busy ? "Consultando…" : "Actualizar datos"}
        </button>
        {local.preview?.available && <button type="button" disabled={disabled || local.busy}
          onClick={() => void local.load({ frame: ((local.preview?.frame ?? 0) + 1) % 3 })}
          className="min-h-11 py-2 text-sm text-zinc-300 underline underline-offset-4 disabled:opacity-50">Cambiar portada</button>}
      </div> : metadata?.reason !== "instagram" && metadata?.reason !== "unsupported" &&
        <button type="button" disabled={disabled || metadataBusy} onClick={onRefreshMetadata}
          className="mt-1 min-h-11 py-2 text-sm text-zinc-400 underline underline-offset-4 disabled:opacity-50">
          {metadataBusy ? "Consultando…" : "Actualizar vista previa"}
        </button>}
      <p className="mt-1 truncate text-sm text-zinc-400" title={technique.url}>{technique.url}</p>
      {labels.length > 0 && <p className="mt-3 break-words text-sm text-zinc-300">{labels.join(" · ")}</p>}
      <LocalVideoStatus key={`${technique.user_id}:${technique.id}`} userId={technique.user_id} techniqueId={technique.id}
        sourceUrl={technique.url} disabled={disabled} availability={local.preview}
        onLocalChange={() => void local.load()} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <a href={technique.url} target={native ? "_self" : "_blank"} rel="noopener noreferrer"
          className={`${button} bg-red-600 text-center text-white hover:bg-red-500`}>Ver original</a>
        <button type="button" disabled={disabled} aria-expanded={!!draft} aria-controls={`edit-${technique.id}`}
          className={`${button} bg-zinc-800 hover:bg-zinc-700`}
          onClick={() => { setError(""); setDraft(draft ? null : technique); }}>
          {draft ? "Cerrar" : "Editar"}
        </button>
        <button type="button" disabled={disabled} className={`${button} text-zinc-300 hover:bg-zinc-800`}
          onClick={() => void onDelete(technique)}>Eliminar</button>
      </div>
      {draft && (
        <form id={`edit-${technique.id}`} onSubmit={submit} className="mt-5 border-t border-zinc-700 pt-5">
          <fieldset disabled={disabled} className="grid min-w-0 gap-4">
            <p className="text-sm text-zinc-400">Elige un título que te ayude a reconocer el video. Los datos del proveedor no reemplazan tus cambios.</p>
            {draft.revision !== technique.revision && <p className="text-sm text-amber-300">Hay cambios de otro dispositivo. Cierra y vuelve a abrir la edición para usar la versión actual.</p>}
            {fields.map(([key, label, placeholder]) => (
              <label key={key} className="grid gap-2 text-sm text-zinc-300">{label}
                <input name={key} type="text" maxLength={200} value={draft[key]}
                  onChange={event => setDraft({ ...draft, [key]: event.target.value })}
                  placeholder={placeholder}
                  className="min-h-12 min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none focus:border-red-400" />
              </label>
            ))}
            {originalTitle && <button type="button" onClick={() => setDraft({ ...draft, name: originalTitle.slice(0, 200) })}
              className="min-h-11 text-left text-sm text-zinc-300 underline underline-offset-4">Usar el título original</button>}
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
