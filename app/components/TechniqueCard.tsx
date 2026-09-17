"use client";

import { useState, type FormEvent } from "react";
import { cleanField, isPending, type Technique } from "../types/technique";

type Props = {
  technique: Technique;
  onDelete: (id: number) => void;
  onUpdate: (technique: Technique) => boolean;
};

const fields = [
  ["name", "Nombre", "Ejemplo: Uchi-mata"],
  ["discipline", "Disciplina", "Judo, BJJ, Wrestling..."],
  ["position", "Posición inicial", "De pie, bottom half guard..."],
  ["category", "Categoría", "Proyección, barrido, escape..."],
] as const;

const button = "min-h-11 rounded-xl px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-red-400";

export default function TechniqueCard({ technique, onDelete, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const pending = isPending(technique);
  const labels = [technique.discipline, technique.position, technique.category]
    .map(cleanField).filter(Boolean);

  function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const text = (key: string) => String(data.get(key) ?? "").trim();
    const saved = onUpdate({
      ...technique,
      name: text("name") || technique.name,
      discipline: cleanField(text("discipline")),
      position: cleanField(text("position")),
      category: cleanField(text("category")),
    });
    if (saved) setEditing(false);
    else setError("No se guardaron los cambios. Revisa el aviso de almacenamiento.");
  }

  return (
    <article className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full bg-zinc-800 px-3 py-1 text-zinc-200">
          {technique.source}
        </span>
        {pending && <span className="text-amber-300">Sin clasificar</span>}
      </div>
      <h3 className="break-words text-lg font-semibold">{technique.name}</h3>
      <p className="mt-1 truncate text-sm text-zinc-400" title={technique.url}>
        {technique.url}
      </p>
      {labels.length > 0 && (
        <p className="mt-3 break-words text-sm text-zinc-300">{labels.join(" · ")}</p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2">
        <a href={technique.url} target="_blank" rel="noopener noreferrer"
          className={`${button} bg-red-600 text-center text-white hover:bg-red-500`}>
          Ver video
        </a>
        <button type="button" aria-expanded={editing}
          aria-controls={`edit-${technique.id}`}
          className={`${button} bg-zinc-800 hover:bg-zinc-700`}
          onClick={() => { setError(""); setEditing(!editing); }}>
          {editing ? "Cerrar" : pending ? "Clasificar" : "Editar"}
        </button>
        <button type="button" className={`${button} text-zinc-300 hover:bg-zinc-800`}
          onClick={() => onDelete(technique.id)}>
          Eliminar
        </button>
      </div>

      {editing && (
        <form id={`edit-${technique.id}`} onSubmit={handleUpdate}
          className="mt-5 grid gap-4 border-t border-zinc-700 pt-5">
          <p className="text-sm text-zinc-400">Completa solo lo que te sirva. Todo es opcional.</p>
          {fields.map(([key, label, placeholder]) => (
            <label key={key} className="grid gap-2 text-sm text-zinc-300">
              {label}
              <input name={key} type="text" maxLength={200}
                defaultValue={key === "name" ? technique.name : cleanField(technique[key])}
                placeholder={placeholder}
                className="min-h-12 min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-base text-zinc-100 outline-none focus:border-red-400" />
            </label>
          ))}
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button type="submit" className={`${button} bg-red-600 text-white hover:bg-red-500`}>
            Guardar cambios
          </button>
        </form>
      )}
    </article>
  );
}
