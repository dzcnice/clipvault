# 给 Claude 的开发交接与审查说明

> **2026-10-27 更新：本文件以下内容描述纠正前的任务版，作为历史保留。** 当前基于 Harness 的原生会话实现、功能、测试和未完成项请先读 [HARNESS-NATIVE-DELIVERY.md](HARNESS-NATIVE-DELIVERY.md) 与 [P4-VERIFICATION.md](P4-VERIFICATION.md)。旧任务已只读，以下“继续任务/运行任务”描述不代表当前生产入口。

更新：2026-10-26。当前版本：**ClipVault Workbench 3.4.0，Windows x64、本机运行、官方 DeepSeek Harness**。

请先审查实际代码与测试，再评价下面的完成结论。本文不包含真实账号、密码或模型密钥，也不授权读取用户的日常资料库。

## 1. 用户目标与本次范围

用户希望把原来的剪贴板升级为 AI 编程主工作台：找回复制过的内容，保存一段账号/密码/Key 及用途，下次快速取用，并把项目、剪贴板资料、资源和可继续的编程任务串起来。

已经明确的边界：

- 底座必须来自 **DeepSeek 官方 Harness**。OnSet 只是成功案例，不是代码、SDK、运行时或用户数据来源。本次没有改动 OnSet。
- **不用 Docker**。本机执行测试需要逐次确认；不宣称操作系统沙箱。
- 保留现有剪贴板、凭证、TOTP、片段和全部既有工作区修改。新工作台使用独立应用身份与资料目录；旧资料通过用户选择的备份合并副本。
- 用户要求继续补齐功能和安全问题，并把实现内容整理给 Claude 审查。没有授权生产发布、提交、推送、替换旧安装版或读取未批准的账号资料。

仓库根为 `E:\粘贴板\粘贴板\ClipVault`。Git 基线 `9dd98023089024466d21008a7fe5d6e1c32c8705`，当前改动尚未提交。相对 HEAD 的 diff 同时包含前面多轮开发和这次收尾，不能把它全部当成本轮新写内容，也不要 reset、clean 或回退别人已有的改动。

## 2. 用户现在能做什么

| 工作流 | 已实现行为 |
|---|---|
| 剪贴板 | 文本、HTML、图片历史；关键词和来源筛选；重复复制的发生时间；置顶、长期保存独立副本、保留策略；复制图片/路径；选入任务 |
| 账号与密钥 | 本机解析一段资料，人工检查后保存；项目/环境/用途/端点与多字段资源；秘密字段遮罩、单字段复制、版本、撤销；旧凭证导入副本 |
| 登录辅助 | 独立临时 Electron 窗口，只允许保存的 HTTPS origin；确认域名后填写唯一可见账号/密码框；不提交表单，MFA 人工完成，关窗清理会话 |
| 编程任务 | 项目目录、目标、验收标准、固定上下文快照；官方 Harness 执行；连接模型、文件写入、认证 API 检查、本机测试分别确认；差异、输出、退出码与验收 |
| 继续任务 | 原任务追加要求与资料，版本检查防止覆盖；加密保存官方 Session，停止或重启后续接；中断写入和不确定测试进程先核对 |
| 文件与图片上下文 | 显式选择文字文件；Windows 本机 OCR 提取图片文字；预览、脱敏和快照；不自动读取剪贴板里的外部文件路径 |
| 常用工作流程 | 3 个内置模板、自定义模板保存/删除；任务上下文脱敏复制给 Claude/Codex；两个独立目录可并行，相同或父子目录排队 |
| 数据衔接 | 完整加密备份、独立备份密码、恢复前核验与回退；旧备份合并只追加、去重、重新加密，保留原库与当前库 |
| 图片与会话保护 | 新图片 AES-GCM 文件；旧图片先备份再核对转换；活动会话事件直接写加密数据库；损坏剪贴板密文拒绝复制，不当作空记录 |

## 3. 官方 Harness 的接入方式

上游：`https://github.com/deepseek-ai/deepseek-harness`；版本 `0.2.1-rc.2`，提交 `687f282e8625c6b8d11ff58211a90524be2e4317`。没有自行实现一个“同名模型循环”来替代官方 Harness。

调用关系：

```text
React 页面
  → preload.workbenchAPI（固定方法）
  → 受信任 renderer + 已解锁校验的主进程 IPC
  → WorkbenchService（任务/目录/队列/审批/凭据/回执）
  → 本机随机端口 + 随机能力令牌
  → 独立 Node 的官方 Harness worker / SDK / agent loop
  → 模型请求和 6 个受控工作台工具回到主进程执行
```

工具只暴露 `workbench_list_files`、`workbench_read_file`、`workbench_write_file`、`workbench_check_api`、`workbench_verify_file`、`workbench_run_check`。官方任意终端没有直接交给模型。

模型认证由主进程取加密字段并向批准的服务发送；worker 环境不继承 API Key、代理和 NODE_OPTIONS。业务资源凭据只由主进程在指定请求中使用，模型取得资源 ID/字段名与脱敏结果。模型输出和项目文件都是待核验数据，不授予新的操作权限。

`encrypted-persistence.mjs` 实现上游 `SessionPersistence` 契约，并保留上游事件格式/校验。每个事件追加通过能力通道交给主进程，以当前 DEK 写入 SQLite。会话 ID 与该次 run 固定绑定，游标冲突和跨会话请求被拒绝。生产路径始终使用这套持久化；不带 `CV_SESSION_ID` 的独立上游夹具仍可用官方 JSONL，以便验证上游兼容性，不能把该夹具模式当成产品的存储行为。

## 4. 这轮主要改动与文件索引

以下路径相对仓库根；历史首版的完整功能还涉及已有的 store、IPC、页面、迁移等文件。

| 模块 | 重点文件 | 审查内容 |
|---|---|---|
| 官方运行时 | `integrations/harness/{worker,runtime,encrypted-persistence}.mjs` | 官方模块接线、工具白名单、事件顺序与退出 |
| 活动会话 | `src/main/workbench/{session-store,sessions,bridge,service}.ts` | 逐次加密保存、旧 v4 归档兼容、能力绑定、续接不重复写 |
| 图片 | `src/main/storage/{image-codec,image-store,protect-images}.ts` | GCM 认证、锁库、旧格式、临时导出清理、失败保留 |
| 备份 | `src/main/{backup,backup-assets,backup-merge}.ts` | WAL 一致性、源库只读、不同 DEK、事务回滚、图片哈希、重复导入 |
| OCR/附件 | `src/main/workbench/attachments.ts`、`resources/ocr-windows.ps1` | WinRT OCR、大小/类型/私有路径/链接限制、超时、脱敏 |
| 登录辅助 | `src/main/workbench/login.ts` | origin、权限、重定向、下载/新窗口、表单唯一性、无自动提交 |
| 模板与导出 | `src/main/workbench/daily.ts` | 模板加密、内置项不可删除、导出重新脱敏与长度限制 |
| IPC/UI | `src/main/ipc/workbench-handlers.ts`、`src/preload/workbench-api.ts`、`TaskAttachments.tsx`、`TaskTemplates.tsx`、`DailyDataPanel.tsx` | 能力边界、错误/取消、预览、删除确认与返回状态 |
| 目录与执行 | `src/main/workbench/{service,files,local-check,tools}.ts` | 并行目录租约、审批绑定、文件哈希、进程结束核对、本机权限边界 |
| 剪贴板损坏保护 | `src/db/clipboard-store.ts`、`src/main/ipc/clipboard-handlers.ts` | GCM 失败或 nonce 丢失时标记损坏，原密文保留，拒绝复制/送任务 |
| 依赖与打包 | `package*.json`、`.npmrc`、`electron-builder*.yml`、`scripts/{build-harness,harness-node,afterPack}.js/mjs` | 版本固定、官方 Node 校验、独立身份、原生文件完整收录 |
| 验收夹具 | `scripts/verify-{official-harness,desktop-workbench,live-workbench}.mjs/cjs`、`scripts/fixtures/` | 合成项目、真实模型、独立进程恢复、原生窗口 |

具体扩展名以目录内真实文件为准，表格中的组合写法只用于索引。

## 5. 原有数据如何保护

**应用边界。** 默认包名为 `clipvault-workbench-preview`，产品名保留 `ClipVault Workbench Preview`，appId 为 `com.clipvault.workbench.preview`。资料固定在 `%APPDATA%/clipvault-workbench-preview`。根打包配置和专用配置都使用独立身份，常规 Windows 构建也转到独立工作台入口；更新器不使用旧版 ClipVault 的更新源。

**旧库合并。** 源文件只读、事务快照、结构与密码预检。目标先完整备份，再在事务内生成新 ID、用目标 DEK 重新加密。保留剪贴板发生记录、TOTP、标签分类、资源字段版本和项目关联。索引按来源 DEK 标识及记录/关联内容去重；源数据更新时新增副本。失败回滚数据库，并仅清理本次创建的图片。旧任务、会话、模型配置和系统偏好不合并，避免覆盖当前工作状态。只接受备份内嵌图片或旧内联图片，不跟随源库任意外部路径。

**图片格式。** `.cvimg` 包含版本头、随机 nonce、AES-256-GCM 密文和认证标签；MIME 也在认证内容中。新图片不再以普通 PNG/JPEG 存储。旧图转换在备份后逐张核对，只有默认图片目录内本应用 UUID 命名且非链接的旧文件才会清理。外部/自定义目录副本保留；失败记录继续存在。路径复制会产生 10 分钟临时明文导出，这是粘贴兼容性所需，不能承诺复制后整个磁盘绝无明文。

**会话。** 活动事件直接加密入库；旧 v4 JSONL 归档可在内存中转换，原归档保留。修复了结束封存覆盖活动加密归档的问题。异常退出恢复会先识别未完成动作，不因模型说“成功”就重复执行或直接验收。

**回退。** 旧安装版和 3.3.0 独立产物保留。不要把 3.4.0 生成的新图片、活动会话或整库直接交给旧版本：旧版本不理解新格式。回退应使用升级前完整备份及其匹配的密钥保护状态，在独立目录恢复；不要只替换一个正在使用的 `.db`，也不要只复制 WAL 主文件。重要长期资料应另存独立密码备份，不能依赖自动备份的 7 天保留窗口。

开发验收没有对原日常安装版资料库执行迁移或合并。真实模型测试从已批准的工作台预览资料中取只读一致性副本，在临时目录执行；源资料不变。

最终程序已启动，日志确认使用独立目录并通过 safeStorage 解锁。启动前在 `out/before-daily-profile-20261026` 保存了一致性数据库、Local State、偏好及已有图片备份；启动后资料库 integrity_check 为 ok，记录数量保持一致。为保护原使用状态，未退出旧日常版，因此当前若干全局快捷键被占用；切换主用时应从旧版托盘退出或调整快捷键。新工作台剪贴板监听仍暂停，用户在剪贴板页开启后才开始捕获。

## 6. 依赖与构建安全收尾

| 项目 | 当前固定版本 |
|---|---|
| Electron / builder / electron-vite | 43.8.3 / 26.18.0 / 5.0.0 |
| Vite / Vitest | 7.3.7 / 4.1.12 |
| SQLite / sharp | better-sqlite3 13.0.3 / sharp 0.35.5 |
| Harness / 独立 Node | 0.2.1-rc.2 / 22.23.4 |
| Zod | 4.6.6 override |
| React | 保持 18，不借机迁移 React 19 |

本机系统 Node 保持原来的 22.22.1；Electron 内嵌 Node 与 Harness 独立 Node 是不同运行时。Node 下载地址和 SHA-256 在 `integrations/harness/node.lock.json`，目前只锁定 Windows x64；许可证同步更新。

`.npmrc` 设置 `legacy-peer-deps=true`，原因是当前上游预发布包的 peer 图让本机 npm 求解报 `edgesOut` 错误。已显式声明所需官方 Harness peer 包和 Testing Library DOM，不依赖安装时偶然出现的隐式 peer。`undici` 按 7/8 主版本分别 override；强行统一为 8 会破坏 jsdom 的内部导入。`eslint-plugin-react-hooks` 固定 7.0.1，避免为安全升级顺带启用不匹配当前 React 18 代码的编译器规则。

最终 npm audit 为 **0**，覆盖开发与生产依赖；原 107 项报告只保留作历史。审计没有覆盖所有原生组件、手写代码或未来漏洞，不等于全面安全认证。

构建使用空的临时目录生成 runtime，再替换生成目录，防止旧 chunk 混入。发现并修复 electron-builder 26 忽略 extraResources 下嵌套 node_modules 的问题：`afterPack.js` 按 manifest 复制并逐项验哈希，出现缺失、损坏或额外文件即失败。不能只看 `npm run build` 通过；必须运行安装包里的 Harness 复验。

## 7. 已做的验证

- TypeScript 和 ESLint 通过，Lint 0 warning。
- 最终 Electron 原生测试 **87 个文件、465 项通过、0 跳过**。
- 新增/加强测试覆盖：图片认证失败/错钥/原始字节、旧图转换失败保护、备份不同 DEK 合并与 TOTP/图片/发生记录、重复导入、活动会话加密/游标/跨会话/旧归档、附件私有路径/硬链接/目录链接/二进制/脱敏、登录填写与不提交、模板加密与导出脱敏、并行目录隔离、损坏剪贴板拒绝复制。
- 用户批准的模型端点 `https://caowo.fun/v1`、准确模型名 `gpt-6-astra`：真实完成合成项目修改、两项 Node 测试、验收；第二个 Electron 进程恢复同一 Session 并取得续答。密钥没有写入文档或脚本。
- 官方运行时：独立中文路径启动、续接、停止和恰好 6 个工具；安装包内 runtime 单独复验。
- 原生桌面：1280×820、960×640 窗口；工作台、项目、剪贴板正常，无横向溢出，正常退出。组件测试覆盖键盘顺序、加载、空数据、错误重试等，不冒充人工全流程无障碍验收。
- Windows 本机 OCR 对合成图片识别出 `ClipVault local OCR 2026`。
- 打包白名单检查：不带源码、测试夹具、旧 dist 或验收目录；runtime 74 个清单文件及 manifest，另有原生模块、许可证和文件校验。

证据索引见 [WORKBENCH-DAILY-VALIDATION.md](WORKBENCH-DAILY-VALIDATION.md) 和 `integrations/harness/evidence/daily-*`。原始日志在 gitignored 的 `out/daily-*`。测试日志中的预期异常分支和已有 React act 警告没有被当作测试失败，也没有隐藏成“完全无日志”。

## 8. 仍然存在的产品范围与验证空白

1. 本机检查不是沙箱。用户批准的项目脚本可以用当前账户权限访问其他文件或网络；环境清理和文本副本不能阻止恶意项目。
2. OCR 是图片文字提取，尚无原始图片多模态理解；大文件/二进制不自动送模型。
3. 登录助手只支持受限同域表单填写；跨域 SSO、复杂前端、验证码、MFA 不保证自动处理。没有替用户登录真实业务网站做验收。
4. 两个独立任务并行已实现，但单任务多 Agent 分解/协作、跨设备同步、自动部署和任意终端不在当前交付中。
5. Windows 安装包未签名，未生产发布；安装器实际安装/卸载/覆盖升级和 macOS/Linux 未验收。
6. 脱敏识别已知资源值与常见格式，不能识别所有未知编码和秘密。SQLite 的部分元数据仍明文可见；同账户恶意进程、已解锁内存、用户主动复制的秘密不属于静态加密能完全防住的范围。
7. 旧日常数据仍需由用户选择备份执行合并，未以验收名义自动迁移。缺失的原图不能从只含路径的旧备份凭空恢复。

## 9. 建议 Claude 优先审查

请优先查可复现的越界、泄密、数据丢失和错误验收，给出文件/函数、触发条件、最小复现与影响，区分真实漏洞和威胁模型外的假设。

1. `backup-merge.ts` 对不可信备份的结构、大小、加密校验、事务、去重和关联 ID；重点看错误密码、篡改图片、改变的源记录、重复导入与备份失败。
2. `image-codec.ts` / `protect-images.ts` 的认证、旧文件兼容、路径清理范围及中途退出；不要对真实图片做破坏性测试。
3. `encrypted-persistence.mjs` / `session-store.ts` 的官方契约兼容、追加落盘、关闭与重启顺序，能力通道是否能跨 Session。
4. 并行任务在真实路径别名、父子目录、排队后路径变化和进程未确认结束时，是否仍保持互斥与原审批范围。
5. 附件、任务文本、差异、模型响应、模板和导出是否存在未脱敏路径；业务密钥是否可能进入模型 payload 或本机检查环境。
6. 登录窗口主/子帧、重定向、页面更新和资源版本撤销后的行为；确认其不是通用浏览器自动化，也没有把页面文字当授权。
7. 最终打包文件、appId/name/userData/updater 是否都保持独立；运行时 manifest 不等于数字签名，不应扩大完整性校验的安全声明。

## 10. 安全复现入口

在仓库目录执行；不需要启动 Docker，不要传真实密钥到命令行，不要运行生产发布脚本。

```powershell
npm ci
npm run typecheck
npm run lint
npm run test:native
npm run build:workbench
node scripts/verify-desktop-workbench.cjs
node scripts/verify-official-harness.mjs dist/workbench-daily-20261026/win-unpacked/resources/harness-runtime
```

第一次构建会按锁文件下载官方 Node。若不想打开正式预览资料目录，可在构建后使用 `node scripts/open-workbench-preview.cjs`，它创建独立临时资料库。不要为了跑测试重置用户资料或覆盖现有代码。

真实模型夹具 `verify-live-workbench.cjs` 支持私有标准输入或明确指定的独立工作台资料库只读副本；它会产生真实模型费用。本文不是让审查者自动再次访问该模型或读取资料库的授权，应沿用用户已批准范围或单独征得同意。
