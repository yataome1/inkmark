# 任务清单：使用指南

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：后端

- [x] T1301 [US3] `src-tauri/src/bundled.rs`：内置文件清单、释放到 `help` 文件夹；清单与 `resources/samples/` 一致的测试
- [x] T1302 [US1] [US3] `lib.rs`：`open_bundled`；`remember` 跳过 `help` 文件夹；删除 `sample_path`、`sample_doc`
- [x] T1303 [US1] `menu.rs`：帮助 → 使用指南、Markdown 示例文档改用 `open-bundled`；`tauri.conf.json` 删除资源配置

## 阶段 2：前端

- [x] T1304 [US1] `editor.js`、`live-preview.js`：只读文档、表格单元格与复选框
- [x] T1305 [US1] [US3] `app.js`、`platform.js`：`openBundled`、会话与关闭记录、只读拦截、另存为、状态栏与标签名、起始页入口

## 阶段 3：指南

- [x] T1306 [US2] `resources/samples/使用指南.md`
- [x] T1307 [US5] `test/guide.test.js`：菜单路径；版本号释放时填入
- [x] T1308 [US5] 验收清单模板、`AGENTS.md`

- [x] T1312 [US4] `installer-hooks.nsh`：安装后删除旧版的 `samples`

## 阶段 4：验证与文档

- [x] T1309 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T1310 按验收场景验证，含只复制 exe 的免安装版；真实升级安装与卸载；记录于 `checklist.md`；回归
- [x] T1311 CHANGELOG
