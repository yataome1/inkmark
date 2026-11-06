# 实施计划：编辑器内核替换为 CodeMirror 6

**分支**: `006-codemirror-core` | **规格**: [spec.md](spec.md) | **调研**: [005 research.md](../005-editor-core/research.md)

## 摘要
用 CodeMirror 6 替换 Vditor。编辑器状态就是文件原文，即时渲染由装饰（decoration）与小部件（widget）实现，撤销用 CodeMirror 自带的 `history`。导出改用 markdown-it。第三方库在 `npm run vendor` 时由 esbuild 打包为一个全局脚本，`src/` 中的应用代码仍是不经打包的原生 JS。后端与 IPC 不变。

## 技术上下文
| 项 | 选择 |
|---|---|
| 涉及部分 | 前端（编辑器全部重写）、构建脚本；Rust 后端不变 |
| 新增依赖（精确版本） | `@codemirror/state`、`view`、`commands`、`language`、`lang-markdown`、`search`，`@lezer/markdown`，`markdown-it@15.0.3`、`markdown-it-footnote@4.0.0`、`markdown-it-mark@4.0.0`、`markdown-it-task-lists@2.1.1`，`katex@0.19.1`、`mermaid@12.3.0`、`@highlightjs/cdn-assets@11.12.0`；开发依赖 `esbuild@0.28.2` |
| 移除依赖 | `vditor`（含 Lute 4.0MB、flowchart.js） |
| 测试方式 | `node --test` 测纯函数；CDP + 真实输入（SendInput）在 release 构建中验证验收场景 |

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 005 评估 + 本规格 |
| II 离线 | ✅ 全部打包到 `src/vendor/`，运行时无网络请求 |
| III Markdown 唯一真相 | ✅ 编辑器状态即原文，不再有 DOM ↔ Markdown 转换 |
| IV 不丢数据 | ✅ 不改写文件；保留换行符与 BOM；原子写入与 `confirmLeave()` 不变 |
| V 安全默认 | ✅ CSP、权限、导航限制不变；Mermaid 使用 `securityLevel: 'strict'` |
| VI 简单 | ✅ 一个内核替换另一个；不并存两个内核 |
| VII 轻量 | ✅ 内核 4.29MB → 约 0.5MB（另需 markdown-it 约 0.1MB），安装包预计小于 0.2.1 |
| 技术约束“原生 JS、无打包器” | ⚠️ 需修订：第三方库在 vendor 阶段用 esbuild 打包；应用代码仍不打包。宪章 1.1.0 → 1.2.0（MINOR），同步修改 AGENTS.md 第 2、3 节 |

## 变更文件
```
scripts/
├── copy-vditor.mjs      删除
├── vendor.mjs           新：esbuild 打包 CodeMirror 与 markdown-it → vendor/cm.js（IIFE，全局 CM）；
│                        复制 KaTeX（JS、CSS、woff2 字体）、mermaid.min.js、highlight.js 与 github/github-dark 样式
└── vendor-entry.mjs     新：vendor 打包入口，只做 re-export
src/
├── doc-format.js        新（纯函数）：拆分/还原 BOM 与换行符
├── render.js            新：KaTeX、Mermaid（队列 + 按源码缓存）、highlight.js、图片地址解析；编辑器与导出共用
├── live-preview.js      新：即时渲染装饰与小部件（标记显示/隐藏、块展开、表格、图片、公式、图表、TOC、任务列表）
├── anchor.js            新：点击/键盘锚定（FR-606）
├── editor.js            新：创建 EditorView；读写文本、重置历史、源代码模式、格式命令、专注/打字机模式
├── find.js              重写：基于 @codemirror/search 的 SearchQuery，保留现有查找栏界面
├── export.js            修改：Markdown → HTML 改用 markdown-it（+ render.js），其余不变
├── app.js               修改：去掉所有 Vditor 调用，改用 editor.js
├── index.html           修改：脚本与样式引用
└── styles.css           修改：编辑区排版（标题、引用、列表、代码、表格）与深色主题
test/
├── doc-format.test.js   新
└── markdown-html.test.js 新：导出 HTML 的关键语法（脚注、高亮、任务列表、公式、TOC）
.specify/memory/constitution.md、AGENTS.md、README.md、CHANGELOG.md、package.json、Cargo.toml
```

## 设计要点

### 文档读写（US2，FR-602）
- `read_file` 不变（UTF-8 有损解码，BOM 作为 `﻿` 保留在字符串中）。
- `DocFormat.split(text)` → `{ body, bom, eol }`：去掉开头的 `﻿`；文件中出现 `\r\n` 且不存在单独的 `\n` 时 `eol = '\r\n'`，否则 `'\n'`。编辑器只接收 `\n` 换行的 `body`。
- `DocFormat.join(body, { bom, eol })` 保存时还原。
- 脏标记：比较 `view.state.doc` 与载入时的文档（`Text.eq`），不做字符串化。
- 已知限制（规格澄清中注明）：混合换行符的文件统一为占多数的一种；非 UTF-8 文件按 0.2.x 的有损解码处理。

### 撤销（US1，FR-603）
- `history({ newGroupDelay: 500 })`；粘贴、格式命令、替换各为一个事务，自然成为一步。
- 打开文件时用新的 `EditorState` 替换（`view.setState`），历史随之清空。

### 即时渲染（US3，FR-604/605）
- 语法树：`markdown({ base: markdownLanguage, extensions: [数学公式、==高亮==、脚注引用] })`。公式与高亮用 `@lezer/markdown` 的行内/块扩展解析，不用正则。
- **StateField** 计算装饰（块级小部件必须由 StateField 提供），只遍历 `view.visibleRanges` 附近的语法树（长文档性能），文档或选区变化时重算；输入法组合期间（`view.composing`）不重算标记显隐。
- 规则：光标（任一选区）与元素范围相交即“激活”，显示标记；否则用 `Decoration.replace` 隐藏标记，或用小部件替换整个元素。
  | 元素 | 未激活 | 激活 |
  |---|---|---|
  | 标题、强调、删除线、行内代码、高亮、链接 | 隐藏标记，样式用 `Decoration.mark` | 显示标记 |
  | 图片 | 小部件 `<img>` | 源码 + 下方保留图片（D-1） |
  | 行内公式 | KaTeX 小部件 | 源码 + 紧随其后的渲染结果 |
  | 块公式、Mermaid | 块小部件替换整个块 | 源码 + 下方块小部件实时更新（D-1；Mermaid 输入 300ms 防抖） |
  | 代码块 | 隐藏围栏行，highlight.js 着色（`Decoration.mark`） | 显示围栏行 |
  | 表格 | 块小部件 `<table>`，单元格可编辑 | 同左（表格始终按表格显示） |
  | 任务列表 | `[ ]`/`[x]` 替换为可点击复选框 | 显示源码 |
  | 引用、列表、分隔线、脚注、`[TOC]` | 行装饰 / 小部件 | 显示标记 |
  | 行内 HTML（`u`、`sub`、`sup`、`kbd`、`mark`、`br`） | 渲染 | 显示源码；其他 HTML 始终显示源码 |
- **表格单元格编辑**：小部件内 `contenteditable` 单元格，每次 `input` 只把该单元格对应的源码区间替换为新文字（`|` 转义为 `\|`），不重排其他单元格，保证 FR-602。小部件 `updateDOM` 在源码变化来自自身编辑时保留 DOM（不打断光标与输入法）。单元格内的 `Ctrl+Z`/`Ctrl+Y` 转交编辑器的 `undo`/`redo`。结构操作（增删行列）在规格 003 中实现。
- **链接**：`Ctrl+单击` 经 `api.openExternal`（仅 http/https）。
- **源代码模式**：通过 `Compartment` 移除即时渲染扩展，文本与选区不变。
- **主题**：编辑区排版与语法颜色用 CSS 变量，深色/浅色随 `data-theme` 切换。

### 锚定（US4，FR-606）
- 点击：小部件 `mousedown` 时记录小部件的屏幕 `top`，把光标放进对应源码；用 `view.requestMeasure` 在同一帧的测量阶段读取该小部件（或其源码首行）新位置，在写阶段调整 `scrollTop`，绘制前完成，不出现中间帧。
- 键盘：`ArrowUp/Down/Left/Right`、`Home`、`End` 导致激活块变化时，以按键前光标所在行为锚点，同一机制补偿；之后若光标不可见，用 `EditorView.scrollIntoView(head, { y: 'nearest' })`。
- 输入导致高度变化：以光标所在行为锚点（CodeMirror 默认按视口顶部锚定，此处覆盖）。
- 纯函数 `Anchor.delta(before, after)` 可单测；其余用 CDP 逐帧验证（≤ 2px）。

### 现有功能（US5，FR-608/609）
- `KEYMAP`、菜单与命令表保留，`FORMAT` 改为 `editor.js` 中的命令（包裹/去除标记、行首前缀、插入块），每个命令一个事务。
- 查找替换：`SearchQuery` + `SearchCursor` 计算匹配，用 CodeMirror 的选区与装饰高亮，替换一个/全部各为一个事务；源代码模式同样可用。
- 大纲跳转：按行号精确滚动（不再按比例估算）。
- 专注模式：对非当前块加淡化的行装饰；打字机模式：选区变化后 `scrollIntoView(head, { y: 'center' })`。
- 图片粘贴/拖入：沿用 `api.saveImage` / `saveImageFromPath`，插入为一个事务；图片显示仍经 asset 协议授权目录。
- 导出：`markdown-it` + 脚注/高亮/任务列表插件；公式、代码高亮、Mermaid 用 `render.js`，`[TOC]` 由标题生成；其余（内联 CSS、KaTeX 字体、PDF）沿用 0.2.1。
- 字数、标题栏、最近文件、文件树、主题、缩放、全屏：改为从 `editor.js` 取文本，逻辑不变。

## IPC 契约变更
无。

## 体积影响（估算，实施后实测）
| 项 | 0.2.1 | 0.3.0 |
|---|---|---|
| 编辑内核 | Vditor 0.29MB + Lute 4.0MB + flowchart 0.13MB | CodeMirror 约 0.5MB + markdown-it 约 0.1MB |
| KaTeX、Mermaid、highlight.js | 由 Vditor 附带 | 直接取自各自的包，版本可能更新 |

## 风险
- **R1 即时渲染工作量**：元素种类多，各自有边界情况。应对：按元素逐个实现并用 demo.md 与长文档回归；规格 005 原型已验证主要难点（块小部件、表格单元格、锚定）。
- **R2 中文输入法**：装饰在组合期间变化会打断输入。应对：组合期间不重算标记显隐；在 WebView2 中用微软拼音实测（场景 3-8）。
- **R3 表格小部件内编辑**：选区跨单元格、复制粘贴、撤销路由。应对：单元格内操作只限纯文本；粘贴取纯文本并去掉换行；撤销转交编辑器。
- **R4 Mermaid 版本变化**：从 Vditor 附带的版本换为 12.3.0，渲染样式可能不同。应对：demo.md 与长文档目视对比；导出同样使用新版本。
- **R5 长文档性能**：语法树解析为增量；装饰只算可视区域；Mermaid 只渲染可视区域并按源码缓存。用 NFR-601 实测。
