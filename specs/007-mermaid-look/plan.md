# 实施计划：Mermaid 图表外观

**分支**: `007-mermaid-look` | **规格**: [spec.md](spec.md)

## 摘要
只调整 `render.js` 的 `mermaid.initialize` 配置：改用 `dagre` 布局与 `basis` 曲线，主题改为 `base` 并按浅色、深色传入配色。

## 技术上下文
| 项 | 选择 |
|---|---|
| 涉及进程 | 前端 |
| 新增依赖 | 无 |
| 测试方式 | 在运行的应用中目视与 DOM 检查 |

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 本规格 |
| II 离线 | ✅ `dagre` 已在随包的 `mermaid.min.js` 内 |
| III Markdown 唯一真相 | ✅ 不改动文档 |
| IV 不丢数据 | ✅ 不涉及 |
| V 安全默认 | ✅ 保持 `securityLevel: 'strict'` |
| VI 简单 | ✅ 只改配置 |
| VII 轻量 | ✅ 体积不变 |

## 变更文件
- `src/render.js` —— Mermaid 配置与配色（FR-701..703）

## 设计要点
- Mermaid 12 随包版本默认 `layout: 'elk'`，该布局会把 `flowchart.curve` 改成圆角折线，因此必须同时指定 `layout: 'dagre'`。
- `renderMermaid(source, theme)` 的 `theme` 仍是 `default` / `dark`，缓存键与调用方不变，只在初始化时映射到配色。
- 时序图节点的阴影由 Mermaid 写在 `filter` 属性上，主题变量无法关闭，用 `themeCSS` 覆盖，导出同样生效。

## IPC 契约变更
无。

## 风险
- 复杂图的走线与之前不同：`demo.md` 与多类型图表目视确认。
