// CodeMirror 6 编辑器（FR-601）：编辑状态即 Markdown 原文，换行统一为 LF（BOM、换行符由 doc-format.js 处理）。
/* global CM, LivePreview */
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
  } = CM;

  function create(parent, { onChange, onPasteImages, imageUrl }) {
    // 源代码模式移除即时渲染，文本与选区不变（FR-607）
    const previewFor = (isSource) => (isSource ? [] : LivePreview.extension({ imageUrl }));
    const mode = new Compartment();
    let source = false;
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
        view.dispatch(view.state.replaceSelection(text), { scrollIntoView: true });
      },
      replaceAll(text) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
      },
      /** line 为 0 起始行号 */
      scrollToLine(line) {
        const { from } = view.state.doc.line(Math.min(line + 1, view.state.doc.lines));
        view.dispatch({ effects: EditorView.scrollIntoView(from, { y: 'start' }) });
      },
      focus: () => view.focus(),
    };
  }

  root.Editor = { create };
})(this);
