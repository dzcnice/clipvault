# Changelog

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范，并采用 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

## [3.2.1] - 2026-07-22

### Fixed
- 来源应用探测：PowerShell 误用只读自动变量 `$PID`，导致 `sourceApp` 几乎始终为空
- TOTP 列表 IPC 不再下发明文 `secret`（仅元数据；生成仍走主进程）
- 片段全局热键：收紧 accelerator 校验，避免 `email+work` 一类误注册
- 「复制并粘贴」：先最小化主窗再粘贴；粘贴失败时明确报错
- 凭证复制失败（如生物识别拒绝）toast 展示真实错误文案

## [3.2.0] - 2026-07-22

### Added
- 剪贴板可控：历史上限、排除应用、最短文本、保存图片、来源应用、批量/时间清理、折叠重复
- 凭证：类型/分类/标签筛选；复制用户名/用户名→密码/复制并粘贴；默认遮罩；生物识别门禁
- **TOTP 总览页**（侧栏 + 托盘）
- 片段：编辑、变量 chips、**全局热键**（Electron accelerator 格式）
- 导入：通用 CSV 列映射；导出：字段勾选 + 时间范围 + 生物识别
- 更新：自动检查/间隔/诊断/发布页；快捷键改键+冲突检测
- Onboarding：可选恢复短语步；托盘「重新打开保险库」
- HUD 拼音首字母；健康报告可跳转

### Notes
- 仍为 v3 个人本地版；Windows 代码签名仍依赖外部证书
- `paste-to-active` 仅 Windows（接口已冻结，其它平台返回明确错误）

## [3.1.2] - 2026-07-21

### Added
- 侧栏左下角 **检查更新** 小按钮（自动检测状态：有更新 / 下载中 / 重启安装）

### Fixed
- Windows 未签名安装包应用内更新失败（`not digitally signed`）：无签名凭据时跳过 Authenticode 校验，仍保留 sha512 完整性校验
- 更新错误文案对「未签名拦截」给出可操作说明

### Notes
- 若当前是 **3.1.0/3.1.1** 且更新被签名策略拦住：请先从 GitHub 手动安装 **3.1.2** 一次，之后自动更新即可
- 安装包：`dist/clipvault-3.1.2-setup.exe`

---

## [3.1.1] - 2026-07-21

### Added
- 截图目录变更时迁移仍存在的历史图片文件并更新 `image_path`
- 导入向导说明：跳过策略、重复项行为、Chrome 导出注意
- 自动更新 / NSIS 升级规范文档（`docs/release/auto-update.md`）
- 签名接线说明（无证书 / pfx / Azure KV）写清可执行步骤

### Changed
- NSIS：引导式安装、卸载默认不删用户库、覆盖升级策略
- Updater：错误可读文案、失败可重试、手动检查恢复周期源
- UpdateNotifier：可关闭、下载/重启说明更清晰
- prefs：支持 autoClear / hideAfterCopy 等字段完整读写

### Notes
- 安装包：`dist/clipvault-3.1.1-setup.exe`
- 从 3.1.0 升级：应用内「检查更新」或运行新 setup 覆盖安装，数据保留
- Windows 代码签名仍需外部证书

---

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
