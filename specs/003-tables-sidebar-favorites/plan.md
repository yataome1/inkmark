# 实施计划：表格编辑、可调整宽度的侧边栏、收藏夹、点击时内容不跳动

**分支**: `003-tables-sidebar-favorites` | **规格**: [spec.md](spec.md)

## 摘要
三项功能都以前端为主，后端只增加一个路径状态查询命令和菜单项。
表格编辑采用“Markdown 层变换”：先定位光标所在表格对应的 Markdown 源码，用纯函数完成增删、移动、对齐、调整大小并重新排版，再 `setValue` 重新渲染，最后把光标放回目标单元格。这样所有表格操作共用一套可单元测试的逻辑，并且自然支持撤销（Vditor 的 `setValue` 会写入撤销栈）。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| Typora 表格功能 | 工具条（调整大小网格、对齐）、右键菜单增删行列、`Ctrl+Enter` 下方插入行、`Ctrl+Shift+Backspace` 删除行、拖动行/列边框移动 | support.typora.io/Table-Editing |
| Vditor IR 模式现有表格能力 | 有 `Tab`/`Shift+Tab`/上下键单元格导航；增删行列与对齐只有隐藏快捷键（`⌘=`、`⌘-`、`⇧⌘L` 等），与本应用的缩放、侧边栏快捷键冲突，且没有工具条 | `node_modules/vditor/dist/index.js` 中的 `fixTable` |
| `setValue` 与撤销 | IR 模式 `setValue` 后执行 `processAfterRender(enableAddUndoStack)`，操作可 `Ctrl+Z` 撤销 | 同上，`Vditor.prototype.setValue` |
| 页面内拖放 | Tauri 在 Windows 上接管文件拖放（`dragDropEnabled`），会使 HTML5 拖放失效；关闭它又会失去拖入文件的路径 | Tauri 文档；002 已依赖其拖放事件 |
| → 拖动排序 | 收藏排序与表格行列拖动统一用 Pointer Events 实现，不用 HTML5 拖放 | |
| 点击跳动的原因 | IR 模式在光标进入块时给块加 `vditor-ir__node--expand` 并在渲染结果上方显示源码；离开时移除。实测 Mermaid 块高度 254px ↔ 355px，滚动位置不变，被点击内容移位约 100px | CDP 逐帧记录 + 真实鼠标点击复现 |
| 浏览器自带的滚动锚定（`overflow-anchor`） | 只补偿视口锚点**上方**的变化，锚点选在视口顶部附近；这里的变化发生在视口中部，不起作用 | |

## 技术上下文
| 项 | 选择 |
|---|---|
| 涉及进程 | 前端为主；Rust 增加 `path_info` 命令与菜单项 |
| 新增依赖 | 无（NFR-201） |
| 测试 | `node --test`：表格 Markdown 变换纯函数；`cargo test`：`path_info`、设置默认值；CDP + `SendInput` 驱动验收 |

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 无网络资源；图标用内联 SVG/字符 |
| III Markdown 唯一真相 | ✅ 表格操作直接生成标准 GFM 表格；对齐写入分隔行，不写 HTML；点击锚定只改滚动位置 |
| IV 不丢数据 | ✅ 表格操作可撤销；点击收藏文件走 `confirmLeave()` |
| V 安全默认 | ✅ `path_info` 只返回是否存在、是否目录，不读内容；不新增权限 |
| VI 简单 | ✅ 收藏不分组、不改名；表格只有一套变换逻辑 |
| VII 轻量 | ✅ 新增约 30KB 源码，无依赖 |

## 变更文件
```
src/
├── table-utils.js        新：表格 Markdown 解析/变换/排版纯函数（可测试）
├── table.js              新：表格工具条、尺寸选择器、右键菜单项、行列拖动、表格快捷键
├── contextmenu.js        新：通用右键菜单组件（表格、文件树、收藏共用）
├── resizer.js            新：侧边栏分割线
├── favorites.js          新：收藏列表渲染、排序、增删
├── anchor.js             新：点击锚定（FR-215）
├── app.js                改：接入以上模块；KEYMAP 增加 Ctrl+Shift+2 与表格快捷键；文件树行增加 ☆
├── index.html            改：收藏页、分割线、脚本引用
├── platform.js           改：pathInfo
└── styles.css            改：新组件样式（深浅主题变量）
src-tauri/src/
├── lib.rs                改：path_info 命令
├── settings.rs           改：默认值 favorites: []、sidebar.width: 260
└── menu.rs               改：“文件 → 收藏当前文件”、“视图 → 收藏 Ctrl+Shift+2”
test/table-utils.test.js  新
```

## 设计要点

### 表格（`table-utils.js` + `table.js`）

**数据模型**：`{ prefix, align: ('left'|'center'|'right'|null)[], rows: string[][] }`，`rows[0]` 为表头；`prefix` 为每行共同前缀（引用块 `> `、列表缩进）。

**纯函数**（全部返回新模型或新文本）：
- `findTables(md)` → `[{ start, end }]`（行号区间），跳过代码围栏；识别“表头行 + 分隔行”。
- `parseTable(lines)` / `formatTable(model)`：按未转义且不在行内代码中的 `|` 拆分；排版时按显示宽度（中日韩、全角字符计 2）补齐，分隔行写对齐冒号。
- `insertRow(m, at)`、`deleteRow(m, r)`、`moveRow(m, from, to)`、`insertCol(m, at)`、`deleteCol(m, c)`、`moveCol(m, from, to)`、`setAlign(m, c, a)`、`resize(m, rows, cols)`、`createTable(rows, cols)`。
- 约束（FR-207）：表头不可删除/移动到数据行之下以外的位置；至少 1 行数据、1 列。

**定位**：当前单元格 → 所在 `<table>` 在 IR 编辑区中的序号 i、行号 r（表头为 0）、列号 c；`findTables(vditor.getValue())[i]` 即对应源码区间。若 IR 中表格数与源码中识别的表格数不一致（异常 Markdown），放弃操作并提示，不修改文档。

**应用**：替换源码区间 → 记录编辑区滚动位置 → `vditor.setValue(newMd)` → 恢复滚动 → 光标放到第 i 个表格的 (r', c') 单元格末尾 → 触发 `onChange()`（dirty、大纲、字数）。

**界面**：
- 工具条：绝对定位在表格上方左侧，随滚动移动；仅 IR 模式且光标在表格内时显示（`selectionchange` 驱动）。
- 尺寸选择器：10×10 网格悬停预览 + 行列数输入框，`Enter` 确认、`Esc` 取消；插入表格与调整大小共用。
- 拖动手柄：悬停单元格时在行左侧、列上方显示；Pointer Events 拖动，指示线显示插入位置，松开时调用 `moveRow`/`moveCol`。
- 快捷键：在 `app.js` 捕获阶段 keydown 中，仅当光标在 IR 表格单元格内才处理 `Ctrl+Enter`、`Ctrl+Shift+Backspace` 与最后单元格的 `Tab`；其余 `Tab` 交给 Vditor。

### 右键菜单（`contextmenu.js`）
`showContextMenu(x, y, items)`，`items`: `{ label, shortcut?, disabled?, action }` 或分隔符；键盘 `↑↓ Enter Esc`；点击外部、滚动、窗口失焦时关闭；不超出窗口边界。只在表格单元格、文件树、收藏列表上替换系统菜单，其他位置保持 WebView2 默认菜单（复制、粘贴等）。

### 侧边栏分割线（`resizer.js`）
- DOM：`#sidebar` 与 `#main` 之间的 `<div id="resizer" role="separator" aria-orientation="vertical" tabindex="0">`，宽 6px 的透明热区，内含 2px 线条；悬停 150ms 后线条显示为强调色，拖动时保持高亮。
- 拖动：`pointerdown` 后 `setPointerCapture`；拖动期间给 `body` 加 `resizing` 类（`cursor: col-resize; user-select: none`），用 `requestAnimationFrame` 节流更新 `#sidebar` 宽度。
- 收起：宽度 < 120px 时实时隐藏侧边栏（再拖回 ≥ 120px 立即恢复），松开时若处于隐藏状态则保存为收起，并保留收起前的宽度用于下次展开。
- 收起后分割线固定在窗口左边缘，仍可向右拖出。
- 双击复位 260px；`←`/`→` ±16px；`Enter` 切换收起。
- 持久化：拖动结束时一次性写入 `settings.sidebar = { visible, tab, width }`；窗口缩放时按新上限收窄（不写盘）。

### 收藏夹（`favorites.js`）
- 存储：`settings.favorites = [{ path, dir }]`，顶层字段整体替换写入（沿用 `set_settings`）。
- 显示：每行 = 图标 + 名称 + 浅色父文件夹名 + 悬停时的 ×；当前文件高亮；`title` 为完整路径。渲染时调用 `path_info` 批量查询是否存在，不存在的项加 `missing` 类。
- 排序：Pointer Events，按下后移动超过 4px 进入拖动；被拖项半透明，按指针 y 坐标计算插入位置并显示指示线；松开后重排并保存。键盘 `Alt+↑/↓`。
- 入口：文件树每行与根文件夹名悬停显示 ☆/★；右键菜单；菜单“文件 → 收藏当前文件”（命令 `toggle-favorite-current`，前端判断当前状态；后端菜单文字固定为“收藏/取消收藏当前文件”）。
- 点击：文件 → `openPath`；文件夹 → `showFolder` + 切换到“文件”页 + 保存为 `settings.folder`。

### 点击锚定（`anchor.js`，FR-215）
- **触发**：编辑区 `pointerdown`（左键），且当前为 IR 模式、未开启打字机模式。
- **选锚点**：`document.elementFromPoint(x, y)` 得到被点击元素；若在块的渲染结果内（`.vditor-ir__preview`、`img`），以该元素为锚点；否则以被点击的文本所在元素为锚点。记录其 `getBoundingClientRect().top`。
- **补偿窗口**：从 `pointerdown` 开始，到 `pointerup` 后 300ms 为止，每帧（`requestAnimationFrame`）比较锚点当前 `top` 与记录值，差值不为 0 时 `scroller.scrollTop += 差值`（浏览器自动截断到可滚动范围）。锚点被移出 DOM（如 Vditor 重新渲染了该块）时，改用同一位置的新元素或结束补偿。
- **不触发**：键盘输入、源代码模式、打字机模式；补偿窗口内一旦发生 `input` 事件立即结束补偿（保证打字时行为与 0.2.0 相同）。
- **不改变**：DOM、光标、选区、撤销栈；只写 `scrollTop`。
- **可测试性**：补偿量计算写成纯函数 `nextScrollTop(scrollTop, anchorTopBefore, anchorTopNow)`；验收用 CDP 逐帧记录锚点位置 + 真实鼠标点击（与本次复现相同的方法）。

### 后端
- `path_info(paths: Vec<String>) -> Vec<{ exists, dir }>`。
- `settings.rs` 默认值增加 `favorites: []`、`sidebar.width: 260`；读取 0.2.0 的设置文件时缺省字段取默认值（已有 merge 逻辑：顶层合并；`sidebar` 为整体对象，前端读取 `width` 时缺省回落到 260）。
- `menu.rs`：“文件”菜单增加“收藏/取消收藏当前文件”；“视图”增加“收藏 Ctrl+Shift+2”。

## IPC 契约变更
| 方法 | 方向 | 说明 |
|---|---|---|
| `pathInfo(paths)` → `{exists, dir}[]` | R→M | 新增 Rust 命令 `path_info` |
| 菜单命令 `toggle-favorite-current`、`sidebar-favorites` | M→R | 新增 |

## 风险
| 编号 | 风险 | 应对 |
|---|---|---|
| R1 | `setValue` 重新渲染整篇文档，长文档或含多个 Mermaid 图时有闪烁/耗时 | 实测 1000 行文档（NFR-202）；超标则改为只替换表格所在块的 DOM（`lute.Md2VditorIRDOM` 渲染片段） |
| R2 | IR DOM 中表格序号与源码表格序号不一致（如 HTML 表格、代码块中的表格） | `findTables` 跳过代码围栏；不一致时放弃操作并提示 |
| R3 | 光标恢复位置不准 | 按 (表格序号, 行, 列) 定位单元格并放到内容末尾；单元测试覆盖变换后的目标坐标 |
| R4 | 工具条与 Vditor 自身的悬浮元素（如代码块语言选择）重叠 | 工具条只在表格内显示，`z-index` 低于 Vditor 弹出层 |
| R5 | 补偿与 Vditor 自身的滚动（如 `scrollCenter`）相互抵消或抖动 | 补偿只在点击后 300ms 内、按帧进行；实测逐帧位置，若出现来回抖动则改为只在布局稳定后补偿一次 |
| R6 | 锚点元素在展开时被 Vditor 替换 | 按点击坐标在新 DOM 中重新取元素；取不到则结束补偿，退化为 0.2.0 行为 |
