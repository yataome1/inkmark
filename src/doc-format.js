// 纯函数：文档的 BOM 与换行符（FR-602）。浏览器中挂到 window.DocFormat，Node 中供测试 require。
(function (root) {
  /** 拆出编辑器使用的 LF 正文，并记下保存时要还原的 BOM 与换行符（混合换行符取占多数的一种） */
  function split(text) {
    const bom = text.startsWith('﻿');
    const raw = bom ? text.slice(1) : text;
    const crlf = (raw.match(/\r\n/g) || []).length;
    const lf = (raw.match(/\n/g) || []).length - crlf;
    return { body: raw.replace(/\r\n?/g, '\n'), bom, eol: crlf > lf ? '\r\n' : '\n' };
  }

  function join(body, { bom, eol }) {
    return (bom ? '﻿' : '') + (eol === '\n' ? body : body.replace(/\n/g, eol));
  }

  const api = { split, join };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DocFormat = api;
})(this);
