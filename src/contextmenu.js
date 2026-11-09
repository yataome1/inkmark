// 通用右键菜单（FR-203、FR-211）：只用于表格单元格、文件树、收藏列表，其他位置保持系统菜单。
'use strict';

(function (root) {
  let close = null;

  /**
   * @param {number} x
   * @param {number} y
   * @param {Array<'-' | { label: string, shortcut?: string, disabled?: boolean, action: () => void }>} items
   */
  function show(x, y, items) {
    close?.();
    const menu = document.createElement('div');
    menu.className = 'im-menu';
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;

    const enabled = [];
    let selected = -1;
    const select = (i) => {
      enabled[selected]?.el.classList.remove('selected');
      selected = i;
      enabled[selected]?.el.classList.add('selected');
    };
    const run = (item) => {
      close();
      item.action();
    };

    for (const item of items) {
      if (item === '-') {
        const sep = document.createElement('div');
        sep.className = 'im-menu-sep';
        menu.append(sep);
        continue;
      }
      const el = document.createElement('div');
      el.className = `im-menu-item${item.disabled ? ' disabled' : ''}`;
      el.setAttribute('role', 'menuitem');
      if (item.disabled) el.setAttribute('aria-disabled', 'true');
      const label = document.createElement('span');
      label.textContent = item.label;
      el.append(label);
      if (item.shortcut) {
        const shortcut = document.createElement('span');
        shortcut.className = 'shortcut';
        shortcut.textContent = item.shortcut;
        el.append(shortcut);
      }
      if (!item.disabled) {
        const index = enabled.length;
        enabled.push({ el, item });
        el.addEventListener('mouseenter', () => select(index));
        el.addEventListener('click', () => run(item));
      }
      menu.append(el);
    }

    menu.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown' && enabled.length) select((selected + 1) % enabled.length);
      else if (e.key === 'ArrowUp' && enabled.length) select((Math.max(selected, 0) - 1 + enabled.length) % enabled.length);
      else if (e.key === 'Enter' && enabled[selected]) run(enabled[selected].item);
      else return;
      e.preventDefault();
    });

    const previousFocus = document.activeElement;
    const onOutside = (e) => {
      if (!menu.contains(e.target)) close();
    };
    close = () => {
      close = null;
      menu.remove();
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('blur', closeMenu);
      previousFocus?.focus?.();
    };
    const closeMenu = () => close?.();

    menu.style.left = '0';
    menu.style.top = '0';
    document.body.append(menu);
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(x, innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(y, innerHeight - height))}px`;
    menu.focus();

    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('scroll', closeMenu, true);
    window.addEventListener('blur', closeMenu);
  }

  root.ContextMenu = { show };
})(this);
