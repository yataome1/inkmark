// 标签栏（FR-801、FR-805、FR-810、FR-813、FR-817、FR-824）：只管理标签顺序与显示，文档内容由 app.js 负责。
/* global TabUtils */
'use strict';

(function (root) {
  const DRAG_THRESHOLD = 4;
  const NARROW_WIDTH = 130; // 平均宽度低于此值时，未激活标签的关闭按钮只在悬停时显示（US3-13）
  const EDGE = 24; // 拖到标签栏边缘时自动滚动

  /**
   * @param {{ bar: HTMLElement, onSelect: (tab: object) => void, onClose: (tab: object) => void, onNew: () => void,
   *   onMenu: (tab: object, x: number, y: number) => void, title: (tab: object) => string }} options
   */
  function create({ bar, onSelect, onClose, onNew, onMenu, title }) {
    const list = [];
    let current = null;
    const elements = new Map();

    const strip = document.createElement('div');
    strip.className = 'tab-strip';
    strip.setAttribute('role', 'tablist');
    const add = document.createElement('button');
    add.className = 'tab-add';
    add.textContent = '+';
    add.title = '新建标签 (Ctrl+N)';
    add.setAttribute('aria-label', '新建标签');
    add.addEventListener('click', onNew);
    bar.append(strip, add);

    const updateNarrow = () => strip.classList.toggle('narrow', strip.parentElement.clientWidth / list.length < NARROW_WIDTH);

    // 用鼠标连续关闭时其余标签保持宽度，下一个关闭按钮落在鼠标下方（FR-824）
    function freeze() {
      for (const el of strip.children) el.style.flex = `0 0 ${el.getBoundingClientRect().width}px`;
    }
    function unfreeze() {
      for (const el of strip.children) el.style.flex = '';
    }
    function closeWithMouse(tab) {
      freeze();
      onClose(tab);
    }

    function startDrag(down, tab, el) {
      if (down.button !== 0 || down.target.closest('.tab-close') || list.length < 2) return;
      const origin = [...list];
      const grab = down.clientX - el.getBoundingClientRect().left;
      let dragging = false;

      function place(clientX) {
        const box = strip.getBoundingClientRect();
        if (clientX < box.left + EDGE) strip.scrollLeft -= 12;
        else if (clientX > box.right - EDGE) strip.scrollLeft += 12;
        const left = Math.min(Math.max(clientX - grab, box.left), box.right - el.offsetWidth);
        const others = list.filter((t) => t !== tab);
        const middle = left + el.offsetWidth / 2;
        let to = others.findIndex((t) => {
          const r = element(t).getBoundingClientRect();
          return middle < r.left + r.width / 2;
        });
        if (to === -1) to = others.length;
        if (to !== list.indexOf(tab)) {
          list.splice(0, list.length, ...others.slice(0, to), tab, ...others.slice(to));
          render();
        }
        el.style.transform = '';
        el.style.transform = `translateX(${left - el.getBoundingClientRect().left}px)`;
      }

      const move = (e) => {
        if (!dragging) {
          if (Math.abs(e.clientX - down.clientX) < DRAG_THRESHOLD) return;
          dragging = true;
          el.classList.add('dragging');
          onSelect(tab);
        }
        place(e.clientX);
      };
      function finish(cancel) {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', abort);
        window.removeEventListener('keydown', key, true);
        el.classList.remove('dragging');
        el.style.transform = '';
        if (cancel) {
          list.splice(0, list.length, ...origin);
          render();
        }
        if (dragging) onSelect(tab);
      }
      const up = () => finish(false);
      const abort = () => finish(true);
      const key = (e) => {
        if (e.key !== 'Escape' || !dragging) return;
        e.preventDefault();
        e.stopPropagation();
        abort();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', abort);
      window.addEventListener('keydown', key, true);
    }

    function onTabKey(e, tab, el) {
      if (e.target !== el) return;
      const at = list.indexOf(tab);
      const to = { ArrowRight: (at + 1) % list.length, ArrowLeft: (at - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[
        e.key
      ];
      if (to !== undefined) element(list[to]).focus();
      else if (e.key === 'Enter' || e.key === ' ') onSelect(tab);
      else if (e.key === 'Delete') onClose(tab);
      else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        const r = el.getBoundingClientRect();
        onMenu(tab, r.left, r.bottom);
      } else return;
      e.preventDefault();
    }

    function element(tab) {
      if (elements.has(tab)) return elements.get(tab);
      const el = document.createElement('div');
      el.className = 'tab';
      el.setAttribute('role', 'tab');
      const name = document.createElement('span');
      name.className = 'tab-name';
      const hint = document.createElement('span');
      hint.className = 'tab-hint';
      const close = document.createElement('button');
      close.className = 'tab-close';
      close.tabIndex = -1;
      close.textContent = '×';
      close.title = '关闭标签 (Ctrl+W)';
      close.setAttribute('aria-label', '关闭标签');
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        closeWithMouse(tab);
      });
      el.append(name, hint, close);
      el.addEventListener('click', () => onSelect(tab));
      el.addEventListener('pointerdown', (e) => startDrag(e, tab, el));
      el.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
      el.addEventListener('auxclick', (e) => e.button === 1 && closeWithMouse(tab));
      el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        onMenu(tab, e.clientX, e.clientY);
      });
      el.addEventListener('keydown', (e) => onTabKey(e, tab, el));
      elements.set(tab, el);
      return el;
    }

    function refresh(tab) {
      const el = element(tab);
      el.classList.toggle('dirty', tab.dirty);
      el.classList.toggle('start', tab.kind === 'start');
      el.classList.toggle('active', tab === current);
      el.setAttribute('aria-selected', tab === current ? 'true' : 'false');
      el.tabIndex = tab === current ? 0 : -1;
    }

    function render() {
      const hints = TabUtils.hints(list.map((t) => t.path));
      strip.replaceChildren(
        ...list.map((tab, i) => {
          const el = element(tab);
          el.querySelector('.tab-name').textContent = title(tab);
          el.querySelector('.tab-hint').textContent = hints[i];
          el.title = tab.path || title(tab);
          refresh(tab);
          return el;
        }),
      );
      updateNarrow();
    }

    strip.addEventListener(
      'wheel',
      (e) => {
        if (strip.scrollWidth <= strip.clientWidth) return;
        strip.scrollLeft += e.deltaY || e.deltaX;
        e.preventDefault();
      },
      { passive: false },
    );
    bar.addEventListener('dblclick', (e) => {
      if (e.target === bar || e.target === strip) onNew();
    });
    bar.addEventListener('pointerleave', unfreeze);
    new ResizeObserver(updateNarrow).observe(bar);

    const reveal = (tab) => element(tab).scrollIntoView({ block: 'nearest', inline: 'nearest' });

    return {
      list,
      get current() {
        return current;
      },
      find: (key) => list.find((t) => t.path && TabUtils.pathKey(t.path) === key),
      insert(tab, index = list.length) {
        list.splice(index, 0, tab);
        render();
      },
      remove(targets) {
        for (const tab of targets) {
          list.splice(list.indexOf(tab), 1);
          elements.delete(tab);
        }
        render();
      },
      /** 把 tab 移到 index，超出范围时不动（US3-9） */
      move(tab, index) {
        if (index < 0 || index >= list.length) return;
        list.splice(list.indexOf(tab), 1);
        list.splice(index, 0, tab);
        render();
        reveal(tab);
      },
      render,
      select(tab) {
        const previous = current;
        current = tab;
        if (previous) refresh(previous);
        refresh(tab);
        reveal(tab);
      },
      update: refresh,
      /** 打开已打开的文件时提示用户切换到了哪个标签（FR-802） */
      flash(tab) {
        const el = element(tab);
        el.classList.remove('flash');
        void el.offsetWidth; // 重新触发动画
        el.classList.add('flash');
      },
    };
  }

  root.Tabs = { create };
})(this);
