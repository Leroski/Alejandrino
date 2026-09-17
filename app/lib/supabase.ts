import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/technique";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

export function configurationError(): string | null {
  if (!url || !key || url.includes("TU_PROYECTO") || key.includes("REEMPLAZAR")) {
    return "Completa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local y reinicia el servidor.";
  }
  if (!key.startsWith("sb_publishable_")) {
    return "Esta versión espera la clave Publishable de Supabase, que empieza con sb_publishable_.";
  }
  try { if (new URL(url).protocol !== "https:") throw new Error(); }
  catch { return "La URL del proyecto Supabase debe ser una dirección https válida."; }
  return null;
}

let client: SupabaseClient<Database> | undefined;

// Una sola instancia conserva y renueva la sesión en este navegador.
export function getSupabase() {
  const error = configurationError();
  if (error) throw new Error(error);
  client ??= createClient<Database>(url!, key!);
  return client;
}

export function errorMessage(error: unknown): string {
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code) : "";
  if (code === "invalid_credentials") return "El correo o la contraseña no son correctos.";
  if (code === "email_not_confirmed") return "Esta cuenta todavía no tiene el correo confirmado.";
  if (code === "23505") return "Este enlace ya está guardado.";
  if (code === "42501") return "No tienes permiso para esta operación. Revisa tu sesión y las políticas de la tabla.";
  if (["PGRST205", "42P01"].includes(code)) return "Falta crear la tabla techniques. Ejecuta el SQL incluido en Supabase.";
  if (error instanceof Error && error.name === "Error") return error.message;
  return "No se pudo confirmar la operación. Revisa tu conexión y vuelve a intentarlo.";
}
