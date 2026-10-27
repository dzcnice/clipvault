# AI 编程工作台首版验收记录

> 历史记录：本文描述 3.3.0 首次交付。3.4.0 已补齐其列出的图片/活动会话加密、OCR、文件上下文、资料合并、任务模板、同域登录辅助与依赖审计问题。当前结论请读 [WORKBENCH-DAILY-VALIDATION.md](WORKBENCH-DAILY-VALIDATION.md)，不要将下方旧版本限制当作现状。

日期：2026-10-26。仓库基线 `9dd98023089024466d21008a7fe5d6e1c32c8705`；本次保留全部既有工作区修改，未提交、推送或生产发布。

## 交付口径

剪贴板 → 本地资料整理 → 项目与资源关联 → 官方 Harness 任务 → 逐次批准修改和本机检查 → 证据验收 → 原会话继续，这条核心链路已经实现。提供独立 Windows 桌面程序与安装包；不依赖 Docker，也不依赖 OnSet 源码、SDK、数据或本机运行进程。

完整产品构想中的 OCR、图片任务上下文、自动浏览器登录、多 Agent、跨设备同步和外部 AI 工具深度接入尚未实现。图片日常文件加密及发布安全收尾仍有边界，详见下表；不能把核心首版通过解读为全部长期设想、所有平台或正式发布认证均已完成。

## 自动与实际运行验证

| 验证 | 结果与范围 |
|---|---|
| 仓库基础审计 | strict 模式 errors=0、warnings=0；运行时、脚本及打包配置修改前后执行 |
| TypeScript | `npm run typecheck` 通过 |
| ESLint | `npm run lint` 通过，0 warning |
| 全量测试 | `npm run test:native`：80 个文件、447 项通过、0 跳过；使用 Electron 对应 SQLite ABI |
| 生产构建 | `npm run build` 通过；官方运行时 74 个文件、50 个打包依赖，带独立 Node、原生依赖、许可证及 SHA-256 清单 |
| 官方运行时 | 官方提交 `687f282e8625c6b8d11ff58211a90524be2e4317`，SDK/runtime `0.2.1-rc.2`，Node `22.22.1`；独立中文路径启动、恢复同一 Session、停止均通过 |
| 真实模型 | 用户批准的 `https://caowo.fun/v1`，模型 `gpt-6-astra`，OpenAI Chat Completions 适配；使用官方 Harness，不是用模拟结果替代模型 |
| 真实任务 | 专用合成项目中将 settings.json 的 enabled 改为 true，保持 source；逐次批准模型连接、文件写入、本机检查，最后验收 completed |
| 真实测试执行 | `node --test settings.test.cjs`：2 项通过，退出码 0；测试前后源目录清单哈希一致，临时产物未回写 |
| 系统安全存储重启 | 真实模型任务结束后另起 Electron 进程，重新解锁资料库、读取模型字段及已完成任务成功；加密库与安全存储状态复制到独立交付目录后再次解锁成功 |
| 数据恢复 | WAL 中资源与会话进入备份；原图文件删除后可从备份重建；错误密码与损坏文件不会替换活动库；恢复保留回退副本 |
| 异常路径 | 拒绝与过期审批、撤销资源、上下文版本冲突、停止、超时、越界路径、模型回显秘密、中断写入核对及未确认检查进程均有测试 |
| 桌面窗口 | 直接启动本次编译的 Electron 应用，Workbench 1280×820、Workbench/Projects/Clipboard 960×640 实际尺寸和页面渲染通过，无文档横向溢出；正常退出码 0 |
| 交互状态 | 组件测试覆盖加载、空数据、失败重试、字段复制失败、资料保存带入任务、追加上下文、环境不匹配提示和 Tab 焦点顺序；不等同于人工逐屏验收 |

桌面实测发现并修复了两个旧入口问题：Windows 透明窗口导致实际尺寸固定；窗口 closed 回调读取已经销毁的 webContents 导致错误弹窗、进程未退出。现改用 Windows 可缩放窗口，并在创建时保存 webContents ID 供关闭时清理。透明窗口限制见 [Electron 官方说明](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations)。

真实联调夹具还修复了初始化顺序：必须在第一次异步等待、Electron ready 之前设置独立资料目录，否则 safeStorage 可能在此前目录初始化，造成库与系统安全存储状态不匹配。交付使用修复后的真实任务及独立进程复验结果。应用退出采用完成任务与数据库清理后的正常退出流程。

安装包改为只收录 main/preload/renderer、产品资源及生产依赖；检查确认不包含历史 dist、测试夹具、脚本、源码、集成证据或环境示例。最终文件哈希和大小见 `integrations/harness/evidence/packaged-delivery-2026-10-26.json`。

构建仍有已有的动态/静态重复导入提示、Browserslist 数据过旧提示和两个空 vendor chunk；它们未使构建失败，也未据此擅自升级依赖。

## 数据与密钥保护

- 没有打开、迁移或改写日常安装版的用户数据库，没有改动 OnSet。
- 独立安装身份为 `com.clipvault.workbench.preview`，用户目录为 `%APPDATA%/clipvault-workbench-preview`。旧 ClipVault 更新源被禁止用于此构建；自启动条目名称也单独区分。
- 专用真实联调资料迁入独立预览目录时，同时保留了其系统安全存储状态；没有只复制密文数据库后宣称可以解锁。普通用户跨目录/异机恢复应使用独立密码导出。不会读取日常旧库的安全存储文件。
- 模型密钥只发往用户批准的模型端点，并在独立资料库中通过 DEK 加密，DEK 由 Windows safeStorage 保护；源码、报告和示例项目不包含真实密钥。
- 模型密钥与项目 API 字段由主进程使用，不传入 Harness worker 或本机测试进程环境。测试中的合成秘密未出现在模型消息、普通回执、差异或归档明文内容中；这不构成对任意未知编码的绝对防泄露保证。
- 历史迁移采用增量 schema；旧库迁移前保存一致性数据库与图片附件快照。真实旧用户库的迁移尚未替用户执行。

## 必须保留的限制

| 范围 | 当前事实 |
|---|---|
| 本机执行 | 用户明确取消 Docker。项目脚本拥有当前账户权限，仍可访问其他文件与网络；文本副本、环境清理和输出脱敏不是 OS 隔离 |
| 命令范围 | 支持 Node 测试和白名单 npm 检查脚本；不安装依赖，不提供通用 shell，不支持长时间服务运行、原生构建的任意资产拷贝或密钥环境注入 |
| 真实业务验收 | 已验证真实模型与合成项目；业务 API 使用合成端点验证。没有替用户登录真实网站或验证未提供的业务账号 |
| 附件 | 备份包含仍存在的原图；本机原图文件仍为普通文件，未完成图片存储层的全量加密迁移。图片/外部文件暂不能作为 AI 上下文；路径记录不备份外部文件 |
| 会话 | 活动期间会话工作目录为本机普通文件，结束后加密归档；异常遗留在下次启动尝试封存 |
| 界面 | 原生截图及组件交互通过；未做浏览器/Playwright 自动化、全流程人工键盘验收、多屏/DPI/辅助技术完整矩阵 |
| 依赖审计 | 当前 `npm audit --json`：107 项（critical 1、high 30、moderate 74、low 2）。Zod 4.6.6 未再被报告；critical 涉及构建依赖链 tar。计数含传递依赖，并非 107 个不同可利用场景；尚未完成逐项消除与可达性评估 |
| 发布 | Windows x64 本地构建；没有代码签名、生产发布、自动安装或覆盖旧版本。macOS/Linux 未在真实设备验收；不能宣称正式发布安全审计已通过 |

当前 npm 审计完整输出位于本机 `out/dependency-audit.json`。除已获准的 Zod 4.6.6，本轮没有升级 Electron、系统 Node 或其他依赖。

## 可复现入口与证据

```powershell
npm run typecheck
npm run lint
npm run test:native
npm run build
node scripts/verify-desktop-workbench.cjs
node scripts/verify-safe-storage.cjs
node scripts/verify-official-harness.mjs dist/workbench-20261026/win-unpacked/resources/harness-runtime
```

真实模型验收报告、桌面验收报告和最终打包清单保存在 `integrations/harness/evidence/`。真实模型脚本只接受私有标准输入转单次本机通道，不能把密钥写入命令行参数、测试源码或报告。

最终程序：`dist/workbench-20261026/win-unpacked/ClipVault Workbench Preview.exe`。安装包：`dist/workbench-20261026/clipvault-workbench-preview-3.3.0-setup.exe`。安装器实际安装、卸载与覆盖升级没有替用户执行；解包后的桌面启动和随包运行时另有验证。
