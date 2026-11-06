const test = require('node:test');
const assert = require('node:assert/strict');
const { countWords, parseHeadings, escapeTableCodePipes } = require('../src/text-utils');

test('countWords: 中文按字、英文按词', () => {
  assert.deepEqual(countWords('你好 world'), { words: 3, chars: 7 });
});

test('countWords: 忽略 Markdown 标记与链接地址', () => {
  const r = countWords('# Title\n\n- **bold** [link](http://x.com)');
  assert.equal(r.words, 3);
});

test('countWords: 空文档', () => {
  assert.deepEqual(countWords(''), { words: 0, chars: 0 });
});

test('parseHeadings: ATX 标题与层级', () => {
  const h = parseHeadings('# A\ntext\n## B ##\n### `C`');
  assert.deepEqual(h, [
    { level: 1, text: 'A', line: 0 },
    { level: 2, text: 'B', line: 2 },
    { level: 3, text: 'C', line: 3 },
  ]);
});

test('parseHeadings: 跳过代码围栏中的 #', () => {
  const h = parseHeadings('```\n# not\n```\n# yes\n~~~\n## no\n~~~');
  assert.deepEqual(h, [{ level: 1, text: 'yes', line: 3 }]);
});

test('parseHeadings: Setext 标题', () => {
  const h = parseHeadings('Title\n=====\n\nSub\n---');
  assert.deepEqual(h, [
    { level: 1, text: 'Title', line: 0 },
    { level: 2, text: 'Sub', line: 3 },
  ]);
});

test('parseHeadings: 列表项后的 --- 不是 Setext 标题', () => {
  assert.deepEqual(parseHeadings('- item\n---'), []);
});

// 以下 HTML 片段取自 Vditor 3.11.2 的 Md2VditorIRDOM 输出（FR-401、FR-402）
const code = (t) =>
  `<span data-type="code" class="vditor-ir__node"><span class="vditor-ir__marker">\`</span><code data-newline="1">${t}</code><span class="vditor-ir__marker">\`</span></span>`;
const math = (t) =>
  `<span data-type="inline-node" class="vditor-ir__node"><span class="vditor-ir__marker">$</span><code data-newline="1" class="vditor-ir__marker vditor-ir__marker--pre" data-type="math-inline">${t}</code><span class="vditor-ir__preview" data-render="2"><span class="language-math">p | q</span></span><span class="vditor-ir__marker">$</span></span>`;
const table = (cells) =>
  `<table data-block="0" data-type="table"><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr></tbody></table>`;

test('escapeTableCodePipes: 表格单元格行内代码中的 | 写回 \\|', () => {
  assert.equal(escapeTableCodePipes(table([code('x | y | z'), code('m \\| n')])), table([code('x \\| y \\| z'), code('m \\\\| n')]));
});

test('escapeTableCodePipes: 公式、单元格文字不处理', () => {
  const html = table([math('p \\| q'), 'z<span data-type="backslash">\\|</span> w']);
  assert.equal(escapeTableCodePipes(html), html);
});

test('escapeTableCodePipes: 表格外的行内代码不处理，多个表格都处理', () => {
  const para = `<p data-block="0">${code('p | q')}</p>`;
  assert.equal(
    escapeTableCodePipes(table([code('a|b'), '']) + para + table([code('c|d'), ''])),
    table([code('a\\|b'), '']) + para + table([code('c\\|d'), '']),
  );
});
