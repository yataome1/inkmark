// 页内查找（FR-013）：用 CSS Custom Highlight API 高亮编辑区中可见文本的匹配项，不修改 DOM。
// WebView2 在 Tauri 中没有页内查找接口，见 specs/002-tauri-migration/plan.md。
'use strict';

(function (root) {
  const all = new Highlight();
  const current = new Highlight();
  CSS.highlights.set('im-find', all);
  CSS.highlights.set('im-find-current', current);

  let ranges = [];
  let active = -1;

  function clear() {
    all.clear();
    current.clear();
    ranges = [];
    active = -1;
  }

  // IR 模式中隐藏的 Markdown 标记、代码块源码等不参与匹配
  const visible = (node) => node.parentElement && node.parentElement.checkVisibility();

  function result() {
    return { active: active + 1, total: ranges.length };
  }

  function show() {
    current.clear();
    if (active < 0) return;
    const r = ranges[active];
    current.add(r);
    r.startContainer.parentElement.scrollIntoView({ block: 'center' });
  }

  /** 在 container 中查找 text（不区分大小写），定位到第一个匹配 */
  function search(container, text) {
    clear();
    if (!text) return result();
    const q = text.toLowerCase();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (visible(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const s = n.data.toLowerCase();
      for (let i = s.indexOf(q); i !== -1; i = s.indexOf(q, i + q.length)) {
        const r = new Range();
        r.setStart(n, i);
        r.setEnd(n, i + text.length);
        ranges.push(r);
        all.add(r);
      }
    }
    active = ranges.length ? 0 : -1;
    show();
    return result();
  }

  /** 跳到下一个（forward）或上一个匹配 */
  function step(forward) {
    if (!ranges.length) return result();
    active = (active + (forward ? 1 : -1) + ranges.length) % ranges.length;
    show();
    return result();
  }

  root.Finder = { search, step, clear };
})(this);
