<p align="center"><img src="build/icon.png" width="96" alt="Inkmark"></p>

<h1 align="center">Inkmark</h1>

<p align="center">受 <a href="https://typora.io">Typora</a> 启发的本地 Markdown 查看与编辑器 · Windows 11 x64</p>

<p align="center">
  <a href="https://github.com/yataome1/inkmark/actions/workflows/ci.yml"><img src="https://github.com/yataome1/inkmark/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

> A Typora-inspired, offline-first Markdown viewer & editor for Windows. Live preview editing, outline & file tree, focus/typewriter modes, math, diagrams, and HTML/PDF export.

## 特性

- **即时渲染**：输入即排版，光标所在处显示 Markdown 标记；`Ctrl+/` 切换源代码模式
- **完整语法**：GFM 表格、任务列表、删除线、脚注、`[TOC]`、==高亮==、KaTeX 数学公式、Mermaid 图表、代码高亮
- **完全离线**：所有渲染资源随应用分发，无网络请求、无遥测
- **侧边栏**：大纲（点击跳转）与文件树（打开文件夹）
- **专注写作**：专注模式（F8）、打字机模式（F9）、全屏（F11）、实时字数
- **主题**：浅色 / 深色 / 跟随系统
- **图片**：粘贴或拖入图片自动保存到文档旁的 `assets/` 目录
- **查找替换**、**导出 HTML / PDF**、最近文件、`.md` 文件关联、`Ctrl+单击` 打开链接
- **不丢数据**：未保存提示、原子写入

## 安装

从 [Releases](https://github.com/yataome1/inkmark/releases) 下载：

- `Inkmark-Setup-x.y.z-x64.exe` —— 安装版（注册 `.md` 文件关联）
- `Inkmark-x.y.z-x64-portable.exe` —— 便携版

> 安装包未做代码签名，首次运行时 Windows SmartScreen 可能提示“未知发布者”，选择“仍要运行”即可。

## 快捷键

| 操作 | 快捷键 | 操作 | 快捷键 |
|---|---|---|---|
| 新建 / 打开 / 保存 | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` | 另存为 | `Ctrl+Shift+S` |
| 打开文件夹 | `Ctrl+Shift+O` | 源代码模式 | `Ctrl+/` |
| 1–6 级标题 / 段落 | `Ctrl+1…6` / `Ctrl+0` | 侧边栏 | `Ctrl+Shift+L` |
| 加粗 / 斜体 / 下划线 | `Ctrl+B` / `Ctrl+I` / `Ctrl+U` | 大纲 / 文件树 | `Ctrl+Shift+1` / `Ctrl+Shift+3` |
| 删除线 | `Alt+Shift+5` | 专注 / 打字机 | `F8` / `F9` |
| 行内代码 | ``Ctrl+Shift+` `` | 全屏 | `F11` |
| 超链接 | `Ctrl+K` | 查找 / 替换 | `Ctrl+F` / `Ctrl+H` |
| 引用 | `Ctrl+Shift+Q` | 表格 | `Ctrl+T` |
| 有序 / 无序列表 | `Ctrl+Shift+[` / `Ctrl+Shift+]` | 代码块 / 公式块 | `Ctrl+Shift+K` / `Ctrl+Shift+M` |
| 任务列表 | `Ctrl+Shift+X` | 分割线 | `Ctrl+Shift+-` |

## 从源码构建

```bash
npm install
npm start        # 开发运行
npm test         # 单元测试
npm run dist     # 生成 dist/ 下的安装包与便携版
```

详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 项目结构

```
├── .github/                 CI 工作流、Issue / PR 模板
├── .specify/                SDD：项目宪章与规格模板
├── specs/                   SDD：每个特性的 spec / plan / tasks / checklist
├── build/                   打包资源（图标）
├── resources/samples/       随应用分发的示例文档
├── src/
│   ├── main/                主进程：窗口、菜单、文件、设置、导出
│   ├── preload/             contextBridge 安全桥接
│   └── renderer/            界面与编辑器（Vditor）
├── test/                    单元测试（node --test）
├── AGENTS.md                全局开发约束（人类与 AI 助手通用）
└── CONTRIBUTING.md          贡献指南
```

## 开发方式

本项目采用 **规格驱动开发（Spec-Driven Development）**：每个特性先写规格（[示例](specs/001-inkmark-mvp/spec.md)），再写技术计划与任务清单，最后实现并按验收场景验证。所有约束见 [项目宪章](.specify/memory/constitution.md) 与 [AGENTS.md](AGENTS.md)。

## 致谢

- [Vditor](https://github.com/Vanessa219/vditor)（MIT）—— 编辑内核
- [Electron](https://www.electronjs.org/)
- 设计灵感来自 [Typora](https://typora.io)。Inkmark 是独立的开源项目，与 Typora 无关。

## 许可证

[MIT](LICENSE)
