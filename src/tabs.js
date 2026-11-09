// 标签栏（FR-801、FR-805、FR-817）：只管理标签顺序与显示，文档内容由 app.js 负责。
/* global TabUtils */
'use strict';

(function (root) {
  /** @param {{ bar: HTMLElement, onSelect: (tab: object) => void, onClose: (tab: object) => void, onNew: () => void, title: (tab: object) => string }} options */
  function create({ bar, onSelect, onClose, onNew, title }) {
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
        onClose(tab);
      });
      el.append(name, hint, close);
      el.addEventListener('click', () => onSelect(tab));
      el.addEventListener('mousedown', (e) => e.button === 1 && e.preventDefault());
      el.addEventListener('auxclick', (e) => e.button === 1 && onClose(tab));
      elements.set(tab, el);
      return el;
    }

    function refresh(tab) {
      const el = element(tab);
      el.classList.toggle('dirty', tab.dirty);
      el.classList.toggle('start', tab.kind === 'start');
      el.classList.toggle('active', tab === current);
      el.setAttribute('aria-selected', tab === current ? 'true' : 'false');
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
    }

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
