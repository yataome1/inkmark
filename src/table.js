// 表格操作界面（FR-201..207、FR-216）：工具条、尺寸选择器、右键菜单、快捷键、行列拖动。
// 每次操作只替换这张表格的文字，一步撤销；其他内容不重新渲染。
/* global CM, ContextMenu, TableUtils */
'use strict';

(function (root) {
  const T = TableUtils;
  const { isolateHistory } = CM;

  const tableOf = (wrap) => wrap.firstChild;

  function focusCell(wrap, r, c) {
    const table = tableOf(wrap);
    const row = table.rows[Math.min(r, table.rows.length - 1)];
    const td = row.cells[Math.min(c, row.cells.length - 1)];
    td.focus({ preventScroll: true });
    td.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const sel = getSelection();
    sel.selectAllChildren(td);
    sel.collapseToEnd();
  }

  /** transform(model) 返回新模型，null 表示删除表格；target 为操作后聚焦的 { r, c } */
  function applyEdit(wrap, transform, target) {
    const { view, widget } = tableOf(wrap);
    const from = view.posAtDOM(wrap);
    const to = from + widget.source.length;
    const next = transform(T.parseTable(widget.source));
    const insert = next ? T.formatTable(next) : '';
    if (insert !== widget.source) {
      view.dispatch({ changes: { from, to, insert }, annotations: isolateHistory.of('full'), userEvent: 'input' });
    }
    if (next && target) {
      focusCell(wrap, target.r, target.c);
      wrap.cell = target;
      refreshToolbar(wrap);
    } else if (!next) {
      view.focus();
    }
  }

  const modelOf = (wrap) => T.parseTable(tableOf(wrap).widget.source);

  // ---------------------------------------------------------------- 尺寸选择器（FR-201）

  const GRID = 10;
  const MAX_ROWS = 50;
  const MAX_COLS = 20;
  let closePicker = null;

  function openPicker(x, y, { rows, cols }, onPick) {
    closePicker?.();
    const box = document.createElement('div');
    box.className = 'im-picker';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', '表格大小');
    const grid = document.createElement('div');
    grid.className = 'im-picker-grid';
    const cells = [];
    for (let r = 1; r <= GRID; r++) {
      for (let c = 1; c <= GRID; c++) {
        const cell = document.createElement('div');
        cell.className = 'im-picker-cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        grid.append(cell);
        cells.push(cell);
      }
    }
    const field = (label, value, max) => {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = 1;
      input.max = max;
      input.value = value;
      input.title = label;
      input.setAttribute('aria-label', label);
      return input;
    };
    const rowInput = field('行数', rows, MAX_ROWS);
    const colInput = field('列数', cols, MAX_COLS);
    const form = document.createElement('div');
    form.className = 'im-picker-form';
    form.append(rowInput, ' 行 × ', colInput, ' 列');
    box.append(grid, form);

    const paint = (r, c) =>
      cells.forEach((el) => el.classList.toggle('on', Number(el.dataset.r) <= Number(r) && Number(el.dataset.c) <= Number(c)));
    const syncInputs = (r, c) => {
      rowInput.value = r;
      colInput.value = c;
      paint(r, c);
    };
    const clamp = (v, max) => Math.min(Math.max(Number(v) || 1, 1), max);
    const previous = document.activeElement;
    const close = () => {
      closePicker = null;
      box.remove();
      document.removeEventListener('pointerdown', outside, true);
      previous?.focus?.();
    };
    const outside = (e) => {
      if (!box.contains(e.target)) close();
    };
    const confirm = (r, c) => {
      close();
      onPick(clamp(r, MAX_ROWS), clamp(c, MAX_COLS));
    };
    closePicker = close;

    grid.addEventListener('pointerover', (e) => {
      if (e.target.dataset.r) syncInputs(e.target.dataset.r, e.target.dataset.c);
    });
    grid.addEventListener('click', (e) => {
      if (e.target.dataset.r) confirm(e.target.dataset.r, e.target.dataset.c);
    });
    for (const input of [rowInput, colInput]) input.addEventListener('input', () => paint(rowInput.value, colInput.value));
    box.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') close();
      else if (e.key === 'Enter') confirm(rowInput.value, colInput.value);
    });

    paint(rows, cols);
    box.style.left = '0';
    box.style.top = '0';
    document.body.append(box);
    const size = box.getBoundingClientRect();
    box.style.left = `${Math.max(0, Math.min(x, innerWidth - size.width))}px`;
    box.style.top = `${Math.max(0, Math.min(y, innerHeight - size.height))}px`;
    rowInput.focus();
    rowInput.select();
    document.addEventListener('pointerdown', outside, true);
  }

  // ---------------------------------------------------------------- 菜单与工具条

  function menuItems(wrap) {
    const m = modelOf(wrap);
    const { r, c } = wrap.cell;
    const last = m.rows.length - 1;
    const columns = m.align.length;
    const edit = (transform, target) => () => applyEdit(wrap, transform, target);
    return [
      { label: '上方插入行', disabled: r === 0, action: edit((x) => T.insertRow(x, r), { r, c }) },
      { label: '下方插入行', shortcut: 'Ctrl+Enter', action: edit((x) => T.insertRow(x, r + 1), { r: r + 1, c }) },
      { label: '左侧插入列', action: edit((x) => T.insertCol(x, c), { r, c }) },
      { label: '右侧插入列', action: edit((x) => T.insertCol(x, c + 1), { r, c: c + 1 }) },
      '-',
      { label: '上移行', disabled: r <= 1, action: edit((x) => T.moveRow(x, r, r - 1), { r: r - 1, c }) },
      { label: '下移行', disabled: r === 0 || r === last, action: edit((x) => T.moveRow(x, r, r + 1), { r: r + 1, c }) },
      { label: '左移列', disabled: c === 0, action: edit((x) => T.moveCol(x, c, c - 1), { r, c: c - 1 }) },
      { label: '右移列', disabled: c === columns - 1, action: edit((x) => T.moveCol(x, c, c + 1), { r, c: c + 1 }) },
      '-',
      {
        label: '删除行',
        shortcut: 'Ctrl+Shift+Backspace',
        disabled: !T.canDeleteRow(m, r),
        action: edit((x) => T.deleteRow(x, r), { r: Math.min(r, last - 1), c }),
      },
      { label: '删除列', disabled: !T.canDeleteCol(m), action: edit((x) => T.deleteCol(x, c), { r, c: Math.min(c, columns - 2) }) },
      '-',
      ...ALIGNS.map(([label, align]) => ({ label, action: edit((x) => T.setAlign(x, c, align), { r, c }) })),
      '-',
      { label: '删除表格', action: edit(() => null) },
    ];
  }

  const ALIGNS = [
    ['左对齐', 'left'],
    ['居中', 'center'],
    ['右对齐', 'right'],
  ];

  function resizeFromPicker(wrap, x, y) {
    const m = modelOf(wrap);
    const { r, c } = wrap.cell;
    openPicker(x, y, { rows: m.rows.length, cols: m.align.length }, (rows, cols) =>
      applyEdit(wrap, (cur) => T.resize(cur, rows, cols), { r: Math.min(r, rows - 1), c: Math.min(c, cols - 1) }),
    );
  }

  function buildToolbar(wrap) {
    const bar = document.createElement('div');
    bar.className = 'im-table-toolbar';
    const button = (text, title, onClick) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.title = title;
      b.setAttribute('aria-label', title);
      // 不抢走单元格的焦点
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => onClick(b));
      bar.append(b);
      return b;
    };
    const below = (b) => {
      const rect = b.getBoundingClientRect();
      return [rect.left, rect.bottom + 4];
    };
    button('▦', '调整大小', (b) => resizeFromPicker(wrap, ...below(b)));
    wrap.alignButtons = [
      ['⇤', '左对齐', 'left'],
      ['↔', '居中', 'center'],
      ['⇥', '右对齐', 'right'],
    ].map(([text, title, align]) => {
      const b = button(text, title, () => applyEdit(wrap, (x) => T.setAlign(x, wrap.cell.c, align), wrap.cell));
      b.dataset.align = align;
      return b;
    });
    button('🗑', '删除表格', () => applyEdit(wrap, () => null));
    button('⋯', '更多', (b) => ContextMenu.show(...below(b), menuItems(wrap)));
    return bar;
  }

  function refreshToolbar(wrap) {
    const current = modelOf(wrap).align[wrap.cell.c];
    for (const b of wrap.alignButtons) b.classList.toggle('on', b.dataset.align === current);
    // 上方空间不足时放到表格下方（R3）
    const { view } = tableOf(wrap);
    wrap.classList.toggle('toolbar-below', wrap.getBoundingClientRect().top - view.scrollDOM.getBoundingClientRect().top < 56);
  }

  // ---------------------------------------------------------------- 行列拖动（FR-205）

  function buildHandles(wrap) {
    const table = tableOf(wrap);
    const handle = (cls, title) => {
      const el = document.createElement('div');
      el.className = `im-handle ${cls}`;
      el.title = title;
      el.textContent = '⠿';
      el.hidden = true;
      wrap.append(el);
      return el;
    };
    const rowHandle = handle('im-handle-row', '拖动以移动行');
    const colHandle = handle('im-handle-col', '拖动以移动列');
    const line = document.createElement('div');
    line.className = 'im-drop-line';
    line.hidden = true;
    wrap.append(line);
    let hover = null;
    const origin = () => wrap.getBoundingClientRect();

    wrap.addEventListener('pointerover', (e) => {
      const td = e.target.closest?.('td,th');
      if (!td || wrap.dragging) return;
      hover = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
      const base = origin();
      const row = td.parentElement.getBoundingClientRect();
      const cell = td.getBoundingClientRect();
      rowHandle.hidden = hover.r === 0;
      rowHandle.style.top = `${row.top - base.top + row.height / 2 - 9}px`;
      colHandle.hidden = false;
      colHandle.style.left = `${cell.left - base.left + cell.width / 2 - 9}px`;
    });
    wrap.addEventListener('pointerleave', () => {
      if (!wrap.dragging) rowHandle.hidden = colHandle.hidden = true;
    });

    const drag = (el, axis) => {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        wrap.dragging = true;
        const from = axis === 'row' ? hover.r : hover.c;
        let to = from;
        const rects = () => (axis === 'row' ? [...table.rows].slice(1) : [...table.rows[0].cells]).map((n) => n.getBoundingClientRect());
        const first = axis === 'row' ? 1 : 0;
        const move = (ev) => {
          const list = rects();
          const pos = axis === 'row' ? ev.clientY : ev.clientX;
          let slot = list.findIndex((r) => pos < (axis === 'row' ? r.top + r.height / 2 : r.left + r.width / 2));
          if (slot === -1) slot = list.length;
          const base = origin();
          const box = table.getBoundingClientRect();
          line.hidden = false;
          if (axis === 'row') {
            const y = slot < list.length ? list[slot].top : list[list.length - 1].bottom;
            line.style.cssText = `left:${box.left - base.left}px;top:${y - base.top - 1}px;width:${box.width}px;height:2px`;
          } else {
            const x = slot < list.length ? list[slot].left : list[list.length - 1].right;
            line.style.cssText = `left:${x - base.left - 1}px;top:${box.top - base.top}px;width:2px;height:${box.height}px`;
          }
          // slot 是移除前的插入位置；向后移动时移除自身后下标减一
          const insertAt = slot + first;
          to = insertAt > from ? insertAt - 1 : insertAt;
        };
        const up = () => {
          el.removeEventListener('pointermove', move);
          el.removeEventListener('pointerup', up);
          wrap.dragging = false;
          line.hidden = true;
          rowHandle.hidden = colHandle.hidden = true;
          if (to === from) return;
          if (axis === 'row') applyEdit(wrap, (x) => T.moveRow(x, from, to), { r: to, c: hover.c });
          else applyEdit(wrap, (x) => T.moveCol(x, from, to), { r: hover.r, c: to });
        };
        el.addEventListener('pointermove', move);
        el.addEventListener('pointerup', up);
      });
    };
    drag(rowHandle, 'row');
    drag(colHandle, 'col');
  }

  // ---------------------------------------------------------------- 接入表格小部件

  function attach(wrap) {
    const table = tableOf(wrap);
    wrap.cell = { r: 0, c: 0 };
    wrap.append(buildToolbar(wrap));
    buildHandles(wrap);
    table.addEventListener('focusin', (e) => {
      const td = e.target.closest('td,th');
      if (!td) return;
      wrap.cell = { r: Number(td.dataset.r), c: Number(td.dataset.c) };
      wrap.classList.add('active');
      refreshToolbar(wrap);
    });
    table.addEventListener('focusout', (e) => {
      if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) wrap.classList.remove('active');
    });
    table.addEventListener('contextmenu', (e) => {
      const td = e.target.closest('td,th');
      if (!td) return;
      e.preventDefault();
      focusCell(wrap, Number(td.dataset.r), Number(td.dataset.c));
      ContextMenu.show(e.clientX, e.clientY, menuItems(wrap));
    });
    table.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || e.ctrlKey || e.altKey) return;
      e.preventDefault();
      move(wrap, e.shiftKey ? -1 : 1);
    });
  }

  /** Tab 在单元格间移动；最后一个单元格新增一行（FR-204） */
  function move(wrap, delta) {
    const m = modelOf(wrap);
    const columns = m.align.length;
    const index = wrap.cell.r * columns + wrap.cell.c + delta;
    if (index < 0) return;
    if (index >= m.rows.length * columns) {
      const r = m.rows.length;
      applyEdit(wrap, (x) => T.insertRow(x, r), { r, c: 0 });
      return;
    }
    focusCell(wrap, Math.floor(index / columns), index % columns);
  }

  /** 表格结构变化后恢复焦点（撤销等） */
  function restoreFocus(wrap) {
    focusCell(wrap, wrap.cell.r, wrap.cell.c);
  }

  const activeWrap = () => document.activeElement?.closest?.('.im-table-wrap') || null;

  const COMMANDS = {
    'table-insert-row': (wrap) =>
      applyEdit(wrap, (x) => T.insertRow(x, Math.max(wrap.cell.r, 0) + 1), { r: wrap.cell.r + 1, c: wrap.cell.c }),
    'table-delete-row': (wrap) => {
      const { r, c } = wrap.cell;
      const m = modelOf(wrap);
      if (T.canDeleteRow(m, r)) applyEdit(wrap, (x) => T.deleteRow(x, r), { r: Math.min(r, m.rows.length - 2), c });
    },
  };

  function command(name) {
    const wrap = activeWrap();
    if (wrap) COMMANDS[name](wrap);
  }

  /** 插入后聚焦新表格第一个表头单元格（US1-1） */
  function focusTableAt(view, pos) {
    requestAnimationFrame(() => {
      const wrap = [...view.contentDOM.querySelectorAll('.im-table-wrap')].find((w) => {
        const from = view.posAtDOM(w);
        return from <= pos && pos <= from + tableOf(w).widget.source.length;
      });
      if (wrap) focusCell(wrap, 0, 0);
    });
  }

  root.TableUi = { attach, restoreFocus, command, isActive: () => !!activeWrap(), openPicker, focusTableAt };
})(this);
