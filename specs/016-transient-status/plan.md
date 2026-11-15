# 实施计划：状态栏的一次性提示自动消失

**分支**: `016-transient-status`（基于 `main`，含 015） | **规格**: [spec.md](spec.md)

## 摘要

状态栏增加一个独立的 `#status-message` 用于一次性提示，`#status-flags` 只由 `updateStatus()` 写持续状态。新增可测试模块 `src/status-message.js`：`create(el)` 返回 `show(text)`，写入文字并在 4 秒后清空，再次调用时取消旧计时重新开始。`app.js` 中所有直接写 `#status-flags` 的一次性提示，以及传给 `ImageFolder`、`ImageMenu`、`EditMenu` 的 `onStatus`，统一改为调用 `showStatus(text)`。不新增依赖，不改后端。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 一次性提示的写入点 | `app.js` 中 `saveAll`、`restoreSession`、`exportShare`、`importImages`（2 处）、`exportAs`、`readOnlyHint` 直接写 `#status-flags.textContent`；`ImageFolder.create`、`ImageMenu.attach`、`EditMenu.attach` 的 `onStatus` 回调也写同一元素 | `grep status-flags src/` |
| 为何提示不消失、遮住持续状态 | 两类内容共用一个元素，没有清除逻辑；`updateStatus()` 刷新时又会冲掉提示 | `app.js` `updateStatus()` |
| 计时器能否在 Node 中测试 | `node:test` 的 `mock.timers` 可模拟 `setTimeout`（Node ≥ 20.4，本机 23） | Node 文档 |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端 |
| 新增依赖 | 无（NFR-1601） |
| 测试 | `node --test`：`test/status-message.test.js`（模拟计时器）；手动按验收场景验证 |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 无网络访问 |
| III Markdown 唯一真相 | ✅ 不涉及文档内容 |
| IV 不丢数据 | ✅ 不涉及文件写入 |
| V 安全默认 | ✅ 不新增 IPC 命令与权限 |
| VI 简单 | ✅ 一个函数统一写入；时长固定，不加配置项 |
| VII 轻量 | ✅ 新增约 20 行前端代码，无依赖 |

## IPC 契约

无变化。

## 变更文件

```
src/status-message.js         新：create(el) → { show(text) }（FR-1601、FR-1602）
src/index.html                改：状态栏增加 #status-message；引入 status-message.js
src/styles.css                改：状态栏不换行；#status-message 过长时省略，不挤掉字数统计
src/app.js                    改：showStatus(text)；所有一次性提示与 onStatus 改走它（FR-1603、FR-1604）
test/status-message.test.js   新
```

## 设计要点

- `#status-flags` 与 `#status-message` 相邻显示，二者由 `#statusbar` 原有的 `gap` 分隔；`#status-flags` 为空时不占位。
- `show(text)`：`clearTimeout` 旧计时 → 写入文字 → 文字非空时 `setTimeout(4000)` 清空。空文字立即清空且不计时。
- `#statusbar` 设 `white-space: nowrap`，`#status-message` 设 `min-width: 0`、`overflow: hidden`、`text-overflow: ellipsis`，完整文字放在 `title` 中：窗口变窄时只有提示收缩，长导出路径不挤掉右侧字数统计（边界情况）。
- 只给提示设 `nowrap` 不够：实测窄窗口下“即时渲染”等栏目被压缩，中文可在任意两字间断行，状态栏变为两到三行高；因此整条状态栏不换行。
- `updateStatus()` 不再触碰提示元素，因此切换标签、专注、打字机不清除提示（验收 US2-2）。
