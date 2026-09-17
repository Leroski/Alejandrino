"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { configurationError, errorMessage, getSupabase } from "./lib/supabase";
import LoginForm from "./components/LoginForm";
import Library from "./components/Library";

export default function Home() {
  const setupError = configurationError();
  const [auth, setAuth] = useState<{ ready: boolean; user: User | null; error: string }>({
    ready: false, user: null, error: "",
  });

  useEffect(() => {
    if (setupError) return;
    const client = getSupabase();
    let active = true;
    let events = 0;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      events += 1;
      if (active) setAuth({ ready: true, user: session?.user ?? null, error: "" });
    });
    const initialEvents = events;
    void client.auth.getSession().then(({ data, error }) => {
      if (active && events === initialEvents) {
        setAuth({ ready: true, user: data.session?.user ?? null, error: error ? errorMessage(error) : "" });
      }
    }).catch(cause => {
      if (active && events === initialEvents) setAuth({ ready: true, user: null, error: errorMessage(cause) });
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, [setupError]);

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-sm font-semibold text-red-400">Biblioteca personal</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Grappling Library</h1>
        </header>
        {setupError ? <p role="alert" className="rounded-xl bg-zinc-900 p-5 text-red-300">{setupError}</p>
          : !auth.ready ? <p role="status">Comprobando sesión…</p>
          : auth.user ? <Library key={auth.user.id} user={auth.user} />
          : <>{auth.error && <p role="alert" className="mb-4 text-red-300">{auth.error}</p>}<LoginForm /></>}
      </div>
    </main>
  );
}
