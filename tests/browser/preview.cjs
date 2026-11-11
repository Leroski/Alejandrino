// Browser integration with synthetic Supabase and Android bridges; no production data.
// Start Next with fixture.supabase.co / sb_publishable_fixture, then run with Playwright installed.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const baseURL = process.env.PREVIEW_QA_URL || 'http://127.0.0.1:3015';
const userId = '123e4567-e89b-42d3-a456-426614174000';
const techniqueId = '019321ab-cdef-7abc-8def-0123456789ab';

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  try {
    for (const mode of ['preview', 'old-apk', 'web']) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => requests.push({ url: request.url(), body: request.postData() || '' }));
      let row = { id: techniqueId, user_id: userId, name: 'Mi entrada de judo', discipline: '', position: '', category: '',
        source: 'Instagram', url: 'https://www.instagram.com/reel/Fixture/', revision: 1,
        created_at: '2026-11-09T00:00:00Z', updated_at: '2026-11-09T00:00:00Z' };
      await page.route('https://fixture.supabase.co/**', async route => {
        const req = route.request(), url = new URL(req.url());
        let data = {};
        if (url.pathname.includes('/techniques')) {
          if (req.method() === 'PATCH') row = { ...row, ...JSON.parse(req.postData()), revision: row.revision + 1 };
          data = req.headers().accept?.includes('object') ? row : [row];
        } else if (url.pathname.includes('/video_metadata')) {
          data = [{ technique_id: techniqueId, user_id: userId, status: 'unavailable', reason: 'instagram',
            title: '', author: '', thumbnail_url: '', attempted_at: '2026-11-09T00:00:00Z', retry_at: '2030-11-09T00:00:00Z' }];
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data),
          headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
      });
      await page.addInitScript(({ userId, mode }) => {
        if (location.hostname !== '127.0.0.1') return;
        const exp = Math.floor(Date.now() / 1000) + 7200;
        const encode = value => btoa(JSON.stringify(value)).replaceAll('=', '').replaceAll('+', '-').replaceAll('/', '_');
        const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: userId, exp, role: 'authenticated' }) + '.fixture';
        localStorage.setItem('sb-fixture-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture',
          expires_at: exp, expires_in: 7200, token_type: 'bearer', user: { id: userId, email: 'prueba@example.com',
            aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email' }, user_metadata: {} } }));
        window.__previewMode = 'available';
        if (mode !== 'web') {
          window.AlejandrinoBridgeV1 = { onmessage: null, postMessage(raw) {
            const { accessToken, ...m } = JSON.parse(raw);
            setTimeout(() => this.onmessage?.({ data: JSON.stringify({ ...m, type: 'AVAILABILITY', status: 'available' }) }), 10);
          } };
          window.AlejandrinoMediaV1 = { onmessage: null, postMessage() {} };
        }
        if (mode !== 'preview') return;
        window.AlejandrinoPreviewV1 = { onmessage: null, postMessage(raw) {
          const { accessToken, ...m } = JSON.parse(raw);
          if (m.type === 'CANCEL') return;
          window.__lastPreview = m;
          if (window.__previewMode === 'silent') return;
          if (window.__previewMode === 'failed') {
            setTimeout(() => this.onmessage?.({ data: JSON.stringify({ ...m, type: 'ERROR', action: 'PREVIEW', errorCode: 'PREVIEW_FAILED' }) }), 15);
            return;
          }
          const selected = m.frame ?? Number(localStorage.getItem('fixture-frame') || 0);
          localStorage.setItem('fixture-frame', String(selected));
          const canvas = document.createElement('canvas'); canvas.width = 200; canvas.height = 300;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = ['#334155', '#14532d', '#7c2d12'][selected]; ctx.fillRect(0, 0, 200, 300);
          ctx.fillStyle = '#ffffff'; ctx.font = '16px sans-serif'; ctx.fillText('Portada de prueba ' + (selected + 1), 20, 145);
          const available = window.__previewMode !== 'missing';
          const preview = { available, image: available ? canvas.toDataURL('image/jpeg', 0.7) : '',
            frame: selected, duration: 62, metadataFailed: window.__previewMode === 'provider-error', frameFailed: false,
            metadata: { title: 'Demostración de una entrada con agarre de manga', author: 'Autor de prueba',
              description: 'Observa la posición del agarre.', duration: 62, thumbnail_url: '' } };
          setTimeout(() => this.onmessage?.({ data: JSON.stringify({ ...m, type: 'PREVIEW_RESULT', action: 'PREVIEW', preview }) }), 15);
        } };
      }, { userId, mode });
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { name: 'Mi entrada de judo', exact: true }).waitFor();
      if (mode === 'preview') {
        await page.getByText('Por Autor de prueba', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Reproducir video local', exact: true }).waitFor();
        await page.waitForFunction(() => document.querySelector('article img')?.naturalWidth > 0);
        const first = await page.locator('article img').getAttribute('src');
        await page.getByRole('button', { name: 'Cambiar portada', exact: true }).click();
        await page.waitForFunction(() => localStorage.getItem('fixture-frame') === '1');
        await page.getByRole('button', { name: 'Cambiar portada', exact: true }).waitFor({ state: 'visible' });
        await page.waitForFunction(old => document.querySelector('article img')?.getAttribute('src') !== old, first);
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByText('Por Autor de prueba', { exact: true }).waitFor();
        assert.equal(await page.evaluate(() => localStorage.getItem('fixture-frame')), '1');

        await page.getByRole('button', { name: 'Editar', exact: true }).click();
        await page.getByLabel('Título de tu ficha', { exact: true }).fill('Mi entrada corregida');
        await page.getByLabel('Disciplina', { exact: true }).pressSequentially('Judo adaptado');
        assert.equal(await page.getByLabel('Disciplina', { exact: true }).inputValue(), 'Judo adaptado');
        await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
        await page.getByRole('heading', { name: 'Mi entrada corregida', exact: true }).waitFor();
        await page.evaluate(() => window.__previewMode = 'provider-error');
        await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
        await page.getByText('No pudimos actualizar los datos del proveedor. Conservamos la vista previa disponible.', { exact: true }).waitFor();
        assert.equal(await page.getByRole('heading', { name: 'Mi entrada corregida', exact: true }).count(), 1);
        assert.equal(await page.locator('article img').count(), 1);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (process.env.PREVIEW_QA_OUTPUT) {
          fs.mkdirSync(process.env.PREVIEW_QA_OUTPUT, { recursive: true });
          await page.screenshot({ path: path.join(process.env.PREVIEW_QA_OUTPUT, 'preview-mobile.png'), fullPage: true });
        }
        // A successful CHECK must not mask deletion discovered by a later preview.
        await page.getByRole('button', { name: 'Comprobar video local', exact: true }).click();
        await page.getByRole('button', { name: 'Comprobar video local', exact: true }).waitFor();
        await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).some(button => button.textContent.trim() === 'Consultando…'));
        await page.evaluate(() => window.__previewMode = 'missing');
        await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
        await page.getByText('No descargado en este dispositivo', { exact: true }).waitFor();
        assert.equal(await page.locator('article img').count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Reproducir video local', exact: true }).count(), 0);
        // A newer CHECK can find the file even if refreshing its cover fails.
        await page.evaluate(() => window.__previewMode = 'failed');
        await page.getByRole('button', { name: 'Comprobar video local', exact: true }).click();
        await page.getByText('No se pudo obtener la vista previa. El video sigue guardado; puedes volver a intentarlo.', { exact: true }).waitFor();
        await page.getByText('Disponible en este dispositivo', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Reproducir video local', exact: true }).waitFor();
        // A fresh preview with the same availability value must supersede that CHECK.
        await page.evaluate(() => window.__previewMode = 'missing');
        await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
        await page.getByText('No descargado en este dispositivo', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: 'Reproducir video local', exact: true }).count(), 0);
        await page.evaluate(() => window.__previewMode = 'silent');
        await page.getByRole('button', { name: 'Actualizar datos', exact: true }).click();
        await page.getByRole('button', { name: 'Consultando…', exact: true }).waitFor();
        await page.getByRole('button', { name: 'Salir', exact: true }).click();
        await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
        await page.evaluate(() => window.AlejandrinoPreviewV1.onmessage?.({ data: JSON.stringify({
          ...window.__lastPreview, type: 'PREVIEW_RESULT', action: 'PREVIEW', preview: {} }) }));
        assert.equal(await page.locator('article img').count(), 0);
      } else {
        assert.equal(await page.getByRole('button', { name: 'Cambiar portada', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Actualizar datos', exact: true }).count(), 0);
        assert.equal(await page.getByRole('button', { name: 'Comprobar video local', exact: true }).count(), mode === 'old-apk' ? 1 : 0);
      }
      assert.deepEqual(errors, []);
      assert.ok(!requests.some(r => r.body.includes('data:image/jpeg') || r.url.includes('data:image/jpeg')));
      console.log('PASS browser mode: ' + mode + ' (synthetic session, storage and native responses)');
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
