# P1 阶段报告

依据 `DEV-SPEC-HARNESS-NATIVE.md` v1.1。P1 已通过阶段质量门，P2–P4 不在本报告完成范围内。

- 完成编号：P1-0 至 P1-8。
- 新增/修改：`secret-scan.ts` 及 48 条参考夹具；`harness-host/{data-tools,utility,manager}.ts`；`resources/{intake,roles,secret-index,sequence}.ts`；`workbench-store.ts`；Session/Workbench IPC 与 preload；资源确认卡、会话引用与疑似秘密提示、资源字段历史/TOTP、剪贴板录入入口、HUD 资源动作菜单；`integrations/harness/{runtime,tools,attachments,memory-persistence}.mjs`。
- 迁移：追加 027 和 028。为保证迁移顺序，027 先加入分类及 AI 元数据空列，分类行为在 P2 实现。另加 `wb_session_clipboard_refs` 保存会话引用关系，供后续保留策略保护。028 增加字段角色、取用时间及 DEK 派生 HMAC 索引；旧数据不删改。
- 质量门：TypeScript 成功；ESLint 0 error / 0 warning；`node scripts/test-electron-node.cjs --maxWorkers=4` **94 文件、554 用例通过、0 失败、0 跳过**（29.06 秒）。
- 运行时构建：80 文件、54 包。`verify-official-harness.mjs` 兼容验证通过，报告 `C:\Users\ADMINI~1\AppData\Local\Temp\clipvault-official-harness-ISYut6\report.json`。仓库基础严格审计 0 error / 0 warning。
- Electron 构建通过，保留已有注释/混合 import/空 chunk 提示。桌面临时资料库检查通过 1280×820 和 960×640，新会话、项目、剪贴板无文档横向溢出或 renderer 错误。报告 `C:\Users\ADMINI~1\AppData\Local\Temp\clipvault-workbench-preview-desktop-sbP0iV\report.json`；视觉外壳仍属 P2 待改。

## 已验证行为

1. 官方工具：剪贴板搜索/读取、资源元数据查询、主进程代为使用、资源建议。建议确认绑定记录和版本，5 分钟过期；停止后取消未处理建议。新建建议只创建无秘密字段的说明资源。恢复会话后仍可看到建议。
2. `@` 引用只解析所选的剪贴板、资源元数据或项目内文件；拒绝私有路径和敏感剪贴板内容。资源值不进入 Host。
3. V5：`UtilityHost` 每次独立官方内存会话，零工具、零会话数据库行、Zod 结果校验。实例并发为 1，单次结束即关闭，不保留五分钟闲置进程。最小复现 `scripts/spikes/utility-host.cjs`。
4. 录入：本地解析 → 令牌骨架 → 可选 AI → 本地回填 → HMAC 去重 → 确认。请求中不含原始用户名、密码和 TOTP 种子；仅用户打开设置开关后可提供用户名。AI 返回原值、重复/未知令牌或异源登录地址时整体丢弃，回退本地结果。锁库使待处理草稿失效。
5. 取用：依次粘贴用户名、密码、即时 TOTP；空闲 60 秒结束。通过真实 `ClipboardMonitor` 配合假系统剪贴板验证，自写入没有触发历史采集。恢复仅限此前非秘密文本；若用户中途自行复制，新内容保留。取用写审计与时间，不记值。快捷键冲突会提示，支持在设置中调整。
6. 官方 `dsh-attachment` 服务读取主进程预先批准的加密文字快照，并在 `agent/pre-step` 校验大小与 SHA-256。跨进程按 64 KiB 分块，附件不写 Host 明文文件。集成测试证明服务实际执行校验，重启后仍可引用。图片沿用本地 OCR，不上传原始图片；二进制附件不在本次支持范围。
7. 界面组件测试覆盖：疑似秘密仅在明确继续后重发、字段默认遮罩、按住显示松开后丢弃迟到返回、别名可编辑。三个录入入口都使用同一个确认组件与主进程流水线。

## 偏离、风险与未验证范围

- 027 结构提前于 P2 安装，避免先安装 028 后遗漏 027；本地分类未提前宣称完成。
- P1-0 在读取到 v1.1 更新后优先补入，未删减参考样本。第一次新资料工具集成测试误用了工具名的测试前缀，已改为运行时实际注册名并通过全量回归。
- 未使用真实账户、真实用户资料库、外部模型或 Docker。没有验证真实第三方登录表单，也未向真实前台应用粘贴账号；这类目标应用兼容性不能由本机模拟测试替代。
- 整体 4.0 尚未完成：P2 新外壳/分类/HUD，P3 收件箱/AI 管理，P4 进阶能力与旧任务只读仍需后续验收。
