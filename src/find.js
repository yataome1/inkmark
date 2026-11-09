// 查找替换（FR-013、FR-610）：不区分大小写，长文档中不在屏幕上的部分同样能找到。
// 源代码模式在原文中查找；即时渲染模式在渲染后的可见文字中查找，不改变显示。
/* global CM, LivePreview */
'use strict';

(function (root) {
  const { Decoration, EditorView, SearchCursor, StateEffect, StateField, isolateHistory } = CM;

  const setMarks = StateEffect.define();
  const ALL = Decoration.mark({ class: 'im-find' });
  const CURRENT = Decoration.mark({ class: 'im-find-current' });
  const EMPTY = { deco: Decoration.none, ranges: [], toVisible: null };

  // ranges 按位置排序；文档变化后位置失效，由调用方 refresh 重新计算
  const extension = StateField.define({
    create: () => EMPTY,
    update(value, tr) {
      for (const e of tr.effects) if (e.is(setMarks)) return e.value;
      return tr.docChanged ? { deco: value.deco.map(tr.changes), ranges: [], toVisible: null } : value;
    },
    provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
  });

  const ranges = (state) => state.field(extension).ranges;
  const toVisible = (state, pos) => state.field(extension).toVisible?.(pos) ?? 0;
  const changed = (tr) => tr.effects.some((e) => e.is(setMarks));

  let matches = [];
  let active = -1;
  let visibleMap = null;

  const result = () => ({ active: active + 1, total: matches.length });
  const marks = () => ({
    deco: Decoration.set(matches.map((m, i) => (i === active ? CURRENT : ALL).range(m.from, m.to))),
    ranges: matches.map((m, i) => ({ ...m, current: i === active })),
    toVisible: visibleMap && visibleMap.toVisible,
  });

  // 大小写折叠后长度会变的字符（如 İ）保持原样，保证下标与原文一致
  const fold = (s) => s.replace(/[^]/g, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c));

  function findIn(state, text, rendered) {
    const out = [];
    visibleMap = null;
    if (!text) return out;
    if (!rendered) {
      const cursor = new SearchCursor(state.doc, text, 0, state.doc.length, (s) => s.toLowerCase());
      while (!cursor.next().done) out.push({ from: cursor.value.from, to: cursor.value.to, crossesFormat: false });
      return out;
    }
    visibleMap = LivePreview.visibleText(state);
    const haystack = fold(visibleMap.text);
    const needle = fold(text);
    for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + needle.length)) {
      const from = visibleMap.toSource(i);
      const to = visibleMap.toSource(i + needle.length - 1) + 1;
      out.push({ from, to, vFrom: i, vTo: i + needle.length, crossesFormat: to - from !== needle.length });
    }
    return out;
  }

  /** 渲染模式下不移动光标，否则光标进入元素会显示标记、改变版面 */
  function show(view, rendered) {
    const spec = { effects: [setMarks.of(marks())] };
    if (active >= 0) {
      const m = matches[active];
      if (!rendered) spec.selection = { anchor: m.from, head: m.to };
      spec.effects.push(EditorView.scrollIntoView(m.from, { y: 'center' }));
    }
    view.dispatch(spec);
  }

  function clear(view) {
    matches = [];
    active = -1;
    visibleMap = null;
    view.dispatch({ effects: setMarks.of(EMPTY) });
  }

  /** 查找 text，定位到第一个匹配 */
  function search(view, text, rendered) {
    matches = findIn(view.state, text, rendered);
    active = matches.length ? 0 : -1;
    show(view, rendered);
    return result();
  }

  /** 文档或模式变化后重新计算，不滚动、不移动光标，当前项保持在原位置附近 */
  function refresh(view, text, rendered) {
    const at = active >= 0 ? matches[active].from : 0;
    matches = findIn(view.state, text, rendered);
    const next = matches.findIndex((m) => m.from >= at);
    active = matches.length ? Math.max(next, 0) : -1;
    view.dispatch({ effects: setMarks.of(marks()) });
    return result();
  }

  /** 跳到下一个（forward）或上一个匹配 */
  function step(view, forward, rendered) {
    if (matches.length) {
      active = (active + (forward ? 1 : -1) + matches.length) % matches.length;
      show(view, rendered);
    }
    return result();
  }

  /** 全部替换为一个事务，一次撤销；跨格式边界的匹配跳过，不破坏格式。返回 { replaced, skipped } */
  function replaceAll(view, text, replacement, rendered) {
    const found = findIn(view.state, text, rendered);
    const targets = found.filter((m) => !m.crossesFormat);
    if (targets.length) {
      view.dispatch({
        changes: targets.map((m) => ({ from: m.from, to: m.to, insert: replacement })),
        annotations: isolateHistory.of('full'),
      });
    }
    clear(view);
    return { replaced: targets.length, skipped: found.length - targets.length };
  }

  root.Finder = { extension, ranges, toVisible, changed, search, refresh, step, clear, replaceAll };
})(this);
