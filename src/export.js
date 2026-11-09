// 组装导出用的单文件 HTML（FR-014）：内联排版样式；含公式时内联 KaTeX 样式与 woff2 字体，保证离线可用（宪章 II）。
'use strict';

(function (root) {
  const BASE = 'vendor/';
  const text = async (rel) => (await fetch(BASE + rel)).text();

  function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  async function katexCss() {
    const css = await text('katex/katex.min.css');
    const names = [...new Set([...css.matchAll(/src:url\(fonts\/([^)]+)\.woff2\)/g)].map((m) => m[1]))];
    const fonts = {};
    await Promise.all(
      names.map(async (n) => {
        fonts[n] = toBase64(await (await fetch(`${BASE}katex/fonts/${n}.woff2`)).arrayBuffer());
      }),
    );
    return css.replace(/src:url\(fonts\/([^)]+)\.woff2\)[^;}]*/g, (_m, n) => `src:url(data:font/woff2;base64,${fonts[n]}) format("woff2")`);
  }

  const DOC_CSS = `body{margin:0;background:#fff}
.markdown-body{max-width:860px;margin:0 auto;padding:40px 24px;color:#24292e;font:16px/1.75 'Segoe UI','Microsoft YaHei',sans-serif}
@media print{.markdown-body{padding:0}}
h1,h2,h3,h4,h5,h6{margin:1.2em 0 .6em;font-weight:600;line-height:1.4}
h1{font-size:2em}h2{font-size:1.5em}h3{font-size:1.25em}h6{color:#6a737d}
p,ul,ol,table,blockquote,pre{margin:0 0 1em}
blockquote{padding-left:14px;border-left:3px solid #dfe2e5;color:#6a737d}
code{padding:1px 4px;border-radius:3px;background:#f3f4f6;font:.9em Consolas,'Microsoft YaHei',monospace}
pre{padding:12px 14px;overflow:auto;border-radius:4px;background:#f6f8fa}
pre code,pre.hljs code{padding:0;background:none}
table{border-collapse:collapse}th,td{padding:4px 12px;border:1px solid #dfe2e5}th{background:#f6f8fa;font-weight:600}
img,svg{max-width:100%}hr{border:0;border-top:1px solid #dfe2e5;margin:1.5em 0}
mark{background:#fff3a3}.math-block,.language-mermaid{text-align:center;margin:0 0 1em}
.task-list-item{list-style:none}.task-list-item input{margin-right:6px}.toc{list-style:none;padding:0}`;

  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /**
   * @param {{ title: string, body: string, baseUrl?: string }} doc
   *   baseUrl 仅 PDF 使用：让临时 HTML 中的相对图片路径指向原文档目录
   */
  async function buildHtml({ title, body, baseUrl }) {
    const [hljs, katex] = await Promise.all([text('highlight/github.min.css'), body.includes('katex') ? katexCss() : '']);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkmark">
<title>${escapeHtml(title)}</title>
${baseUrl ? `<base href="${escapeHtml(baseUrl)}">` : ''}
<style>${DOC_CSS}</style>
<style>${hljs}</style>
${katex ? `<style>${katex}</style>` : ''}
</head>
<body>
<div class="markdown-body">${body}</div>
</body>
</html>`;
  }

  root.ExportHtml = { buildHtml };
})(this);
