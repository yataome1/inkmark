# 任务清单：开源合规与法律风险控制

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：许可（US1、US2）

- [x] T1001 [US2] `scripts/license-policy.mjs` + `test/license-policy.test.js`：表达式解析、许可选择、拦截
- [x] T1002 [US1] `scripts/third-party.mjs`：输出所选许可与源码地址
- [x] T1003 [US1] `src/about.js`：第三方声明说明、所选许可、源码地址

## 阶段 2：文本（US3、US4、US5）

- [x] T1004 [US4] “关于”免责声明
- [x] T1005 [US3] 元数据、“关于”副标题、示例文档、README、Issue 模板收缩 Typora 名称
- [x] T1006 [US5] `CONTRIBUTING.md`、PR 模板：贡献授权与 DCO

## 阶段 3：验证

- [x] T1007 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`；模拟 GPL 组件构建失败
- [x] T1008 按验收场景验证，记录于 `checklist.md`；CHANGELOG
