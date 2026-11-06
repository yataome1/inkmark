# 调研记录：阶段 1 原型验证（T101–T104）

**日期**: 2026-11-06 | **环境**: Windows 11 Home 23H2，Rust 1.99.1（MSVC），VS Build Tools 2022，Windows SDK 10.0.26100，WebView2 146
**方法**: 在仓库外建一次性 Tauri 原型（Tauri 2.12.5、wry 0.57、webview2-com 0.39、plugin-dialog 2.8），用 WebView2 远程调试端口（CDP）执行脚本，用 Win32 `SendInput`（带扫描码）模拟真实键盘与鼠标，屏幕截图核对原生菜单与对话框。原型代码不进入仓库。

## 结论汇总

| 风险 | 结论 | 对 plan 的影响 |
|---|---|---|
| R6 Vditor 在 `http://tauri.localhost` 下运行 | ✅ 通过 | 无 |
| R1 三按钮对话框 | ✅ 通过 | 无 |
| R2 菜单快捷键 | ⚠️ 部分通过 | **修改**：所有快捷键（含文件类）都由前端处理，菜单一律只显示 |
| R4 `setTheme` 与 `prefers-color-scheme` | ✅ 通过 | 无 |
| R3 WebView2 `PrintToPdf` | ✅ 通过 | 无 |
| R5 体积 | ✅ 远低于上限 | 更新体积表 |
| — 内存 | ❌ 不优于 0.1.0 | **需决定**：NFR-102 的内存条款 |
| — 0.1.0 缺陷 | 发现 1 个 | 深色代码主题 `native` 不存在 |

## 详细记录

### R6 —— Vditor 资源加载
`cdn = new URL('vendor/vditor', location.href)`。打开 `resources/samples/demo.md`：KaTeX、Mermaid、代码高亮全部渲染。
本地相对图片：Rust 端 `asset_protocol_scope().allow_directory(文档目录, true)` 后，`lute.SetLinkBase(convertFileSrc(目录) + '/')`，图片地址为 `http://asset.localhost/D%3A%5C…/assets/inkmark.png`，正常加载（naturalWidth 256）。需开启 `tauri` 的 `protocol-asset` feature。

### R1 —— 三按钮对话框
`dialog.message(text, { title, kind: 'warning', buttons: { yes: '保存', no: '不保存', cancel: '取消' } })` 显示为标准 Windows 警告对话框，三个中文按钮；分别点击返回 `'保存'`、`'不保存'`、`'取消'`（返回的是按钮文字）。

### R2 —— 菜单快捷键
- 菜单文字写成 `加粗\tCtrl+B`（不设置 accelerator）：Windows 菜单中右对齐显示 `Ctrl+B`，与真实快捷键外观一致；按下 `Ctrl+B` 时页面正常收到按键。✅
- 设置了 accelerator 的 `保存`（`CmdOrCtrl+S`）：WebView2 拥有键盘焦点时，**菜单快捷键不会触发**，按键直接进入页面。点击菜单项则正常触发事件。
- **决定**：菜单中所有条目都只显示快捷键文字、不注册 accelerator；`Ctrl+N/O/S/Shift+S/Shift+O` 并入 `app.js` 的 `KEYMAP` 统一处理。这与 0.1.0 中排版快捷键的处理方式相同，规则更统一。

### R4 —— 主题
`getCurrentWindow().setTheme('light' | 'dark' | null)` 后，页面 `matchMedia('(prefers-color-scheme: dark)')` 依次为 `false`、`true`、跟随系统。`app.js` 现有的主题逻辑可直接复用。需要权限 `core:window:allow-set-theme`。

### R3 —— 打印为 PDF
隐藏窗口以 `WebviewUrl::External(file:///…/export.html)` 加载导出 HTML，`on_page_load(Finished)` 后经 `with_webview` 取 `ICoreWebView2_7`，调用 `PrintToPdf(path, None, handler)`。对 0.1.0 导出的 `demo.html` 生成 150KB PDF，耗时 1.4 秒，标题、列表、表格、代码、公式、图表排版与 0.1.0 一致。
依赖：`webview2-com = "0.39"`（须与 Tauri 所用版本一致）、`windows-core = "0.62"`。

### R5 —— 体积（release，`opt-level="s"`、LTO、strip、`panic="abort"`）
| 产物 | 实测 | 上限 |
|---|---|---|
| NSIS 安装包 | **3.51MB** | 10MB |
| 单文件 exe（内嵌前端资源） | **5.62MB** | 15MB |
| 精简后的 Vditor 资源（未压缩） | 9.17MB | — |

原型只含 3 个命令，完整实现后预计增加不到 1MB。

### 内存（与 NFR-102 冲突）
| 版本 | 状态 | 进程数 | 私有内存合计 |
|---|---|---|---|
| 0.1.0（Electron） | 打开 demo.md | 4 | 353MB |
| 原型（Tauri + WebView2） | 未打开文档 | 7 | 315MB |
| 原型（Tauri + WebView2） | 打开 demo.md，带调试端口 | 7 | 412MB |

WebView2 与 Electron 同为 Chromium 多进程架构，内存主要由渲染内容决定，换框架不会明显降低。spec 中“空闲内存低于 0.1.0”的目标**很可能达不到**。

### 顺带发现的 0.1.0 缺陷
`app.js` 中深色模式的代码高亮主题 `native` 在 Vditor 3.11.2 中不存在（请求 404），导致深色模式下代码块为白底。可用的深色主题为 `github-dark`。002 中修复，并在 `copy-vditor.mjs` 中只复制 `github` 与 `github-dark` 两个样式。

## 决定
1. NFR-102 内存条款（2026-11-06，用户确认）：改为“打开 demo.md 空闲时不高于 0.1.0 的 120%”。
