# 任务清单：编辑区图片的右键菜单

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：后端

- [x] T1201 [US1] `src-tauri/src/clipboard.rs`：`CF_HDROP` 放入文件、占用时重试；缓冲区构造测试
- [x] T1202 [US1] `lib.rs`：`found_image`、`read_image`、`copy_image_file`、`save_image_as`、`open_image`；`reveal_path` 接受图片

## 阶段 2：前端

- [x] T1203 [US1] `src/image-menu.js`：拦截右键按下与右键菜单，菜单项与启用状态
- [x] T1204 [US1] 复制为 PNG（含 SVG）、图片另存为、状态栏提示

## 阶段 3：验证与文档

- [x] T1205 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T1206 按验收场景验证，记录于 `checklist.md`；回归
- [x] T1207 CHANGELOG
