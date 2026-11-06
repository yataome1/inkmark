const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('./store');
const fileops = require('./fileops');
const menu = require('./menu');
const { buildHtml } = require('./export');

const MD_FILTERS = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'mdown'] },
  { name: '文本文件', extensions: ['txt'] },
  { name: '所有文件', extensions: ['*'] },
];

let win = null;
let dirty = false;
let forceClose = false;

function fileFromArgv(argv) {
  const candidates = argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-'));
  return candidates.map((a) => path.resolve(a)).find((p) => fileops.isMarkdown(p) && fs.existsSync(p)) || null;
}
let initialFile = fileFromArgv(process.argv);

function refreshMenu() {
  Menu.setApplicationMenu(menu.build(win, store.get()));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    title: 'Inkmark',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.ico'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // 宪章 V：窗口不可被导航；外部链接交给系统浏览器
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('found-in-page', (_e, result) => win.webContents.send('find-result', result));

  win.on('close', (e) => {
    if (dirty && !forceClose) {
      e.preventDefault();
      win.webContents.send('request-close');
    }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  refreshMenu();
}

function registerIpc() {
  const handle = (ch, fn) => ipcMain.handle(ch, (_e, ...args) => fn(...args));
  const openPath = (p) => {
    const doc = fileops.readFile(p);
    store.addRecent(p);
    refreshMenu();
    return doc;
  };
  const writeDoc = (p, content) => {
    fileops.writeFileAtomic(p, content);
    store.addRecent(p);
    refreshMenu();
    return p;
  };
  const saveAs = async (content, suggestedName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath: suggestedName || '未命名.md',
      filters: MD_FILTERS,
    });
    return canceled ? null : writeDoc(filePath, content);
  };
  const askPath = async (defaultPath, ext, label) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      defaultPath,
      filters: [{ name: label, extensions: [ext] }],
    });
    return canceled ? null : filePath;
  };

  handle('app-ready', () => {
    const f = initialFile;
    initialFile = null;
    return f;
  });
  handle('open-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: MD_FILTERS });
    return canceled ? null : openPath(filePaths[0]);
  });
  handle('open-folder-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (canceled) return null;
    store.set({ folder: filePaths[0] });
    return filePaths[0];
  });
  handle('read-file', openPath);
  handle('save-file', (p, content) => (p ? writeDoc(p, content) : saveAs(content)));
  handle('save-as', saveAs);
  handle('list-dir', fileops.listDir);
  handle('save-image', fileops.saveImage);
  handle('confirm-discard', async (name) => {
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['保存', '不保存', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: 'Inkmark',
      message: `是否保存对“${name}”的修改？`,
      detail: '如果不保存，你的修改将会丢失。',
    });
    return ['save', 'discard', 'cancel'][response];
  });
  handle('set-title', (title) => win.setTitle(title));
  handle('set-dirty', (v) => {
    dirty = v;
    win.setDocumentEdited(v);
  });
  handle('get-settings', () => store.get());
  handle('set-settings', (patch) => {
    const s = store.set(patch);
    if ('theme' in patch) nativeTheme.themeSource = s.theme;
    if ('theme' in patch || 'recent' in patch) refreshMenu();
    return s;
  });
  handle('find', (text, opts) => text && win.webContents.findInPage(text, opts));
  handle('stop-find', () => win.webContents.stopFindInPage('keepSelection'));
  handle('export-html', async (doc, defaultPath) => {
    const out = await askPath(defaultPath, 'html', 'HTML');
    if (out) fs.writeFileSync(out, buildHtml(doc), 'utf8');
    return out;
  });
  handle('export-pdf', async (doc, defaultPath) => {
    const out = await askPath(defaultPath, 'pdf', 'PDF');
    if (!out) return null;
    const tmp = path.join(os.tmpdir(), `inkmark-export-${Date.now()}.html`);
    fs.writeFileSync(tmp, buildHtml(doc), 'utf8');
    const pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    try {
      await pdfWin.loadFile(tmp);
      const data = await pdfWin.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
      });
      fs.writeFileSync(out, data);
    } finally {
      pdfWin.destroy();
      fs.rmSync(tmp, { force: true });
    }
    return out;
  });
  handle('open-external', (url) => /^https?:/i.test(url) && shell.openExternal(url));
  handle('toggle-fullscreen', () => win.setFullScreen(!win.isFullScreen()));
  handle('close-confirmed', () => {
    forceClose = true;
    win.close();
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
    const f = fileFromArgv(argv);
    if (f) win.webContents.send('open-file', f);
  });
  app.whenReady().then(() => {
    nativeTheme.themeSource = store.get().theme;
    registerIpc();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
