# 任务清单：macOS 版本

**输入**: [spec.md](spec.md)、[plan.md](plan.md)、[research.md](research.md)
**格式**: `[ID] [P?] [Story] 描述` —— `[P]` 表示可并行（不同文件、无依赖）。US1 安装与打开文件，US2 快捷键与菜单，US3 功能一致。

## 阶段 1：能在 macOS 上编译 + 风险原型

- [x] T1501 `src-tauri/Cargo.toml` 按目标拆分依赖；Windows 专用代码移入 `sys/windows.rs`，`webview.rs`、`pdf.rs` 的 Windows 部分加 `#[cfg(windows)]`；macOS 暂用占位实现，`cargo build` 在 macOS 通过
- [x] T1502 原型：WKWebView 中网页 `preventDefault` 的按键是否还会触发同一菜单快捷键（plan 风险 1）；确认剪切、复制、粘贴、全选在 macOS 上可用
- [x] T1503 原型：隐藏窗口中 `printOperationWithPrintInfo:` 保存 PDF，对比 Windows 导出的纸张、边距、分页（plan 风险 2）
- [x] T1504 原型：为 tao 应用代理补 `applicationShouldTerminate:`，程序坞“退出”时可取消并通知前端（plan 风险 3）

## 阶段 2：后端（Rust）

- [x] T1505 [P] [US3] `sys/macos.rs`：`sha256`（CommonCrypto）、`os_version`、`put_files`（NSPasteboard）；单元测试
- [x] T1506 [US3] `pdf/` 拆分为共用流程 + `windows.rs` + `macos.rs`（按 T1503 结论）
- [x] T1507 [US1] `lib.rs`：`RunEvent::Opened` / `Reopen` / 退出处理；`hide_main_window`、`quit_app`；`app_ready` 返回 `{ files, os }`；`app_info` 字段平台无关；`install_terminate_hook`（按 T1504 结论）
- [x] T1508 [US2] `menu.rs`：逻辑快捷键；macOS 应用菜单、窗口菜单，退出、撤销、重做为自定义项；访问键只在 Windows（按 T1502 结论）
- [x] T1509 [P] `bundled.rs` 路径比较按平台；Windows 专用测试加 `#[cfg(windows)]`

## 阶段 3：前端

- [x] T1510 [P] [US2] `src/platform-keys.js`：逻辑快捷键 → 平台按键串与显示文字、macOS 例外表；`test/platform-keys.test.js`
- [x] T1511 [US2] `app.js` `KEYMAP` 与 `keydown` 改用逻辑快捷键；`COMMANDS` 增加 `undo`、`redo`；`shortcuts.js`、`edit-menu.js`、`table.js`、`tabs.js`、`contextmenu.js` 的快捷键文字经 `platform-keys` 转换
- [x] T1512 [US2] `test/shortcuts.test.js`：对 Windows、macOS 各检查三处一致；检查 macOS 不占用系统快捷键
- [x] T1513 [P] [US3] `text-utils.js` 路径函数；`app.js`、`render.js`、`tab-utils.js`、`favorites.js`、`image-menu.js` 改用；测试两个平台的用例
- [x] T1514 [US1] macOS 关闭窗口流程（关闭全部标签 → 起始页 → 隐藏）与退出流程；`platform.js` 暴露 `hideWindow`、`quitApp`（`os` 已在 T1507 随 `app_ready` 加入）；`quit` 命令改为确认后 `quitApp`（程序坞“退出”也发此命令）
- [x] T1515 [P] [US3] ~~`about.js` 显示 macOS / WebKit 版本~~（随 T1507 的 IPC 变更完成）；“在资源管理器中显示”按平台显示为“在访达中显示”

## 阶段 4：打包与 CI

- [x] T1516 [P] [US1] `scripts/icons.mjs` 生成 `icon.icns`；`tauri.conf.json` 的 `bundle.icon`、`bundle.macOS`（最低 12.0、ad-hoc 签名）、文件关联；`package.json` 增加 `dist:mac`
- [x] T1517 [P] `scripts/third-party.mjs` 按当前平台过滤 cargo 依赖
- [x] T1518 `.github/workflows/ci.yml`：check 改为 Windows + macOS 矩阵；release 增加通用 `.dmg`，体积 ≤ 10MB 检查，上传到同一 Release；核对 Windows 产物不变（**待 CI 首次运行时核对**，配置中 Windows 部分未改）

## 阶段 5：文档与验证

- [x] T1519 [P] [US1] 使用指南、README、README.en、CONTRIBUTING：macOS 系统要求、安装与首次放行步骤、快捷键差异、开发环境
- [x] T1520 `npm run lint`、`npm test`；macOS 上 `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test`；Windows 由 CI 检查（macOS 全部通过；Windows 待 CI）
- [ ] T1521 按 spec 验收场景与 001–014 checklist 的 P1 场景在 macOS（Apple 芯片；Intel 经 Rosetta 冒烟）验证，记录于 `checklist.md`；Windows 回归
- [ ] T1522 CHANGELOG；版本号 0.9.0

## 依赖

- T1501 是所有 Rust 任务的前提；T1502–T1504 依赖 T1501，结论可能修改 T1506–T1508 的做法。
- T1510 → T1511 → T1512；T1508 与 T1511 使用同一张例外表，需一起完成。
- T1507 → T1514（新命令与事件）。
- 阶段 4 依赖阶段 2、3 可编译；T1521 在全部实现完成后进行。
