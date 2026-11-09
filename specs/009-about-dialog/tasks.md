# 任务清单：“关于”与帮助菜单

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：第三方声明（US2）

- [x] T901 [US2] `scripts/third-party.mjs`：收集依赖、校验、例外表、生成 `src/vendor/third-party.json`
- [x] T902 [US2] `scripts/vendor.mjs`：调用生成脚本，写入 `build-info.json`，复制 `LICENSE` 与图标

## 阶段 2：对话框（US1、US2）

- [x] T903 [US1] `app_info`：版本、Tauri、WebView2、Windows
- [x] T904 [US1] `src/about.js`：对话框、版本信息、复制、键盘与主题；打开时屏蔽其他命令
- [x] T905 [US2] 许可证全文与第三方声明视图

## 阶段 3：帮助入口与署名（US3）

- [x] T906 [US3] `open_link`、帮助菜单
- [x] T907 [US3] `LICENSE`、项目元数据、`bundle.copyright` 署名 zhangmian

## 阶段 4：键盘快捷键（US4）

- [x] T908 [US4] `src/shortcuts.js`、快捷键视图、`F1`
- [x] T909 [US4] `test/shortcuts.test.js`：列表与 `menu.rs`、`KEYMAP` 的一致性

## 阶段 5：验证与文档

- [x] T910 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T911 按验收场景验证，记录于 `checklist.md`；打包确认体积
- [x] T912 README、CHANGELOG
