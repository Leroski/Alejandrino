"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import TechniqueCard from "./TechniqueCard";
import { useVideoMetadata } from "../lib/use-video-metadata";
import { isPending, type Technique } from "../types/technique";
import { errorMessage, getSupabase } from "../lib/supabase";
import { addTechnique, deleteTechnique, draftFromText, editTechnique, importTechniques,
  LEGACY_KEY, listTechniques, parseLegacy, searchable } from "../lib/techniques";

const inputClass = "min-h-12 min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none placeholder:text-zinc-500 focus:border-red-400";
const buttonClass = "min-h-11 rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-red-400 disabled:opacity-50";

export default function Library({ user }: { user: User }) {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [previewText, setPreviewText] = useState<Record<string, string>>({});
  const rememberPreviewText = useCallback((id: string, text: string) => {
    setPreviewText(previous => previous[id] === text || !text.trim() ? previous : { ...previous, [id]: text });
  }, []);
  const [onlyPending, setOnlyPending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const { metadata, metadataRunning, metadataMessage, refreshMetadata } =
    useVideoMetadata(techniques.map(item => item.id), user.id, reload);
  const inputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const mutation = useRef(false);
  const sequence = useRef(0);
  const fetchController = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    if (mutation.current) return;
    setRefreshing(true);
    setReload(value => value + 1);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; fetchController.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchController.current = controller;
    const request = ++sequence.current;
    void listTechniques(user.id, controller.signal).then(items => {
      if (mounted.current && request === sequence.current && !controller.signal.aborted) {
        setTechniques(items);
        setLoaded(true);
        setLoadError("");
      }
    }).catch(cause => {
      if (mounted.current && request === sequence.current && !controller.signal.aborted) setLoadError(errorMessage(cause));
    }).finally(() => {
      if (mounted.current && request === sequence.current) setRefreshing(false);
    });
    return () => controller.abort();
  }, [user.id, reload]);

  useEffect(() => {
    let last = 0;
    const onReturn = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 500) return;
      last = Date.now();
      refresh();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);

  async function runOperation<T>(request: () => Promise<T>, onSuccess: (result: T) => void): Promise<string | null> {
    if (mutation.current) return "Espera a que termine la operación anterior.";
    mutation.current = true;
    sequence.current += 1;
    fetchController.current?.abort();
    setBusy(true);
    setRefreshing(false);
    setError("");
    setNotice("");
    try {
      const result = await request();
      if (mounted.current) onSuccess(result);
      return null;
    } catch (cause) {
      const message = errorMessage(cause);
      if (mounted.current) setError(message);
      return message;
    } finally {
      mutation.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || busy) return;
    await runOperation(() => addTechnique(user.id, draftFromText(url)), item => {
      if (item) setTechniques(current => [item, ...current]);
      else setReload(value => value + 1);
      setUrl("");
      setQuery("");
      setOnlyPending(false);
      setNotice(item ? "Guardado en tu cuenta. Puedes clasificarlo después." : "Este enlace ya estaba guardado.");
      inputRef.current?.blur();
    });
  }

  function update(item: Technique) {
    return runOperation(() => editTechnique(user.id, item), saved => {
      setTechniques(current => current.map(value => value.id === saved.id ? saved : value));
      setNotice("Cambios guardados.");
    });
  }

  async function remove(item: Technique) {
    if (!window.confirm("¿Eliminar este enlace de tu cuenta? Se quitará también de tus otros dispositivos.")) return;
    await runOperation(() => deleteTechnique(user.id, item), () => {
      setTechniques(current => current.filter(value => value.id !== item.id));
      setNotice("Enlace eliminado.");
    });
  }

  async function importOldLinks() {
    const failure = await runOperation(async () => {
      const drafts = parseLegacy(localStorage.getItem(LEGACY_KEY));
      if (drafts.length === 0) throw new Error("No hay enlaces antiguos en este navegador y dirección. Abre la dirección donde los guardaste para importarlos.");
      if (!window.confirm(`¿Importar ${drafts.length} enlaces de este navegador a la cuenta ${user.email}? La copia local se conservará.`)) return null;
      const count = await importTechniques(user.id, drafts);
      const items = await listTechniques(user.id);
      return { count, items };
    }, result => {
      if (result) {
        setTechniques(result.items);
        setLoaded(true);
        setNotice(`${result.count} enlaces nuevos importados. Los repetidos se omitieron y la copia local se conservó.`);
      }
    });
    // Una importación por lotes puede quedar parcialmente guardada si se corta la red.
    if (failure && mounted.current) setReload(value => value + 1);
  }

  async function logout() {
    await runOperation(async () => {
      const { error } = await getSupabase().auth.signOut({ scope: "local" });
      if (error) throw error;
    }, () => {});
  }

  const pendingCount = techniques.filter(isPending).length;
  const needle = searchable(query.trim());
  const visible = techniques.filter(item => (!onlyPending || isPending(item)) &&
    searchable([item.name, item.discipline, item.position, item.category, item.source, item.url,
      metadata[item.id]?.title, metadata[item.id]?.author, previewText[item.id]].join(" ")).includes(needle));

  return (
    <>
      <div className="mb-5 flex min-w-0 items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-zinc-400" title={user.email}>{user.email}</p>
        <button type="button" disabled={busy} className={`${buttonClass} shrink-0 bg-zinc-800`} onClick={() => void logout()}>Salir</button>
      </div>
      <section aria-labelledby="save-heading" className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5">
        <h2 id="save-heading" className="text-xl font-semibold">Guardar un video</h2>
        <p className="mt-1 text-sm text-zinc-400">Pega el enlace. Clasifica cuando quieras.</p>
        <form onSubmit={save} className="mt-4 grid gap-3">
          <label htmlFor="video-url" className="text-sm text-zinc-300">Enlace del video</label>
          <input ref={inputRef} id="video-url" type="text" inputMode="url" autoCapitalize="none" autoCorrect="off"
            autoComplete="off" spellCheck={false} enterKeyHint="go" disabled={busy} value={url} className={inputClass}
            placeholder="Enlace de TikTok, Instagram o YouTube"
            onChange={event => { setUrl(event.target.value); setNotice(""); }} />
          <button type="submit" disabled={!loaded || busy || !url.trim()}
            className="min-h-12 rounded-xl bg-red-600 px-5 py-3 font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            {busy ? "Procesando…" : "Guardar"}
          </button>
        </form>
      </section>
      {(error || loadError) && <p role="alert" className="mt-3 text-sm text-red-300">{error || loadError}</p>}
      <p role="status" className="mt-3 text-sm text-emerald-300">{notice}</p>

      <section aria-labelledby="library-heading" className="mt-7">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="library-heading" className="text-xl font-semibold">Mis videos</h2>
          <button type="button" disabled={busy || refreshing} onClick={() => { setError(""); refresh(); }} className={`${buttonClass} bg-zinc-800`}>
            {refreshing ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {metadataMessage && <p role="status" className="mb-4 text-sm text-zinc-400">{metadataMessage}</p>}
        <label htmlFor="search" className="sr-only">Buscar videos</label>
        <input id="search" type="search" value={query} className={inputClass} placeholder="Buscar por nombre, autor, posición o plataforma"
          onChange={event => setQuery(event.target.value)} />
        <div className="my-4 grid grid-cols-2 gap-3">
          {[false, true].map(pending => <button key={String(pending)} type="button" aria-pressed={onlyPending === pending}
            onClick={() => setOnlyPending(pending)}
            className={`${buttonClass} ${onlyPending === pending ? "bg-zinc-100 text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}>
            {pending ? `Pendientes (${pendingCount})` : `Todos (${techniques.length})`}
          </button>)}
        </div>
        {!loaded ? <p role="status" className="text-zinc-400">{refreshing ? "Cargando biblioteca…" : "No se pudo cargar la biblioteca. Pulsa Actualizar para reintentar."}</p>
          : visible.length === 0 ? <p className="rounded-2xl border border-dashed border-zinc-700 p-6 text-zinc-400">
            {techniques.length === 0 ? "Pega tu primer enlace arriba para guardarlo." : "No hay videos que coincidan con este filtro."}</p>
          : <div className="grid gap-4">{visible.map(item => <TechniqueCard key={item.id} technique={item}
            disabled={busy} onUpdate={update} onDelete={remove}
            metadata={metadata[item.id]} metadataBusy={!!metadataRunning[item.id]}
            onPreviewText={rememberPreviewText}
            onRefreshMetadata={() => void refreshMetadata(item.id)} />)}</div>}
      </section>
      <details className="mt-8 rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-400">
        <summary className="min-h-11 cursor-pointer py-3 text-zinc-200">Importar mis enlaces anteriores</summary>
        <p className="my-3">Abre esta aplicación en el navegador y la dirección donde los guardabas. La importación conserva la copia local y omite las URL que ya tienes en tu cuenta.</p>
        <button type="button" disabled={!loaded || busy} onClick={() => void importOldLinks()}
          className={`${buttonClass} bg-zinc-800 text-zinc-100`}>Importar desde este navegador</button>
      </details>
    </>
  );
}
