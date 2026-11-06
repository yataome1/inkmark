# 任务清单：轻量化 —— 迁移到 Tauri 2

**输入**: [spec.md](spec.md)、[plan.md](plan.md)
**格式**: `[ID] [P?] [Story] 描述` —— `[P]` 表示可并行（不同文件、无依赖）。

## 阶段 1：原型与风险验证（先做，结果可能修改 plan）
在仓库外的一次性原型中完成，结果见 [research.md](research.md)。
- [x] T101 Tauri 原型加载精简 Vditor，确认 `vendor/` 资源与 asset 协议图片正常（R6）
- [x] T102 验证三按钮对话框（R1）、菜单 `\t` 快捷键文字（R2，结论：全部快捷键由前端处理）、`setTheme` 与 `prefers-color-scheme`（R4）
- [x] T103 验证 WebView2 `PrintToPdf`（R3）
- [x] T104 release 构建实测体积并更新 plan（R5：安装包 3.51MB）

## 阶段 2：基础
- [x] T105 宪章修订 1.1.0（新增原则 VII 轻量，更新技术约束）
- [x] T106 [P] `scripts/copy-vditor.mjs` 按 FR-103 复制资源；`src/vendor/` 加入 `.gitignore`
- [x] T107 目录迁移：`src/renderer/*` → `src/`；删除 `src/main/`、`src/preload/`；图标移入 `src-tauri/icons/`
- [x] T108 `Cargo.toml` release 体积优化配置；`tauri.conf.json`（标识、窗口、CSP、asset 协议、withGlobalTauri、NSIS、文件关联）
- [x] T109 `capabilities/default.json` 最小权限

## 阶段 3：后端（Rust）
- [x] T110 [P] `fileops.rs`：`read_file`、`save_file`（原子写）、`list_dir`、`save_image`、`save_image_from_path` + `cargo test`
- [x] T111 [P] `settings.rs`：读写 `%APPDATA%\Inkmark\settings.json`、最近文件（FR-104）
- [x] T112 [P] `menu.rs`：中文菜单，菜单事件 → `command` 事件
- [x] T113 `lib.rs`：插件注册、单实例、命令行参数、导航拦截、打开文档时授权 asset 目录
- [x] T114 `pdf.rs`：`export_pdf`

## 阶段 4：前端适配
- [x] T115 `platform.js`：按 plan 的 IPC 契约实现 `window.inkmark`
- [x] T116 `app.js`：关闭拦截、拖放、linkBase 改用 asset 协议、`cdn` 路径、文件类快捷键并入 `KEYMAP`、深色代码主题改为 `github-dark`
- [x] T117 [P] `find.js`：CSS Custom Highlight API 查找（FR-013）
- [x] T118 [P] `export.js`：前端组装导出 HTML（内联 CSS 与 KaTeX 字体）

## 阶段 5：工程与文档
- [x] T119 `package.json`：移除 Electron 依赖，脚本改为 `tauri dev` / `tauri build`
- [x] T120 CI：Rust 工具链、`cargo fmt --check`、`cargo test`、`cargo clippy`、`tauri build`、安装包 ≤ 10MB 检查
- [x] T121 更新 `AGENTS.md`（目录约定、安全约束）、`CONTRIBUTING.md`、`README.md`、`CHANGELOG.md`（0.2.0）

## 阶段 6：验证与发布
- [x] T122 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo test`、`cargo clippy`
- [x] T123 按 001 `checklist.md` 全部场景回归 + 002 验收场景（体积、启动时间、内存对比），记录于 `checklist.md`
- [ ] T124 合并到 `main`，打 `v0.2.0` 标签发布

## 依赖
阶段 1 → 阶段 2 → 阶段 3 与阶段 4（T115 依赖 T110–T113 的命令签名）→ 阶段 5 → 阶段 6。
阶段 1 任一风险验证失败时，先按 plan 中的应对方案更新 plan.md，再继续。
