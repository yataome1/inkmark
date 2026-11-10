// 右键菜单项（specs/014 FR-1402..FR-1404）
const test = require('node:test');
const assert = require('node:assert/strict');
const { editorItems, inputItems } = require('../src/edit-menu');

const labels = (items) => items.map((i) => (i === '-' ? '-' : `${i.label}${i.disabled ? '(x)' : ''}`)).join(',');
const base = { hasSelection: false, canUndo: false, canRedo: false, readOnly: false };

test('正文：无选区、无历史', () => {
  assert.equal(labels(editorItems(base)), '撤销(x),重做(x),-,剪切(x),复制(x),粘贴,-,全选');
});

test('正文：有选区、可撤销重做', () => {
  assert.equal(labels(editorItems({ ...base, hasSelection: true, canUndo: true, canRedo: true })), '撤销,重做,-,剪切,复制,粘贴,-,全选');
});

test('只读：只有复制、全选可用', () => {
  const items = editorItems({ hasSelection: true, canUndo: true, canRedo: true, readOnly: true });
  assert.deepEqual(
    items.filter((i) => i !== '-' && !i.disabled).map((i) => i.label),
    ['复制', '全选'],
  );
});

test('链接、公式、图表的命令在顶部', () => {
  assert.equal(labels(editorItems({ ...base, link: 'a.md' })).split(',-,')[0], '打开链接,复制链接地址');
  assert.equal(labels(editorItems({ ...base, math: 'E=mc^2' })).split(',-,')[0], '复制公式');
  assert.equal(labels(editorItems({ ...base, mermaid: 'graph TD' })).split(',-,')[0], '复制图表源码,复制为图片');
});

test('菜单项的快捷键与键盘快捷键一致', () => {
  const shortcuts = Object.fromEntries(
    editorItems(base)
      .filter((i) => i !== '-')
      .map((i) => [i.label, i.shortcut]),
  );
  assert.deepEqual(shortcuts, { 撤销: 'Ctrl+Z', 重做: 'Ctrl+Y', 剪切: 'Ctrl+X', 复制: 'Ctrl+C', 粘贴: 'Ctrl+V', 全选: 'Ctrl+A' });
});

test('输入框', () => {
  assert.equal(labels(inputItems({ hasSelection: false, readOnly: false })), '撤销,-,剪切(x),复制(x),粘贴,-,全选');
  assert.equal(labels(inputItems({ hasSelection: true, readOnly: true })), '撤销(x),-,剪切(x),复制,粘贴(x),-,全选');
});
