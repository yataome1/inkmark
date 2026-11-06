const test = require('node:test');
const assert = require('node:assert/strict');
const { countWords, parseHeadings } = require('../src/text-utils');

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
