# 任务清单：发布文件的校验和与构建证明

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：CI

- [x] T1701 [US1][US2] `ci.yml` `release`（Windows）：构建证明、`.sha256`、上传；任务权限
- [x] T1702 [US1][US2] `ci.yml` `release-mac`：构建证明、`.sha256`、上传；任务权限

## 阶段 2：文档

- [x] T1703 [US3] README、README.en：“核对下载的文件”
- [x] T1704 [US3] 使用指南：常见问题增加核对方法
- [x] T1705 CHANGELOG

## 阶段 3：验证

- [x] T1706 `npm run lint`、`npm test`；本地按 CI 中的命令生成 `.sha256` 并用 `shasum -c` 核对；YAML 语法检查
- [x] T1707 下一个版本发布后按验收场景核对，记录于 `checklist.md`（v0.9.1）
