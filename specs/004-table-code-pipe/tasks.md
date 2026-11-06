# 任务清单：表格单元格行内代码中的 `\|` 不再丢失

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：用户故事 1 (P1)
- [x] T401 [US1] `src/text-utils.js`：`escapeTableCodePipes` + `test/text-utils.test.js`（FR-401、FR-402）
- [x] T402 [US1] `src/app.js`：编辑器就绪时包装 Lute 的三个方法

## 阶段 2：验证与发布
- [x] T403 CDP 在应用中验证验收场景 1–6 与 NFR-401，记录于 `checklist.md`
- [x] T404 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T405 版本 0.2.1：`package.json`、`src-tauri/Cargo.toml`、`CHANGELOG.md`

## 依赖
T401 → T402 → T403 → T404、T405
