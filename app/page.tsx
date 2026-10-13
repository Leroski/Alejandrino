"use client";

import AuthGate from "./components/AuthGate";
import Library from "./components/Library";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <p className="text-sm font-semibold text-red-400">Biblioteca personal</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">Alejandrino</h1>
          <p className="mt-2 text-sm text-zinc-400">Guarda ahora. Clasifica después.</p>
        </header>
        <AuthGate>{user => <Library key={user.id} user={user} />}</AuthGate>
      </div>
    </main>
  );
}
