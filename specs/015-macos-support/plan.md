# 实施计划：macOS 版本

**分支**: `015-macos-support` | **规格**: [spec.md](spec.md) | **调研**: [research.md](research.md)

## 摘要

沿用 Tauri 2，同一套代码同时构建 Windows 与 macOS。前端不分叉，只把“快捷键”和“路径分隔符”两处改为按平台取值；Rust 后端把 Windows 专用代码移入按平台拆分的模块（`#[cfg(windows)]` / `#[cfg(target_os = "macos")]`），macOS 实现直接调用系统框架（通过 Tauri 已间接依赖的 `objc2` 系列），不引入新的第三方库。macOS 上的窗口生命周期按 Mac 习惯处理：关闭窗口只隐藏、程序留在程序坞；退出统一走前端的未保存确认。CI 增加 `macos-latest` 任务，发布同一版本的通用 `.dmg`（≤ 10MB）。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 框架 | 继续 Tauri 2，macOS 使用系统 WKWebView | research.md R1 |
| 体积 | 通用 `.dmg` 原型 7.32MB，加平台代码后预计 8–9MB | research.md R2 |
| 访达打开文件 | 走 Apple 事件，Tauri 以 `RunEvent::Opened { urls }` 交给应用；不经过命令行参数与 single-instance 插件 | `tauri-2.12.5/src/app.rs` |
| 点击程序坞图标 | `RunEvent::Reopen { has_visible_windows }` | 同上 |
| 程序坞“退出”、注销、关机 | tao 0.37 的应用代理没有实现 `applicationShouldTerminate:`，系统直接终止进程，不发 `ExitRequested`，前端来不及询问保存 → 见设计要点“退出” | `tao-0.37.2/src/platform_impl/macos/app_delegate.rs` |
| 菜单快捷键 | Windows 上 WebView2 有焦点时菜单快捷键不触发，所以只显示文字（005 R2）。macOS 的菜单栏是系统菜单，需设真实快捷键才会显示 `⌘` 符号；WKWebView 先把按键交给网页，网页 `preventDefault` 后不再交给菜单 → 快捷键仍统一由 `KEYMAP` 处理，菜单只负责显示与鼠标点击。T1502 原型已确认不会重复触发（research.md R8） | WebKit 按键分派 |
| 剪切、复制、粘贴、全选 | macOS 上 WKWebView 的 `⌘C` `⌘V` 等依赖菜单栏中存在系统预置的编辑菜单项；现有“编辑”菜单已用 `PredefinedMenuItem`，保留即可 | Tauri 文档 |
| 导出 PDF | `WKWebView.createPDF` 只生成一整页长图，不分页；改用 `printOperationWithPrintInfo:`，`NSPrintInfo` 设为保存到文件（`NSPrintJobSavingURL`）、不显示面板，与 WebView2 `PrintToPdf` 一样按打印样式分页。**须在 T1503 原型中确认隐藏窗口可用、分页与 Windows 一致** | `objc2-web-kit 0.3.2` 生成的 `WKWebView.rs` |
| 复制图片文件 | `NSPasteboard.generalPasteboard` 清空后 `writeObjects:` 写入文件 `NSURL` | AppKit |
| SHA-256 | 系统 `libSystem` 中的 CommonCrypto `CC_SHA256`，与 Windows 用 CNG 一样不引入依赖 | — |
| 系统版本 | `NSProcessInfo.operatingSystemVersion`；WebKit 版本由 `tauri::webview_version()` 返回 | — |
| 设置与数据位置 | `config_dir()` / `local_data_dir()` 在 macOS 上为 `~/Library/Application Support`，代码无需修改 | `lib.rs` |
| 页面来源 | macOS 上为 `tauri://localhost`；`on_navigation` 已允许 `tauri` scheme，CSP 中的 `ipc:` `asset:` 写法对两个平台都有效；`http://ipc.localhost` 等只在 Windows 生效，保留无害 | Tauri 文档 |
| 内核默认行为（014） | WKWebView 没有刷新、打印、光标浏览快捷键，没有“返回”菜单；默认右键菜单由 014 的 `edit-menu.js` 在 `contextmenu` 事件中统一 `preventDefault`，在 macOS 上同样生效。`webview.rs` 只在 Windows 编译 | 014 plan |
| `objc2` 版本 | 与 wry 0.57 使用的一致：`objc2 0.6`、`objc2-foundation 0.3`、`objc2-app-kit 0.3`、`objc2-web-kit 0.3`、`block2 0.6`，已在依赖树中，只启用需要的 feature | probe 的 `Cargo.lock` |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端、Rust、构建配置、CI |
| 新增依赖 | 无新的第三方库。macOS 目标下把依赖树中已有的 `objc2` 系列改为直接依赖（只启用所需 feature）；Windows 目标下 `webview2-com`、`windows-core` 改为仅 Windows 依赖。体积影响：macOS 约 +1MB（平台代码），Windows 不变 |
| 测试 | `node --test`：路径函数、快捷键的平台映射与三处一致性（扩展 `shortcuts.test.js`）；`cargo test` 在两个平台各自运行（Windows 专用测试加 `#[cfg(windows)]`）；macOS 上按 001–014 checklist 手动验收，Apple 芯片与 Intel 各一次 |
| 最低系统 | `bundle.macOS.minimumSystemVersion = "12.0"`；Rust 编译 `MACOSX_DEPLOYMENT_TARGET=12.0` |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 015 spec 已批准；宪章已修订至 1.4.0 |
| II 离线 | ✅ 资源仍随包分发；macOS 实现只调用系统框架 |
| III Markdown 唯一真相 | ✅ 不改文件格式；新写入的相对图片路径统一用 `/` |
| IV 不丢数据 | ✅ 关闭窗口、`⌘Q`、程序坞“退出”都先走前端未保存确认（见“退出”）；`write_atomic` 的 rename 在 APFS 上同样原子 |
| V 安全默认 | ✅ capability、CSP、`on_navigation`、asset 授权方式不变；新增的 `hide_main_window`、`quit_app` 不接受路径参数 |
| VI 简单 | ✅ 一套前端、一个 `KEYMAP`；平台差异集中在 `platform-keys` 映射与 Rust 平台模块 |
| VII 轻量 | ✅ 通用 `.dmg` ≤ 10MB，CI 检查；Windows 产物体积不变 |

## 变更文件

```
.specify/memory/constitution.md      改：1.4.0（已完成）
src-tauri/Cargo.toml                 改：按目标拆分依赖；macOS 直接依赖 objc2 系列
src-tauri/tauri.conf.json            改：bundle.targets 改为 "all"（Windows 产出 nsis，macOS 产出 app + dmg）；
                                         增加 macOS 图标 icon.icns、minimumSystemVersion
src-tauri/icons/icon.icns            新：由 scripts/icons.mjs 生成
scripts/icons.mjs                    改：同时生成 .icns
src-tauri/src/sys/mod.rs             新：平台相关函数的统一入口（下列函数两个平台签名相同）
src-tauri/src/sys/windows.rs         新：从 fileops.rs / lib.rs / clipboard.rs 移入 sha256、os_version、put_files
src-tauri/src/sys/macos.rs           新：sha256（CommonCrypto）、os_version、put_files（NSPasteboard）、
                                         install_terminate_hook（见“退出”）
src-tauri/src/clipboard.rs           删：内容移入 sys/windows.rs
src-tauri/src/pdf.rs                 改：拆为 pdf/mod.rs（隐藏窗口加载、超时，两平台共用）、
                                         pdf/windows.rs（PrintToPdf）、pdf/macos.rs（printOperation）
src-tauri/src/webview.rs             改：整体 #[cfg(windows)]
src-tauri/src/menu.rs                改：快捷键改为“逻辑快捷键”，Windows 显示文字、macOS 设真实快捷键；
                                         macOS 增加应用菜单与窗口菜单，“退出”移入应用菜单
src-tauri/src/lib.rs                 改：AppInfo 改为平台无关字段；Opened / Reopen / ExitRequested 处理；
                                         新命令 hide_main_window、quit_app；app_ready 返回值增加 os
src-tauri/src/bundled.rs             改：路径比较按平台（Windows 不区分大小写、macOS 按 `/`）
src-tauri/src/main.rs                不改（windows_subsystem 只在 Windows 生效）
src/platform-keys.js                 新：纯函数——逻辑快捷键 → 当前平台的按键串与显示文字；macOS 例外表
src/text-utils.js                    改：新增 joinPath、dirname、basename、isAbsolutePath（按平台分隔符）
src/app.js                           改：KEYMAP 改用逻辑快捷键（Mod 代替 Ctrl）；keydown 用 platform-keys 匹配；
                                         路径拼接改用 text-utils；macOS 关闭窗口流程；“在资源管理器中显示”文字按平台
src/render.js                        改：resolveImage 支持 `/` 开头的绝对路径与 macOS 的 file: 地址
src/tab-utils.js                     改：normalizePath / pathKey（判断同一文件是否已打开）按平台：
                                         Windows 统一为 `\` 且不区分大小写；macOS 保持 `/`，同样不区分大小写（APFS 默认）
src/image-menu.js、src/favorites.js  改：路径函数改用 text-utils；“在资源管理器中显示”文字按平台
src/shortcuts.js                     改：快捷键列表改用逻辑快捷键，显示时经 platform-keys 转换
src/edit-menu.js、src/table.js、src/tabs.js、src/contextmenu.js
                                     改：菜单中显示的快捷键文字经 platform-keys 转换
src/platform.js                      改：暴露 os、hideWindow、quitApp
src/index.html                       改：引入 platform-keys.js
src/about.js                         改：版本信息显示 macOS / WebKit 版本
resources/samples/使用指南.md         改：macOS 安装（含首次打开放行步骤）与快捷键说明
test/platform-keys.test.js           新
test/shortcuts.test.js               改：一致性检查对 Windows、macOS 各跑一遍
test/text-utils.test.js              改：路径函数两个平台的用例
.github/workflows/ci.yml             改：check 任务改为 windows-latest + macos-latest 矩阵；
                                         release 增加 macOS 任务：通用 dmg、体积 ≤ 10MB 检查、上传到同一 Release
README.md、README.en.md、CONTRIBUTING.md
                                     改：系统要求、macOS 安装与放行步骤、macOS 开发环境（Xcode 命令行工具）
```

## 设计要点

### 1. 快捷键：一份逻辑表，按平台转换（FR-1504、FR-1505）

`KEYMAP`、`shortcuts.js`、`menu.rs` 三处的快捷键改写为“逻辑快捷键”：`Mod` 表示 Windows 的 `Ctrl` / macOS 的 `⌘`，`Ctrl` 表示两个平台上真实的 Control 键。Windows 上 `Mod` → `Ctrl`，结果与现在完全相同（`shortcuts.test.js` 保证）。

macOS 上与系统快捷键冲突或不符合习惯的项，由 `platform-keys.js` 与 `menu.rs` 中同一张例外表替换：

| 命令 | Windows | macOS | 原因 |
|---|---|---|---|
| 替换 | `Ctrl+H` | `⌥⌘F` | `⌘H` 是系统“隐藏” |
| 重做 | `Ctrl+Y` | `⇧⌘Z` | Mac 习惯；CodeMirror 的 `Mod-Shift-z` 已支持 |
| 大纲 / 收藏 / 文件树 | `Ctrl+Shift+1/2/3` | `⌃⌘1/2/3` | `⇧⌘3` `⇧⌘4` `⇧⌘5` 是系统截图 |
| 全屏 | `F11` | `⌃⌘F` | `F11` 是系统“显示桌面” |
| 跳到第 n 个标签 | `Alt+1…9` | `⌃1…9` | `⌥` + 数字在 Mac 上输入特殊字符 |
| 快捷键列表 | `F1` | `⇧⌘/` | Mac“帮助”菜单的习惯 |
| 引用 | `Ctrl+Shift+Q` | `⌥⌘Q` | `⇧⌘Q` 是系统“退出登录” |
| 行内代码 | ``Ctrl+Shift+` `` | ``⌃` `` | ``⇧⌘` `` 是系统切换窗口 |
| 删除线 | `Alt+Shift+5` | ``⌃⇧` `` | `⌥` 加数字在 Mac 上输入特殊字符 |
| 下一个 / 上一个标签 | `Ctrl+Tab` / `Ctrl+Shift+Tab` | `⌃Tab` / `⌃⇧Tab` | 两平台本来都是真实 Control 键，无需替换 |
| 专注模式 / 打字机模式 | `F8` / `F9` | `F8` / `F9` | 与 Typora for Mac 相同；笔记本需按 `fn` |

引用、行内代码、删除线三项在 T1512 的系统快捷键检查中发现冲突后补入（2026-11-15）。其余 `Ctrl+…` 一律映射为 `⌘…`（如 `⌘S`、`⌘/`、`⌘1–6`、`⇧⌘K`）。显示文字在 macOS 上用符号并按 `⌃⌥⇧⌘` 顺序排列（如 `⇧⌘K`）。

- 链接的 `Ctrl+单击` 在 macOS 上为 `⌘+单击`（`⌃+单击` 是系统右键）；表格单元格内的撤销同样按 `⌘`。
- 前端：`keydown` 中按 `e.metaKey`（macOS）或 `e.ctrlKey`（Windows）生成 `Mod`，`e.ctrlKey` 在 macOS 上生成 `Ctrl`，再查 `KEYMAP`。
- `menu.rs`：`i(id, label, "Mod+S")`。Windows：生成现在的 `文字\t快捷键`；macOS：`MenuItemBuilder::accelerator` 设真实快捷键（`CmdOrCtrl+S` 等），系统显示符号。按键仍由前端处理（见调研结论“菜单快捷键”）。
- `shortcuts.test.js`：从 `app.js`、`shortcuts.js`、`menu.rs` 取出逻辑快捷键，分别按 Windows、macOS 规则展开后比较，三处必须一致；另检查 macOS 结果不含系统保留快捷键（`⌘H` `⌘M` `⌘Q` `⌘,` `` ⌘` `` `⇧⌘3/4/5` `⌃⌘Q` `⌘Space`）。

### 2. macOS 菜单栏（FR-1505）

```
Inkmark   关于 Inkmark | 隐藏 Inkmark ⌘H、隐藏其他 ⌥⌘H、全部显示 | 退出 Inkmark ⌘Q
文件      （同 Windows，去掉“退出”）
编辑      撤销 ⌘Z、重做 ⇧⌘Z | 剪切、复制、粘贴、全选（系统预置项）| 查找 ⌘F、替换 ⌥⌘F
段落 / 格式 / 视图 / 主题   （同 Windows，快捷键按上表）
窗口      最小化 ⌘M、缩放（系统预置项）
帮助      （同 Windows：使用指南、快捷键 ⇧⌘/、示例文档、项目主页……；“关于”移到 Inkmark 菜单）
```

- “隐藏”“隐藏其他”“全部显示”“最小化”“缩放”用 `PredefinedMenuItem`。
- “退出 Inkmark”是自定义项（id `quit`），不用系统预置的 quit——预置项直接终止进程，跳过未保存确认。
- 撤销、重做为自定义项，发 `undo` / `redo` 命令；`app.js` 的 `COMMANDS` 增加这两项，调用编辑器的 `undo()` / `redo()`（014 已为右键菜单暴露），保证与编辑器撤销历史一致。
- 菜单标题中的 `(&E)` 等访问键只在 Windows 上加。

### 3. 窗口与退出（FR-1503、FR-1508，宪章 IV）

macOS 上主窗口在程序运行期间一直存在，关闭只是隐藏，避免重建窗口与前端状态：

```
点红色关闭按钮 / ⌘W 关闭最后一个标签后再 ⌘W
  → onCloseRequested（前端）：settleDirty（询问保存）→ writeSession
  → macOS：e.preventDefault()；关闭全部标签、显示起始页；invoke('hide_main_window')
  → Windows：不变（窗口关闭，程序退出）

⌘Q / 菜单“退出 Inkmark”
  → 前端 quit：settleDirty → writeSession → invoke('quit_app') → app.exit(0)
  → 窗口已隐藏时（无文档）直接退出

程序坞“退出” / 注销 / 关机（系统发 terminate:）
  → sys::macos::install_terminate_hook 在启动时为 tao 的应用代理类补上
    applicationShouldTerminate:：主窗口可见时返回 NSTerminateCancel 并向前端发 command quit
    （走上面 ⌘Q 的流程）；窗口已隐藏时返回 NSTerminateNow
  → 若 T1504 原型证明无法可靠安装：退而在 terminate 前同步保存会话（writeSession 的内容由前端
    在每次变更时推送），未保存的修改仍会丢失，须在使用指南中说明并记录 Issue 等待 tao 支持

点击程序坞图标（RunEvent::Reopen）→ 显示并聚焦主窗口
访达打开文件（RunEvent::Opened）
  → 前端未就绪（冷启动）：路径加入 AppState.initial_files，由 app_ready 返回
  → 已就绪：显示并聚焦主窗口，emit open-file（与 Windows 的 single-instance 回调相同）
```

`RunEvent` 在 `Builder::build()` 后的 `.run(|app, event| …)` 中处理，`Opened` 的 `file://` URL 用 `to_file_path()` 转换，复用 `files_from_args` 的“只保留存在的 Markdown 文件”过滤。

### 4. 路径（FR-1501，边界情况）

- `text-utils.js` 新增按平台分隔符的 `joinPath(dir, name)`、`dirname`、`basename`、`isAbsolutePath`（Windows：盘符或 `\\`；macOS：`/` 开头）；`app.js`、`render.js`、`favorites.js`、`image-menu.js` 中手写的 `'\\'` 拼接全部改用这些函数。分隔符由 `api.os` 决定（`app_ready` 返回，单元测试可注入）。
- 写入文档的相对图片路径本来就用 `/`（011），不变；Windows 盘符路径在 macOS 上 `resolveImage` 返回 null，显示“找不到图片”。
- 导出 HTML 的 `baseUrl`：`file://` + 按平台规范化的路径（macOS 路径本身以 `/` 开头）。
- 界面文字：“在资源管理器中显示” macOS 上显示为“在访达中显示”。

### 5. PDF 导出（FR-1501）

`pdf/mod.rs` 保留现有流程（写临时 HTML → 隐藏窗口加载 → 等待完成 → 销毁），只把“打印到文件”一步交给平台模块：

```rust
// pdf/macos.rs（示意）
win.with_webview(move |wv| unsafe {
    let view: &WKWebView = &*wv.inner().cast();
    let info = NSPrintInfo::sharedPrintInfo().copy();
    info.setJobDisposition(NSPrintSaveJob);
    info.dictionary().setObject_forKey(NSURL::fileURLWithPath(out), NSPrintJobSavingURL);
    // 纸张、边距与 WebView2 PrintToPdf 默认值一致（T1503 中对比确定）
    let op = view.printOperationWithPrintInfo(&info);
    op.setShowsPrintPanel(false); op.setShowsProgressPanel(false);
    op.runOperationModalForWindow_delegate_didRunSelector_contextInfo(window, …);  // 完成回调里 send 结果
});
```

`printOperation` 要求视图有确定尺寸：隐藏窗口用 `inner_size` 设为与 Windows 导出相同的宽度。

### 6. 构建与 CI

- `tauri.conf.json`：`bundle.targets: "all"` 在 Windows 上只产出 nsis（与现在相同，CI 中核对），在 macOS 上产出 app 与 dmg；`bundle.macOS`：`minimumSystemVersion: "12.0"`，`signingIdentity: "-"`（ad-hoc 签名，Apple 芯片运行所需；不公证，spec 已确认）。
- `npm run dist` 在 macOS 上执行 `tauri build --target universal-apple-darwin`（`package.json` 增加 `dist:mac`）。
- CI：`check` 改为 `[windows-latest, macos-latest]` 矩阵；`release` 增加 macOS 任务产出 `Inkmark-x.y.z-universal.dmg`，体积 > 10MB 时失败，上传到同一个 Release。
- `scripts/third-party.mjs` 当前固定 `--filter-platform x86_64-pc-windows-msvc` 生成第三方声明：改为按当前构建平台过滤（macOS 构建时包含 objc2 系列的许可，均为 MIT）。

## IPC 契约变更

| 方法 | 方向 | 说明 |
|---|---|---|
| `app_ready` | 前端 → Rust | 返回值由 `string[]` 改为 `{ files: string[], os: "windows" \| "macos" }` |
| `app_info` | 前端 → Rust | 返回值字段 `webview2`、`windows` 改为 `webviewName`（`WebView2` / `WebKit`）、`webview`（内核版本）、`os`（系统名称与版本）；`about.js` 同步修改，Windows 上显示内容不变 |
| `hide_main_window` | 前端 → Rust | 新增，仅 macOS 有效：隐藏主窗口 |
| `quit_app` | 前端 → Rust | 新增：前端完成未保存确认后退出程序 |
| `command` 事件 `quit` | Rust → 前端 | 已有；macOS 上由程序坞“退出”触发时也发送 |
| `open-file` 事件 | Rust → 前端 | 已有；macOS 上来源增加 `RunEvent::Opened` |

## 风险

| 风险 | 应对 |
|---|---|
| WKWebView 中网页处理过的按键仍触发菜单快捷键，命令执行两次 | T1502 最先做原型验证；若会重复，macOS 上菜单快捷键改为只显示（与 Windows 相同），或在 `on_menu` 中丢弃 50ms 内由按键触发过的同一命令 |
| `printOperation` 在隐藏窗口中失败或分页与 Windows 不同 | T1503 原型验证；不行时把导出窗口移到屏幕外并设为可见后再打印 |
| 为 tao 应用代理补 `applicationShouldTerminate:` 依赖 tao 内部类名，升级 tao 后可能失效 | 运行时检查方法是否已存在，已存在则不覆盖；加启动日志；Tauri 升级时列入 checklist；同时向 tao 提 Issue |
| 通用 `.dmg` 超过 10MB | CI 检查；超出时改为分别发布 arm64 与 x86_64 两个 `.dmg`（各约 4–5MB），需修改 NFR-1501 |
| 不签名、不公证导致首次打开被拦截 | spec 已接受；README 与使用指南写明“系统设置 → 隐私与安全性 → 仍要打开”步骤并配图 |
| 本机无法运行 Windows 的 clippy / test | CI 矩阵覆盖；本地只在 macOS 上运行 |
| 无 Intel Mac 测试机 | 在 Apple 芯片 Mac 上用 `arch -x86_64` 经 Rosetta 运行通用包中的 x86_64 部分做冒烟测试；能借到 Intel Mac 时补一次完整 checklist，未做时在 checklist 中如实标注 |
