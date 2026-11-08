// 公式、图表、代码高亮、图片地址：编辑器与导出共用（FR-604、FR-609）。
// 依赖全局 katex、hljs；mermaid 体积大，首次用到时才加载。Node 中只提供纯函数供测试。
/* global katex, hljs, mermaid */
(function (root) {
  function renderMath(el, source, displayMode) {
    katex.render(source, el, { displayMode, throwOnError: false });
  }

  function highlightHtml(code, lang) {
    if (!lang || !hljs.getLanguage(lang)) return null;
    return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
  }

  const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#x27;': "'" };

  /** 把 highlight.js 的 HTML 结果转为相对源码的区间 [{ from, to, cls }]，内层区间排在外层之后 */
  function htmlToRanges(html) {
    const out = [];
    const stack = [];
    let pos = 0;
    for (const [tok, cls, entity] of html.matchAll(/<span class="([^"]*)">|<\/span>|(&[#\w]+;)|[^<&]+/g)) {
      if (tok === '</span>') {
        const open = stack.pop();
        if (open.from < pos) out.push({ from: open.from, to: pos, cls: open.cls });
      } else if (cls !== undefined) {
        stack.push({ from: pos, cls });
      } else {
        pos += entity ? ENTITIES[entity].length : tok.length;
      }
    }
    return out.sort((a, b) => a.from - b.from || b.to - a.to);
  }

  let mermaidReady;
  function loadMermaid() {
    mermaidReady ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/mermaid.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.append(s);
    });
    return mermaidReady;
  }

  const svgCache = new Map();
  let queue = Promise.resolve(); // mermaid.render 不可并发
  let renderId = 0;
  let initializedTheme;

  /** 渲染 Mermaid 为 SVG 字符串，语法错误时 reject；同一主题下相同源码只渲染一次 */
  function renderMermaid(source, theme) {
    const key = `${theme}\n${source}`;
    if (svgCache.has(key)) return svgCache.get(key);
    const result = (queue = queue
      .catch(() => {})
      .then(loadMermaid)
      .then(async () => {
        if (initializedTheme !== theme) {
          mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
          initializedTheme = theme;
        }
        return (await mermaid.render(`im-mermaid-${renderId++}`, source)).svg;
      }));
    svgCache.set(key, result);
    result.catch(() => svgCache.delete(key)); // 错误结果不缓存，修正后可重新渲染
    return result;
  }

  /** 相对路径按文档目录解析为绝对路径；网络、data、blob 地址原样返回（返回 url），无法解析时返回 null */
  function resolveImage(src, docDir) {
    if (/^(https?:|data:|blob:)/i.test(src)) return { url: src };
    if (/^file:/i.test(src)) return { path: decodeURIComponent(new URL(src).pathname).replace(/^\/([A-Za-z]:)/, '$1') };
    if (/^[A-Za-z]:[\\/]/.test(src)) return { path: src };
    if (!docDir) return null;
    const out = docDir.replace(/\\/g, '/').split('/');
    let rel = src;
    try {
      rel = decodeURIComponent(src);
    } catch {
      // 文件名中的 % 不是转义序列：按原样使用
    }
    for (const seg of rel.replace(/\\/g, '/').split('/')) {
      if (seg === '..') out.pop();
      else if (seg && seg !== '.') out.push(seg);
    }
    return { path: out.join('\\') };
  }

  const api = { renderMath, highlightHtml, htmlToRanges, renderMermaid, resolveImage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Render = api;
})(this);
