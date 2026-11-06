# AGENTS.md —— 全局约束

本文件是 Inkmark 仓库对**所有贡献者（人类与 AI 编码助手）**的统一约束，优先级仅次于 [项目宪章](.specify/memory/constitution.md)。

## 1. 开发流程（SDD，强制）

所有功能与非琐碎修复遵循规格驱动开发：

```
specs/<NNN>-<kebab-name>/
├── spec.md       # 做什么、为什么：用户故事、验收场景、FR/NFR 编号（不写技术细节）
├── plan.md       # 怎么做：架构、模块、IPC 契约、宪章检查
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
| `src/main/` | Electron 主进程（CommonJS） | 唯一可访问文件系统、对话框、原生菜单的位置 |
| `src/preload/` | contextBridge 桥接 | 只做 IPC 转发，不含业务逻辑；新增方法须同步更新 plan.md 的 IPC 契约表 |
| `src/renderer/` | 渲染进程（原生 JS，无框架、无打包器） | 不得使用 Node API；纯函数放 `text-utils.js` 等可测试模块 |
| `resources/` | 随安装包分发的静态资源（示例文档等） | |
| `build/` | 打包资源（图标） | |
| `test/` | `node --test` 单元测试，文件名 `*.test.js` | |
| `specs/` `.specify/` | SDD 文档与模板 | |
| `.github/` | CI、Issue/PR 模板 | |

不新增顶层目录，除非在 spec/plan 中说明理由。

## 3. 代码约束

- 只实现 spec 中要求的内容：不预留扩展点、不加未被要求的配置项、不为一次性代码做抽象。
- 修改范围限于需求所需；沿用现有风格；发现无关问题只记录（Issue），不顺手修改。
- 安全（宪章 V）：`contextIsolation: true`、`nodeIntegration: false`、`sandbox: true` 不可关闭；窗口禁止导航；外部链接只能经 `shell.openExternal` 且仅限 http(s)。
- 离线（宪章 II）：禁止在运行时从网络加载脚本、样式、字体；新增渲染能力必须随包分发。
- 不丢数据（宪章 IV）：写文件统一走 `fileops.writeFileAtomic`；任何替换当前文档的操作先调用 `confirmLeave()`。
- Vditor 版本锁定为精确版本；升级须重新执行 `checklist.md` 全部场景（代码依赖其非公开 API：`vditor.vditor.lute`、隐藏工具栏按钮）。
- 用户可见文本使用简体中文；代码注释中文或英文均可，但须简洁并在需要时引用需求号（如 `FR-011`）。
- 风格由 Prettier + ESLint 强制：`npm run lint` 必须通过，`npm run format` 自动修复。

## 4. 提交与分支

- 分支：`<NNN>-<kebab-name>`（与 spec 目录同名），修复用 `fix/<描述>`。
- 提交信息：[Conventional Commits](https://www.conventionalcommits.org/zh-hans/)，如 `feat(editor): 支持打字机模式 (T018)`、`fix(export): …`、`docs(spec): …`。
- 版本：语义化版本；发布时更新 `CHANGELOG.md` 与 `package.json` 版本，打 `vX.Y.Z` 标签，CI 自动构建安装包。

## 5. 必须通过的检查

```bash
npm run lint
npm test
npm start   # 按 checklist.md 手动验证受影响的场景
```
