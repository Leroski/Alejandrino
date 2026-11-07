const { randomUUID } = require("node:crypto");

function parseOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
      url.pathname !== "/" || url.search || url.hash || url.hostname.endsWith(".")) {
    throw new Error("Configura un origen HTTPS sin credenciales, puerto, ruta ni parámetros.");
  }
  return url.origin;
}

async function checkApkOrigin(value, fetcher = fetch) {
  const origin = parseOrigin(value);
  const options = { redirect: "manual", signal: AbortSignal.timeout(15000), cache: "no-store" };
  const page = await fetcher(`${origin}/`, options);
  const pageReady = page.status === 200 && /text\/html/i.test(page.headers.get("content-type") ?? "");
  await page.body?.cancel();
  if (!pageReady) throw new Error("La web está bloqueada, redirige a otro dominio o no responde. Resuelve el acceso en Vercel antes de distribuir la APK.");

  // Synthetic identifiers, no account/session and no mutation of Supabase data.
  const request = { protocolVersion: 1, type: "CHECK", requestId: randomUUID(),
    userId: randomUUID(), techniqueId: randomUUID() };
  const response = await fetcher(`${origin}/api/native/authorize`, {
    ...options, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  });
  if (response.status !== 401 || !/application\/json/i.test(response.headers.get("content-type") ?? "")) {
    await response.body?.cancel();
    throw new Error("La API CHECK está bloqueada o no está desplegada en este dominio.");
  }
  let text = "";
  const reader = response.body?.getReader();
  if (!reader) throw new Error("La API CHECK devolvió una respuesta vacía.");
  try {
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 4096) throw new Error("La respuesta de CHECK excede el tamaño permitido.");
    }
  } finally { await reader.cancel(); }
  const body = JSON.parse(text);
  if (body.protocolVersion !== 1 || body.type !== "ERROR" || body.errorCode !== "AUTH_REQUIRED" ||
      ["requestId", "userId", "techniqueId"].some(key => body[key] !== request[key])) {
    throw new Error("El dominio no responde con el contrato CHECK esperado.");
  }
  return origin;
}

module.exports = { parseOrigin, checkApkOrigin };
if (require.main === module) {
  checkApkOrigin(process.argv[2]).then(origin => console.log(`Origen accesible y API CHECK protegida por sesión: ${origin}`))
    .catch(() => { console.error("No se puede distribuir la APK: verifica el origen HTTPS, el acceso a Vercel y la API CHECK. No uses tokens de bypass en la URL ni dentro de la APK."); process.exitCode = 1; });
}
