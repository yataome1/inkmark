const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/status-message');

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const el = { textContent: '', title: '' };
  return { el, show: S.create(el).show };
}

test('show: 显示约 4 秒后清空（FR-1601）', (t) => {
  const { el, show } = setup(t);
  show('已复制图片文件');
  assert.equal(el.textContent, '已复制图片文件');
  assert.equal(el.title, '已复制图片文件');
  t.mock.timers.tick(S.DURATION - 1);
  assert.equal(el.textContent, '已复制图片文件');
  t.mock.timers.tick(1);
  assert.equal(el.textContent, '');
  assert.equal(el.title, '');
});

test('show: 新提示立即替换并重新计时（FR-1602）', (t) => {
  const { el, show } = setup(t);
  show('已复制图片文件');
  t.mock.timers.tick(3000);
  show('已保存 2 个文件');
  assert.equal(el.textContent, '已保存 2 个文件');
  t.mock.timers.tick(3000);
  assert.equal(el.textContent, '已保存 2 个文件');
  t.mock.timers.tick(1000);
  assert.equal(el.textContent, '');
});

test('show: 空文字立即清空，之前的计时不再生效', (t) => {
  const { el, show } = setup(t);
  show('已导出：a.html');
  show('');
  assert.equal(el.textContent, '');
  el.textContent = 'x';
  t.mock.timers.tick(S.DURATION);
  assert.equal(el.textContent, 'x');
});
