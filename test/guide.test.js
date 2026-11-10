// 使用指南与软件一致（specs/013 FR-1307）：指南中“文件 → 图片文件夹…”这类菜单路径的每一级都必须存在于菜单中。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const guide = read('resources/samples/使用指南.md');

// menu.rs 中的全部字符串字面量，去掉访问键“(&F)”
const labels = new Set([...read('src-tauri/src/menu.rs').matchAll(/"([^"]*)"/g)].map((m) => m[1].replace(/\(&\w\)$/, '')));

const menuPaths = [...guide.matchAll(/“([^”]*→[^”]*)”/g)].map((m) => m[1]);

test('指南中提到菜单路径', () => {
  assert.ok(menuPaths.length >= 10, `只找到 ${menuPaths.length} 处`);
});

test('指南中的菜单路径都存在于菜单中', () => {
  const missing = menuPaths.filter((p) => p.split('→').some((name) => !labels.has(name.trim())));
  assert.deepEqual(missing, [], `菜单中不存在：${missing.join('；')}`);
});

test('指南开头的版本号由程序填入', () => {
  assert.match(guide.split('\n').slice(0, 4).join('\n'), /适用于 Inkmark \{\{version\}\}/);
});
