# 实施计划：Inkmark MVP

**分支**: `001-inkmark-mvp` | **规格**: [spec.md](spec.md)

## 摘要
Electron 桌面应用，渲染进程内嵌 Vditor 编辑器（IR 即时渲染 / SV 源码模式），主进程负责文件系统、对话框、菜单、设置持久化与导出；两者通过 preload 暴露的最小 IPC 接口通信。

## 技术上下文
| 项 | 选择 |
|---|---|
| 语言 | JavaScript (ES2022)，CommonJS（主进程）/ 原生 ES 脚本（渲染进程） |
| 运行时 | Electron（最新稳定版），Node 24 |
| 编辑内核 | Vditor 3.11.2（内置 Lute 解析器、KaTeX、Mermaid、highlight.js） |
| 打包 | electron-builder → NSIS x64 安装包 + portable |
| 测试 | `node --test` 覆盖纯函数（字数统计、大纲解析）+ 通过 Chrome DevTools Protocol 驱动运行中应用的验收脚本 + 手动检查清单 |
| 代码规范 | ESLint（flat config）+ Prettier + EditorConfig |
| 目标平台 | Windows 11 x64 |

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ spec → plan → tasks |
| II 离线 | ✅ Vditor `cdn` 指向本地 `node_modules/vditor`，资源随包分发 |
| III Markdown 唯一真相 | ✅ 保存 `vditor.getValue()` 纯文本 |
| IV 不丢数据 | ✅ 关闭/切换确认；临时文件 + rename 原子写入 |
| V 安全默认 | ✅ contextIsolation、sandbox、阻止 will-navigate、setWindowOpenHandler |
| VI 简单 | ✅ 无框架、单窗口 |

## 项目结构
```
inkmark/
├── package.json              # 依赖、脚本与 electron-builder 配置
├── src/
│   ├── main/
│   │   ├── index.js          # 应用生命周期、窗口、单实例、IPC
│   │   ├── menu.js           # 中文应用菜单（Typora 风格快捷键）
│   │   ├── store.js          # settings.json 读写
│   │   ├── fileops.js        # 读写文件、原子保存、目录树、图片保存
│   │   └── export.js         # 导出 HTML 模板（内联 CSS 与 KaTeX 字体）
│   ├── preload/index.js      # contextBridge 暴露 window.inkmark
│   └── renderer/
│       ├── index.html
│       ├── styles.css        # 布局、侧边栏、专注/打字机、主题
│       ├── app.js            # 文档状态、Vditor 初始化、命令分发
│       └── text-utils.js     # 字数统计、大纲解析（纯函数，可测试）
├── build/icon.ico            # 应用图标
├── resources/samples/demo.md # 验收用示例文档（帮助菜单可打开）
├── test/*.test.js            # node --test
└── specs/001-inkmark-mvp/    # 本特性的 SDD 文档
```

## 设计要点

### 文档状态（渲染进程）
`state = { path: string|null, saved: string }`；dirty = `vditor.getValue() !== state.saved`。标题栏由渲染进程通过 `setTitle` 通知主进程更新：`[•] 文件名 - Inkmark`。

### 快捷键与命令分发
- 文件类快捷键（`Ctrl+N/O/S/Shift+S/Shift+O`）由主进程菜单 accelerator 处理。
- 排版与视图快捷键在菜单中只作显示（`registerAccelerator: false`），由渲染进程捕获阶段的 `keydown` 统一处理并 `preventDefault + stopPropagation`，避免与 Vditor 内置快捷键重复触发；点击菜单项则经 IPC `command` 发到渲染进程执行相同命令。
- Vditor 工具栏隐藏（Typora 无工具栏），但保留按钮实例；所有按钮 `hotkey: ""` 关闭默认快捷键。排版命令通过点击隐藏工具栏按钮执行（复用 Vditor 的切换逻辑）；标题通过向编辑区派发 `Ctrl+Alt+DigitN` 键盘事件复用 Vditor 的标题逻辑；下划线、公式块通过 `updateValue/insertValue` 实现。

### 渲染与资源
- `cdn` = 本地 `node_modules/vditor` 的 file URL → 离线。
- 相对图片：打开文件时设置 `lute.SetLinkBase(<文件目录 file URL>/)`，再 `setValue`。

### 侧边栏
- 大纲：由 `text-utils.parseHeadings(markdown)` 解析（跳过代码围栏），IR 模式点击时滚动到编辑区第 N 个标题元素；SV 模式滚动到对应行。
- 文件树：主进程 `listDir(dir)` 返回一层目录（文件夹 + Markdown 文件，忽略隐藏项与 `node_modules`），点击文件夹懒加载展开。

### 专注 / 打字机
- 专注：编辑区加 `focus-mode` 类，CSS 让非当前块 `opacity:.35`；`selectionchange` 时给当前顶层块加 `.im-active`。
- 打字机：`selectionchange`/`input` 时把光标所在 rect 滚动到视口中部；编辑区底部加 50vh padding。

### 查找替换
查找：主进程 `webContents.findInPage`；替换：对 Markdown 源文本做字面量全部替换后 `setValue`（作为一次可撤销修改由 Vditor 记录）。

### 导出
- HTML：渲染进程用 `Vditor.preview` 在离屏容器渲染（数学/图表生成静态 DOM），主进程内联 Vditor、浅色内容主题、highlight.js 样式；文档含公式时内联 KaTeX CSS 并把字体转为 woff2 data URI，保证单文件离线可用。
- PDF：同一 HTML 写入临时目录（引用本地 CSS 文件），隐藏 BrowserWindow 加载后 `printToPDF`。

### IPC 契约（`window.inkmark`）
| 方法 | 方向 | 说明 |
|---|---|---|
| `appReady()` → `string\|null` | R→M | 编辑器就绪后获取启动参数中的文件 |
| `getPathForFile(file)` → `string` | preload | 拖放文件取本地路径（`webUtils`） |
| `onFindResult(cb)` | M→R | 查找结果计数 |
| `openDialog()` → `{path,content}\|null` | R→M | 打开文件对话框 |
| `openFolderDialog()` → `string\|null` | R→M | 选择文件夹 |
| `readFile(path)` → `{path,content}` | R→M | 读取文件，并记入最近文件 |
| `saveFile(path,content)` → `path` | R→M | 原子写入；path 为空时弹另存为 |
| `saveAs(content, suggestedName)` → `path\|null` | R→M | 另存为 |
| `listDir(dir)` → `Entry[]` | R→M | 一层目录 |
| `saveImage(docPath, name, bytes)` → `string` | R→M | 返回插入用路径 |
| `confirmDiscard(name)` → `'save'\|'discard'\|'cancel'` | R→M | 未保存确认 |
| `setTitle(title)` / `setDirty(bool)` | R→M | 标题、关闭拦截依据 |
| `getSettings()` / `setSettings(patch)` | R→M | 设置 |
| `find(text, opts)` / `stopFind()` | R→M | 查找 |
| `exportHtml(html, defaultName)` / `exportPdf(html, defaultName)` | R→M | 导出 |
| `openExternal(url)` | R→M | 系统浏览器打开 http(s) |
| `toggleFullscreen()` | R→M | 全屏 |
| `onCommand(cb)` | M→R | 菜单命令 `{cmd, arg}` |
| `onOpenFile(cb)` | M→R | 单实例/菜单最近文件打开 |
| `onRequestClose(cb)` / `closeConfirmed()` | 双向 | 关闭前确认 |

### 设置持久化
`%APPDATA%/Inkmark/settings.json`：`{ theme, recent[], sidebar:{visible, tab}, folder }`。

## 风险
- Vditor 内部 API（`vditor.vditor.lute`、工具栏元素）非公开接口 → 锁定 3.11.2 版本。
- 未签名安装包触发 SmartScreen → 在 README 说明。
