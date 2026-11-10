# 实施计划：开源合规与法律风险控制

**分支**: `010-legal-hygiene` | **规格**: [spec.md](spec.md)

## 摘要

在第三方声明生成脚本中加入许可表达式解析：按允许列表为每个组件选定许可，弱著佐权（MPL-2.0、EPL-2.0）记录源码地址，GPL 类或未知许可让构建失败。“关于”的第三方声明显示所选许可和源码地址，并加免责声明。其余是文本修改：元数据、界面、示例文档、README 中收缩 Typora 名称，`CONTRIBUTING.md` 与 PR 模板写明贡献授权和 DCO。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 当前许可组合 | 27 种表达式；含 `OR`、`AND`、括号、`/` 分隔；弱著佐权 7 个组件 | 2026-11-10 `third-party.json` |
| 需要选择的多选一 | `dompurify`：`MPL-2.0 OR Apache-2.0` → Apache-2.0；`elkjs`：`EPL-2.0 OR GPL-3.0-or-later` → EPL-2.0 | 同上 |
| 必须提供源码地址 | `cssparser`、`cssparser-macros`、`selectors`、`dtoa-short`、`option-ext`（MPL-2.0），`elkjs`（EPL-2.0） | 同上 |
| 源码地址形式 | crates.io 与 npm 上对应版本的页面；以文本显示，不做成可点击链接（FR-906 只允许打开项目地址） | 规格 009 |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 构建脚本、前端 |
| 新增依赖 | 无 |
| 测试 | `node --test`：许可表达式解析与选择；改动例外后构建失败的反向验证；CDP 验收 |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 源码地址只显示文本，不联网 |
| III Markdown 唯一真相 | ✅ 不涉及 |
| IV 不丢数据 | ✅ 不涉及 |
| V 安全默认 | ✅ 不新增可打开的链接 |
| VI 简单 | ✅ 允许列表写在脚本中，不新增配置项 |
| VII 轻量 | ✅ 无依赖 |

## 变更文件

```
scripts/license-policy.mjs  新：SPDX 表达式解析、按允许列表选择许可、源码地址
scripts/third-party.mjs     改：调用选择逻辑，失败时列出组件与许可；输出 chosen、sourceUrl
src/about.js、styles.css    改：第三方声明说明、所选许可、源码地址；免责声明；副标题去掉 Typora
package.json、src-tauri/Cargo.toml、resources/samples/demo.md、README.md、
.github/ISSUE_TEMPLATE/feature_request.yml   改：收缩 Typora 名称
CONTRIBUTING.md、.github/PULL_REQUEST_TEMPLATE.md   改：贡献授权与 DCO
test/license-policy.test.js 新
```

## 设计要点

### 许可选择

- 解析：`expr := term (OR term)*`，`term := factor (AND factor)*`，`factor := ID | ( expr )`；`/` 视为 `OR`。结果展开为若干“同时满足”的组合。
- 分类：宽松（MIT、MIT-0、Apache-2.0、BSD-2-Clause、BSD-3-Clause、ISC、0BSD、Zlib、Unlicense、CC0-1.0、Unicode-3.0、PSF-2.0）；弱著佐权（MPL-2.0、EPL-2.0）；其余均视为不允许，包括 GPL、AGPL、LGPL、SSPL 和未知标识。
- 选择：优先全部为宽松许可的组合，其次含弱著佐权的组合；都没有时报错。选中组合含弱著佐权时，记录源码地址。
- 输出字段：`chosen`（所选组合，如 `Apache-2.0`），`sourceUrl`（仅弱著佐权）。

### 显示

- 第三方声明开头：“所有组件均未经修改。多选一许可的组件注明所选许可；MPL-2.0、EPL-2.0 组件的源码可从所列地址获取。”
- 每个组件：许可与原表达式不同时显示“选用 X”；有源码地址时在展开内容顶部显示“源码：<地址>”。
- “关于”加免责声明一行；副标题改为“本地 Markdown 查看与编辑器”。

### Typora 名称

元数据描述改为 “An offline-first local Markdown viewer & editor for Windows”；README 标题区与英文简介不再提 Typora，只保留“致谢”中的一句；示例文档与 Issue 模板去掉。历史规格、更新日志、代码注释不改（规格边界情况）。

## IPC 契约变更

无。

## 风险

- **R1 新许可标识**：依赖升级可能带来未列出的宽松许可，构建会失败。应对：错误信息列出组件与表达式，人工确认后加入允许列表。
- **R2 允许列表判断有误**：本计划不构成法律意见，发布前仍建议人工核对弱著佐权义务。
