# Harness 原生纠正开发记录

依据：`DEV-SPEC-HARNESS-NATIVE.md` v1.1。2026-10-26 开始执行；已补入扫描器误拦修订。

目标：官方 Harness 驱动会话、轮次、审批、追问；剪贴板保持一级功能，本地采集、存储、查找和粘贴不依赖模型。复用现有安全存储和工具，不另造 Agent 循环。

## 执行顺序

- [x] P0-1 官方接口验证 V1–V4（V1 使用允许的 worker 路径）
- [x] P0-2 事件分行存储与旧会话惰性迁移
- [x] P0-3 控制插件与安全桥接
- [x] P0-4 HostManager 生命周期、排队、恢复
- [x] P0-5 事件投影
- [x] P0-6 全资源统一脱敏
- [x] P0-7 Session IPC / preload
- [x] P0-8 最小会话界面及交互测试
- [x] P0-9 OCR 与合并检查修复
- [x] P0 质量门与阶段报告（91 文件 / 486 用例；详见 P0-VERIFICATION.md）
- [x] P1 资料工具、资源录入与 v1.1 误拦修复（94 文件 / 554 用例；详见 P1-VERIFICATION.md）
- [x] P2 新外壳与剪贴板改版（97 文件 / 571 用例；详见 P2-VERIFICATION.md）
- [x] P3 收件箱与 AI 管理（100 文件 / 583 用例；详见 P3-VERIFICATION.md）
- [x] P4 进阶能力（2026-10-27 收尾：107 文件 / 618 用例；详见 P4-VERIFICATION.md「P4 收尾」）
  - [x] P4-1 目标、待办、计划审批与 UI
  - [x] P4-2 子 Agent 与官方压缩/恢复验证
  - [x] P4-2 官方 workspace-changes：git-only subprocess seam，快照仅在会话私有目录，摘要脱敏加密
  - [x] P4-3 官方 PowerShell 与临时副本 ACL 验证
  - [x] P4-4 本机会话全文搜索
  - [x] P4-4 定时提醒：官方工具与时间规则；存储、计时、投递由主进程适配（非官方 Web ScheduleService）
  - [x] P4-5 旧任务 UI / IPC 只读
  - [x] P4-6 L2 按项目预分析：默认关闭、只读、限额、结论进收件箱

P4 当前回归：102 文件 / 601 用例通过；20 个桌面状态通过。详见 [P4-VERIFICATION.md](P4-VERIFICATION.md)。当前审查入口为 [HARNESS-NATIVE-DELIVERY.md](HARNESS-NATIVE-DELIVERY.md)，旧 3.4 任务版交接仅作历史资料。

## 边界与基线

- 工作区已有大量未提交修改；不提交、不重置、不清理、不覆盖既有工作。
- 不读取或修改真实用户资料库。测试只使用临时目录、合成资料和本地模型桩。
- 不使用 Docker、不升级依赖、不发布、不调用真实模型。
- 仓库基础严格审计：errors=0、warnings=0。P0 类型、Lint、全量测试、运行时与桌面验收通过；后续阶段单独记录。
- 官方 SDK 的启动实现使用 `process.execPath`，没有独立 Node 可执行文件参数；V1 必须验证并记录文档允许的 worker 中转路径。
