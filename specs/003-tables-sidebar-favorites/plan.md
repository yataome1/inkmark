# 实施计划：表格编辑、可调整宽度的侧边栏、收藏夹

**分支**: `003-tables-sidebar-favorites` | **规格**: [spec.md](spec.md)

## 摘要
三项功能都以前端为主，后端只增加一个路径状态查询命令和菜单项。表格操作建立在 CodeMirror 之上：从语法树取当前表格的源码，用纯函数完成增删、移动、对齐、调整大小并按列对齐排版，再用一个事务只替换这张表格的文字。CodeMirror 只重绘改动的部分，其他内容的 DOM 不受影响（FR-216），撤销由编辑器历史完成。

## 调研结论
| 问题 | 结论 | 依据 |
|---|---|---|
| Typora 表格功能 | 工具条（调整大小网格、对齐）、右键菜单增删行列、`Ctrl+Enter` 下方插入行、`Ctrl+Shift+Backspace` 删除行、拖动行/列移动 | support.typora.io/Table-Editing |
| 只更新当前表格 | 一个事务替换表格区间，其他块的小部件因内容相同被 CodeMirror 复用 | 规格 005 原型：单元格修改 6.9ms、其他块 45/45 不变 |
| 单元格内容 | 拆分按未转义的 `|`，与 GFM 和编辑器语法树一致；行内代码里的 `|` 也必须写成 `\|` | 规格 004 |
| 页面内拖放 | Tauri 在 Windows 上接管文件拖放，HTML5 拖放失效 | 002 |
| → 拖动排序 | 收藏排序与表格行列拖动统一用 Pointer Events | |

## 技术上下文
| 项 | 选择 |
|---|---|
| 涉及进程 | 前端为主；Rust 增加 `path_info` 命令与菜单项 |
| 新增依赖 | 无（NFR-201） |
| 测试 | `node --test`：表格变换纯函数；`cargo test`：`path_info`、设置默认值；CDP 驱动验收 |

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 图标用字符 |
| III Markdown 唯一真相 | ✅ 表格操作直接生成标准 GFM；对齐写入分隔行 |
| IV 不丢数据 | ✅ 表格操作一步撤销；打开收藏文件走 `confirmLeave()` |
| V 安全默认 | ✅ `path_info` 只返回是否存在、是否目录；不新增权限 |
| VI 简单 | ✅ 收藏不分组、不改名；表格只有一套变换逻辑 |
| VII 轻量 | ✅ 无依赖，源码约 30KB |

## 变更文件
```
src/
├── table-utils.js   新：表格 Markdown 解析/变换/排版纯函数
├── table.js         新：应用表格操作、工具条、尺寸选择器、右键菜单项、行列拖动
├── contextmenu.js   新：通用右键菜单（表格、文件树、收藏共用）
├── resizer.js       新：侧边栏分割线
├── favorites.js     新：收藏列表、排序、增删
├── live-preview.js  改：表格小部件接入工具条、右键菜单、键盘
├── editor.js        改：Ctrl+T 改为尺寸选择器
├── app.js           改：接入以上模块；KEYMAP；文件树行增加 ☆
├── index.html       改：收藏页、分割线、脚本引用
├── platform.js      改：pathInfo
└── styles.css       改：新组件样式
src-tauri/src/
├── lib.rs、fileops.rs  改：path_info
├── settings.rs         改：默认值 favorites、sidebar.width
└── menu.rs             改：收藏当前文件、视图 → 收藏
test/table-utils.test.js  新
```

## 设计要点

### 表格
**模型**：`{ prefix, align: ('left'|'center'|'right'|null)[], rows: string[][] }`，`rows[0]` 为表头；`prefix` 为每行共同前缀（引用块 `> `、列表缩进）。

**纯函数**：`parseTable(md)`、`formatTable(model)`（按显示宽度对齐，中日韩计 2；分隔行写对齐冒号）、`insertRow`、`deleteRow`、`moveRow`、`insertCol`、`deleteCol`、`moveCol`、`setAlign`、`resize`、`createTable`。约束（FR-207）：表头不可删除或下移；至少 1 行数据、1 列。

**应用**（`table.js` 的 `applyTableEdit(view, tableEl, transform, target)`）：由 `view.posAtDOM` 和语法树定位 Table 节点 → `parseTable` → `transform` → `formatTable` → 一个带 `isolateHistory` 的事务替换该区间 → 小部件重建后聚焦目标单元格。删除表格时删去该区间。

**界面**：工具条绝对定位在表格上方，单元格获得焦点时显示；尺寸选择器为 10×10 网格加行列数输入框，`Enter` 确认、`Esc` 取消，插入与调整大小共用；拖动手柄用 Pointer Events，指示线显示插入位置。快捷键写在 `app.js` 的 `KEYMAP`，仅焦点在单元格内时处理；`Tab` 在单元格间移动，最后一格新增一行。

### 右键菜单（`contextmenu.js`）
`ContextMenu.show(x, y, items)`，`items`：`{ label, shortcut?, disabled?, action }` 或 `'-'`；键盘 `↑↓ Enter Esc`；点击外部、滚动、窗口失焦时关闭；不超出窗口边界。只在表格单元格、文件树、收藏列表上替换系统菜单。

### 侧边栏分割线（`resizer.js`）
`#sidebar` 与 `#main` 之间的 `<div id="resizer" role="separator" aria-orientation="vertical" tabindex="0">`，6px 透明热区内含 2px 线条，悬停 150ms 后高亮。`pointerdown` 后 `setPointerCapture`，拖动期间 `body.resizing`，按帧更新宽度。宽度 < 120px 时实时隐藏，松开时保存为收起并保留原宽度。收起后分割线固定在窗口左边缘。双击复位 260px；`←`/`→` ±16px；`Enter` 切换收起。拖动结束写入 `settings.sidebar = { visible, tab, width }`；窗口缩放时收窄到上限（不写盘）。

### 收藏夹（`favorites.js`）
`settings.favorites = [{ path, dir }]`。每行：图标 + 名称 + 浅色父文件夹名 + 悬停 ×；当前文件高亮；`title` 为完整路径；渲染时用 `path_info` 批量查询，不存在的加 `missing` 类。Pointer Events 拖动（4px 阈值、指示线），键盘 `Alt+↑/↓`。入口：文件树与根文件夹名悬停 ☆/★、右键菜单、“文件”菜单。文件 → `openPath`；文件夹 → `showFolder` + 切到“文件”页 + 保存 `settings.folder`。

### 后端
`path_info(paths: Vec<String>) -> Vec<{ exists, dir }>`。`settings.rs` 默认值增加 `favorites: []`、`sidebar.width: 260`；旧设置文件的 `sidebar` 没有 `width` 时前端回落到 260。

## IPC 契约变更
| 方法 | 方向 | 说明 |
|---|---|---|
| `pathInfo(paths)` → `{exists, dir}[]` | 前端→后端 | 新增 Rust 命令 `path_info` |
| `setFavoriteMenu(favorited, enabled)` | 前端→后端 | 新增 Rust 命令 `set_favorite_menu`：更新“文件”菜单中收藏项的文字与可用状态（US3-4） |
| 菜单命令 `toggle-favorite-current`、`sidebar-favorites` | 后端→前端 | 新增 |

## 风险
| 编号 | 风险 | 应对 |
|---|---|---|
| R1 | 单元格拆分与 lezer 的结果不一致 | 单元测试覆盖转义、行内代码、空单元格；操作前按语法树的列数校验 |
| R2 | 小部件重建后焦点丢失 | 事务后按 (行, 列) 聚焦；验收覆盖每种操作 |
| R3 | 工具条遮挡文档首行的表格 | 上方空间不足时显示在表格下方 |
