# 贡献指南

感谢你对 Inkmark 的关注！提交代码前请先阅读：

1. [项目宪章](.specify/memory/constitution.md) —— 不可违背的核心原则
2. [AGENTS.md](AGENTS.md) —— 开发流程、目录约定、代码与提交规范

## 开发环境

- Windows 10/11 x64，已安装 WebView2 运行时（Windows 11 自带）
- Node.js ≥ 20（推荐 24）、npm ≥ 10、Git
- Rust stable（MSVC 工具链），含 `clippy` 与 `rustfmt`：`rustup component add clippy rustfmt`
- Visual Studio 2022 生成工具（“使用 C++ 的桌面开发”，含 Windows SDK）

```bash
git clone https://github.com/yataome1/inkmark.git
cd inkmark
npm install
npm start
```

首次 `npm start` 会编译 Rust 依赖，需要几分钟。

常用命令：

| 命令 | 作用 |
|---|---|
| `npm start` | 以开发模式启动（`tauri dev`，自动复制 Vditor 资源） |
| `npm test` | 前端单元测试 |
| `npm run lint` | ESLint + Prettier 检查 |
| `npm run format` | 自动格式化前端代码 |
| `cd src-tauri && cargo test` | Rust 单元测试 |
| `cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings` | Rust 格式化与检查 |
| `npm run dist` | 构建发布版：安装包在 `src-tauri/target/release/bundle/nsis/`，免安装版为 `src-tauri/target/release/inkmark.exe` |

调试前端：开发模式下在窗口中右键 → **检查**，打开 WebView2 开发者工具。

## 提交新功能

1. 先开 Issue 讨论需求。
2. 按 AGENTS.md 第 1 节新建 `specs/<NNN>-<name>/`，写 `spec.md` 并在 PR 中先评审规格。
3. 规格通过后补充 `plan.md`、`tasks.md`，再实现。
4. PR 需通过 CI，并附上 `checklist.md` 验证结果。

## 报告问题

使用 Issue 模板，提供 Inkmark 版本、Windows 版本、复现步骤，最好附上能复现问题的最小 Markdown 文件。

安全问题请参考 [SECURITY.md](SECURITY.md)，不要公开提交。
