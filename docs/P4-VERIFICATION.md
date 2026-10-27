# P4 阶段报告（部分完成，2026-10-27）

## 依赖验证阻断

2026-10-27，在组合官方子 Agent、上下文压缩和 SQLite 会话搜索时，`node scripts/build-harness.mjs` 失败。缺少三个官方 peer dependency：

- `@deepseek-ai/dsh-compaction@0.2.1-rc.2`：`dsh-compaction-basic` 的基类与回放契约。
- `@deepseek-ai/dsh-session-query@0.2.1-rc.2`：`dsh-session-query-sqlite` 与子 Agent 冷恢复的查询契约。
- `@deepseek-ai/dsh-util-time@0.2.1-rc.2`：`dsh-subagent` 使用的时间工具。

现有 `.npmrc` 使用 `legacy-peer-deps=true`，官方包的这些 peer 没有自动安装。用户已明确确认补齐以上三个相同锁定版本的开发依赖。安装使用 `--ignore-scripts`，输出 `added 3 packages`，基础审计 0 错误 / 0 警告，官方构建随后成功（96 文件 / 70 包）。不改变 Electron、Node、Harness 版本。

依据开发规格 0.2「不要未经批准新增 npm 依赖。确有需要时先在阶段报告里说明理由，等确认」，先报告、取得确认后才安装。P3 最后质量门为 100 个测试文件、583 个用例通过，0 跳过；P4 尚未宣告通过。

## V6 测试范围

最小脚本为 `scripts/spikes/windows-acl.mjs`。默认只报告未运行，不修改 ACL。显式确认后用固定 Node 执行并带 `--allow-acl-test`，仅在新建 `%TEMP%/clipvault-v6-随机名/` 中创建 workspace、temp、outside；官方 ACL 只授予 workspace 与 temp，验证允许项目内写入且拒绝 outside 文件写入。不会修改真实项目、资料库、祖先目录权限，不调用官方 ACL 修复脚本。测试资料与报告保留；TEMP 授权按官方 dispose 回收，workspace 授权仅留在测试目录。此测试通过只证明写入限制，不证明读取或网络隔离。

## 已核实的组合限制

V6 已在用户确认后执行成功，报告为 `C:/Users/ADMINI~1/AppData/Local/Temp/clipvault-v6-Y2UWBj/report.json`，项目内写入成功、外部文件写入被拒，原外部文件保持不变。真实项目和资料目录 ACL 未修改。此后发现 PowerShell 组合缺少 `@deepseek-ai/dsh-shell@0.2.1-rc.2`（工具、执行器与 shell-env 的公共契约），再次取得用户明确确认后补齐，仍使用 `--save-exact --ignore-scripts --no-audit --no-fund`。四个新增包均固定为现有 Harness 版本。Schedule 和 SessionController 的静态打包依赖检查通过，但生命周期组合未完成。

- `dsh-schedule` 官方当前版本要求 `storageDomain`、Web `sessionController`、会话持久化参与投递确认，不能直接作为 SDK 独立插件挂载。后续必须验证受支持的组合，不能把自建计时器称为官方 schedule。
- `dsh-workspace-changes` 默认直接复制整个文件到明文临时目录，并生成 Git 临时对象。目前保护资料的要求不允许直接启用该机制；已有经过审批、加密保存的文件修改回执继续提供完整修改前后对比。
- V6 通过后，仅 Windows 原生会话挂载官方 `pwsh`，经主进程逐条审批、在临时文本副本执行。Bash/Web 工具仍未挂载。原 `workbench_run_check` 继续明确标示「不是操作系统沙箱」。

## 已完成与实际验证

- **P4-1**：官方 goal、goal round driver、plan mode、todo 服务。计划模式使用不可放宽的工具 guard；退出计划需展示完整方案，用户批准仅改变模式，不代替文件、资源、命令审批。目标与待办在右栏显示，可从加密事件恢复。
- **P4-2（部分）**：官方 subagent / spawn / control，最多同时 2 个、深度 1 层，只读；子会话逐事件加密，主进程复核父子关系。父子 Agent 共用请求/时间预算。官方 compaction 已挂载，最小实测调用 `compactNow` 生成 summary 与 surface checkpoint；重启 Host 能恢复摘要，原事件仍保留。尚未挂载 workspace-changes。
- **P4-3**：`dsh-tool-pwsh → dsh-shell` 主进程审批能力边界 → 临时进程中的 `dsh-pwsh-sandbox + dsh-sandbox-local + dsh-subprocess-local + dsh-sandbox-windows-acl`。使用随包的原官方 runner；仅调整打包后的 runner 路径。输出限量、仅内存收集，禁用明文 spill。禁止升级到 danger-full-access，禁止后台执行；无无限制降级。每次审批明确说明 ACL 不隔离读取/网络以及仅修改临时目录权限。原项目产物不自动回写。
- **P4-4（部分）**：`dsh-session-query-sqlite` 在短生命周期独立 Node 中用 `:memory:` 索引最近最多 200 个会话、24 MB 脱敏事件；不调用模型、不落明文索引，锁库取消查询。新增历史搜索页。官方 schedule 尚未挂载。
- **P4-5**：旧任务进入侧栏和 `/legacy-tasks`，仅显示原输入、运行过程与完整修改对比；IPC 直接调用 createTask/followUp/start/stop/accept/approve 也拒绝。普通页面 snapshot 不再触发旧 run 状态恢复或归档写入。

| 检查 | 结果 |
|---|---|
| TypeScript / ESLint | 退出 0；Lint 0 错误、0 警告 |
| 全量 Electron Node 测试 | **102 文件、601 用例通过，0 失败、0 跳过**，24.52 秒 |
| 原生 Host 集成 | 19 用例通过：真实官方运行时 + 合成模型桩，包括目标、计划、子 Agent、搜索、PowerShell 策略 |
| PowerShell 实际 ACL 验证 | `scripts/spikes/pwsh-acl.mjs --allow-acl-test`：副本内写成功、外部测试文件未改变、超时进程终止；报告 `C:/Users/ADMINI~1/AppData/Local/Temp/clipvault-v6-NFm5tU/report.json` |
| V1 worker 路径 / V2 / V3 / V4 / 压缩 | 通过；报告 `C:/Users/ADMINI~1/AppData/Local/Temp/clipvault-native-spike-EBvbrM/report.json` |
| 独立运行时 smoke | 通过；`C:/Users/ADMINI~1/AppData/Local/Temp/clipvault-official-harness-GhQZRQ/report.json` |
| Runtime 构建 | **122 个文件、86 个包**，Harness 仍为 0.2.1-rc.2 |
| Electron Vite 构建 | 通过；存在既有重复静态/动态导入、PURE 注释、空 vendor chunk 提示，记录在 `out/p4-build.log` |
| 真实 Electron 桌面 | **20 状态通过**：浅色/深色、1280×820 / 最小 960×640；包括 history 与 legacy-tasks，无横向溢出、无 preload/renderer 错误；报告 `C:/Users/ADMINI~1/AppData/Local/Temp/clipvault-workbench-preview-desktop-qx9nRd/report.json` |
| 新独立目录包 | `dist/harness-native-20261027/win-unpacked/ClipVault Workbench Preview.exe`；afterPack 对 122 个运行时文件核对哈希通过；未签名、未安装、未发布 |
| 基础配置审计 | strict：errors=0、warnings=0 |
| 依赖审计 | `npm audit --json`：info/low/moderate/high/critical 均 0；记录 `out/p4-audit.json` |

PowerShell 策略集成测试 mock 了执行能力以验证审批、提权/后台拒绝、计划模式拦截；实际 OS 执行证据来自独立 V6 PowerShell 夹具，不把 mock 结果当作隔离证明。桌面用全新空资料库；填充数据、错误、空态和键盘操作由组件/主进程测试覆盖。

## P4 收尾（2026-10-27，Claude）

剩余三项已实现。下表写明哪些是官方实现、哪些是本应用的适配，不把适配说成"完整复用官方"。

| 项 | 官方部分 | 本应用适配 | 证据 |
|---|---|---|---|
| **P4-4 定时提醒** | `dsh-tool-schedule` 的 4 个工具（create/list/update/delete）原样加载；记录构建与时间规则用 `dsh-schedule` 导出的 `create*ScheduleRecord`、`resolveRecurringOccurrence`、`renderReminderFraming`、`renderRecurringReminderBatchFraming` | `integrations/harness/schedule.mjs` 提供 `schedule` 服务（**不是**官方 Web `ScheduleService`，后者依赖 Web SessionController 与 storage-domain）；记录、投递回执、历史加密存于迁移 030 `wb_schedules`；主进程 `ScheduleRunner` 计时，到期时调用打包在运行时里的 `schedule-worker.mjs` 计算正文与下次时间，再作为新消息排入原会话。官方 `resolveScheduleUpdate` 未导出，修改逻辑用官方构造函数组合，主进程做整条记录比较替换 | `src/main/schedule/schedule.integration.test.ts` 3 项：官方工具创建、到期投递且**仍经每轮发送审批**、官方规则拒绝过高频率、每日提醒错过 3 天只补发 1 次并推进到下一天、删除 |
| **P4-2 工作区变更** | `dsh-workspace-changes` 原样加载（每轮 git 快照 + 逐行对比） | `integrations/harness/workspace.mjs` 提供只允许运行 git 的 `subprocess` seam（未使用依赖 node-pty 的 `dsh-subprocess-local`），附加 `core.fsmonitor=false`、`protocol.allow=never`、`GIT_CONFIG_NOSYSTEM=1`、HOME 指向会话私有目录；快照目录在 Host 的 TEMP（应用资料目录内的会话目录），Session 释放时删除，Host 退出后主进程再兜底清理；摘要与对比经逐行脱敏后加密存为会话回执，在会话上下文面板展示 | `workspace-changes.integration.test.ts`：真实 git 仓库中记录 `+2 −1` 差异、密码行被脱敏、用户仓库暂存区为空、HEAD 与松散对象数不变、快照目录已删除 |
| **P4-6 L2 预分析** | 复用官方计划模式只读守卫与官方 Host | 项目设置"复制报错时自动预分析"，默认关闭；复制到该项目的报错生成收件箱建议后排队一个**隐藏的只读会话**（计划模式 + 主进程只读工具范围），额度上限 6 次请求 / 3 分钟，每项目每天 10 次，用户任务优先且同时最多 1 个；不弹每轮审批，以项目开关为同意并记录 `preanalysis_consent` 回执；追问自动取消、官方工具授权一律拒绝；原文含已知秘密或高确定性密钥时整条跳过；结论脱敏后写入收件箱 | `preanalysis.integration.test.ts` 3 项：未开启不调用模型；开启后不弹审批、写文件被拦、结论进收件箱、会话列表不可见；含密钥跳过与每日上限 |

质量门：`tsc --build` 通过；ESLint 0 error / 0 warning；`node scripts/test-electron-node.cjs --maxWorkers=4` **107 文件 / 618 用例通过、0 失败**；`npm run build:harness` 133 个运行时文件；`verify-official-harness.mjs` 通过；`electron-vite build` 通过。

## 仍需说明的边界

1. **定时提醒**：投递回执的 `messageId` 是本应用生成的 `reminder-*`，表示"已排入会话"，不是官方会话消息 ID；会话正在运行时每 60 秒重试；锁库期间暂停，解锁后补发最近一次；提醒按会话隔离，`catalog` 只返回本会话的提醒。
2. **工作区变更**：git 会遵守仓库自身的本地配置（例如 `.gitattributes` 过滤器），与用户自己在该仓库运行 git 的信任级别相同；非 git 项目只有原有的逐文件加密回执；没有提供"回滚"按钮。
3. **L2**：开启后会把脱敏后的报错与模型读取的项目代码发给模型服务，不再逐次确认；这一点在开关说明中写明。
4. 未验证真实模型服务、第三方模型的真实上下文窗口/自动压缩压力、真实账号登录、跨应用焦点粘贴、恶意本机进程、其他 OS、签名安装和升级。压缩的实测覆盖显式官方压缩与恢复，不能当作真实长对话压力测试。
