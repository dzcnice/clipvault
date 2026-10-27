# P2 阶段报告

完成范围：P2-1–P2-6；P3 收件箱规则、AI 找回/整理及 P4 插件能力另行验收。本文不宣称整个 4.0 产品已经完成。

## 产品与数据变化

- 中性深浅色、Plus Jakarta Sans 与 IBM Plex Mono；不再加载 Pixelify 字体。220px 可收起导航，会话按项目分组，“更多”保留项目、TOTP、片段、凭证、健康、旧任务与导入入口。
- 会话页支持改标题、右侧 260px 可收起上下文、附件与引用列表、完整文件修改前后行号展示；`/` 可选现有模板作为提示，`@` 引用剪贴板/资源/文件。剪贴板和资源入口只带入引用，用户点击发送后才进入模型请求。
- 9 类本地分类、项目目录/仓库名/package name 匹配、200 条一批的旧记录补算；原始内容密文不重写。027 已在 P1 按版本顺序安装，本阶段启用分类。
- 剪贴板分类计数、项目分组、紧凑列表和详情；敏感资料默认遮罩，按住显示；原有图片模式、发生记录、多选、置顶、长期保存、保留策略均保留。
- HUD 宽 520px，默认最近 20 条；Enter 和数字选择可触发粘贴，资源展开取用菜单，秘密复制按现有设置自动清除。搜索框非空时数字仍可用于输入；移出搜索框可按数字选择。
- 资源列表与 `/resources/:id` 详情分离，详情保留复制、TOTP、顺序粘贴、辅助登录、版本历史和撤销。新建通过统一录入流程。

主要文件：`src/main/clipboard/classify*`、`src/db/clipboard-store.ts`、`src/main/ipc/clipboard-handlers.ts`、`src/main/harness-host/manager.ts`、`src/main/workbench/tools.ts`、`src/renderer/src/{layouts,pages,components,hud,styles}`、对应 preload/types、`scripts/verify-desktop-workbench.cjs`。

## 实际验证

- `tsc --build`：退出 0。
- ESLint `--max-warnings=0`：退出 0，无错误/警告。
- Electron Node 全量测试：**97 个文件，571 个用例通过，失败 0、跳过 0**（22.11 秒）。
- 90 个分类夹具、每类 10 个，逐类准确率 >=90%；项目边界与耗时检查通过。
- 205 条加密旧数据补算测试证明 ciphertext/nonce 不变；新离线核心测试在不存在的 Harness 目录下验证历史、搜索、快照和片段仍可用。复制 IPC 另验证先复制、隐藏窗口、再粘贴的顺序。
- HUD 键盘回归发现并修复动作菜单焦点丢失；会话测试覆盖引用不自动发送、Tab 到保存标题、折叠侧栏。原有剪贴板图片模式、自动清除、损坏密文、监听、搜索、保留、快捷键套件全部保留并通过。
- 官方运行时构建：80 文件 / 54 包；独立进程合成模型验证通过，报告 `clipvault-official-harness-KEkxb5/report.json`（系统临时目录）。
- Electron 构建通过；原有 Rollup Zod 注释、静态/动态重复导入、空 vendor chunk 提示仍存在。
- 桌面临时资料库检查：新会话 1280×820 / 960×640、项目、剪贴板、资源、更多；深浅色共 12 个状态，均无文档横向溢出，无 preload/renderer 错误。已检查生成截图。初次报告 `clipvault-workbench-preview-desktop-WNbGGV/report.json`。
- 仓库基础严格审计：errors=0，warnings=0。

## 限制与后续

- 桌面截图使用空的临时资料库；填充数据、审批、追问、键盘交互由组件与主进程集成测试覆盖。没有在用户真实账号或其他应用输入框中试粘贴。
- 保留现有 Windows 前台粘贴实现；真实应用接收焦点仍受 Windows 窗口行为影响，未宣称跨平台粘贴支持。
- HUD 资源菜单为同窗口切换并保留返回键，不是两个常驻列表；宽度保持 520px。
- P2 的收件箱仅路由与空状态；角标、规则、Tab 问 AI、AI 找回和整理属于 P3。目标/待办属于 P4。旧任务运行能力将在 P4 只读迁移时关闭。
- 未读取真实资料库、未调用真实模型、未升级依赖、未使用 Docker、未发布。
