# 实施计划：轻量化 —— 迁移到 Tauri 2

**分支**: `002-tauri-migration` | **规格**: [spec.md](spec.md)

## 摘要
把运行时从 Electron（自带 Chromium + Node.js）换成 **Tauri 2**（复用系统 WebView2，后端为 Rust）。渲染进程代码（Vditor 初始化、命令、侧边栏、专注/打字机等）基本原样保留，只把 `window.inkmark` 的实现从 Electron preload 换成 Tauri API 适配层；主进程的约 300 行 JS 改写为约 400 行 Rust。同时只打包需要的 Vditor 资源（约 9.5MB → 压缩后约 3MB）。

## 技术上下文
| 项 | 选择 |
|---|---|
| 运行时 | Tauri 2.x（`@tauri-apps/cli` 2.12.4，Rust crate `tauri` 2.x），WebView2（Win11 内置） |
| 后端语言 | Rust stable 1.99（MSVC）—— 本机已确认可编译链接 |
| 前端 | 原生 JS，无框架、无打包器；通过 `app.withGlobalTauri` 使用 `window.__TAURI__` |
| Tauri 插件 | `dialog`（文件/消息对话框）、`opener`（系统浏览器打开链接）、`single-instance`（单实例） |
| 新增 Rust 依赖 | `serde`/`serde_json`、`dirs`（设置目录）、`webview2-com`（打印为 PDF） |
| 移除依赖 | `electron`、`electron-builder` |
| 打包 | `tauri build` → NSIS x64 安装包（`webviewInstallMode: downloadBootstrapper`）+ 免安装 exe |
| 测试 | `node --test`（text-utils）+ `cargo test`（文件操作）+ 通过 WebView2 远程调试端口（CDP）驱动应用复用 001 的验收脚本 |

### 体积预估
| 部分 | 未压缩 | 安装包内（LZMA） |
|---|---|---|
| Inkmark.exe（Rust + Tauri，release、LTO、strip、`opt-level="s"`） | 约 8MB | 约 3MB |
| 前端（Vditor 精简后：lute 3.8、mermaid 2.5、katex 1.4、highlight.js 1.3、其余 0.5） | 约 9.6MB | 约 3MB |
| NSIS 安装程序与 WebView2 引导器 | — | 约 0.5MB |
| **合计** | | **约 6–7MB（≤ 10MB）** |

前端资源由 Tauri 在编译时压缩嵌入 exe，因此免安装版也是单文件。

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 本 spec/plan/tasks |
| II 离线 | ✅ Vditor 资源嵌入 exe；不访问网络（唯一例外：系统缺 WebView2 时安装程序的引导下载，属系统运行库，非应用运行时） |
| III Markdown 唯一真相 | ✅ 不变 |
| IV 不丢数据 | ✅ 原子写入移到 Rust（写临时文件 + rename）；关闭拦截改用 `onCloseRequested` |
| V 安全默认 | ✅ Tauri capability 最小授权（只开放所需插件命令与自定义命令）；CSP；拦截一切非应用 URL 的导航；本地文件只经 asset 协议按需授权目录访问 |
| VI 简单 | ✅ 不引入前端框架与打包器；插件只用 3 个官方插件 |
| VII 轻量（本次新增） | ✅ 安装包 ≤ 10MB，CI 检查 |

### 宪章修订（1.0.0 → 1.1.0）
- 新增原则 **VII 轻量**：安装包 ≤ 10MB；引入新依赖须说明对体积的影响。
- “技术约束”中的运行时由 Electron 改为 Tauri 2 + WebView2，后端语言为 Rust。

## 项目结构（迁移后）
采用 Tauri 惯例：前端 `src/`，后端 `src-tauri/`。

```
inkmark/
├── src/                          # 前端（原 src/renderer/）
│   ├── index.html
│   ├── styles.css
│   ├── app.js                    # 基本不变
│   ├── text-utils.js             # 不变
│   ├── platform.js               # 新：用 Tauri API 实现 window.inkmark（替代 preload）
│   ├── find.js                   # 新：页内查找（CSS Custom Highlight API）
│   ├── export.js                 # 由主进程移来：组装导出 HTML
│   └── vendor/vditor/            # 构建时由脚本复制的精简 Vditor 资源（gitignore）
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── capabilities/default.json # 最小权限
│   ├── icons/
│   └── src/
│       ├── main.rs               # 入口
│       ├── lib.rs                # Builder、插件、命令注册、导航拦截
│       ├── fileops.rs            # 读、原子写、目录列表、图片保存（含 cargo test）
│       ├── settings.rs           # settings.json 读写
│       ├── menu.rs               # 中文菜单
│       └── pdf.rs                # WebView2 PrintToPdf
├── scripts/copy-vditor.mjs       # 只复制 FR-103 所需的 Vditor 资源
├── resources/samples/            # 不变
├── test/                         # 不变（路径更新）
└── specs/
```
删除：`src/main/`、`src/preload/`、`build/`（图标移入 `src-tauri/icons/`）。

## 设计要点：Electron 能力到 Tauri 的对应

| 0.1.0（Electron） | 0.2.0（Tauri） | 说明 |
|---|---|---|
| preload `window.inkmark` | `src/platform.js` 用 `__TAURI__.core.invoke` 与插件实现**同名同签名**接口 | `app.js` 几乎不用改 |
| fs（读/原子写/列目录/存图片） | 自定义 Rust 命令 `read_file` `save_file` `list_dir` `save_image` | 不使用 `plugin-fs`，避免把文件系统整体暴露给前端 |
| `dialog.showOpenDialog/SaveDialog` | `plugin-dialog` `open` / `save` | |
| 保存/不保存/取消 三按钮对话框 | `plugin-dialog` `message` 的自定义按钮（YesNoCancelCustom） | **风险 R1** |
| 菜单 accelerator / `registerAccelerator:false` | Rust `menu.rs`：文件类命令注册真实快捷键；排版类只在文字后加 `\tCtrl+B` 显示（Windows 菜单约定，不注册） | 快捷键仍由 `app.js` 捕获阶段处理。**风险 R2** |
| 菜单点击 → `command` 事件 | `on_menu_event` → `emit("command", {cmd,arg})` | |
| `requestSingleInstanceLock` | `tauri-plugin-single-instance`，回调中 `emit("open-file", path)` | |
| 命令行参数 / 文件关联 | `std::env::args()`；`bundle.fileAssociations` | |
| `win.on('close')` 拦截 | 前端 `getCurrentWindow().onCloseRequested(e => …)` | 不再需要 `set-dirty`/`close-confirmed` IPC |
| `will-navigate` / `setWindowOpenHandler` | `WebviewWindowBuilder::on_navigation` 只允许应用自身 URL；http(s) 交给 `opener` | |
| `webContents.findInPage` | `src/find.js`：遍历编辑区文本节点，用 CSS Custom Highlight API（`::highlight()`）高亮全部与当前匹配并滚动到位 | WebView2 支持该 API；不会匹配到查找框自身 |
| `printToPDF` | `pdf.rs`：隐藏窗口加载导出 HTML，经 `with_webview` 调 WebView2 `ICoreWebView2_7::PrintToPdf` | **风险 R3** |
| `nativeTheme.themeSource` | `window.setTheme(null/'light'/'dark')`，WebView2 的 `prefers-color-scheme` 随之变化 | **风险 R4** |
| `webUtils.getPathForFile` 拖放 | `onDragDropEvent` 直接给出路径：`.md` 打开；图片走 `save_image_from_path` | Tauri 默认接管文件拖放 |
| 粘贴图片 | 不变：Vditor `upload.handler` → `invoke('save_image', bytes)` | |
| `file://` + `lute.SetLinkBase` 显示相对图片 | Tauri asset 协议：`convertFileSrc(目录)` 作为 linkBase；打开文档时 Rust 端 `asset_protocol_scope().allow_directory(文档目录, true)` 动态授权 | 只授权已打开文档所在目录 |
| 导出 HTML（主进程读 CSS） | `src/export.js` 前端 `fetch` 自身资源（CSS、KaTeX 字体转 base64），经 `save_file` 写盘 | |
| 设置 `%APPDATA%\Inkmark\settings.json` | 同一路径（`dirs::config_dir()/Inkmark`） | 满足 FR-104，无需迁移 |

### Vditor 资源精简（FR-103）
`scripts/copy-vditor.mjs` 在 `tauri dev/build` 前运行（`beforeDevCommand` / `beforeBuildCommand`），只复制：
`dist/index.min.js`、`dist/index.css`、`dist/css/content-theme/{light,dark}.css`、`dist/js/lute/`、`dist/js/i18n/zh_CN.js`、`dist/js/katex/`、`dist/js/mermaid/`、`dist/js/flowchart.js/`、`dist/js/highlight.js/`（仅 `github`、`native` 两个样式）。清单依据：0.1.0 打开 `demo.md` 时实际加载的资源（i18n、lute、内容主题、highlight.js 及其 third-languages、KaTeX 及 mhchem、mermaid），再加按需加载的 flowchart.js。
不复制：mathjax、echarts、graphviz、markmap、abcjs、plantuml、smiles-drawer（0.1.0 本就未启用）。

### 构建优化（Cargo `[profile.release]`）
`opt-level = "s"`、`lto = true`、`codegen-units = 1`、`panic = "abort"`、`strip = true`。

### CI
`ci.yml` 增加 Rust 工具链与 `cargo test`、`cargo clippy -D warnings`；发布任务改用 `tauri build`，并在上传前检查安装包 ≤ 10MB（NFR-101）。

## IPC 契约变更
`window.inkmark` 接口保持不变，以下除外：
| 变更 | 说明 |
|---|---|
| 删除 `setDirty`、`closeConfirmed`、`onRequestClose`、`stopFind`、`onFindResult`、`getPathForFile` | 由前端 `onCloseRequested`、`find.js`、`onDragDropEvent` 直接实现 |
| `find(text, opts)` | 改为前端实现，返回 `{active, total}` |
| 新增 Rust 命令 `save_image_from_path(docPath, srcPath)` | 拖入图片 |
| 新增 Rust 命令 `export_pdf(html, outPath)` | |

## 风险
| 编号 | 风险 | 应对 |
|---|---|---|
| R1 | 插件 dialog 的三按钮自定义文字在 Windows 上表现 | 首个任务做原型验证；不行则 Rust 端用 `rfd` 的 `YesNoCancelCustom` |
| R2 | 菜单 `\t` 快捷键文字在 muda 中被解析为真实快捷键或不显示 | 原型验证；不行则菜单文字中用括号注明快捷键 |
| R3 | WebView2 `PrintToPdf` 需 unsafe COM 调用 | 隔离在 `pdf.rs`；失败则退回 `window.print()`（系统打印对话框选“另存为 PDF”），并在 checklist 记录行为差异 |
| R4 | `setTheme` 未同步到 WebView2 的 `prefers-color-scheme` | 退回到 `<html data-theme>` + CSS 变量与 `vditor.setTheme` 显式切换 |
| R5 | 体积超出预估 | 按体积表逐项测量；必要时 mermaid 改为首次用到时加载（仍为本地） |
| R6 | Vditor 依赖 `file://` 行为的地方在 `http://tauri.localhost` 下不同 | `cdn` 改为 `new URL('vendor/vditor', location.href)`；按 001 清单回归 |
