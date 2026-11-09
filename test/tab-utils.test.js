const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/tab-utils');

test('pathKey: 同一位置的不同写法相同', () => {
  const key = T.pathKey('D:\\a\\b.md');
  for (const p of ['d:\\A\\B.md', 'D:/a/b.md', 'D:\\a\\c\\..\\b.md', 'D:\\a\\.\\b.md']) assert.equal(T.pathKey(p), key);
});

test('pathKey: 不同目录下的同名文件不同', () => {
  assert.notEqual(T.pathKey('D:\\b.md'), T.pathKey('D:\\a\\b.md'));
});

test('normalizePath: 保留大小写，.. 不越过盘符，保留 UNC 前缀', () => {
  assert.equal(T.normalizePath('D:/A/./C/../b.md'), 'D:\\A\\b.md');
  assert.equal(T.normalizePath('D:\\..\\b.md'), 'D:\\b.md');
  assert.equal(T.normalizePath('\\\\srv\\share\\b.md'), '\\\\srv\\share\\b.md');
});

test('hints: 只给同名文件取最少的上级目录', () => {
  assert.deepEqual(T.hints(['D:\\a\\b.md', 'D:\\c\\b.md', 'D:\\c\\d.md', null]), ['a', 'c', '', '']);
  assert.deepEqual(T.hints(['D:\\x\\a\\b.md', 'D:\\y\\a\\b.md']), ['x\\a', 'y\\a']);
  assert.deepEqual(T.hints(['D:\\a\\README.md', 'D:\\c\\readme.md']), ['a', 'c']);
});

test('hints: 一个文件在根目录时另一个仍可区分', () => {
  assert.deepEqual(T.hints(['D:\\b.md', 'D:\\a\\b.md']), ['D:', 'a']);
});

test('nextAfterClose: 先右后左，当前标签未关闭时不变，全部关闭时为 null', () => {
  const [a, b, c] = ['a', 'b', 'c'];
  assert.equal(T.nextAfterClose([a, b, c], b, [b]), c);
  assert.equal(T.nextAfterClose([a, b, c], c, [c]), b);
  assert.equal(T.nextAfterClose([a, b, c], a, [c]), a);
  assert.equal(T.nextAfterClose([a, b, c], b, [b, c]), a);
  assert.equal(T.nextAfterClose([a, b], a, [a, b]), null);
});

test('nextUntitled: 取未被占用的最小编号', () => {
  assert.equal(T.nextUntitled([]), 1);
  assert.equal(T.nextUntitled([1, 3]), 2);
});
