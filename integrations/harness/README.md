# 官方 DeepSeek Harness 集成

本目录正式使用 DeepSeek 官方 Harness；OnSet 仅作为早期产品案例，不是代码、SDK 或运行时来源。

基线见 `official.lock.json`：官方提交 `687f282e8625c6b8d11ff58211a90524be2e4317`，SDK/runtime `0.2.1-rc.2`，Node `22.22.1`，Zod `4.6.6`。

## 构建和验证

在 ClipVault 根目录执行：

```powershell
npm run build
npm run verify:harness
npm run test:native
npm run typecheck
npm run lint
```

`build-harness.mjs` 从已锁定的官方 npm 包构建独立运行时，并带上原生 Koffi、Node、第三方许可证与 SHA-256 清单。桌面主进程先校验清单，再启动任务 worker。可用 `node scripts/open-workbench-preview.cjs` 打开使用临时数据目录的新界面，监听和自动更新关闭。

## 能力与边界

- 每次运行独享官方 Harness 会话与 worker；一个活动任务，其余排队。
- 审批由 ClipVault 主进程实现，包含动作、目标、完整小文件修改内容、指纹和到期时间；拒绝、取消或资源版本变化后不能复用。
- 工具只允许项目内普通文本读取、受批准写入、所选 API 的固定 HTTPS GET 检查、文件格式/文本检查和经批准的本机 Node/npm 检查。
- 密钥不进入 worker 环境、模型消息、工具参数或普通回执。完整模型响应在进入 Harness 持久化前再次检查已知秘密。
- 使用官方 `resumeSession` 恢复同一个会话；运行结束后会话加密归档到数据库。
- 模型结束进入待验收，不能凭文字宣称成功；验收重新检查文件哈希和资源版本。
- 用户于 2026-10-26 明确取消 Docker。检查在项目文本副本中运行，复用已有依赖，不自动安装依赖或注入密钥；命令需逐次批准，默认 2 分钟上限。项目脚本具有当前账户的本机与网络权限，不提供操作系统沙箱。未确认停止时保留副本并要求核对，不能宣称已经停止。
- 模型服务支持 Messages 与 OpenAI Chat Completions 两种协议。后者由本地主进程转换工具消息和响应，官方 Harness 内核保持不变。

## 已有证据

`service.integration.test.ts` 使用真实官方运行时、真实 SQLite、合成模型及 API 响应，贯通审批、API 代理、文件修改、验证、持久归档、追加输入、恢复、拒绝和停止；另覆盖中断写入、未确认检查进程及旧版 HTTP-only 回执不能验收。

`verify-live-workbench.cjs` 使用用户明确指定的模型端点与模型完成了文件修改、本机 Node 测试和任务验收。它只修改专用合成项目，不验证真实业务账号或网页登录。密钥通过单次本机通道传入，并以 Windows safeStorage 包装的 DEK 加密保存，不放入源码、命令参数或报告。

联调完成后自动再起独立进程，检查资料库、模型字段和已完成任务确实可重新读取。测试资料目录在 Electron ready 前同步设置；不能仅用同一进程内的解锁状态证明持久化成功。`verify-safe-storage.cjs` 另测 OS 安全存储的正常退出、重启及显式 profile 副本。

`verify-official-harness.mjs` 将运行时复制到独立中文路径，证明不依赖源码目录启动，恢复原会话并停止正在等待模型响应的任务。可把安装包展开目录中的 `resources/harness-runtime` 作为首个参数，复验实际分发运行时。完整结果见 `../../docs/WORKBENCH-VALIDATION.md`。

旧 `runtime.lock.json`、`validation.patch.yml`、`windows-m0-2026-10-25.json` 是已归档的 OnSet 探索记录。旧 `verify-harness.mjs` 在读取外部项目之前明确停止；不能将旧报告用于当前交付。
