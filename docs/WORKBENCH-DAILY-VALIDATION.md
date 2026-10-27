# 3.4.0 日常工作台验收

日期：2026-10-26。当前仓库保留既有未提交改动，没有提交、推送、生产发布或替换旧安装版。实现与审查入口见 [CLAUDE-REVIEW-HANDOFF.md](CLAUDE-REVIEW-HANDOFF.md)，日常操作见 [WORKBENCH-GUIDE.md](WORKBENCH-GUIDE.md)。

## 交付范围

官方 Harness 的编程任务闭环保留，补齐图片与活动会话加密、旧资料非覆盖合并、本机 OCR/文字附件、模板与任务上下文导出、同域登录辅助、独立项目并行和依赖安全更新。OnSet 未改动；不使用 Docker。

程序：`dist/workbench-daily-20261026/win-unpacked/ClipVault Workbench Preview.exe`。

安装包：`dist/workbench-daily-20261026/clipvault-workbench-preview-3.4.0-setup.exe`。使用独立 appId `com.clipvault.workbench.preview`、包名 `clipvault-workbench-preview`，资料目录 `%APPDATA%/clipvault-workbench-preview`。保留 Preview 名称以兼容前一版独立资料目录。

## 实际结果

| 验证 | 结果 | 证据 |
|---|---|---|
| 仓库基础 | strict errors=0、warnings=0 | 依赖、运行时、构建和打包配置修改前后执行 |
| TypeScript / ESLint | 通过，Lint 0 warning | `out/daily-final-typecheck.log`、`out/daily-final-lint.log` |
| 原生全量测试 | 87 文件、465 项通过、0 跳过 | `out/daily-final-native.log`，Electron 43.8.3 的 Node 24.22.0 / SQLite 3.53.4 |
| 依赖审计 | critical/high/moderate/low 均为 0 | `out/daily-final-audit.json`，含开发依赖 |
| 构建与安装包 | Windows x64 构建及 NSIS 生成 | `out/daily-final-build-package.log` |
| Harness 构成 | 官方 0.2.1-rc.2、提交 687f282e…、随包 Node 22.23.4 | 74 个文件哈希、50 个打包依赖、许可证；系统 Node 未改 |
| 官方 Harness 执行 | 独立中文目录启动、同会话续接、停止通过；6 个工具 | `daily-packaged-runtime-2026-10-26.json` |
| 真实模型链路 | settings.json 的 enabled 改为 true、source 保留；逐次批准连接/写文件/本机检查 | `daily-live-model-2026-10-26.json` |
| 真实本机测试 | `node --test settings.test.cjs` 两项通过、退出码 0，源文件清单哈希一致 | 同上 |
| 跨进程续接 | 另起 Electron 进程，自动解锁副本，恢复同一 Session，并收到 RESTART_OK | `daily-session-restart-2026-10-26.json` |
| 会话静态保护 | 真实执行后无活动 JSONL 文件，模型密钥不在数据库主文件明文中 | 同上及会话集成测试；不代表扫描了任意内存/崩溃转储 |
| 数据保护 | 不同 DEK 合并、TOTP、图片重新加密、复制发生记录、重复导入、错误密码、源备份字节不变 | `backup-merge.integration.test.ts` 与备份恢复套件 |
| 图片 | GCM 错钥/篡改、原图字节、缩略图、临时导出、旧图备份前失败与外部原图保留 | image-codec / image-store / protect-images 测试 |
| OCR | 实际 Windows WinRT 识别出 ClipVault local OCR 2026 | `daily-ocr-2026-10-26.json` |
| 桌面 | 工作台 1280×820、960×640；项目/剪贴板 960×640；无文档横向溢出，正常退出 | `daily-desktop-2026-10-26.json` 与截图 |
| 交互 | 加载/空数据/错误重试、字段复制失败、资料保存带入任务、补充与版本冲突、键盘顺序 | 组件测试；不是全流程人工验收 |
| 产物 | 独立身份、打包白名单、随包运行时完整性与 SHA-256 | `daily-packaged-delivery-2026-10-26.json` |
| 最终程序启动 | 独立目录、safeStorage 自动解锁、窗口存在且进程响应；SQLite 完整性与记录数量保持 | 同上；原始启动日志 `out/daily-startup.stdout.log` |

上表 JSON 证据位于 `integrations/harness/evidence/`，`out/` 为本机原始日志。旧的无 `daily-` 前缀证据属于先前 3.3.0 验收，旧报告中的 107 项审计结果不代表当前状态。

测试日志包含预期异常路径，以及已有 React `act` 环境警告。构建仍有动态/静态混合导入、Browserslist 与空 vendor chunk 的提示；打包器有重复依赖引用提示。它们没有造成验证失败，未被包装为“无任何告警”。

## 验收发现并修复的问题

1. 新测试工具链未自动应用 JSX runtime、旧 IPC mock 缺少图片导出清理：补齐显式配置与 mock，恢复全量测试。
2. Windows 短路径/真实路径不同导致任务目录租约误判：改用真实目录租约，并保持父子目录互斥。
3. 会话封存把活动加密归档覆盖为空：改为合并保留已有归档，真实跨进程续接验证通过。
4. 资料合并漏带复制发生记录，且逐条扫描关联表：补齐发生记录与去重指纹，缓存表及关联索引。
5. electron-builder 26 缺少原生 Harness 依赖：打包后按 manifest 复制并校验，安装包内运行时另行复验。
6. 仅覆盖 productName 的命令行配置不足以保护 Electron 的资料身份：将包名、产品名、appId 固定在项目与专用配置，常规 Windows 构建也使用独立入口。
7. 损坏密文或 nonce 缺失可能被当作空剪贴板内容：显式报错标记，拒绝复制与加入任务，保留原始记录。

## 保留的限制

- 本机项目测试具有当前账户权限，能访问其他文件与网络；文本副本、环境清理、输出脱敏不构成操作系统沙箱。
- OCR 只提取图片文字；原始图片多模态、跨设备同步、任意终端、自动部署、单任务多 Agent 编排未实现。
- 登录助手只做同域受控填写，不自动提交，跨域 SSO/复杂网页/MFA 由用户处理；没有实际登录真实业务账号验收。
- 图片路径复制会有 10 分钟临时明文导出；旧图转换前和外部原图仍保留原格式；已解锁内存、系统剪贴板与同账户恶意进程不由静态加密完全防护。
- 仅 Windows x64 验收；未做安装器安装/卸载/覆盖升级、多屏/DPI/辅助技术完整矩阵，未执行浏览器或 Playwright 工具。
- 安装包未数字签名、未发布；npm audit 0 不等于产品安全审计认证。
- 原日常资料未自动迁移；合并入口已通过合成数据验证，实际旧库由用户选择备份后操作。
- 旧日常版仍运行，当前若干默认快捷键被占用；用户切换主用后退出旧版或配置不同快捷键。新版本监听保持暂停，需在剪贴板页开启。

## 复现

```powershell
npm run typecheck
npm run lint
npm run test:native
npm audit --json
npm run build:workbench
node scripts/verify-desktop-workbench.cjs
node scripts/verify-official-harness.mjs dist/workbench-daily-20261026/win-unpacked/resources/harness-runtime
```

真实模型测试需已批准的服务和专用测试项目；不要把真实密钥作为命令参数、写入夹具或贴入报告。完整源文件、审查优先级、回退方法见 Claude 交接文档。
