import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errs = [];
page.on('pageerror', e => errs.push(String(e).slice(0, 150)));
const url = 'http://ebook-converter.kuige.me/?prodcheck=' + Date.now();
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 2500));
const title = await page.title();
const lang = await page.evaluate(() => document.documentElement.lang);
// production conversion: fetch sample from LOCAL server? prod has no /samples — build a txt file in-page
await page.evaluate(() => {
  const txt = '第一章 冒烟\n生产环境冒烟测试内容。\n\n第二章 收尾\n第二段内容。';
  const f = new File([txt], 'prod-test.txt', { type: 'text/plain' });
  window.__BM.addFiles([f]);
  return window.__BM.state.items.length;
});
await page.evaluate(() => window.__BM.convertAll());
await page.waitForFunction(() => window.__BM.state.busy === false, { timeout: 90000 });
await new Promise(r => setTimeout(r, 400));
const st = await page.evaluate(() => window.__BM.state.items.map(i => ({ n: i.name, s: i.status, r: i.reasonText })));
const rows = await page.$$eval('#results .ritem', els => els.map(e => e.querySelector('.rname').textContent + ' / ' + e.querySelector('a').download));
console.log(JSON.stringify({ title, lang, st, rows, errs }, null, 1));
await page.screenshot({ path: '/tmp/bm-e2e/prod.png' });
await browser.close();
