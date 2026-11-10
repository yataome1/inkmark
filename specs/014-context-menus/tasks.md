# 任务清单：统一右键菜单与屏蔽浏览器内核默认行为

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：实测与原型

- [x] T1401 实测排查表第 8、9 项；验证图表关闭 HTML 标签后可转 PNG

## 阶段 2：后端

- [x] T1402 [US2] [US3] `src-tauri/src/webview.rs`：默认菜单、浏览器快捷键（发布版）、网址提示、自动填充

## 阶段 3：前端

- [x] T1403 [US1] [US2] `src/edit-menu.js`：右键分派、菜单项生成、输入框菜单、选中文字复制
- [x] T1404 [US1] 编辑器命令（撤销、重做、全选、粘贴）、链接、公式、图表复制为图片；右键按下拦截；`Shift+F10` 与菜单键
- [x] T1405 `test/edit-menu.test.js`

## 阶段 4：验证与文档

- [x] T1406 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T1407 按验收场景验证（CDP + 发布版人工确认），记录于 `checklist.md`；回归
- [x] T1408 CHANGELOG；012 规格 FR-1204 注记
