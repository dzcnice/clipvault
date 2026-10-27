# ClipVault

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Version](https://img.shields.io/badge/version-v3.4.0-brightgreen)](#开发)

**ClipVault** 是基于官方 DeepSeek Harness 原生会话的个人 AI 编程工作台：保留系统安全存储保护的凭证、剪贴板历史、片段和 TOTP，并在会话中使用项目、资源与剪贴板。资料在本机管理；运行远程模型时会发送用户批准的目标、上下文及工具结果。

> 2026-10-27：Harness 原生纠正开发，P0–P3 完成、P4 部分完成。最新独立目录包：`dist/harness-native-20261027/win-unpacked/ClipVault Workbench Preview.exe`，未签名、未安装、未发布。使用 `%APPDATA%/clipvault-workbench-preview`，与此前工作台预览版共享资料，与日常安装版 ClipVault 分开，不依赖 Docker 或 OnSet。[当前交接与未完成项](docs/HARNESS-NATIVE-DELIVERY.md) · [阶段进度](docs/HARNESS-NATIVE-PROGRESS.md) · [最新验收](docs/P4-VERIFICATION.md)。2026-10-26 的任务版构建及文档保留作历史；下方 GitHub 下载链接属于此前发布的 ClipVault。

> v3.0 起为**单机个人版**。团队 P2P、Vera AI、CLI / HTTP / SSH、分享包等比赛向能力已下线。

### 下载

- **最新版 Release**：[v3.3.0](https://github.com/dzcnice/clipvault/releases/tag/v3.3.0)
- **Windows 安装包**：[`clipvault-3.3.0-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.3.0/clipvault-3.3.0-setup.exe)

仓库：https://github.com/dzcnice/clipvault

应用内可 **检查更新**（GitHub `latest.yml`）。发版与升级规范见 [docs/release/auto-update.md](./docs/release/auto-update.md)。

## 核心能力

### 剪贴板与凭证

- 剪贴板历史：文本 / 图片 / HTML 自动记录、搜索、置顶
- **截图三态**：入库后可「图+路径 / 仅路径 / 仅图片」写回系统剪贴板（设置可改默认；列表可单条覆盖）
- 凭证管理：API Key、数据库、SSH、Token、账号密码等
- 密钥检测：常见 OpenAI / GitHub / AWS / SSH 等模式，一键入库（智能默认名）
- 片段库：常用文本与模板

### 安全

- **无主密码门槛**：`safeStorage` 自动开库（旧主密码库可迁移）
- 可选生物识别确认、BIP39 恢复短语
- 剪贴板自动清空、审计日志、健康检查、HIBP、TOTP
- 威胁模型：防误贴与本地历史泄露，不防本机其他用户

### 数据

- 从 1Password / Bitwarden / KeePass / Chrome / LastPass 导入
- 加密 / 明文导出与本地备份

### 效率

- 全局快捷键 + 命令 HUD
- 关窗驻托盘、开机自启（可选）、中性灰蓝主题与明暗模式
- 原生多轮会话、计划审批、目标待办、只读子 Agent、内存全文历史搜索

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面框架 | Electron 43.8.3 + electron-vite 5 |
| UI | React 18 + Tailwind + Radix / shadcn |
| 存储 | better-sqlite3 + SQL migrations |
| 加密 | Node crypto + noble 系列 + OS safeStorage |
| 测试 | Vitest + Playwright |

## 开发

要求：Node.js 22、npm 10.9.4；Harness 随包 Node 固定为 22.23.4，首次构建从官方地址下载并核对 SHA-256。系统 Node 不会被修改。

```bash
cd ClipVault
npm install
npm run dev
npm run typecheck
npm test
npm run preflight          # typecheck + test + build
npm run build:workbench   # 独立应用身份、资料目录和安装包；不发布
```

发版前建议：

```bash
npm run preflight
# 可选 e2e（需 Playwright）：
# PREFLIGHT_E2E=1 npm run preflight
# 集成测试需 Node ABI 的 better-sqlite3：
# npm run rebuild:sqlite && npm run test:integration
# npm run postinstall   # 切回 Electron ABI 以便 dev/build
```

安装包产物：`dist/clipvault-3.1.0-setup.exe`

## 目录结构

```text
src/
├── main/        Electron 主进程、IPC、剪贴板、加密
├── preload/     预加载脚本
├── renderer/    React 页面与组件
├── db/          SQLite 与 store
├── types/       共享类型
└── utils/       通用工具（密钥检测等）
```

## 文档

- [快捷键](./docs/SHORTCUTS.md)
- [已知限制](./docs/KNOWN-LIMITATIONS.md)
- [变更日志](./CHANGELOG.md)
- [安全说明](./SECURITY.md)
