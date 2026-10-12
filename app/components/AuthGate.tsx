"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { configurationError, errorMessage, getSupabase } from "../lib/supabase";
import LoginForm from "./LoginForm";

// Comparte la comprobación de sesión entre la biblioteca y la recepción de enlaces.
export default function AuthGate({ children }: { children: (user: User) => ReactNode }) {
  const setupError = configurationError();
  const [auth, setAuth] = useState<{ ready: boolean; user: User | null; error: string }>({
    ready: false, user: null, error: "",
  });

  useEffect(() => {
    if (setupError) return;
    let active = true;
    let events = 0;
    let unsubscribe: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      if (active) setAuth({ ready: true, user: null,
        error: "La comprobación de sesión está tardando demasiado. Revisa tu conexión y vuelve a intentarlo." });
    }, 15000);

    function finish(user: User | null, error = "") {
      if (!active) return;
      window.clearTimeout(timer);
      setAuth({ ready: true, user, error });
    }

    try {
      const client = getSupabase();
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        events += 1;
        finish(session?.user ?? null);
      });
      unsubscribe = () => subscription.unsubscribe();
      const initialEvents = events;
      void client.auth.getSession().then(({ data, error }) => {
        if (events === initialEvents) finish(data.session?.user ?? null, error ? errorMessage(error) : "");
      }).catch(cause => {
        if (events === initialEvents) finish(null, errorMessage(cause));
      });
    } catch (cause) {
      finish(null, errorMessage(cause));
    }
    return () => { active = false; window.clearTimeout(timer); unsubscribe?.(); };
  }, [setupError]);

  if (setupError) return <p role="alert" className="rounded-xl bg-zinc-900 p-5 text-red-300">{setupError}</p>;
  if (!auth.ready) return <p role="status">Comprobando sesión…</p>;
  if (auth.error) return (
    <div className="rounded-xl bg-zinc-900 p-5">
      <p role="alert" className="text-red-300">{auth.error}</p>
      <button onClick={() => window.location.reload()} type="button"
        className="mt-4 min-h-12 rounded-xl bg-zinc-700 px-5 py-3">Reintentar</button>
    </div>
  );
  return auth.user ? children(auth.user) : <LoginForm />;
}
