# 实施计划：表格单元格行内代码中的 `\|` 不再丢失

**分支**: `fix/table-code-pipe-escape` | **规格**: [spec.md](spec.md)

## 摘要
Lute 把 IR DOM 转回 Markdown 时，不会重新转义表格单元格中行内代码里的 `|`。修复方法：在交给 Lute 的 HTML 中，先把表格内行内代码 `<code>` 文本里的 `|` 改写为 `\|`。改写只作用于传入 Lute 的字符串，不修改编辑区 DOM，所以显示不变。

## 技术上下文
| 项 | 选择 |
|---|---|
| 涉及进程 | 前端（`src/text-utils.js`、`src/app.js`） |
| 新增依赖 | 无 |
| 测试方式 | `node --test` 单元测试 + CDP 在应用中验证验收场景 |

## 原型结论（Vditor 3.11.2 / 内置 Lute）
| 输入单元格 | IR DOM 中的文本 | 转回 Markdown（修复前） | 修复后 |
|---|---|---|---|
| `` `x \| y` `` | `<code>x \| y</code>` 中为 `x | y` | `` `x | y` ``（拆列） | `` `x \| y` `` |
| `` `m \\| n` `` | `m \| n` | `` `m \| n` ``（含义改变） | `` `m \\| n` `` |
| `$p \| q$` | `<code data-type="math-inline">p \| q</code>`（保留原文） | 正确 | 不处理，正确 |

`SpinVditorIRDOM`（输入时即时渲染）同样受影响：修复前在该表格中输入，单元格立即被拆开，最后一列丢失。

## 宪章检查
| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 本规格 |
| II 离线 | ✅ 无网络 |
| III Markdown 唯一真相 | ✅ 修复 Markdown 往返不一致 |
| IV 不丢数据 | ✅ 本修复的目的 |
| V 安全默认 | ✅ 无权限变化 |
| VI 简单 | ✅ 一个纯函数 + 三处包装 |
| VII 轻量 | ✅ 无体积变化 |

## 变更文件
- `src/text-utils.js` —— 新增纯函数 `escapeTableCodePipes(html)`
- `src/app.js` —— 编辑器就绪（`after`）时包装 `lute.VditorIRDOM2Md`、`lute.SpinVditorIRDOM`、`lute.VditorIRDOM2HTML`，先对输入调用 `escapeTableCodePipes`
- `test/text-utils.test.js` —— 单元测试
- `CHANGELOG.md`、`package.json`、`src-tauri/Cargo.toml` —— 0.2.1

## 设计要点
- Vditor 中读取 IR DOM 的入口：`getMarkdown`（保存、源代码模式、字数）、复制（`VditorIRDOM2Md`）、`getHTML`（`VditorIRDOM2HTML`）、输入时的 `SpinVditorIRDOM`。三个方法包装后覆盖全部入口。
- `escapeTableCodePipes`：在每个 `<table>…</table>` 中，对不带 `data-type` 属性的 `<code>`（即行内代码，排除 `math-inline`）的文本把 `|` 替换为 `\|`。Markdown 表格不能嵌套，代码文本中的 `<` 已转义为 `&lt;`，正则匹配是可靠的。
- 不含 `<table` 的文档直接返回原字符串。

## IPC 契约变更
无。

## 风险
- **R1 依赖 Lute 私有 API 与 DOM 结构**：升级 Vditor 时，内核可能已修复该问题，导致重复转义（`\\|`）。应对：单元测试固定输入输出；`checklist.md` 记录复查项；AGENTS.md 已要求升级时重跑全部场景。
