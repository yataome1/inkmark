# 实施计划：“关于”与帮助菜单

**分支**: `009-about-dialog` | **规格**: [spec.md](spec.md)

## 摘要

“关于”改为前端的 `<dialog>` 模态对话框，版本和运行环境由新命令 `app_info` 提供，提交号和构建日期在 vendor 阶段生成。第三方声明由构建脚本从 `cargo metadata` 和 `package-lock.json` 生成到 `src/vendor/`，缺少许可信息时构建失败。所有外部链接由 Rust 按固定列表打开，前端只传链接名称。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| Rust 依赖范围 | `cargo metadata --filter-platform x86_64-pc-windows-msvc`，从根包沿 normal 依赖遍历，共 235 个包 | 2026-11-09 实测 |
| Rust 许可信息 | 全部有 SPDX 表达式；5 个包没有许可文件：`alloc-stdlib`、`selectors`、`webview2-com`、`webview2-com-macros`、`webview2-com-sys` | 实测 |
| 前端依赖范围 | `package-lock.json` 中非 dev、非 optional 的包，共 150 个；比实际打包的略多，宁多不漏 | 实测 |
| 前端许可信息 | 全部有许可文件；`khroma` 的 `package.json` 没有 license 字段（文件为 MIT） | 实测 |
| 声明体积 | 许可全文约 2.3MB，按内容去重后约 650KB；作为前端资源随程序压缩内嵌，打开第三方声明时才加载 | 实测 |
| 免安装版 | 只有单个 exe，声明必须放进前端资源，不能放 Tauri `resources` | `ci.yml` |
| 模态对话框 | 原生 `<dialog>.showModal()`：焦点限制、`Esc`、关闭后还原焦点、背景不可操作都由浏览器提供 | WebView2 |
| WebView2 版本 | `tauri::webview_version()` | Tauri 2 |
| Windows 版本 | `RtlGetVersion`，内部版本号 ≥ 22000 显示为 Windows 11；声明一个外部函数，不新增依赖 | ntdll |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端、Rust 命令与菜单、构建脚本 |
| 新增依赖 | 无（NFR-902） |
| 体积影响 | 第三方声明压缩后预计 200KB 内，打包后实测 |
| 测试 | `node --test`：版本信息文本、许可汇总；`cargo test`：链接表；CDP 驱动验收 |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 许可全文随包；链接只由用户单击后在系统浏览器打开，无自动请求 |
| III Markdown 唯一真相 | ✅ 不涉及文档内容 |
| IV 不丢数据 | ✅ 不替换文档、不写文件；对话框打开时其他命令不生效 |
| V 安全默认 | ✅ 不新增前端权限；`open_link` 只接受固定名称；许可文本用 `textContent` 显示 |
| VI 简单 | ✅ 不做更新检查；不新增配置项 |
| VII 轻量 | ✅ 无依赖；CI 体积检查不变 |

## 变更文件

```
scripts/third-party.mjs     新：收集依赖、校验、生成 src/vendor/third-party.json
scripts/vendor.mjs          改：调用上述脚本；生成 build-info.json；复制 LICENSE
src/shortcuts.js            新：快捷键列表数据（分组、操作名称、按键、适用位置）
src/about.js                新：对话框、版本信息、复制、许可证、第三方声明与快捷键视图
src/index.html、styles.css  改：<dialog id="about">、样式
src/app.js                  改：about、third-party、shortcuts、link 命令，KEYMAP 增加 F1；对话框打开时屏蔽其他快捷键和菜单命令
src/platform.js             改：appInfo、openLink
src-tauri/src/lib.rs        改：app_info、open_link，菜单事件
src-tauri/src/menu.rs       改：帮助菜单
src-tauri/tauri.conf.json   改：bundle.publisher、bundle.copyright
LICENSE、package.json、src-tauri/Cargo.toml   改：署名 zhangmian
test/about.test.js          新
test/shortcuts.test.js      新：列表与 menu.rs、KEYMAP 的一致性
README.md、CHANGELOG.md
```

## 设计要点

### 第三方声明

```js
// src/vendor/third-party.json
{ texts: ["去重后的许可原文", ...], packages: [{ name, version, license, source: 'npm' | 'cargo', texts: [下标] }] }
```

- 校验：包缺少许可表达式或许可文本且不在例外表中时，脚本以非零退出，`npm run vendor` 失败，本地构建和 CI 随之失败（FR-905）。
- 例外表写在脚本中，只含调研发现的 6 个包：`khroma` 补表达式 `MIT`；5 个 Rust 包使用对应 SPDX 标准文本，版权人取自包的 authors。标准文本放在 `scripts/license-texts/`。新增依赖不会自动进入例外表。
- CI 中 `npm run vendor` 所在的 job 已安装 Rust 工具链，打包 job 同样需要。

### 版本信息

- `build-info.json`：`{ commit, date }`，由 vendor 阶段写入；无法获取提交号时为 `未知`。
- `app_info` 返回 `{ version, tauri, webview2, windows }`，读取失败的项为 `null`，界面显示“未知”。
- `about.js` 的 `versionText(info)` 是纯函数，生成复制用的多行文本。

### 对话框

- 同一个 `<dialog>` 内切换四个视图：关于、许可证全文、第三方声明、键盘快捷键。从“关于”进入的子视图有“返回”，按 `F1` 直接打开快捷键视图时只有“关闭”。
- 单击背景关闭：判断事件目标是 `<dialog>` 本身，内部内容包一层容器。
- 已打开时再次触发不做处理（`dialog.open`）。
- `KEYMAP` 处理和 `run` 在对话框打开时直接返回，避免 `Ctrl+W` 等作用到背后的文档；对话框内的 `Esc`、`Tab` 由浏览器处理。
- 第三方声明首次打开时才 `fetch('vendor/third-party.json')`，列表用 `<details>` 展开原文。

### 快捷键列表

- `shortcuts.js` 是纯数据，浏览器与 Node 共用：`[{ group, items: [{ label, keys, where? }] }]`。按 CSS 多栏显示，窄窗口单栏。
- 列表是 `KEYMAP`、`menu.rs` 之外的第三处快捷键文字，由 `shortcuts.test.js` 防止不一致：解析 `menu.rs` 中的快捷键文字和 `app.js` 的 `KEYMAP`，任一项不在列表中时失败。`Ctrl+1…6`、`Alt+1…8` 这类循环生成的项按展开后比较。
- `F1` 不属于文档命令，起始页可用；对话框已打开时不响应。

### 链接

`open_link(kind)` 的 `kind` 为 `home`、`changelog`、`issues`、`releases`，Rust 中映射为固定地址，由 `opener` 打开。菜单项 id 为 `link:<kind>`，走同一映射。

| kind | 地址 |
|---|---|
| `home` | `https://github.com/yataome1/inkmark` |
| `changelog` | `.../blob/main/CHANGELOG.md` |
| `issues` | `.../issues/new/choose` |
| `releases` | `.../releases` |

### 署名

`LICENSE` 的版权行、`package.json` 的 `author`、`Cargo.toml` 的 `authors` 改为 `zhangmian`，并移除元数据中的邮箱，与“问题反馈统一走 Issue”一致。历史提交不改写。

## IPC 契约变更

| 方法 | 方向 | 说明 |
|---|---|---|
| `app_info()` | 前端 → Rust | 新增：版本与运行环境 |
| `open_link(kind)` | 前端 → Rust | 新增：打开固定的项目链接，未知名称返回错误 |
| `command` 事件 | Rust → 前端 | 新增 `about`、`third-party`、`shortcuts`；原 `about` 系统消息框移除 |

## 实施阶段

1. **第三方声明**：脚本、校验、例外表。
2. **对话框（US1、US2）**：`app_info`、构建信息、三个视图、复制、键盘与主题。
3. **帮助入口（US3）与署名**：`open_link`、帮助菜单、元数据。
4. **键盘快捷键（US4）**：列表数据、视图、`F1`、一致性测试。
5. **验证与文档**：断网查看、完整检查、打包体积、README、CHANGELOG。

## 风险

- **R1 依赖许可变化**：升级后可能出现新的缺失项。应对：构建失败并列出包名，由人工确认后处理。
- **R2 宽松收集与实际分发不一致**：前端列表比实际打包略多，不影响合规；Rust 列表按目标平台过滤。
- **R3 `EPL-2.0 OR GPL-3.0-or-later`、`MPL-2.0` 等非宽松许可**：Mermaid 依赖链和 Rust 依赖中存在。声明中如实列出；是否需要额外义务（如提供源码获取方式）不由本计划判定，发布前建议人工核对。
- **R4 私有仓库的链接**：无权限者会看到 GitHub 404，已在规格中说明。
