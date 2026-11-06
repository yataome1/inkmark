// 纯函数：字数统计与大纲解析。浏览器中挂到 window.TextUtils，Node 中供测试 require。
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

  /**
   * FR-401：Lute 渲染表格时把单元格行内代码中的 `\|` 还原为 `|`，转回 Markdown 时却不重新转义，
   * 导致拆列。在交给 Lute 的 IR HTML 中，把表格内行内代码（不含带 data-type 的公式）的 `|` 写回 `\|`。
   */
  function escapeTableCodePipes(html) {
    if (!html.includes('<table')) return html;
    return html.replace(/<table[\s\S]*?<\/table>/g, (table) =>
      table.replace(
        /(<code(?![^>]*\sdata-type=)[^>]*>)([^<]*)(<\/code>)/g,
        (m, open, text, close) => open + text.replace(/\|/g, '\\|') + close,
      ),
    );
  }

  const api = { countWords, parseHeadings, escapeTableCodePipes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TextUtils = api;
})(this);
