# 实施计划：使用指南

**分支**: `013-user-guide` | **规格**: [spec.md](spec.md)

## 摘要

使用指南和示例文档的源文件都放在 `resources/samples/`，用 `include_bytes!` 编进程序，不再作为 Tauri 资源分发。新增命令 `open_bundled(name)`：打开时把对应的 Markdown 和全部图片写到 `%LOCALAPPDATA%\io.github.yataome1.inkmark\help\`（覆盖），再像普通文档一样返回内容，但不加入“最近打开”。前端为这两类标签记录 `bundled`，不写入会话；使用指南以只读状态创建。不新增依赖。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 免安装版打不开示例文档 | `sample_path` 取资源目录下的 `samples/demo.md`，CI 的免安装版只复制 `inkmark.exe` | `lib.rs`、`ci.yml` |
| 卸载时删除哪些数据 | 勾选“删除应用程序数据”（默认不勾选）后只删除 `%APPDATA%\io.github.yataome1.inkmark` 与 `%LOCALAPPDATA%\io.github.yataome1.inkmark`；升级时不删。图片文件夹 `%LOCALAPPDATA%\inkmark-images`、设置 `%APPDATA%\Inkmark` 不在其中 | 生成的 `target/release/nsis/x64/installer.nsi` 第 882–896 行 |
| 释放位置 | `app_local_data_dir()` 即 `%LOCALAPPDATA%\io.github.yataome1.inkmark`（WebView2 缓存也在此），其下建 `help` | Tauri 路径 API |
| “最近打开”在哪里加入 | 后端 `read_file`、`save_file` 调用 `remember` | `lib.rs` |
| 会话记录 | 前端 `writeSession` 记录所有有路径的标签；`removeTabs` 把有路径的标签放入“重新打开关闭的标签” | `app.js` |
| 只读 | CodeMirror 的 `EditorState.readOnly` 只阻止键盘与粘贴输入；菜单排版命令、表格单元格（`contentEditable`）、任务复选框直接派发修改，需另加 `changeFilter` 兜底并在这两个部件上判断只读 | `editor.js`、`live-preview.js` |
| 图片拖入、粘贴、收入 | 先把图片存进图片文件夹再插入链接，只读时若只靠兜底会留下无用图片，需在入口处拦截 | `app.js` |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端、Rust |
| 新增依赖 | 无（NFR-1301） |
| 体积 | 指南约 15KB 文本，不放截图；示例文档与图片原本已随安装包分发，改为编进程序后安装包净增约 15KB |
| 测试 | `cargo test`：内置文件清单与 `resources/samples/` 一致、释放与覆盖；`node --test`：指南中的菜单路径与版本占位符；CDP 驱动验收 |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 指南与图片编进程序；指南中不引用网络图片 |
| III Markdown 唯一真相 | ✅ 指南是普通 Markdown 文件 |
| IV 不丢数据 | ✅ 再次打开示例文档前，已打开且有修改时按现有规则询问；只读指南不会产生需要保存的修改；释放只写程序自己的 `help` 文件夹，写入走 `write_atomic` |
| V 安全默认 | ✅ `open_bundled` 只接受固定名称，不接受路径；asset 协议只授权 `help` 文件夹 |
| VI 简单 | ✅ 复用普通文档的打开、显示与图片解析，只增加“内置”和“只读”两个标记 |
| VII 轻量 | ✅ 净增约 15KB |

## 变更文件

```
resources/samples/使用指南.md  新：指南正文
src-tauri/src/bundled.rs       新：内置文件清单（include_bytes!）、释放到 help 文件夹；测试
src-tauri/src/lib.rs           改：open_bundled 命令；remember 跳过 help 文件夹；删除 sample_path、sample_doc
src-tauri/src/menu.rs          改：帮助 → 使用指南、Markdown 示例文档改用 open-bundled；build 去掉 sample 参数
src-tauri/tauri.conf.json      改：删除 bundle.resources；nsis.installerHooks
src-tauri/installer-hooks.nsh  新：安装后删除旧版的 samples 文件夹（FR-1309）
src/editor.js                  改：createDoc 支持只读；setReadOnly
src/live-preview.js            改：只读时表格单元格不可编辑、复选框禁用
src/app.js、platform.js        改：openBundled、bundled/readOnly 标签字段、会话与关闭记录、只读拦截、状态栏
test/guide.test.js             新：菜单路径（FR-1307）与版本占位符
.specify/templates/checklist-template.md  改：增加“使用指南是否需要更新”（FR-1308）
AGENTS.md                      改：resources/samples/ 一行改为“编进程序的使用指南与示例文档”
```

## 设计要点

### 内置与释放（FR-1302、FR-1303）

```rust
const FILES: &[(&str, &[u8])] = &[
    ("使用指南.md", include_bytes!("../../resources/samples/使用指南.md")),
    ("demo.md", include_bytes!("../../resources/samples/demo.md")),
    ("assets/inkmark.png", include_bytes!("../../resources/samples/assets/inkmark.png")),
];
```

- `open_bundled(name)`：`name` 只能是 `guide` 或 `demo`，映射到对应 Markdown。把该 Markdown 与 `assets/` 下全部图片写入 `help` 文件夹（`write_atomic`，覆盖），授权该目录给 asset 协议，返回 `Doc { path, content }`。只写被打开的那个 Markdown，打开指南不会覆盖用户正在练习的示例文档。
- 释放失败（目录不可写）返回错误，前端提示原因、不打开。
- 测试遍历 `resources/samples/`，确认每个文件都在 `FILES` 中，防止新增文件后漏编进程序。

### 不进“最近打开”（FR-1305）

`remember` 判断路径位于 `help` 文件夹内时不调用 `add_recent`（仍授权目录）。这样示例文档练习后按 `Ctrl+S` 保存，也不会进入列表。

### 前端标签

标签新增 `bundled`（`'guide'`、`'demo'` 或空）与 `readOnly` 字段。

- `openBundled(name)`：
  - 指南已打开：切换到该标签。
  - 示例文档已打开：先 `settleDirty([tab])`，用户取消则停止；否则重新释放，用原始内容替换该标签的文档。
  - 未打开：释放后按 `showDoc` 打开，指南以只读创建。
- `writeSession` 跳过 `bundled` 标签；`removeTabs` 记录 `bundled`，“重新打开关闭的标签”对它调用 `openBundled`。
- 另存为成功后清除 `bundled`；若原为只读，调用 `editor.setReadOnly(false)`，新文件可编辑（边界情况）。
- 标签名：指南为“使用指南.md · 只读”；状态栏在只读时显示“只读”。

### 只读（FR-1304）

- `editor.createDoc(text, { readOnly })`：在一个 Compartment 中放入 `EditorState.readOnly.of(true)` 与 `EditorState.changeFilter.of(() => false)`；`setReadOnly(false)` 重新配置为空。
- `live-preview.js`：`view.state.readOnly` 时表格单元格 `contentEditable = 'false'`、任务复选框 `disabled`。
- `app.js` 的 `run`：只读标签上忽略排版命令、表格命令、保存与“收入图片文件夹”，状态栏提示“使用指南为只读，可用‘另存为’保存副本”；拖入、粘贴图片在保存图片之前同样拦截。查找可用，替换由兜底阻止。
- 选择、复制文字与图片右键菜单不涉及修改，照常可用。

### 入口（FR-1301）

- 菜单“帮助”第一项“使用指南”，第二项“Markdown 示例文档”，命令 `open-bundled:guide`、`open-bundled:demo`。不分配快捷键（`F1` 仍为键盘快捷键）。
- 起始页“开始”区域：“使用指南”放在“查看示例文档”之前。

### 指南内容（FR-1306）

按规格用户故事 2 的章节写作。开头写“适用于 Inkmark {{version}}”；“数据与隐私”写明三处位置（图片文件夹、设置、程序数据），以及卸载时只有勾选“删除应用程序数据”才会清除程序数据、图片与设置保留，并给出手动删除方法。快捷键一节只写“按 `F1` 查看”。

### 一致性测试（FR-1307）

`test/guide.test.js`：

1. 从 `menu.rs` 取出所有菜单文字（去掉 `(&F)` 这类访问键）。
2. 在指南中找出形如“文件 → 图片文件夹…”的路径，逐级检查名称都存在，不存在时报出该路径。
3. 指南开头含 `{{version}}`：释放时由后端替换为程序版本，不需要每次发布手动修改。

### 旧版资源清理（FR-1309）

旧版把示例文档作为 Tauri 资源装在 `安装目录\samples`。新版不再声明这些资源，Tauri 的卸载程序只删除自己记录的文件，升级后 `samples` 会永久残留，安装目录也因此删不掉（验收时实测确认）。用 Tauri 的 `NSIS_HOOK_POSTINSTALL` 钩子在安装完成后执行 `RMDir /r "$INSTDIR\samples"`。这个文件夹只存放旧版自带的示例，用户文件不会放在这里。

## IPC 契约变更

| 方法 | 方向 | 说明 |
|---|---|---|
| `open_bundled(name)` | 前端 → Rust | 新增：释放并读取使用指南（`guide`）或示例文档（`demo`），返回 `Doc`，不加入最近打开 |
| `sample_doc()` | 前端 → Rust | 删除：由 `open_bundled('demo')` 代替 |
| 菜单命令 `open-bundled:{name}` | Rust → 前端 | 新增；示例文档原用 `open-path:{资源路径}` |

## 实施阶段

1. **后端**：`bundled.rs`、`open_bundled`、`remember` 跳过、菜单、删除资源配置；Rust 测试。
2. **前端**：只读、内置标签、会话与关闭记录、入口。
3. **指南**：写正文、`guide.test.js`、模板与 AGENTS.md。
4. **验证与文档**：验收（含免安装版只复制 exe 的场景）、回归、CHANGELOG。卸载场景需在本机安装后卸载，执行前征得同意。

## 风险

- **R1 只读漏网**：新增的编辑入口可能绕过只读。应对：`changeFilter` 兜底保证文档不变；验收时逐项尝试输入、粘贴、拖入、排版命令、表格、复选框、替换。
- **R2 指南过期**：功能变化后指南未更新。应对：菜单路径由测试检查，版本号释放时自动填入；验收清单模板增加提醒项。
- **R3 已安装用户升级**：旧版的 `samples` 文件夹在升级后残留。应对：安装钩子删除（FR-1309）。
