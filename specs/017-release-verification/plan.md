# 实施计划：发布文件的校验和与构建证明

**分支**: `017-release-verification`（基于 `main`） | **规格**: [spec.md](spec.md)

## 摘要

只改 CI 的两个发布任务与文档。`release`（Windows）与 `release-mac` 在收集产物、检查体积之后：
1. 用 GitHub 官方的 `actions/attest-build-provenance` 为每个安装文件生成构建证明（FR-1702）；
2. 为每个安装文件生成同名 `.sha256` 文件（`<哈希>  <文件名>`，与 `shasum -a 256` 输出格式相同），与安装文件一起上传（FR-1701）。

README、README.en、使用指南增加“核对下载的文件”说明（FR-1703）。不改应用代码。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 构建证明是否免费 | 公开仓库免费；私有仓库需要 Enterprise。本仓库为公开仓库 | GitHub 文档“Artifact attestations” |
| 所需权限 | 任务级 `id-token: write`、`attestations: write`（另需原有的 `contents: write` 上传 Release） | `attest-build-provenance` 说明 |
| 版本 | `actions/attest-build-provenance@v4`（最新 v4.2.2，2026-08）；与其他 action 一样按主版本引用 | GitHub releases |
| 校验文件形式 | 每个安装文件一个 `.sha256`，而非合并的 `SHA256SUMS`：两个发布任务各自上传，无需再加一个汇总任务；macOS 上 `shasum -a 256 -c <文件>.sha256` 直接可用 | — |
| Windows 上的格式 | PowerShell 写出小写哈希、两个空格、文件名，UTF-8 无 BOM、LF 结尾，保证 `shasum -c` 也能读 | — |
| 用户如何核对证明 | `gh attestation verify <文件> --repo yataome1/inkmark`；或仓库页面 Actions → Attestations | GitHub CLI 文档 |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及 | `.github/workflows/ci.yml`、README、README.en、`resources/samples/使用指南.md`、CHANGELOG |
| 新增依赖 | 无（NFR-1701）；CI 中新增一个 GitHub 官方 action |
| 测试 | 发布流程只在推送版本标签时运行，无法在 PR 中执行；`npm test` 的使用指南测试照常；发布后按验收场景手动核对（checklist 中如实记录） |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 应用不变；核对是用户自愿执行的命令 |
| III Markdown 唯一真相 | ✅ 不涉及 |
| IV 不丢数据 | ✅ 不涉及 |
| V 安全默认 | ✅ 增强：下载者可核对来源；CI 新权限只给两个发布任务，且仅用于签发证明 |
| VI 简单 | ✅ 每个任务两步；不新增汇总任务 |
| VII 轻量 | ✅ 安装文件不变；每个 `.sha256` 约 100 字节 |

## IPC 契约

无变化。

## 变更文件

```
.github/workflows/ci.yml        改：release、release-mac 增加构建证明与 .sha256，权限按任务授予
README.md、README.en.md          改：“核对下载的文件”
resources/samples/使用指南.md    改：常见问题增加“怎么确认下载的安装文件可信？”
CHANGELOG.md                    改：Unreleased
```

## 设计要点

- 顺序：收集产物 → 体积检查 → 构建证明（`subject-path` 指向安装文件，不含 `.sha256`）→ 生成 `.sha256` → 上传 Release（安装文件与 `.sha256`）。
- 两个文档对两种核对的作用说清楚：校验和发现下载损坏或途中被替换；构建证明证明文件由本仓库的发布流程从某次提交构建。都不等同于 Apple / Microsoft 的代码签名，首次打开仍需放行。
