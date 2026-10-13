// Ejecutar: node --test tests/video-metadata.test.cjs
// Usa TypeScript ya instalado en el proyecto. Las pruebas no consultan la red.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "alejandrino-metadata-"));
for (const name of ["types/video-metadata", "lib/metadata-provider.server"]) {
  const file = path.join(temp, name + ".js");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ts.transpileModule(fs.readFileSync(path.join(root, "app", name + ".ts"), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const { fetchVideoMetadata } = require(path.join(temp, "lib/metadata-provider.server.js"));
const { safeThumbnail } = require(path.join(temp, "types/video-metadata.js"));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const json = () => Response.json({ title: "Uchi-mata", author_name: "Sensei", thumbnail_url: "https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg", html: "<script>bad()</script>" });
const video = "https://www.tiktok.com/@scout2015/video/6718335390845095173";

test("Shorts: consulta el ID canónico y descarta el HTML remoto", async () => {
  let requested;
  const result = await fetchVideoMetadata("https://www.youtube.com/shorts/jNQXAC9IVRw?si=tracking", async value => {
    requested = new URL(value);
    return json();
  });
  assert.equal(result.status, "ready");
  assert.equal(result.title, "Uchi-mata");
  assert.equal(requested.hostname, "www.youtube.com");
  assert.equal(requested.searchParams.get("url"), "https://www.youtube.com/watch?v=jNQXAC9IVRw");
  assert.equal("html" in result, false);
});

test("TikTok corto: sigue solo destinos permitidos y omite la descarga de la página final", async () => {
  const calls = [];
  const result = await fetchVideoMetadata("https://vm.tiktok.com/ABC123/", async (value, init) => {
    calls.push(String(value));
    if (calls.length === 1) {
      assert.equal(init.redirect, "manual");
      return new Response(null, { status: 302, headers: { location: video + "?tracking=1" } });
    }
    assert.equal(init.redirect, "error");
    return json();
  });
  assert.equal(result.status, "ready");
  assert.equal(calls.length, 2);
  assert.equal(new URL(calls[1]).pathname, "/oembed");
});

test("rechaza hosts falsos, credenciales, puertos y destinos internos sin consultarlos", async () => {
  for (const input of ["http://127.0.0.1/", "http://169.254.169.254/", "file:///etc/passwd",
    "https://www.tiktok.com.attacker.example/", "https://user@www.youtube.com/watch?v=jNQXAC9IVRw",
    "https://www.youtube.com:8443/watch?v=jNQXAC9IVRw", "https://arbitrary.example/"]) {
    const result = await fetchVideoMetadata(input, async () => { assert.fail("No debe salir a la red"); });
    assert.equal(result.status, "unavailable");
  }
});

test("detiene una redirección de TikTok hacia una dirección interna", async () => {
  let calls = 0;
  const result = await fetchVideoMetadata("https://vt.tiktok.com/ABC123/", async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
  });
  assert.equal(result.status, "unavailable");
  assert.equal(calls, 1);
});

test("acota ciclos de redirección", async () => {
  let calls = 0;
  const result = await fetchVideoMetadata("https://vm.tiktok.com/ABC123/", async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: "https://vm.tiktok.com/ABC123/" } });
  });
  assert.equal(result.status, "unavailable");
  assert.equal(calls, 4);
});

test("Instagram devuelve un estado explícito sin fingir una extracción", async () => {
  const result = await fetchVideoMetadata("https://www.instagram.com/reel/ABC/", async () => { assert.fail("No se consulta Instagram"); });
  assert.equal(result.reason, "instagram");
  assert.equal(result.status, "unavailable");
});

test("distingue un video inexistente de una caída temporal del proveedor", async () => {
  assert.equal((await fetchVideoMetadata(video, async () => new Response(null, { status: 404 }))).status, "unavailable");
  for (const status of [403, 429, 500, 503]) {
    assert.equal((await fetchVideoMetadata(video, async () => new Response(null, { status }))).status, "error");
  }
  assert.equal((await fetchVideoMetadata(video, async () => { throw new Error("offline"); })).status, "error");
});

test("respuestas malformadas o excesivas no se guardan", async () => {
  for (const body of ["<html>Login</html>", "a".repeat(70000), "null"]) {
    assert.equal((await fetchVideoMetadata(video, async () => new Response(body))).status, "error");
  }
  assert.equal((await fetchVideoMetadata(video, async () => Response.json({}))).status, "unavailable");
});

test("acota textos y descarta miniaturas ajenas a los proveedores", async () => {
  const result = await fetchVideoMetadata(video, async () => Response.json({
    title: "a".repeat(2000), author_name: "b".repeat(500), thumbnail_url: "http://localhost/private",
  }));
  assert.equal(result.title.length, 1000);
  assert.equal(result.author.length, 200);
  assert.equal(result.thumbnail_url, "");
  assert.equal(safeThumbnail("https://i.ytimg.com.attacker.example/image.jpg"), "");
  assert.equal(safeThumbnail("https://user:pass@i.ytimg.com/image.jpg"), "");
  assert.ok(safeThumbnail("https://p16-common-sign.tiktokcdn.com/image.jpg"));
});

test("los títulos largos con emojis no se cortan en medio de un carácter", async () => {
  const result = await fetchVideoMetadata(video, async () => Response.json({ title: "a" + "🥋".repeat(1200) }));
  assert.equal(Array.from(result.title).length, 1000);
  assert.equal(result.title.isWellFormed(), true);
});
