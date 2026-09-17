"use client";

import { useState, type FormEvent } from "react";
import { cleanField, isPending, type Technique } from "../types/technique";

type Props = {
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

export default function TechniqueCard({ technique, disabled, onDelete, onUpdate }: Props) {
  // Captura también la revisión: una actualización de fondo no pisa el borrador.
  const [draft, setDraft] = useState<Technique | null>(null);
  const [error, setError] = useState("");
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
      <h3 className="break-words text-lg font-semibold">{technique.name}</h3>
      <p className="mt-1 truncate text-sm text-zinc-400" title={technique.url}>{technique.url}</p>
      {labels.length > 0 && <p className="mt-3 break-words text-sm text-zinc-300">{labels.join(" · ")}</p>}
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
