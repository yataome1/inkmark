// app.js 的 KEYMAP、shortcuts.js 的列表、menu.rs 的菜单快捷键三处一致（specs/009 FR-909），
// 对 Windows、macOS 各检查一遍（specs/015 T1512）。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const groups = require('../src/shortcuts');
const K = require('../src/platform-keys');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const OSES = ['windows', 'macos'];

const expandRange = (keys) => {
  const m = /^(.*?)(\d)…(\d)$/.exec(keys);
  if (!m) return [keys];
  return Array.from({ length: Number(m[3]) - Number(m[2]) + 1 }, (_, i) => `${m[1]}${Number(m[2]) + i}`);
};

const listed = groups.flatMap((g) => g.items.map((i) => i.keys)).flatMap(expandRange);

function keymapCombos() {
  const block = /const KEYMAP = PlatformKeys\.keymap\(\{([\s\S]*?)\n\}\);/.exec(read('src/app.js'))[1];
  const out = [...block.matchAll(/^\s*'?([A-Za-z0-9+=\-/`[\]]+)'?:\s*\[/gm)].map((m) => m[1]);
  for (const m of block.matchAll(/\[([\d, ]+)\]\.map\(\(n\) => \[`([A-Za-z+]+)\$\{n\}`/g)) {
    for (const n of m[1].split(',')) out.push(m[2] + n.trim());
  }
  return out;
}

const menuSource = () => {
  const src = read('src-tauri/src/menu.rs');
  return src.slice(0, src.indexOf('#[cfg(test)]')).replace(/const MAC_KEYS[\s\S]*?\];/, '');
};

function menuCombos() {
  const src = menuSource();
  const out = [...src.matchAll(/"((?:Mod|Ctrl|Alt|Shift)\+[^"{]+|F\d+)"/g)].map((m) => m[1]);
  for (const m of src.matchAll(/for n in (\d)\.\.=(\d) \{[\s\S]*?format!\("([A-Za-z+]+)\{n\}"\)/g)) {
    for (let n = Number(m[1]); n <= Number(m[2]); n++) out.push(m[3] + n);
  }
  return out;
}

test('KEYMAP 中的快捷键都在列表中（两个平台）', () => {
  const combos = keymapCombos();
  assert.ok(combos.length > 50);
  for (const os of OSES) {
    const shown = new Set(listed.map((c) => K.forOs(c, os)));
    assert.deepEqual(
      combos.filter((c) => !shown.has(K.forOs(c, os))),
      [],
      os,
    );
  }
});

test('menu.rs 显示的快捷键都在列表中（两个平台）', () => {
  const combos = menuCombos();
  assert.ok(combos.length > 40);
  for (const os of OSES) {
    const shown = new Set(listed.map((c) => K.forOs(c, os)));
    assert.deepEqual(
      combos.filter((c) => !shown.has(K.forOs(c, os))),
      [],
      os,
    );
  }
});

test('KEYMAP 展开后在两个平台上都没有重复', () => {
  const combos = keymapCombos();
  for (const os of OSES) assert.equal(new Set(combos.map((c) => K.forOs(c, os))).size, combos.length, os);
});

test('macOS 例外表与 menu.rs 的 MAC_KEYS 相同', () => {
  const block = /const MAC_KEYS[\s\S]*?\];/.exec(read('src-tauri/src/menu.rs'))[0];
  const rust = Object.fromEntries([...block.matchAll(/\("([^"]+)", "([^"]+)"\)/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(rust, K.MAC);
});

test('macOS 上不占用系统快捷键，⌥ 不单独作修饰键', () => {
  const reserved = new Set(
    [
      'Mod+H',
      'Alt+Mod+H',
      'Mod+M',
      'Mod+Q',
      'Mod+,',
      'Mod+`',
      'Shift+Mod+`',
      'Shift+Mod+Q',
      'Ctrl+Mod+Q',
      'Alt+Mod+D',
      'Mod+Space',
      'Ctrl+Mod+Space',
    ].concat([3, 4, 5].map((n) => `Shift+Mod+${n}`)),
  );
  const all = [...keymapCombos(), ...menuCombos(), ...listed.filter((c) => !c.includes('滚轮'))].map((c) => K.forOs(c, 'macos'));
  assert.deepEqual(
    all.filter((c) => reserved.has(c)),
    [],
  );
  assert.deepEqual(
    all.filter((c) => c.includes('Alt+') && !/(Ctrl|Mod)\+/.test(c)),
    [],
  );
});
