// 导出用的 Markdown → HTML（FR-609）。依赖由调用方传入，便于在 Node 中测试。
(function (root) {
  const escapeHtml = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /** 与编辑器相同的行内公式规则：$ 后不能是空白或数字，闭合 $ 前不能是空白 */
  function mathInlineRule(state, silent) {
    const { src, pos, posMax } = state;
    if (src[pos] !== '$' || /[\s\d$]/.test(src[pos + 1] || ' ')) return false;
    for (let i = pos + 1; i < posMax; i++) {
      if (src[i] === '\\') i++;
      else if (src[i] === '$') {
        if (/\s/.test(src[i - 1])) return false;
        if (!silent) state.push('math_inline', 'math', 0).content = src.slice(pos + 1, i);
        state.pos = i + 1;
        return true;
      }
    }
    return false;
  }

  function mathBlockRule(state, startLine, endLine, silent) {
    const lineText = (n) => state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
    const first = lineText(startLine);
    if (!first.startsWith('$$')) return false;
    if (silent) return true;
    let content;
    let next = startLine + 1;
    const single = first.slice(2).indexOf('$$');
    if (single !== -1) {
      content = first.slice(2, single + 2);
    } else {
      const body = [first.slice(2)];
      while (next < endLine && lineText(next).trimEnd() !== '$$') body.push(lineText(next++));
      next++;
      content = body.join('\n').trim();
    }
    state.line = next;
    state.push('math_block', 'math', 0).content = content;
    return true;
  }

  function tocRule(state) {
    const { tokens } = state;
    const headings = [];
    tokens.forEach((t, i) => {
      if (t.type !== 'heading_open') return;
      const id = `h-${headings.length + 1}`;
      t.attrSet('id', id);
      headings.push({ id, level: Number(t.tag.slice(1)), text: tokens[i + 1].children.map((c) => c.content).join('') });
    });
    tokens.forEach((t, i) => {
      if (t.type !== 'inline' || !/^\[toc\]$/i.test(t.content) || tokens[i - 1]?.type !== 'paragraph_open') return;
      const items = headings.map(
        (h) => `<li style="margin-left:${(h.level - 1) * 20}px"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`,
      );
      const html = new state.Token('html_block', '', 0);
      html.content = `<ul class="toc">${items.join('')}</ul>`;
      tokens.splice(i - 1, 3, html);
    });
  }

  /** deps: { MarkdownIt, footnote, mark, taskLists, renderMath(source, display), highlight(code, lang) } */
  function create({ MarkdownIt, footnote, mark, taskLists, renderMath, highlight }) {
    const md = new MarkdownIt({
      html: true,
      linkify: true,
      breaks: true, // 与编辑区一致：源码换行即显示换行
      highlight(code, lang) {
        const html = highlight(code, lang);
        return html === null ? '' : `<pre class="hljs"><code>${html}</code></pre>`;
      },
    })
      .use(footnote)
      .use(mark)
      .use(taskLists);
    md.inline.ruler.after('escape', 'math_inline', mathInlineRule);
    md.block.ruler.before('fence', 'math_block', mathBlockRule, { alt: ['paragraph', 'blockquote', 'list'] });
    md.core.ruler.push('toc', tocRule);
    md.renderer.rules.math_inline = (tokens, i) => renderMath(tokens[i].content, false);
    md.renderer.rules.math_block = (tokens, i) => `<div class="math-block">${renderMath(tokens[i].content, true)}</div>`;
    const fence = md.renderer.rules.fence;
    md.renderer.rules.fence = (tokens, i, ...rest) =>
      tokens[i].info.trim().toLowerCase() === 'mermaid'
        ? `<div class="language-mermaid">${escapeHtml(tokens[i].content)}</div>`
        : fence(tokens, i, ...rest);
    return (markdown) => md.render(markdown);
  }

  const api = { create, mathInlineRule };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MarkdownHtml = api;
})(this);
