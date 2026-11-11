const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'alejandrino-preview-'));
for (const dir of ['lib', 'types']) fs.mkdirSync(path.join(temp, dir));
for (const name of ['lib/native-protocol', 'lib/native-preview-client', 'types/video-metadata', 'lib/video-title', 'lib/preview-refresh-policy']) {
  fs.writeFileSync(path.join(temp, name + '.js'), ts.transpileModule(fs.readFileSync(path.join(root, 'app', name + '.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
}
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const { NativePreviewClient, parseNativePreview } = require(path.join(temp, 'lib/native-preview-client.js'));
const { safeThumbnail, formatDuration } = require(path.join(temp, 'types/video-metadata.js'));
const { videoTitle, sharedTitle, contentTitle } = require(path.join(temp, 'lib/video-title.js'));
const { needsPreviewMetadata, claimPreviewRefresh } = require(path.join(temp, 'lib/preview-refresh-policy.js'));
const input = { userId: '123e4567-e89b-42d3-a456-426614174000', techniqueId: '019321ab-cdef-7abc-8def-0123456789ab', accessToken: 'synthetic.test.token' };
const preview = () => ({ metadata: { title: 'Título original', author: 'Autor', description: '', thumbnail_url: '', duration: 62 },
  available: true, image: 'data:image/jpeg;base64,/9j/AA==', frame: 0, duration: 62, metadataFailed: false, frameFailed: false });
function transport(timeout = 1000) {
  const sent = [];
  const bridge = { onmessage: null, postMessage: s => sent.push(JSON.parse(s)) };
  const client = new NativePreviewClient(bridge, timeout);
  const reply = (request, data = {}) => bridge.onmessage({ data: JSON.stringify({ ...request, accessToken: undefined,
    type: 'PREVIEW_RESULT', action: 'PREVIEW', preview: preview(), ...data }) });
  return { sent, bridge, client, reply };
}
test('retains only bounded preview fields and never exposes native paths', () => {
  assert.deepEqual(parseNativePreview({ ...preview(), uri: 'content://media/private', token: 'secret' }), preview());
  for (const changed of [{ image: 'file:///private' }, { image: 'data:image/svg+xml,<svg/>' },
    { image: 'data:image/png;base64,AAAA' }, { image: 'x'.repeat(131101) }, { available: false },
    { frame: -1 }, { frame: 0.1 }, { duration: Infinity }, { duration: -1 }, { metadata: [] },
    { metadata: { ...preview().metadata, title: 'x'.repeat(501) } }])
    assert.throws(() => parseNativePreview({ ...preview(), ...changed }), e => e.code === 'BAD_RESPONSE');
});
test('allows provider image domains only and renders valid durations', () => {
  for (const host of ['scontent.cdninstagram.com', 'scontent.xx.fbcdn.net', 'i.ytimg.com'])
    assert.ok(safeThumbnail('https://' + host + '/image.jpg'));
  for (const url of ['https://cdninstagram.com.attacker.example/image', 'https://u:p@cdninstagram.com/image',
    'http://cdninstagram.com/image', 'https://127.0.0.1/image', 'data:image/jpeg;base64,/9j/AA=='])
    assert.equal(safeThumbnail(url), '');
  assert.equal(formatDuration(62.8), '1:02'); assert.equal(formatDuration(3662), '1:01:02');
  assert.equal(formatDuration(0), ''); assert.equal(formatDuration(NaN), '');
});
test('serializes cards and cancels queued items without sending their token', async () => {
  const t = transport(), c = new AbortController();
  const first = t.client.run(input, {}, new AbortController().signal);
  const second = t.client.run({ ...input, techniqueId: crypto.randomUUID() }, {}, c.signal);
  const rejection = assert.rejects(second, e => e.code === 'CANCELLED');
  assert.equal(t.sent.length, 1); c.abort(); await rejection;
  t.reply(t.sent[0]); assert.deepEqual(await first, preview());
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(t.sent.length, 1);
});
test('starts the next queued preview after completion', async () => {
  const t = transport(), signal = new AbortController().signal;
  const first = t.client.run(input, {}, signal);
  const second = t.client.run({ ...input, techniqueId: crypto.randomUUID() }, { frame: 2 }, signal);
  const old = t.sent[0]; t.reply(old); await first;
  await new Promise(resolve => queueMicrotask(resolve));
  assert.equal(t.sent.length, 2); assert.equal(t.sent[1].frame, 2);
  t.reply(old, { preview: { ...preview(), frame: 1 } });
  t.reply(t.sent[1]); assert.deepEqual(await second, preview());
});
test('timeout and account cancellation discard late private images', async () => {
  for (const timedOut of [true, false]) {
    const t = transport(timedOut ? 5 : 1000), c = new AbortController();
    const p = t.client.run(input, { refresh: true }, c.signal);
    const rejected = assert.rejects(p, e => e.code === (timedOut ? 'TIMEOUT' : 'CANCELLED'));
    if (!timedOut) c.abort();
    await rejected;
    assert.equal(t.sent[1].type, 'CANCEL'); assert.ok(!('accessToken' in t.sent[1]));
    t.reply(t.sent[0]);
  }
});
test('rejects responses from another user, version, ficha or capability', async () => {
  for (const changed of [{ userId: crypto.randomUUID() }, { techniqueId: crypto.randomUUID() }, { protocolVersion: 2 }, { action: 'OPEN' }]) {
    const t = transport(), p = t.client.run(input, {}, new AbortController().signal);
    t.reply(t.sent[0], changed); await assert.rejects(p, e => e.code === 'BAD_RESPONSE');
  }
});
test('invalid requests never reach the native bridge; provider failure keeps a usable preview', async () => {
  const t = transport(), signal = new AbortController().signal;
  for (const options of [{ frame: 3 }, { frame: -1 }, { frame: 0.5 }, { refresh: 'yes' }])
    await assert.rejects(t.client.run(input, options, signal), e => e.code === 'BAD_REQUEST');
  assert.equal(t.sent.length, 0);
  const p = t.client.run(input, { refresh: true }, signal);
  const retained = { ...preview(), metadataFailed: true };
  t.reply(t.sent[0], { preview: retained }); assert.deepEqual(await p, retained);
});

test('descriptive captions replace generated titles, never personal names', () => {
  const metadata = { title: 'Video by judoka', description: '  Entrada de uchi-mata\ncon agarre de manga. https://example.com  ' };
  assert.equal(contentTitle(metadata), 'Entrada de uchi-mata con agarre de manga.');
  for (const name of ['Video guardado', 'Instagram · 10-11, 23:50', 'TikTok · 11/11 00:20'])
    assert.equal(videoTitle(name, metadata), contentTitle(metadata));
  for (const name of ['Mi entrada de judo', 'Instagram · mi análisis', 'Uchi-mata'])
    assert.equal(videoTitle(name, metadata), name);
  assert.equal(videoTitle('Video guardado', { title: 'Video by judoka' }), 'Video guardado');
  assert.equal(contentTitle({ title: 'Título útil', description: 'Descripción' }), 'Título útil');
  assert.equal(sharedTitle('Entrada de seoi nage https://instagram.com/reel/Example/'), 'Entrada de seoi nage');
  assert.equal(sharedTitle('https://instagram.com/reel/Example/'), '');
  assert.equal(contentTitle({ description: 'x'.repeat(300) }).length, 200);
});

test('missing covers/context refresh automatically with per-account cooldown and manual retry', () => {
  const ready = preview();
  assert.equal(needsPreviewMetadata(ready), false);
  assert.equal(needsPreviewMetadata({ ...ready, image: '' }), true);
  assert.equal(needsPreviewMetadata({ ...ready, metadata: { ...ready.metadata, title: 'Video by author' } }), true);
  assert.equal(needsPreviewMetadata({ ...ready, image: '', metadata: { ...ready.metadata,
    thumbnail_url: 'https://scontent.cdninstagram.com/cover.jpg' } }), false);
  const key = 'user-A:clip-A';
  assert.equal(claimPreviewRefresh(key, false, 1000), true);
  assert.equal(claimPreviewRefresh(key, false, 1001), false);
  assert.equal(claimPreviewRefresh('user-B:clip-A', false, 1001), true);
  assert.equal(claimPreviewRefresh(key, true, 1002), true);
  assert.equal(claimPreviewRefresh(key, false, 301002), true);
});
