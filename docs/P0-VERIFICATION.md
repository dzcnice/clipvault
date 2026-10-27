# Harness 原生实现验证记录

本报告对应 `DEV-SPEC-HARNESS-NATIVE.md` v1.0，验证日期 2026-10-26。
仅使用临时资料库、合成账号与本机模型桩；没有调用真实模型，没有读取或迁移用户正在使用的资料库。

## P0 阶段报告

- 完成 P0-1 至 P0-9：官方会话生命周期、控制插件、事件分行加密、统一脱敏、Session IPC、最小对话页，以及 OCR 和备份合并检查修复。
- 新功能入口为 `/sessions`；`/workbench` 重定向到这里。此阶段仍使用旧视觉外壳；资源工具与新录入流程属于 P1，完整界面属于 P2，不能将 P0 视为 4.0 全部完成。
- 主要文件：`integrations/harness/{runtime,control,host-worker,encrypted-persistence}.mjs`、`src/main/harness-host/`、`src/db/harness-session-store.ts`、`src/main/workbench/{bridge,model-stream,redaction,tools,local-check}.ts`、`src/main/ipc/session-handlers.ts`、`src/preload/session-api.ts`、`src/renderer/src/pages/SessionPage.tsx`。
- 迁移 026 新建 `wb_sessions` / `wb_session_events`。额外的 `wb_session_receipts` 加密保存内容审批、追问及本机动作回执，避免把应用私有事件塞进官方连续事件游标。旧 `wb_settings` 会话首次读取时复制迁移，保留源行。
- 质量门：`tsc --build` 成功；ESLint 0 error、0 warning；`node scripts/test-electron-node.cjs --maxWorkers=4` 为 **91 文件、486 用例通过、0 失败**。
- 运行时构建成功：80 个文件、54 个官方及运行依赖包；原官方运行时独立目录 smoke 验证通过。
- Electron 桌面验收通过：1280×820、960×640 会话入口及项目、剪贴板页，无横向溢出、无 preload/renderer 异常，干净退出。此验收只证明 P0 的页面与尺寸，不代替后续 P2 的新视觉验收。
- 构建仍有已有的动态/静态混合 import 与空 vendor chunk 提示，不影响构建通过，尚未当作本次目标清理。

## 验证门及复现

固定官方来源：DeepSeek Harness `0.2.1-rc.2`，源码提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。

| 门 | 真实结果 | 复现 |
|---|---|---|
| V1 | 官方 SDK 用 `process.execPath` 启动子进程，Electron 主进程里该路径为 Electron，不支持指定独立 Node。采用规格明确允许的 worker 中转；worker 内使用官方 `HarnessClient`，没有自建 Agent 循环。独立 Node 多轮与恢复验证通过。 | `node scripts/spikes/sdk-electron-launch.mjs`；`node scripts/spikes/native-controls.mjs` |
| V2 | 对官方 `ask_user_question` 工具注入真实审批要求；拒绝后工具体没有执行，会话继续。 | `node scripts/spikes/native-controls.mjs` |
| V3 | 官方问题回调收到用户答案，下一次模型请求包含答案。 | 同上；HostManager 集成测试另覆盖 Anthropic 与 OpenAI Chat SSE |
| V4 | 控制插件调用官方 Agent 取消接口，产生取消事件；同一个进程可继续接收下一条消息。 | 同上 |
| V5 | P1 已通过：官方 Host 每次新建内存会话，不加载工具，不写入会话数据库。输出用 Zod 校验。 | `node scripts/spikes/utility-host.cjs` |
| V6 | P0 时未执行；2026-10-27 在限定的新临时目录验证通过，含真实官方 PowerShell 写入限制与超时终止。原本机 Node/npm 检查仍不是 OS 沙箱。详见 P4-VERIFICATION.md。 | P4 已补 |

控制面 `/control/next` 使用 POST 长轮询，统一携带 JSON 会话绑定和现有 POST-only 能力令牌校验，功能与规格的 GET 长轮询一致。流式文本另用 `/control/stream`；不投影模型推理文本。

本次复现报告（临时测试产物）：

- V1 Electron：`C:\Users\ADMINI~1\AppData\Local\Temp\cv-sdk-electron-DdSDVu\report.json`
- V1 worker / V2 / V3 / V4：`C:\Users\ADMINI~1\AppData\Local\Temp\clipvault-native-spike-h0np0f\report.json`
- 旧运行时兼容 smoke：`C:\Users\ADMINI~1\AppData\Local\Temp\clipvault-official-harness-85OhCF\report.json`
- 桌面：`C:\Users\ADMINI~1\AppData\Local\Temp\clipvault-workbench-preview-desktop-1V4Wpf\report.json`

## 行为与安全证据

`manager.integration.test.ts` 启动真实官方 Host（本地模型桩）：同会话多轮及新 Manager 恢复、官方追问、拒绝写入不落盘、批准的写入在停止后保留、停止耗时小于 10 秒、两个目录并行与相同目录排队、预热不调用模型、锁库前退出 Host、模型错误标记 failed、OpenAI 兼容流式协议，以及未选资源秘密在文件和命令结果中不进入模型请求。用户消息含已知秘密时在启动前拦截。

`redaction.integration.test.ts` 覆盖全资源与历史版本、撤销版本仍保护、锁库失效、JSON 转义形式外发阻止和会话绑定。`model-stream.test.ts` 覆盖完成前收到流式文本、跨分片秘密阻止、官方工具名精确白名单。

事件追加基准（`out/validation/session-append.json`，全量测试下）：1,000 个事件共 422.36 ms；前 100 条中位 0.3162 ms，后 100 条中位 0.2024 ms。追加路径每次仅解密固定头部，未观察到随已有历史增长而变慢。性能数字是本机合成基准，不是所有硬件上的保证。

一次无并发上限的全量测试暴露 Windows 停止竞态及一个旧集成测试超时。修复了以 `exitCode !== null` 判断进程是否退出的问题（信号退出时仍可能是 null），改为观察 exit 事件，并保留无法确认时的失败关闭行为。最终全量使用 4 个测试 worker，未放宽用例中的 10 秒停止断言。两次失败没有被记作通过。

## 后续范围

P1 已完成，见 `P1-VERIFICATION.md`。P2–P4 尚未完成：分类与新界面、收件箱、AI 找回/整理、进阶官方插件、沙箱验证、旧任务只读迁移。旧任务服务代码保留，最终只读收口按 P4-5 执行。

## v1.1 误拦修复

原先把 `redactInput(...).redacted` 同时用作脱敏和阻断，误拦了类型注解、函数调用和环境变量引用。这是实现错误，不能以“更安全”为由保留。

新增纯函数 `secret-scan.ts`，区分 known / format / assignment。已知值与确定格式用于硬拦截；疑似字面量在用户消息中先提示，明确选择后仅该条允许原样发送。工具结果、事件投影、导出仍使用替换；`write_file` 不再因为旧文件含秘密而拒绝全部修改，但拒绝写入已知秘密及隐藏占位符。本机快照与命令参数仅按确定秘密阻断。

参考原型的 35 条 clean、9 条 block、4 条 replace-only 全部原样保留为夹具，扫描用例全通过。真实官方 Host + 本地模型桩验证：全部 clean 样本可发送、流式回复、读取、审批后写入，含样本的项目通过 `node --test check.cjs`；possible-secret 的明确继续与 known-secret 不可绕过均通过。未放宽原有全资源秘密、跨分片与 JSON 转义保护断言。
