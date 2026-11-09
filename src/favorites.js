// 收藏夹（FR-210..214）：按添加顺序排列，可拖动或用键盘调整顺序。
/* global ContextMenu */
'use strict';

(function (root) {
  const DRAG_THRESHOLD = 4;
  const basename = (p) => p.split(/[\\/]/).pop();
  const parentName = (p) => basename(p.replace(/[\\/][^\\/]*$/, ''));

  /**
   * @param {{
   *   list: HTMLElement, getList: () => Array<{path: string, dir: boolean}>, saveList: (list: Array) => Promise<void>,
   *   pathInfo: (paths: string[]) => Promise<Array<{exists: boolean, dir: boolean}>>,
   *   openFile: (path: string) => void, openFolder: (path: string) => void, currentPath: () => string|null,
   *   onChange: () => void,
   * }} o
   */
  function create(o) {
    const has = (path) => o.getList().some((f) => f.path === path);

    async function commit(next, focusPath) {
      await o.saveList(next);
      await render();
      o.onChange();
      if (focusPath) rowOf(focusPath)?.focus();
    }

    const rowOf = (path) => [...o.list.querySelectorAll('.row[data-path]')].find((r) => r.dataset.path === path);
    const remove = (path) => commit(o.getList().filter((f) => f.path !== path));
    const add = (path, dir) => (has(path) ? Promise.resolve() : commit([...o.getList(), { path, dir }]));
    const toggle = (path, dir) => (has(path) ? remove(path) : add(path, dir));
    const open = (f) => (f.dir ? o.openFolder(f.path) : o.openFile(f.path));

    function reorder(from, to) {
      const next = [...o.getList()];
      next.splice(to, 0, next.splice(from, 1)[0]);
      return commit(next, next[to].path);
    }

    function markCurrent() {
      o.list.querySelectorAll('.row[data-path]').forEach((r) => r.classList.toggle('current', r.dataset.path === o.currentPath()));
    }

    function enableDrag(row, index) {
      row.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || e.target.closest('.remove')) return;
        const startY = e.clientY;
        let dragging = false;
        let slot = index;
        const rows = () => [...o.list.querySelectorAll('.row[data-path]')].map((r) => r.getBoundingClientRect());
        const indicator = document.createElement('div');
        indicator.className = 'im-drop-line';
        const move = (ev) => {
          if (!dragging) {
            if (Math.abs(ev.clientY - startY) <= DRAG_THRESHOLD) return;
            dragging = true;
            row.classList.add('dragging');
            o.list.append(indicator);
          }
          const rects = rows();
          slot = rects.findIndex((r) => ev.clientY < r.top + r.height / 2);
          if (slot === -1) slot = rects.length;
          const base = o.list.getBoundingClientRect();
          const y = slot < rects.length ? rects[slot].top : rects[rects.length - 1].bottom;
          indicator.style.cssText = `left:0;right:0;height:2px;top:${y - base.top - 1 + o.list.scrollTop}px`;
        };
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
          window.removeEventListener('pointercancel', up);
          if (!dragging) return;
          row.classList.remove('dragging');
          indicator.remove();
          // 松开后紧跟的 click 不应打开
          row.addEventListener('click', (c) => c.stopImmediatePropagation(), { capture: true, once: true });
          const to = slot > index ? slot - 1 : slot;
          if (to !== index) reorder(index, to);
        };
        // 监听窗口：快速拖动时指针会在越过阈值前离开本行
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        window.addEventListener('pointercancel', up);
      });
    }

    function buildRow(f, index, info) {
      const row = document.createElement('div');
      row.className = `row fav${info.exists ? '' : ' missing'}`;
      row.dataset.path = f.path;
      row.tabIndex = 0;
      row.title = info.exists ? f.path : `${f.path}（已不存在）`;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = f.dir ? '📁' : '📄';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = basename(f.path);
      const parent = document.createElement('span');
      parent.className = 'parent';
      parent.textContent = parentName(f.path);
      const x = document.createElement('button');
      x.className = 'remove';
      x.textContent = '×';
      x.title = '从收藏中移除';
      x.setAttribute('aria-label', '从收藏中移除');
      x.tabIndex = -1;
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        remove(f.path);
      });
      row.append(icon, name, parent, x);
      row.addEventListener('click', () => open(f));
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        ContextMenu.show(e.clientX, e.clientY, [
          { label: '打开', action: () => open(f) },
          '-',
          { label: '从收藏中移除', action: () => remove(f.path) },
        ]);
      });
      row.addEventListener('keydown', (e) => {
        const last = o.getList().length - 1;
        if (e.key === 'Enter') open(f);
        else if (e.key === 'Delete') remove(f.path);
        else if (e.altKey && e.key === 'ArrowUp' && index > 0) reorder(index, index - 1);
        else if (e.altKey && e.key === 'ArrowDown' && index < last) reorder(index, index + 1);
        else if (!e.altKey && e.key === 'ArrowUp') row.closest('li').previousElementSibling?.firstChild.focus();
        else if (!e.altKey && e.key === 'ArrowDown') row.closest('li').nextElementSibling?.firstChild.focus();
        else return;
        e.preventDefault();
        e.stopPropagation();
      });
      enableDrag(row, index);
      const li = document.createElement('li');
      li.append(row);
      return li;
    }

    async function render() {
      const items = o.getList();
      if (!items.length) {
        o.list.innerHTML = '<li class="row empty hint">还没有收藏。在“文件”页点击文件或文件夹右侧的 ☆，或按右键添加。</li>';
        return;
      }
      const infos = await o.pathInfo(items.map((f) => f.path));
      o.list.replaceChildren(...items.map((f, i) => buildRow(f, i, infos[i])));
      markCurrent();
    }

    return { has, toggle, render, markCurrent };
  }

  root.Favorites = { create };
})(this);
