// 右键菜单的统一入口（specs/014）：编辑区、输入框、其他区域选中的文字。
// 标签、文件树、收藏、表格、图片有各自的菜单并已 preventDefault，这里跳过（FR-1405）。
/* global ContextMenu, ImageMenu, Render */
'use strict';

(function (root) {
  const sep = '-';

  /** 编辑区菜单（FR-1402、FR-1403）；纯函数，便于测试 */
  function editorItems({ hasSelection, canUndo, canRedo, readOnly, link, math, mermaid }) {
    const top = [];
    if (link) top.push({ label: '打开链接', command: 'open-link' }, { label: '复制链接地址', command: 'copy-link' });
    if (math) top.push({ label: '复制公式', command: 'copy-math' });
    if (mermaid) top.push({ label: '复制图表源码', command: 'copy-mermaid' }, { label: '复制为图片', command: 'copy-mermaid-image' });
    return [
      ...(top.length ? [...top, sep] : []),
      { label: '撤销', shortcut: 'Ctrl+Z', command: 'undo', disabled: readOnly || !canUndo },
      { label: '重做', shortcut: 'Ctrl+Y', command: 'redo', disabled: readOnly || !canRedo },
      sep,
      { label: '剪切', shortcut: 'Ctrl+X', command: 'cut', disabled: readOnly || !hasSelection },
      { label: '复制', shortcut: 'Ctrl+C', command: 'copy', disabled: !hasSelection },
      { label: '粘贴', shortcut: 'Ctrl+V', command: 'paste', disabled: readOnly },
      sep,
      { label: '全选', shortcut: 'Ctrl+A', command: 'select-all' },
    ];
  }

  /** 输入框菜单（FR-1404） */
  function inputItems({ hasSelection, readOnly }) {
    return [
      { label: '撤销', shortcut: 'Ctrl+Z', command: 'undo', disabled: readOnly },
      sep,
      { label: '剪切', shortcut: 'Ctrl+X', command: 'cut', disabled: readOnly || !hasSelection },
      { label: '复制', shortcut: 'Ctrl+C', command: 'copy', disabled: !hasSelection },
      { label: '粘贴', shortcut: 'Ctrl+V', command: 'paste', disabled: readOnly },
      sep,
      { label: '全选', shortcut: 'Ctrl+A', command: 'select-all' },
    ];
  }

  // 图表中的文字默认用 HTML 排版，画到画布会被视为跨源；复制为图片时另行渲染为纯 SVG 文字（plan）
  const PLAIN_LABELS = '%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\n';

  /**
   * @param {{ host: HTMLElement, editor: () => object, readOnly: () => boolean, openLink: (url: string) => void,
   *   pasteImages: (files: File[]) => void, onStatus: (text: string) => void }} o
   */
  function attach({ host, editor, readOnly, openLink, pasteImages, onStatus }) {
    const show = (x, y, items, run) =>
      ContextMenu.show(
        x,
        y,
        items.map((i) => (i === sep ? i : { ...i, action: () => run(i.command) })),
      );
    const guarded = (fn, done) =>
      Promise.resolve()
        .then(fn)
        .then(
          () => done && onStatus(done),
          (e) => onStatus(`操作失败：${e.message || e}`),
        );
    const writeText = (text, done) => guarded(() => navigator.clipboard.writeText(text), done);

    async function pasteIntoEditor() {
      const items = await navigator.clipboard.read();
      const files = [];
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) files.push(new File([await item.getType(type)], `image.${type.slice(6).replace('jpeg', 'jpg')}`, { type }));
      }
      if (files.length) return pasteImages(files);
      editor().pasteText(await navigator.clipboard.readText());
    }

    async function copyMermaidImage(el) {
      const theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default';
      const svg = await Render.renderMermaid(PLAIN_LABELS + el.dataset.source, theme);
      const { width, height } = (el.querySelector('svg') || el).getBoundingClientRect();
      const size = { clientWidth: Math.round(width * 2), clientHeight: Math.round(height * 2) };
      const png = await ImageMenu.toPng(new TextEncoder().encode(svg), 'svg', size, getComputedStyle(host).backgroundColor);
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    }

    function editorMenu(x, y, target) {
      const ed = editor();
      const { from, to } = ed.view.state.selection.main;
      const link = target?.closest('.im-link')?.dataset.href;
      const math = target?.closest('.im-math')?.dataset.source;
      const mermaid = target?.closest('.im-mermaid');
      const ctx = {
        hasSelection: from !== to,
        canUndo: ed.canUndo(),
        canRedo: ed.canRedo(),
        readOnly: readOnly(),
        link,
        math,
        mermaid: mermaid?.dataset.source,
      };
      show(x, y, editorItems(ctx), (cmd) => {
        ed.focus();
        const run = {
          'open-link': () => openLink(link),
          'copy-link': () => writeText(link, '已复制链接地址'),
          'copy-math': () => writeText(math, '已复制公式'),
          'copy-mermaid': () => writeText(mermaid.dataset.source, '已复制图表源码'),
          'copy-mermaid-image': () => guarded(() => copyMermaidImage(mermaid), '已复制图片'),
          undo: () => ed.undo(),
          redo: () => ed.redo(),
          cut: () => document.execCommand('cut'), // 由编辑器自己的剪贴板处理，与 Ctrl+X 相同
          copy: () => document.execCommand('copy'),
          paste: () => guarded(pasteIntoEditor),
          'select-all': () => ed.selectAll(),
        };
        run[cmd]();
      });
    }

    function inputMenu(x, y, input) {
      const ctx = { hasSelection: input.selectionStart !== input.selectionEnd, readOnly: input.readOnly || input.disabled };
      show(x, y, inputItems(ctx), (cmd) => {
        input.focus();
        if (cmd === 'select-all') return input.select();
        if (cmd !== 'paste') return document.execCommand(cmd);
        guarded(async () => {
          input.setRangeText(await navigator.clipboard.readText(), input.selectionStart, input.selectionEnd, 'end');
          input.dispatchEvent(new Event('input', { bubbles: true }));
        });
      });
    }

    // 右键按下时编辑器会把光标移入公式、图表并展开源码，先拦截（用户故事 1 场景 8）
    host.addEventListener(
      'mousedown',
      (e) => {
        if (e.button === 2 && e.target.closest?.('.im-math, .im-block')) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );

    document.addEventListener('contextmenu', (e) => {
      if (e.defaultPrevented) return;
      const input = e.target.closest?.('input:not([type]), input[type=text], textarea');
      const text = getSelection().toString();
      if (host.contains(e.target) && !host.hidden) {
        // Shift+F10、菜单键触发时没有鼠标位置，放在光标处（FR-1406）
        const keyboard = e.button !== 2;
        const at = keyboard && editor().view.coordsAtPos(editor().view.state.selection.main.head);
        editorMenu(at ? at.left : e.clientX, at ? at.bottom : e.clientY, keyboard ? null : e.target);
      } else if (input) inputMenu(e.clientX, e.clientY, input);
      else if (text) show(e.clientX, e.clientY, [{ label: '复制', shortcut: 'Ctrl+C', command: 'copy' }], () => writeText(text));
      else return; // 不显示菜单；发布版的内核菜单已关闭（FR-1401）
      e.preventDefault();
    });
  }

  const api = { attach, editorItems, inputItems };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EditMenu = api;
})(this);
