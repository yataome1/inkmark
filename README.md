<p align="center"><img src="src-tauri/icons/icon.png" width="96" alt="Inkmark"></p>

<h1 align="center">Inkmark</h1>

<p align="center">本地 Markdown 查看与编辑器 · Windows 10 / 11 x64</p>

<p align="center">
  <a href="https://github.com/yataome1/inkmark/actions/workflows/ci.yml"><img src="https://github.com/yataome1/inkmark/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT"></a>
</p>

> An offline-first Markdown viewer & editor for Windows. Live preview editing, outline & file tree, focus/typewriter modes, math, diagrams, and HTML/PDF export.

## 特性

- **即时渲染**：输入即排版，光标所在处显示 Markdown 标记；`Ctrl+/` 切换源代码模式
- **完整语法**：GFM 表格、任务列表、删除线、脚注、`[TOC]`、==高亮==、KaTeX 数学公式、Mermaid 图表、代码高亮
- **小巧**：安装包小于 10MB，使用系统自带的 WebView2 内核
- **完全离线**：所有渲染资源随应用分发，无网络请求、无遥测
- **多标签**：同时打开多个文件，拖动排序、右键菜单、全部保存，启动时恢复上次的标签；没有文档时显示起始页
- **表格**：尺寸选择、工具条、右键菜单、快捷键、拖动行列
- **侧边栏**：大纲、文件树、收藏夹，可拖动调整宽度
- **专注写作**：专注模式（F8）、打字机模式（F9）、全屏（F11）、实时字数
- **主题**：浅色 / 深色 / 跟随系统
- **图片**：粘贴或拖入的图片统一保存到图片文件夹，移动文档不会丢图片；可把图片文件夹设到同步盘，换电脑后自动找回；需要分享时可导出带图片的副本
- **查找替换**、**导出 HTML / PDF**、最近文件、`.md` 文件关联、`Ctrl+单击` 打开链接
- **右键菜单**：编辑区、链接、公式、图表各有对应命令，如复制公式源码、把图表复制为图片
- **帮助**：内置离线使用指南、键盘快捷键列表（`F1`）、可复制的版本信息、完整的第三方声明
- **不丢数据**：未保存提示、原子写入；打开再保存不改动文件的任何字节，撤销即时且只影响改动处；误按 `F5` 等浏览器快捷键不会刷新界面

## 安装

从 [Releases](https://github.com/yataome1/inkmark/releases) 下载：

- `Inkmark-Setup-x.y.z-x64.exe` —— 安装版（注册 `.md` 文件关联）
- `Inkmark-x.y.z-x64-portable.exe` —— 免安装版，单个文件，双击即用

系统要求：

- Windows 10、Windows 11 的 64 位版本（目前在 Windows 11 上测试）；不支持 Windows 7、8 和 32 位系统
- WebView2 运行时：Windows 11 已内置，Windows 10 通常已随 Edge 安装；没有时安装版会自动引导下载

> 安装包未做代码签名，首次运行时 Windows SmartScreen 可能提示“未知发布者”，选择“仍要运行”即可。

## 快捷键

常用快捷键如下，按 `F1` 可在软件中查看全部快捷键。

| 操作 | 快捷键 |
|---|---|
| 新建 / 打开 / 保存 | `Ctrl+N` / `Ctrl+O` / `Ctrl+S` |
| 源代码模式 | `Ctrl+/` |
| 查找 / 替换 | `Ctrl+F` / `Ctrl+H` |
| 关闭标签 / 切换标签 | `Ctrl+W` / `Ctrl+Tab` |
| 全部快捷键 | `F1` |

## 从源码构建

需要 Node.js、Rust（MSVC）与 Visual Studio C++ 生成工具，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

```bash
npm install
npm start        # 开发运行
npm test         # 单元测试
npm run dist     # 构建安装包与免安装版
```

## 项目结构

```
├── .github/                 CI 工作流、Issue / PR 模板
├── .specify/                SDD：项目宪章与规格模板
├── specs/                   SDD：每个特性的 spec / plan / research / tasks / checklist
├── scripts/                 构建脚本（生成 src/vendor 中的第三方资源）
├── resources/samples/       编进程序的使用指南与示例文档
├── src/                     前端：界面与编辑器（CodeMirror 6），platform.js 为唯一的系统接口
├── src-tauri/               后端（Rust）：窗口、菜单、文件、设置、导出 PDF；权限配置与图标
├── test/                    前端单元测试（node --test）
├── AGENTS.md                全局开发约束（人类与 AI 助手通用）
└── CONTRIBUTING.md          贡献指南
```

## 开发方式

本项目采用 **规格驱动开发（Spec-Driven Development）**：每个特性先写规格（[示例](specs/001-inkmark-mvp/spec.md)），再写技术计划与任务清单，最后实现并按验收场景验证。所有约束见 [项目宪章](.specify/memory/constitution.md) 与 [AGENTS.md](AGENTS.md)。

## 致谢

- [CodeMirror 6](https://codemirror.net/)（MIT）—— 编辑内核
- [markdown-it](https://github.com/markdown-it/markdown-it)（MIT）、[KaTeX](https://katex.org/)（MIT）、[Mermaid](https://mermaid.js.org/)（MIT）、[highlight.js](https://highlightjs.org/)（BSD-3-Clause）—— 导出与渲染
- [Tauri](https://tauri.app/)（MIT / Apache-2.0）—— 桌面运行时
- 设计灵感来自 [Typora](https://typora.io)。Inkmark 是独立的开源项目，与 Typora 无关。

## 许可证

[MIT](LICENSE)
