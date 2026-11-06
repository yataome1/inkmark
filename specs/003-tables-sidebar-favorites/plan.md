# 实施计划：表格编辑、可调整宽度的侧边栏、收藏夹、点击时内容不跳动

**分支**: `003-tables-sidebar-favorites` | **规格**: [spec.md](spec.md)

## 摘要
三项功能都以前端为主，后端只增加一个路径状态查询命令和菜单项。
表格编辑采用“Markdown 层变换 + 只替换当前表格”：从当前表格的 DOM 取出它的 Markdown，用纯函数完成增删、移动、对齐、调整大小并重新排版，再只把这个表格渲染成新的 DOM 节点替换原节点，记录一次撤销，最后把光标放回目标单元格。文档其他部分的 DOM 不被触碰（FR-216）。所有表格操作共用一套可单元测试的逻辑。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| Typora 表格功能 | 工具条（调整大小网格、对齐）、右键菜单增删行列、`Ctrl+Enter` 下方插入行、`Ctrl+Shift+Backspace` 删除行、拖动行/列边框移动 | support.typora.io/Table-Editing |
| Vditor IR 模式现有表格能力 | 有 `Tab`/`Shift+Tab`/上下键单元格导航；增删行列与对齐只有隐藏快捷键（`⌘=`、`⌘-`、`⇧⌘L` 等），与本应用的缩放、侧边栏快捷键冲突，且没有工具条 | `node_modules/vditor/dist/index.js` 中的 `fixTable` |
| 整篇 `setValue` | 会重建全部 DOM 并重新渲染所有图表；在 1155 行、15 个表格、15 个 Mermaid 图的文档中同步耗时 146ms，之后图表还要异步重绘（闪烁）。**不采用** | 原型实测 |
| 只替换单个表格 | `lute.Md2VditorIRDOM(表格 Markdown)` 生成以 `<table data-type="table">` 为根的片段，`replaceWith` 替换原表格：1ms；随后 `undo.addToUndoStack` 记录撤销（对整篇 HTML 做文本 diff，不重新渲染）：22ms；其他块的 DOM 不变 | 原型实测，同一文档 |
| 单个表格转 Markdown | `lute.VditorIRDOM2Md(table.outerHTML)` 可单独转换一个表格（含引用块中的表格，输出不带 `> ` 前缀）；Lute 输出时已按显示宽度（中日韩计 2）对齐各列 | 原型实测 |
| 往返一致性 | 取表格 Markdown → 原样渲染替换 → 整篇 `getValue()`：除行内代码中的 `\|` 外完全一致。行内代码中的 `\|` 在 Lute 转回 Markdown 时就已丢失转义（与本方案无关，0.2.0 保存时即会损坏，见 spec D-3） | 原型实测 |
| Vditor 撤销机制 | `addToUndoStack` 用 diff-match-patch 记录 HTML 快照差异；`undo`/`redo` 把整篇 `innerHTML` 恢复为快照并重新处理预览块（实测 99ms）。这对所有编辑都如此，不因表格引入 | `Undo.prototype.*`；原型实测撤销、重做均精确恢复 |
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
- `parseTable(md)` / `formatTable(model)`：按未转义且不在行内代码中的 `|` 拆分；`formatTable` 只需输出合法的 GFM 表格并在分隔行写对齐冒号。最终保存的源码由 Lute 序列化，Lute 已按显示宽度对齐各列（满足 US1 场景 11），不重复实现。
- `insertRow(m, at)`、`deleteRow(m, r)`、`moveRow(m, from, to)`、`insertCol(m, at)`、`deleteCol(m, c)`、`moveCol(m, from, to)`、`setAlign(m, c, a)`、`resize(m, rows, cols)`、`createTable(rows, cols)`。
- 约束（FR-207）：表头不可删除/移动到数据行之下以外的位置；至少 1 行数据、1 列。

**取当前表格的 Markdown**：当前单元格 → 所在 `<table>`、行号 r（表头为 0）、列号 c；用 `lute.VditorIRDOM2Md(table.outerHTML)` 只把这个表格转换为 Markdown（不读整篇文档，也就不需要在整篇源码中定位表格）。引用块或列表中的表格同样只转换 `<table>` 本身，前缀由外层块保持，不受影响。

**应用**（`applyTableEdit(table, newModel, target)`）：
1. 若 Vditor 有尚未入栈的输入（`ir.processTimeoutId` 待执行），先清除定时器并 `undo.addToUndoStack`，使“操作前”成为独立的撤销点。
2. `formatTable(newModel)` → `lute.Md2VditorIRDOM()` → 取片段根 `<table>` → `table.replaceWith(新节点)`。
3. 光标放到新表格 (r', c') 单元格内容末尾。
4. `undo.addToUndoStack` 记录操作后状态（一次操作 = 一个撤销步骤）。
5. 调用 `onChange()` 更新未保存标记、大纲与字数（这些只读 Markdown 文本，不触碰 DOM）。
6. 删除表格时用 Lute 渲染的空段落替换 `<table>`。

不调用 `setValue`，不改变滚动位置，其他块的 DOM 节点保持原样。用到的 Vditor 非公开接口：`vditor.vditor.lute.VditorIRDOM2Md`、`lute.Md2VditorIRDOM`、`undo.addToUndoStack`、`ir.processTimeoutId`，均在 3.11.2 中已验证；AGENTS.md 中“Vditor 非公开 API”清单同步补充。

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
| R1 | 单个表格片段的渲染结果与整篇渲染时的结构不同 | 原型已用含粗体、斜体、删除线、行内代码、公式、链接、图片、转义 `\|`、中文的表格及引用块中的表格验证往返一致（行内代码中的 `\|` 除外，属已有缺陷 D-3）；实现时把该用例写入自动化验收 |
| R2 | 依赖 Vditor 非公开接口，升级时可能变化 | 版本已锁定 3.11.2；接口集中封装在 `table.js` 的一个函数中；升级 Vditor 时按 checklist 回归 |
| R3 | 光标恢复位置不准 | 按 (行, 列) 在新表格中定位单元格并放到内容末尾；单元测试覆盖变换后的目标坐标 |
| R4 | 工具条与 Vditor 自身的悬浮元素（如代码块语言选择）重叠 | 工具条只在表格内显示，`z-index` 低于 Vditor 弹出层 |
| R5 | 补偿与 Vditor 自身的滚动（如 `scrollCenter`）相互抵消或抖动 | 补偿只在点击后 300ms 内、按帧进行；实测逐帧位置，若出现来回抖动则改为只在布局稳定后补偿一次 |
| R6 | 锚点元素在展开时被 Vditor 替换 | 按点击坐标在新 DOM 中重新取元素；取不到则结束补偿，退化为 0.2.0 行为 |
