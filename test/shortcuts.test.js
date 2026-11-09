const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const groups = require('../src/shortcuts');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SYMBOL = { Equal: '=', Minus: '-', Slash: '/', BracketLeft: '[', BracketRight: ']', Backquote: '`' };

/** 修饰键排序后比较，'Shift+Alt+5' 与 'Alt+Shift+5' 相同 */
function normalize(combo) {
  const parts = combo.split('+');
  const key = parts.pop() || '+';
  return [...parts.sort(), key].join('+');
}

const expand = (combo, from, to) => Array.from({ length: to - from + 1 }, (_, i) => combo.replace('{n}', from + i));

const listed = new Set(
  groups
    .flatMap((g) => g.items.map((i) => i.keys))
    .flatMap((keys) => {
      const m = /^(.*?)(\d)…(\d)$/.exec(keys);
      return m ? expand(`${m[1]}{n}`, Number(m[2]), Number(m[3])) : [keys];
    })
    .map(normalize),
);

function keymapCombos() {
  const block = /const KEYMAP = \{([\s\S]*?)\n\};/.exec(read('src/app.js'))[1];
  const out = [...block.matchAll(/^\s*'?([A-Za-z0-9+]+)'?:\s*\[/gm)].map((m) => m[1]);
  for (const m of block.matchAll(/\[([\d, ]+)\]\.map\(\(n\) => \[`([A-Za-z+]+)\$\{n\}`/g)) {
    for (const n of m[1].split(',')) out.push(m[2] + n.trim());
  }
  return out.map((c) =>
    c
      .replace(/Key([A-Z])/, '$1')
      .replace(/Digit(\d)/, '$1')
      .replace(/(Equal|Minus|Slash|BracketLeft|BracketRight|Backquote)$/, (s) => SYMBOL[s]),
  );
}

test('KEYMAP 中的快捷键都在列表中', () => {
  const combos = keymapCombos();
  assert.ok(combos.length > 50);
  assert.deepEqual(
    combos.filter((c) => !listed.has(normalize(c))),
    [],
  );
});

test('menu.rs 显示的快捷键都在列表中', () => {
  const shown = [...read('src-tauri/src/menu.rs').matchAll(/"((?:Ctrl|Alt|Shift)\+[^"{]+|F\d+)"/g)].map((m) => m[1]);
  assert.ok(shown.length > 30);
  assert.deepEqual(
    shown.filter((c) => !listed.has(normalize(c))),
    [],
  );
});
