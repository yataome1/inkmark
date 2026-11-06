# 贡献指南

感谢你对 Inkmark 的关注！提交代码前请先阅读：

1. [项目宪章](.specify/memory/constitution.md) —— 不可违背的核心原则
2. [AGENTS.md](AGENTS.md) —— 开发流程、目录约定、代码与提交规范

## 开发环境

- Windows 10/11 x64
- Node.js ≥ 20（推荐 24）、npm ≥ 10、Git

```bash
git clone https://github.com/yataome1/inkmark.git
cd inkmark
npm install
npm start
```

> npm 11 默认不执行依赖的安装脚本。若 `npm start` 提示找不到 Electron，可运行 `node node_modules/electron/install.js` 下载 Electron 二进制。

常用命令：

| 命令 | 作用 |
|---|---|
| `npm start` | 以开发模式启动 |
| `npm test` | 运行单元测试 |
| `npm run lint` | ESLint + Prettier 检查 |
| `npm run format` | 自动格式化 |
| `npm run dist` | 构建 Windows x64 安装包与便携版到 `dist/` |

调试渲染进程：菜单 **视图 → 开发者工具**。

## 提交新功能

1. 先开 Issue 讨论需求。
2. 按 AGENTS.md 第 1 节新建 `specs/<NNN>-<name>/`，写 `spec.md` 并在 PR 中先评审规格。
3. 规格通过后补充 `plan.md`、`tasks.md`，再实现。
4. PR 需通过 CI，并附上 `checklist.md` 验证结果。

## 报告问题

使用 Issue 模板，提供 Inkmark 版本、Windows 版本、复现步骤，最好附上能复现问题的最小 Markdown 文件。

安全问题请参考 [SECURITY.md](SECURITY.md)，不要公开提交。
