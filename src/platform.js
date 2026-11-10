// window.inkmark：前端与 Tauri 后端之间的唯一接口（plan.md「IPC 契约」）。
// app.js 只通过这里访问系统能力。
'use strict';

(function () {
  const T = window.__TAURI__;
  const invoke = T.core.invoke;
  const win = T.window.getCurrentWindow();
  const webview = T.webview.getCurrentWebview();
  const MD_FILTERS = [
    { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
    { name: '文本文件', extensions: ['txt'] },
    { name: '所有文件', extensions: ['*'] },
  ];

  /** 三个按钮的对话框，返回 'yes' | 'no' | 'cancel' */
  async function askThree(message, title, yes, no, cancel) {
    const r = await T.dialog.message(message, { title, kind: 'warning', buttons: { yes, no, cancel } });
    if (r === yes || r === 'Yes') return 'yes';
    if (r === no || r === 'No') return 'no';
    return 'cancel';
  }

  async function askExportPath(defaultPath, ext, label) {
    return T.dialog.save({ defaultPath, filters: [{ name: label, extensions: [ext] }] });
  }

  window.inkmark = {
    appReady: () => invoke('app_ready'),
    readFile: (path) => invoke('read_file', { path }),
    async openDialog() {
      const path = await T.dialog.open({ multiple: false, directory: false, filters: MD_FILTERS });
      return path ? invoke('read_file', { path }) : null;
    },
    async openFolderDialog() {
      const folder = await T.dialog.open({ directory: true });
      if (folder) await invoke('set_settings', { patch: { folder } });
      return folder;
    },
    saveFile: (path, content) => invoke('save_file', { path, content }),
    askSavePath: (defaultPath) => T.dialog.save({ defaultPath, filters: MD_FILTERS }),
    listDir: (dir) => invoke('list_dir', { dir }),
    pathInfo: (paths) => invoke('path_info', { paths }),
    setFavoriteMenu: (favorited, enabled) => invoke('set_favorite_menu', { favorited, enabled }),
    saveImage: (name, bytes) => invoke('save_image', { name, bytes: Array.from(bytes) }),
    saveImageFromPath: (srcPath) => invoke('save_image_from_path', { srcPath }),
    resolveImage: (path) => invoke('resolve_image', { path }),
    readImage: (path) => invoke('read_image', { path }),
    copyImageFile: (path) => invoke('copy_image_file', { path }),
    saveImageAs: (src, dest) => invoke('save_image_as', { src, dest }),
    openImage: (path) => invoke('open_image', { path }),
    askSaveImagePath: (defaultPath, ext) => T.dialog.save({ defaultPath, filters: [{ name: '图片', extensions: [ext] }] }),
    imageFolder: () => invoke('image_folder'),
    setImageFolder: (path, copy) => invoke('set_image_folder', { path, copy }),
    openImageFolder: () => invoke('open_image_folder'),
    copyShareImages: (target, paths) => invoke('copy_share_images', { target, paths }),
    importImages: (paths) => invoke('import_images', { paths }),
    writeExport: (path, content) => invoke('export_html', { path, html: content }),
    pickFolder: () => T.dialog.open({ directory: true }),
    /** @returns {Promise<'copy'|'skip'|'cancel'>} */
    async confirmCopyImages(count) {
      const r = await askThree(
        `原文件夹中的 ${count} 张图片会保留不删。复制后，旧文档中的图片在新位置也能找到。`,
        '是否把已有图片复制到新位置？',
        '复制',
        '不复制',
        '取消',
      );
      return { yes: 'copy', no: 'skip', cancel: 'cancel' }[r];
    },
    async confirmOverwrite(name) {
      const r = await T.dialog.message(`“${name}”已存在，导出会覆盖其中的同名图片。`, {
        title: '是否覆盖？',
        kind: 'warning',
        buttons: { ok: '覆盖', cancel: '取消' },
      });
      return r === '覆盖' || r === 'Ok';
    },
    allowImage: (path) => invoke('allow_image', { path }),
    toAssetUrl: (path) => T.core.convertFileSrc(path),
    /** @returns {Promise<'save'|'discard'|'cancel'>} */
    async confirmDiscard(name) {
      const r = await askThree('如果不保存，你的修改将会丢失。', `是否保存对“${name}”的修改？`, '保存', '不保存', '取消');
      return { yes: 'save', no: 'discard', cancel: 'cancel' }[r];
    },
    /** @returns {Promise<'save'|'discard'|'cancel'>} */
    async confirmDiscardAll(names) {
      const shown = names.slice(0, 10).join('\n');
      const more = names.length > 10 ? `\n等 ${names.length} 个文件` : '';
      const r = await askThree(
        `${shown}${more}\n\n如果不保存，这些修改将会丢失。`,
        `是否保存对 ${names.length} 个文件的修改？`,
        '全部保存',
        '全部不保存',
        '取消',
      );
      return { yes: 'save', no: 'discard', cancel: 'cancel' }[r];
    },
    /** @returns {Promise<'retry'|'switch'|'cancel'>} */
    async confirmSaveConflict(name) {
      const r = await askThree('同一个文件只能在一个标签中打开。', `“${name}”已在其他标签中打开`, '选择其他位置', '切换到该标签', '取消');
      return { yes: 'retry', no: 'switch', cancel: 'cancel' }[r];
    },
    setTabMenu: (tabMenu) => invoke('set_tab_menu', { tabMenu }),
    sampleDoc: () => invoke('sample_doc'),
    revealPath: (path) => invoke('reveal_path', { path }),
    appInfo: () => invoke('app_info'),
    openLink: (kind) => invoke('open_link', { kind }),
    setTitle: (title) => win.setTitle(title),
    getSettings: () => invoke('get_settings'),
    async setSettings(patch) {
      const settings = await invoke('set_settings', { patch });
      if ('theme' in patch) await win.setTheme(patch.theme === 'system' ? null : patch.theme);
      return settings;
    },
    async exportHtml(html, defaultPath) {
      const path = await askExportPath(defaultPath, 'html', 'HTML');
      if (path) await invoke('export_html', { path, html });
      return path;
    },
    async exportPdf(html, defaultPath) {
      const out = await askExportPath(defaultPath, 'pdf', 'PDF');
      if (out) await invoke('export_pdf', { html, out });
      return out;
    },
    openExternal: (url) => T.opener.openUrl(url),
    toggleFullscreen: async () => win.setFullscreen(!(await win.isFullscreen())),
    setZoom: (scale) => webview.setZoom(scale),
    close: () => win.close(),
    onCommand: (cb) => T.event.listen('command', (e) => cb(e.payload)),
    onOpenFile: (cb) => T.event.listen('open-file', (e) => cb(e.payload)),
    /** cb(event)：调用 event.preventDefault() 取消关闭 */
    onCloseRequested: (cb) => win.onCloseRequested(cb),
    /** cb({ type, paths })：Tauri 接管了文件拖放，网页的 drop 事件拿不到文件路径 */
    onDragDrop: (cb) => webview.onDragDropEvent((e) => cb(e.payload)),
  };
})();
