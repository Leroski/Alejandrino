"use client";

import { Suspense, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import AuthGate from "../components/AuthGate";
import { addTechnique, draftFromText } from "../lib/techniques";
import { sharedLink } from "../lib/shared-link";
import { errorMessage } from "../lib/supabase";

function SaveSharedLink({ initialUrl, user }: { initialUrl: string; user: User }) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const saving = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || notice) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const item = await addTechnique(user.id, draftFromText(url));
      setNotice(item ? "Guardado en tu biblioteca." : "Este enlace ya estaba guardado.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-semibold">Guardar video</h2>
      <p className="mt-2 break-words text-sm text-zinc-400">Cuenta: {user.email}</p>
      {notice ? (
        <>
          <p role="status" className="mt-5 text-emerald-300">{notice}</p>
          <p className="mt-2 text-sm text-zinc-400">Puedes volver a Instagram o TikTok. La clasificación queda para después.</p>
          <Link href="/" className="mt-5 block min-h-12 rounded-xl bg-red-600 px-5 py-3 text-center font-semibold">Ver mi biblioteca</Link>
        </>
      ) : (
        <form onSubmit={save} className="mt-5 grid gap-4">
          {!initialUrl && <p className="text-sm text-amber-200">No recibimos un enlace válido. Puedes pegarlo aquí.</p>}
          <label htmlFor="shared-url" className="text-sm">Enlace recibido</label>
          <input id="shared-url" type="text" inputMode="url" autoComplete="off" autoCapitalize="none" spellCheck={false}
            value={url} onChange={event => setUrl(event.target.value)} disabled={busy}
            className="min-h-12 min-w-0 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-red-400" />
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <button disabled={busy || !url.trim()} className="min-h-12 rounded-xl bg-red-600 px-5 py-3 font-semibold disabled:opacity-50">
            {busy ? "Guardando…" : "Guardar"}
          </button>
          <p className="text-sm text-zinc-400">No necesitas poner nombre ni clasificarlo.</p>
        </form>
      )}
    </section>
  );
}

function SharedContent() {
  const params = useSearchParams();
  const url = sharedLink(params);
  // La URL permanece en esta página mientras se muestra el inicio de sesión.
  return <AuthGate>{user => <SaveSharedLink key={`${user.id}:${params.toString()}`} user={user} initialUrl={url} />}</AuthGate>;
}

export default function SharePage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100">
      <div className="mx-auto max-w-md">
        <header className="mb-6">
          <Link href="/" className="inline-block min-h-11 py-2 text-2xl font-bold">Alejandrino</Link>
          <p className="text-sm text-zinc-400">Guarda el enlace en tu cuenta.</p>
        </header>
        <Suspense fallback={<p role="status">Preparando enlace…</p>}><SharedContent /></Suspense>
      </div>
    </main>
  );
}
