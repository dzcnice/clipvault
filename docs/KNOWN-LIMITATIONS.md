# 已知限制 · ClipVault v3 个人本地版

本文档只保留当前仍然成立、且会影响交付或对外说明的限制项。

## 产品边界（v3）

- **单机个人版**：无团队 / P2P / Vera AI / CLI / HTTP API / SSH Agent / 加密分享包
- **无主密码登录**：启动时 `safeStorage` 自动开库；旧主密码库可一次性迁移
- **威胁模型**：防误贴、剪贴板历史与凭证本地加密；**不**防本机其他登录用户或恶意进程
- **Onboarding**：精简欢迎 / 快捷键 / 可选导入（非旧版 7 步团队向导）
- **截图路径**：入库后按设置写回「图+路径 / 仅路径 / 仅图片」；存储目录默认可为 `userData/images/`，可在设置中自定义。**仅影响新截图**；历史项仍指向旧绝对路径。清理历史或卸载可能使路径失效

## v3.1+ 功能增强（P0–P4 已落地摘要）

- 剪贴板：类型筛选 / 仅置顶 / 复制后可隐藏主窗口
- 凭证：全部·收藏·最近；列表/详情星标；拦截默认名带内容片段
- 设置：自动清空 TTL、本地备份列表与恢复、检查更新、导出默认加密
- HUD：混合加载最近凭证/剪贴板/片段，Enter 复制
- 片段：`{date}` `{time}` `{datetime}` `{year}` `{clip}` 变量展开
- 更新：应用内 `UpdateNotifier` + 设置页检查更新

## 已验证状态

建议在发版前本地确认：

- `npm run preflight`（typecheck + unit test + build）
- 或分步：`npm run typecheck` / `npm test` / `npm run build`
- `npm run build:win`（安装包）
- 可选：`PREFLIGHT_E2E=1 npm run preflight`（Playwright e2e）

### 集成测试与 better-sqlite3 ABI

- Vitest 以 **Node ABI** 加载 `better-sqlite3`；日常 `dev` / `build` 需要 **Electron ABI**。
- 若集成套件显示 skipped：先 `npm run rebuild:sqlite`，再 `npm run test:integration`。
- 跑完后执行 `npm run postinstall`（或 `npm run rebuild:electron`）切回 Electron，否则 `npm run dev` 可能失败。
- 历史表（team / vera 等）可空置，不建议 DROP。

## 仍需外部条件的部分

### 1. Windows 代码签名

发布脚本与签名脚本已接线，正式签名仍依赖：

- `CSC_LINK + CSC_KEY_PASSWORD`
- 或 Azure Key Vault 相关变量

无证书时不能宣称「已正式签名发布」。

### 2. macOS 公证

需要 Apple Developer 证书与 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID`。

### 3. GitHub Release

`scripts/release.js` 依赖 `gh` CLI 与 `GH_TOKEN` / `GITHUB_TOKEN`。

### 4. 自动更新

- 客户端已接 `electron-updater`（检查自动、下载需确认）。  
- 推送依赖 Release 上的 **`latest.yml` + setup + blockmap`**，且 **version 必须递增**。  
- 完整流程见 [`docs/release/auto-update.md`](./release/auto-update.md)。  
- **Windows 代码签名**仍是生产级自动更新的外部条件。

## 历史 schema

SQLite 迁移中可能仍存在 team / vera / webhook 等历史表定义。  
**旧库表可空置**，运行时个人版不读这些路径；**不建议**对用户库做破坏性 DROP。

## 文档约束

- 对外说明以个人本地、无主密码、无团队同步为准
- 勿用占位截图冒充真实界面
- Windows 签名 / macOS 公证 / GitHub 正式发布以外部环境是否就绪为前提
