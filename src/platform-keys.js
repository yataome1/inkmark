// 逻辑快捷键 → 当前平台的按键与显示文字（specs/015 FR-1504，plan 设计要点 1）。
// 逻辑写法：`Mod` 为 Windows 的 Ctrl / macOS 的 ⌘，`Ctrl` 为两个平台上真实的 Control 键，
// 另有 `Alt`、`Shift` 与键名（`A`、`1`、`/`、`Tab`、`F1`……）。
'use strict';

(function (root) {
  const ORDER = ['Ctrl', 'Alt', 'Shift', 'Mod'];

  /**
   * macOS 上与系统快捷键冲突或不合习惯的项（键为规范写法）。
   * 必须与 src-tauri/src/menu.rs 的 MAC_KEYS 一致（test/shortcuts.test.js 检查）。
   */
  const MAC = {
    'Mod+H': 'Alt+Mod+F', // ⌘H 为系统“隐藏”
    'Mod+Y': 'Shift+Mod+Z',
    'Shift+Mod+1': 'Ctrl+Mod+1', // ⇧⌘3/4/5 为系统截图
    'Shift+Mod+2': 'Ctrl+Mod+2',
    'Shift+Mod+3': 'Ctrl+Mod+3',
    'Shift+Mod+Q': 'Alt+Mod+Q', // ⇧⌘Q 为系统“退出登录”
    'Shift+Mod+`': 'Ctrl+`', // ⇧⌘` 为系统切换窗口
    'Alt+Shift+5': 'Ctrl+Shift+`', // ⌥ 加数字在 Mac 上输入特殊字符
    F1: 'Shift+Mod+/',
    F11: 'Ctrl+Mod+F', // F11 为系统“显示桌面”
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`Alt+${n}`, `Ctrl+${n}`])),
  };

  const SYMBOL = { Equal: '=', Minus: '-', Slash: '/', BracketLeft: '[', BracketRight: ']', Backquote: '`' };
  const MAC_MOD = { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Mod: '⌘' };
  const MAC_KEY = { Tab: '⇥', Enter: '↩', Backspace: '⌫', PageUp: '⇞', PageDown: '⇟' };

  function parse(combo) {
    const parts = combo.split('+');
    const key = parts.pop();
    return { mods: new Set(parts), key: key.length === 1 ? key.toUpperCase() : key };
  }

  /** 修饰键按 Ctrl、Alt、Shift、Mod 排序：'Mod+Shift+K' → 'Shift+Mod+K' */
  function canonical(combo) {
    const { mods, key } = parse(combo);
    return [...ORDER.filter((m) => mods.has(m)), key].join('+');
  }

  /** 逻辑快捷键在指定平台上实际对应的组合（规范写法）；Windows 上 Ctrl 与 Mod 是同一个键 */
  function forOs(combo, os) {
    const c = canonical(combo);
    if (os === 'macos') return MAC[c] || c;
    const { mods, key } = parse(c);
    if (mods.delete('Ctrl')) mods.add('Mod');
    return [...ORDER.filter((m) => mods.has(m)), key].join('+');
  }

  /** 按键事件 → 规范写法，用于查 KEYMAP */
  function eventCombo(e, os) {
    const mods = [];
    if (os === 'macos') {
      if (e.ctrlKey) mods.push('Ctrl');
    }
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (os === 'macos' ? e.metaKey : e.ctrlKey) mods.push('Mod');
    const code = e.code;
    const key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : SYMBOL[code] || code;
    return [...mods, key].join('+');
  }

  /** 显示文字：Windows 保持原写法（Mod 显示为 Ctrl）；macOS 用 ⌃⌥⇧⌘ 符号。支持 'Mod+1…6' 这类范围 */
  function label(combo, os) {
    if (os !== 'macos') return combo.replace(/\bMod\b/g, 'Ctrl');
    const range = /^(.*?)(\d)…(\d)$/.exec(combo);
    if (range) return `${label(range[1] + range[2], os)}…${range[3]}`;
    const { mods, key } = parse(forOs(combo, os));
    const prefix = ORDER.filter((m) => mods.has(m))
      .map((m) => MAC_MOD[m])
      .join('');
    return key.length > 1 && !MAC_KEY[key] && !/^F\d+$/.test(key) ? `${prefix} ${key}` : prefix + (MAC_KEY[key] || key);
  }

  const currentOs = () => (typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? 'macos' : 'windows');

  const api = {
    MAC,
    canonical,
    forOs,
    eventCombo,
    label,
    currentOs,
    /** 逻辑快捷键表 → 当前平台的查找表 */
    keymap: (table, os = currentOs()) => Object.fromEntries(Object.entries(table).map(([k, v]) => [forOs(k, os), v])),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PlatformKeys = api;
})(this);
