# KuiGe Ebook Converter · 魁歌在线电子书格式转换工具

在线：**https://ebook-converter.kuige.me/**

纯客户端电子书格式转换：EPUB / MOBI / AZW3 / AZW / PRC / FB2 / PDF / DOCX / TXT / HTML / Markdown → **EPUB / MOBI / HTML / TXT / Markdown / FB2**。所有解析与转换在浏览器本地完成，文件不上传。魁歌工具矩阵一员（[kuige.me](https://kuige.me/)）。

## 形态

- 单文件 `index.html`（零构建，GitHub Pages 直接部署），中英双语默认中文（`?lang=en` 深链），亮暗主题
- 引擎在 `<script id="engineSrc">`（无框架纯 JS）+ part B（解析/写出），暴露 `window.BM_ENGINE`
- 重库按需 CDN 加载（jszip / marked / mammoth / pdf.js，主源 fastly.jsdelivr → gcore → unpkg → npmmirror 四级兜底）

## 测试

```bash
node scripts/test-engine.mjs    # 引擎单测（PalmDOC 往返 / MOBI·EPUB 写读往返 / FB2 / TXT / MD），67 断言
node scripts/gen-samples.mjs    # 生成 samples/ 样例书（含手写最小 PDF/DOCX）
node scripts/e2e.mjs            # 浏览器 E2E（puppeteer-core + 系统 Chrome，需先 python3 -m http.server 8983）
```

## 引擎要点（改代码先读）

- MOBI 解析按 KindleUnpack 参考实现移植：PalmDOC 解压/压缩、HUFF/CDIC（compression 17480）、trailing bytes（`extraFlags@record0+0xF2`，headerLength≥0xE4 且 version≥5）、KF8 boundary（EXTH 121）；DRM（encryption≠0）明确报错
- MOBI 写出：MOBI6 + EXTH（100 作者/503 书名/201 封面）、PalmDOC 压缩、图片走 recindex，字段偏移以 record0 为基准（title@0x54 / lang@0x5C / firstImage@0x6C / huff@0x70 / exthFlag@0x80）
- EPUB 3.0.1 + NCX 兜底，章节经 DOM 清洗后用 XMLSerializer 保证 XHTML 良构；首个纯图片页识别为封面页
- 章节模型：`{title, html}`，图片以 `bkimg:<id>` 内部引用，写出时按目标格式改写
