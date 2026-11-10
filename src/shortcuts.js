// 键盘快捷键列表（specs/009 FR-909）；与 app.js 的 KEYMAP、menu.rs 的一致性由 test/shortcuts.test.js 保证。
(function (root) {
  const groups = [
    {
      group: '文件',
      items: [
        { label: '新建', keys: 'Ctrl+N' },
        { label: '打开', keys: 'Ctrl+O' },
        { label: '打开文件夹', keys: 'Ctrl+Shift+O' },
        { label: '保存', keys: 'Ctrl+S' },
        { label: '另存为', keys: 'Ctrl+Shift+S' },
        { label: '全部保存', keys: 'Ctrl+Alt+S' },
      ],
    },
    {
      group: '标签',
      items: [
        { label: '关闭标签', keys: 'Ctrl+W' },
        { label: '重新打开关闭的标签', keys: 'Ctrl+Shift+T' },
        { label: '下一个标签', keys: 'Ctrl+Tab' },
        { label: '下一个标签', keys: 'Ctrl+PageDown' },
        { label: '上一个标签', keys: 'Ctrl+Shift+Tab' },
        { label: '上一个标签', keys: 'Ctrl+PageUp' },
        { label: '向右移动标签', keys: 'Ctrl+Shift+PageDown' },
        { label: '向左移动标签', keys: 'Ctrl+Shift+PageUp' },
        { label: '跳到第 1–8 个标签', keys: 'Alt+1…8' },
        { label: '跳到最后一个标签', keys: 'Alt+9' },
      ],
    },
    {
      group: '编辑',
      items: [
        { label: '撤销', keys: 'Ctrl+Z' },
        { label: '重做', keys: 'Ctrl+Y' },
        { label: '查找', keys: 'Ctrl+F' },
        { label: '替换', keys: 'Ctrl+H' },
      ],
    },
    {
      group: '段落',
      items: [
        { label: '1–6 级标题', keys: 'Ctrl+1…6' },
        { label: '段落', keys: 'Ctrl+0' },
        { label: '表格', keys: 'Ctrl+T' },
        { label: '代码块', keys: 'Ctrl+Shift+K' },
        { label: '公式块', keys: 'Ctrl+Shift+M' },
        { label: '引用', keys: 'Ctrl+Shift+Q' },
        { label: '有序列表', keys: 'Ctrl+Shift+[' },
        { label: '无序列表', keys: 'Ctrl+Shift+]' },
        { label: '任务列表', keys: 'Ctrl+Shift+X' },
        { label: '水平分割线', keys: 'Ctrl+Shift+-' },
      ],
    },
    {
      group: '格式',
      items: [
        { label: '加粗', keys: 'Ctrl+B' },
        { label: '斜体', keys: 'Ctrl+I' },
        { label: '下划线', keys: 'Ctrl+U' },
        { label: '删除线', keys: 'Alt+Shift+5' },
        { label: '行内代码', keys: 'Ctrl+Shift+`' },
        { label: '超链接', keys: 'Ctrl+K' },
      ],
    },
    {
      group: '表格',
      items: [
        { label: '在下方插入行', keys: 'Ctrl+Enter', where: '单元格内' },
        { label: '删除当前行', keys: 'Ctrl+Shift+Backspace', where: '单元格内' },
      ],
    },
    {
      group: '视图',
      items: [
        { label: '键盘快捷键', keys: 'F1' },
        { label: '源代码模式', keys: 'Ctrl+/' },
        { label: '显示/隐藏侧边栏', keys: 'Ctrl+Shift+L' },
        { label: '大纲', keys: 'Ctrl+Shift+1' },
        { label: '收藏', keys: 'Ctrl+Shift+2' },
        { label: '文件树', keys: 'Ctrl+Shift+3' },
        { label: '专注模式', keys: 'F8' },
        { label: '打字机模式', keys: 'F9' },
        { label: '全屏', keys: 'F11' },
        { label: '放大 / 缩小', keys: 'Ctrl+滚轮' },
        { label: '放大', keys: 'Ctrl+=' },
        { label: '缩小', keys: 'Ctrl+-' },
        { label: '实际大小', keys: 'Ctrl+Shift+9' },
      ],
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = groups;
  else root.SHORTCUTS = groups;
})(this);
