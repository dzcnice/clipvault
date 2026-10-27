# Claude 审查记录（针对 CLAUDE-REVIEW-HANDOFF.md）

日期：2026-10-26。基线 `9dd98023089024466d21008a7fe5d6e1c32c8705` + 未提交工作区。本次只审查、未改代码。

## 已复核

- `npm run typecheck`、`npm run lint`：通过，0 warning。
- `npm run test:native`：87 个文件、465 项通过，与交接文档一致。
- 未重跑：`build:workbench`、安装包内 Harness 复验、真实模型夹具、原生桌面验收。

## 中等问题

1. **脱敏范围不一致，未选资源的秘密可能进入模型请求**
   - `src/main/workbench/service.ts:78`（create）、`:89`（followUp）、`:177`（execute 的 `secrets()`）只使用本任务所选资源 + 模型资源；`tools.ts` 的 read_file / run_check 输出、`bridge.ts:60` 外发拦截也沿用该范围。
   - 对比：`service.ts:98`（附件）、`daily.ts`（模板、交接导出）使用全部资源。
   - 复现：资源库保存 A 的密码，剪贴板历史中有该密码；新建任务不选 A、但选入这条剪贴板记录 → 密码原样进入任务上下文并发给模型（仅 `sk-`/`AKIA`/JWT 等常见格式会被正则拦截）。

2. **本地 OCR 在默认执行策略下失败**
   - `src/main/workbench/attachments.ts:21` 使用 `powershell -File` 但未带 `-ExecutionPolicy Bypass`。
   - Windows 客户端默认 Restricted；本机 CurrentUser 为 RemoteSigned，因此验收未暴露。
   - 建议：加 `-ExecutionPolicy Bypass`（仅作用于该进程，不改系统设置）。

3. **活动会话追加为平方级开销，且同步占用主进程**
   - `integrations/harness/encrypted-persistence.mjs:47-50`：每个事件先 `read` 再 `append`，两次 HTTP 往返且传输完整会话。
   - `src/main/workbench/session-store.ts:29`、`:45`：每次追加整份会话约 3 次全量解密 + 1 次全量加密，并整行重写 `wb_settings`（上限 8 MB）。
   - 影响：长任务时 Electron 主线程卡顿、WAL 写入量大。建议改为按事件分行存储（如 `wb_session_events`），读游标用 count 查询。

## 低风险问题

4. `src/main/workbench/bridge.ts:60` 外发检查只做原文 `includes`，未检查 JSON 转义形式（含 `"` 或 `\` 的密码会漏检）；回复检查 `:110` 已包含转义形式。属于纵深防御缺口。
5. `src/main/ipc/workbench-handlers.ts:38` 合并备份的 `service.busy` 检查在文件选择与确认对话框之前，对话框期间仍可启动任务；建议在 `source.merge()` 前再检查一次。

## 审查确认无问题的点

- `vault.getDEK()` 返回副本，各处 `fill(0)` 不会清除活动 DEK。
- 合并备份：标签按名称、TOTP 以 credential_id 为主键、资源字段复合主键随新 ID 变化，重复导入与跨 DEK 重新加密路径正确；失败回滚并清理本次图片。
- `.cvimg`：GCM + 魔数 AAD，MIME 在认证内容中；`.cvimg` 扩展名强制校验头。
- `start()` 最后一个 await 之后的租约判断与登记是同步执行，无并发竞态；Windows 下 `within` 大小写不敏感。
- 审批绑定动作指纹、过期与按运行取消；登录窗口独立分区、同源限制、拒绝权限/下载/新窗口、隔离世界填写且不提交。
- 打包 appId/name/userData 独立，预览版禁用旧更新源；临时副本删除不会穿透 node_modules 联接（有测试覆盖）。

## 备注

- 交接文档中的"官方 DeepSeek Harness"仅指本地运行时；真实模型测试使用第三方中转 `https://caowo.fun/v1`（模型名 `gpt-6-astra`），任务上下文与模型密钥会经过该服务，需由用户自行评估信任。
