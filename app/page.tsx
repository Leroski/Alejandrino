"use client";

import { useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import TechniqueCard from "./components/TechniqueCard";
import { isPending, type Technique } from "./types/technique";

// La misma clave conserva los enlaces guardados en la versión anterior.
const STORAGE_KEY = "grappling-library-techniques";
const CHANGE_EVENT = "grappling-library-change";
const inputClass = "min-h-12 min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-red-400";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

function getSnapshot(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "[]";
  } catch {
    return "storage-unavailable";
  }
}

// Next.js no puede leer el almacenamiento del teléfono desde el servidor.
function getServerSnapshot(): null { return null; }

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function isTechnique(value: unknown): value is Technique {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "number" && Number.isSafeInteger(item.id)
    && ["name", "discipline", "position", "category", "source", "url"]
      .every((key) => typeof item[key] === "string")
    && validUrl(item.url as string);
}

function readTechniques(raw: string | null): Technique[] {
  if (raw === null) return [];
  if (raw === "storage-unavailable") {
    throw new Error("El navegador no permite acceder al almacenamiento.");
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || !data.every(isTechnique)
      || new Set(data.map((item) => item.id)).size !== data.length) throw new Error();
    return data;
  } catch {
    throw new Error("No se pudieron leer tus enlaces. Los datos anteriores siguen intactos; no borres el almacenamiento.");
  }
}

function extractUrl(text: string): string {
  // Algunas redes copian una descripción junto con el enlace.
  const match = text.match(/https?:\/\/[^\s<>"“”]+/i);
  let candidate = (match?.[0] ?? text.trim()).replace(/[.,;!?)]+$/, "");
  if (candidate.startsWith("www.")) candidate = `https://${candidate}`;
  if (!validUrl(candidate)) throw new Error("Pega un enlace válido que empiece con https:// o http://.");
  return new URL(candidate).href;
}

function detectSource(value: string): string {
  const host = new URL(value).hostname.toLowerCase();
  const belongsTo = (domain: string) => host === domain || host.endsWith(`.${domain}`);
  if (belongsTo("tiktok.com")) return "TikTok";
  if (belongsTo("instagram.com")) return "Instagram";
  if (belongsTo("youtube.com") || belongsTo("youtu.be")) return "YouTube";
  return "Otra plataforma";
}

function searchable(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export default function Home() {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  let techniques: Technique[] = [];
  let storageError = "";
  try { techniques = readTechniques(raw); }
  catch (cause) { storageError = (cause as Error).message; }
  const ready = raw !== null && storageError === "";

  // Primero guarda; solo después React muestra el cambio y el mensaje de éxito.
  function updateLibrary(update: (current: Technique[]) => Technique[]): boolean {
    setError("");
    setNotice("");
    try {
      if (!ready) throw new Error("El almacenamiento todavía no está disponible.");
      const current = readTechniques(getSnapshot());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(update(current)));
      window.dispatchEvent(new Event(CHANGE_EVENT));
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo guardar. Inténtalo nuevamente.");
      return false;
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = updateLibrary((current) => {
      const cleanUrl = extractUrl(url);
      if (current.some((item) => new URL(item.url).href === cleanUrl)) {
        throw new Error("Este enlace ya está guardado.");
      }
      const source = detectSource(cleanUrl);
      const date = new Date();
      const stamp = date.toLocaleString("es-CL", {
        day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      });
      const id = current.reduce((max, item) => Math.max(max, item.id + 1), date.getTime());
      return [{ id, name: `${source} · ${stamp}`, discipline: "", position: "",
        category: "", source, url: cleanUrl }, ...current];
    });
    if (saved) {
      setUrl("");
      setQuery("");
      setOnlyPending(false);
      setNotice("Guardado. Puedes clasificarlo después.");
      inputRef.current?.blur();
    }
  }

  function handleUpdate(updated: Technique): boolean {
    const saved = updateLibrary((current) => {
      if (!current.some((item) => item.id === updated.id)) {
        throw new Error("Este enlace ya no existe. Recarga la página.");
      }
      return current.map((item) => item.id === updated.id ? updated : item);
    });
    if (saved) setNotice("Cambios guardados.");
    return saved;
  }

  function handleDelete(id: number) {
    if (!window.confirm("¿Eliminar este enlace de tu biblioteca?")) return;
    if (updateLibrary((current) => current.filter((item) => item.id !== id))) {
      setNotice("Enlace eliminado.");
    }
  }

  const pendingCount = techniques.filter(isPending).length;
  const visible = techniques.filter((item) => {
    const matches = searchable([item.name, item.discipline, item.position,
      item.category, item.source, item.url].join(" ")).includes(searchable(query.trim()));
    return matches && (!onlyPending || isPending(item));
  });

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-sm font-semibold text-red-400">Biblioteca personal</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Grappling Library</h1>
        </header>

        <section aria-labelledby="save-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
          <h2 id="save-heading" className="text-xl font-semibold">Guardar un video</h2>
          <p className="mt-1 text-sm text-zinc-400">Pega el enlace. Clasifica cuando quieras.</p>
          <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
            <label htmlFor="video-url" className="text-sm text-zinc-300">Enlace del video</label>
            <input ref={inputRef} id="video-url" type="text" inputMode="url"
              autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false}
              enterKeyHint="go" value={url} className={inputClass}
              placeholder="Enlace de TikTok, Instagram o YouTube"
              onChange={(event) => { setUrl(event.target.value); setError(""); setNotice(""); }} />
            <button type="submit" disabled={!ready || !url.trim()}
              className="min-h-12 rounded-xl bg-red-600 px-5 py-3 text-base font-semibold text-white hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50">
              Guardar
            </button>
          </form>
        </section>

        {(storageError || error) && <p role="alert" className="mt-3 text-sm text-red-300">{storageError || error}</p>}
        <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>

        <section aria-labelledby="library-heading" className="mt-7">
          <h2 id="library-heading" className="mb-4 text-xl font-semibold">Mis videos</h2>
          <label htmlFor="search" className="sr-only">Buscar videos</label>
          <input id="search" type="search" value={query} className={inputClass}
            placeholder="Buscar por nombre, posición o plataforma"
            onChange={(event) => setQuery(event.target.value)} />
          <div className="my-4 grid grid-cols-2 gap-3">
            {[false, true].map((pending) => (
              <button key={String(pending)} type="button" aria-pressed={onlyPending === pending}
                onClick={() => setOnlyPending(pending)}
                className={`min-h-11 rounded-xl px-3 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-red-400 ${onlyPending === pending ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
                {pending ? `Pendientes (${pendingCount})` : `Todos (${techniques.length})`}
              </button>
            ))}
          </div>
          {raw === null ? <p className="text-zinc-400">Cargando biblioteca…</p> :
            storageError ? null : visible.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-700 p-6 text-zinc-400">
                {techniques.length === 0 ? "Pega tu primer enlace arriba para guardarlo." : "No hay videos que coincidan con este filtro."}
              </p>
            ) : (
              <div className="grid gap-4">
                {visible.map((technique) => <TechniqueCard key={technique.id}
                  technique={technique} onDelete={handleDelete} onUpdate={handleUpdate} />)}
              </div>
            )}
        </section>
      </div>
    </main>
  );
}
