const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/text-utils');
const { countWords, parseHeadings } = T;

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

test('normalizeZoom / stepZoom: 一档 10%，范围 50%–300%，无效值为 1', () => {
  assert.equal(T.stepZoom(1, 1), 1.1);
  assert.equal(T.stepZoom(1.1, -1), 1);
  assert.equal(T.stepZoom(3, 1), 3);
  assert.equal(T.stepZoom(0.5, -1), 0.5);
  assert.equal(T.normalizeZoom('1.3'), 1.3);
  for (const bad of [undefined, null, 'x', -2, 0, NaN]) assert.equal(T.normalizeZoom(bad), 1);
  assert.equal(T.normalizeZoom(9), 3);
});

test('applyEdits: 按位置替换，与顺序无关', () => {
  const text = '![a](x.png) 和 ![b](y.png)';
  const edits = [
    { from: 5, to: 10, insert: 'file:///C:/i/1.png' },
    { from: 19, to: 24, insert: 'b.assets/2.png' },
  ];
  assert.equal(T.applyEdits(text, edits), '![a](file:///C:/i/1.png) 和 ![b](b.assets/2.png)');
  assert.equal(T.applyEdits(text, [...edits].reverse()), T.applyEdits(text, edits));
});

// ---------------------------------------------------------------- 路径（specs/015）

test('路径：Windows 兼容两种斜杠', () => {
  const os = 'windows';
  assert.equal(T.basename('D:\\doc\\a.md', os), 'a.md');
  assert.equal(T.basename('D:/doc/a.md', os), 'a.md');
  assert.equal(T.dirname('D:\\doc\\a.md', os), 'D:\\doc');
  assert.equal(T.joinPath('D:\\doc', 'a.html', os), 'D:\\doc\\a.html');
  assert.equal(T.resolvePath('D:\\doc', '../img/a.png', os), 'D:\\img\\a.png');
  assert.equal(T.resolvePath('D:\\doc', 'C:\\x.md', os), 'C:\\x.md');
  assert.ok(T.isAbsolutePath('\\\\srv\\share', os));
  assert.ok(!T.isAbsolutePath('/a.md', os));
  assert.equal(T.fileUrl('C:\\a b\\中.png', os), 'file:///C:/a%20b/%E4%B8%AD.png');
});

test('路径：macOS 只以 / 分隔', () => {
  const os = 'macos';
  assert.equal(T.basename('/Users/a/x\\y.md', os), 'x\\y.md');
  assert.equal(T.dirname('/Users/a/b.md', os), '/Users/a');
  assert.equal(T.dirname('/b.md', os), '/');
  assert.equal(T.joinPath('/', 'b.md', os), '/b.md');
  assert.equal(T.joinPath('/Users/a', 'b.md', os), '/Users/a/b.md');
  assert.equal(T.resolvePath('/Users/a/doc', '../img/a.png', os), '/Users/a/img/a.png');
  assert.equal(T.resolvePath('/Users/a/doc', 'img\\a.png', os), '/Users/a/doc/img/a.png'); // Windows 写的相对路径
  assert.equal(T.resolvePath('/Users/a', '/etc/x.md', os), '/etc/x.md');
  assert.ok(T.isAbsolutePath('/a', os));
  assert.ok(!T.isAbsolutePath('C:\\a', os));
  assert.equal(T.fileUrl('/Users/a b/中.png', os), 'file:///Users/a%20b/%E4%B8%AD.png');
});
