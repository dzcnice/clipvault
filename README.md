# ClipVault

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#license)
[![Version](https://img.shields.io/badge/version-v3.1.0-brightgreen)](#开发)

**ClipVault** 是本地优先的个人凭证与剪贴板工作台：系统钥匙串保护的保险库、智能剪贴板历史、片段库、TOTP / 健康检查、导入导出——数据不出本机。

> v3.0 起为**单机个人版**。团队 P2P、Vera AI、CLI / HTTP / SSH、分享包等比赛向能力已下线。

### 下载

- **最新版 Release**：[v3.1.0](https://github.com/dzcnice/clipvault/releases/tag/v3.1.0)
- **Windows 安装包**：[`clipvault-3.1.0-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.1.0/clipvault-3.1.0-setup.exe)

仓库：https://github.com/dzcnice/clipvault

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
- 关窗驻托盘、开机自启（可选）、像素壳 + 琥珀金主题

## 技术栈

| 层 | 选型 |
| --- | --- |
| 桌面框架 | Electron 37 + electron-vite |
| UI | React 18 + Tailwind + Radix / shadcn |
| 存储 | better-sqlite3 + SQL migrations |
| 加密 | Node crypto + noble 系列 + OS safeStorage |
| 测试 | Vitest + Playwright |

## 开发

要求：Node.js 20+、npm 10+

```bash
cd ClipVault
npm install
npm run dev
npm run typecheck
npm test
npm run preflight          # typecheck + test + build
npm run build:win
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
