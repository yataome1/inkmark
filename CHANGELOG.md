# 更新日志

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.4.0] - 2026-11-09

实现规格 [003-tables-sidebar-favorites](specs/003-tables-sidebar-favorites/spec.md)。

### 新增

- 表格可视化编辑：尺寸选择器、工具条、右键菜单、`Ctrl+Enter`、`Ctrl+Shift+Backspace`、`Tab`、拖动行列；只更新当前表格，一步撤销
- 侧边栏与内容区之间可拖动的分割线：拖到阈值收起，从左边缘拖出，双击复位，宽度持久化
- 收藏夹：收藏文件和文件夹，可拖动或用键盘调整顺序（`Ctrl+Shift+2`）

### 修复

- 编辑时 `[TOC]` 目录重绘并牵连周围的图表

## [0.3.0] - 2026-11-09

实现规格 [006-codemirror-core](specs/006-codemirror-core/spec.md)（选型依据见 [005](specs/005-editor-core/research.md)）。

### 变更

- 编辑内核由 Vditor 改为 CodeMirror 6，编辑的就是文件原文
- 打开再保存不再改写文件（`[TOC]`、`[x]`、表格空格、空行、转义都保持原样），保留 CRLF 换行与 BOM
- 编辑表格时不再自动重排表格源码的空格
- 撤销/重做只影响改动处，长文档中也是毫秒级；切换文件时清空撤销历史
- 点击或用方向键移入、移出图表、公式、代码块、图片时内容不再跳动
- 查找按模式进行：源代码模式查找原文，即时渲染模式查找渲染后的文字（含表格单元格），覆盖全文、每处都高亮，查找时版面不变
- 全部替换与查找一致，不区分大小写；即时渲染模式下跨格式的匹配跳过并提示
- 导出改用 markdown-it

### 移除

- flowchart.js 流程图（`flowchart` 代码块按普通代码块显示）
- yul、solidity、abap、hlsl、gdscript 的代码高亮

## [0.2.1] - 2026-11-06

实现规格 [004-table-code-pipe](specs/004-table-code-pipe/spec.md)。

### 修复

- 表格单元格的行内代码含转义竖线（如 `` `a \| b` ``）时，保存、切换源代码模式或复制会丢失反斜杠，导致表格被拆列；在该表格中输入文字时表格会立即错乱并丢失最后一列

## [0.2.0] - 2026-11-06

实现规格 [002-tauri-migration](specs/002-tauri-migration/spec.md)。

### 变更

- 运行时由 Electron 改为 Tauri 2 + 系统 WebView2：安装包从约 120MB 降到 10MB 以下，并提供单文件免安装版
- 只打包实际用到的 Vditor 资源
- 页内查找只匹配编辑区中的文字（不再匹配侧边栏）
- 所有快捷键由编辑器统一处理，新增缩放快捷键 `Ctrl+=` / `Ctrl+-` / `Ctrl+Shift+9`
- 设置文件位置不变，0.1.0 的主题与最近文件会保留

### 修复

- 深色模式下代码块为白底（代码高亮主题 `native` 不存在，改为 `github-dark`）

## [0.1.0] - 2026-11-06

首个版本，实现规格 [001-inkmark-mvp](specs/001-inkmark-mvp/spec.md)。

### 新增

- 即时渲染（所见即所得）编辑与源代码模式切换（`Ctrl+/`）
- GFM、脚注、目录、KaTeX 数学公式、Mermaid 图表、代码高亮，全部离线渲染
- 新建 / 打开 / 保存 / 另存为，未保存提示，原子写入
- 侧边栏：大纲与文件树
- 专注模式（F8）、打字机模式（F9）、全屏（F11）、字数统计
- 浅色 / 深色 / 跟随系统主题
- 粘贴或拖入图片自动保存到 `assets/`
- 查找与全部替换
- 导出 HTML（单文件、离线可用）与 PDF
- 最近打开文件、`Ctrl+单击` 打开链接、单实例、`.md` 文件关联
- Typora 风格快捷键
