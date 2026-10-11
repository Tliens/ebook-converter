/* Browser E2E smoke test via puppeteer-core + system Chrome.
 * Run: node scripts/e2e.mjs   (needs `python3 -m http.server 8983` in project root)
 * Covers: page load, i18n switch, theme, batch conversion across formats,
 * downloads, error path (DRM-ish bad mobi), console errors. */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const BASE = 'http://127.0.0.1:8983';
const OUT = '/tmp/bm-e2e';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, name, extra) => {
  if (c){ pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? '→ ' + String(extra).slice(0, 220) : ''); }
};

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + String(e).slice(0, 200)));

console.log('1. load page');
await page.goto(BASE + '/index.html?v=' + Date.now(), { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 600));
ok(await page.title().then(t => t.includes('电子书格式转换')), 'zh title', await page.title());
ok(await page.$eval('h1', el => el.textContent.includes('电子书格式转换')), 'h1 keyword');
ok(await page.$$eval('.chip[data-fmt]', els => els.length === 6), '6 format chips');
ok(await page.$eval('#goBtn', el => el.disabled), 'goBtn disabled initially');

console.log('2. theme & lang');
const isDark = () => page.evaluate(() => document.documentElement.classList.contains('dark'));
await page.click('#themeBtn'); // auto→light
ok(!(await isDark()), 'theme toggle light');
await page.click('#themeBtn'); // light→dark
ok(await isDark(), 'theme toggle dark');
await page.click('#themeBtn'); // dark→auto
await page.click('#langBtn');
await new Promise(r => setTimeout(r, 300));
ok(await page.evaluate(() => document.documentElement.lang === 'en'), 'lang→en');
ok(await page.$eval('h1', el => /Convert ebook formats/.test(el.textContent)), 'h1 en');
ok(page.url().includes('lang=en'), 'URL ?lang=en synced');
await page.goto(BASE + '/index.html?lang=en', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 400));
ok(await page.evaluate(() => document.documentElement.lang === 'en'), '?lang=en deep link');
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 400));
await page.evaluate(() => localStorage.removeItem('bm-lang'));
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 400));
const navLang = await page.evaluate(() => (navigator.language || '').toLowerCase());
const expectedLang = navLang.startsWith('zh') ? 'zh-CN' : 'en';
ok(await page.evaluate(l => document.documentElement.lang === l, expectedLang), `default lang follows browser (${navLang})`);

console.log('3. batch conversion: epub/mobi/fb2/pdf/docx/txt/md/html → EPUB');
const files = ['sample.epub', 'sample.mobi', 'sample.fb2', 'sample.pdf', 'sample.docx', 'sample.txt', 'sample.md', 'sample.html'];
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: OUT });
const added = await page.evaluate(async (names) => {
  const files = [];
  for (const n of names){
    const res = await fetch('/samples/' + n);
    const blob = await res.blob();
    files.push(new File([blob], n, { type: 'application/octet-stream' }));
  }
  window.__BM.addFiles(files);
  return window.__BM.state.items.map(i => ({ name: i.name, status: i.status }));
}, files);
ok(added.length === 8 && added.every(i => i.status === 'wait'), '8 files queued', JSON.stringify(added));
await page.click('#goBtn');
await page.waitForFunction(() => window.__BM && window.__BM.state.busy === false, { timeout: 120000 });
await new Promise(r => setTimeout(r, 500));
const finalStates = await page.evaluate(() => window.__BM.state.items.map(i => ({ name: i.name, status: i.status, reason: i.reason, reasonText: i.reasonText })));
for (const s of finalStates){
  ok(s.status === 'ok', `${s.name} → ok`, JSON.stringify(s));
}
ok(finalStates.filter(s => s.status === 'ok').length === 8, 'all 8 converted');
const resultRows = await page.$$eval('#results .ritem', els => els.length);
ok(resultRows === 8, '8 result rows', resultRows);

console.log('4. download check (first result)');
const dlHref = await page.$eval('#results .ritem a', a => a.href);
const dlName = await page.$eval('#results .ritem a', a => a.download);
const dlResp = await page.evaluate(async u => { const r = await fetch(u); return { size: (await r.blob()).size, mime: r.headers.get('content-type') }; }, dlHref);
ok(dlResp.size > 500, 'download blob non-trivial', JSON.stringify(dlResp));
console.log('   first result:', dlName, JSON.stringify(dlResp));

console.log('5. re-convert to MOBI target');
await page.evaluate(() => { document.querySelector('.chip[data-fmt="mobi"]').click(); });
await page.waitForFunction(() => document.querySelector('.chip[data-fmt="mobi"]').classList.contains('on'));
await page.evaluate(() => window.__BM.convertAll());
await page.waitForFunction(() => window.__BM.state.busy === false, { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
const mobiStates = await page.evaluate(() => window.__BM.state.items.map(i => i.status));
ok(mobiStates.every(s => s === 'ok'), 'all 8 → MOBI target ok', JSON.stringify(mobiStates));

console.log('6. DRM / error path');
await page.evaluate(async () => {
  const res = await fetch('/samples/sample.mobi');
  const bytes = new Uint8Array(await res.arrayBuffer());
  const off0 = ((bytes[78] << 24) | (bytes[79] << 16) | (bytes[80] << 8) | bytes[81]) >>> 0;
  bytes[off0 + 12] = 0; bytes[off0 + 13] = 1; /* encryption=1 in PalmDOC header */
  const f = new File([bytes], 'drm.mobi', { type: 'application/octet-stream' });
  window.__BM.state.items = [];
  window.__BM.addFiles([f]);
  await window.__BM.convertAll();
});
await page.waitForFunction(() => window.__BM.state.busy === false, { timeout: 60000 });
await new Promise(r => setTimeout(r, 300));
const drmState = await page.evaluate(() => window.__BM.state.items[0].status);
const drmReason = await page.evaluate(() => window.__BM.state.items[0].reasonText);
ok(drmState === 'bad', 'DRM mobi → bad status', drmState + ' ' + drmReason);
ok(/DRM/.test(drmReason || ''), 'DRM message shown', drmReason);

console.log('7. screenshots');
await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: '/tmp/bm-e2e/hero-light.png' });
await page.click('#themeBtn');
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/bm-e2e/hero-dark.png' });
await page.click('#themeBtn');
await page.click('#langBtn');
await new Promise(r => setTimeout(r, 300));
await page.screenshot({ path: '/tmp/bm-e2e/full-en.png', fullPage: false });
await page.evaluate(() => document.querySelector('#faq').scrollIntoView());
await new Promise(r => setTimeout(r, 400));
await page.screenshot({ path: '/tmp/bm-e2e/faq-en.png' });
const hasOverflowX = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
ok(!hasOverflowX, 'no horizontal overflow @1280');
await page.setViewport({ width: 375, height: 720 });
await new Promise(r => setTimeout(r, 400));
const overflowMobile = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
ok(!overflowMobile, 'no horizontal overflow @375');
await page.screenshot({ path: '/tmp/bm-e2e/mobile-375.png' });

console.log('8. console errors');
const realErrors = consoleErrors.filter(e => !/favicon|net::ERR|cloudflareinsights|cloudflare/i.test(e));
ok(realErrors.length === 0, 'no console errors', JSON.stringify(realErrors));

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
