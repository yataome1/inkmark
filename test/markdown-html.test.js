const test = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const footnote = require('markdown-it-footnote');
const mark = require('markdown-it-mark');
const taskLists = require('markdown-it-task-lists');
const { create } = require('../src/markdown-html');

const render = create({
  MarkdownIt: MarkdownIt.default || MarkdownIt,
  footnote: footnote.default || footnote,
  mark: mark.default || mark,
  taskLists: taskLists.default || taskLists,
  renderMath: (s, display) => `<math data-display="${display}">${s}</math>`,
  highlight: (code, lang) => (lang === 'js' ? `<b>${code}</b>` : null),
});

test('脚注、高亮、任务列表', () => {
  const html = render('==亮== 文[^1]\n\n- [x] 项\n\n[^1]: 注');
  assert.match(html, /<mark>亮<\/mark>/);
  assert.match(html, /footnote-ref/);
  assert.match(html, /task-list-item/);
  assert.match(html, /checked/);
});

test('行内公式：价格不是公式', () => {
  assert.match(render('$a^2$'), /<math data-display="false">a\^2<\/math>/);
  assert.doesNotMatch(render('花了 $5 和 $6'), /<math/);
});

test('块公式：多行与单行', () => {
  assert.match(render('$$\nx\ny\n$$\n\n后'), /<math data-display="true">x\ny<\/math>/);
  assert.match(render('$$x$$'), /<math data-display="true">x<\/math>/);
});

test('代码高亮；未知语言转义', () => {
  assert.match(render('```js\na\n```'), /<pre class="hljs"><code><b>a\n<\/b>/);
  assert.match(render('```zz\n<a>\n```'), /&lt;a&gt;/);
});

test('Mermaid 输出待渲染占位', () => {
  assert.match(render('```mermaid\ngraph LR\nA-->B\n```'), /<div class="language-mermaid">graph LR\nA--&gt;B\n<\/div>/);
});

test('[TOC] 由标题生成并可跳转', () => {
  const html = render('# 一\n\n[TOC]\n\n## 二');
  assert.match(html, /<h1 id="h-1">/);
  assert.match(html, /<ul class="toc">.*href="#h-2">二<\/a>/);
  assert.doesNotMatch(html, /\[TOC\]/);
});

test('源码换行显示为换行', () => {
  assert.match(render('a\nb'), /a<br>\s*b/);
});
