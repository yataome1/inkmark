const { Menu, shell, dialog, app } = require('electron');
const path = require('path');

const REPO_URL = 'https://github.com/yataome1/inkmark';

// local: 快捷键由渲染进程处理，菜单只显示（plan.md「快捷键与命令分发」）
function build(win, settings) {
  const send = (cmd, arg) => win.webContents.send('command', { cmd, arg });
  const item = (label, accelerator, cmd, arg, local = true) => ({
    label,
    accelerator,
    registerAccelerator: !local,
    click: () => send(cmd, arg),
  });
  const radio = (label, theme) => ({
    label,
    type: 'radio',
    checked: settings.theme === theme,
    click: () => send('theme', theme),
  });

  const recent = settings.recent.length
    ? [
        ...settings.recent.map((p) => ({ label: p, click: () => send('open-path', p) })),
        { type: 'separator' },
        { label: '清除最近打开', click: () => send('clear-recent') },
      ]
    : [{ label: '（无）', enabled: false }];

  return Menu.buildFromTemplate([
    {
      label: '文件(&F)',
      submenu: [
        item('新建', 'CmdOrCtrl+N', 'new', null, false),
        item('打开…', 'CmdOrCtrl+O', 'open', null, false),
        item('打开文件夹…', 'CmdOrCtrl+Shift+O', 'open-folder', null, false),
        { label: '最近打开', submenu: recent },
        { type: 'separator' },
        item('保存', 'CmdOrCtrl+S', 'save', null, false),
        item('另存为…', 'CmdOrCtrl+Shift+S', 'save-as', null, false),
        { type: 'separator' },
        {
          label: '导出',
          submenu: [item('HTML…', null, 'export-html'), item('PDF…', null, 'export-pdf')],
        },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑(&E)',
      submenu: [
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
        { type: 'separator' },
        item('查找', 'CmdOrCtrl+F', 'find'),
        item('替换', 'CmdOrCtrl+H', 'replace'),
      ],
    },
    {
      label: '段落(&P)',
      submenu: [
        ...[1, 2, 3, 4, 5, 6].map((n) => item(`${n} 级标题`, `CmdOrCtrl+${n}`, 'heading', n)),
        item('段落', 'CmdOrCtrl+0', 'paragraph'),
        { type: 'separator' },
        item('表格', 'CmdOrCtrl+T', 'table'),
        item('代码块', 'CmdOrCtrl+Shift+K', 'code-block'),
        item('公式块', 'CmdOrCtrl+Shift+M', 'math-block'),
        { type: 'separator' },
        item('引用', 'CmdOrCtrl+Shift+Q', 'quote'),
        item('有序列表', 'CmdOrCtrl+Shift+[', 'ordered-list'),
        item('无序列表', 'CmdOrCtrl+Shift+]', 'list'),
        item('任务列表', 'CmdOrCtrl+Shift+X', 'check'),
        { type: 'separator' },
        item('水平分割线', 'CmdOrCtrl+Shift+-', 'line'),
      ],
    },
    {
      label: '格式(&O)',
      submenu: [
        item('加粗', 'CmdOrCtrl+B', 'bold'),
        item('斜体', 'CmdOrCtrl+I', 'italic'),
        item('下划线', 'CmdOrCtrl+U', 'underline'),
        item('删除线', 'Alt+Shift+5', 'strike'),
        item('行内代码', 'CmdOrCtrl+Shift+`', 'inline-code'),
        item('超链接', 'CmdOrCtrl+K', 'link'),
      ],
    },
    {
      label: '视图(&V)',
      submenu: [
        item('源代码模式', 'CmdOrCtrl+/', 'source-mode'),
        { type: 'separator' },
        item('显示/隐藏侧边栏', 'CmdOrCtrl+Shift+L', 'toggle-sidebar'),
        item('大纲', 'CmdOrCtrl+Shift+1', 'sidebar-outline'),
        item('文件树', 'CmdOrCtrl+Shift+3', 'sidebar-files'),
        { type: 'separator' },
        item('专注模式', 'F8', 'focus-mode'),
        item('打字机模式', 'F9', 'typewriter-mode'),
        item('全屏', 'F11', 'fullscreen'),
        { type: 'separator' },
        { label: '放大', role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { label: '缩小', role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { label: '实际大小', role: 'resetZoom', accelerator: 'CmdOrCtrl+Shift+9' },
        { type: 'separator' },
        { label: '开发者工具', role: 'toggleDevTools' },
      ],
    },
    {
      label: '主题(&T)',
      submenu: [radio('跟随系统', 'system'), radio('浅色', 'light'), radio('深色', 'dark')],
    },
    {
      label: '帮助(&H)',
      submenu: [
        { label: 'Markdown 示例文档', click: () => send('open-path', path.join(__dirname, '..', '..', 'resources', 'samples', 'demo.md')) },
        { label: '项目主页', click: () => shell.openExternal(REPO_URL) },
        {
          label: '关于 Inkmark',
          click: () =>
            dialog.showMessageBox(win, {
              title: '关于 Inkmark',
              message: `Inkmark ${app.getVersion()}`,
              detail: `受 Typora 启发的本地 Markdown 查看与编辑器。\nElectron ${process.versions.electron} · Vditor\n${REPO_URL}`,
            }),
        },
      ],
    },
  ]);
}

module.exports = { build };
