"use client";

import { useState, type FormEvent } from "react";
import { errorMessage, getSupabase } from "../lib/supabase";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const { error } = await getSupabase().auth.signInWithPassword({
        email: String(form.get("email") ?? "").trim(),
        password: String(form.get("password") ?? ""),
      });
      if (error) throw error;
    } catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  const input = "min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-base outline-none focus:border-red-400";
  return (
    <section className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-xl font-semibold">Entrar a mi biblioteca</h2>
      <p className="mt-2 text-sm text-zinc-400">Usa tu cuenta para ver los mismos enlaces en el teléfono y el computador.</p>
      <form onSubmit={submit} className="mt-5 grid gap-4">
        <label className="grid gap-2 text-sm">Correo
          <input name="email" type="email" autoComplete="username" autoCapitalize="none" required className={input} />
        </label>
        <label className="grid gap-2 text-sm">Contraseña
          <input name="password" type="password" autoComplete="current-password" required className={input} />
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button disabled={busy} className="min-h-12 rounded-xl bg-red-600 px-4 py-3 font-semibold hover:bg-red-500 disabled:opacity-50">
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </section>
  );
}
