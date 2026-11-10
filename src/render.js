// 公式、图表、代码高亮、图片地址：编辑器与导出共用（FR-604、FR-609）。
// 依赖全局 katex、hljs；mermaid 体积大，首次用到时才加载。Node 中只提供纯函数供测试。
/* global CM, MarkdownHtml, katex, hljs, mermaid */
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

  let inlineMarkdown;

  /** 表格单元格的排版显示：竖线转义先还原（GFM 在行内解析之前处理） */
  function renderInline(text) {
    if (!inlineMarkdown) {
      inlineMarkdown = new CM.MarkdownIt({ html: false, linkify: false }).use(CM.markdownItMark);
      inlineMarkdown.validateLink = MarkdownHtml.validateLink;
      inlineMarkdown.inline.ruler.after('escape', 'math_inline', MarkdownHtml.mathInlineRule);
      inlineMarkdown.renderer.rules.math_inline = (tokens, i) => katex.renderToString(tokens[i].content, { throwOnError: false });
    }
    return inlineMarkdown.renderInline(text.replace(/\\\|/g, '|'));
  }

  let documentRenderer;

  /** 导出：完整文档 → 安全的 HTML（FR-609）；图表按浅色主题渲染，失败时保留源码 */
  async function renderDocument(markdown) {
    documentRenderer ??= MarkdownHtml.create({
      MarkdownIt: CM.MarkdownIt,
      footnote: CM.markdownItFootnote,
      mark: CM.markdownItMark,
      taskLists: CM.markdownItTaskLists,
      renderMath: (source, displayMode) => katex.renderToString(source, { displayMode, throwOnError: false }),
      highlight: highlightHtml,
    });
    const doc = new DOMParser().parseFromString(documentRenderer(markdown), 'text/html'); // 惰性解析，不加载、不执行
    doc.querySelectorAll('script,iframe,object,embed,link,meta,base').forEach((el) => el.remove());
    for (const el of doc.body.querySelectorAll('*')) {
      for (const { name, value } of [...el.attributes]) {
        if (/^on/i.test(name) || /^\s*javascript:/i.test(value)) el.removeAttribute(name);
      }
    }
    for (const el of doc.querySelectorAll('.language-mermaid')) {
      try {
        el.innerHTML = await renderMermaid(el.textContent, 'default');
      } catch {
        // 语法错误：保留源码
      }
    }
    return doc.body.innerHTML;
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
  // FR-705：同一色系，相邻扇区深浅交替
  const MERMAID_PIE = {
    default: '#a5b4fc #e0e7ff #c4b5fd #bfdbfe #d8b4fe #ede9fe #93c5fd #e9d5ff #c7d2fe #f5d0fe #a5c8fd #ddd6fe',
    dark: '#4c4fa8 #2f3167 #624a9c #2f4a80 #6c4292 #3d2f73 #375594 #54357f #414a9a #723a6e #2a5e86 #5a3f8f',
  };
  const MERMAID_COLORS = {
    default: {
      primaryColor: '#eeeefd',
      primaryBorderColor: '#d2d2f4',
      primaryTextColor: '#333333',
      lineColor: '#6366f1',
      clusterBorder: '#d2d2f4',
      edgeLabelBackground: '#ffffff',
    },
    dark: {
      darkMode: true,
      background: '#1e1f22',
      primaryColor: '#2c2e45',
      primaryBorderColor: '#45486b',
      primaryTextColor: '#d4d6da',
      lineColor: '#8b8ef5',
      clusterBorder: '#45486b',
      edgeLabelBackground: '#1e1f22',
    },
  };

  /** 渲染 Mermaid 为 SVG 字符串，语法错误时 reject；同一主题下相同源码只渲染一次 */
  function renderMermaid(source, theme) {
    const key = `${theme}\n${source}`;
    if (svgCache.has(key)) return svgCache.get(key);
    const result = (queue = queue
      .catch(() => {})
      .then(loadMermaid)
      .then(async () => {
        if (initializedTheme !== theme) {
          // FR-701、FR-702：随包版本默认 elk 布局，会忽略 curve，须指定 dagre
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: 'base',
            themeCSS: 'rect.actor { filter: none; }', // FR-704：时序图阴影写在 SVG 属性上，dropShadow 变量管不到
            layout: 'dagre',
            flowchart: { curve: 'basis', nodeSpacing: 60, rankSpacing: 60, padding: 16 },
            themeVariables: {
              ...MERMAID_COLORS[theme],
              ...Object.fromEntries(MERMAID_PIE[theme].split(' ').map((color, i) => [`pie${i + 1}`, color])),
              pieStrokeColor: MERMAID_COLORS[theme].primaryBorderColor,
              pieOuterStrokeColor: MERMAID_COLORS[theme].primaryBorderColor,
              clusterBkg: 'transparent',
              useGradient: false,
              dropShadow: 'none',
              nodeShadow: false,
            },
          });
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

  const api = { renderMath, renderInline, renderDocument, highlightHtml, htmlToRanges, renderMermaid, resolveImage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Render = api;
})(this);
