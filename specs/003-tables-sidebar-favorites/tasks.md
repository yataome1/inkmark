# 任务清单：表格编辑、可调整宽度的侧边栏、收藏夹、点击时内容不跳动

**输入**: [spec.md](spec.md)、[plan.md](plan.md)
**格式**: `[ID] [P?] [Story] 描述` —— `[P]` 表示可并行（不同文件、无依赖）。

## 阶段 1：基础
- [ ] T201 [P] `src/contextmenu.js` 通用右键菜单（键盘操作、边界处理、关闭时机）
- [ ] T202 [P] Rust：`path_info` 命令 + 测试；`settings.rs` 默认值（`favorites`、`sidebar.width`）+ 测试
- [ ] T203 [P] Rust：`menu.rs` 增加“收藏/取消收藏当前文件”“视图 → 收藏”；`platform.js` 增加 `pathInfo`

## 阶段 2：用户故事 1 —— 表格编辑 (P1)
- [ ] T204 [US1] `src/table-utils.js`：`parseTable`、`formatTable`（显示宽度、转义 `|`、行内代码）+ `test/table-utils.test.js`
- [ ] T205 [US1] `table-utils.js`：增删/移动行列、对齐、调整大小、新建表格 + 测试（含 FR-207 约束）
- [ ] T206 [US1] `src/table.js`：`applyTableEdit` —— 只把当前表格转为 Markdown、变换、渲染片段替换原 `<table>`、记录撤销、恢复光标、触发 onChange（不调用 `setValue`）；单元格内容往返测试（R1）
- [ ] T207 [US1] 尺寸选择器（插入表格与调整大小共用），替换 `Ctrl+T` 的旧行为
- [ ] T208 [US1] 表格工具条（调整大小、对齐、删除表格、更多）
- [ ] T209 [US1] 单元格右键菜单（含置灰规则）
- [ ] T210 [US1] 表格快捷键：`Ctrl+Enter`、`Ctrl+Shift+Backspace`、最后单元格 `Tab`
- [ ] T211 [US1] 行/列拖动手柄与指示线（Pointer Events）
- [ ] T212 [US1] 性能与隔离实测：约 1000 行、15 个表格、15 个 Mermaid 图的文档中，表格操作（含记录撤销）< 50ms，且其他块的 DOM 节点引用不变（NFR-202、FR-216）

## 阶段 3：用户故事 2 —— 侧边栏分割线 (P1)
- [ ] T213 [US2] `src/resizer.js`：悬停高亮、拖动、范围限制、阈值收起/拖出展开、双击复位、键盘、持久化、窗口缩放收窄

## 阶段 4：用户故事 3 —— 收藏夹 (P1)
- [ ] T214 [US3] 侧边栏“收藏”页与 `Ctrl+Shift+2`；`src/favorites.js` 列表渲染（图标、名称、父目录、当前文件高亮、不存在标记、空状态）
- [ ] T215 [US3] 添加入口：文件树与根文件夹 ☆/★、右键菜单、“收藏当前文件”命令
- [ ] T216 [US3] 打开（文件/文件夹）、× 移除、键盘操作
- [ ] T217 [US3] 拖动排序（Pointer Events，4px 阈值、指示线）与持久化

## 阶段 5：用户故事 4 —— 点击时内容不跳动 (P1)
- [ ] T218 [US4] `src/anchor.js`：点击锚定与键盘锚定 FR-217（选锚点、按帧补偿、输入即停、模式判断）+ 补偿计算纯函数的单元测试
- [ ] T219 [US4] 用 CDP 逐帧记录 + 真实鼠标点击验证图表、公式、代码块、图片的展开与收起（位移 ≤ 2px），及方向键移入/移出（位移 ≤ 2px、光标可见），并确认打字、PageUp/PageDown、源代码模式、打字机模式、拖选不受影响

## 阶段 6：文档与验证
- [ ] T220 更新 README（特性、快捷键）、CHANGELOG（Unreleased）、`resources/samples/demo.md`（表格说明）
- [ ] T221 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [ ] T222 按 spec 验收场景逐条验证 + 002 清单回归，记录于 `checklist.md`；release 构建确认安装包 ≤ 10MB

## 依赖
阶段 1 → 阶段 2、3、4、5（彼此独立）→ 阶段 6。T204–T205 先于 T206–T211。
