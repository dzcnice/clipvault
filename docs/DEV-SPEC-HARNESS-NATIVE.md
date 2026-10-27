# ClipVault Workbench 4.0 开发文档（Harness 原生 · 路线 B）

版本：v1.1（2026-10-26）。设计依据：[HARNESS-NATIVE-DESIGN.md](HARNESS-NATIVE-DESIGN.md)（v0.3）、[CLAUDE-REVIEW-FINDINGS.md](CLAUDE-REVIEW-FINDINGS.md)。

本文档写给**执行开发的模型**。请按顺序阅读第 0 节到第 13 节，按第 10 节的阶段推进，每个阶段结束后按第 13 节的格式汇报。

> **v1.1 变更（2026-10-26，请先读）**
>
> P0 抽查发现：`redactInput` 里"键 = 值"的宽泛正则会把普通代码当成密钥，例如 `interface Login { password: string }`、`const token = await getToken()`、`` headers.authorization = `Bearer ${t}` ``。而当前实现把这条规则用来**拦截**，导致：
>
> - Agent 的回复只要写到这类代码，整轮流式输出就被掐断；
> - 用户消息被误拦；
> - 含这类代码的文件既不能修改，也跑不了本机检查；
> - `read_file` 把代码替换成 `[已隐藏敏感字段]`，Agent 看到的代码是错的。
>
> 根因在 v1.0 第 4.8 节：没有区分"替换"和"拦截"两种用途。v1.1 改动如下：
>
> 1. 重写第 4.8 节：拆为"扫描 → 替换 / 拦截"两种用途，按场景使用不同层级。
> 2. 修改第 6.2 节入口 C、第 9.1 条，与新规则一致。
> 3. 新增任务 **P1-0**，优先级高于其他 P1 任务，先做完再继续 P1。
> 4. 新增参考原型与样本：[reference/secret-scan-prototype.mjs](reference/secret-scan-prototype.mjs)。用 `node docs/reference/secret-scan-prototype.mjs` 运行，应输出 `failures=0`。

---

## 0. 硬性规则（先读，不得违反）

### 0.1 环境

- 仓库根：`E:\粘贴板\粘贴板\ClipVault`。Windows 11 x64，Shell 可用 PowerShell 或 Git Bash。
- 包管理用 **npm**（项目已有 `package-lock.json` 和 `.npmrc`），不要换成 pnpm、yarn 或 bun。
- 版本固定，不要升级：
  - Electron 43.8.3、React 18、Vite 7.3.7、Vitest 4.1.12。
  - better-sqlite3 13.0.3、sharp 0.35.5。
  - Harness 全家桶 0.2.1-rc.2（提交 `687f282e8625c6b8d11ff58211a90524be2e4317`）。
- 系统 Node 是 22.22.1。Harness 运行时使用 `integrations/harness/node.lock.json` 锁定的独立 Node 22.23.4。

### 0.2 禁止事项

- **不要** `git commit`、`git push`、`git reset`、`git clean`、`git checkout -- <file>`。工作区里有大量未提交的既有修改，必须原样保留。
- **不要**删除或覆盖用户资料目录 `%APPDATA%\clipvault-workbench-preview`、`%APPDATA%\clipvault`，也不要读取其中的数据库。
- **不要**在代码、测试、文档、日志、命令行参数中写入任何真实账号、密码、API Key。测试一律用明显的假值，例如 `test-password-not-real`。
- **不要**自行实现一个"类似 Harness"的 Agent 循环来替代官方包。官方能力不可用时，按第 11 节的验证门停下来汇报。
- **不要**把官方 bash、pwsh、web、任意终端类工具加载给模型，P4 沙箱就绪之前一律不加载。
- **不要**运行 `npm run release*`、`sign:win`，也不要做任何发布、上传操作。
- **不要**未经批准新增 npm 依赖。确有需要时先在阶段报告里说明理由，等确认。

### 0.3 质量门（每个阶段结束都必须满足）

```powershell
npm run typecheck      # 0 错误
npm run lint           # 0 错误、0 warning
npm run test:native    # 全部通过、0 跳过（在 Electron 内置 Node 下跑原生模块测试）
```

涉及 Harness 运行时的阶段，还要跑：

```powershell
npm run build:harness
npm run verify:harness
```

### 0.4 编码约定

- 风格跟随现有代码：TypeScript，结构紧凑，标识符英文，**面向用户的文案用中文**，注释少而准。
- 主进程模块放 `src/main/**`，数据库访问放 `src/db/**`，类型放 `src/types/**`，渲染层放 `src/renderer/src/**`。
- 新的数据库结构一律写成迁移，追加到 `src/db/migrations/definitions.ts` 的迁移数组末尾。当前最新版本号是 **25**（`025_workbench_projects_resources_tasks`），新迁移从 **26** 起编号，只追加、不修改旧迁移。
- 加密一律用现有的 `src/main/crypto/vault.ts`（`encryptWithDEK` / `decryptWithDEK` / `encryptBytesWithDEK` / `getDEK`），不要自己写加密。
- 渲染进程只能通过 preload 暴露的固定方法访问主进程；IPC handler 必须用 `wrapUnlockedHandler` 包装。
- 遇到不确定的官方接口，先读 `node_modules/@deepseek-ai/<包名>/README.zh.md` 和 `lib/types/**/*.d.ts`，**不要猜**。

---

## 1. 背景与目标

### 1.1 现状（3.4.0）

- 应用是"旧剪贴板应用 + 一个任务页"。
- Harness 只在点"运行"那一刻启动一个 worker，跑完即退出，相当于一个执行器。
- 用户要做的事太多：手选上下文、手选资源、手写验收标准。

### 1.2 目标（4.0）

1. **以 Harness 会话为中心。** 用户直接对话，Agent 自己去用剪贴板、资源、项目；会话可以多轮、停止、恢复。
2. **剪贴板是一级功能。** 随时复制随时存，能方便地找出来粘贴，AI 帮忙管理。现有能力一项不能少，而且不依赖 Harness。
3. **账号密钥智能管理。** 用户丢一段账号、密码、密钥，再说一句"这是做什么的"，系统就整理成结构化资源。下次能快速搜到、一键依次粘贴、辅助登录。秘密值永远不发给模型。
4. **主动智能。** 复制内容后在本地识别，在收件箱给出建议，默认不调用模型。
5. **新界面。** 视觉语言为"安静的工作台"，三栏布局。

### 1.3 非目标

- 不采用官方 Web 前端（`dsh-web-frontend`、`dsh-client-ui-*`）。
- 不做团队协作、跨设备同步、P2P。
- 不支持 macOS / Linux 打包（代码保持可编译即可）。
- 不迁移到 React 19。

---

## 2. 现有代码速览（复用优先）

| 领域 | 文件 | 说明 |
|---|---|---|
| 剪贴板捕获 | `src/main/clipboard/monitor.ts` | 监听、去重、来源应用；`writeText` 会调用 `rememberSelfWrite()`，不进历史 |
| 密钥识别 | `src/utils/key-detector.ts` | 常见密钥格式识别（有测试） |
| 剪贴板存储 | `src/db/clipboard-store.ts` | 加密存储、发生记录、置顶、长期保存、损坏密文保护 |
| 粘贴到前台应用 | `src/main/clipboard/paste-active.ts` | Windows 下用 SendKeys 发送 `^v` |
| 自动清除 | `src/main/clipboard/auto-clear.ts` | 秘密复制后定时清除 |
| 密钥拦截 | `src/main/clipboard/key-intercept.ts` | 复制到密钥时弹窗；**现在把原文发给了渲染层，需整改（见 9.6）** |
| 快捷键 | `src/main/shortcuts/registry.ts`、`manager.ts` | 可自定义，带冲突检测 |
| HUD 面板 | `src/main/hud/*`、`src/renderer/src/hud/*` | `Alt+Space` 唤出 |
| 资源库 | `src/db/workbench-store.ts`、`src/types/workbench.ts` | `wb_resources` / `wb_resource_fields`，字段带版本 |
| 资料解析 | `src/main/workbench/input.ts` | `parseResourceText`（本地规则）、`redactInput`、`boundedText` |
| 登录辅助 | `src/main/workbench/login.ts` | 独立会话窗口、同源限制、不自动提交 |
| TOTP | `src/main/totp/generator.ts`、`otpauth-parser.ts`、`src/db/credential-totp-store.ts` | 旧凭证体系里的 TOTP |
| 密码健康 | `src/main/health/checker.ts` | 弱密码、重复密码 |
| 任务服务 | `src/main/workbench/service.ts` | 3.4.0 的一次性任务编排，**4.0 由 HostManager 取代** |
| 能力通道 | `src/main/workbench/bridge.ts` | 本机随机端口 + 令牌；模型代理、工具、会话存储 |
| 受控工具 | `src/main/workbench/tools.ts`、`files.ts`、`local-check.ts`、`approvals.ts` | 写文件差异审批、接口检查、本机检查 |
| 会话存储 | `src/main/workbench/session-store.ts`、`integrations/harness/encrypted-persistence.mjs` | 加密会话；**每次全量重写，需改（见 4.5）** |
| Harness 组合 | `integrations/harness/runtime.mjs`、`worker.mjs`、`tools.mjs` | runtime 由 `scripts/build-harness.mjs` 用 esbuild 打包 |
| 运行时校验 | `src/main/workbench/runtime.ts` | manifest 哈希校验、子进程环境白名单 |
| IPC | `src/main/ipc/workbench-handlers.ts`、`src/preload/workbench-api.ts` | 单一 `workbench:call` 分发 |

---

## 3. 目标架构

```text
┌──────────────── Electron 主进程（可信，持有 DEK）──────────────────┐
│ vault / SQLite / 剪贴板监听 / 本地分类 / 收件箱 / 快捷键 / 托盘     │
│ HostManager：会话 Host 的起停、排队、预热、事件投影、审批与追问队列 │
│ Bridge：每个 Host 一个能力令牌（模型代理 / 工具 / 存储 / 控制）    │
└──────▲─────────────────────────────┬─────────────────────────────────┘
       │ IPC（preload 固定方法）      │ stdio JSON-RPC（官方 SDK 协议）
┌──────┴─────────────┐   ┌───────────▼───────────────────────────────┐
│ Renderer（React 18）│   │ Harness Host 进程（每个活跃会话一个）       │
│ 对话/剪贴板/收件箱/ │   │ 官方插件 + vault-persistence +              │
│ 资源/面板           │   │ clipvault-tools + clipvault-control        │
└────────────────────┘   │ ──HTTP──► Bridge（工具、存储、审批、追问）  │
                         └─────────────────────────────────────────────┘
```

### 3.1 进程模型

- **每个活跃会话一个 Host 进程。** 官方 SDK 协议没有取消方法，停止只能关进程；每个会话一个进程，就能互不影响。
- **会话空闲即退出。** 用户再次发言时，用 `session/resume` 从加密持久化恢复。
- **最多 2 个会话并行。** 同一目录或父子目录的会话排队（复用现有 `within` 判断和 realpath 逻辑）。
- **预热。** 用户打开某个会话页时，预先启动该会话的 Host（如果还没启动）。
- **工具型调用另起一个进程。** AI 找回、资源结构化这类调用由一个独立的"工具型 Host"处理，最多 1 个，空闲 5 分钟退出，不占并行名额。见 4.9。

### 3.2 通道

| 通道 | 方向 | 内容 |
|---|---|---|
| stdio JSON-RPC | 主进程 ↔ Host | `initialize`、`session/prompt`、`session/resume`、`session/wait`、`session/working-directory/*`、`shutdown`；事件 `session.event`、`session.status`、`subagent.*` |
| Bridge HTTP | Host → 主进程 | `/model/v1/messages`（模型代理，注入密钥）、`/tool`、`/session`（持久化）、`/control/*`（审批、追问、取消轮询） |
| IPC | Renderer ↔ 主进程 | 第 4.7 节列出的固定方法 |

---

## 4. 模块规格

### 4.1 HostManager

**文件**：`src/main/harness-host/manager.ts`（新建目录 `src/main/harness-host/`）。

```ts
export interface HostSessionSummary {
  id: string; projectId: string; title: string; state: SessionState
  updatedAt: number; pendingApprovals: number; pendingQuestions: number
}
export type SessionState = 'idle' | 'starting' | 'running' | 'waiting_user' | 'stopping' | 'stopped' | 'failed' | 'queued'

export class HostManager {
  createSession(input: { projectId: string; title?: string; permission: PermissionLevel }): Promise<HostSessionSummary>
  prompt(sessionId: string, input: PromptInput): Promise<{ messageId: string }>   // 必要时启动或恢复 Host
  stop(sessionId: string): Promise<void>                                          // 先走控制面取消，12 秒后仍未停则杀进程树
  prewarm(sessionId: string): void
  respondApproval(id: string, fingerprint: string, allowed: boolean): void
  answerQuestion(id: string, answer: QuestionAnswer): void
  structured<T>(request: StructuredRequest<T>): Promise<T>                        // 工具型 Host，见 4.9
  list(): HostSessionSummary[]
  events(sessionId: string, afterSeq: number): UiEvent[]                          // 投影后的事件，见 4.6
  shutdown(): Promise<void>
}
```

**要求**

- 启动 Host 前必须调用现有的 `verifyRuntime(runtimeRoot)` 校验 manifest；子进程环境用现有的 `workerEnvironment()`。
- 项目目录必须经过现有 `validateDirectory` 的同等校验，并在会话生命周期内锁定 realpath。目录变化时拒绝继续并提示。
- Host 进程意外退出时：会话标记为 `failed`，保留已持久化事件，未完成的工具回执按现有 `reconcileWrites` / `reconcileChecks` 逻辑在下次恢复时核对。
- 应用退出时调用 `shutdown()`，按与 `stopWorkbench()` 相同的顺序：先停排队，再停活跃会话。
- `src/main/workbench/service.ts` 不删除，保留只读能力（读取旧任务详情）。新会话一律走 HostManager。

**SDK 客户端的放置**：优先在主进程直接使用 `@deepseek-ai/dsh-sdk-client` 的 `HarnessClient` 启动 runtime（`dshBin` 指向打包后的 `runtime.mjs`，用独立 Node 执行）。如果 SDK 在 Electron 主进程的打包环境里无法使用，就保留 `worker.mjs` 作为中转：扩展它的行协议，支持 `prompt` / `resume` / `wait` / `stop` 多轮。具体以验证门 **V1** 的结果为准。

### 4.2 Host 运行时组合

**文件**：`integrations/harness/runtime.mjs`（修改）。runtime 由 `scripts/build-harness.mjs` 用 esbuild 打包，新增 import 后需重新执行 `npm run build:harness`。

| 用途 | 包 | 阶段 |
|---|---|---|
| 基础（现有） | `cordis`、`dsh-llm`、`dsh-session`、`dsh-session-projection`、`dsh-system-prompt`、`dsh-tools`、`dsh-agent`、`dsh-agent-loop`、`dsh-session-checkpoint-policy`、`dsh-llm-deepseek-api-key`、`dsh-sdk-jsonrpc-server`、`dsh-fs-local`、`dsh-working-directory` | P0 |
| 人在回路 | `dsh-user-approval`、`dsh-user-questions`、`dsh-tool-ask-user` | P0 |
| 目标与计划 | `dsh-goal`、`dsh-tool-goal`、`dsh-plan-mode`、`dsh-tool-todo` | P4 |
| 长会话 | `dsh-compaction-basic`、`dsh-session-title` | P0（title），P4（compaction） |
| 工作区变更 | `dsh-workspace-changes` | P4 |
| 子 Agent | `dsh-subagent`、`dsh-tool-subagent` | P4 |
| 附件 | `dsh-attachment` | P1 |
| 沙箱 | `dsh-sandbox`、`dsh-sandbox-windows-acl`、`dsh-tool-pwsh` | P4，且须通过验证门 V6 |

系统提示（`personaPrefix`）沿用现有文字，再补充两句："剪贴板和资源通过 clipvault 工具访问；资源只以 ID 和字段名出现，绝不索取或输出秘密值。""用户消息中的 `@资源:<id>` 是资源引用，不是秘密值。"

### 4.3 clipvault-control 插件

**文件**：`integrations/harness/control.mjs`（新建），在 `runtime.mjs` 中于 `dsh-user-approval`、`dsh-user-questions` 之后加载。

**职责**

1. **审批应答者。** 注册为 `approval/request` waterfall 监听器（接口见 `dsh-user-approval/README.zh.md` 中"组合应答者"一节）。收到请求后 `POST {CV_BRIDGE_URL}/control/approval`，Body 为 `{ requestId, tool, reason, callId }`，阻塞等待主进程返回 `{ decision: 'allow' | 'deny' }`。
   - 网络错误或超时（5 分钟）一律返回拒绝。
   - 官方审批请求**不带工具参数**，所以写文件、调接口、跑命令仍由 `clipvault-tools` 自带的内容审批负责。
2. **追问应答者。** 为 `ctx.userQuestions` 提供应答，`POST /control/question`，阻塞等待用户回答；用户取消时返回官方定义的"无答案/拒绝"结果。
3. **取消。** 插件启动后长轮询 `GET /control/next`（30 秒超时后重连）。收到 `{ type: 'cancel' }` 时，取消当前根 Agent 的轮次。取消入口以 `dsh-agent-loop` README"失败与取消"一节和类型声明为准；结果以 `turn/end` 事件中的取消原因体现。
4. 所有请求都带 `Authorization: Bearer ${CV_BRIDGE_TOKEN}`，Body 中带 `sessionId`。主进程侧必须校验令牌与会话的绑定，不匹配就返回 403。

**主进程侧**：在 `bridge.ts` 增加 `/control/approval`、`/control/question`、`/control/next` 三个路由，挂到 `Options.control` 回调上（与现有 `session` 回调同样的模式）。审批和追问进入 HostManager 的队列，经 IPC 推给渲染层。

### 4.4 clipvault-tools 插件

**文件**：`integrations/harness/tools.mjs`（扩展），主进程实现放在 `src/main/workbench/tools.ts`（扩展），或新建 `src/main/harness-host/tools/*.ts`。

保留现有 6 个工具，新增：

| 工具 | 参数 | 返回 | 规则 |
|---|---|---|---|
| `clipboard_search` | `query?: string, category?: Category, projectId?: string, since?: number, limit<=20` | `[{ id, category, sourceApp, copiedAt, preview }]`，preview ≤ 200 字，已脱敏 | 敏感类（`secret`）条目只返回 `{ id, category: 'secret' }`，不给 preview |
| `clipboard_read` | `id: string` | `{ id, text }`，≤ 20,000 字，已脱敏 | 读取 `secret` 类返回错误"敏感内容不提供给模型"；图片返回本地 OCR 文本 |
| `resource_list` | `projectId?: string, query?: string` | `[{ id, name, kind, environment, purpose, fields: [{ name, role, secret }] }]` | 不含任何值 |
| `resource_use` | `resourceId, action: 'check_api' \| 'fill_login', field?: string, expectedText?: string` | 状态与是否匹配 | 每次都要审批；`check_api` 复用现有 `checkApi`；`fill_login` 打开现有登录助手 |
| `resource_propose` | `resourceId?, patch: { name?, purpose?, projectId?, environment?, aliases?, tags? }` | `{ proposalId }` | 只能改元数据，不能写入值；生成一张"资源更新建议"卡，需用户确认 |

所有工具的返回都必须先经过统一脱敏（4.8）。

### 4.5 会话持久化：按事件分行

**问题**：现有 `session-store.ts` 每追加一个事件，都要全量解密、重加密整个会话（上限 8 MB），属于平方级开销，而且同步阻塞主进程。

**迁移 026**：`026_session_events`

```sql
CREATE TABLE wb_sessions (
  id TEXT PRIMARY KEY, project_id TEXT REFERENCES wb_projects(id),
  header TEXT NOT NULL,            -- 加密 JSON（官方 header）
  data TEXT NOT NULL,              -- 加密 JSON：title、permission、state、legacyTaskId 等
  event_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE wb_session_events (
  session_id TEXT NOT NULL REFERENCES wb_sessions(id),
  seq INTEGER NOT NULL, event TEXT NOT NULL,   -- 加密 JSON，单个事件
  PRIMARY KEY (session_id, seq)
);
```

**要求**

- `append(cursor, events)` 在一个事务中完成：校验 `cursor === event_count`，逐条 `INSERT`，再更新 `event_count`。单事件上限 1 MB，单会话事件数上限 50,000。
- `read` 返回 header 与全部事件。`encrypted-persistence.mjs` 的 `append` 不再在每次追加前全量读取，改为调用新增的 `count` 操作取游标。
- 旧格式（`wb_settings` 中的 `session:<id>`）在首次读取时惰性迁移到新表；迁移成功后保留旧行，不删除。
- 保持现有的会话绑定：令牌只能访问自己的 `sessionId`。

### 4.6 事件投影

**文件**：`src/main/harness-host/projection.ts`。把官方 `session.event` 投影成 UI 事件：

```ts
export type UiEvent =
  | { seq: number; type: 'user_message'; text: string; mentions: Mention[]; at: number }
  | { seq: number; type: 'assistant_message'; text: string; at: number }
  | { seq: number; type: 'process'; summary: string; items: ProcessItem[]; at: number }   // 连续的工具调用合并为一行
  | { seq: number; type: 'approval'; approval: UiApproval; at: number }
  | { seq: number; type: 'question'; question: UiQuestion; at: number }
  | { seq: number; type: 'change'; path: string; state: 'pending' | 'written' | 'rejected'; added: number; removed: number; at: number }
  | { seq: number; type: 'verification'; scope: string; passed: boolean; detail: string; at: number }
  | { seq: number; type: 'goal' | 'todo'; data: unknown; at: number }
  | { seq: number; type: 'status'; state: SessionState; text: string; at: number }
  | { seq: number; type: 'error'; text: string; at: number }
```

**要求**

- 投影前，所有文本先过统一脱敏（4.8）。
- 官方事件类型名以 `dsh-session` 的类型声明为准。未知事件类型忽略，不要报错。
- 投影结果只放在内存中缓存；需要时由持久化事件重新计算，不另存一份明文。

### 4.7 IPC 与 preload

**文件**：新建 `src/preload/session-api.ts`，在 `src/preload/index.ts` 中暴露为 `window.sessionAPI`；handler 新建 `src/main/ipc/session-handlers.ts`。

| 方法 | 说明 |
|---|---|
| `list()` | 会话列表 |
| `create({ projectId, title?, permission })` | 新建会话 |
| `prompt({ sessionId, text, mentions })` | 发送消息；发送前在主进程做密钥拦截（6.2 入口 C） |
| `events({ sessionId, afterSeq })` | 拉取 UI 事件 |
| `stop(sessionId)` / `prewarm(sessionId)` | 停止 / 预热 |
| `respondApproval({ id, fingerprint, allowed })` | 审批 |
| `answerQuestion({ id, answer })` | 回答追问 |
| `mentionCandidates({ kind, query })` | `@剪贴板` / `@资源` / `@文件` 候选 |
| `onChanged(cb)` | 订阅 `session:changed` 推送（只带 sessionId 和最新 seq，渲染层再来拉） |

剪贴板、资源、收件箱的新方法加到各自现有的 API 上（见第 5 至 7 节）。

### 4.8 统一脱敏（v1.1 重写）

**原则：拦截只针对"确定是秘密"的东西；"看起来像秘密"的东西只做替换，从不拦截。**

#### 4.8.1 扫描器

**文件**：`src/main/workbench/secret-scan.ts`（新建）。纯函数，不访问数据库，便于测试。

```ts
export type SecretHitKind = 'known' | 'format' | 'assignment'
export interface SecretHit { kind: SecretHitKind; label: string; start: number; end: number }
export function scanSecrets(text: string, known: string[]): SecretHit[]
```

**三个层级**：

| 层级 | 含义 | 规则 |
|---|---|---|
| `known` | 资源库里已存的秘密值 | 全部资源（含历史版本与已撤销版本）的秘密字段值，匹配原文与 JSON 转义形式（`JSON.stringify(v).slice(1, -1)`）。长度 < 6 的值不参与匹配；6–11 位要求前后都不是字母或数字；≥ 12 位按子串匹配 |
| `format` | 高确定性的密钥格式 | `sk-`（含 `sk-ant-`、`sk-proj-`）后接 ≥ 20 位；`ghp_` / `gho_` / `ghu_` / `ghs_` / `ghr_` 后接 36 位，或 `github_pat_`；`AKIA` / `ASIA` 后接 16 位；Slack `xox[baprs]-`；Google `AIza` 后接 35 位；PEM 私钥头 `-----BEGIN … PRIVATE KEY-----`；JWT 要求**三段且第二段也以 `eyJ` 开头**；URL 内嵌密码 `scheme://user:pass@` |
| `assignment` | "键 = 值"形式、像是秘密的字面量 | 键名含 password / passwd / pwd / secret / token / api_key / access_key / private_key / client_secret / authorization / 密码 / 密钥 / 令牌，**且**值是带引号的字面量（≥ 8 位、无空白）；或 `.env` 风格整行 `KEY=VALUE`，其中 KEY 为大写且含 PASSWORD / SECRET / TOKEN / API_KEY 等，VALUE ≥ 8 位、不以 `$` 开头 |

**排除项**（以下情况任何层级都不算命中）：

- 占位符：`xxxx…`、`****`、`...`、`<YOUR_KEY>`、`${VAR}`、`$VAR`，以及以 your / my / example / sample / test / dummy / fake / placeholder / changeme / replace 开头、或以 here 结尾的值；
- 同一字符连续重复 8 次以上（如 `sk-xxxxxxxxxxxxxxxx`）；
- `assignment` 层额外排除：
  - 值为全大写环境变量名（`"JWT_SECRET"`）；
  - 值只含 1 类字符且短于 16 位；
  - 不带引号的标识符、函数调用、类型注解（`string`、`Token | null`）、`process.env.X`、模板插值。

参考实现与 48 条样本见 [reference/secret-scan-prototype.mjs](reference/secret-scan-prototype.mjs)：35 条正常代码不得命中，9 条必须拦截，4 条只替换不拦截。正式实现可以调整写法，但必须通过同一组样本（见 P1-0）。

#### 4.8.2 两种用途

**文件**：`src/main/workbench/redaction.ts`（修改）。

```ts
export function redactForOutput(text: string): { text: string; redacted: boolean }  // 三个层级全部替换为 [已隐藏敏感字段]
export function findBlockingSecret(text: string): SecretHit | null                   // 只看 known + format
export function findPossibleSecret(text: string): SecretHit | null                   // 只看 assignment，用于提示，不拦截
```

- `known` 列表来自 `allResourceSecrets()`（现有实现保留，含缓存与锁库失效）。
- 现有 `outboundRedact` 改名或改为 `redactForOutput` 的别名。`redactInput` 保留给旧代码和 `parseResourceText` 使用，**新代码中不再用它做外发判断**。

#### 4.8.3 按场景使用

| 场景 | 现有位置 | 替换 | 拦截 |
|---|---|---|---|
| 模型流式输出 | `model-stream.ts` `SafeFrameQueue.push` | — | `findBlockingSecret`。命中时中止本次回复。删掉 `redactInput(this.text/args).redacted` 判断；结尾疑似半截 JWT 时改为**延迟发送**，不抛错 |
| 用户发送消息 | `harness-host/manager.ts` 发送前检查 | — | `known` / `format` 命中：硬拦截，提示存为资源（入口 C）；`assignment` 命中：不拦截，返回 `POSSIBLE_SECRET`，界面提示"这段像是密码，要先存为资源吗？"，用户选"按原样发送"后带 `allowPossibleSecret: true` 重发 |
| `read_file`、剪贴板引用、命令输出、工具错误、事件投影、导出、追问文本 | `tools.ts`、`data-tools.ts`、`projection.ts`、`questions.ts`、`daily.ts` 等 | `redactForOutput` | — |
| `write_file` | `tools.ts` | — | 写入内容 `findBlockingSecret` 命中则拒绝。写入内容包含占位符 `[已隐藏敏感字段]` 时拒绝，提示"该处含被隐藏的值，请在本地编辑"。**原文件内容命中不再直接拒绝** |
| 本机检查快照 | `files.ts` `snapshot` | — | 只有 `findBlockingSecret` 命中才拒绝；`assignment` 不拒绝 |
| 本机检查命令参数 | `tools.ts` `runCheck` | — | `findBlockingSecret` |
| bridge 外发请求体 | `bridge.ts` | — | 仅 `known`（现有 `containsSecrets`，保留原文 + 转义形式） |
| 剪贴板是否对模型隐藏 | `data-tools.ts` `privateClip` | — | 分类为 `secret` / `credential`，或 `findBlockingSecret` 命中；`assignment` 命中只替换显示，不整条隐藏 |
| 依次粘贴恢复原剪贴板 | `resources/sequence.ts` | — | `findBlockingSecret` 或 `findPossibleSecret` 命中都不恢复（保守即可） |

- `bridge.ts` 的外发检查同时检查秘密的原文和 JSON 转义形式，与回复检查保持一致（已实现，保留）。这一条修复审查发现第 4 项。
- 这一节整体修复审查发现第 1 项，同时修复 v1.1 发现的误拦问题。

### 4.9 工具型 Host（structured 调用）

用于 AI 找回（5.4）、AI 整理（5.5）、资源结构化（6.2）。

```ts
interface StructuredRequest<T> { purpose: 'clipboard_query' | 'clipboard_organize' | 'resource_structure'; prompt: string; schema: ZodSchema<T>; timeoutMs: number }
```

- 由一个不加载任何工具的 Host 进程处理，每次请求用一个新的临时 sessionId，结果用 zod 校验，校验失败就报错（不重试超过 1 次）。
- 临时会话的持久化：如果官方提供内存持久化或可以关闭持久化，就用它；否则写入 `wb_sessions`，并标记 `utility=true`，24 小时后清理。以验证门 **V5** 为准。
- 未配置模型或 Host 不可用时，`structured()` 抛出 `ModelUnavailableError`，调用方必须有本地降级路径。

---

## 5. 剪贴板（一级功能）

### 5.1 保留清单与回归测试

下表每一项都必须在 4.0 里可用，并有自动化测试覆盖（已有测试的保留，没有的补上）：

| 类别 | 能力 |
|---|---|
| 捕获 | 文本、HTML、图片；监听开关；重复复制记为同一记录的多次发生 |
| 存储 | 加密；图片 `.cvimg`；损坏密文拒绝复制；保留策略（历史天数、容量 MB、图片天数） |
| 找回 | 关键词与模糊搜索；来源应用、时间筛选；最近复制排序 |
| 管理 | 置顶、长期保存独立副本、删除、多选 |
| 粘贴 | 复制、仅复制图片、仅复制路径、图加路径；`Ctrl+Shift+P` 粘贴最近一条 |
| 安全 | 密钥拦截、遮罩、定时自动清除 |
| 片段 | 片段与快捷短语 |
| 快捷键 | `Alt+Space` 面板、`Ctrl+Space` 主窗口、`Ctrl+Shift+F` 搜索，均可自定义 |

**底线测试**：Host 运行时目录不存在、或未配置模型时，以上能力全部正常（新增集成测试 `src/main/clipboard/offline-core.integration.test.ts`）。

### 5.2 本地分类器

**文件**：`src/main/clipboard/classify.ts`（新建），纯函数、同步、无网络，单条耗时 < 5 ms。

```ts
export type ClipCategory = 'code' | 'error' | 'command' | 'link' | 'path' | 'credential' | 'secret' | 'image' | 'text'
export function classifyClip(input: { type: string; text: string; sourceApp?: string }): { category: ClipCategory; signals: string[] }
export function matchProject(text: string, projects: WorkProject[]): string | null   // 按绝对路径前缀、仓库目录名、package.json name 匹配
```

- 规则示例：
  - `error`：堆栈行（`at x (file:line)`、`Traceback`、`Exception`）。
  - `command`：单行、以常见命令开头（`npm`、`git`、`docker`、`sudo` 等），或含 `&&`。
  - `credential`：多行且含用户名/密码类键名（复用 `parseResourceText` 的识别）。
  - `secret`：命中现有 `src/utils/key-detector.ts` 或 `redactInput` 的正则。
- **迁移 027**：`clipboard_history` 增加 `category TEXT`、`project_id TEXT` 两列，并加索引 `(category, last_copied_at DESC)`。新记录在捕获时写入；旧记录在后台分批补算（每批 200 条，用 `setImmediate` 让出主线程）。
- `signals` 只用于界面展示"识别依据"，不入库。

### 5.3 快速粘贴面板（HUD 改版）

在现有 `src/renderer/src/hud/*` 基础上改版：

- **默认视图**：最近复制 20 条；输入即筛选，同时搜剪贴板、片段、资源。资源只匹配名称、别名、项目、域名、用途，不匹配值。
- **键位**：
  - `Enter`：粘贴所选到前台应用（复用 `paste-active.ts`）。
  - `1`–`9`：直接粘贴对应条目。
  - `Tab`：以所选内容开新会话（问 AI）。
  - `→`：展开资源动作菜单（见 6.4）。
  - `Esc`：关闭。
- 面板打开时记住前台窗口，粘贴前把焦点还给它（沿用现有 HUD 行为）。
- 秘密类条目在列表中遮罩显示，粘贴后按自动清除设置清除。

### 5.4 AI 找回

- **入口**：剪贴板页搜索框和快速粘贴面板。输入以自然语言为主（含空格且超过 6 个字），或用户按 `Ctrl+Enter` 时触发。
- **流程**：
  1. 本地先跑普通搜索，并立即显示结果。
  2. 同时调用 `structured({ purpose: 'clipboard_query' })`。发送内容**只有**：查询句（先经 `outboundRedact`）、当前日期、项目名列表、分类枚举、来源应用名列表。
  3. 模型返回筛选条件：
     ```ts
     { since?: string; until?: string; projectName?: string; categories?: ClipCategory[]; sourceApps?: string[]; keywords: string[] }
     ```
  4. 在本地执行检索，结果替换列表。界面显示"AI 理解为：…"标签，每个标签可点掉。
- 模型不可用时只显示本地结果，不报错。
- **测试**：断言发给模型的请求体里不含任何剪贴板内容（构造带唯一标记的剪贴板记录，检查请求体）。

### 5.5 AI 整理（按需）

- 用户在剪贴板页多选后点"让 AI 整理"，弹出确认框，列出将发送的条目（已脱敏预览）。`secret` / `credential` 类条目默认不勾选，并提示"建议改用'存为资源'"。
- 返回：
  ```ts
  { items: [{ id, title, summary }], suggestions: [{ type: 'merge_snippet' | 'save_resource' | 'delete_duplicate', ids: string[], reason: string }] }
  ```
- `title`、`summary` 加密存入 `clipboard_history` 新增列 `ai_meta`（迁移 027 一并加），用于展示和搜索。建议以卡片形式展示，必须由用户点击执行。

### 5.6 本地整理建议

**文件**：`src/main/clipboard/suggestions.ts`。每 10 分钟、以及应用启动时运行一次，只在本地计算：

- 同一项目 24 小时内反复一起复制的 2–5 条，建议"存成片段"。
- `secret` 类记录超过 7 天未清除，建议"清除"。
- 内容完全相同但被长期保存了多份，建议"去重"。
- 保留策略即将清理的记录里，有被会话引用的，标记"受保护，不会清理"（清理逻辑同步修改：被 `wb_session_events` 引用的剪贴板 ID 不清理）。

建议写入收件箱（第 7 节），类型为 `organize`。

---

## 6. 账号与密钥（资源）智能管理

### 6.1 目标

用户给一段资料（账号、密码、密钥、地址都行），再说一句"做什么用的"，系统就整理成结构化资源：名称、项目、环境、用途、登录地址、字段角色、别名、轮换提醒。下次能快速搜到、一键依次粘贴、辅助登录。**任何秘密值都不发给模型。**

### 6.2 录入流程

**三个入口，走同一条流水线**：

- **A. 手动**：资源页或快速粘贴面板里点"新建资源"，粘贴资料，再填一句用途（可选）。
- **B. 剪贴板**：复制内容被分类为 `credential` 或 `secret` 时，收件箱生成"存为资源"建议，点开后进入同一流程，用途输入框获得焦点。
- **C. 对话输入框**（v1.1 修订，规则见 4.8.3）：
  - `findBlockingSecret` 命中（已知秘密或高确定性密钥格式）：**消息不发送**，弹出"检测到账号/密钥。存为资源（不会发给模型）？"。用户确认后走本流程；保存成功后，消息里的秘密部分替换为 `@资源:<名称>` 引用，再发送。用户也可以选择"删掉这部分再发送"。
  - 只有 `findPossibleSecret` 命中（"键 = 带引号字面量"之类）：弹出非阻断提示"这段像是密码，要先存为资源吗？"，提供"存为资源"和"按原样发送"两个选项。
  - 都没命中：直接发送。用户讨论 `password: string` 这类代码时不应出现任何提示。

**流水线**（文件：`src/main/resources/intake.ts`，新建目录 `src/main/resources/`）：

1. **本地解析**：调用现有 `parseResourceText(text)`，得到 `fields`、`endpoint`、`suggested`、`warnings`。
2. **脱敏骨架**：把每个字段值替换为令牌 `⟦v1⟧`、`⟦v2⟧`…，并附上描述：
   ```ts
   { token: string; originalName: string; length: number; charClasses: ('lower'|'upper'|'digit'|'symbol')[];
     format: 'email' | 'url' | 'jwt' | 'sk_key' | 'aws_key' | 'github_token' | 'otpauth' | 'base32' | 'digits' | 'uuid' | 'unknown';
     secretGuess: boolean }
   ```
   - endpoint 只保留 `origin + pathname`，去掉查询串和认证信息。
   - 用户名默认也令牌化。设置里提供开关"允许把用户名发给 AI 用于命名"，默认关闭。
3. **AI 结构化**（可选，模型可用时执行）：`structured({ purpose: 'resource_structure' })`。发送：骨架、用户的用途说明（先经 `outboundRedact`）、现有项目名与环境列表、现有资源名称列表（用于避免重名）。返回：
   ```ts
   { name: string; kind: ResourceKind; projectName?: string; environment?: string; purpose: string; loginUrl?: string;
     fields: [{ token: string; name: string; role: FieldRole; secret: boolean }];
     aliases: string[];          // 2–6 个便于搜索的别名，如"支付后台""payment admin"
     tags: string[]; rotateAfterDays?: number; notes?: string }
   ```
   - **校验**：`fields[].token` 必须是骨架令牌的子集且不重复；所有字符串字段都不得包含任何原始值（逐个检查原始值是否出现在返回 JSON 里，一旦出现就丢弃整个结果）；`loginUrl` 必须是 HTTPS，且 origin 与骨架里的 endpoint 一致，或为空。
4. **回填**：在主进程把令牌换回原值，生成 `ResourceInput` 草稿。AI 不可用时，直接用第 1 步的本地结果。
5. **去重**：用秘密值的 HMAC（以 DEK 派生的子密钥计算，不存原值哈希）与现有资源比较：
   - 同一秘密已存在于资源 X，提示"更新 X 的新版本"或"另存为新资源"。
   - 同一登录地址加同一用户名已存在，提示"更新 X 的密码"。
6. **确认卡**（渲染层 `ResourceIntakeReview`）：
   - 可以编辑名称、项目、环境、用途、登录地址、别名、标签。
   - 字段表：名称、角色、是否秘密；值默认遮罩，按住"显示"按钮时才显示。
   - 显示本地解析的 `warnings`。
   - 保存时调用现有 `saveResource`（自带版本号）。
7. **入口 B 的收尾**：保存成功后，提示"清除剪贴板中的原文？"，默认选中"清除"。

### 6.3 数据模型

**迁移 028**：`028_resource_roles_usage`

```sql
ALTER TABLE wb_resource_fields ADD COLUMN role TEXT NOT NULL DEFAULT 'other';
ALTER TABLE wb_resources ADD COLUMN last_used_at INTEGER;
CREATE TABLE wb_resource_secret_index (
  resource_id TEXT NOT NULL REFERENCES wb_resources(id), field TEXT NOT NULL,
  mac TEXT NOT NULL, PRIMARY KEY (resource_id, field)
);
CREATE INDEX idx_wb_secret_mac ON wb_resource_secret_index(mac);
```

```ts
export type FieldRole = 'username' | 'password' | 'api_key' | 'token' | 'totp_seed' | 'host' | 'port' | 'database' | 'connection_string' | 'other'
```

- `wb_resources.data`（加密 JSON）新增字段：`aliases: string[]`、`tags: string[]`、`loginUrl?: string`、`rotateAfterDays?: number`、`notes?: string`。
- 现有类型 `ResourceFieldInput`、`ResourceField`、`WorkResource`、`ResourceInput`、`ResourceDraft` 同步扩展（`src/types/workbench.ts`）。
- **TOTP**：`role = 'totp_seed'` 的字段值可以是 base32 或 `otpauth://` URI（用现有 `otpauth-parser.ts` 解析），用现有 `totp/generator.ts` 生成验证码。
- **旧凭证**：继续通过现有 `importLegacyCredential` 导入；导入时如果旧凭证带 TOTP，一并转为 `totp_seed` 字段。
- **注意**：`wb_resources.name` 现在是明文列。4.0 不改这一点，但在 `SECURITY.md` 的元数据清单里写明。

### 6.4 取用

**快速粘贴面板**：搜索"支付后台"会命中别名，资源行按 `→` 或 `Enter` 展开动作菜单：

| 动作 | 行为 |
|---|---|
| 依次粘贴（默认） | 进入"依次粘贴"模式，见下文 |
| 复制用户名 / 复制密码 / 复制验证码 | 写入剪贴板；秘密类按自动清除设置清除 |
| 打开登录页 | 用现有 `openResource` 打开 `loginUrl` 或 `endpoint` |
| 辅助登录 | 现有登录助手（`login.ts`）：确认域名后填写，不自动提交 |

**依次粘贴模式**（文件：`src/main/resources/sequence.ts`）：

1. 按 `username → password → totp` 顺序，组成一个队列，只包含存在的字段。
2. 第 1 项立即粘贴到前台应用（`paste-active.ts`）。
3. 之后每按一次全局快捷键 **"粘贴下一个字段"**，就粘贴下一项。默认快捷键 `Alt+Shift+V`，在 `shortcuts/registry.ts` 注册，可自定义；注册失败时提示冲突。
4. 屏幕右下角显示小提示："下一项：密码 · Alt+Shift+V · 60 秒后结束"。
5. 队列 60 秒无操作或全部粘贴完即结束。结束时清空剪贴板，并恢复进入模式前的剪贴板内容（仅限非秘密文本）。
6. **这些自写入绝不进入剪贴板历史**。一律通过 `getClipboardMonitor().writeText()` 写入（内部调用 `rememberSelfWrite()`），并加测试。
7. 每次取用更新 `last_used_at`，并写入现有审计日志（不记录值）。

**资源详情页**：每个字段一行，带大号"复制"按钮；`totp_seed` 显示实时验证码和倒计时圈（复用 `TOTPRing.tsx`）；另有登录页、辅助登录、版本历史、撤销。

### 6.5 管理

- **轮换提醒**：`rotateAfterDays` 到期前 7 天，在收件箱生成 `rotate` 建议。
- **健康**：复用 `health/checker.ts`，对 `password` 角色检查弱密码和重复；结果显示在资源详情页，重复时也在收件箱提示。
- **撤销与版本**：沿用现有 `revokeResource` 与字段版本；撤销后，快速面板和 Agent 工具都看不到该资源。
- **会话里的资源管理**：Agent 可以通过 `resource_propose` 建议更新用途、别名、项目归属，由用户确认；Agent 永远拿不到值。

---

## 7. 收件箱

**迁移 029**：`029_inbox`

```sql
CREATE TABLE wb_inbox (
  id TEXT PRIMARY KEY, type TEXT NOT NULL,          -- error_fix | save_resource | duplicate_secret | organize | rotate | weak_password
  source_id TEXT, project_id TEXT, data TEXT NOT NULL, -- 加密 JSON：标题、依据、建议首句、关联 ID
  state TEXT NOT NULL DEFAULT 'open',                -- open | done | dismissed
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX idx_wb_inbox_state ON wb_inbox(state, created_at DESC);
```

**生成规则**（文件：`src/main/inbox/rules.ts`，全部在本地完成）：

| 类型 | 触发 |
|---|---|
| `error_fix` | 新剪贴板记录分类为 `error`，且匹配到项目 |
| `save_resource` | 分类为 `credential`，或分类为 `secret` 但与现有资源不重复 |
| `duplicate_secret` | `secret` 的 HMAC 命中 `wb_resource_secret_index` |
| `organize` | 5.6 的本地整理建议 |
| `rotate` / `weak_password` | 6.5 |

**行为**：

- 同一来源 10 分钟内只生成一条建议。用户点"不再提示此类"时，在设置里记一条规则。
- `error_fix` 详情页提供可编辑的"首句"（默认"定位并修复这段报错，补一条复现测试"）。点"在 <项目> 开会话"时才创建会话并发送，同时把这条剪贴板作为 `@剪贴板` 引用附上。
- 收件箱页头固定显示"本地识别，未调用模型"。
- **L2 预分析**（后台子 Agent 先读代码）属于 P4 可选项，按项目开关，默认关闭。

---

## 8. 界面规格

### 8.1 视觉语言："安静的工作台"

- **去掉像素风**：移除 `Pixelify Sans` 的使用和 `PixelToast` 的像素样式。字体包可以保留在依赖里，但界面不再引用。
- **配色**：在 Tailwind 主题中定义 CSS 变量，分浅色和深色两套。
  - `--bg-app`（中性灰）、`--bg-surface`（白/深灰内容面）、`--bg-subtle`（侧栏）。
  - `--border`（0.5px 发丝线）、`--text`、`--text-2`、`--text-3`。
  - 单一强调色 `--accent`。
  - 状态色只用于状态：`--state-running`（强调色）、`--state-waiting`（琥珀）、`--state-done`（绿）、`--state-failed`（红）、`--state-stopped`（灰）。
- **字体**：界面用 `Plus Jakarta Sans` + 系统中文字体（`Microsoft YaHei UI`）；代码、路径、命令用 `IBM Plex Mono`。
- **字号**：正文 13px，辅助 12px，最小 11px；标题 14–16px；只用 400 和 500 两种字重。
- **圆角**：控件 8px，卡片 12px。不用阴影、渐变。
- **列表**用分隔线，不堆卡片。整个界面只有审批卡用琥珀色描边。

### 8.2 主框架

- 三栏布局：左栏 220px（可收起），右栏 260px（可收起），中栏自适应。窗口最小 960×640。
- **左栏**从上到下：
  - `新会话`（`Ctrl+N`）
  - `剪贴板`、`收件箱`（角标）、`资源`
  - 会话列表：按项目分组，状态点
  - 底部：`更多`（项目、TOTP、片段、原有凭证、健康报告）、`设置`
- 路由：`/sessions/:id`、`/clipboard`、`/inbox`、`/resources`、`/resources/:id`、`/more/*`、`/settings`。旧路由 `/workbench` 重定向到最近会话或新会话页；其余旧路由保留可达。

### 8.3 对话页 `/sessions/:id`

- **顶栏**：会话标题（可改）、`#项目` 标签、状态（点 + 文字）、停止按钮（运行中才显示）。
- **消息区**：
  - 用户消息：右侧浅底气泡，`@` 引用显示为小标签（剪贴板图标 / 钥匙图标 + 名称）。
  - Agent 消息：全宽，不用气泡。
  - 过程行：一行灰色小字（"读取 3 个文件 · 搜索剪贴板 1 次 · 12 秒"），默认折叠，点开列出明细。
  - **追问卡**：问题 + 选项按钮或文本框；回答后变为只读，显示"已回答 X"。
  - **审批卡**：琥珀色描边；标题"需要确认 · <动作>"，右侧显示目标路径；内容为差异（等宽字体，红删绿增，带行号）；底部写"只批准这一次"，按钮为"拒绝"和"允许"。过期后变灰，显示"已过期"。
  - 验证结果行：通过为绿色勾，失败为红色叉，附范围说明（"JSON 格式检查"、"npm test 退出码 0"）。
- **输入框**：多行；`Enter` 发送，`Shift+Enter` 换行。
  - 输入 `@` 弹出候选（剪贴板最近 / 搜索、资源、项目文件）。
  - 输入 `/` 弹出技能（由旧模板转换而来）。
  - 附件按钮。
  - 发送前在主进程做密钥拦截（6.2 入口 C）。
- **新会话首屏**：选择项目，下方 3 张"最近复制"快捷卡（例如最近的报错 → "修复它"）。
- **右栏"本会话上下文"**：目标与待办、引用资料（资源以遮罩显示）、改动文件（点击看差异）、本会话授权（模型、资源、权限级别）。

### 8.4 剪贴板页 `/clipboard`

- **页内左侧分组栏**（160px）：全部、置顶、长期保存；自动分类（代码、报错、命令、链接、路径、图片、敏感，带计数）；按项目。
- **中间**：
  - 搜索框（支持 AI 找回，见 5.4），下方显示"AI 理解为"标签行和"只发送了这句话"。
  - 列表：每行一个分类图标、单行预览（代码类用等宽字体）、来源应用、复制次数、时间；前 9 行显示数字键。
  - 列表下方是整理建议卡（5.6）。
  - 多选后出现操作条：让 AI 整理、长期保存、删除。
- **右侧详情**：完整预览、来源与时间、复制记录；主按钮"粘贴"，次按钮复制、置顶、长期保存、删除、在会话中使用、存为资源；底部显示保留策略说明。
- 保留现有图片相关操作（仅复制图片、仅复制路径、图加路径）和保留策略设置入口。

### 8.5 收件箱 `/inbox`

- **顶栏**："收件箱" + "本地识别，未调用模型" + "全部忽略"。
- **筛选**：全部、报错、账号资料、密钥、整理、提醒（带计数）。
- **列表**按"今天 / 昨天 / 更早"分组；每行包含类型图标、标题、单行预览（秘密遮罩）、来源与匹配项目、时间，以及行内主操作。
- **右侧详情**：完整预览、本地识别依据、可编辑的首句（`error_fix`）、说明"点了才会把这段内容发给模型"、主按钮（"在 <项目> 开会话" / "存为资源"）、"忽略"。

### 8.6 资源页 `/resources`

- **列表**：名称、项目、类型、字段数、上次使用、上次验证、状态（正常 / 待轮换 / 弱密码 / 已撤销）；搜索匹配名称、别名、项目、域名、用途。
- **"新建资源"**：一个大文本框（"粘贴账号、密码、密钥，什么格式都行"）+ 一行用途输入（"这是做什么用的？"），然后点"整理"，进入确认卡（6.2 第 6 步）。确认卡上标明"AI 只看到了字段的格式，没有看到值"。
- **详情**：见 6.4。

### 8.7 快速粘贴面板

- 宽 520px，居中偏上。
- 顶部为搜索框，右侧标注"剪贴板 · 片段 · 资源"。
- 列表分组：最近复制、片段与资源；行首数字键。
- 底栏键位提示：`Enter` 粘贴、`1-9` 直接粘贴、`Tab` 问 AI、`→` 更多动作。
- 资源动作菜单在面板内右侧展开。

### 8.8 无障碍与适配

- 所有交互可以用键盘完成，焦点可见；图标按钮带 `aria-label`。
- 1280×820 与 960×640 两种窗口下无横向溢出（沿用 `scripts/verify-desktop-workbench.cjs` 的检查方式）。
- 浅色和深色都要检查对比度。

---

## 9. 安全要求

1. **统一脱敏**（4.8，v1.1 修订）：发往模型和渲染层的文本，按全部资源秘密和三层扫描做**替换**；**拦截**只针对已知秘密和高确定性密钥格式，"键 = 值"类规则永不拦截。修复审查发现第 1 项和 v1.1 误拦问题。
2. **秘密不出主进程**：Host 进程、模型请求、会话事件、导出、日志里只出现资源 ID 和字段名。`resource_use` 由主进程代为执行。
3. **资源结构化**只发送脱敏骨架（6.2），并逐字检查返回结果中不包含原值。
4. **OCR**：`attachments.ts` 调用 PowerShell 时加 `-ExecutionPolicy Bypass`（只作用于该进程）。修复审查发现第 2 项。
5. **外发检查**同时检查 JSON 转义形式（4.8）。修复审查发现第 4 项。
6. **密钥拦截整改**：`key-intercept.ts` 不再把原文发给渲染层，只发送遮罩预览和分类；"存为资源"在主进程按 `promptId` 取原文。
7. **合并备份**：在 `source.merge()` 执行前再检查一次 `busy`。修复审查发现第 5 项。
8. **会话存储**按事件分行（4.5）。修复审查发现第 3 项。
9. **审批**：每个审批绑定动作指纹，5 分钟过期，会话停止时全部取消（沿用 `approvals.ts`）。官方审批和自建内容审批进入同一个队列、同一种卡片。
10. **权限级别**：`readonly`（只读工具）、`confirm`（默认，所有写入、网络、命令、资源使用都逐次确认）、`project_auto`（项目内写文件自动允许，但网络、命令、资源使用仍逐次确认）。
11. **依次粘贴**的自写入不进历史；结束后清空剪贴板。
12. 不在任何日志中输出 SDK stderr、请求体、工具参数里的文本内容（沿用现有做法）。

---

## 10. 分阶段任务

每个阶段都要满足质量门（0.3），并按第 13 节汇报。前一阶段验收通过后再开始下一阶段。

### P0 常驻会话与控制面

| 编号 | 任务 | 主要文件 |
|---|---|---|
| P0-1 | 完成验证门 V1–V4，写出结论 | `docs/P0-VERIFICATION.md` |
| P0-2 | 迁移 026 与新会话存储；`encrypted-persistence.mjs` 改为按事件追加；旧格式惰性迁移 | `src/db/migrations/*`、`src/main/workbench/session-store.ts`、`integrations/harness/encrypted-persistence.mjs` |
| P0-3 | `clipvault-control` 插件与 bridge 控制路由 | `integrations/harness/control.mjs`、`src/main/workbench/bridge.ts` |
| P0-4 | HostManager：起停、排队、预热、恢复、崩溃处理 | `src/main/harness-host/manager.ts` |
| P0-5 | 事件投影 | `src/main/harness-host/projection.ts` |
| P0-6 | 统一脱敏 `outboundRedact`，替换全部调用点；外发检查加转义形式 | `src/main/workbench/redaction.ts`、`bridge.ts`、`tools.ts`、`service.ts` |
| P0-7 | Session IPC 与 preload | `src/main/ipc/session-handlers.ts`、`src/preload/session-api.ts` |
| P0-8 | 最小对话页：消息流、过程行、审批卡、追问卡、停止、恢复（先不做新视觉） | `src/renderer/src/pages/SessionPage.tsx` 等 |
| P0-9 | 修复审查发现 2、5（OCR 执行策略、合并备份 busy 复查） | `attachments.ts`、`workbench-handlers.ts` |

**P0 验收（均需自动化测试）**

- 同一会话多轮对话，Agent 写文件需经审批，拒绝后不写入。
- 运行中点停止：10 秒内状态变为 `stopped`，进程退出，已批准的写入保留。
- 重启应用后恢复同一会话并继续对话（用模型桩，不调真实模型）。
- 两个不同目录的会话并行，互不影响；同目录的第二个会话排队。
- Agent 调用 `ask_user` 时出现追问卡，回答后继续。
- 追加 1,000 个事件时，单次追加耗时不随事件数增长（给出基准测试数据）。
- 未选资源的秘密出现在用户消息、文件、命令输出中时，发往模型的请求体里没有该秘密。

**模型桩**：测试中不得调用真实模型。在 bridge 的模型代理处注入可编排的桩（按脚本返回 Anthropic SSE 格式的工具调用与文本），参考现有 `scripts/fixtures/` 和 `service.integration.test.ts` 的做法。

### P1 资料接入与资源智能录入

| 编号 | 任务 |
|---|---|
| **P1-0（v1.1 新增，最先做）** | 按 4.8 重写扫描器与两种用途，并按 4.8.3 表格逐个替换调用点。样本落为测试夹具 `src/main/workbench/__fixtures__/secret-scan/{clean,block,replace-only}.txt`（每行一条，可在原型样本基础上扩充，**不得删减**），测试为 `secret-scan.test.ts`。完成后更新 `docs/P0-VERIFICATION.md`，补一节"v1.1 误拦修复" |
| P1-1 | `clipboard_search` / `clipboard_read` / `resource_list` / `resource_use` / `resource_propose` 工具 |
| P1-2 | `@剪贴板` / `@资源` / `@文件` 候选与引用（`mentionCandidates`） |
| P1-3 | 工具型 Host 与 `structured()`（验证门 V5） |
| P1-4 | 迁移 028；字段角色、别名、标签、loginUrl、轮换天数；类型扩展 |
| P1-5 | 资源录入流水线 6.2（本地解析、骨架、AI 结构化、回填、去重、确认卡），三个入口 |
| P1-6 | 依次粘贴模式与快捷键；资源动作菜单；资源详情页（含 TOTP） |
| P1-7 | 密钥拦截整改（9.6） |
| P1-8 | `dsh-attachment` 接入 |

**P1 验收**

- **P1-0 误拦修复**（v1.1 新增）：
  - 夹具样本全部判对：`clean` 零命中，`block` 全部拦截，`replace-only` 全部只替换不拦截。
  - 用模型桩让 Agent 的流式回复和 `write_file` 内容包含全部 `clean` 样本，整轮正常完成，文件按审批写入。
  - 用户消息包含 `clean` 样本时直接发送；包含 `replace-only` 样本时返回 `POSSIBLE_SECRET`，带 `allowPossibleSecret: true` 重发后成功；包含 `block` 样本或已知资源秘密时被硬拦截。
  - `read_file` 读取含 `clean` 样本的文件，返回内容与原文完全一致。
  - 含 `clean` 样本的项目可以正常跑本机检查。
  - 原有的秘密保护测试（`redaction.integration.test.ts`、`model-stream.test.ts`、`manager.integration.test.ts` 中未选资源秘密的用例）全部保持通过，不得放宽断言。
- 粘贴一段含 URL、用户名、密码、TOTP 种子的资料，加一句用途，得到正确的结构化草稿。AI 可用和不可用两种情况都要测。
- 断言结构化请求体里不含任何原始字段值，用户名开关关闭时也不含用户名。
- 模型返回中如果包含原值，或包含不存在的令牌，结果被整体丢弃并回退到本地解析。
- 重复秘密能被识别并提示更新。
- 依次粘贴：三项按顺序进入剪贴板，60 秒后结束并清空，期间剪贴板历史不新增记录。
- 在对话输入框粘贴密码并发送时被拦截；保存为资源后，发出的消息只含 `@资源` 引用。

### P2 新外壳与剪贴板改版

| 编号 | 任务 |
|---|---|
| P2-1 | 视觉 token、字体、深浅色；移除像素风引用 |
| P2-2 | 三栏主框架、左栏、路由与旧路由重定向 |
| P2-3 | 对话页按 8.3 完成视觉 |
| P2-4 | 迁移 027 与本地分类器（含旧记录后台补算）；剪贴板页按 8.4 改版 |
| P2-5 | 快速粘贴面板按 8.7 改版 |
| P2-6 | 资源页按 8.6 改版；"更多"页收纳 TOTP、片段、原有凭证、健康报告、项目 |

**P2 验收**

- 第 5.1 节保留清单逐项有回归测试，全部通过。
- 离线核心测试通过：Host 不可用时剪贴板全部能力可用。
- 两种窗口尺寸无溢出；键盘可达（组件测试覆盖 Tab 顺序与快捷键）。
- 分类器对一组固定样本（每类不少于 10 条，放在 `src/main/clipboard/__fixtures__/`）的准确率不低于 90%。

### P3 收件箱与 AI 管理

| 编号 | 任务 |
|---|---|
| P3-1 | 迁移 029 与收件箱规则、页面 |
| P3-2 | 本地整理建议（5.6），以及保留策略对会话引用记录的保护 |
| P3-3 | AI 找回（5.4） |
| P3-4 | AI 整理（5.5，迁移 027 中的 `ai_meta` 列） |
| P3-5 | 快速粘贴面板 `Tab` 问 AI |
| P3-6 | 轮换提醒、弱密码 / 重复密码提示 |

**P3 验收**

- 复制一段报错后 1 秒内出现建议，且期间没有任何模型请求（用桩计数断言）。
- AI 找回的请求体里只有查询句等允许字段（用唯一标记断言）。
- AI 整理只发送用户确认过的条目。

### P4 进阶

| 编号 | 任务 |
|---|---|
| P4-1 | `dsh-goal`、`dsh-plan-mode`、`dsh-tool-todo` 接入，右栏目标与待办 |
| P4-2 | `dsh-subagent`、`dsh-compaction-basic`、`dsh-workspace-changes` |
| P4-3 | Windows ACL 沙箱与 `dsh-tool-pwsh`（验证门 V6） |
| P4-4 | 定时提醒（`dsh-schedule`），会话搜索（`dsh-session-query-sqlite`） |
| P4-5 | 旧任务只读迁移：3.4.0 任务在会话列表中显示为只读历史 |
| P4-6 | 可选 L2 预分析（按项目开关，默认关闭） |

**P4 验收**

- 沙箱内命令写项目外文件被拒（有测试）。
- 旧任务可查看，不能继续运行。

---

## 11. 验证门（失败即停止并汇报，不得绕过）

| 编号 | 要验证的事 | 通过标准 | 失败时 |
|---|---|---|---|
| V1 | `dsh-sdk-client` 能在 Electron 主进程（打包后）驱动独立 Node 运行的 `runtime.mjs` | 多轮 `session/prompt` + `session/wait` 成功，事件流完整 | 改用扩展后的 `worker.mjs` 中转，并在报告中说明 |
| V2 | 能注册 `approval/request` 应答者，并真正拦住一次官方工具的执行 | 拒绝时工具未执行，会话继续 | 停止，汇报接口现状 |
| V3 | `ctx.userQuestions` 能由插件应答，`ask_user` 工具可用 | Agent 收到答案并继续 | 停止，汇报 |
| V4 | 插件能取消当前轮次而不杀进程 | `turn/end` 记录取消原因，进程仍可接收下一条 prompt | 退化为"停止即关进程"，在报告中说明 |
| V5 | 工具型 Host 能使用不落盘或可清理的临时会话 | 临时会话不留明文，24 小时内可清理 | 改为由 bridge 模型代理直接发起单次结构化请求，在报告中说明 |
| V6 | `dsh-sandbox-windows-acl` 在本机可用，且限制写入 | 沙箱内写项目外路径失败 | P4-3 推迟，保留"本机检查不是沙箱"提示 |

每个验证门都要提交最小可复现脚本，放在 `scripts/spikes/`，不打包进应用，并把结论写入 `docs/P0-VERIFICATION.md`。

---

## 12. 测试与命令

- 单元测试、集成测试与现有测试放在一起，命名为 `*.test.ts` / `*.integration.test.ts`；在 Electron 内置 Node 下运行：`npm run test:native`。
- 不调用真实模型，不访问外网；用模型桩和本机临时目录（参考现有测试中 `mkdtemp` 加 `afterEach` 清理的写法）。
- 涉及 Host 的测试先执行 `npm run build:harness`。
- 改动 HUD、页面后，按现有方式跑桌面验证：`node scripts/verify-desktop-workbench.cjs`。它使用临时资料库，不碰用户资料。
- 每个阶段结束时跑完整质量门（0.3）。

---

## 13. 汇报格式（每个阶段结束时）

```markdown
## Pn 阶段报告
- 完成的任务编号：
- 新增/修改的文件：
- 迁移：
- 质量门：typecheck / lint / test:native 的实际输出摘要（测试文件数、用例数、失败数）
- 验证门结论（如涉及）：
- 未完成或偏离本文档的地方，及原因：
- 已知风险与下一阶段需要确认的问题：
```

不能把未运行的检查写成"已通过"。测试失败时，如实贴出失败用例名和错误摘要。

---

## 附录 A：审查发现与对应任务

| 发现 | 对应 |
|---|---|
| 1. 脱敏范围不一致 | 4.8、P0-6 |
| 2. OCR 在默认执行策略下失败 | 9.4、P0-9 |
| 3. 会话追加平方级开销 | 4.5、P0-2 |
| 4. 外发检查漏 JSON 转义形式 | 4.8、P0-6 |
| 5. 合并备份 busy 检查过早 | 9.7、P0-9 |
| 6.（v1.1）"键 = 值"规则误拦普通代码 | 4.8、6.2 入口 C、9.1、P1-0 |

## 附录 B：术语

| 术语 | 含义 |
|---|---|
| Host | 一个运行官方 Harness 组合（`runtime.mjs`）的独立 Node 进程 |
| 会话 | 官方 Session，事件溯源，可多轮、可恢复 |
| 工具型 Host | 不加载工具、只做结构化调用的 Host |
| 资源 | 资源库里的一条记录，含多个带版本、带角色的字段 |
| 脱敏骨架 | 用令牌替换所有字段值后、只保留格式描述的资料结构 |
| 依次粘贴 | 按用户名 → 密码 → 验证码顺序，用快捷键逐项粘贴 |
| 收件箱 | 本地规则生成的建议列表 |
