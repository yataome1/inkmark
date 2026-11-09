const test = require('node:test');
const assert = require('node:assert/strict');
const { htmlToRanges, resolveImage } = require('../src/render');

test('htmlToRanges: 区间对应源码位置，实体按一个字符计', () => {
  // 源码：a<b "c"
  const html = 'a&lt;<span class="hljs-string">b &quot;c&quot;</span>';
  assert.deepEqual(htmlToRanges(html), [{ from: 2, to: 7, cls: 'hljs-string' }]);
});

test('htmlToRanges: 嵌套区间外层在前', () => {
  const html = '<span class="a">x<span class="b">y</span></span>';
  assert.deepEqual(htmlToRanges(html), [
    { from: 0, to: 2, cls: 'a' },
    { from: 1, to: 2, cls: 'b' },
  ]);
});

test('resolveImage: 相对路径按文档目录解析', () => {
  assert.deepEqual(resolveImage('assets/a.png', 'D:\\doc'), { path: 'D:\\doc\\assets\\a.png' });
  assert.deepEqual(resolveImage('../a%20b.png', 'D:\\doc\\x'), { path: 'D:\\doc\\a b.png' });
});

test('resolveImage: 文件名含 % 不报错', () => {
  assert.deepEqual(resolveImage('100%.png', 'D:\\doc'), { path: 'D:\\doc\\100%.png' });
});

test('resolveImage: 绝对路径与 file 地址', () => {
  assert.deepEqual(resolveImage('C:\\a.png', null), { path: 'C:\\a.png' });
  assert.deepEqual(resolveImage('file:///C:/a%20b.png', null), { path: 'C:/a b.png' });
});

test('resolveImage: 网络地址原样，未保存文档的相对路径无法解析', () => {
  assert.deepEqual(resolveImage('https://x/a.png', 'D:\\doc'), { url: 'https://x/a.png' });
  assert.equal(resolveImage('a.png', null), null);
});

test('Anchor.delta: 向上移动为负，四舍五入', () => {
  assert.equal(require('../src/anchor').delta(300, 150.4), -150);
  assert.equal(require('../src/anchor').delta(10, 10), 0);
});
