# 调研：macOS 版本可行性

日期：2026-11-14 | 环境：macOS 15.8（Apple 芯片）、Xcode 26.3、Rust 1.100、Tauri 2.12

## R1 技术框架选择

| 方案 | 体积 | 复用现有代码 | 结论 |
|---|---|---|---|
| **Tauri 2（现有框架），macOS 上使用系统 WKWebView** | 小（见 R2） | 前端 100%；Rust 后端大部分 | **采用** |
| 原生 SwiftUI / AppKit 重写 | 最小 | 0%：编辑器（CodeMirror 即时渲染）、markdown-it、KaTeX、Mermaid 都要重做或嵌入 WebView | 不采用：工作量相当于重写整个项目，且两套代码长期分叉 |
| Electron | 约 100MB+ | 前端可复用 | 不采用：002 已因体积从 Electron 迁走（宪章 VII） |

Tauri 在 macOS 上用系统自带的 WKWebView（Safari 内核），与 Windows 上用系统 WebView2 的思路相同，不需要随包带浏览器内核，所以“小巧”这一目标在 macOS 上同样成立。

## R2 体积实测

方法：在临时目录建一个最小 Tauri 应用，内嵌 Inkmark 完整前端（`src/`，含 `npm run vendor` 产物 8.23MB），依赖与 `src-tauri/Cargo.toml` 相同（去掉 Windows 专用的 `webview2-com`、`windows-core`），沿用相同的 release 体积优化，`tauri build` 生成 `.app` 与 `.dmg`。真实应用多出的 Rust 代码约 3000 行，预计增加不到 1MB。

| 产物 | `.app`（解压后） | 其中可执行文件 | `.dmg`（下载文件） |
|---|---|---|---|
| 仅 Apple 芯片（arm64） | 5.55 MB | 5.5 MB | **3.65 MB** |
| 通用（arm64 + x86_64） | 11.28 MB | 11.2 MB | **7.32 MB** |

结论：

- “安装包 ≤ 10MB”在 macOS 上**适用**。按真实应用多出约 1–2MB 估算，通用 `.dmg` 约 8–9MB，在上限内但余量不大；若只发 Apple 芯片版或分别发两个架构的 `.dmg`，各约 4–5MB。
- 体积大头是内嵌的前端资源（Mermaid、KaTeX 等，与 Windows 版相同）。Tauri 把前端资源编进可执行文件，通用版的可执行文件含两个架构各一份，前端资源也随之存了两份，所以体积正好翻倍。若将来超限，可考虑把前端资源移到 `.app/Contents/Resources` 中只存一份（需在 plan 中评估对安全与离线的影响）。
- 建议：发布一个通用 `.dmg`（用户不必分辨芯片），CI 上限设为 10MB；超出时改为分架构发布。

## R3 现有代码中的 Windows 专用部分

前端（`src/`）没有平台专用 API，全部可复用；需要调整的是路径与快捷键的写法。后端按模块：

| 位置 | Windows 实现 | macOS 需要 | 工作量 |
|---|---|---|---|
| `pdf.rs` 导出 PDF | WebView2 `PrintToPdf` | WKWebView `createPDF` / 打印操作（`objc2` 调用）；分页需单独验证 | 大 |
| `webview.rs` 屏蔽内核默认行为 | WebView2 设置项与剪贴板权限 | WKWebView 默认没有刷新快捷键与“返回”菜单；默认右键菜单可由前端 `contextmenu` 事件屏蔽；逐项复核 014 的排查表 | 中 |
| `clipboard.rs` 复制图片文件 | `CF_HDROP` | `NSPasteboard` 写入文件 URL | 小 |
| `fileops.rs` SHA-256 | Windows CNG `BCryptHash` | 系统 CommonCrypto `CC_SHA256`（同样不引入依赖） | 小 |
| `lib.rs` 打开文件 | 命令行参数 + single-instance 插件 | 访达 / 程序坞打开文件走 Apple 事件（Tauri `RunEvent::Opened`），不经命令行参数 | 中 |
| `lib.rs` 关于信息 | Windows 版本、WebView2 版本 | macOS 版本、WebKit 版本 | 小 |
| `lib.rs` `window.hwnd()` | 剪贴板所有者窗口 | 不需要 | 小 |
| `menu.rs` 菜单 | 窗口内菜单栏 | 屏幕顶部菜单栏，需要“Inkmark”应用菜单与“窗口”菜单 | 中 |
| `settings.rs` 设置位置 | `%APPDATA%\Inkmark` | 代码用 `config_dir()`，在 macOS 上自动为 `~/Library/Application Support/Inkmark`，无需修改 | 无 |
| `main.rs` `windows_subsystem` | 隐藏控制台 | 仅 Windows 生效，无需修改 | 无 |
| `bundled.rs` 路径比较 | 按 `\` 与不区分大小写比较 | 按平台分隔符比较 | 小 |
| `installer-hooks.nsh`、`webviewInstallMode` | NSIS 安装包 | 不适用；macOS 产物为 `.dmg` | 无 |
| `Cargo.toml` | `webview2-com`、`windows-core` 无条件依赖 | 改为 `[target.'cfg(windows)'.dependencies]`，macOS 增加 `objc2` 系列 | 小 |

前端：

| 位置 | 问题 | 处理 |
|---|---|---|
| `app.js` `KEYMAP`、`shortcuts.js`、`menu.rs` 快捷键文字 | 全部以 `Ctrl` 书写，Mac 用户习惯 `⌘` | 在一处按平台把 `Ctrl` 映射为 `⌘`（`metaKey`）；`test/shortcuts.test.js` 的一致性检查扩展到两个平台 |
| `app.js` `dirname` / `resolve` 等 | 用 `\` 拼接路径、判断盘符 | 改为平台无关写法（后端返回分隔符或统一用 `/`） |
| `Ctrl+滚轮` 缩放 | Mac 触控板为双指捏合（WebKit 中表现为 `ctrlKey` 的 wheel 事件） | 验证即可 |
| `F5` `Ctrl+R` `F7` 等内核快捷键（014） | WKWebView 默认不响应 | 验证即可 |

粗略估计：后端约 500–800 行平台代码，前端改动集中在快捷键与路径两处；最大不确定项是 PDF 导出的分页效果。

## R4 现有目标在 macOS 上是否适用

| 宪章 / 目标 | macOS 上 | 说明 |
|---|---|---|
| I 规格先行 | 适用 | 共用 specs |
| II 离线、无遥测 | 适用 | WKWebView 加载本地资源，无网络依赖 |
| III Markdown 为唯一真相 | 适用 | |
| IV 不丢数据 | 适用 | 需额外处理 `⌘Q` 与程序坞“退出”；`fileops::write_atomic` 的 rename 在 APFS 上同样原子 |
| V 安全默认 | 适用 | capability、CSP、禁止导航、asset 协议授权方式相同；macOS 上页面来源是 `tauri://localhost`，CSP 与 `on_navigation` 需核对 |
| VI 简单 | 适用 | |
| VII 轻量：安装包 ≤ 10MB | 适用，见 R2 | “免安装版 ≤ 15MB”在 macOS 上不适用：`.app` 本身就免安装 |
| 目标平台 Windows 10/11 x64 | 需修订 | 增加 macOS |

## R5 签名与公证（发布前必须决定）

- macOS 对下载的应用比 Windows SmartScreen 严格：未签名、未公证的应用首次打开会被拦截，macOS 15 起不能再用“右键 → 打开”绕过，用户须到“系统设置 → 隐私与安全性”点“仍要打开”。
- 正式签名与公证需要 Apple Developer Program 账号（个人 99 美元/年），在 CI 中用证书签名并调用 `notarytool` 公证；Tauri 支持，配置几项环境变量即可。
- 也可以只做免费的“临时签名”（ad-hoc），Apple 芯片要求至少有这一层，Tauri 默认会做；但不能消除上述拦截。
- 建议：先以未公证的形式发布测试版，README 写明打开步骤；用户量上来后再购买开发者账号。

## R6 仓库管理

**建议：继续使用同一个仓库，不新建 repo。**

- 共用部分远多于差异：前端 100%、Rust 后端大部分、全部 specs、使用指南、测试、版本号都相同。
- 分两个仓库，每个新功能要写两遍、评审两遍，规格与行为很快会不一致；修一个 bug 也要两边同步。
- Tauri 本身就是为一套代码多平台设计的：平台差异用 Rust 的 `#[cfg(target_os = "macos")]` 与按平台拆分的模块隔离（如 `pdf.rs` 拆为 `pdf/windows.rs`、`pdf/macos.rs`），前端只在快捷键与路径处判断平台。
- CI 增加一个 `macos-latest` 任务，同一个 `vX.Y.Z` 标签同时产出 Windows 与 macOS 安装文件，发布到同一个 Release。
- 只有选择“原生 Swift 重写”时才值得单独建仓库——R1 已不采用。

## R7 本机开发环境

- 已具备：Xcode 26.3（含命令行工具）、Rust stable 及 `aarch64-apple-darwin` / `x86_64-apple-darwin` 目标、Node 23、npm 依赖。
- macOS 上无法运行 Windows 版的 `cargo clippy` / `cargo test`（`webview2-com` 只能在 Windows 上编译）；完成 `Cargo.toml` 的按平台依赖拆分后，这些检查即可在 Mac 上针对 macOS 运行，Windows 部分由 CI 检查。

## R8 风险原型结果（T1502–T1504）

原型：临时目录中的最小 Tauri 应用（与本仓库相同的 Tauri 2.12.5 / tao 0.37.2 / wry 0.57），直接依赖 `objc2 0.6`、`objc2-foundation`、`objc2-app-kit`、`objc2-web-kit 0.3`；日志写入文件后检查。

### T1503 PDF：`printOperationWithPrintInfo:`

| 做法 | 结果 |
|---|---|
| `NSPrintOperation.runOperation()`（同步） | **不可用**：隐藏窗口中卡住，输出文件持续增长（几秒内超过 270MB），只能强制结束 |
| `runOperationModalForWindow:delegate:didRunSelector:contextInfo:`，隐藏窗口 | **可用**：200 段测试页输出 8 页、30KB；文字可选中，中文正常；CSS 颜色保留；首页截图正常 |
| 同上，可见窗口 | 与隐藏窗口结果完全相同 |

- 纸张不设置时取系统默认（本机区域为 A4：595×842pt，边距 72/72/90/90pt）。WebView2 `PrintToPdf` 不传设置时按其文档为 Letter（8.5×11 英寸）、四边 1cm，与系统区域无关。为不改变 Windows 导出结果（NFR-1504），T1506 只在 macOS 上显式设为 Letter、四边 1cm（28.35pt）；用正式实现在原型中导出同一页面：612×792pt、9 页，代理回调返回成功。与 Windows 导出的逐页对比在 T1521 中进行。
- 完成通知：原型中 `delegate` 传 nil，只能等文件出现。正式实现用 `objc2::define_class!` 定义一个只实现 `printOperationDidRun:success:contextInfo:` 的代理对象，在回调中发送结果，沿用 `pdf/mod.rs` 现有的 60 秒超时。

### T1504 程序坞“退出”：为 tao 应用代理补 `applicationShouldTerminate:`

- tao 的应用代理类为 `TaoAppDelegateParent`，原本没有实现该方法；启动时用 `class_addMethod` 补上成功（已存在时 `class_addMethod` 返回失败，不会覆盖）。
- 主窗口可见时发出退出请求（`NSRunningApplication.terminate()`，与程序坞“退出”、注销时系统发送的请求相同）：方法被调用，返回 `NSTerminateCancel`，程序保持运行，前端收到事件。
- 主窗口已隐藏时：返回 `NSTerminateNow`，程序正常退出（`RunEvent::Exit` 照常触发）。
- 结论：plan 设计要点 3 的方案可行，不需要退路方案。
- 正式实现（T1514）改为以“主窗口是否已由关闭隐藏”判断，而不是窗口是否可见（⌘H、⌘M 后窗口也不可见）。在开发版中验证：有起始页时发出退出请求 → 前端走退出流程、写入会话后退出；关闭窗口后再发出 → 直接退出。

### T1502 按键与菜单快捷键

方法：菜单设真实快捷键（`⌘B` `⌘I` `⌘Z` 为自定义项，剪切、复制、粘贴、全选为系统预定义项）；网页在捕获阶段对 `⌘B` `⌘Z` 调用 `preventDefault`，`⌘I` 不处理。自动发送系统按键需要“辅助功能”权限，因此由程序在自身进程内用 `NSApp.postEvent` 投递按键事件，经过与真实按键相同的 `NSApplication` 分派流程（真实键盘在 T1521 中复核）。

| 按键 | 网页 | 菜单 | 结论 |
|---|---|---|---|
| `⌘B` | 收到并 `preventDefault` | 未触发 | 不重复触发 |
| `⌘Z` | 收到并 `preventDefault` | 未触发 | 不重复触发 |
| `⌘I` | 收到，未处理 | 触发 | 网页不处理的按键交给菜单 |
| `⌘A` `⌘C` `⌘V` | 收到 | 系统预定义项生效 | 全选 0–11、复制、粘贴均正常 |

- 结论：plan 的做法可行——macOS 上菜单设真实快捷键（显示 `⌘` 符号），按键仍由 `KEYMAP` 处理并 `preventDefault`，命令只执行一次。
- 注意：`KEYMAP` 在某些状态下有意不处理的按键（不调用 `preventDefault`）会落到菜单，执行菜单命令。T1508 / T1511 中菜单命令与按键命令须走同一个入口（`COMMANDS`）并带相同的前置判断，这样两条路径结果一致。
