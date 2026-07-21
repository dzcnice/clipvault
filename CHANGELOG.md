# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，并采用 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [3.1.0] - 2026-07-21

### Changed
- 启动路径：`vault.ensureOpen` + OS `safeStorage` 自动开库；旧主密码库一次性迁移
- Onboarding 缩为 3 步：欢迎 → 快捷键 → 可选导入（去掉主密码 / Vera / 网络 / Overlay）
- HUD 导航对齐个人版：去掉团队入口；增加片段 / 健康；「锁定」改为「重新打开保险库」
- 生物识别设置 UI 适配无密码会话（优先 `ensureOpen`，不再默认索要主密码）
- `SECURITY.md` 重写为 v3.1 威胁模型（去掉已删除的 P2P / Vera 承诺）
- 凭证 IPC 与剪贴板 IPC 统一强制 `workspace=personal`（忽略 team 入参）
- E2E 对齐 v3.1 onboarding / 凭证页文案；新增 `npm run preflight` 发版门禁
- CodePreview 增加轻量语法着色（无 shiki 依赖）
- 剪贴板加密路径：preview 列 NOT NULL 兼容（回填/写入用空串而非 NULL）
- 集成测试：migration 幂等断言不再写死 schema 版本 16

### Kept
- 剪贴板历史（含截图三态写回）、凭证、片段、TOTP、健康检查、导入导出、备份
- 密钥拦截、审计日志、恢复短语、命令面板 / HUD

### Notes
- 安装包：`dist/clipvault-3.1.0-setup.exe`
- GitHub Release：https://github.com/dzcnice/clipvault/releases/tag/v3.1.0
- Windows 代码签名 / macOS 公证仍依赖外部证书（见 `docs/KNOWN-LIMITATIONS.md`）

---

## [3.0.0] - 2026-07-17

### Changed
- **产品定位收敛为个人本地版**：单机凭证 + 剪贴板工作台
- 导航扁平化：剪贴板 / 凭证 / 片段 / 概览 / 健康 / 设置
- 主进程仅注册核心 IPC（vault / credential / clipboard / 安全 / 导入更新 / HUD）
- Design tokens 与列表 / 表单 / HUD 视觉统一

### Removed（源码与依赖物理删除）
- 目录：`main/p2p` `main/vera` `main/overlay` `main/team` `main/cli-server` `main/http-server` `main/ssh` `main/webhook` `main/file` `src/cli`
- 团队/AI/开发者页面与 hooks、preload 片段、相关 store/types
- 依赖：`yjs` `simple-peer` `node-datachannel` `bonjour-service` `fastify` `@fastify/cors` `openai` `tiktoken` `@xenova/transformers` 等（约 −110 packages）
- 资源：`resources/tailscale`、`deploy/headscale`、打包 unpack 路径

### Kept
- 保险库、剪贴板历史、片段、TOTP、健康检查、导入导出、备份
- 密钥拦截、审计日志、恢复短语、生物识别、命令面板 / HUD

---

## [2.1.0-b5] - 2026-04-15

### Added
- 个人 / 团队双工作区（`WorkspaceContext`），所有凭证 / 剪贴板 / 片段按 workspace 列隔离
- 身份系统：昵称 + 头像 + Ed25519 签名，TeamPage / IdentitySection 完整挂载
- mDNS 发现 + 审批式加入团队流程（IncomingJoinApprovalDialog / JoinTeamDialog）
- 局域网文件传输（≤ 2GB + SHA-256 校验）：IncomingFileOfferDialog / FileTransferPage
- Onboarding 真入口：
  - StepVera "打开 AI 设置" 退出 onboarding 并跳 `#/settings?tab=ai`，SettingsPage 新增 `#ai-settings` 锚点
  - StepImport 源按钮退出 onboarding 并跳 `#/import?source=<tab>`，ImportWizard 支持 query 自动切 Tab
- TeamOnboardingPage "加入已有团队" 接入 `JoinTeamDialog`
- ImportWizard KeePass Tab：真实表单 → base64 .kdbx + 主密码 → IPC parse/commit
- `import.commit` 真正入库：遍历 items 调 `credential-store.createCredential`
- `CLI_ERROR_CODES.NOT_IMPLEMENTED`：CLI `git-store` / `git-erase` 不再假成功，显式返回未实现

### Fixed
- 邀请码 probe 修复（team 发现）
- 发现 republish 修复
- E2E 脚本选择器对齐 v2.1 UI（credential / team-share）

### Security
- SECURITY.md T6 IPC sender 降级为"部分"（仅前缀白名单，未做 webContents.id 级校验）
- README / SECURITY.md 明确：剪贴板历史与备份文件当前以明文存于 vault 目录（计划 v2.2 加密）

### Known Issues（明确未完成，见 docs/KNOWN-LIMITATIONS.md §〇）
- 剪贴板 content/preview 列加密（Group 2 任务）
- 文件传输 done ACK（Group 3 任务）
- IPC sender webContents.id 严格校验（Group 3 任务）
- Windows EV / macOS Notarize 签名（电子签名未启用，`signAndEditExecutable: false` / `notarize: false`）
- AI provider OpenAI / Ollama（仅 DeepSeek，Local fallback 复选框 disabled）

---

## [Unreleased]

### Planned
- 持续依赖与 Electron 安全升级
- 按需补齐 renderer 页面单测覆盖
