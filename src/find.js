// 查找替换（FR-013）：在文档原文中匹配（不区分大小写），长文档中不可见的部分同样能找到。
/* global CM */
'use strict';

(function (root) {
  const { Decoration, EditorView, SearchCursor, StateEffect, StateField, isolateHistory } = CM;

  const setMarks = StateEffect.define();
  const ALL = Decoration.mark({ class: 'im-find' });
  const CURRENT = Decoration.mark({ class: 'im-find-current' });

  const extension = StateField.define({
    create: () => Decoration.none,
    update(deco, tr) {
      let next = deco.map(tr.changes);
      for (const e of tr.effects) if (e.is(setMarks)) next = e.value;
      return next;
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  let matches = [];
  let active = -1;

  const result = () => ({ active: active + 1, total: matches.length });
  const marks = () => Decoration.set(matches.map((m, i) => (i === active ? CURRENT : ALL).range(m.from, m.to)));

  function show(view) {
    const spec = { effects: [setMarks.of(marks())] };
    if (active >= 0) {
      const m = matches[active];
      spec.selection = { anchor: m.from, head: m.to };
      spec.effects.push(EditorView.scrollIntoView(m.from, { y: 'center' }));
    }
    view.dispatch(spec);
  }

  function clear(view) {
    matches = [];
    active = -1;
    view.dispatch({ effects: setMarks.of(Decoration.none) });
  }

  /** 查找 text，定位到第一个匹配 */
  function search(view, text) {
    matches = [];
    if (text) {
      const cursor = new SearchCursor(view.state.doc, text, 0, view.state.doc.length, (s) => s.toLowerCase());
      while (!cursor.next().done) matches.push({ from: cursor.value.from, to: cursor.value.to });
    }
    active = matches.length ? 0 : -1;
    show(view);
    return result();
  }

  /** 跳到下一个（forward）或上一个匹配 */
  function step(view, forward) {
    if (matches.length) {
      active = (active + (forward ? 1 : -1) + matches.length) % matches.length;
      show(view);
    }
    return result();
  }

  /** 全部替换为一个事务，一次撤销；返回替换数量 */
  function replaceAll(view, text, replacement) {
    search(view, text);
    const n = matches.length;
    if (n) view.dispatch({ changes: matches.map((m) => ({ ...m, insert: replacement })), annotations: isolateHistory.of('full') });
    clear(view);
    return n;
  }

  root.Finder = { extension, search, step, clear, replaceAll };
})(this);
