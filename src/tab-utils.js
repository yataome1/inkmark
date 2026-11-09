// 纯函数：标签的路径比较与显示名称（specs/008）。浏览器中挂到 window.TabUtils，Node 中供测试 require。
(function (root) {
  /** 统一为反斜杠并解析 . 和 ..，保留原大小写 */
  function normalizePath(p) {
    const unc = /^[\\/]{2}/.test(p);
    const out = [];
    for (const seg of p.replace(/\//g, '\\').split('\\')) {
      if (seg === '..') {
        if (out.length > 1) out.pop();
      } else if (seg && seg !== '.') {
        out.push(seg);
      }
    }
    return (unc ? '\\\\' : '') + out.join('\\');
  }

  /** 同一文件的比较键（Windows 路径不区分大小写） */
  const pathKey = (p) => normalizePath(p).toLowerCase();

  const segments = (p) => normalizePath(p).split('\\');

  /** 同名文件取能区分彼此的最少上级目录，返回与 paths 等长的目录提示；路径为 null 或不重名时为空串 */
  function hints(paths) {
    const groups = new Map();
    paths.forEach((p, i) => {
      if (!p) return;
      const name = segments(p).pop().toLowerCase();
      groups.set(name, [...(groups.get(name) || []), i]);
    });
    const out = paths.map(() => '');
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const dirs = group.map((i) => segments(paths[i]).slice(0, -1));
      const longest = Math.max(...dirs.map((d) => d.length));
      for (let depth = 1; depth <= longest; depth++) {
        const suffix = dirs.map((d) => d.slice(-depth).join('\\'));
        if (new Set(suffix.map((s) => s.toLowerCase())).size === group.length || depth === longest) {
          group.forEach((i, k) => (out[i] = suffix[k]));
          break;
        }
      }
    }
    return out;
  }

  /** 未被占用的最小未命名编号 */
  function nextUntitled(used) {
    let n = 1;
    while (used.includes(n)) n++;
    return n;
  }

  const api = { normalizePath, pathKey, hints, nextUntitled };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TabUtils = api;
})(this);
