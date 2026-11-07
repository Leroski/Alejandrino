const { test } = require("node:test");
const assert = require("node:assert/strict");
const { parseOrigin, checkApkOrigin } = require("../scripts/check-apk-origin.cjs");

test("el origen de APK excluye secretos, credenciales y parámetros", () => {
  assert.equal(parseOrigin("https://alejandrino.example/"), "https://alejandrino.example");
  for (const value of ["http://alejandrino.example", "https://user:pass@alejandrino.example", "https://alejandrino.example:8443",
    "https://alejandrino.example/path", "https://alejandrino.example?x-vercel-protection-bypass=secret", "https://alejandrino.example/#token"]) {
    assert.throws(() => parseOrigin(value));
  }
});

test("un redirect de Vercel impide distribuir la APK y nunca se sigue", async () => {
  let calls = 0;
  await assert.rejects(checkApkOrigin("https://alejandrino.example", async (_, options) => {
    calls++; assert.equal(options.redirect, "manual");
    return new Response(null, { status: 307, headers: { location: "https://vercel.com/login" } });
  }), /bloqueada/);
  assert.equal(calls, 1);
});

test("comprueba la web y la autenticación CHECK sin enviar una sesión", async () => {
  let calls = 0;
  assert.equal(await checkApkOrigin("https://alejandrino.example", async (url, options) => {
    calls++; assert.equal(options.redirect, "manual"); assert.equal(options.headers?.Authorization, undefined);
    if (calls === 1) return new Response("<html></html>", { headers: { "content-type": "text/html" } });
    assert.equal(url, "https://alejandrino.example/api/native/authorize");
    const request = JSON.parse(options.body);
    return Response.json({ ...request, type: "ERROR", errorCode: "AUTH_REQUIRED" }, { status: 401 });
  }), "https://alejandrino.example");
  assert.equal(calls, 2);
});

test("rechaza API ausente, login HTML, acceso sin sesión y respuesta no vinculada", async () => {
  for (const reply of [() => new Response("not found", { status: 404 }),
    () => new Response("Vercel login", { status: 401, headers: { "content-type": "text/html" } }),
    () => Response.json({ type: "AUTHORIZED" }),
    () => Response.json({ type: "ERROR", errorCode: "AUTH_REQUIRED" }, { status: 401 }),
    () => new Response("a".repeat(4097), { status: 401, headers: { "content-type": "application/json" } })]) {
    let calls = 0;
    await assert.rejects(checkApkOrigin("https://alejandrino.example", async () => ++calls === 1
      ? new Response("<html/>", { headers: { "content-type": "text/html" } }) : reply()));
  }
});
