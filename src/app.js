/* global Editor, Render, TextUtils, DocFormat, Finder, ExportHtml, TableUi, Resizer, Favorites, ContextMenu, TabUtils, Tabs, StartPage, About, ImageFolder, ImageMenu */
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
const tabTitle = (tab) =>
  tab.kind === 'start' ? '开始' : tab.path ? `${basename(tab.path)}${tab.readOnly ? ' · 只读' : ''}` : `未命名-${tab.untitledNo}`;
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
  // 原路径不存在时由后端在图片文件夹中按哈希名查找（FR-1104）
  return api.toAssetUrl(await api.allowImage(r.path));
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
  onMenu: showTabMenu,
  onChange: () => saveSessionSoon(),
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
    { icon: '?', label: '使用指南', run: () => openBundled('guide') },
    { icon: '¶', label: '查看示例文档', run: () => openBundled('demo') },
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

let wantedTab = null; // 最后一次要求显示的标签，懒加载完成时只显示它

/** 恢复的标签首次切换时才读取文件（NFR-805） */
async function loadTab(tab) {
  if (tab.loading) return;
  tab.loading = true;
  let doc;
  try {
    doc = await api.readFile(tab.path);
  } catch {
    alert(`无法打开文件：\n${tab.path}`);
    tabs.remove([tab]);
    updateTabMenu();
    return;
  } finally {
    tab.loading = false;
  }
  Object.assign(tab, docFields(doc));
  if (wantedTab === tab) showTab(tab);
}

function showTab(tab) {
  wantedTab = tab;
  if (!tab.doc) {
    loadTab(tab);
    return;
  }
  const start = tab.kind === 'start';
  editorEl.hidden = start;
  $('#start-page').hidden = !start;
  if (start) {
    findbar.hidden = true;
    $('#find-count').textContent = '';
  }
  // 先切换当前标签：换入文档时图片按 state.path 解析相对路径，必须是新文档的目录
  tabs.select(tab);
  editor.activate(tab.doc);
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

/** bundled 为内置的使用指南（'guide'，只读）或示例文档（'demo'）（specs/013） */
function docFields(doc, bundled = null) {
  const { body, bom, eol } = DocFormat.split(doc ? doc.content : '');
  const readOnly = bundled === 'guide';
  return {
    kind: 'doc',
    path: doc ? TabUtils.normalizePath(doc.path) : null,
    untitledNo: doc ? 0 : TabUtils.nextUntitled(tabs.list.map((t) => t.untitledNo)),
    format: { bom, eol },
    doc: editor.createDoc(body, readOnly),
    dirty: false,
    bundled,
    readOnly,
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
function showDoc(doc, index, bundled = null) {
  const existing = tabs.find(TabUtils.pathKey(doc.path));
  if (existing) {
    showTab(existing);
    tabs.flash(existing);
    return;
  }
  const only = tabs.list.length === 1 && tabs.list[0];
  if (only && (only.kind === 'start' || (!only.path && !editor.isDocDirty(only.doc)))) {
    Object.assign(only, docFields(doc, bundled));
    tabs.render();
    showTab(only);
    return;
  }
  const tab = docFields(doc, bundled);
  tabs.insert(tab, index);
  showTab(tab);
}

/** 让用户选择另存为路径；目标已在其他标签打开时不写入（FR-802、边界情况） */
async function askSavePath(tab) {
  for (;;) {
    // 内置文档默认只给文件名，不把用户带到程序数据目录
    const p = await api.askSavePath(tab.path && !tab.bundled ? tab.path : tab.path ? basename(tab.path) : `${tabTitle(tab)}.md`);
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
    if (tab.readOnly) {
      // 另存出的副本可以编辑（规格边界情况）
      const copy = editor.createDoc(editor.docText(tab.doc));
      copy.scroll = editor.view.scrollSnapshot();
      tab.doc = copy;
      tab.readOnly = false;
      editor.activate(copy);
      updateStatus();
    }
    tab.bundled = null;
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
  for (const tab of targets) {
    if (tab.path) closedTabs.push({ path: tab.path, index: tabs.list.indexOf(tab), bundled: tab.bundled });
  }
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

// ---------------------------------------------------------------- 标签会话（FR-811）

let sessionReady = false; // 恢复完成前不记录，避免启动时覆盖上次的会话

async function writeSession() {
  if (!sessionReady) return;
  const saved = tabs.list.filter((t) => t.path && !t.bundled); // 内置文档不恢复（FR-1305）
  state.settings = await api.setSettings({
    tabs: { paths: saved.map((t) => t.path), active: Math.max(saved.indexOf(tabs.current), 0) },
  });
}

const saveSessionSoon = debounce(writeSession, 300);

/** 恢复上次的标签，只读取当前标签；有标签显示时返回 true */
async function restoreSession() {
  if (!state.settings.restoreTabs) return false;
  const { paths, active } = state.settings.tabs;
  if (!paths.length) return false;
  const info = await api.pathInfo(paths);
  const restored = paths
    .filter((_, i) => info[i].exists && !info[i].dir)
    .map((p) => ({ kind: 'doc', path: p, untitledNo: 0, format: { bom: false, eol: '\n' }, doc: null, dirty: false }));
  const skipped = paths.length - restored.length;
  restored.forEach((tab) => tabs.insert(tab));
  const first = restored.find((t) => t.path === paths[active]) || restored[0];
  for (const tab of first ? [first, ...restored.filter((t) => t !== first)] : []) {
    try {
      Object.assign(tab, docFields(await api.readFile(tab.path)));
      showTab(tab);
      if (skipped) $('#status-flags').textContent = `已跳过 ${skipped} 个不存在的文件`;
      return true;
    } catch {
      tabs.remove([tab]);
    }
  }
  return false;
}

function cycleTab(step) {
  if (busy) return;
  const n = tabs.list.length;
  showTab(tabs.list[(tabs.list.indexOf(tabs.current) + step + n) % n]);
}

/** n 为 1..8 时跳到第 n 个，9 时跳到最后一个（US3-3） */
function gotoTab(n) {
  const tab = n === 9 ? tabs.list.at(-1) : tabs.list[n - 1];
  if (tab && !busy) showTab(tab);
}

function reopenTab() {
  const item = closedTabs.pop();
  updateTabMenu();
  if (item) item.bundled ? openBundled(item.bundled, item.index) : openPath(item.path, item.index);
}

function showTabMenu(tab, x, y) {
  const isDoc = tab.kind !== 'start';
  const i = tabs.list.indexOf(tab);
  const favorited = !!tab.path && favorites.has(tab.path);
  ContextMenu.show(x, y, [
    { label: '关闭', shortcut: 'Ctrl+W', disabled: !isDoc, action: () => closeTabs([tab]) },
    { label: '关闭其他标签', disabled: tabs.list.length < 2, action: () => closeTabs(tabs.list.filter((t) => t !== tab)) },
    { label: '关闭右侧标签', disabled: i === tabs.list.length - 1, action: () => closeTabs(tabs.list.slice(i + 1)) },
    '-',
    { label: '重新打开关闭的标签', shortcut: 'Ctrl+Shift+T', disabled: !closedTabs.length, action: reopenTab },
    '-',
    { label: '复制文件路径', disabled: !tab.path, action: () => navigator.clipboard.writeText(tab.path) },
    { label: '在资源管理器中显示', disabled: !tab.path, action: () => api.revealPath(tab.path) },
    { label: favorited ? '从收藏中移除' : '添加到收藏', disabled: !tab.path, action: () => favorites.toggle(tab.path, false) },
  ]);
}

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

/** 使用指南与示例文档（specs/013）：每次打开都恢复为当前版本内容；指南已打开时只切换 */
async function openBundled(name, index) {
  const existing = tabs.list.find((t) => t.bundled === name);
  if (existing && name === 'guide') return showTab(existing);
  if (existing && !(await settleDirty([existing]))) return;
  let doc;
  try {
    doc = await api.openBundled(name);
  } catch (e) {
    alert(`无法打开${name === 'guide' ? '使用指南' : '示例文档'}：
${e}`);
    return;
  }
  if (!existing) return showDoc(doc, index, name);
  Object.assign(existing, docFields(doc, name));
  tabs.render();
  showTab(existing);
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
  $('#status-flags').textContent = [tabs.current?.readOnly && '只读', state.focus && '专注', state.typewriter && '打字机']
    .filter(Boolean)
    .join(' · ');
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

const fileUrl = (p) =>
  'file:///' +
  p
    .replace(/\\/g, '/')
    .split('/')
    .map((seg, i) => (i === 0 ? seg : encodeURIComponent(seg)))
    .join('/');

/** 文档中的本地图片引用：[{ from, to, path }]；网络地址与无法解析的相对路径跳过 */
function localImageRefs() {
  const dir = state.path ? dirname(state.path) : null;
  return editor.imageRefs().flatMap((ref) => {
    const r = Render.resolveImage(ref.src, dir);
    return r?.path ? [{ ...ref, path: r.path }] : [];
  });
}

/** 导出时，原路径不存在而在图片文件夹中找到的图片改用新地址（FR-1104） */
async function localizeImages(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const dir = state.path ? dirname(state.path) : null;
  for (const img of doc.querySelectorAll('img[src]')) {
    const r = Render.resolveImage(img.getAttribute('src'), dir);
    if (!r?.path) continue;
    const found = await api.resolveImage(r.path);
    if (found && TabUtils.pathKey(found) !== TabUtils.pathKey(r.path)) img.setAttribute('src', fileUrl(found));
  }
  return doc.body.innerHTML;
}

/** 导出可分享副本（FR-1106）：图片复制到 <文件名>.assets，地址改为相对路径，原文档不变 */
async function exportShareCopy() {
  const name = state.path ? basename(state.path) : `${docName()}.md`;
  const target = await api.askSavePath((state.path ? dirname(state.path) + '\\' : '') + name);
  if (!target) return;
  if (state.path && TabUtils.pathKey(target) === TabUtils.pathKey(state.path)) {
    alert('不能覆盖原文档，请选择其他位置或文件名。');
    return;
  }
  const refs = localImageRefs();
  const folder = `${basename(target).replace(/\.[^.]+$/, '')}.assets`;
  if (refs.length && (await api.pathInfo([dirname(target) + '\\' + folder]))[0].exists && !(await api.confirmOverwrite(folder))) return;
  try {
    const results = await api.copyShareImages(
      target,
      refs.map((r) => r.path),
    );
    const edits = refs.flatMap((r, i) => (results[i] ? [{ from: r.from, to: r.to, insert: results[i] }] : []));
    await api.writeExport(target, DocFormat.join(TextUtils.applyEdits(editor.getValue(), edits), state.format));
    const missing = refs.length - edits.length;
    $('#status-flags').textContent = `已导出可分享副本，复制 ${edits.length} 张图片${missing ? `，${missing} 张找不到` : ''}`;
  } catch (e) {
    alert(`导出失败：\n${e}`);
  }
}

/** 收入图片文件夹（FR-1110）：一步可撤销的地址替换，不自动保存 */
async function importImages() {
  const refs = localImageRefs();
  let results;
  try {
    results = await api.importImages(refs.map((r) => r.path));
  } catch (e) {
    alert(`无法收入图片：\n${e}`);
    return;
  }
  const count = (status) => results.filter((r) => r.status === status).length;
  const edits = refs.flatMap((r, i) => (results[i].url ? [{ from: r.from, to: r.to, insert: results[i].url }] : []));
  if (!edits.length) {
    $('#status-flags').textContent = count('missing') ? `没有可收入的图片，${count('missing')} 张找不到` : '没有需要收入的图片';
    return;
  }
  editor.replaceRanges(edits);
  const parts = [`收入 ${count('imported')} 张图片`];
  if (count('exists')) parts.push(`${count('exists')} 张已存在`);
  if (count('missing')) parts.push(`${count('missing')} 张找不到`);
  $('#status-flags').textContent = parts.join('，');
}

async function exportAs(kind) {
  const name = state.path ? basename(state.path).replace(/\.\w+$/, '') : '未命名';
  const defaultPath = (state.path ? dirname(state.path) + '\\' : '') + `${name}.${kind}`;
  const body = await localizeImages(await Render.renderDocument(editor.getValue()));
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
  'open-bundled': (name) => openBundled(name),
  'open-folder': async () => {
    const folder = await api.openFolderDialog();
    if (!folder) return;
    await showFolder(folder);
    await setSidebar({ visible: true, tab: 'files' });
  },
  about: () => about.about(),
  'third-party': () => about.thirdParty(),
  shortcuts: () => about.shortcuts(),
  'image-folder': () => imageFolder.show(),
  'export-share': exportShareCopy,
  'import-images': importImages,
  'clear-recent': async () => (state.settings = await api.setSettings({ recent: [] })),
  save: () => saveTab(tabs.current),
  'save-as': () => saveTab(tabs.current, true),
  'save-all': saveAll,
  'close-tab': () => isStart() || closeTabs([tabs.current]),
  'close-others': () => closeTabs(tabs.list.filter((t) => t !== tabs.current)),
  'close-all': () => closeTabs(documentTabs()),
  'reopen-tab': reopenTab,
  'toggle-restore-tabs': async () => (state.settings = await api.setSettings({ restoreTabs: !state.settings.restoreTabs })),
  'next-tab': () => cycleTab(1),
  'prev-tab': () => cycleTab(-1),
  'goto-tab': (n) => gotoTab(Number(n)),
  'move-tab': (step) => tabs.move(tabs.current, tabs.list.indexOf(tabs.current) + Number(step)),
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
  'zoom-in': () => setZoom(TextUtils.stepZoom(zoom, 1)),
  'zoom-out': () => setZoom(TextUtils.stepZoom(zoom, -1)),
  'zoom-reset': () => setZoom(1),
  theme: async (theme) => (state.settings = await api.setSettings({ theme })),
  quit: () => api.close(),
};

let zoom = 1;
const saveZoomSoon = debounce(async () => (state.settings = await api.setSettings({ zoom })), 300);
function setZoom(z) {
  zoom = TextUtils.normalizeZoom(z);
  api.setZoom(zoom);
  saveZoomSoon(); // FR-1108
}

// Ctrl+滚轮缩放（FR-1107）：按设备像素累计，约一档普通滚轮（100）缩放 10%
let wheelZoom = 0;
window.addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    // 页面缩放后浏览器按 CSS 像素报告，乘回缩放比例；取整避免 100/1.1*1.1 这类浮点误差
    const px = Math.round(e.deltaY * (e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1) * zoom);
    if (Math.sign(px) !== Math.sign(wheelZoom)) wheelZoom = 0;
    wheelZoom += px;
    while (Math.abs(wheelZoom) >= 100) {
      setZoom(TextUtils.stepZoom(zoom, wheelZoom < 0 ? 1 : -1));
      wheelZoom -= Math.sign(wheelZoom) * 100;
    }
  },
  { capture: true, passive: false },
);

// 起始页不是文档，这些命令不可用（FR-815）
const DOCUMENT_COMMANDS = new Set([
  'export-share',
  'import-images',
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

// 只读的使用指南上会修改文档或写入图片的命令（specs/013 FR-1304）
const READ_ONLY_BLOCKED = new Set(['import-images', 'save', 'replace', 'table', 'table-insert-row', 'table-delete-row']);

function readOnlyHint() {
  $('#status-flags').textContent = '使用指南为只读，可用“另存为”保存副本';
}

const about = About.create({ dialog: $('#about'), appInfo: api.appInfo, openLink: api.openLink });
const imageFolder = ImageFolder.create({ dialog: $('#image-folder'), api, onStatus: (text) => ($('#status-flags').textContent = text) });
const dialogOpen = () => !!document.querySelector('dialog[open]');
ImageMenu.attach({
  host: editorEl,
  api,
  docDir: () => (state.path ? dirname(state.path) : null),
  onStatus: (text) => ($('#status-flags').textContent = text),
});

function run(cmd, arg) {
  if (!editor || dialogOpen()) return;
  if (isStart() && (FORMAT[cmd] || DOCUMENT_COMMANDS.has(cmd))) return;
  if (tabs.current.readOnly && (FORMAT[cmd] || READ_ONLY_BLOCKED.has(cmd))) return readOnlyHint();
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
  'Ctrl+Tab': ['next-tab'],
  'Ctrl+Shift+Tab': ['prev-tab'],
  'Ctrl+PageDown': ['next-tab'],
  'Ctrl+PageUp': ['prev-tab'],
  'Ctrl+Shift+PageDown': ['move-tab', 1],
  'Ctrl+Shift+PageUp': ['move-tab', -1],
  ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`Alt+Digit${n}`, ['goto-tab', n]])),
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
  F1: ['shortcuts'],
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
    if (!hit || !editor || dialogOpen()) return;
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

// 拖入 Markdown 文件则打开；拖入图片则保存到图片文件夹并插入（FR-001、FR-1101）
api.onDragDrop(async ({ type, paths }) => {
  if (type !== 'drop' || !paths?.length || !editor || dialogOpen()) return;
  const docs = paths.filter(isMarkdownPath);
  if (docs.length) return Promise.all(docs.map((p) => openPath(p)));
  if (isStart()) return;
  if (tabs.current.readOnly) return readOnlyHint();
  for (const p of paths.filter((x) => /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(x))) {
    if (!(await insertImage(() => api.saveImageFromPath(p), basename(p)))) break;
  }
});

// ---------------------------------------------------------------- 图片（FR-011）

/** 保存图片并插入；图片文件夹不可用等失败时提示，不插入链接。成功返回 true */
async function insertImage(save, name) {
  try {
    editor.insert(`![${name.replace(/\.\w+$/, '')}](${await save()})\n`);
    return true;
  } catch (e) {
    alert(`无法保存图片：\n${e}`);
    return false;
  }
}

async function uploadImages(files) {
  if (tabs.current.readOnly) return readOnlyHint();
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!(await insertImage(() => api.saveImage(file.name, bytes), file.name))) break;
  }
}

// ---------------------------------------------------------------- 启动

document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.addEventListener('click', () => setSidebar({ tab: b.dataset.tab })));
$('#open-folder').addEventListener('click', () => run('open-folder'));
api.onCommand(({ cmd, arg }) => run(cmd, arg));
api.onOpenFile((paths) => paths.forEach((p) => run('open-path', p)));
api.onCloseRequested(async (e) => {
  if (busy || !(await settleDirty(tabs.list))) return e.preventDefault();
  await writeSession();
});

(async () => {
  state.settings = await api.getSettings();
  zoom = TextUtils.normalizeZoom(state.settings.zoom);
  if (zoom !== 1) api.setZoom(zoom);
  editor = Editor.create(editorEl, { onChange, onPasteImages: uploadImages, imageUrl });
  if (!(await restoreSession())) {
    const first = startFields();
    tabs.insert(first);
    showTab(first);
  }
  sessionReady = true;
  saveSessionSoon();
  applySidebar();
  if (state.settings.folder) showFolder(state.settings.folder);
  refreshStars();
  (await api.appReady()).forEach((p) => openPath(p));
})();
