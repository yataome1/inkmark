// 组装导出用的单文件 HTML（FR-014）：内联 Vditor 样式；含公式时内联 KaTeX 样式与 woff2 字体，保证离线可用（宪章 II）。
'use strict';

(function (root) {
  const BASE = 'vendor/vditor/dist/';
  const text = async (rel) => (await fetch(BASE + rel)).text();

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function katexCss() {
    const css = await text('js/katex/katex.min.css');
    const names = [...new Set([...css.matchAll(/src:url\(fonts\/([^)]+)\.woff2\)/g)].map((m) => m[1]))];
    const fonts = {};
    await Promise.all(
      names.map(async (n) => {
        fonts[n] = toBase64(await (await fetch(`${BASE}js/katex/fonts/${n}.woff2`)).arrayBuffer());
      }),
    );
    return css.replace(/src:url\(fonts\/([^)]+)\.woff2\)[^;}]*/g, (_m, n) => `src:url(data:font/woff2;base64,${fonts[n]}) format("woff2")`);
  }

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /**
   * @param {{ title: string, body: string, baseUrl?: string }} doc
   *   baseUrl 仅 PDF 使用：让临时 HTML 中的相对图片路径指向原文档目录
   */
  async function buildHtml({ title, body, baseUrl }) {
    const [base, theme, hljs, katex] = await Promise.all([
      text('index.css'),
      text('css/content-theme/light.css'),
      text('js/highlight.js/styles/github.min.css'),
      body.includes('katex') ? katexCss() : '',
    ]);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkmark">
<title>${escapeHtml(title)}</title>
${baseUrl ? `<base href="${escapeHtml(baseUrl)}">` : ''}
<style>${base}</style>
<style>${theme}</style>
<style>${hljs}</style>
${katex ? `<style>${katex}</style>` : ''}
<style>body{margin:0;background:#fff}.vditor-reset{max-width:860px;margin:0 auto;padding:40px 24px;color:#24292e}@media print{.vditor-reset{padding:0}}</style>
</head>
<body>
<div class="vditor-reset">${body}</div>
</body>
</html>`;
  }

  root.ExportHtml = { buildHtml };
})(this);
