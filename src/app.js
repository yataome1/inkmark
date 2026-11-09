/* global Editor, Render, TextUtils, DocFormat, Finder, ExportHtml, TableUi, Resizer, Favorites, ContextMenu, TabUtils, Tabs, StartPage */
'use strict';

const api = window.inkmark;
const $ = (sel) => document.querySelector(sel);
const editorEl = $('#editor');

// 当前文档的 path（未命名为 null）、format（打开时的 BOM 与换行符，保存时还原，FR-602）、dirty 属于当前标签
const state = {
  get path() {
    return tabs.current.path;
  },
  get format() {
    return tabs.current.format;
  },
  get dirty() {
    return tabs.current.dirty;
  },
  settings: null,
  focus: false,
  typewriter: false,
};
let editor;

// ---------------------------------------------------------------- 工具函数

const basename = (p) => p.split(/[\\/]/).pop();
const dirname = (p) => p.replace(/[\\/][^\\/]*$/, '');
const tabTitle = (tab) => (tab.kind === 'start' ? '开始' : tab.path ? basename(tab.path) : `未命名-${tab.untitledNo}`);
const docName = () => tabTitle(tabs.current);
const isMarkdownPath = (p) => /\.(md|markdown|mdown|txt)$/i.test(p);

function resolvePath(base, rel) {
  if (/^[A-Za-z]:[\\/]/.test(rel)) return rel;
  const out = base.replace(/\\/g, '/').split('/');
  for (const seg of rel.replace(/\\/g, '/').split('/')) {
    if (seg === '..') out.pop();
    else if (seg && seg !== '.') out.push(seg);
  }
  return out.join('\\');
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const modeElement = () => editor.dom;
const isStart = () => tabs.current?.kind === 'start';

// ---------------------------------------------------------------- 文档状态（FR-005/006）

function updateTitle() {
  api.setTitle(isStart() ? 'Inkmark' : `${state.dirty ? '• ' : ''}${docName()} - Inkmark`);
}

function syncDirty(tab) {
  const dirty = editor.isDocDirty(tab.doc);
  if (dirty === tab.dirty) return;
  tab.dirty = dirty;
  tabs.update(tab);
  if (tab === tabs.current) updateTitle();
  updateTabMenu();
}

const refreshDirty = () => syncDirty(tabs.current);

const refreshPanels = debounce(() => updatePanels(), 250);

function onChange() {
  refreshDirty();
  refreshPanels();
  findStale = true;
  refreshFindSoon();
}

// 图片只在显示时转换为 asset 地址，不改动 Markdown 文本（FR-011）
async function imageUrl(src) {
  const r = Render.resolveImage(src, state.path ? dirname(state.path) : null);
  if (!r) return null;
  if (r.url) return r.url;
  await api.allowImage(r.path);
  return api.toAssetUrl(r.path);
}

function updatePanels() {
  const md = editor.getValue();
  const { words, chars } = TextUtils.countWords(md);
  $('#status-count').textContent = isStart() ? '' : `${words} 词 · ${chars} 字符`;
  renderOutline(md);
}

// ---------------------------------------------------------------- 标签（specs/008）

const tabs = Tabs.create({
  bar: $('#tabbar'),
  onSelect: (tab) => busy || showTab(tab),
  onClose: (tab) => tab.kind === 'start' || closeTabs([tab]),
  onNew: newTab,
  title: tabTitle,
});
const closedTabs = []; // 本次运行关闭的文件标签，后关闭的在末尾（US3-5）
const MAX_CLOSED = 20;
let busy = false; // 关闭或全部保存的询问进行中

const startPage = StartPage.create({
  root: $('#start-page'),
  actions: () => [
    { icon: '+', label: '新建空白 Markdown', shortcut: 'Ctrl+N', run: newTab },
    { icon: '↗', label: '打开文件…', shortcut: 'Ctrl+O', run: () => run('open') },
    { icon: '▸', label: '打开文件夹…', shortcut: 'Ctrl+Shift+O', run: () => run('open-folder') },
    ...(closedTabs.length ? [{ icon: '↺', label: '恢复关闭的标签', shortcut: 'Ctrl+Shift+T', run: () => run('reopen-tab') }] : []),
    { icon: '?', label: '查看示例文档', run: async () => openPath(await api.sampleDoc()) },
  ],
  recent: () => state.settings.recent,
  favorites: () => state.settings.favorites,
  pathInfo: api.pathInfo,
  openFile: (p) => openPath(p),
  openFolder: (p) => openFolderInSidebar(p),
  setRecent: async (recent) => {
    state.settings = await api.setSettings({ recent });
  },
});

let lastTabMenu = '';
function updateTabMenu() {
  const start = isStart();
  const menu = {
    hasDoc: !start,
    anyDirty: tabs.list.some((t) => t.dirty),
    canCloseOthers: !start && tabs.list.length > 1,
    canReopen: closedTabs.length > 0,
  };
  const key = JSON.stringify(menu);
  if (key !== lastTabMenu) {
    lastTabMenu = key;
    api.setTabMenu(menu);
  }
}

function showTab(tab) {
  const start = tab.kind === 'start';
  editorEl.hidden = start;
  $('#start-page').hidden = !start;
  if (start) {
    findbar.hidden = true;
    $('#find-count').textContent = '';
  }
  editor.activate(tab.doc);
  tabs.select(tab);
  updateTitle();
  updatePanels();
  highlightTreeCurrent();
  updateStatus();
  if (!findbar.hidden) refreshFind();
  else if (Finder.ranges(editor.view.state).length) Finder.clear(editor.view);
  updateTabMenu();
  if (start) {
    startPage.render();
  } else {
    editor.view.requestMeasure();
    editor.focus();
  }
}

const startFields = () => ({
  kind: 'start',
  path: null,
  untitledNo: 0,
  format: { bom: false, eol: '\n' },
  doc: editor.createDoc(''),
  dirty: false,
});

function docFields(doc) {
  const { body, bom, eol } = DocFormat.split(doc ? doc.content : '');
  return {
    kind: 'doc',
    path: doc ? TabUtils.normalizePath(doc.path) : null,
    untitledNo: doc ? 0 : TabUtils.nextUntitled(tabs.list.map((t) => t.untitledNo)),
    format: { bom, eol },
    doc: editor.createDoc(body),
    dirty: false,
  };
}

/** 新建未命名标签，放在当前标签右侧（US1-4） */
function newTab() {
  if (isStart()) {
    Object.assign(tabs.current, docFields(null));
    tabs.render();
    showTab(tabs.current);
    return;
  }
  const tab = docFields(null);
  tabs.insert(tab, tabs.list.indexOf(tabs.current) + 1);
  showTab(tab);
}

/** 在新标签中显示已读取的文档；已打开时切换到已有标签；唯一的空白标签被复用（FR-802） */
function showDoc(doc, index) {
  const existing = tabs.find(TabUtils.pathKey(doc.path));
  if (existing) {
    showTab(existing);
    tabs.flash(existing);
    return;
  }
  const only = tabs.list.length === 1 && tabs.list[0];
  if (only && (only.kind === 'start' || (!only.path && !editor.isDocDirty(only.doc)))) {
    Object.assign(only, docFields(doc));
    tabs.render();
    showTab(only);
    return;
  }
  const tab = docFields(doc);
  tabs.insert(tab, index);
  showTab(tab);
}

/** 让用户选择另存为路径；目标已在其他标签打开时不写入（FR-802、边界情况） */
async function askSavePath(tab) {
  for (;;) {
    const p = await api.askSavePath(tab.path || `${tabTitle(tab)}.md`);
    if (!p) return null;
    const other = tabs.find(TabUtils.pathKey(p));
    if (!other || other === tab) return p;
    const choice = await api.confirmSaveConflict(basename(p));
    if (choice === 'switch') {
      showTab(other);
      tabs.flash(other);
    }
    if (choice !== 'retry') return null;
  }
}

/** 保存的唯一入口；未命名或另存为时先切换到该标签再询问路径。成功返回 true */
async function saveTab(tab, as = false) {
  let path = tab.path;
  if (as || !path) {
    if (tab !== tabs.current) showTab(tab);
    path = await askSavePath(tab);
    if (!path) return false;
  }
  try {
    await api.saveFile(path, DocFormat.join(editor.docText(tab.doc), tab.format));
  } catch (e) {
    alert(`无法保存文件：\n${path}\n${e}`);
    return false;
  }
  if (path !== tab.path) {
    tab.path = TabUtils.normalizePath(path);
    tabs.render();
    if (tab === tabs.current) highlightTreeCurrent();
  }
  editor.markSaved(tab.doc);
  syncDirty(tab);
  if (tab === tabs.current) updateTitle();
  return true;
}

/** 全部保存（US6）：写入失败时继续其余文件；取消另存为时跳过其余未命名标签 */
async function saveAll() {
  if (busy) return;
  const dirty = tabs.list.filter((t) => editor.isDocDirty(t.doc));
  if (!dirty.length) return;
  const origin = tabs.current;
  let saved = 0;
  let finished = true;
  busy = true;
  try {
    for (const tab of dirty.filter((t) => t.path)) if (await saveTab(tab)) saved++;
    for (const tab of dirty.filter((t) => !t.path)) {
      finished = await saveTab(tab);
      if (!finished) break;
      saved++;
    }
  } finally {
    busy = false;
  }
  if (finished && tabs.current !== origin) showTab(origin);
  $('#status-flags').textContent = `已保存 ${saved} 个文件`;
}

/** 处理 targets 中未保存的修改，返回 true 表示可以关闭（宪章 IV、FR-806、FR-819） */
async function settleDirty(targets) {
  const dirty = targets.filter((t) => editor.isDocDirty(t.doc));
  if (!dirty.length) return true;
  if (dirty.length === 1) {
    showTab(dirty[0]);
    return confirmLeave();
  }
  const choice = await api.confirmDiscardAll(dirty.map(tabTitle));
  if (choice !== 'save') return choice === 'discard';
  for (const tab of [...dirty.filter((t) => t.path), ...dirty.filter((t) => !t.path)]) {
    if (!(await saveTab(tab))) return false;
  }
  return true;
}

function removeTabs(targets) {
  for (const tab of targets) if (tab.path) closedTabs.push({ path: tab.path, index: tabs.list.indexOf(tab) });
  closedTabs.splice(0, closedTabs.length - MAX_CLOSED);
  let next = TabUtils.nextAfterClose(tabs.list, tabs.current, targets);
  if (!next) {
    next = startFields();
    tabs.insert(next);
  }
  if (next !== tabs.current) showTab(next);
  tabs.remove(targets);
  updateTabMenu();
  if (!isStart()) editor.focus();
}

async function closeTabs(targets) {
  if (busy || !targets.length) return;
  busy = true;
  try {
    if (await settleDirty(targets)) removeTabs(targets);
  } finally {
    busy = false;
  }
}

const documentTabs = () => tabs.list.filter((t) => t.kind !== 'start');

/** 返回 true 表示可以继续丢弃当前文档（宪章 IV） */
async function confirmLeave() {
  refreshDirty();
  if (!state.dirty) return true;
  const choice = await api.confirmDiscard(docName());
  if (choice === 'save') return saveTab(tabs.current);
  return choice === 'discard';
}

async function readAndShow(p, index) {
  const existing = tabs.find(TabUtils.pathKey(p));
  if (existing) return showDoc(existing);
  let doc;
  try {
    doc = await api.readFile(p);
  } catch {
    alert(`无法打开文件：\n${p}`);
    const recent = state.settings.recent.filter((r) => r !== p);
    state.settings = await api.setSettings({ recent });
    return;
  }
  showDoc(doc, index);
}

// 打开请求排队，连续打开多个文件时顺序不交错
let openQueue = Promise.resolve();
function openPath(p, index) {
  openQueue = openQueue.then(() => readAndShow(p, index));
  return openQueue;
}

// ---------------------------------------------------------------- 排版命令（FR-012）

const FORMAT = Object.fromEntries(
  [
    'bold',
    'italic',
    'strike',
    'underline',
    'inline-code',
    'link',
    'heading',
    'paragraph',
    'quote',
    'list',
    'ordered-list',
    'check',
    'code-block',
    'math-block',
    'line',
  ].map((name) => [name, (arg) => editor.format[name](arg)]),
);

// ---------------------------------------------------------------- 视图命令

function applySidebar() {
  const { tab } = state.settings.sidebar;
  resizer.apply();
  document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#pane-files').classList.toggle('active', tab === 'files');
  $('#pane-favorites').classList.toggle('active', tab === 'favorites');
  $('#pane-outline').classList.toggle('active', tab === 'outline');
  if (tab === 'favorites') favorites.render(); // 重新检查路径是否存在
}

const resizer = Resizer.init({
  getSidebar: () => state.settings.sidebar,
  save: (patch) => setSidebar(patch),
});

async function setSidebar(patch) {
  state.settings = await api.setSettings({ sidebar: { ...state.settings.sidebar, ...patch } });
  applySidebar();
}

function updateStatus() {
  $('#status-mode').textContent = isStart() ? '' : editor.isSource() ? '源代码模式' : '即时渲染';
  $('#status-flags').textContent = [state.focus && '专注', state.typewriter && '打字机'].filter(Boolean).join(' · ');
  editorEl.classList.toggle('focus-mode', state.focus);
  editorEl.classList.toggle('typewriter-mode', state.typewriter);
}

function toggleSourceMode() {
  editor.toggleSource();
  refreshFind();
  updateStatus();
  editor.focus();
}

// ---------------------------------------------------------------- 大纲（FR-007）

let headings = [];
function renderOutline(md) {
  headings = TextUtils.parseHeadings(md);
  const ul = $('#outline');
  if (!headings.length) {
    ul.innerHTML = '<li class="empty">（无标题）</li>';
    return;
  }
  const min = Math.min(...headings.map((h) => h.level));
  ul.replaceChildren(
    ...headings.map((h, i) => {
      const li = document.createElement('li');
      li.textContent = h.text || '（空标题）';
      li.title = h.text;
      li.style.paddingLeft = `${14 + (h.level - min) * 16}px`;
      li.addEventListener('click', () => scrollToHeading(i));
      return li;
    }),
  );
}

function scrollToHeading(i) {
  editor.scrollToLine(headings[i].line);
}

// ---------------------------------------------------------------- 文件树（FR-007）

async function showFolder(folder) {
  const header = $('#folder-name');
  header.hidden = false;
  header.title = folder;
  header.dataset.path = folder;
  header.querySelector('.name').textContent = basename(folder);
  const tree = $('#tree');
  tree.replaceChildren();
  await fillDir(tree, folder);
  highlightTreeCurrent();
}

async function fillDir(ul, dir) {
  let entries;
  try {
    entries = await api.listDir(dir);
  } catch {
    entries = [];
  }
  if (!entries.length) {
    ul.innerHTML = '<li class="row empty">（空）</li>';
    return;
  }
  const depth = Number(ul.dataset.depth || 0);
  ul.replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement('li');
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.path = e.path;
      row.style.paddingLeft = `${14 + depth * 14}px`;
      row.title = e.path;
      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = e.dir ? '▸' : '';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = e.name;
      row.append(icon, name, starButton(e.path, e.dir));
      row.addEventListener('contextmenu', (ev) => favoriteMenu(ev, e.path, e.dir));
      li.append(row);
      if (e.dir) {
        const sub = document.createElement('ul');
        sub.dataset.depth = depth + 1;
        sub.hidden = true;
        li.append(sub);
        row.addEventListener('click', async () => {
          sub.hidden = !sub.hidden;
          icon.textContent = sub.hidden ? '▸' : '▾';
          if (!sub.hidden && !sub.childElementCount) {
            await fillDir(sub, e.path);
            highlightTreeCurrent();
          }
        });
      } else {
        row.addEventListener('click', () => openPath(e.path));
      }
      return li;
    }),
  );
}

// ---------------------------------------------------------------- 收藏夹（FR-210..214）

const favorites = Favorites.create({
  list: $('#favorites'),
  getList: () => state.settings.favorites,
  saveList: async (list) => {
    state.settings = await api.setSettings({ favorites: list });
  },
  pathInfo: api.pathInfo,
  openFile: (p) => openPath(p),
  openFolder: openFolderInSidebar,
  currentPath: () => state.path,
  onChange: refreshStars,
});

async function openFolderInSidebar(p) {
  await showFolder(p);
  state.settings = await api.setSettings({ folder: p });
  await setSidebar({ visible: true, tab: 'files' });
}

function setStar(button, path) {
  const on = favorites.has(path);
  button.textContent = on ? '★' : '☆';
  button.classList.toggle('on', on);
  button.title = on ? '从收藏中移除' : '添加到收藏';
  button.setAttribute('aria-label', button.title);
}

function starButton(path, dir) {
  const button = document.createElement('button');
  button.className = 'star';
  button.dataset.path = path;
  button.tabIndex = -1;
  setStar(button, path);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    favorites.toggle(path, dir);
  });
  return button;
}

function refreshStars() {
  document.querySelectorAll('#tree .star').forEach((b) => setStar(b, b.dataset.path));
  const header = $('#folder-name');
  if (header.dataset.path) setStar(header.querySelector('.star'), header.dataset.path);
  updateFavoriteMenu();
}

function favoriteMenu(e, path, dir) {
  e.preventDefault();
  ContextMenu.show(e.clientX, e.clientY, [
    { label: favorites.has(path) ? '从收藏中移除' : '添加到收藏', action: () => favorites.toggle(path, dir) },
  ]);
}

function updateFavoriteMenu() {
  api.setFavoriteMenu(!!state.path && favorites.has(state.path), !!state.path);
}

$('#folder-name .star').addEventListener('click', () => favorites.toggle($('#folder-name').dataset.path, true));
$('#folder-name').addEventListener('contextmenu', (e) => favoriteMenu(e, $('#folder-name').dataset.path, true));

function highlightTreeCurrent() {
  favorites.markCurrent();
  updateFavoriteMenu();
  document.querySelectorAll('#tree .row').forEach((r) => r.classList.toggle('current', r.dataset.path === state.path));
}

// ---------------------------------------------------------------- 查找替换（FR-013）

const findbar = $('#findbar');
const findInput = $('#find-input');
const replaceInput = $('#replace-input');

let findStale = false; // 查找后文档被修改，匹配位置需要重新计算
let keepFindNotice = false;
const findRendered = () => !editor.isSource();

function refreshFind() {
  findStale = false;
  if (keepFindNotice) {
    keepFindNotice = false; // 全部替换后保留“已替换”提示
    return;
  }
  if (!findbar.hidden) showFindResult(Finder.refresh(editor.view, findInput.value, findRendered()));
}
const refreshFindSoon = debounce(refreshFind, 150);

function showFindResult({ active, total }) {
  $('#find-count').textContent = !findInput.value ? '' : total ? `${active}/${total}` : '无结果';
}

function runFind() {
  findStale = false;
  showFindResult(Finder.search(editor.view, findInput.value, findRendered()));
}

function showFindbar(withReplace) {
  findbar.hidden = false;
  findbar.classList.toggle('with-replace', withReplace);
  const selected = editor.getSelectionText();
  if (selected && !selected.includes('\n')) findInput.value = selected;
  findInput.focus();
  findInput.select();
  runFind();
}

function hideFindbar() {
  findbar.hidden = true;
  Finder.clear(editor.view);
  $('#find-count').textContent = '';
  editor.focus();
}

function findStep(forward) {
  if (findStale) refreshFind();
  showFindResult(Finder.step(editor.view, forward, findRendered()));
}

findInput.addEventListener('input', runFind);
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') findStep(!e.shiftKey);
});
$('#find-next').addEventListener('click', () => findStep(true));
$('#find-prev').addEventListener('click', () => findStep(false));
$('#find-close').addEventListener('click', hideFindbar);
$('#replace-all').addEventListener('click', () => {
  if (!findInput.value) return;
  const { replaced, skipped } = Finder.replaceAll(editor.view, findInput.value, replaceInput.value, findRendered());
  keepFindNotice = replaced > 0;
  $('#find-count').textContent = `已替换 ${replaced} 处${skipped ? `，跳过 ${skipped} 处跨格式匹配` : ''}`;
});
findbar.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideFindbar();
});

// ---------------------------------------------------------------- 导出（FR-014）

async function exportAs(kind) {
  const name = state.path ? basename(state.path).replace(/\.\w+$/, '') : '未命名';
  const defaultPath = (state.path ? dirname(state.path) + '\\' : '') + `${name}.${kind}`;
  const body = await Render.renderDocument(editor.getValue());
  let out;
  if (kind === 'pdf') {
    // PDF 由临时 HTML 生成，需用 <base> 让相对图片指向原文档目录
    const baseUrl = state.path ? new URL(`file:///${dirname(state.path).replace(/\\/g, '/')}/`).href : undefined;
    out = await api.exportPdf(await ExportHtml.buildHtml({ title: name, body, baseUrl }), defaultPath);
  } else {
    out = await api.exportHtml(await ExportHtml.buildHtml({ title: name, body }), defaultPath);
  }
  if (out) $('#status-flags').textContent = `已导出：${out}`;
}

// ---------------------------------------------------------------- 命令表

function insertTable() {
  editor.focus();
  const { view } = editor;
  const at = view.coordsAtPos(view.state.selection.main.head, -1) || { left: 200, bottom: 200 };
  TableUi.openPicker(at.left, at.bottom + 4, { rows: 3, cols: 3 }, (rows, cols) => {
    editor.format.table({ rows, cols });
    if (!editor.isSource()) TableUi.focusTableAt(view, view.state.selection.main.from);
  });
}

const COMMANDS = {
  table: insertTable,
  'table-insert-row': () => TableUi.command('table-insert-row'),
  'table-delete-row': () => TableUi.command('table-delete-row'),
  new: newTab,
  open: async () => {
    const doc = await api.openDialog();
    if (doc) showDoc(doc);
  },
  'open-path': openPath,
  'open-folder': async () => {
    const folder = await api.openFolderDialog();
    if (!folder) return;
    await showFolder(folder);
    await setSidebar({ visible: true, tab: 'files' });
  },
  'clear-recent': async () => (state.settings = await api.setSettings({ recent: [] })),
  save: () => saveTab(tabs.current),
  'save-as': () => saveTab(tabs.current, true),
  'save-all': saveAll,
  'close-tab': () => isStart() || closeTabs([tabs.current]),
  'close-others': () => closeTabs(tabs.list.filter((t) => t !== tabs.current)),
  'close-all': () => closeTabs(documentTabs()),
  'reopen-tab': () => {
    const item = closedTabs.pop();
    updateTabMenu();
    if (item) openPath(item.path, item.index);
  },
  'export-html': () => exportAs('html'),
  'export-pdf': () => exportAs('pdf'),
  find: () => showFindbar(false),
  replace: () => showFindbar(true),
  'source-mode': toggleSourceMode,
  'toggle-sidebar': () => setSidebar({ visible: !state.settings.sidebar.visible }),
  'sidebar-outline': () => setSidebar({ visible: true, tab: 'outline' }),
  'sidebar-files': () => setSidebar({ visible: true, tab: 'files' }),
  'sidebar-favorites': () => setSidebar({ visible: true, tab: 'favorites' }),
  'toggle-favorite-current': () => state.path && favorites.toggle(state.path, false),
  'focus-mode': () => {
    state.focus = !state.focus;
    editor.setFocusMode(state.focus);
    updateStatus();
  },
  'typewriter-mode': () => {
    state.typewriter = !state.typewriter;
    editor.setTypewriterMode(state.typewriter);
    updateStatus();
  },
  fullscreen: () => api.toggleFullscreen(),
  'zoom-in': () => setZoom(zoom + 0.1),
  'zoom-out': () => setZoom(zoom - 0.1),
  'zoom-reset': () => setZoom(1),
  theme: async (theme) => (state.settings = await api.setSettings({ theme })),
  quit: () => api.close(),
};

let zoom = 1;
function setZoom(z) {
  zoom = Math.min(3, Math.max(0.5, Math.round(z * 10) / 10));
  api.setZoom(zoom);
}

// 起始页不是文档，这些命令不可用（FR-815）
const DOCUMENT_COMMANDS = new Set([
  'save',
  'save-as',
  'export-html',
  'export-pdf',
  'find',
  'replace',
  'source-mode',
  'table',
  'table-insert-row',
  'table-delete-row',
  'toggle-favorite-current',
]);

function run(cmd, arg) {
  if (!editor) return;
  if (isStart() && (FORMAT[cmd] || DOCUMENT_COMMANDS.has(cmd))) return;
  if (FORMAT[cmd]) {
    if (!modeElement().contains(getSelection().anchorNode)) editor.focus();
    FORMAT[cmd](arg);
  } else if (COMMANDS[cmd]) {
    COMMANDS[cmd](arg);
  }
}

// Typora 风格快捷键，与 src-tauri/src/menu.rs 中显示的快捷键一一对应。
// WebView2 有焦点时菜单快捷键不会触发，因此全部在这里处理（research.md R2）。
const KEYMAP = {
  'Ctrl+KeyN': ['new'],
  'Ctrl+KeyO': ['open'],
  'Ctrl+Shift+KeyO': ['open-folder'],
  'Ctrl+KeyS': ['save'],
  'Ctrl+Shift+KeyS': ['save-as'],
  'Ctrl+Alt+KeyS': ['save-all'],
  'Ctrl+KeyW': ['close-tab'],
  'Ctrl+Shift+KeyT': ['reopen-tab'],
  'Ctrl+Equal': ['zoom-in'],
  'Ctrl+Minus': ['zoom-out'],
  'Ctrl+Shift+Digit9': ['zoom-reset'],
  'Ctrl+Digit0': ['paragraph'],
  ...Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`Ctrl+Digit${n}`, ['heading', n]])),
  'Ctrl+KeyB': ['bold'],
  'Ctrl+KeyI': ['italic'],
  'Ctrl+KeyU': ['underline'],
  'Shift+Alt+Digit5': ['strike'],
  'Ctrl+Shift+Backquote': ['inline-code'],
  'Ctrl+KeyK': ['link'],
  'Ctrl+Shift+KeyQ': ['quote'],
  'Ctrl+Shift+BracketLeft': ['ordered-list'],
  'Ctrl+Shift+BracketRight': ['list'],
  'Ctrl+Shift+KeyX': ['check'],
  'Ctrl+Shift+KeyK': ['code-block'],
  'Ctrl+Shift+KeyM': ['math-block'],
  'Ctrl+KeyT': ['table'],
  'Ctrl+Enter': ['table-insert-row'],
  'Ctrl+Shift+Backspace': ['table-delete-row'],
  'Ctrl+Shift+Minus': ['line'],
  'Ctrl+Slash': ['source-mode'],
  'Ctrl+Shift+KeyL': ['toggle-sidebar'],
  'Ctrl+Shift+Digit1': ['sidebar-outline'],
  'Ctrl+Shift+Digit2': ['sidebar-favorites'],
  'Ctrl+Shift+Digit3': ['sidebar-files'],
  F8: ['focus-mode'],
  F9: ['typewriter-mode'],
  F11: ['fullscreen'],
  'Ctrl+KeyF': ['find'],
  'Ctrl+KeyH': ['replace'],
};

window.addEventListener(
  'keydown',
  (e) => {
    const key = `${e.ctrlKey ? 'Ctrl+' : ''}${e.shiftKey ? 'Shift+' : ''}${e.altKey ? 'Alt+' : ''}${e.code}`;
    const hit = KEYMAP[key];
    if (!hit || !editor) return;
    if (hit[0].startsWith('table-') && !TableUi.isActive()) return; // 只在表格单元格内生效
    if (FORMAT[hit[0]] && (!modeElement().contains(e.target) || e.target.closest('.im-table'))) return;
    e.preventDefault();
    e.stopPropagation();
    run(...hit);
  },
  true,
);

// ---------------------------------------------------------------- 链接、拖放（FR-001/016）

editorEl.addEventListener(
  'click',
  (e) => {
    if (!e.ctrlKey) return;
    const url = e.target.closest('[data-href]')?.dataset.href;
    if (!url) return;
    e.preventDefault();
    if (/^https?:/i.test(url)) api.openExternal(url);
    else if (state.path && isMarkdownPath(url.split('#')[0])) {
      openPath(resolvePath(dirname(state.path), decodeURI(url.split('#')[0])));
    }
  },
  true,
);

// 拖入 Markdown 文件则打开；拖入图片则保存到 assets/ 并插入（FR-001、FR-011）
api.onDragDrop(async ({ type, paths }) => {
  if (type !== 'drop' || !paths?.length || !editor) return;
  const docs = paths.filter(isMarkdownPath);
  if (docs.length) return Promise.all(docs.map((p) => openPath(p)));
  if (isStart()) return;
  for (const p of paths) {
    try {
      const src = await api.saveImageFromPath(state.path, p);
      const url = src.startsWith('file:') ? src : encodeURI(src);
      editor.insert(`![${basename(p).replace(/\.\w+$/, '')}](${url})\n`);
    } catch {
      // 非图片文件：忽略
    }
  }
});

// ---------------------------------------------------------------- 图片（FR-011）

async function uploadImages(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const src = await api.saveImage(state.path, file.name, bytes);
    const url = src.startsWith('file:') ? src : encodeURI(src);
    editor.insert(`![${file.name.replace(/\.\w+$/, '')}](${url})\n`);
  }
}

// ---------------------------------------------------------------- 启动

document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.addEventListener('click', () => setSidebar({ tab: b.dataset.tab })));
$('#open-folder').addEventListener('click', () => run('open-folder'));
api.onCommand(({ cmd, arg }) => run(cmd, arg));
api.onOpenFile((p) => run('open-path', p));
api.onCloseRequested(async (e) => {
  if (busy || !(await settleDirty(tabs.list))) e.preventDefault();
});

(async () => {
  state.settings = await api.getSettings();
  editor = Editor.create(editorEl, { onChange, onPasteImages: uploadImages, imageUrl });
  const first = startFields();
  tabs.insert(first);
  showTab(first);
  applySidebar();
  if (state.settings.folder) showFolder(state.settings.folder);
  refreshStars();
  const initial = await api.appReady();
  if (initial) openPath(initial);
})();
