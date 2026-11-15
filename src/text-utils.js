// 纯函数：字数统计、大纲解析、缩放与路径。浏览器中挂到 window.TextUtils，Node 中供测试 require。
(function (root) {
  const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
  const CJK = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/g;
  const WORD = /[A-Za-z0-9À-ɏ]+(?:['’-][A-Za-z0-9À-ɏ]+)*/g;

  function stripInline(s) {
    return s
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/[*_~`]/g, '')
      .trim();
  }

  /** 字数：中日韩按字计，其他按词计；字符：去掉 Markdown 标记后的非空白字符 */
  function countWords(markdown) {
    const text = markdown
      .split('\n')
      .filter((l) => !FENCE.test(l))
      .map((l) => stripInline(l.replace(/^\s*(#{1,6}\s|>\s?|[-*+]\s(\[[ xX]\]\s)?|\d+[.)]\s|\|)/, '')))
      .join('\n')
      .replace(/\|/g, ' ');
    const cjk = (text.match(CJK) || []).length;
    const words = (text.replace(CJK, ' ').match(WORD) || []).length;
    return { words: cjk + words, chars: text.replace(/\s/g, '').length };
  }

  /** 解析 ATX 与 Setext 标题，跳过代码围栏；line 为 0 起始行号 */
  function parseHeadings(markdown) {
    const lines = markdown.split('\n');
    const out = [];
    let fence = null;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const f = line.match(FENCE);
      if (f) {
        if (!fence) fence = f[1][0];
        else if (f[1][0] === fence) fence = null;
        continue;
      }
      if (fence) continue;
      const atx = line.match(/^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/);
      if (atx) {
        out.push({ level: atx[1].length, text: stripInline(atx[2]), line: i });
        continue;
      }
      const next = lines[i + 1];
      if (next !== undefined && line.trim() && !/^\s{0,3}([-*+>|]|\d+[.)])/.test(line)) {
        if (/^\s{0,3}=+\s*$/.test(next)) out.push({ level: 1, text: stripInline(line), line: i++ });
        else if (/^\s{0,3}-+\s*$/.test(next)) out.push({ level: 2, text: stripInline(line), line: i++ });
      }
    }
    return out;
  }

  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 3;

  /** 缩放比例：保留一位小数并限制在 50%–300%；无效值为 1（FR-1108） */
  function normalizeZoom(value) {
    const z = Number(value);
    if (!Number.isFinite(z) || z <= 0) return 1;
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 10) / 10));
  }

  /** 放大（direction = 1）或缩小（-1）一档 10%（FR-1107） */
  const stepZoom = (zoom, direction) => normalizeZoom(zoom + direction * 0.1);

  /** 按位置替换文本，edits 互不重叠：[{ from, to, insert }] */
  function applyEdits(text, edits) {
    let out = text;
    for (const e of [...edits].sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.insert + out.slice(e.to);
    return out;
  }

  // ---------------------------------------------------------------- 路径（specs/015 plan 设计要点 4）
  // os 为 'windows'（`\`，兼容 `/`）或 'macos'（只有 `/`）；浏览器中由 PlatformKeys.currentOs() 取得。

  const SEP = { windows: /[\\/]/, macos: /\// };
  const sepOf = (os) => (os === 'macos' ? '/' : '\\');

  const basename = (p, os) => p.split(SEP[os] || SEP.windows).pop();

  function dirname(p, os) {
    const parts = p.split(SEP[os] || SEP.windows);
    parts.pop();
    const dir = parts.join(sepOf(os));
    return os === 'macos' && dir === '' && p.startsWith('/') ? '/' : dir;
  }

  /** Windows：盘符或 UNC；macOS：`/` 开头 */
  const isAbsolutePath = (p, os) => (os === 'macos' ? p.startsWith('/') : /^([A-Za-z]:[\\/]|[\\/]{2})/.test(p));

  const joinPath = (dir, name, os) => (dir.endsWith(sepOf(os)) ? dir + name : dir + sepOf(os) + name);

  /** 相对路径按 base 目录解析（文档中的链接一律用 `/` 或 `\`），绝对路径原样返回 */
  function resolvePath(base, rel, os) {
    if (isAbsolutePath(rel, os)) return rel;
    const split = (x) => (os === 'macos' ? x.split('/') : x.replace(/\\/g, '/').split('/'));
    const out = split(base);
    for (const seg of split(rel.replace(/\\/g, '/'))) {
      if (seg === '..') {
        if (out.length > 1) out.pop();
      } else if (seg && seg !== '.') out.push(seg);
    }
    return out.join(sepOf(os));
  }

  /** 本地路径 → file 地址：`file:///C:/a%20b`、`file:///Users/a%20b` */
  function fileUrl(p, os) {
    const s = os === 'macos' ? p : p.replace(/\\/g, '/');
    const abs = s.startsWith('/') ? s : '/' + s;
    return (
      'file://' +
      abs
        .split('/')
        .map((seg, i) => (i === 1 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg)))
        .join('/')
    );
  }

  const api = {
    countWords,
    parseHeadings,
    normalizeZoom,
    stepZoom,
    applyEdits,
    basename,
    dirname,
    isAbsolutePath,
    joinPath,
    resolvePath,
    fileUrl,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextUtils = api;
})(this);
