import { extractUrl } from "./techniques";

// Android suele poner la URL en text; algunas aplicaciones usan title o url.
export function sharedLink(params: { get: (name: string) => string | null }): string {
  for (const name of ["url", "text", "title"]) {
    const value = params.get(name);
    if (!value || value.length > 20000) continue;
    try { return extractUrl(value); } catch { /* Prueba el siguiente campo. */ }
  }
  return "";
}
