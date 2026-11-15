# 任务清单：状态栏的一次性提示自动消失

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：可测试模块

- [x] T1601 [US1] `src/status-message.js`：`create(el)` → `show(text)`，4 秒后清空，新提示重新计时
- [x] T1602 [US1] `test/status-message.test.js`：模拟计时器验证消失、重新计时、空文字

## 阶段 2：接入

- [x] T1603 [US2] `index.html`、`styles.css`：状态栏增加 `#status-message`，过长时省略，状态栏保持一行
- [x] T1604 [US1][US2] `app.js`：`showStatus(text)`；替换所有一次性提示的直接写入与 `onStatus` 回调

## 阶段 3：验证与文档

- [x] T1605 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T1606 按验收场景验证，记录于 `checklist.md`
- [x] T1607 CHANGELOG
