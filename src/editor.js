// CodeMirror 6 编辑器（FR-601）：编辑状态即 Markdown 原文，换行统一为 LF（BOM、换行符由 doc-format.js 处理）。
/* global CM, LivePreview, Finder */
'use strict';

(function (root) {
  const {
    EditorState,
    EditorView,
    Compartment,
    history,
    defaultKeymap,
    historyKeymap,
    indentWithTab,
    keymap,
    markdown,
    markdownLanguage,
    placeholder,
    Decoration,
    EditorSelection,
    ViewPlugin,
    syntaxTree,
    isolateHistory,
  } = CM;

  // ---------------------------------------------------------------- 排版命令（FR-012）：每个命令一个事务

  function toggleWrap(view, open, close = open) {
    const { state } = view;
    view.dispatch(
      state.changeByRange((r) => {
        const before = state.sliceDoc(Math.max(0, r.from - open.length), r.from);
        const after = state.sliceDoc(r.to, r.to + close.length);
        const nested = open === '*' && state.sliceDoc(Math.max(0, r.from - 2), r.from) === '**' && state.sliceDoc(r.to, r.to + 2) === '**';
        if (before === open && after === close && !nested) {
          return {
            changes: [
              { from: r.from - open.length, to: r.from },
              { from: r.to, to: r.to + close.length },
            ],
            range: EditorSelection.range(r.from - open.length, r.to - open.length),
          };
        }
        return {
          changes: [
            { from: r.from, insert: open },
            { from: r.to, insert: close },
          ],
          range: EditorSelection.range(r.from + open.length, r.to + open.length),
        };
      }),
      { scrollIntoView: true },
    );
  }

  const selectedLines = (state) => {
    const { from, to } = state.selection.main;
    const first = state.doc.lineAt(from).number;
    const last = state.doc.lineAt(to).number;
    return Array.from({ length: last - first + 1 }, (_, i) => state.doc.line(first + i));
  };

  const PREFIX = /^(\s*)(#{1,6}\s+|[-*+]\s+\[[ xX]\]\s+|[-*+]\s+|\d+[.)]\s+)?/;

  /** next(i) 为第 i 行的新前缀；所有选中行已是同类前缀（same）时去掉 */
  function setLinePrefix(view, next, same) {
    const { state } = view;
    const lines = selectedLines(state);
    const parsed = lines.map((l) => PREFIX.exec(l.text));
    const remove = same && parsed.every((m) => same.test(m[2] || ''));
    const changes = lines.map((l, i) => ({
      from: l.from + parsed[i][1].length,
      to: l.from + parsed[i][1].length + (parsed[i][2] || '').length,
      insert: remove ? '' : next(i),
    }));
    view.dispatch({ changes, scrollIntoView: true });
  }

  function toggleQuote(view) {
    const { state } = view;
    const lines = selectedLines(state);
    const all = lines.every((l) => /^\s*>/.test(l.text));
    const changes = lines.map((l) => {
      if (!all) return { from: l.from, insert: '> ' };
      const m = /^\s*>\s?/.exec(l.text);
      return { from: l.from, to: l.from + m[0].length };
    });
    view.dispatch({ changes, scrollIntoView: true });
  }

  /** 在独立的块中插入 before + 选中文字 + after，光标放在选中文字处 */
  function insertBlock(view, before, after) {
    const { state } = view;
    const { from, to } = state.selection.main;
    const head = state.doc.lineAt(from);
    const tail = state.doc.lineAt(to);
    const lead = from > head.from ? '\n\n' : '';
    const trail = to < tail.to ? '\n\n' : '';
    const text = state.sliceDoc(from, to);
    const caret = from + lead.length + before.length;
    view.dispatch({
      changes: { from, to, insert: lead + before + text + after + trail },
      selection: EditorSelection.range(caret, caret + text.length),
      scrollIntoView: true,
    });
  }

  function insertLink(view) {
    const { state } = view;
    view.dispatch(
      state.changeByRange((r) => {
        const text = state.sliceDoc(r.from, r.to);
        return {
          changes: { from: r.from, to: r.to, insert: `[${text}]()` },
          range: EditorSelection.cursor(text ? r.from + text.length + 3 : r.from + 1),
        };
      }),
      { scrollIntoView: true },
    );
  }

  // 每个排版命令、插入都是独立的一步撤销（US1-4），即使间隔很短
  const isolated = (view, run) => {
    view.dispatch({ annotations: isolateHistory.of('full') });
    run();
    view.dispatch({ annotations: isolateHistory.of('full') });
  };

  const formatCommands = (view) => ({
    bold: () => toggleWrap(view, '**'),
    italic: () => toggleWrap(view, '*'),
    strike: () => toggleWrap(view, '~~'),
    underline: () => toggleWrap(view, '<u>', '</u>'),
    'inline-code': () => toggleWrap(view, '`'),
    link: () => insertLink(view),
    heading: (n) => setLinePrefix(view, () => `${'#'.repeat(n)} `, new RegExp(`^#{${n}}\\s`)),
    paragraph: () => setLinePrefix(view, () => ''),
    quote: () => toggleQuote(view),
    list: () => setLinePrefix(view, () => '- ', /^[-*+]\s+(?!\[)/),
    'ordered-list': () => setLinePrefix(view, (i) => `${i + 1}. `, /^\d/),
    check: () => setLinePrefix(view, () => '- [ ] ', /\[[ xX]\]/),
    'code-block': () => insertBlock(view, '```\n', '\n```'),
    'math-block': () => insertBlock(view, '$$\n', '\n$$'),
    table: () => insertBlock(view, '| col1 | col2 | col3 |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |', ''),
    line: () => insertBlock(view, '---', ''),
  });

  // ---------------------------------------------------------------- 专注 / 打字机（FR-008）

  function activeBlockLines(view) {
    const { state } = view;
    const head = state.selection.main.head;
    let node = syntaxTree(state).resolveInner(head, 1);
    while (node.parent && node.parent.name !== 'Document') node = node.parent;
    const from = state.doc.lineAt(node.name === 'Document' ? head : Math.min(node.from, head)).number;
    const to = state.doc.lineAt(node.name === 'Document' ? head : Math.max(node.to, head)).number;
    const deco = [];
    for (let n = from; n <= to; n++) deco.push(Decoration.line({ class: 'im-active' }).range(state.doc.line(n).from));
    return Decoration.set(deco);
  }

  const focusMode = ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.decorations = activeBlockLines(view);
      }
      update(u) {
        if (u.docChanged || u.selectionSet) this.decorations = activeBlockLines(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );

  const typewriterMode = EditorState.transactionExtender.of((tr) =>
    tr.docChanged || tr.selection ? { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: 'center' }) } : null,
  );

  function create(parent, { onChange, onPasteImages, imageUrl }) {
    // 源代码模式移除即时渲染，文本与选区不变（FR-607）
    const previewFor = (isSource) => (isSource ? [] : LivePreview.extension({ imageUrl }));
    const mode = new Compartment();
    const focusConf = new Compartment();
    const typewriterConf = new Compartment();
    let source = false;
    let focusOn = false;
    let typewriterOn = false;
    let saved;

    const newState = (doc) =>
      EditorState.create({
        doc,
        extensions: [
          history({ newGroupDelay: 500 }), // FR-603
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          markdown({ base: markdownLanguage, extensions: LivePreview.syntax }),
          EditorView.lineWrapping,
          placeholder('开始写作…'),
          mode.of(previewFor(source)),
          focusConf.of(focusOn ? focusMode : []),
          typewriterConf.of(typewriterOn ? typewriterMode : []),
          Finder.extension,
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChange();
          }),
          EditorView.domEventHandlers({
            paste(e) {
              if (e.clipboardData.types.includes('text/plain')) return false;
              const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
              if (!images.length) return false;
              e.preventDefault();
              onPasteImages(images);
              return true;
            },
          }),
        ],
      });

    const view = new EditorView({ parent, state: newState('') });
    saved = view.state.doc;

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => view.dispatch({ effects: LivePreview.refresh.of(null) }));

    return {
      dom: view.contentDOM,
      format: Object.fromEntries(
        Object.entries(formatCommands(view)).map(([name, run]) => [name, (arg) => isolated(view, () => run(arg))]),
      ),
      setFocusMode(on) {
        focusOn = on;
        view.dispatch({ effects: focusConf.reconfigure(on ? focusMode : []) });
      },
      setTypewriterMode(on) {
        typewriterOn = on;
        view.dispatch({ effects: typewriterConf.reconfigure(on ? typewriterMode : []) });
      },
      view,
      getValue: () => view.state.doc.toString(),
      getSelectionText: () => view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to),
      /** 载入新文档：新状态同时清空撤销历史（FR-603） */
      load(text) {
        view.setState(newState(text));
        saved = view.state.doc;
        view.scrollDOM.scrollTop = 0;
      },
      isDirty: () => !saved.eq(view.state.doc),
      markSaved() {
        saved = view.state.doc;
      },
      isSource: () => source,
      toggleSource() {
        source = !source;
        view.dispatch({ effects: mode.reconfigure(previewFor(source)) });
      },
      insert(text) {
        isolated(view, () => view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true }));
      },
      /** line 为 0 起始行号 */
      scrollToLine(line) {
        const { from } = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
        LivePreview.jumpTo(view, from);
      },
      focus: () => view.focus(),
    };
  }

  root.Editor = { create };
})(this);
