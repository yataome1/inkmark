# 任务清单：表格编辑、可调整宽度的侧边栏、收藏夹

**输入**: [spec.md](spec.md)、[plan.md](plan.md)
**格式**: `[ID] [P?] [Story] 描述` —— `[P]` 表示可并行（不同文件、无依赖）。

## 阶段 1：基础
- [x] T201 [P] `src/contextmenu.js` 通用右键菜单（键盘操作、边界处理、关闭时机）
- [x] T202 [P] Rust：`path_info` 命令 + 测试；`settings.rs` 默认值（`favorites`、`sidebar.width`）+ 测试
- [x] T203 [P] Rust：`menu.rs` 增加“收藏/取消收藏当前文件”“视图 → 收藏”；`platform.js` 增加 `pathInfo`

## 阶段 2：用户故事 1 —— 表格编辑 (P1)
- [x] T204 [US1] `src/table-utils.js`：`parseTable`、`formatTable`（显示宽度、转义 `|`、行内代码）+ `test/table-utils.test.js`
- [x] T205 [US1] `table-utils.js`：增删/移动行列、对齐、调整大小、新建表格 + 测试（含 FR-207 约束）
- [x] T206 [US1] `src/table.js`：`applyTableEdit` —— 只替换当前表格的文字、一步撤销、聚焦目标单元格
- [x] T207 [US1] 尺寸选择器（插入表格与调整大小共用），替换 `Ctrl+T` 的旧行为
- [x] T208 [US1] 表格工具条（调整大小、对齐、删除表格、更多）
- [x] T209 [US1] 单元格右键菜单（含置灰规则）
- [x] T210 [US1] 表格快捷键：`Ctrl+Enter`、`Ctrl+Shift+Backspace`、`Tab`/`Shift+Tab`、最后单元格 `Tab`
- [x] T211 [US1] 行/列拖动手柄与指示线（Pointer Events）
- [x] T212 [US1] 性能与隔离实测：长文档中表格操作 < 50ms，其他块 DOM 不变（NFR-202、FR-216）

## 阶段 3：用户故事 2 —— 侧边栏分割线 (P1)
- [x] T213 [US2] `src/resizer.js`：悬停高亮、拖动、范围限制、阈值收起/拖出展开、双击复位、键盘、持久化、窗口缩放收窄

## 阶段 4：用户故事 3 —— 收藏夹 (P1)
- [x] T214 [US3] 侧边栏“收藏”页与 `Ctrl+Shift+2`；`src/favorites.js` 列表渲染（图标、名称、父目录、当前文件高亮、不存在标记、空状态）
- [x] T215 [US3] 添加入口：文件树与根文件夹 ☆/★、右键菜单、“收藏当前文件”命令
- [x] T216 [US3] 打开（文件/文件夹）、× 移除、键盘操作
- [x] T217 [US3] 拖动排序（Pointer Events，4px 阈值、指示线）与持久化

## 阶段 5：文档与验证
- [x] T220 更新 README（特性、快捷键）、CHANGELOG、`resources/samples/demo.md`（表格说明）
- [x] T221 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T222 按 spec 验收场景逐条验证 + 006 清单回归，记录于 `checklist.md`；release 构建确认安装包 ≤ 10MB

## 依赖
阶段 1 → 阶段 2、3、4（彼此独立）→ 阶段 5。T204–T205 先于 T206–T211。
