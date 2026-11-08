# 任务清单：编辑器内核替换为 CodeMirror 6

**输入**: [spec.md](spec.md)、[plan.md](plan.md)
**格式**: `[ID] [P?] [Story] 描述` —— `[P]` 表示可并行（不同文件、无依赖）。

## 阶段 1：基础
- [x] T601 宪章 1.2.0 与 AGENTS.md：vendor 阶段允许 esbuild 打包第三方库，应用代码仍不打包
- [x] T602 `scripts/vendor.mjs` + `vendor-entry.mjs`：打包 CodeMirror 与 markdown-it，复制 KaTeX、Mermaid、highlight.js；`package.json` 依赖改为精确版本，移除 `vditor`；输出体积
- [x] T603 [P] [US2] `src/doc-format.js`（BOM、换行符拆分与还原）+ `test/doc-format.test.js`
- [x] T604 [P] `src/render.js`：KaTeX、Mermaid 队列与缓存、highlight.js、图片地址解析

## 阶段 2：用户故事 1、2 —— 编辑器骨架、撤销、不改写文件 (P1)
- [x] T605 [US1] [US2] `src/editor.js`：创建视图、`history`、载入（新状态，清空历史）、取文本、脏标记、源代码模式（Compartment）
- [x] T606 [US2] `app.js` 接入：打开、保存（还原 BOM/换行符）、另存为、`confirmLeave`、标题栏、字数；删除 Vditor 相关代码与样式
- [x] T607 [US1] [US2] CDP 验证：撤销耗时与其他块 DOM 不变；demo.md、长文档、CRLF、BOM 文件“打开→保存”逐字节相同

## 阶段 3：用户故事 3 —— Typora 式即时渲染 (P1)
- [x] T608 [US3] `src/live-preview.js` 框架：StateField、激活判定、可视区域遍历、输入法组合期间不重算
- [x] T609 [US3] 行内元素：标题、强调、删除线、行内代码、==高亮==（lezer 扩展）、链接（`Ctrl+单击`）、行内 HTML 白名单
- [x] T610 [US3] 图片与行内公式（lezer 扩展）；激活时源码 + 保留渲染
- [x] T611 [US3] 块公式、Mermaid：未激活小部件替换；激活时源码 + 下方实时预览
- [x] T612 [US3] 代码块：围栏行显隐、highlight.js 着色
- [x] T613 [US3] 列表、任务列表（可点击复选框）、引用、分隔线、脚注、`[TOC]`
- [x] T614 [US3] 表格小部件：渲染、单元格编辑只替换该单元格源码、`|` 转义、撤销转交
- [x] T615 [US3] `styles.css` 编辑区排版与深色主题
- [ ] T616 [US3] 中文输入法实测（微软拼音：候选、`Esc` 取消、候选框位置、表格单元格内输入）

## 阶段 4：用户故事 4 —— 不跳动 (P1)
- [ ] T617 [US4] `src/anchor.js`：点击与键盘锚定（`requestMeasure` 同帧补偿）、输入时以光标行锚定 + `Anchor.delta` 单元测试
- [ ] T618 [US4] CDP 逐帧 + 真实鼠标/方向键验证（≤ 2px、光标可见、拖选不受影响）

## 阶段 5：用户故事 5 —— 现有功能 (P1)
- [ ] T619 [US5] 格式命令（`FORMAT`、标题、段落、插入表格/公式块等），每个命令一个事务；`KEYMAP` 与菜单一致
- [ ] T620 [P] [US5] `src/find.js` 重写：查找、替换、全部替换、源代码模式可用
- [ ] T621 [P] [US5] 大纲按行号跳转、专注模式、打字机模式
- [ ] T622 [US5] 图片粘贴与拖入
- [ ] T623 [US5] 导出：`export.js` 改用 markdown-it + `render.js` + `test/markdown-html.test.js`；HTML 与 PDF 对比 0.2.1

## 阶段 6：验证与发布
- [ ] T624 NFR-601 性能实测（长文档与约 10000 行文档）；NFR-604 启动时间与内存
- [ ] T625 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [ ] T626 按 spec 验收场景逐条验证 + 002 清单回归，记录于 `checklist.md`；release 构建确认安装包 ≤ 3.55MB、免安装版 ≤ 15MB
- [ ] T627 README（特性、致谢）、CHANGELOG、版本 0.3.0

## 依赖
阶段 1 → 阶段 2 → 阶段 3 → 阶段 4、5（可并行）→ 阶段 6。T608 先于 T609–T614；T604 先于 T610–T612、T623。
