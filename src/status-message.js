// 状态栏的一次性提示（specs/016）。浏览器中挂到 window.StatusMessage，Node 中供测试 require。
(function (root) {
  const DURATION = 4000;

  /** 在 el 中显示一次性提示：约 4 秒后清空，新提示替换旧提示并重新计时（FR-1601、FR-1602） */
  function create(el, duration = DURATION) {
    let timer = null;
    function show(text) {
      clearTimeout(timer);
      timer = null;
      el.textContent = el.title = text || '';
      if (text) timer = setTimeout(() => show(''), duration);
    }
    return { show };
  }

  const api = { DURATION, create };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatusMessage = api;
})(this);
