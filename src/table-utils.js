// 纯函数：GFM 表格的解析、变换与排版（FR-201..207）。浏览器中挂到 window.TableUtils，Node 中供测试 require。
// 模型：{ firstPrefix, prefix, align: ('left'|'center'|'right'|null)[], rows: string[][] }，rows[0] 为表头。
(function (root) {
  const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{1F300}-\u{1FAFF}\u{20000}-\u{3FFFD}]/u;

  const displayWidth = (s) => [...s].reduce((w, c) => w + (WIDE.test(c) ? 2 : 1), 0);

  /** 按未转义的 | 拆分（GFM：行内代码中的 | 同样要转义才算内容） */
  function splitRow(line) {
    const s = line.trim().replace(/^\|/, '');
    const cells = [];
    let cur = '';
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '\\' && i + 1 < s.length) {
        cur += s[i] + s[i + 1];
        i++;
      } else if (s[i] === '|') {
        cells.push(cur.trim());
        cur = '';
      } else {
        cur += s[i];
      }
    }
    if (cur.trim()) cells.push(cur.trim());
    return cells;
  }

  function alignOf(cell) {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    return right ? 'right' : left ? 'left' : null;
  }

  function parseTable(md) {
    const lines = md.split('\n');
    const firstPrefix = /^[\s>]*(?:[-*+]\s+|\d+[.)]\s+)?/.exec(lines[0])[0];
    const prefix = lines.length > 1 ? /^[\s>]*/.exec(lines[1])[0] : '';
    const cut = (line, i) => line.slice(i === 0 ? firstPrefix.length : Math.min(prefix.length, /^[\s>]*/.exec(line)[0].length));
    const [head, delimiter, ...body] = lines.map(cut);
    const header = splitRow(head);
    const columns = header.length;
    const align = Array.from({ length: columns }, (_, c) => alignOf(splitRow(delimiter)[c] || ''));
    const fit = (cells) => Array.from({ length: columns }, (_, c) => cells[c] || '');
    return { firstPrefix, prefix, align, rows: [header, ...body.map((l) => fit(splitRow(l)))] };
  }

  function pad(text, width, align) {
    const space = width - displayWidth(text);
    if (align === 'right') return ' '.repeat(space) + text;
    if (align === 'center') return ' '.repeat(Math.floor(space / 2)) + text + ' '.repeat(Math.ceil(space / 2));
    return text + ' '.repeat(space);
  }

  function delimiterCell(width, align) {
    if (align === 'center') return `:${'-'.repeat(width - 2)}:`;
    if (align === 'right') return `${'-'.repeat(width - 1)}:`;
    if (align === 'left') return `:${'-'.repeat(width - 1)}`;
    return '-'.repeat(width);
  }

  /** 输出标准 GFM 表格，各列按显示宽度（中日韩计 2）对齐，对齐方式写在分隔行 */
  function formatTable({ firstPrefix, prefix, align, rows }) {
    const widths = align.map((a, c) => Math.max(a === 'center' ? 5 : a ? 4 : 3, ...rows.map((r) => displayWidth(r[c]))));
    const line = (cells) => `| ${cells.join(' | ')} |`;
    const head = line(rows[0].map((t, c) => pad(t, widths[c], align[c])));
    const delimiter = line(widths.map((w, c) => delimiterCell(w, align[c])));
    const body = rows.slice(1).map((r) => prefix + line(r.map((t, c) => pad(t, widths[c], align[c]))));
    return [firstPrefix + head, prefix + delimiter, ...body].join('\n');
  }

  const columnsOf = (m) => m.align.length;
  const emptyRow = (m) => Array(columnsOf(m)).fill('');
  const moved = (list, from, to) => {
    const out = [...list];
    out.splice(to, 0, out.splice(from, 1)[0]);
    return out;
  };
  const inserted = (list, at, value) => [...list.slice(0, at), value, ...list.slice(at)];
  const removed = (list, at) => list.filter((_, i) => i !== at);

  const canDeleteRow = (m, r) => r >= 1 && m.rows.length > 2;
  const canDeleteCol = (m) => columnsOf(m) > 1;

  /** at 为新行的下标，表头之上不能插入 */
  const insertRow = (m, at) => (at < 1 ? m : { ...m, rows: inserted(m.rows, at, emptyRow(m)) });
  const deleteRow = (m, r) => (canDeleteRow(m, r) ? { ...m, rows: removed(m.rows, r) } : m);
  const moveRow = (m, from, to) => (from < 1 || to < 1 || to >= m.rows.length ? m : { ...m, rows: moved(m.rows, from, to) });
  const insertCol = (m, at) => ({ ...m, align: inserted(m.align, at, null), rows: m.rows.map((r) => inserted(r, at, '')) });
  const deleteCol = (m, c) => (canDeleteCol(m) ? { ...m, align: removed(m.align, c), rows: m.rows.map((r) => removed(r, c)) } : m);
  const moveCol = (m, from, to) =>
    to < 0 || to >= columnsOf(m) ? m : { ...m, align: moved(m.align, from, to), rows: m.rows.map((r) => moved(r, from, to)) };
  const setAlign = (m, c, align) => ({ ...m, align: m.align.map((a, i) => (i === c ? align : a)) });

  /** rows 含表头；至少表头 + 1 行数据、1 列（FR-207）。在右侧/下方增删，已有内容保留 */
  function resize(m, rows, cols) {
    const r = Math.max(rows, 2);
    const c = Math.max(cols, 1);
    const fit = (cells) => Array.from({ length: c }, (_, i) => cells[i] ?? '');
    return {
      ...m,
      align: Array.from({ length: c }, (_, i) => m.align[i] ?? null),
      rows: Array.from({ length: r }, (_, i) => fit(m.rows[i] ?? [])),
    };
  }

  const createTable = (rows, cols) => resize({ firstPrefix: '', prefix: '', align: [], rows: [] }, rows, cols);

  const api = {
    displayWidth,
    parseTable,
    formatTable,
    canDeleteRow,
    canDeleteCol,
    insertRow,
    deleteRow,
    moveRow,
    insertCol,
    deleteCol,
    moveCol,
    setAlign,
    resize,
    createTable,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TableUtils = api;
})(this);
