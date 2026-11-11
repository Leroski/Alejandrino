import { extractUrl } from "./techniques";
import { sharedTitle } from "./video-title";

// Android suele poner la URL en text; algunas aplicaciones usan title o url.
export function sharedLink(params: { get: (name: string) => string | null }): string {
  for (const name of ["url", "text", "title"]) {
    const value = params.get(name);
    if (!value || value.length > 20000) continue;
    try { return extractUrl(value); } catch { /* Prueba el siguiente campo. */ }
  }
  return "";
}

export function sharedCaption(params: { get: (name: string) => string | null }, url: string): string {
  if (!url) return "";
  for (const name of ["text", "title"]) {
    const value = params.get(name);
    if (!value || value.length > 20000) continue;
    // Do not attach a caption which explicitly belongs to another URL.
    try { if (extractUrl(value) !== url) continue; } catch { /* Plain text may be a caption. */ }
    const title = sharedTitle(value);
    if (title) return title;
  }
  return "";
}
