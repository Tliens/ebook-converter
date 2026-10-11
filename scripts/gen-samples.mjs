/* Generate sample books for browser smoke tests → samples/ (gitignored). Run: node scripts/gen-samples.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const jsdomWindow = new (require('jsdom').JSDOM)('').window;
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
const TE = new TextEncoder();

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'samples');
fs.mkdirSync(outDir, { recursive: true });

const PNG1x1 = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
const JPEG1x1 = new Uint8Array(Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));

function sampleBook(){
  const b = E.newBook('夜航书简', '沈青梧', 'zh');
  b.cover = { mime: 'image/png', bytes: PNG1x1 };
  b.images.set('i1', { mime: 'image/png', bytes: PNG1x1 });
  b.images.set('i2', { mime: 'image/jpeg', bytes: JPEG1x1 });
  b.chapters = [
    { title: '', html: '<h2>第一章 灯塔来信</h2><p>海雾在午夜漫过码头，<strong>信标灯</strong>第无数次亮起。这是第一章的正文内容。</p><img src="bkimg:i1" alt="灯塔">' },
    { title: '', html: '<p>第二章没有标题行。Mixed 内容 <em>斜体强调</em> 与英文段落。</p><img src="bkimg:i2" alt="海图"><blockquote>引文：所有伟大的航程都始于离港。</blockquote>' },
    { title: '', html: '<h2>第三章 归港</h2><p>结局的段落。全部段落到此为止。</p><ul><li>甲板</li><li>罗盘</li></ul>' }
  ];
  return b;
}

const book = sampleBook();
const epub = await E.writeEpub(book);
fs.writeFileSync(path.join(outDir, 'sample.epub'), Buffer.from(epub.bytes));
const mobi = E.writeMobi(book);
fs.writeFileSync(path.join(outDir, 'sample.mobi'), Buffer.from(mobi.bytes));
const fb2 = E.writeFb2(book);
fs.writeFileSync(path.join(outDir, 'sample.fb2'), fb2.text, 'utf8');
fs.writeFileSync(path.join(outDir, 'sample.html'), E.writeHtml(book).text, 'utf8');
fs.writeFileSync(path.join(outDir, 'sample.md'), E.writeMd(book).text, 'utf8');
fs.writeFileSync(path.join(outDir, 'sample.txt'), E.writeTxt(book).text, 'utf8');

/* minimal PDF (2 pages) */
function makePdf(){
  const enc = s => s;
  const page1 = 'BT /F1 20 Tf 72 720 Td (Chapter One) Tj ET\nBT /F1 12 Tf 72 690 Td (The quick brown fox jumps over the lazy dog.) Tj ET\nBT /F1 12 Tf 72 672 Td (Second line of paragraph one continues here.) Tj ET';
  const page2 = 'BT /F1 20 Tf 72 720 Td (Chapter Two) Tj ET\nBT /F1 12 Tf 72 690 Td (The second chapter body text lives on this page.) Tj ET';
  const objs = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>';
  objs[3] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 7 0 R >> >> >>`;
  objs[4] = `<< /Length ${page1.length} >>\nstream\n${page1}\nendstream`;
  objs[5] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>`;
  objs[6] = `<< /Length ${page2.length} >>\nstream\n${page2}\nendstream`;
  objs[7] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let pdf = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i <= 7; i++){
    offsets[i] = pdf.length;
    pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 8\n0000000000 65535 f \n`;
  for (let i = 1; i <= 7; i++) pdf += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  pdf += `trailer\n<< /Size 8 /Root 1 0 R /Info << /Title (PDF Sample Book) /Author (Test Author) >> >>\nstartxref\n${xref}\n%%EOF`;
  return pdf;
}
fs.writeFileSync(path.join(outDir, 'sample.pdf'), makePdf(), 'latin1');

/* minimal DOCX */
async function makeDocx(){
  const zip = new JSZip();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DOCX 第一章</w:t></w:r></w:p><w:p><w:r><w:t>这是来自 Word 文档的第一章内容。</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>DOCX 第二章</w:t></w:r></w:p><w:p><w:r><w:t>第二章的正文段落。</w:t></w:r></w:p></w:body></w:document>`);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  fs.writeFileSync(path.join(outDir, 'sample.docx'), Buffer.from(bytes));
}
await makeDocx();

/* collection (anthology) sample: two books with numbering restart + TOC naming */
function sampleCollection(){
  const b = E.newBook('双书合集样本', '测试编辑部', 'zh');
  const mk = (t, body) => ({ title: t, html: body || `<p>${t}的内容段落。</p>` });
  b.chapters = [
    mk('总目录', '<p>本合集包含：</p><a>红楼梦：上卷</a><a>西游记：下卷</a>'),
    mk('第一回 上部一回'), mk('第二回 上部二回'), mk('第三回 上部三回'),
    mk('封底'), mk('封面'), mk('书名页'), mk('版权页'), mk('目录'),
    mk('第一回 下部一回'), mk('第二回 下部二回'),
    mk('后记')
  ];
  return b;
}
const coll = sampleCollection();
fs.writeFileSync(path.join(outDir, 'collection.mobi'), Buffer.from(E.writeMobi(coll).bytes));
const collEpub = await E.writeEpub(coll);
fs.writeFileSync(path.join(outDir, 'collection.epub'), Buffer.from(collEpub.bytes));

console.log('samples written to', outDir);
console.log(fs.readdirSync(outDir).map(f => f + ' ' + fs.statSync(path.join(outDir, f)).size).join('\n'));
