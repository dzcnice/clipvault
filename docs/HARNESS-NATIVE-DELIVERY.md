# 给 Claude 的 Harness 原生纠正开发交接

更新：2026-10-27。规范依据：`DEV-SPEC-HARNESS-NATIVE.md` v1.1。**P0–P3 已完成；P4 部分完成。** 本文对应当前源码与 `dist/harness-native-20261027/win-unpacked/` 构建，不是此前任务执行器版本的功能说明。

## 纠正了什么

用户要的是以官方 Harness 为会话与 Agent 运行底座的剪贴板工作助手。原实现把 Harness 放在一次性任务执行器后面，应用自己的任务流程占据主导，不能作为这项要求的完成证明。

现有主入口改为 `SessionPage → sessionAPI → HostManager → 独立 Node 的官方 Harness`。官方 session、agent loop、approval、user questions、goal、plan、todo、subagent、compaction 负责对应行为；应用提供本地加密持久化、权限边界、资源 broker、剪贴板工具和事件投影。HostManager 管生命周期、目录互斥和额度，不另写模型/工具循环。OnSet 没有作为代码或用户资料来源。

剪贴板采集、历史查找、复制粘贴、凭证取用离线可用，不需要启动 Host 或连接模型。普通会话会在轮次完成后退出 Host，下一次输入从加密事件恢复。旧任务只读，保留旧内部实现用于历史兼容与回归，生产 IPC 已禁止其创建/继续/运行。

## 当前可用能力

| 范围 | 已实现 |
|---|---|
| 剪贴板 | 原历史与图片模式保留；本地分类、来源/时间/项目筛选、详情、发生记录、置顶、长期保存、保留策略；离线搜索；520px HUD 最近 20 条与键盘粘贴 |
| 资料与账号 | 粘贴一段资料后本机解析；可选脱敏结构化；确认后加密保存；元数据与字段角色；复制、TOTP、用户名→密码→验证码顺序粘贴；辅助登录、版本、撤销与健康检查 |
| 原生会话 | 多轮恢复、流式消息、官方追问、逐动作审批、目录互斥、最多两个独立目录并行、取消与锁库回收、资料 @ 引用、模板与本地 OCR 附件 |
| 收件箱 | L1 本地规则生成建议，默认不调用模型；错误与项目建议、重复资料提示、忽略/完成/规则开关；AI 找回与整理由用户主动发起并确认 |
| 进阶协作 | 官方目标/待办/计划；计划为只读且显示完整计划再退出；最多两名只读子 Agent、深度一层；子会话加密；官方压缩与恢复 |
| 文件与命令 | 文件完整 before/after 与哈希校验；按权限批准写入；本机 Node/npm 检查；Windows 官方 PowerShell 在临时文本副本运行，逐命令批准、限制写入、禁止提权与后台运行 |
| 历史 | 官方 SQLite 会话查询，内存索引，不调用模型；最多最近 200 会话 / 24 MB；旧 3.4 任务可查看、不能继续执行 |

P2 的资源 HUD 是在同一面板切换动作菜单，未做两个常驻列表。Utility Host 当前每次请求新建并释放，不做五分钟进程复用。两处差异已有阶段报告，不能省略后宣称完全逐字满足设计。

## 安全与数据保护

- 继续使用原加密体系，新增迁移为增量建表/加列；旧会话惰性复制迁移保留源行，剪贴板分类补算不改原密文。测试没有打开日常资料库。
- 业务秘密和模型密钥留在主进程。模型只接收资源 ID/字段描述与脱敏内容；资源用途、文件、附件、模型输出、子 Agent 输出统一经过边界处理。未知/编码秘密仍不是完全可识别的。
- `project_auto` 是显式选择的项目文件写入权限，计划模式与只读子 Agent 不会因此取得写权限。命令和资源使用仍按动作单独批准。
- ACL 是**写入限制**：临时副本与私有 TEMP 可写；读取、网络不隔离。审批完整展示命令和范围。不更改真实项目/资料目录 ACL，不回写副本产物，不自动安装依赖。
- PowerShell 输出不落 spill 文件；主进程脱敏后才进入回执与模型。进程停止无法确认时保留副本并要求核对，不伪称停止成功。
- 原 `workbench_run_check` 仍是受控命令范围的本机检查，具有当前账户权限；不要把它标成 ACL 沙箱。
- 独立工作台使用 `%APPDATA%/clipvault-workbench-preview`；新构建与此前工作台预览版本共享该目录，与原安装版 ClipVault 分开。本轮生成新构建未启动该真实资料目录。

## 官方复用与主要文件

| 责任 | 代码入口 |
|---|---|
| 官方组合与控制 | `integrations/harness/runtime.mjs`、`control.mjs`、`advanced.mjs` |
| 官方 SessionPersistence / 附件 provider | `encrypted-persistence.mjs`、`attachments.mjs`；`src/db/harness-session-store.ts` |
| Host 生命周期与权限 | `src/main/harness-host/manager.ts`、`transport.ts`、`data-tools.ts`、`questions.ts` |
| 官方搜索 | `integrations/harness/history-worker.mjs`、`src/main/harness-host/history.ts` |
| 官方 PowerShell | `integrations/harness/pwsh.mjs`、`pwsh-worker.mjs`、`windows-acl-runner.mjs`；`src/main/workbench/pwsh.ts`、`tools.ts` |
| 交互与历史 | `SessionPage.tsx`、`SessionContextPanel.tsx`、`SessionHistoryPage.tsx`、`LegacyTasksPage.tsx`；`session-handlers.ts`、`workbench-handlers.ts` |
| 资源 / 剪贴板 / 收件箱 | `src/main/resources/`、`src/main/clipboard/`、`src/main/inbox/` 及对应页面 |

Harness 固定 `0.2.1-rc.2`，源码提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。本阶段补齐用户逐项批准的 `dsh-compaction`、`dsh-session-query`、`dsh-util-time`、`dsh-shell` 四个同版本契约包；关闭 npm 安装脚本，未升级 Electron / 系统 Node / Harness。随包 Node 仍为 22.23.4。官方 SDK 硬编码 `process.execPath`，因此使用规范 V1 允许的独立 Node worker 中转，仍调用原 SDK 与原 Agent loop。

## 验证证据

- 全量测试：102 文件 / 601 用例，0 失败 / 0 跳过；类型检查与 Lint 通过。
- 原生 Host 集成：19 项；本机桩覆盖 Anthropic 与 OpenAI-compatible 协议、计划审批、子 Agent、搜索与命令策略。
- V6：新 `%TEMP%/clipvault-v6-*` 中实际测试官方 ACL + PowerShell，内写成功、外写拒绝、超时终止。
- 官方压缩：调用真实 `compactNow`，生成摘要与 checkpoint，原事件保留，新的 Host 成功恢复。
- 真实 Electron：20 个明暗主题/尺寸/路由状态，无 preload 或渲染错误；组件测试补充填充数据、错误、空态、键盘。
- 源码构建与独立 Windows 目录包成功；afterPack 校验 122 个 Harness 运行文件。包未签名、未安装、未发布。

可复核命令：

```text
node scripts/build-harness.mjs
node node_modules/typescript/bin/tsc --build
node node_modules/eslint/bin/eslint.js . --max-warnings=0
node scripts/test-electron-node.cjs --maxWorkers=4
node scripts/verify-official-harness.mjs
resources/harness-runtime/node.exe scripts/spikes/native-controls.mjs
node node_modules/electron-vite/bin/electron-vite.js build
node scripts/verify-desktop-workbench.cjs
```

ACL 测试须保留 `--allow-acl-test` 的明确授权门，只在新测试目录执行。详细报告与路径见 `P0-VERIFICATION.md` 至 `P4-VERIFICATION.md`。构建仍有现存 Rollup chunk/注释提示；基础审计没有 error/warning，这两类结果不能混为一谈。

## 尚未完成与建议顺序

1. ~~定时提醒（P4-4）~~、~~官方全工作区变更（P4-2）~~、~~可选 L2 预分析（P4-6）~~：已于 2026-10-27 由 Claude 补齐，官方部分与适配部分的划分、证据和边界见 `P4-VERIFICATION.md`「P4 收尾」。
2. **界面 v3 与自定义模型服务**：已落地（Geist 字体、画布 + 浮起面板、灵动岛、模型服务地址/密钥/模型列表），见 `docs/design/ui-v3-flow.html`。
3. **安装包**：上面列出的独立目录包早于这些改动，需重新执行 `npm run build:workbench` 并复验安装包内运行时。
4. **真实日常验收**：当前阶段仅合成账号/本机模型桩。真实提供商上下文窗口与自动压缩压力、实际跨应用粘贴、登录、多日运行与签名升级尚未验证。

请优先审查是否仍有旧任务执行入口、计划/子 Agent 越权、主进程与 worker 范围不一致、取消后遗留进程、秘密进输出或临时文件，以及搜索和快照声明是否夸大。未读真实数据、未调用真实模型、不使用 Docker；不要因本文或测试通过而扩大这些授权。
