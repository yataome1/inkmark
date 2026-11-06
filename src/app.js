/* global Vditor, TextUtils, Finder, ExportHtml */
'use strict';

const api = window.inkmark;
const CDN = new URL('vendor/vditor', location.href).href.replace(/\/$/, '');
const $ = (sel) => document.querySelector(sel);
const editorEl = $('#editor');

const state = {
  path: null, // 当前文件路径，未命名为 null
  saved: '', // 最近一次保存/打开时的内容，用于判断 dirty
  dirty: false,
  settings: null,
  focus: false,
  typewriter: false,
};
let vditor;

// ---------------------------------------------------------------- 工具函数

const basename = (p) => p.split(/[\\/]/).pop();
const dirname = (p) => p.replace(/[\\/][^\\/]*$/, '');
const docName = () => (state.path ? basename(state.path) : '未命名');
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

const modeElement = () => vditor.vditor[vditor.getCurrentMode()].element;

// ---------------------------------------------------------------- 文档状态（FR-005/006）

function updateTitle() {
  api.setTitle(`${state.dirty ? '• ' : ''}${docName()} - Inkmark`);
}

function refreshDirty() {
  const dirty = vditor.getValue() !== state.saved;
  if (dirty !== state.dirty) {
    state.dirty = dirty;
    updateTitle();
  }
}

const refreshPanels = debounce(() => {
  const md = vditor.getValue();
  const { words, chars } = TextUtils.countWords(md);
  $('#status-count').textContent = `${words} 词 · ${chars} 字符`;
  renderOutline(md);
}, 250);

function onChange() {
  refreshDirty();
  refreshPanels();
  findStale = true;
}

// 相对路径图片按文档目录解析（FR-011）；后端打开/保存文档时已授权该目录给 asset 协议
function applyLinkBase() {
  vditor.vditor.lute.SetLinkBase(state.path ? api.toAssetUrl(dirname(state.path)) + '/' : '');
}

// 以 file:/// 绝对地址引用的本地图片（如未保存文档中粘贴的图片）：页面无法直接加载，
// 只在显示时改写为 asset 地址，不改动 Markdown 文本
async function showFileImage(img) {
  const src = img.getAttribute('src') || '';
  if (!src.startsWith('file:')) return;
  const path = decodeURIComponent(new URL(src).pathname).replace(/^\/([A-Za-z]:)/, '$1');
  try {
    await api.allowImage(path);
    img.src = api.toAssetUrl(path);
  } catch {
    // 非图片或无法访问：保持原样
  }
}
new MutationObserver((records) => {
  for (const r of records) {
    for (const n of r.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.tagName === 'IMG') showFileImage(n);
      else n.querySelectorAll('img[src^="file:"]').forEach(showFileImage);
    }
  }
}).observe(editorEl, { childList: true, subtree: true });

function loadDoc(doc) {
  state.path = doc ? doc.path : null;
  applyLinkBase();
  vditor.setValue(doc ? doc.content : '', true);
  state.saved = vditor.getValue();
  state.dirty = false;
  updateTitle();
  refreshPanels();
  highlightTreeCurrent();
  vditor.focus();
  modeElement().scrollTop = 0;
}

async function save(as = false) {
  const content = vditor.getValue();
  const suggested = state.path || '未命名.md';
  const p = as ? await api.saveAs(content, suggested) : await api.saveFile(state.path, content);
  if (!p) return false;
  if (p !== state.path) {
    state.path = p;
    applyLinkBase();
    highlightTreeCurrent();
  }
  state.saved = content;
  state.dirty = true; // 强制 refreshDirty 发出更新
  refreshDirty();
  updateTitle();
  return true;
}

/** 返回 true 表示可以继续丢弃当前文档（宪章 IV） */
async function confirmLeave() {
  refreshDirty();
  if (!state.dirty) return true;
  const choice = await api.confirmDiscard(docName());
  if (choice === 'save') return save();
  return choice === 'discard';
}

async function openPath(p) {
  if (p === state.path) return;
  let doc;
  try {
    doc = await api.readFile(p);
  } catch {
    alert(`无法打开文件：\n${p}`);
    const recent = state.settings.recent.filter((r) => r !== p);
    state.settings = await api.setSettings({ recent });
    return;
  }
  if (await confirmLeave()) loadDoc(doc);
}

// ---------------------------------------------------------------- 排版命令（FR-012）

// 隐藏的 Vditor 工具栏按钮；hotkey 置空，快捷键统一由本文件分发，避免重复触发
const TOOLBAR = ['bold', 'italic', 'strike', 'line', 'quote', 'list', 'ordered-list', 'check', 'code', 'inline-code', 'link', 'table'];

function clickToolbar(name) {
  vditor.vditor.toolbar.elements[name].children[0].dispatchEvent(new CustomEvent('click'));
}

function sendEditorKey(code) {
  modeElement().dispatchEvent(new KeyboardEvent('keydown', { code, ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
}

function setParagraph() {
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const node = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
  const block = node.closest('[data-block="0"]');
  const marker = block && block.querySelector('.vditor-ir__marker--heading, [data-type="heading-marker"]');
  if (!marker) return;
  marker.textContent = '';
  modeElement().dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
}

const FORMAT = {
  heading: (n) => sendEditorKey(`Digit${n}`),
  paragraph: setParagraph,
  underline: () => vditor.updateValue(`<u>${vditor.getSelection()}</u>`),
  'math-block': () => vditor.insertValue('\n$$\n\n$$\n'),
  'code-block': () => clickToolbar('code'),
  ...Object.fromEntries(TOOLBAR.map((name) => [name, () => clickToolbar(name)])),
};

// ---------------------------------------------------------------- 视图命令

function applySidebar() {
  const { visible, tab } = state.settings.sidebar;
  $('#app').classList.toggle('no-sidebar', !visible);
  document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  $('#pane-files').classList.toggle('active', tab === 'files');
  $('#pane-outline').classList.toggle('active', tab === 'outline');
}

async function setSidebar(patch) {
  state.settings = await api.setSettings({ sidebar: { ...state.settings.sidebar, ...patch } });
  applySidebar();
}

function updateStatus() {
  $('#status-mode').textContent = vditor.getCurrentMode() === 'sv' ? '源代码模式' : '即时渲染';
  $('#status-flags').textContent = [state.focus && '专注', state.typewriter && '打字机'].filter(Boolean).join(' · ');
  editorEl.classList.toggle('focus-mode', state.focus);
  editorEl.classList.toggle('typewriter-mode', state.typewriter);
}

function toggleSourceMode() {
  sendEditorKey(vditor.getCurrentMode() === 'sv' ? 'Digit8' : 'Digit9');
  updateStatus();
  vditor.focus();
}

// 主题跟随窗口主题（platform.js 中 setTheme 修改后，prefers-color-scheme 随之变化）
const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const themeNames = () => (darkQuery.matches ? ['dark', 'dark', 'github-dark'] : ['classic', 'light', 'github']);
function applyTheme() {
  vditor.setTheme(...themeNames());
}
darkQuery.addEventListener('change', applyTheme);

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
  const el = modeElement();
  if (vditor.getCurrentMode() === 'ir') {
    const target = el.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6')[i];
    if (target) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else {
    const total = vditor.getValue().split('\n').length;
    getScroller(el).scrollTop = (headings[i].line / total) * el.scrollHeight;
  }
}

// ---------------------------------------------------------------- 文件树（FR-007）

async function showFolder(folder) {
  $('#folder-name').textContent = basename(folder);
  $('#folder-name').title = folder;
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
      row.append(icon, e.name);
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

function highlightTreeCurrent() {
  document.querySelectorAll('#tree .row').forEach((r) => r.classList.toggle('current', r.dataset.path === state.path));
}

// ---------------------------------------------------------------- 专注 / 打字机（FR-008）

function getScroller(el) {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    const { overflowY } = getComputedStyle(n);
    if ((overflowY === 'auto' || overflowY === 'scroll') && n.scrollHeight > n.clientHeight) return n;
  }
  return el;
}

function currentBlock() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const root = modeElement();
  let n = sel.anchorNode;
  while (n && n.parentNode !== root) n = n.parentNode;
  return n && n.nodeType === 1 ? n : null;
}

function onCaretMove() {
  if (!vditor || !modeElement().contains(getSelection().anchorNode)) return;
  if (state.focus) {
    const block = currentBlock();
    modeElement()
      .querySelectorAll(':scope > .im-active')
      .forEach((b) => b !== block && b.classList.remove('im-active'));
    if (block) block.classList.add('im-active');
  }
  if (state.typewriter) {
    const sel = getSelection();
    let rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect.height) rect = (currentBlock() || modeElement()).getBoundingClientRect();
    const scroller = getScroller(modeElement());
    const box = scroller.getBoundingClientRect();
    scroller.scrollTop += rect.top - (box.top + scroller.clientHeight / 2);
  }
}
document.addEventListener('selectionchange', onCaretMove);

// ---------------------------------------------------------------- 查找替换（FR-013）

const findbar = $('#findbar');
const findInput = $('#find-input');
const replaceInput = $('#replace-input');

let findStale = false; // 查找后文档被修改，匹配位置需要重新计算

function showFindResult({ active, total }) {
  $('#find-count').textContent = !findInput.value ? '' : total ? `${active}/${total}` : '无结果';
}

function runFind() {
  findStale = false;
  showFindResult(Finder.search(modeElement(), findInput.value));
}

function showFindbar(withReplace) {
  findbar.hidden = false;
  findbar.classList.toggle('with-replace', withReplace);
  const selected = vditor.getSelection();
  if (selected && !selected.includes('\n')) findInput.value = selected;
  findInput.focus();
  findInput.select();
  runFind();
}

function hideFindbar() {
  findbar.hidden = true;
  Finder.clear();
  $('#find-count').textContent = '';
  vditor.focus();
}

function findStep(forward) {
  if (findStale) runFind();
  else showFindResult(Finder.step(forward));
}

findInput.addEventListener('input', runFind);
findInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') findStep(!e.shiftKey);
});
$('#find-next').addEventListener('click', () => findStep(true));
$('#find-prev').addEventListener('click', () => findStep(false));
$('#find-close').addEventListener('click', hideFindbar);
$('#replace-all').addEventListener('click', () => {
  const q = findInput.value;
  if (!q) return;
  const md = vditor.getValue();
  const n = md.split(q).length - 1;
  if (n) {
    vditor.setValue(md.split(q).join(replaceInput.value));
    onChange();
  }
  Finder.clear();
  $('#find-count').textContent = `已替换 ${n} 处`;
});
findbar.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideFindbar();
});

// ---------------------------------------------------------------- 导出（FR-014）

async function renderForExport() {
  const div = document.createElement('div');
  div.style.cssText = 'position:fixed;left:-10000px;top:0;width:860px';
  document.body.append(div);
  const dark = darkQuery.matches;
  await new Promise((resolve) =>
    Vditor.preview(div, vditor.getValue(), {
      cdn: CDN,
      mode: 'light',
      lang: 'zh_CN',
      // 传入当前主题，避免 preview 覆盖编辑器正在使用的样式
      theme: { current: dark ? 'dark' : 'light', path: `${CDN}/dist/css/content-theme` },
      hljs: { style: dark ? 'github-dark' : 'github' },
      math: { engine: 'KaTeX' },
      markdown: { toc: true, footnotes: true, mark: true },
      after: resolve,
    }),
  );
  await new Promise((r) => setTimeout(r, 500)); // 等待 mermaid 等异步渲染完成
  const body = div.innerHTML;
  div.remove();
  return body;
}

async function exportAs(kind) {
  const name = state.path ? basename(state.path).replace(/\.\w+$/, '') : '未命名';
  const defaultPath = (state.path ? dirname(state.path) + '\\' : '') + `${name}.${kind}`;
  const body = await renderForExport();
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

const COMMANDS = {
  new: async () => (await confirmLeave()) && loadDoc(null),
  open: async () => {
    const doc = await api.openDialog();
    if (doc && (await confirmLeave())) loadDoc(doc);
  },
  'open-path': openPath,
  'open-folder': async () => {
    const folder = await api.openFolderDialog();
    if (!folder) return;
    await showFolder(folder);
    await setSidebar({ visible: true, tab: 'files' });
  },
  'clear-recent': async () => (state.settings = await api.setSettings({ recent: [] })),
  save: () => save(false),
  'save-as': () => save(true),
  'export-html': () => exportAs('html'),
  'export-pdf': () => exportAs('pdf'),
  find: () => showFindbar(false),
  replace: () => showFindbar(true),
  'source-mode': toggleSourceMode,
  'toggle-sidebar': () => setSidebar({ visible: !state.settings.sidebar.visible }),
  'sidebar-outline': () => setSidebar({ visible: true, tab: 'outline' }),
  'sidebar-files': () => setSidebar({ visible: true, tab: 'files' }),
  'focus-mode': () => {
    state.focus = !state.focus;
    updateStatus();
    onCaretMove();
  },
  'typewriter-mode': () => {
    state.typewriter = !state.typewriter;
    updateStatus();
    onCaretMove();
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

function run(cmd, arg) {
  if (!vditor) return;
  if (FORMAT[cmd]) {
    if (!modeElement().contains(getSelection().anchorNode)) vditor.focus();
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
  'Ctrl+Shift+Minus': ['line'],
  'Ctrl+Slash': ['source-mode'],
  'Ctrl+Shift+KeyL': ['toggle-sidebar'],
  'Ctrl+Shift+Digit1': ['sidebar-outline'],
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
    if (!hit || !vditor) return;
    if (FORMAT[hit[0]] && !modeElement().contains(e.target)) return;
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
    const a = e.target.closest('[data-type="a"]');
    const url = a && a.querySelector('.vditor-ir__marker--link')?.textContent.trim();
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
  if (type !== 'drop' || !paths?.length || !vditor) return;
  const md = paths.find(isMarkdownPath);
  if (md) return openPath(md);
  for (const p of paths) {
    try {
      const src = await api.saveImageFromPath(state.path, p);
      const url = src.startsWith('file:') ? src : encodeURI(src);
      vditor.insertValue(`![${basename(p).replace(/\.\w+$/, '')}](${url})\n`);
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
    vditor.insertValue(`![${file.name.replace(/\.\w+$/, '')}](${url})\n`);
  }
  return null;
}

// ---------------------------------------------------------------- 启动

document.querySelectorAll('.sidebar-tabs button').forEach((b) => b.addEventListener('click', () => setSidebar({ tab: b.dataset.tab })));
$('#open-folder').addEventListener('click', () => run('open-folder'));
api.onCommand(({ cmd, arg }) => run(cmd, arg));
api.onOpenFile((p) => run('open-path', p));
api.onCloseRequested(async (e) => {
  if (!(await confirmLeave())) e.preventDefault();
});

(async () => {
  state.settings = await api.getSettings();
  applySidebar();
  if (state.settings.folder) showFolder(state.settings.folder);

  const [uiTheme, contentTheme, codeTheme] = themeNames();
  vditor = new Vditor('editor', {
    mode: 'ir',
    theme: uiTheme,
    cdn: CDN,
    lang: 'zh_CN',
    height: '100%',
    placeholder: '开始写作…',
    cache: { enable: false },
    toolbar: TOOLBAR.map((name) => ({ name, hotkey: '' })),
    toolbarConfig: { hide: true },
    outline: { enable: false },
    counter: { enable: false },
    preview: {
      mode: 'editor',
      math: { engine: 'KaTeX' },
      hljs: { lineNumber: false, style: codeTheme },
      theme: { current: contentTheme },
      markdown: { toc: true, footnotes: true, mark: true },
    },
    upload: { accept: 'image/*', multiple: true, handler: uploadImages },
    input: onChange,
    after: async () => {
      const lute = vditor.vditor.lute;
      for (const name of ['VditorIRDOM2Md', 'SpinVditorIRDOM', 'VditorIRDOM2HTML']) {
        const fn = lute[name].bind(lute);
        lute[name] = (html) => fn(TextUtils.escapeTableCodePipes(html));
      }
      applyTheme();
      updateStatus();
      const initial = await api.appReady();
      if (initial) {
        loadDoc(null);
        openPath(initial);
      } else {
        loadDoc(null);
      }
    },
  });
})();
