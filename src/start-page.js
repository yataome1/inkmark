// 起始页（FR-814..816）：没有打开任何文档时显示的入口、最近文件和收藏。
'use strict';

(function (root) {
  const MAX_FAVORITES = 5;
  const basename = (p) => p.split(/[\\/]/).pop();
  const dirname = (p) => p.replace(/[\\/][^\\/]*$/, '');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** 列表中的一行：图标 + 名称（可带第二行说明）+ 右侧快捷键 */
  function item({ icon, name, detail, shortcut, title, disabled, run }) {
    const button = el('button', 'start-item');
    button.append(el('span', 'start-icon', icon || ''));
    const text = el('span', 'start-text');
    text.append(el('span', 'start-name', name));
    if (detail) text.append(el('span', 'start-dir', detail));
    button.append(text);
    if (shortcut) button.append(el('span', 'start-shortcut', shortcut));
    if (title) button.title = title;
    button.disabled = !!disabled;
    button.addEventListener('click', run);
    const row = el('div', 'start-row');
    row.append(button);
    return row;
  }

  function section(heading, children, extra) {
    const box = el('section', 'start-section');
    const h = el('h2', 'start-heading');
    h.append(el('span', '', heading));
    if (extra) h.append(extra);
    box.append(h, ...children);
    return box;
  }

  /**
   * @param {{ root: HTMLElement, actions: () => Array<{icon: string, label: string, shortcut?: string, run: () => void}>,
   *   recent: () => string[], favorites: () => Array<{path: string, dir: boolean}>,
   *   pathInfo: (paths: string[]) => Promise<Array<{exists: boolean, dir: boolean}>>,
   *   openFile: (path: string) => void, openFolder: (path: string) => void, setRecent: (list: string[]) => Promise<void> }} o
   */
  function create(o) {
    let token = 0;

    function recentSection(recent, exists) {
      const setRecent = async (list) => {
        await o.setRecent(list);
        render();
      };
      if (!recent.length) {
        return section('最近文件', [el('p', 'start-empty', '还没有打开过文件'), el('p', 'start-hint', '也可以把 .md 文件拖到窗口中打开')]);
      }
      const clear = el('button', 'start-clear', '清除全部');
      clear.addEventListener('click', () => setRecent([]));
      const rows = recent.map((path, i) => {
        const row = item({
          icon: exists[i] ? '' : '×',
          name: basename(path),
          detail: exists[i] ? dirname(path) : '文件不存在',
          title: path,
          disabled: !exists[i],
          run: () => o.openFile(path),
        });
        const remove = el('button', 'start-remove', '×');
        remove.title = '从列表移除';
        remove.setAttribute('aria-label', `从列表移除 ${basename(path)}`);
        remove.addEventListener('click', () => setRecent(o.recent().filter((p) => p !== path)));
        row.append(remove);
        return row;
      });
      return section('最近文件', [...rows, el('p', 'start-hint', '也可以把 .md 文件拖到窗口中打开')], clear);
    }

    async function render() {
      const id = ++token;
      const recent = o.recent();
      const favorites = o.favorites().slice(0, MAX_FAVORITES);
      const info = await o.pathInfo([...recent, ...favorites.map((f) => f.path)]);
      if (id !== token || o.root.hidden) return;

      const exists = info.map((x) => x.exists);
      const left = el('div', '');
      left.append(
        section(
          '开始',
          o.actions().map((a) => item({ icon: a.icon, name: a.label, shortcut: a.shortcut, run: a.run })),
        ),
      );
      if (favorites.length) {
        const rows = favorites.map((f, i) =>
          item({
            icon: f.dir ? '▸' : '★',
            name: basename(f.path),
            title: f.path,
            detail: exists[recent.length + i] ? '' : '文件不存在',
            disabled: !exists[recent.length + i],
            run: () => (f.dir ? o.openFolder(f.path) : o.openFile(f.path)),
          }),
        );
        left.append(section('收藏', rows));
      }
      const right = el('div', '');
      right.append(recentSection(recent, exists));

      const grid = el('div', 'start-grid');
      grid.append(left, right);
      const inner = el('div', 'start-inner');
      inner.append(el('h1', 'start-title', 'Inkmark'), el('p', 'start-tagline', '选择一项开始，或继续最近的工作'), grid);
      o.root.replaceChildren(inner);
      o.root.querySelector('button')?.focus();
    }

    o.root.addEventListener('keydown', (e) => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (!step) return;
      const buttons = [...o.root.querySelectorAll('button:not(:disabled)')];
      const next = buttons[(buttons.indexOf(document.activeElement) + step + buttons.length) % buttons.length];
      next?.focus();
      e.preventDefault();
    });

    return { render };
  }

  root.StartPage = { create };
})(this);
