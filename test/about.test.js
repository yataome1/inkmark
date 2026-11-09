const test = require('node:test');
const assert = require('node:assert/strict');
const { versionText } = require('../src/about');

test('versionText: 多行纯文本，缺失项显示未知', () => {
  assert.equal(
    versionText({
      version: '1.2.3',
      commit: 'abc',
      date: '2026-11-09',
      tauri: '2.0',
      webview2: '120.0',
      windows: 'Windows 11 (内部版本 22631)',
    }),
    'Inkmark 1.2.3 (abc, 2026-11-09)\nTauri 2.0\nWebView2 120.0\nWindows 11 (内部版本 22631)',
  );
  assert.equal(versionText({ version: '1.0', tauri: '2.0' }), 'Inkmark 1.0 (未知, 未知)\nTauri 2.0\nWebView2 未知\nWindows 未知');
});
