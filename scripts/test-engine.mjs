/* Engine unit tests — run: node scripts/test-engine.mjs
 * Extracts the two engine <script> blocks from index.html and runs them with
 * linkedom DOM + real JSZip. Keep in sync when engine code moves. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { JSDOM } = require('jsdom');
/* browser-grade DOMParser (fragments land in <body>) + real XMLSerializer from jsdom */
const jsdomWindow = new JSDOM('').window;
const DOMParser = jsdomWindow.DOMParser;
const XMLSerializer = jsdomWindow.XMLSerializer;

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const partA = /<script id="engineSrc">([\s\S]*?)<\/script>/.exec(html)[1];
const partB = /\/\* BM_ENGINE part B[\s\S]*?<\/script>/.exec(html)[0].replace(/<\/script>\s*$/, '');

globalThis.window = globalThis.window || {};
(0, eval)(partA);
(0, eval)(partB);
const E = window.BM_ENGINE;
E.setDeps({ JSZip, DOMParser, XMLSerializer });

let pass = 0, fail = 0;
function ok(cond, name, extra){
  if (cond){ pass++; console.log('  ✓', name); }
  else { fail++; console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 300) : ''); }
}
const TE = new TextEncoder();
const td = t => new TextDecoder().decode(t);
const PNG1x1 = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const JPEG1x1 = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));

console.log('1. PalmDOC round-trip');
{
  const samples = [
    TE.encode('The quick brown fox jumps over the lazy dog. '.repeat(200)),
    TE.encode('中文测试：第一章 白夜行。\n\n第二章：东野圭吾写的书很好看，'.repeat(300)),
    TE.encode('a'),
    new Uint8Array(Array.from({length: 5000}, (_, i) => (i * 7 + 3) & 0xFF)),
    new Uint8Array([0x20, 0x61, 0x20, 0x20, 0x62, 0x00, 0x01, 0x02, 0x03, 0x09, 0x80, 0xC3, 0xA9])
  ];
  for (let i = 0; i < samples.length; i++){
    const c = E._palmCompress(samples[i]);
    const d = E._palmDecompress(c);
    ok(Buffer.from(d).equals(Buffer.from(samples[i])), `sample ${i} (${samples[i].length}B → ${c.length}B)`);
  }
}

console.log('2. TXT parse with Chinese chapter headings');
{
  const txt = `魁歌测试书

第一章 起点
这是第一章的内容。
第二段。

第二章 转折
这是第二章的内容，比较长一些。

尾声
全书完。`;
  const book = E.parseTxt(TE.encode(txt), 'test.txt');
  ok(book.title === 'test', 'title from filename', book.title);
  ok(book.language === 'zh', 'lang zh', book.language);
  ok(book.chapters.length === 4, '4 chapters (preamble + 3)', book.chapters.map(c => c.title));
  ok(book.chapters[1].title.includes('第一章'), 'ch title', book.chapters[1].title);
  ok(book.chapters[1].html.includes('起点') || book.chapters[1].html.includes('第一章的内容'), 'ch1 body');
  const t = E.writeTxt(book);
  ok(t.text.includes('第一章') && t.text.includes('全书完'), 'writeTxt round-trip', t.text.slice(0, 120));
}

console.log('3. TXT without headings, huge → split');
{
  const para = '这是一段没有章节标题的长篇小说内容，用来测试自动分卷功能。';
  const big = Array.from({ length: 4200 }, () => para).join('\n\n');
  const book = E.parseTxt(TE.encode(big), 'long.txt');
  ok(book.chapters.length > 1, 'auto split', book.chapters.length);
}

console.log('4. Markdown parse (miniMd fallback, no marked in Node)');
{
  const md = `# 测试书名

前言内容第一段。

## 第一章

第一章正文。

## 第二章

第二章正文。`;
  const book = E.parseMd(TE.encode(md), 'notes.md');
  ok(book.title === '测试书名', 'title from h1', book.title);
  ok(book.chapters.length === 3, '3 chapters (preamble + 2)', book.chapters.map(c => c.title));
  ok(book.chapters[1].html.includes('第一章正文'), 'ch1 body');
  const mdOut = E.writeMd(book);
  ok(mdOut.text.includes('# 测试书名') && mdOut.text.includes('## 第一章'), 'writeMd round-trip', mdOut.text.slice(0, 150));
}

console.log('5. HTML parse + sanitizer');
{
  const htmlDoc = `<!DOCTYPE html><html><head><title>网页书</title></head>
  <body>
    <script>alert(1)</script>
    <h2>章一</h2><p>正文 <b>加粗</b> <em>斜体</em> <img src="https://example.com/a.png" alt="A"></p>
    <iframe src="evil"></iframe>
    <h2>章二</h2><p onclick="x()">段落二</p>
  </body></html>`;
  const book = E.parseHtmlFile(TE.encode(htmlDoc), 'page.html');
  ok(book.title === '网页书', 'title', book.title);
  ok(book.chapters.length === 2, '2 chapters', book.chapters.length);
  const all = book.chapters.map(c => c.html).join('');
  ok(!all.includes('script') && !all.includes('iframe'), 'scripts/iframes stripped');
  ok(!all.includes('onclick'), 'event attrs stripped');
  ok(all.includes('<strong>加粗</strong>'), 'b→strong', all);
  ok(all.includes('https://example.com/a.png'), 'remote img kept for html input', all);
}

console.log('6. FB2 parse');
{
  const fb2 = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info>
<author><first-name>东野</first-name><last-name>圭吾</last-name></author>
<book-title>测试小说</book-title><lang>zh</lang>
<coverpage><image l:href="#cover.jpg"/></coverpage>
</title-info></description>
<body>
<section><title><p>第一章</p></title><p>白夜行走第一段。</p><p>第二段内容。</p></section>
<section><title><p>第二章</p></title><p>空虚的段落<emphasis>强调</emphasis>。</p><image l:href="#img1.png"/></section>
</body>
<binary id="cover.jpg" content-type="image/jpeg">${Buffer.from(JPEG1x1).toString('base64')}</binary>
<binary id="img1.png" content-type="image/png">${Buffer.from(PNG1x1).toString('base64')}</binary>
</FictionBook>`;
  const book = E.parseFb2(TE.encode(fb2), 'novel.fb2');
  ok(book.title === '测试小说', 'title', book.title);
  ok(book.author === '东野 圭吾', 'author', book.author);
  ok(!!book.cover, 'cover found');
  ok(book.chapters.length === 2, '2 chapters', book.chapters.length);
  ok(book.chapters[1].html.includes('<em>强调</em>'), 'emphasis→em', book.chapters[1].html);
  ok(/src="bkimg:i\d+"/.test(book.chapters[1].html), 'image registered', book.chapters[1].html);
  const out = E.writeFb2(book);
  const doc = new DOMParser().parseFromString(out.text, 'application/xml');
  ok(!doc.querySelector('parsererror'), 'writeFb2 valid XML');
  ok((out.text.match(/<binary /g) || []).length >= 2, 'binaries preserved');
  ok(out.text.includes('<coverpage>'), 'coverpage in output');
}

console.log('7. MOBI write → parse round-trip');
{
  const book = E.newBook('测试之书', '魁歌', 'zh');
  book.cover = { mime: 'image/jpeg', bytes: JPEG1x1 };
  const imgId = E && (() => {})() || null;
  book.chapters = [
    { title: '', html: '<h2>第一章</h2><p>这是第一章的正文内容，包含中文。</p>' },
    { title: '', html: '<p>第二章没有标题行。Mixed 英文内容。</p><img src="bkimg:i1" alt="pic">' }
  ];
  const picId = 'i1';
  book.images.set(picId, { mime: 'image/png', bytes: PNG1x1 });
  const out = E.writeMobi(book);
  ok(out.ext === 'mobi' && out.bytes.length > 100, 'mobi bytes generated', out.bytes.length);
  /* structural checks */
  const b = out.bytes;
  const u32 = (v,o) => ((v[o]<<24)|(v[o+1]<<16)|(v[o+2]<<8)|v[o+3])>>>0;
  const u16l = (v,o) => (v[o]<<8)|v[o+1];
  ok(Buffer.from(b.slice(60,68)).toString('latin1') === 'BOOKMOBI', 'PDB magic');
  const rec0off = u32(b, 78);
  const r0 = b.subarray(rec0off);
  ok((r0[0]<<8)|r0[1] === 2, 'compression=2 (PalmDOC)');
  ok(Buffer.from(r0.slice(16,20)).toString('latin1') === 'MOBI', 'MOBI header');
  ok(u32(r0, 0x14) === 232, 'header length 232', u32(r0, 0x14));
  ok(u32(r0, 0x1C) === 65001, 'utf-8');
  ok((u32(r0, 0x80) & 0x40) !== 0, 'EXTH flag');
  ok(u16l(r0, 0xF2) === 0, 'extraFlags=0', u16l(r0, 0xF2));
  const exthStart = 16 + 232;
  ok(Buffer.from(r0.slice(exthStart, exthStart+4)).toString('latin1') === 'EXTH', 'EXTH present');
  /* parse it back */
  const book2 = await E.parseMobi(out.bytes, 'out.mobi');
  ok(book2.title === '测试之书', 'title round-trip', book2.title);
  ok(book2.author === '魁歌', 'author round-trip', book2.author);
  ok(book2.chapters.length === 2, '2 chapters', book2.chapters.length);
  const joined = book2.chapters.map(c => c.html).join('');
  ok(joined.includes('第一章的正文内容'), 'ch1 text', joined.slice(0, 200));
  ok(joined.includes('第二章没有标题行'), 'ch2 text');
  ok(book2.chapters[0].html.includes('<h2>第一章</h2>'), 'h2 preserved');
  ok(book2.images.size >= 1, 'image recovered', book2.images.size);
}

console.log('8. EPUB write → parse round-trip');
{
  const book = E.newBook('EPUB测试书', '作者甲', 'zh');
  book.cover = { mime: 'image/png', bytes: PNG1x1 };
  const id1 = 'i1';
  book.images.set(id1, { mime: 'image/png', bytes: PNG1x1 });
  book.chapters = [
    { title: '卷一', html: '<h2>卷一</h2><p>第一卷内容，有<strong>强调</strong>。</p><img src="bkimg:i1" alt="图">' },
    { title: '卷二', html: '<p>第二卷内容。</p>' }
  ];
  const out = await E.writeEpub(book);
  ok(out.ext === 'epub' && out.bytes.length > 200, 'epub bytes generated', out.bytes.length);
  /* mimetype must be first & stored */
  ok(Buffer.from(out.bytes.slice(0, 2)).toString('latin1') === 'PK', 'zip magic');
  const zip = await JSZip.loadAsync(out.bytes);
  const mime = await zip.file('mimetype').async('string');
  ok(mime === 'application/epub+zip', 'mimetype content', mime);
  ok(zip.file('META-INF/container.xml') != null, 'container.xml');
  const opf = await zip.file('OEBPS/content.opf').async('string');
  ok(opf.includes('dc:title') && opf.includes('EPUB测试书'), 'opf metadata');
  const nav = await zip.file('OEBPS/nav.xhtml').async('string');
  ok(nav.includes('卷一') && nav.includes('卷二'), 'nav toc');
  const ch1 = await zip.file('OEBPS/text/ch1.xhtml').async('string');
  ok(ch1.includes('<strong>强调</strong>'), 'xhtml wellformed strong');
  ok(ch1.includes('../images/i1.png'), 'image href rewritten', ch1);
  const chapXmlOk = !/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(ch1.replace(/&#\d+;/g, ''));
  ok(chapXmlOk, 'no bare entities');
  /* parse back */
  const book2 = await E.parseEpub(out.bytes, 'out.epub');
  ok(book2.title === 'EPUB测试书', 'title round-trip', book2.title);
  ok(book2.author === '作者甲', 'author round-trip', book2.author);
  ok(book2.chapters.length === 2, '2 chapters', book2.chapters.length);
  ok(book2.chapters[0].title === '卷一', 'chapter title', book2.chapters[0].title);
  const j = book2.chapters.map(c => c.html).join('');
  ok(j.includes('第一卷内容') && j.includes('第二卷内容'), 'chapter text');
  ok(book2.images.size >= 1, 'images restored', book2.images.size);
  ok(!!book2.cover, 'cover restored');
}

console.log('9. HTML/MD/FB2 writers from EPUB-sourced book');
{
  const book = E.newBook('多格式书', '乙', 'zh');
  book.chapters = [
    { title: '章一', html: '<h2>章一</h2><blockquote>引文</blockquote><ul><li>甲</li><li>乙</li></ul>' },
    { title: '章二', html: '<p>表格<table><tr><td>1</td><td>2</td></tr></table></p>' }
  ];
  const h = E.writeHtml(book);
  ok((h.text.match(/<h2>章一<\/h2>/g) || []).length === 1, 'html: heading not duplicated');
  ok(h.text.includes('blockquote'), 'html keeps blockquote');
  const t = E.writeTxt(book);
  ok(t.text.includes('• 甲'), 'txt: list bullets', t.text.slice(0, 200));
  const md = E.writeMd(book);
  ok(md.text.includes('> 引文') && md.text.includes('- 甲'), 'md: quote & list', md.text.slice(0, 250));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
