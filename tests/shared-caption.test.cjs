const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'alejandrino-caption-'));
for (const dir of ['lib', 'types']) fs.mkdirSync(path.join(temp, dir));
fs.symlinkSync(path.join(root, 'node_modules'), path.join(temp, 'node_modules'), 'junction');
for (const name of ['lib/techniques', 'lib/shared-link', 'lib/video-title', 'lib/supabase', 'types/technique'])
  fs.writeFileSync(path.join(temp, name + '.js'), ts.transpileModule(fs.readFileSync(path.join(root, 'app', name + '.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText);
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
const { draftFromText } = require(path.join(temp, 'lib/techniques.js'));
const { sharedLink, sharedCaption } = require(path.join(temp, 'lib/shared-link.js'));
test('quick save preserves a supplied caption and never uses platform/date as title', () => {
  const url = 'https://www.instagram.com/reel/Fixture/';
  assert.equal(draftFromText(url).name, 'Video guardado');
  assert.equal(draftFromText('Entrada de judo ' + url).name, 'Entrada de judo');
  assert.equal(draftFromText(url).source, 'Instagram');
  const params = new URLSearchParams({ url, title: 'Entrada de judo' });
  assert.equal(sharedLink(params), url);
  assert.equal(sharedCaption(params, url), 'Entrada de judo');
  params.set('text', 'Otra técnica https://www.instagram.com/reel/Other/');
  assert.equal(sharedCaption(params, url), 'Entrada de judo');
  params.delete('title');
  assert.equal(sharedCaption(params, url), '');
});
