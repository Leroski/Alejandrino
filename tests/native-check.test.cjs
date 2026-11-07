const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "alejandrino-check-"));
fs.symlinkSync(path.join(root, "node_modules"), path.join(temp, "node_modules"), "junction");
for (const name of ["native-protocol", "native-check-client", "native-authorize.server"]) {
  fs.writeFileSync(path.join(temp, name + ".js"), ts.transpileModule(
    fs.readFileSync(path.join(root, "app/lib", name + ".ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
const { authorizeNativeCheck } = require(path.join(temp, "native-authorize.server.js"));
const { NativeCheckClient } = require(path.join(temp, "native-check-client.js"));
const { parseCheckRequest, isUuid } = require(path.join(temp, "native-protocol.js"));
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const request = { protocolVersion: 1, type: "CHECK", requestId: "550e8400-e29b-41d4-a716-446655440000",
  userId: "123e4567-e89b-42d3-a456-426614174000", techniqueId: "019321ab-cdef-7abc-8def-0123456789ab" };
const other = "00000000-0000-4000-8000-000000000001";
const token = "synthetic.test.token";
function http(body = request, bearer = "Bearer " + token) {
  return new Request("https://app.example/api/native/authorize", { method: "POST",
    headers: { Authorization: bearer }, body: typeof body === "string" ? body : JSON.stringify(body) });
}
function database({ user = request.userId, row = { id: request.techniqueId, user_id: request.userId }, authError = null, dbError = null } = {}) {
  const calls = [];
  const query = { select: value => { calls.push(["select", value]); return query; },
    eq: (key, value) => { calls.push(["eq", key, value]); return query; },
    maybeSingle: async () => ({ data: row, error: dbError }) };
  const create = authorization => {
    calls.push(["authorization", authorization]);
    return { auth: { getUser: async value => { calls.push(["getUser", value]); return { data: { user: user ? { id: user } : null }, error: authError }; } },
      from: table => { calls.push(["from", table]); return query; } };
  };
  return { calls, create };
}

test("autoriza con Auth remoto, consulta RLS del mismo usuario y no devuelve el token", async () => {
  const db = database();
  const result = await authorizeNativeCheck(http(), db.create);
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ...request, type: "AUTHORIZED" });
  assert.equal(result.headers.get("cache-control"), "private, no-store");
  assert.equal(result.headers.get("vary"), "Authorization");
  assert.deepEqual(db.calls, [["authorization", "Bearer " + token], ["getUser", token],
    ["from", "techniques"], ["select", "id,user_id"], ["eq", "id", request.techniqueId], ["eq", "user_id", request.userId]]);
});

test("IDs vacíos, ausentes, falsos y mensajes no admitidos se rechazan antes de consultar Auth", async () => {
  const malformed = ["", null, 123, "550e8400-e29b-41d4-a716-abcd-446655440000", request.userId + "\n"];
  for (const field of ["requestId", "userId", "techniqueId"]) {
    for (const value of malformed) {
      const result = await authorizeNativeCheck(http({ ...request, [field]: value }), () => assert.fail("No database access"));
      assert.equal(result.status, 400);
      assert.equal((await result.json()).errorCode, "BAD_REQUEST");
    }
    const missing = { ...request }; delete missing[field];
    assert.equal((await authorizeNativeCheck(http(missing), () => assert.fail())).status, 400);
  }
  for (const [body, code] of [[{ ...request, type: "DOWNLOAD" }, "UNSUPPORTED_ACTION"],
    [{ ...request, protocolVersion: "1" }, "UNSUPPORTED_VERSION"], [{ ...request, protocolVersion: 2 }, "UNSUPPORTED_VERSION"]]) {
    assert.equal((await (await authorizeNativeCheck(http(body), () => assert.fail())).json()).errorCode, code);
  }
});

test("JSON inválido y cuerpos grandes no alcanzan la autorización", async () => {
  for (const body of ["null", "[]", "{", "a".repeat(3000), JSON.stringify({ ...request, padding: "🥋".repeat(600) })]) {
    assert.equal((await authorizeNativeCheck(http(body), () => assert.fail())).status, 400);
  }
});

test("sesión ausente, expirada o de otra cuenta nunca consulta las fichas", async () => {
  for (const authorization of ["", "Basic x", "Bearer " + "a".repeat(8193)]) {
    assert.equal((await authorizeNativeCheck(http(request, authorization), () => assert.fail())).status, 401);
  }
  for (const [options, status, code] of [[{ user: null }, 401, "AUTH_REQUIRED"],
    [{ authError: { status: 401 } }, 401, "AUTH_REQUIRED"], [{ user: other }, 403, "SESSION_MISMATCH"],
    [{ authError: { status: 503 } }, 503, "UNAVAILABLE"]]) {
    const db = database(options);
    const response = await authorizeNativeCheck(http(), db.create);
    assert.equal(response.status, status); assert.equal((await response.json()).errorCode, code);
    assert.ok(!db.calls.some(call => call[0] === "from"));
  }
});

test("una ficha ajena, inexistente o una respuesta incoherente no autoriza archivos locales", async () => {
  for (const row of [null, { id: request.techniqueId, user_id: other }, { id: other, user_id: request.userId }]) {
    const response = await authorizeNativeCheck(http(), database({ row }).create);
    assert.equal(response.status, 404); assert.equal((await response.json()).errorCode, "NOT_FOUND");
  }
  assert.equal((await authorizeNativeCheck(http(), database({ dbError: { message: "private details" } }).create)).status, 503);
  const response = await authorizeNativeCheck(http(), () => { throw new Error(token); });
  assert.ok(!(await response.text()).includes(token));
});

test("normaliza mayúsculas sin aceptar espacios ni saltos de línea", () => {
  assert.equal(parseCheckRequest({ ...request, userId: request.userId.toUpperCase() }).userId, request.userId);
  for (const invalid of [request.userId + "\n", " " + request.userId, request.userId.replaceAll("-", "‐")]) assert.equal(isUuid(invalid), false);
});

function transport(timeout = 200) {
  const sent = [];
  const bridge = { onmessage: null, postMessage: value => sent.push(JSON.parse(value)) };
  return { bridge, sent, client: new NativeCheckClient(bridge, timeout),
    reply: (message, changes = {}) => bridge.onmessage({ data: JSON.stringify({ protocolVersion: 1, requestId: message.requestId,
      userId: message.userId, techniqueId: message.techniqueId, type: "AVAILABILITY", status: "missing", ...changes }) }) };
}
const input = { userId: request.userId, techniqueId: request.techniqueId, accessToken: token };
const signal = () => new AbortController().signal;

test("dos consultas simultáneas y respuestas invertidas mantienen la correlación", async () => {
  const t = transport();
  const a = t.client.check(input, signal()); const b = t.client.check({ ...input, techniqueId: other }, signal());
  t.reply(t.sent[1], { status: "available" }); t.reply(t.sent[0]);
  assert.equal(await a, "missing"); assert.equal(await b, "available");
  assert.notEqual(t.sent[0].requestId, t.sent[1].requestId);
});

test("errores nativos, respuestas de otra cuenta/ficha y versión incompatible son explícitos", async () => {
  for (const [changes, code] of [[{ type: "ERROR", errorCode: "AUTH_REQUIRED" }, "AUTH_REQUIRED"],
    [{ userId: other }, "BAD_RESPONSE"], [{ techniqueId: other }, "BAD_RESPONSE"],
    [{ protocolVersion: 2 }, "UNSUPPORTED_VERSION"], [{ status: "downloading" }, "BAD_RESPONSE"]]) {
    const t = transport(); const pending = t.client.check(input, signal());
    t.reply(t.sent[0], changes); await assert.rejects(pending, { code });
  }
});

test("cancelar por cambio de cuenta descarta respuestas tardías", async () => {
  const t = transport(); const abort = new AbortController();
  const old = t.client.check(input, abort.signal); abort.abort();
  await assert.rejects(old, { code: "CANCELLED" });
  const current = t.client.check({ ...input, userId: other }, signal());
  t.reply(t.sent[0], { status: "available" }); t.reply(t.sent[1]);
  assert.equal(await current, "missing");
});

test("sin respuesta, JSON ilegible o ID desconocido termina en timeout y permite reintento", async () => {
  const t = transport(10); const pending = t.client.check(input, signal());
  t.bridge.onmessage({ data: "{" }); t.reply({ ...t.sent[0], requestId: other });
  await assert.rejects(pending, { code: "TIMEOUT" });
  const retry = t.client.check(input, signal()); t.reply(t.sent[1]); assert.equal(await retry, "missing");
});

test("fallo al enviar y cancelación previa no dejan solicitudes pendientes", async () => {
  const t = transport();
  t.bridge.postMessage = () => { throw new Error("transport failed"); };
  await assert.rejects(t.client.check(input, signal()), { code: "UNAVAILABLE" });
  const abort = new AbortController(); abort.abort();
  await assert.rejects(t.client.check(input, abort.signal), { code: "CANCELLED" });
  await assert.rejects(t.client.check({ ...input, accessToken: "bad token" }, signal()), { code: "AUTH_REQUIRED" });
});
