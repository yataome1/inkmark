const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const VDITOR_DIST = path.dirname(require.resolve('vditor/dist/index.css'));
const read = (rel) => fs.readFileSync(path.join(VDITOR_DIST, rel), 'utf8');

// KaTeX 字体内联为 woff2 data URI，保证导出的 HTML 离线可用（宪章 II）
function inlineKatexCss() {
  const fontDir = path.join(VDITOR_DIST, 'js', 'katex', 'fonts');
  return read('js/katex/katex.min.css').replace(/src:url\(fonts\/([^)]+)\.woff2\)[^;}]*/g, (_m, name) => {
    const data = fs.readFileSync(path.join(fontDir, `${name}.woff2`)).toString('base64');
    return `src:url(data:font/woff2;base64,${data}) format("woff2")`;
  });
}

const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/**
 * @param {{ title: string, body: string, baseDir?: string }} doc
 *   baseDir 仅 PDF 使用：让临时 HTML 中的相对图片路径指向原文档目录
 */
function buildHtml({ title, body, baseDir }) {
  const base = baseDir ? `<base href="${pathToFileURL(baseDir).href}/">` : '';
  const katex = body.includes('katex') ? `<style>${inlineKatexCss()}</style>` : '';
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Inkmark">
<title>${escapeHtml(title)}</title>
${base}
<style>${read('index.css')}</style>
<style>${read('css/content-theme/light.css')}</style>
<style>${read('js/highlight.js/styles/github.min.css')}</style>
${katex}
<style>body{margin:0;background:#fff}.vditor-reset{max-width:860px;margin:0 auto;padding:40px 24px;color:#24292e}@media print{.vditor-reset{padding:0}}</style>
</head>
<body>
<div class="vditor-reset">${body}</div>
</body>
</html>`;
}

module.exports = { buildHtml };
