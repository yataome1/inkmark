// 键盘快捷键列表（specs/009 FR-909），逻辑写法（Mod 见 platform-keys.js），显示时按平台转换；与 app.js 的 KEYMAP、menu.rs 的一致性由 test/shortcuts.test.js 保证。
(function (root) {
  const groups = [
    {
      group: '文件',
      items: [
        { label: '新建', keys: 'Mod+N' },
        { label: '打开', keys: 'Mod+O' },
        { label: '打开文件夹', keys: 'Mod+Shift+O' },
        { label: '保存', keys: 'Mod+S' },
        { label: '另存为', keys: 'Mod+Shift+S' },
        { label: '全部保存', keys: 'Mod+Alt+S' },
      ],
    },
    {
      group: '标签',
      items: [
        { label: '关闭标签', keys: 'Mod+W' },
        { label: '重新打开关闭的标签', keys: 'Mod+Shift+T' },
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
        { label: '撤销', keys: 'Mod+Z' },
        { label: '重做', keys: 'Mod+Y' },
        { label: '查找', keys: 'Mod+F' },
        { label: '替换', keys: 'Mod+H' },
      ],
    },
    {
      group: '段落',
      items: [
        { label: '1–6 级标题', keys: 'Mod+1…6' },
        { label: '段落', keys: 'Mod+0' },
        { label: '表格', keys: 'Mod+T' },
        { label: '代码块', keys: 'Mod+Shift+K' },
        { label: '公式块', keys: 'Mod+Shift+M' },
        { label: '引用', keys: 'Mod+Shift+Q' },
        { label: '有序列表', keys: 'Mod+Shift+[' },
        { label: '无序列表', keys: 'Mod+Shift+]' },
        { label: '任务列表', keys: 'Mod+Shift+X' },
        { label: '水平分割线', keys: 'Mod+Shift+-' },
      ],
    },
    {
      group: '格式',
      items: [
        { label: '加粗', keys: 'Mod+B' },
        { label: '斜体', keys: 'Mod+I' },
        { label: '下划线', keys: 'Mod+U' },
        { label: '删除线', keys: 'Alt+Shift+5' },
        { label: '行内代码', keys: 'Mod+Shift+`' },
        { label: '超链接', keys: 'Mod+K' },
      ],
    },
    {
      group: '表格',
      items: [
        { label: '在下方插入行', keys: 'Mod+Enter', where: '单元格内' },
        { label: '删除当前行', keys: 'Mod+Shift+Backspace', where: '单元格内' },
      ],
    },
    {
      group: '视图',
      items: [
        { label: '键盘快捷键', keys: 'F1' },
        { label: '源代码模式', keys: 'Mod+/' },
        { label: '显示/隐藏侧边栏', keys: 'Mod+Shift+L' },
        { label: '大纲', keys: 'Mod+Shift+1' },
        { label: '收藏', keys: 'Mod+Shift+2' },
        { label: '文件树', keys: 'Mod+Shift+3' },
        { label: '专注模式', keys: 'F8' },
        { label: '打字机模式', keys: 'F9' },
        { label: '全屏', keys: 'F11' },
        { label: '放大 / 缩小', keys: 'Mod+滚轮' },
        { label: '放大', keys: 'Mod+=' },
        { label: '缩小', keys: 'Mod+-' },
        { label: '实际大小', keys: 'Mod+Shift+9' },
      ],
    },
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = groups;
  else root.SHORTCUTS = groups;
})(this);
