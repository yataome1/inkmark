# 更新日志

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

实现规格 [002-tauri-migration](specs/002-tauri-migration/spec.md)，计划作为 0.2.0 发布。

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
