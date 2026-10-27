# 已知限制 · ClipVault v3 个人本地版

本文档只保留当前仍然成立、且会影响交付或对外说明的限制项。

## Harness 原生纠正开发（2026-10-27）

当前进度以 [HARNESS-NATIVE-DELIVERY.md](HARNESS-NATIVE-DELIVERY.md) 和 [P4-VERIFICATION.md](P4-VERIFICATION.md) 为准：P0–P3 完成，P4 部分完成；全量 102 文件 / 601 用例通过。以下早期 3.4 说明仅描述原有能力，不能覆盖当前状态。

- 官方定时提醒尚未实现常驻 Host / Web SessionController / 加密 storageDomain 组合。
- 官方 workspace-changes 的明文临时快照未开放；现有加密文件回执和完整 before/after 对比可用，不等于全工作区回滚。
- 可选 L2 项目后台预分析未实现；目前只在用户会话中显式委派只读子 Agent。
- Windows 官方 PowerShell 需逐命令审批，仅写临时文本副本，副本产物不回写。不复用项目 node_modules；需要现有依赖的 Node/npm 测试仍可走标明风险的本机检查。ACL 不隔离读取、网络或进程可见性，禁止提权/后台执行，无不受限降级。测试证明指定外部测试文件拒写，不能推导为完整虚拟机隔离。
- 历史搜索每次仅索引最近最多 200 会话、24 MB 脱敏内容，索引只留内存。旧任务只读，不能原地继续运行。
- 官方压缩已验证摘要与重启恢复；实际第三方模型的上下文容量、长对话自动压力行为未实测。
- 新目录包在 `dist/harness-native-20261027/win-unpacked/`。未启动真实用户资料目录，未执行真实账号登录/外部应用粘贴/多日运行，未签名或生产发布。

## 3.4 原有能力与持续边界（2026-10-26 基线）

该阶段记录见 [WORKBENCH-DAILY-VALIDATION.md](WORKBENCH-DAILY-VALIDATION.md)。保留新图片加密、旧图转换、活动会话加密、非覆盖备份合并、本机 OCR、文件快照、模板、上下文导出、同域登录辅助及两个独立项目并行。2026-10-27 补依赖后 npm audit 为 0；这只是该时点的依赖库扫描结果，不是产品安全认证。

远程模型会接收批准的上下文与工具结果。本机 Node/npm 检查具有当前账户权限，不提供 Docker 或操作系统沙箱。OCR 提取文字，不支持原始图片视觉理解；登录助手不自动提交，不支持跨域 SSO 或代做 MFA。当前支持同会话内的官方只读子 Agent，但不支持其写入文件、使用秘密或运行命令。尚无跨设备同步、自动部署。安装包未签名，Windows x64 之外未验收。已知值和常见格式脱敏不能保证识别任意未知或编码后的秘密。

新 `.cvimg` 由当前 DEK 加密；旧图转换前仍为原格式，外部副本不会自动删除。复制路径临时解密 10 分钟，异常退出后下次启动清理。敏感列加密不等于整个 SQLite 文件加密，名称、路径及部分元数据仍可见。自动备份原有 7 天保留策略不等于长期归档，请另存重要的独立密码备份。

独立版本不使用旧 ClipVault 发布源自动升级，数据目录、自启动名称和应用身份也单独区分。系统安全存储保护的数据库跨资料目录迁移时还依赖相应的安全存储状态；面向恢复和异机迁移应使用带独立密码的导出备份，不能只复制一个数据库文件。

## 产品边界（v3）

- **单机个人版**：无团队 / P2P / Vera AI / CLI / HTTP API / SSH Agent / 加密分享包
- **无主密码登录**：启动时 `safeStorage` 自动开库；旧主密码库可一次性迁移
- **威胁模型**：防误贴、剪贴板历史与凭证本地加密；**不**防本机其他登录用户或恶意进程
- **Onboarding**：精简欢迎 / 快捷键 / 可选导入（非旧版 7 步团队向导）
- **截图路径**：入库后按设置写回「图+路径 / 仅路径 / 仅图片」；目录可自定义。**更换目录时会尝试迁移仍存在的历史截图**；源文件已删的记录会跳过

## v3.1+ 功能增强（P0–P4 已落地摘要）

- 剪贴板：类型筛选 / 仅置顶 / 复制后可隐藏主窗口
- 凭证：全部·收藏·最近；列表/详情星标；拦截默认名为「标签 · 日期」（不含密钥片段）
- 设置：自动清空 TTL、本地备份列表与恢复、检查更新、导出默认加密
- HUD：混合加载最近凭证/剪贴板/片段，Enter 复制
- 片段：`{date}` `{time}` `{datetime}` `{year}` `{clip}` 变量展开
- 更新：应用内 `UpdateNotifier` + 设置页检查更新

## v3.2 功能包（已随 3.2.2 发布）

- 剪贴板可控：历史上限、排除应用、最短文本、保存图片、来源应用、批量/时间清理
- 凭证筛选（类型/分类/标签）、secret 遮罩、用户名/URL 快捷操作
- 片段编辑 + 变量 chips；通用 CSV 导入
- 更新：自动检查开关/间隔、诊断复制、发布页；HUD 拼音首字母

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
