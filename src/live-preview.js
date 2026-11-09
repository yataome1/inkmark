// 即时渲染（FR-604、FR-605）：只用装饰改变显示，文档文本不变。
// 行内元素由 ViewPlugin 按可视区域计算；块级小部件必须由 StateField 提供。
/* global CM, Render, Anchor, Finder, TableUi */
'use strict';

(function (root) {
  const {
    ensureSyntaxTree,
    Decoration,
    EditorSelection,
    EditorView,
    Prec,
    StateEffect,
    StateField,
    ViewPlugin,
    WidgetType,
    keymap,
    syntaxTree,
    undo,
    redo,
  } = CM;

  const refresh = StateEffect.define(); // 输入法组合结束、拖选结束、主题变化后强制重算
  let dragging = false;
  let jump = null; // 最近一次大纲/目录跳转：其上方的图表异步渲染完成后要重新定位

  function jumpTo(view, pos) {
    jump = { pos, until: Date.now() + 3000 };
    view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'start' }) });
  }

  // ---------------------------------------------------------------- 语法扩展

  const isSpace = (c) => c === 32 || c === 9 || c === 10 || Number.isNaN(c) || c === -1;

  const HighlightDelim = { resolve: 'Highlight', mark: 'HighlightMark' };

  const syntax = {
    remove: ['Superscript', 'Subscript', 'Emoji'], // 与 [^1] 脚注冲突，且 0.2.x 不支持
    defineNodes: [
      { name: 'InlineMath' },
      { name: 'InlineMathMark' },
      { name: 'MathBlock', block: true },
      { name: 'Highlight' },
      { name: 'HighlightMark' },
    ],
    parseInline: [
      {
        name: 'InlineMath',
        parse(cx, next, pos) {
          if (next !== 36 || cx.char(pos + 1) === 36) return -1;
          const first = cx.char(pos + 1);
          if (isSpace(first) || (first >= 48 && first <= 57)) return -1;
          for (let i = pos + 1; i < cx.end; i++) {
            const c = cx.char(i);
            if (c === 10) return -1;
            if (c === 92) i++;
            else if (c === 36) {
              if (isSpace(cx.char(i - 1))) return -1;
              return cx.addElement(
                cx.elt('InlineMath', pos, i + 1, [cx.elt('InlineMathMark', pos, pos + 1), cx.elt('InlineMathMark', i, i + 1)]),
              );
            }
          }
          return -1;
        },
      },
      {
        name: 'Highlight',
        parse(cx, next, pos) {
          if (next !== 61 || cx.char(pos + 1) !== 61 || cx.char(pos + 2) === 61) return -1;
          return cx.addDelimiter(HighlightDelim, pos, pos + 2, !isSpace(cx.char(pos + 2)), !isSpace(cx.char(pos - 1)));
        },
      },
    ],
    parseBlock: [
      {
        name: 'MathBlock',
        before: 'FencedCode',
        parse(cx, line) {
          if (!line.text.slice(line.pos).startsWith('$$')) return false;
          const from = cx.lineStart + line.pos;
          const rest = line.text.slice(line.pos + 2);
          const single = rest.indexOf('$$');
          if (single !== -1) {
            if (rest.slice(single + 2).trim()) return false;
            cx.addElement(cx.elt('MathBlock', from, cx.lineStart + line.pos + 2 + single + 2));
            cx.nextLine();
            return true;
          }
          let end = cx.lineStart + line.text.length;
          while (cx.nextLine()) {
            end = cx.lineStart + line.text.length;
            if (line.text.slice(line.pos).trimEnd() === '$$') {
              cx.nextLine();
              break;
            }
          }
          cx.addElement(cx.elt('MathBlock', from, end));
          return true;
        },
        endLeaf: (_cx, line) => line.text.slice(line.pos).startsWith('$$'),
      },
    ],
  };

  /** 第一个结束位置不早于 pos 的匹配下标（matches 按位置排序且互不重叠） */
  function firstMatchAt(matches, pos) {
    let lo = 0;
    let hi = matches.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (matches[mid].to < pos) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  const touches = (sel, from, to) => sel.ranges.some((r) => r.from <= to && r.to >= from);

  /** 表格区间内的匹配 */
  function matchesIn(matches, from, to) {
    const out = [];
    for (let i = firstMatchAt(matches, from); i < matches.length && matches[i].from <= to; i++) out.push(matches[i]);
    return out;
  }

  // ---------------------------------------------------------------- 小部件

  const imageSizes = new Map();

  class ImageWidget extends WidgetType {
    constructor(src, alt, imageUrl) {
      super();
      this.src = src;
      this.alt = alt;
      this.imageUrl = imageUrl;
    }
    eq(o) {
      return o.src === this.src && o.alt === this.alt;
    }
    toDOM() {
      const img = document.createElement('img');
      img.className = 'im-image';
      img.alt = this.alt;
      img.dataset.source = this.src;
      const size = imageSizes.get(this.src);
      if (size) {
        img.width = size.width; // 激活/未激活切换时占位不变，不跳动（FR-606）
        img.style.aspectRatio = `${size.width} / ${size.height}`;
      }
      img.onload = () => imageSizes.set(this.src, { width: img.naturalWidth, height: img.naturalHeight });
      this.imageUrl(this.src).then(
        (url) => {
          if (url) img.src = url;
          else img.classList.add('im-broken');
        },
        () => img.classList.add('im-broken'),
      );
      img.onerror = () => img.classList.add('im-broken');
      return img;
    }
    ignoreEvent() {
      return false;
    }
  }

  class MathWidget extends WidgetType {
    constructor(source) {
      super();
      this.source = source;
    }
    eq(o) {
      return o.source === this.source;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = 'im-math';
      el.dataset.source = this.source;
      Render.renderMath(el, this.source, false);
      return el;
    }
    ignoreEvent() {
      return false;
    }
  }

  class TextWidget extends WidgetType {
    constructor(cls, text) {
      super();
      this.cls = cls;
      this.text = text;
    }
    eq(o) {
      return o.cls === this.cls && o.text === this.text;
    }
    toDOM() {
      const el = document.createElement('span');
      el.className = this.cls;
      el.textContent = this.text;
      return el;
    }
    ignoreEvent() {
      return false;
    }
  }

  class BreakWidget extends WidgetType {
    eq() {
      return true;
    }
    toDOM() {
      return document.createElement('br');
    }
  }

  class CheckboxWidget extends WidgetType {
    constructor(checked) {
      super();
      this.checked = checked;
    }
    eq(o) {
      return o.checked === this.checked;
    }
    toDOM(view) {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'im-check';
      box.checked = this.checked;
      box.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const pos = view.posAtDOM(box) + 1;
        view.dispatch({ changes: { from: pos, to: pos + 1, insert: this.checked ? ' ' : 'x' } });
      });
      return box;
    }
    ignoreEvent() {
      return true;
    }
  }

  const svgDone = new Map(); // 已渲染的 SVG 与高度：激活/未激活切换时同步显示，不闪烁

  /** 块公式与 Mermaid；caretOffset 为单击时光标相对块首的位置（放进源码） */
  class BlockWidget extends WidgetType {
    constructor(kind, source, theme, caretOffset) {
      super();
      this.kind = kind;
      this.source = source;
      this.theme = theme;
      this.caretOffset = caretOffset;
    }
    eq(o) {
      return o.kind === this.kind && o.source === this.source && o.theme === this.theme;
    }
    get key() {
      return `${this.theme}\n${this.source}`;
    }
    get estimatedHeight() {
      return this.kind === 'mermaid' ? svgDone.get(this.key)?.height || 240 : 72;
    }
    paint(el, view) {
      if (this.kind === 'math') {
        Render.renderMath(el, this.source, true);
        return;
      }
      const done = svgDone.get(this.key);
      if (done) {
        el.innerHTML = done.svg;
        return;
      }
      Render.renderMermaid(this.source, this.theme).then(
        (svg) => {
          if (el.dataset.source !== this.source) return;
          el.innerHTML = svg;
          el.classList.remove('im-error');
          svgDone.set(this.key, { svg, height: el.offsetHeight });
          view.requestMeasure();
          if (jump && Date.now() < jump.until) view.dispatch({ effects: EditorView.scrollIntoView(jump.pos, { y: 'start' }) });
        },
        (err) => {
          if (el.dataset.source !== this.source) return;
          el.classList.add('im-error');
          el.textContent = `图表错误：${err.message || err}`;
          view.requestMeasure();
        },
      );
    }
    toDOM(view) {
      const el = document.createElement('div');
      el.className = `im-block im-${this.kind}`;
      el.dataset.source = this.source;
      const done = this.kind === 'mermaid' && svgDone.get(this.key);
      if (done) el.style.minHeight = `${done.height}px`;
      this.paint(el, view);
      el.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        view.dispatch({ selection: { anchor: view.posAtDOM(el) + el.widgetCaret } });
        view.focus();
      });
      el.widgetCaret = this.caretOffset;
      return el;
    }
    updateDOM(el, view) {
      if (!el.classList.contains(`im-${this.kind}`)) return false;
      el.dataset.source = this.source;
      el.widgetCaret = this.caretOffset;
      clearTimeout(el.paintTimer);
      if (this.kind === 'math') this.paint(el, view);
      else el.paintTimer = setTimeout(() => this.paint(el, view), 300);
      return true;
    }
    ignoreEvent() {
      return true;
    }
  }

  class TocWidget extends WidgetType {
    constructor(headings) {
      super();
      this.headings = headings;
    }
    eq(o) {
      return this.key === o.key;
    }
    get key() {
      // 不含位置：上方的编辑只移动标题位置，目录内容不变，不需要重绘
      return JSON.stringify(this.headings.map((h) => [h.level, h.text]));
    }
    toDOM(view) {
      const el = document.createElement('div');
      el.className = 'im-block im-toc';
      this.headings.forEach((h, i) => {
        const a = document.createElement('div');
        a.textContent = h.text;
        a.style.paddingLeft = `${(h.level - 1) * 20}px`;
        a.addEventListener('mousedown', (e) => {
          e.preventDefault();
          jumpTo(view, headingsOf(view.state, syntaxTree(view.state))[i].from);
        });
        el.append(a);
      });
      return el;
    }
    ignoreEvent() {
      return true;
    }
  }

  // ---------------------------------------------------------------- 表格

  /** 由语法树得到行列模型：每格记录源码区间，空单元格记录两竖线之间的间隙 */
  function tableModel(state, table) {
    const rows = [];
    let aligns = [];
    for (let row = table.firstChild; row; row = row.nextSibling) {
      if (row.name === 'TableDelimiter') {
        aligns = state
          .sliceDoc(row.from, row.to)
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((d) => {
            const s = d.trim();
            return s.startsWith(':') && s.endsWith(':') ? 'center' : s.endsWith(':') ? 'right' : s.startsWith(':') ? 'left' : '';
          });
      } else if (row.name === 'TableHeader' || row.name === 'TableRow') {
        const cells = [];
        let gapFrom = row.from;
        let cell = null;
        let sawPipe = false;
        const flush = (gapTo) => {
          if (cell) cells.push({ from: cell.from, to: cell.to, text: state.sliceDoc(cell.from, cell.to) });
          else if (sawPipe || gapTo > gapFrom) cells.push({ gapFrom, gapTo, text: '' });
          cell = null;
        };
        for (let c = row.firstChild; c; c = c.nextSibling) {
          if (c.name === 'TableCell') cell = c;
          else if (c.name === 'TableDelimiter') {
            if (c.from > row.from || cell) flush(c.from);
            sawPipe = true;
            gapFrom = c.to;
          }
        }
        if (cell) flush(row.to);
        rows.push(cells);
      }
    }
    return { rows, aligns };
  }

  /** 在排版后的单元格文本节点上加查找高亮；marks 为相对可见文字的偏移，公式不参与计数（FR-610） */
  function applyCellMarks(td, marks) {
    const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement.closest('.katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    let offset = 0;
    for (const node of nodes) {
      const start = offset;
      offset += node.length;
      // 从后往前切分，前面的下标不受影响
      for (const m of [...marks].reverse()) {
        const from = Math.max(m.from - start, 0);
        const to = Math.min(m.to - start, node.length);
        if (from >= to) continue;
        const range = document.createRange();
        range.setStart(node, from);
        range.setEnd(node, to);
        const span = document.createElement('span');
        span.className = m.current ? 'im-find-current' : 'im-find';
        range.surroundContents(span);
      }
    }
  }

  function paintCell(td, cell) {
    td.innerHTML = Render.renderInline(cell.text);
    if (cell.marks?.length) applyCellMarks(td, cell.marks);
  }

  const escapeCell = (text) => text.replace(/\r?\n/g, ' ').replace(/(^|[^\\])\|/g, '$1\\|');

  class TableWidget extends WidgetType {
    constructor(source, model) {
      super();
      this.source = source;
      this.model = model;
    }
    eq(o) {
      return o.source === this.source && o.marksKey === this.marksKey;
    }
    get marksKey() {
      return JSON.stringify(this.model.rows.map((cells) => cells.map((c) => c.marks)));
    }
    get estimatedHeight() {
      return this.model.rows.length * 38 + 16;
    }
    cellElements(dom) {
      return [...dom.rows].map((tr) => [...tr.cells]);
    }
    showCell(td, cell) {
      if (document.activeElement === td) {
        if (td.textContent !== cell.text) td.textContent = cell.text;
      } else {
        paintCell(td, cell);
      }
    }
    fill(dom, view) {
      const columns = this.model.rows[0].length;
      dom.replaceChildren();
      this.model.rows.forEach((cells, r) => {
        const tr = dom.insertRow();
        for (let c = 0; c < columns; c++) {
          const td = document.createElement(r === 0 ? 'th' : 'td');
          if (this.model.aligns[c]) td.style.textAlign = this.model.aligns[c];
          td.dataset.r = r;
          td.dataset.c = c;
          tr.append(td);
          if (cells[c]) {
            td.contentEditable = 'plaintext-only';
            paintCell(td, cells[c]);
          }
        }
      });
      dom.widget = this;
      dom.view = view;
    }
    toDOM(view) {
      // 外层用内边距留白：CodeMirror 不计入小部件的外边距，位置映射会错位
      const wrap = document.createElement('div');
      wrap.className = 'im-table-wrap';
      const dom = document.createElement('table');
      dom.className = 'im-table';
      wrap.append(dom);
      this.fill(dom, view);
      TableUi.attach(wrap);
      const cellOf = (td) => dom.widget.model.rows[td.dataset.r][td.dataset.c];
      const commit = (td) => {
        const cell = cellOf(td);
        if (!cell) return;
        const text = escapeCell(td.textContent);
        if (text === cell.text) return;
        // FR-602：只替换这个单元格的源码，其他单元格的空格排版不动
        const changes =
          cell.gapFrom === undefined
            ? { from: cell.from, to: cell.to, insert: text }
            : { from: cell.gapFrom, to: cell.gapTo, insert: ` ${text} ` };
        view.dispatch({ changes, userEvent: 'input.type' });
      };
      dom.addEventListener('focusin', (e) => {
        const td = e.target.closest('td,th');
        if (td && cellOf(td)) td.textContent = cellOf(td).text;
      });
      dom.addEventListener('focusout', (e) => {
        const td = e.target.closest('td,th');
        if (td && cellOf(td)) paintCell(td, cellOf(td));
      });
      dom.addEventListener('input', (e) => {
        if (!e.isComposing) commit(e.target.closest('td,th'));
      });
      dom.addEventListener('compositionend', (e) => commit(e.target.closest('td,th')));
      dom.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') e.preventDefault();
        const key = e.key.toLowerCase();
        if (e.ctrlKey && (key === 'z' || key === 'y')) {
          e.preventDefault();
          if (key === 'z' && !e.shiftKey) undo(view);
          else redo(view);
        }
      });
      return wrap;
    }
    updateDOM(wrap, view) {
      const dom = wrap.firstChild;
      const same = dom.rows.length === this.model.rows.length && dom.rows[0]?.cells.length === this.model.rows[0].length;
      if (!same) {
        const focused = dom.contains(document.activeElement);
        this.fill(dom, view);
        if (focused) TableUi.restoreFocus(wrap);
        return true;
      }
      const old = dom.widget;
      dom.widget = this;
      this.cellElements(dom).forEach((tds, r) =>
        tds.forEach((td, c) => {
          const cell = this.model.rows[r][c];
          td.style.textAlign = this.model.aligns[c] || '';
          const prev = old.model.rows[r][c];
          if (cell && (cell.text !== prev?.text || JSON.stringify(cell.marks) !== JSON.stringify(prev?.marks))) this.showCell(td, cell);
        }),
      );
      return true;
    }
    ignoreEvent() {
      return true;
    }
  }

  // ---------------------------------------------------------------- 块级装饰（StateField）

  const mermaidTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default');

  function headingsOf(state, tree) {
    const out = [];
    tree.iterate({
      enter(n) {
        const m = /^(?:ATX|Setext)Heading(\d)$/.exec(n.name);
        if (!m) return !['Paragraph', 'FencedCode', 'Table'].includes(n.name);
        const text = state
          .sliceDoc(n.from, n.to)
          .split('\n')[0]
          .replace(/^#+\s*|\s*#*$/g, '');
        out.push({ level: Number(m[1]), text, from: n.from });
        return false;
      },
    });
    return out;
  }

  // 围栏行折叠为零高度：跨换行的替换装饰会让鼠标点击定位到错误的行
  const HIDDEN_LINE = Decoration.line({ class: 'im-fence-hidden' });

  function buildBlocks(state) {
    const tree = syntaxTree(state);
    const { doc } = state;
    const { selection } = state;
    const matches = Finder.ranges(state);
    const out = [];
    const theme = mermaidTheme();
    let headings = null;

    const showBlock = (node, kind, source, caretOffset) => {
      const from = doc.lineAt(node.from).from;
      const to = doc.lineAt(node.to).to;
      const widget = new BlockWidget(kind, source, theme, caretOffset);
      if (touches(selection, from, to)) out.push(Decoration.widget({ widget, block: true, side: 1 }).range(to));
      else out.push(Decoration.replace({ widget, block: true }).range(from, to));
    };

    tree.iterate({
      enter(n) {
        if (['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem'].includes(n.name)) return true;
        if (n.name === 'MathBlock') {
          const text = doc.sliceString(n.from, n.to);
          const source = text.replace(/^\$\$\s*/, '').replace(/\s*\$\$\s*$/, '');
          showBlock(n, 'math', source, text.startsWith('$$\n') ? 3 : 2);
        } else if (n.name === 'FencedCode') {
          const node = n.node;
          const first = doc.lineAt(n.from);
          const info = node.getChild('CodeInfo');
          const code = node.getChild('CodeText');
          const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : '';
          if (lang === 'mermaid' && code) {
            showBlock(n, 'mermaid', doc.sliceString(code.from, code.to), first.length + 1);
          } else if (code && !touches(selection, n.from, n.to)) {
            out.push(HIDDEN_LINE.range(first.from));
            const closing = node.lastChild;
            if (closing.name === 'CodeMark' && closing.from !== node.firstChild.from) {
              out.push(HIDDEN_LINE.range(doc.lineAt(closing.from).from));
            }
          }
        } else if (n.name === 'Table') {
          const from = doc.lineAt(n.from).from;
          const to = doc.lineAt(n.to).to;
          const model = tableModel(state, n.node);
          const cells = model.rows.flat();
          const found = matchesIn(matches, from, to);
          for (const c of cells) {
            const base = c.from === undefined ? 0 : Finder.toVisible(state, c.from);
            c.marks =
              c.from === undefined
                ? []
                : found
                    .filter((m) => c.from <= m.from && m.to <= c.to)
                    .map((m) => ({ from: m.vFrom - base, to: m.vTo - base, current: !!m.current }));
          }
          if (model.rows.length && model.rows[0].length) {
            out.push(Decoration.replace({ widget: new TableWidget(doc.sliceString(from, to), model), block: true }).range(from, to));
          }
        } else if (n.name === 'Paragraph' && /^\[toc\]$/i.test(doc.sliceString(n.from, n.to)) && !touches(selection, n.from, n.to)) {
          out.push(Decoration.replace({ widget: new TocWidget((headings ??= headingsOf(state, tree))), block: true }).range(n.from, n.to));
        }
        return false;
      },
    });
    return Decoration.set(out, true);
  }

  const blocks = StateField.define({
    create: buildBlocks,
    update(deco, tr) {
      const refreshed = tr.effects.some((e) => e.is(refresh));
      if (tr.isUserEvent('input.type.compose') || (dragging && !tr.docChanged && !refreshed)) return deco.map(tr.changes);
      if (tr.docChanged || refreshed || tr.selection || Finder.changed(tr) || syntaxTree(tr.state) !== syntaxTree(tr.startState))
        return buildBlocks(tr.state);
      return deco;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  // ---------------------------------------------------------------- 行内装饰（ViewPlugin）

  const HIDE = Decoration.replace({});
  const marks = new Map();
  const markOf = (cls) => {
    if (!marks.has(cls)) marks.set(cls, Decoration.mark({ class: cls }));
    return marks.get(cls);
  };
  const lines = new Map();
  const lineOf = (cls) => {
    if (!lines.has(cls)) lines.set(cls, Decoration.line({ class: cls }));
    return lines.get(cls);
  };

  const INLINE_STYLES = {
    Emphasis: 'im-em',
    StrongEmphasis: 'im-strong',
    Strikethrough: 'im-del',
    InlineCode: 'im-code-inline',
    Highlight: 'im-highlight',
  };
  const INLINE_TAGS = new Set(['u', 'sub', 'sup', 'kbd', 'mark']);

  const highlightCache = new Map();
  function codeRanges(lang, code) {
    const key = `${lang}\n${code}`;
    if (highlightCache.has(key)) return highlightCache.get(key);
    const html = Render.highlightHtml(code, lang);
    const ranges = html === null ? [] : Render.htmlToRanges(html);
    if (highlightCache.size > 200) highlightCache.clear();
    highlightCache.set(key, ranges);
    return ranges;
  }

  function buildInline(view, imageUrl) {
    const { state } = view;
    const { doc } = state;
    const { selection: sel } = state;
    const out = [];
    const hide = (from, to) => {
      if (from < to && doc.lineAt(from).number === doc.lineAt(to).number) out.push(HIDE.range(from, to));
    };
    const mark = (cls, from, to) => {
      if (from < to) out.push(markOf(cls).range(from, to));
    };
    const line = (cls, pos) => out.push(lineOf(cls).range(doc.lineAt(pos).from));
    const codeLines = (cls, from, to) => {
      for (let pos = from; pos <= to;) {
        const l = doc.lineAt(pos);
        line(cls, l.from);
        pos = l.to + 1;
      }
    };
    const replace = (widget, from, to) => {
      if (doc.lineAt(from).number === doc.lineAt(to).number) out.push(Decoration.replace({ widget }).range(from, to));
    };

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(state).iterate({
        from,
        to,
        enter(n) {
          const { name } = n;
          const active = touches(sel, n.from, n.to);
          const heading = /^ATXHeading(\d)$/.exec(name) || /^SetextHeading(\d)$/.exec(name);
          if (heading) {
            line(`im-h${heading[1]}`, n.from);
            const m = n.node.getChild('HeaderMark');
            if (m && name.startsWith('ATX') && !active) {
              const text = doc.sliceString(m.to, m.to + 1);
              hide(m.from, Math.min(m.to + (text === ' ' ? 1 : 0), n.to));
            } else if (m && !name.startsWith('ATX')) {
              mark('im-marker', m.from, m.to);
            }
          } else if (INLINE_STYLES[name]) {
            mark(INLINE_STYLES[name], n.from, n.to);
            for (let c = n.node.firstChild; c; c = c.nextSibling) {
              if (/Mark$/.test(c.name)) {
                if (active) mark('im-marker', c.from, c.to);
                else hide(c.from, c.to);
              }
            }
          } else if (name === 'Escape') {
            if (!active) hide(n.from, n.from + 1);
          } else if (name === 'Link') {
            return link(n, active);
          } else if (name === 'URL') {
            urlMark(n.from, n.to, doc.sliceString(n.from, n.to));
          } else if (name === 'Image') {
            const m = /^!\[([^\]]*)\]\(\s*<?([^\s)>]+)/.exec(doc.sliceString(n.from, n.to));
            if (m) {
              const widget = new ImageWidget(m[2], m[1], imageUrl);
              if (active) out.push(Decoration.widget({ widget, side: 1 }).range(n.to));
              else replace(widget, n.from, n.to);
            }
            return false;
          } else if (name === 'InlineMath') {
            const source = doc.sliceString(n.from + 1, n.to - 1);
            const widget = new MathWidget(source);
            if (active) out.push(Decoration.widget({ widget, side: 1 }).range(n.to));
            else replace(widget, n.from, n.to);
            return false;
          } else if (name === 'MathBlock') {
            if (touches(sel, doc.lineAt(n.from).from, doc.lineAt(n.to).to)) codeLines('im-code', n.from, n.to);
            return false;
          } else if (name === 'FencedCode') {
            return fenced(n);
          } else if (name === 'CodeBlock') {
            codeLines('im-code', n.from, n.to);
            return false;
          } else if (name === 'QuoteMark') {
            line('im-quote', n.from);
            if (!touches(sel, doc.lineAt(n.from).from, doc.lineAt(n.from).to)) {
              const space = doc.sliceString(n.to, n.to + 1) === ' ' ? 1 : 0;
              hide(n.from, n.to + space);
            } else mark('im-marker', n.from, n.to);
          } else if (name === 'ListMark') {
            const isTask = n.node.nextSibling?.name === 'Task';
            const text = doc.sliceString(n.from, n.to);
            if (touches(sel, doc.lineAt(n.from).from, doc.lineAt(n.from).to)) mark('im-marker', n.from, n.to);
            else if (isTask) hide(n.from, n.to + 1);
            else if (/[-*+]/.test(text)) replace(new TextWidget('im-bullet', '•'), n.from, n.to);
            else mark('im-ordered', n.from, n.to);
          } else if (name === 'TaskMarker') {
            if (!active) replace(new CheckboxWidget(doc.sliceString(n.from + 1, n.to - 1).toLowerCase() === 'x'), n.from, n.to);
            else mark('im-marker', n.from, n.to);
          } else if (name === 'HorizontalRule') {
            if (!active) {
              line('im-hr', n.from);
              hide(n.from, n.to);
            }
          } else if (name === 'HTMLTag') {
            htmlTag(n);
          } else if (name === 'LinkReference') {
            line('im-reference', n.from);
            return false;
          } else if (['Table', 'HTMLBlock', 'CommentBlock'].includes(name)) {
            return false;
          }
          return undefined;
        },
      });
    }

    function urlMark(from, to, url) {
      out.push(Decoration.mark({ class: 'im-link', attributes: { 'data-href': url } }).range(from, to));
    }

    function link(n, active) {
      const node = n.node;
      const text = doc.sliceString(n.from, n.to);
      if (/^\[\^[^\]]+\]$/.test(text)) {
        if (active) {
          mark('im-marker', n.from, n.to);
        } else {
          hide(n.from, n.from + 2);
          mark('im-footnote', n.from + 2, n.to - 1);
          hide(n.to - 1, n.to);
        }
        return false;
      }
      const m = node.getChildren('LinkMark');
      if (m.length < 2) return undefined;
      const close = m[1];
      const url = node.getChild('URL');
      if (url)
        out.push(
          Decoration.mark({ class: 'im-link', attributes: { 'data-href': doc.sliceString(url.from, url.to) } }).range(m[0].to, close.from),
        );
      else mark('im-link', m[0].to, close.from);
      if (active) {
        mark('im-marker', m[0].from, m[0].to);
        mark('im-marker', close.from, n.to);
      } else {
        hide(m[0].from, m[0].to);
        hide(close.from, n.to);
      }
      return false;
    }

    function fenced(n) {
      const node = n.node;
      const info = node.getChild('CodeInfo');
      const code = node.getChild('CodeText');
      const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : '';
      const active = touches(sel, doc.lineAt(n.from).from, doc.lineAt(n.to).to);
      if (lang === 'mermaid' && code && !active) return false;
      codeLines('im-code', n.from, n.to);
      if (active) {
        mark('im-marker', doc.lineAt(n.from).from, doc.lineAt(n.from).to);
        const closing = node.lastChild;
        if (closing.name === 'CodeMark' && closing.from !== node.firstChild.from) mark('im-marker', closing.from, closing.to);
      }
      if (code && lang !== 'mermaid') {
        for (const r of codeRanges(lang, doc.sliceString(code.from, code.to))) mark(r.cls, code.from + r.from, code.from + r.to);
      }
      return false;
    }

    function htmlTag(n) {
      const text = doc.sliceString(n.from, n.to);
      if (/^<br\s*\/?>$/i.test(text)) {
        if (!touches(sel, n.from, n.to)) replace(new BreakWidget(), n.from, n.to);
        return;
      }
      const open = /^<([a-z]+)>$/i.exec(text);
      if (!open || !INLINE_TAGS.has(open[1].toLowerCase())) return;
      const closeText = `</${open[1]}>`.toLowerCase();
      for (let c = n.node.nextSibling; c; c = c.nextSibling) {
        if (c.name === 'HTMLTag' && doc.sliceString(c.from, c.to).toLowerCase() === closeText) {
          mark(`im-tag-${open[1].toLowerCase()}`, n.to, c.from);
          if (touches(sel, n.from, c.to)) {
            mark('im-marker', n.from, n.to);
            mark('im-marker', c.from, c.to);
          } else {
            hide(n.from, n.to);
            hide(c.from, c.to);
          }
          return;
        }
      }
    }

    return Decoration.set(out, true);
  }

  /** 上下方向键进入被整块替换的图表/公式：垂直移动本会跨过它们（US4-3） */
  function moveIntoBlock(forward) {
    return (view) => {
      const range = view.state.selection.main;
      if (!range.empty) return false;
      const dest = view.moveVertically(range, forward).head;
      let target = null;
      view.state.field(blocks).between(Math.min(range.head, dest), Math.max(range.head, dest), (from, to, deco) => {
        if (from === to || !(deco.spec.widget instanceof BlockWidget) || range.head === from || range.head === to) return;
        if (target === null || forward) target ??= forward ? from : to;
        if (!forward) target = to;
      });
      if (target === null) return false;
      view.dispatch({ selection: EditorSelection.cursor(target), scrollIntoView: true });
      return true;
    };
  }

  /** @param {{ imageUrl: (src: string) => Promise<string|null> }} options */
  function extension({ imageUrl }) {
    const inline = ViewPlugin.fromClass(
      class {
        constructor(view) {
          this.decorations = buildInline(view, imageUrl);
        }
        update(u) {
          const refreshed = u.transactions.some((t) => Finder.changed(t) || t.effects.some((e) => e.is(refresh)));
          if (u.view.composing || (dragging && !u.docChanged && !refreshed)) {
            this.decorations = this.decorations.map(u.changes);
            return;
          }
          if (u.docChanged || u.selectionSet || u.viewportChanged || refreshed || syntaxTree(u.state) !== syntaxTree(u.startState)) {
            this.decorations = buildInline(u.view, imageUrl);
          }
        }
      },
      { decorations: (v) => v.decorations },
    );
    return [
      blocks,
      inline,
      Anchor.extension(),
      Prec.high(
        keymap.of([
          { key: 'ArrowDown', run: moveIntoBlock(true) },
          { key: 'ArrowUp', run: moveIntoBlock(false) },
        ]),
      ),
      EditorView.domEventHandlers({
        compositionend(_e, view) {
          setTimeout(() => view.dispatch({ effects: refresh.of(null) }));
          return false;
        },
      }),
    ];
  }

  /** 渲染后的可见文字及其与原文的位置映射（FR-610）；图形与单元格边界放 \0，避免跨界匹配 */
  function visibleText(state) {
    const { doc } = state;
    const tree = ensureSyntaxTree(state, doc.length, 2000) || syntaxTree(state);
    const hidden = [];
    const hide = (from, to, barrier = false) => {
      if (from < to) hidden.push({ from, to, barrier });
    };
    const hideLine = (pos) => {
      const l = doc.lineAt(pos);
      hide(l.from, Math.min(l.to + 1, doc.length));
    };
    const hideWithSpace = (from, to) => hide(from, doc.sliceString(to, to + 1) === ' ' ? to + 1 : to);
    const wholeLines = (from, to) => hide(doc.lineAt(from).from, doc.lineAt(to).to, true);

    tree.iterate({
      enter(n) {
        const { name } = n;
        if (name === 'HeaderMark') {
          hideWithSpace(n.from, n.to);
        } else if (['EmphasisMark', 'StrikethroughMark', 'HighlightMark'].includes(name)) {
          hide(n.from, n.to);
        } else if (name === 'InlineCode') {
          const first = n.node.firstChild;
          const last = n.node.lastChild;
          hide(first.from, first.to);
          if (last !== first) hide(last.from, last.to);
        } else if (name === 'Escape') {
          hide(n.from, n.from + 1);
        } else if (name === 'Link') {
          const text = doc.sliceString(n.from, n.to);
          if (/^\[\^[^\]]+\]$/.test(text)) {
            hide(n.from, n.from + 2);
            hide(n.to - 1, n.to);
            return false;
          }
          const m = n.node.getChildren('LinkMark');
          if (m.length >= 2) {
            hide(m[0].from, m[0].to);
            hide(m[1].from, n.to);
          }
        } else if (name === 'Image' || name === 'InlineMath') {
          hide(n.from, n.to, true);
          return false;
        } else if (name === 'MathBlock' || name === 'HorizontalRule') {
          wholeLines(n.from, n.to);
          return false;
        } else if (name === 'FencedCode') {
          const node = n.node;
          const info = node.getChild('CodeInfo');
          const lang = info ? doc.sliceString(info.from, info.to).trim().toLowerCase() : '';
          if (lang === 'mermaid' && node.getChild('CodeText')) {
            wholeLines(n.from, n.to);
          } else {
            hideLine(n.from);
            const closing = node.lastChild;
            if (closing.name === 'CodeMark' && closing.from !== node.firstChild.from) hideLine(closing.from);
          }
          return false;
        } else if (name === 'QuoteMark') {
          hideWithSpace(n.from, n.to);
        } else if (name === 'ListMark') {
          const isTask = n.node.nextSibling?.name === 'Task';
          if (isTask || /[-*+]/.test(doc.sliceString(n.from, n.to))) hideWithSpace(n.from, n.to);
        } else if (name === 'TaskMarker') {
          hideWithSpace(n.from, n.to);
        } else if (name === 'HTMLTag') {
          const text = doc.sliceString(n.from, n.to);
          if (/^<br\s*\/?>$/i.test(text)) {
            hide(n.from, n.to, true);
          } else {
            const open = /^<([a-z]+)>$/i.exec(text);
            if (open && INLINE_TAGS.has(open[1].toLowerCase())) {
              const close = `</${open[1]}>`.toLowerCase();
              for (let c = n.node.nextSibling; c; c = c.nextSibling) {
                if (c.name === 'HTMLTag' && doc.sliceString(c.from, c.to).toLowerCase() === close) {
                  hide(n.from, n.to);
                  hide(c.from, c.to);
                  break;
                }
              }
            }
          }
        } else if (name === 'Paragraph' && /^\[toc\]$/i.test(doc.sliceString(n.from, n.to))) {
          hide(n.from, n.to, true);
          return false;
        } else if (name === 'Table') {
          // 只有单元格内容可见；竖线、分隔行、补齐空格都不算
          const end = doc.lineAt(n.to).to;
          let pos = doc.lineAt(n.from).from;
          for (const c of tableModel(state, n.node).rows.flat()) {
            if (c.from === undefined) continue;
            hide(pos, c.from, true);
            pos = c.to;
            for (const m of c.text.matchAll(/\\\|/g)) hide(c.from + m.index, c.from + m.index + 1);
          }
          hide(pos, end, true);
        }
        return undefined;
      },
    });

    hidden.sort((a, b) => a.from - b.from || a.to - b.to);
    const segments = [];
    let text = '';
    let pos = 0;
    let barrier = false;
    const flush = (to) => {
      if (to <= pos) return;
      segments.push({ from: pos, to, vis: text.length });
      text += doc.sliceString(pos, to);
    };
    for (const h of hidden) {
      if (h.from > pos) {
        flush(h.from);
        barrier = false;
      }
      if (h.barrier && !barrier) {
        text += '\0';
        barrier = true;
      }
      pos = Math.max(pos, h.to);
    }
    flush(doc.length);

    const segmentAt = (test) => {
      let lo = 0;
      let hi = segments.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (test(segments[mid])) hi = mid;
        else lo = mid + 1;
      }
      return segments[Math.min(lo, segments.length - 1)];
    };
    return {
      text,
      toSource(v) {
        const s = segmentAt((seg) => seg.vis + (seg.to - seg.from) > v);
        return s.from + (v - s.vis);
      },
      toVisible(p) {
        const s = segmentAt((seg) => seg.to > p);
        return s.vis + Math.max(p - s.from, 0);
      },
    };
  }

  /** pos 是否落在被替换显示的块上（含两端，看不到） */
  function isHidden(state, pos) {
    let hidden = false;
    state.field(blocks).between(pos, pos, (from, to) => {
      if (from < to) hidden = true;
    });
    return hidden;
  }

  root.LivePreview = {
    syntax,
    extension,
    refresh,
    visibleText,
    jumpTo,
    isHidden,
    clearJump: () => (jump = null),
    isDragging: () => dragging,
    setDragging(value) {
      dragging = value;
    },
  };
})(this);
