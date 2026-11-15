const test = require('node:test');
const assert = require('node:assert/strict');
const K = require('../src/platform-keys');

test('canonical: 修饰键按 Ctrl、Alt、Shift、Mod 排序', () => {
  assert.equal(K.canonical('Mod+Shift+K'), 'Shift+Mod+K');
  assert.equal(K.canonical('Shift+Alt+5'), 'Alt+Shift+5');
  assert.equal(K.canonical('Mod+k'), 'Mod+K');
  assert.equal(K.canonical('F8'), 'F8');
});

test('forOs: Windows 上 Ctrl 与 Mod 相同', () => {
  assert.equal(K.forOs('Mod+S', 'windows'), 'Mod+S');
  assert.equal(K.forOs('Ctrl+Tab', 'windows'), 'Mod+Tab');
  assert.equal(K.forOs('Ctrl+Shift+PageDown', 'windows'), 'Shift+Mod+PageDown');
  assert.equal(K.forOs('Mod+H', 'windows'), 'Mod+H');
});

test('forOs: macOS 按例外表替换', () => {
  assert.equal(K.forOs('Mod+S', 'macos'), 'Mod+S');
  assert.equal(K.forOs('Mod+H', 'macos'), 'Alt+Mod+F');
  assert.equal(K.forOs('Mod+Shift+1', 'macos'), 'Ctrl+Mod+1');
  assert.equal(K.forOs('Alt+9', 'macos'), 'Ctrl+9');
  assert.equal(K.forOs('Ctrl+Tab', 'macos'), 'Ctrl+Tab');
  assert.equal(K.forOs('F11', 'macos'), 'Ctrl+Mod+F');
  assert.equal(K.forOs('F8', 'macos'), 'F8');
});

test('eventCombo: Windows 的 Ctrl、macOS 的 ⌘ 都是 Mod', () => {
  const ev = (code, o = {}) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });
  assert.equal(K.eventCombo(ev('KeyS', { ctrlKey: true }), 'windows'), 'Mod+S');
  assert.equal(K.eventCombo(ev('KeyS', { metaKey: true }), 'macos'), 'Mod+S');
  assert.equal(K.eventCombo(ev('KeyS', { metaKey: true }), 'windows'), 'S');
  assert.equal(K.eventCombo(ev('Digit1', { ctrlKey: true, metaKey: true }), 'macos'), 'Ctrl+Mod+1');
  assert.equal(K.eventCombo(ev('Slash', { shiftKey: true, metaKey: true }), 'macos'), 'Shift+Mod+/');
  assert.equal(K.eventCombo(ev('Digit5', { shiftKey: true, altKey: true }), 'windows'), 'Alt+Shift+5');
  assert.equal(K.eventCombo(ev('Tab', { ctrlKey: true }), 'macos'), 'Ctrl+Tab');
  assert.equal(K.eventCombo(ev('F8'), 'macos'), 'F8');
});

test('keymap: 事件与逻辑快捷键在两个平台都能对上', () => {
  const table = { 'Mod+Shift+K': ['code-block'], 'Ctrl+Tab': ['next-tab'], 'Mod+H': ['replace'] };
  const win = K.keymap(table, 'windows');
  const mac = K.keymap(table, 'macos');
  const ev = (code, o) => ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...o });
  assert.deepEqual(win[K.eventCombo(ev('KeyK', { ctrlKey: true, shiftKey: true }), 'windows')], ['code-block']);
  assert.deepEqual(mac[K.eventCombo(ev('KeyK', { metaKey: true, shiftKey: true }), 'macos')], ['code-block']);
  assert.deepEqual(win[K.eventCombo(ev('Tab', { ctrlKey: true }), 'windows')], ['next-tab']);
  assert.deepEqual(mac[K.eventCombo(ev('Tab', { ctrlKey: true }), 'macos')], ['next-tab']);
  assert.deepEqual(mac[K.eventCombo(ev('KeyF', { metaKey: true, altKey: true }), 'macos')], ['replace']);
  assert.equal(mac[K.eventCombo(ev('KeyH', { metaKey: true }), 'macos')], undefined);
});

test('label: Windows 保持原写法，macOS 用符号', () => {
  assert.equal(K.label('Mod+Shift+K', 'windows'), 'Ctrl+Shift+K');
  assert.equal(K.label('Shift+Alt+5', 'windows'), 'Shift+Alt+5');
  assert.equal(K.label('Mod+1…6', 'windows'), 'Ctrl+1…6');
  assert.equal(K.label('Mod+Shift+K', 'macos'), '⇧⌘K');
  assert.equal(K.label('Mod+Alt+S', 'macos'), '⌥⌘S');
  assert.equal(K.label('Mod+H', 'macos'), '⌥⌘F');
  assert.equal(K.label('Mod+Y', 'macos'), '⇧⌘Z');
  assert.equal(K.label('Alt+1…8', 'macos'), '⌃1…8');
  assert.equal(K.label('Mod+1…6', 'macos'), '⌘1…6');
  assert.equal(K.label('F1', 'macos'), '⇧⌘/');
  assert.equal(K.label('F8', 'macos'), 'F8');
  assert.equal(K.label('Ctrl+Shift+Tab', 'macos'), '⌃⇧⇥');
  assert.equal(K.label('Mod+Enter', 'macos'), '⌘↩');
  assert.equal(K.label('Mod+滚轮', 'macos'), '⌘ 滚轮');
});
