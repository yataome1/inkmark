# AGENTS.md —— 全局约束

本文件是 Inkmark 仓库对**所有贡献者（人类与 AI 编码助手）**的统一约束，优先级仅次于 [项目宪章](.specify/memory/constitution.md)。

## 1. 开发流程（SDD，强制）

所有功能与非琐碎修复遵循规格驱动开发：

```
specs/<NNN>-<kebab-name>/
├── spec.md       # 做什么、为什么：用户故事、验收场景、FR/NFR 编号（不写技术细节）
├── plan.md       # 怎么做：架构、模块、IPC 契约、宪章检查
├── research.md   # 可选：原型验证、技术调研的记录与结论
├── tasks.md      # 可勾选任务，编号 Txxx，按用户故事分组
└── checklist.md  # 按验收场景记录的验证结果
```

1. 从 `.specify/templates/` 复制模板，编号取 `specs/` 下最大编号 + 1。
2. `spec.md` 评审通过后再写 `plan.md`，`plan.md` 必须包含“宪章检查”表。
3. 实现时每完成一个任务就勾选 `tasks.md`；提交信息引用任务号或需求号。
4. 合并前完成 `checklist.md`，所有 P1 验收场景必须通过。
5. 修改既有行为时，先改 spec，再改代码；spec 与代码不一致视为缺陷。

琐碎修改（错别字、依赖小版本升级、纯重构不改行为）可跳过 spec，但需在 PR 中说明。

## 2. 目录约定

| 路径 | 内容 | 规则 |
|---|---|---|
| `src/` | 前端（原生 JS，无框架，应用代码不经打包） | 只通过 `platform.js`（`window.inkmark`）访问系统能力；纯函数放 `text-utils.js` 等可测试模块 |
| `src/vendor/` | 构建时由 `npm run vendor` 生成的第三方资源（esbuild 打包的 CodeMirror 与 markdown-it，以及 KaTeX、Mermaid、highlight.js） | 不提交；需要新的第三方资源时修改 `scripts/vendor.mjs` 并说明体积影响 |
| `src-tauri/src/` | Rust 后端 | 唯一可访问文件系统、对话框、原生菜单的位置；新增命令须同步更新 plan 的 IPC 契约表 |
| `src-tauri/capabilities/` | 前端权限 | 按最小权限逐项授予，禁止整体开放 `fs` 等插件 |
| `src-tauri/icons/` | 应用图标 | 只保留 Windows 所需尺寸 |
| `scripts/` | 构建脚本 | |
| `resources/samples/` | 随安装包分发的示例文档 | |
| `test/` | `node --test` 单元测试，文件名 `*.test.js`；Rust 单元测试写在各模块的 `#[cfg(test)]` 中 | |
| `specs/` `.specify/` | SDD 文档与模板 | |
| `.github/` | CI、Issue/PR 模板 | |

不新增顶层目录，除非在 spec/plan 中说明理由。

## 3. 代码约束

- 只实现 spec 中要求的内容：不预留扩展点、不加未被要求的配置项、不为一次性代码做抽象。
- 修改范围限于需求所需；沿用现有风格；发现无关问题只记录（Issue），不顺手修改。
- 安全（宪章 V）：CSP 只在 `tauri.conf.json` 中设置；asset 协议只按需授权已打开文档的目录；窗口禁止导航（`lib.rs` 的 `on_navigation`）；外部链接只经 opener 插件且仅限 http(s)。
- 离线（宪章 II）：禁止在运行时从网络加载脚本、样式、字体；新增渲染能力必须随包分发。
- 不丢数据（宪章 IV）：写文件统一走 `fileops::write_atomic`；任何替换当前文档或关闭窗口的操作先调用 `confirmLeave()`。
- 轻量（宪章 VII）：安装包 ≤ 10MB、免安装版 ≤ 15MB（CI 检查）；新增依赖须在 plan 中说明体积影响。
- 快捷键：WebView2 有焦点时菜单快捷键不触发，所有快捷键在 `src/app.js` 的 `KEYMAP` 中处理，`menu.rs` 只显示快捷键文字，两处必须一致。
- CodeMirror、markdown-it、KaTeX、Mermaid、highlight.js 版本锁定为精确版本；升级须重新执行 `checklist.md` 全部场景。
- 用户可见文本使用简体中文；代码注释中文或英文均可，但须简洁并在需要时引用需求号（如 `FR-011`）。
- 风格：前端由 Prettier + ESLint，Rust 由 rustfmt（`max_width = 120`）+ clippy（`-D warnings`）强制。

## 4. 提交与分支

- 分支：`<NNN>-<kebab-name>`（与 spec 目录同名），修复用 `fix/<描述>`。
- 提交信息：[Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，如 `feat(editor): 支持打字机模式 (T018)`、`fix(export): …`、`docs(spec): …`。
- 版本：语义化版本；发布时同步更新 `package.json` 与 `src-tauri/Cargo.toml` 的版本和 `CHANGELOG.md`，打 `vX.Y.Z` 标签，CI 自动构建并发布安装包。

## 5. 必须通过的检查

```bash
npm run lint
npm test
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
npm start   # 按 checklist.md 手动验证受影响的场景
```
