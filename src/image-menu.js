// 编辑区图片的右键菜单（specs/012）：替换浏览器内核的默认菜单，其他位置不处理（FR-1204）。
/* global ContextMenu, Render */
'use strict';

(function (root) {
  const MIME = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    svg: 'image/svg+xml',
  };
  const extOf = (path) => path.split('.').pop().toLowerCase();
  const basename = (p) => p.split(/[\\/]/).pop();

  /** 画到画布再转 PNG：剪贴板只接受 image/png；动态 GIF 取第一帧，SVG 按显示尺寸（FR-1202）。
   *  background 为可选底色（specs/014 图表复制为图片） */
  async function toPng(bytes, ext, shown, background) {
    const blob = new Blob([bytes], { type: MIME[ext] });
    let source;
    let width;
    let height;
    if (ext === 'svg') {
      const url = URL.createObjectURL(blob);
      try {
        source = new Image();
        source.src = url;
        await source.decode();
      } finally {
        URL.revokeObjectURL(url);
      }
      width = Math.round(shown.clientWidth) || source.naturalWidth;
      height = Math.round(shown.clientHeight) || source.naturalHeight;
    } else {
      source = await createImageBitmap(blob);
      ({ width, height } = source);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.drawImage(source, 0, 0, width, height);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('无法生成图片'))), 'image/png'));
  }

  /** @param {{ host: HTMLElement, api: object, docDir: () => string|null, onStatus: (text: string) => void }} o */
  function attach({ host, api, docDir, onStatus }) {
    const imageOf = (e) => e.target.closest?.('img.im-image');

    const action = (fn, done) => async () => {
      try {
        if ((await fn()) !== false) onStatus(done);
      } catch (e) {
        onStatus(`操作失败：${e}`);
      }
    };

    async function show(x, y, img) {
      const src = img.dataset.source;
      const r = Render.resolveImage(src, docDir());
      // 网络图片与找不到的图片只能复制地址（FR-1202）；不为网络图片发请求
      const file = r?.path ? await api.resolveImage(r.path) : null;
      const ext = file ? extOf(file) : '';
      ContextMenu.show(x, y, [
        {
          label: '复制图片',
          disabled: !file,
          action: action(async () => {
            const png = await toPng(await api.readImage(file), ext, img);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
          }, '已复制图片'),
        },
        { label: '复制图片文件', disabled: !file, action: action(() => api.copyImageFile(file), '已复制图片文件') },
        {
          label: '图片另存为…',
          disabled: !file,
          action: action(async () => {
            const dest = await api.askSaveImagePath(basename(file), ext);
            if (!dest) return false;
            await api.saveImageAs(file, dest);
          }, '图片已另存'),
        },
        '-',
        { label: '复制图片地址', action: action(() => navigator.clipboard.writeText(src), '已复制图片地址') },
        '-',
        { label: '在资源管理器中显示', disabled: !file, action: action(() => api.revealPath(file), '') },
        { label: '用默认程序打开', disabled: !file, action: action(() => api.openImage(file), '') },
      ]);
    }

    // 右键按下时编辑器会把光标移入图片并展开源码，先拦截（规格边界情况）
    host.addEventListener(
      'mousedown',
      (e) => {
        if (e.button === 2 && imageOf(e)) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true,
    );
    host.addEventListener(
      'contextmenu',
      (e) => {
        const img = imageOf(e);
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        show(e.clientX, e.clientY, img);
      },
      true,
    );
  }

  root.ImageMenu = { attach, toPng };
})(this);
