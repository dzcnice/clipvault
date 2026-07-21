# ClipVault 3.1.0

**本地优先的个人凭证与剪贴板工作台** —— 数据加密存本机，打开即用。

---

## 下载

| 平台 | 文件 |
|------|------|
| **Windows x64** | [`clipvault-3.1.0-setup.exe`](https://github.com/dzcnice/clipvault/releases/download/v3.1.0/clipvault-3.1.0-setup.exe) |

安装后从开始菜单或桌面快捷方式启动 **ClipVault**。

> **安全提示**：当前 Windows 安装包**尚未代码签名**。首次运行可能被 SmartScreen 提示「未知发布者」，可选择「仍要运行」。正式签名需 OV/EV 证书（见仓库 `docs/release/signing-setup.md`）。

---

## 这是什么

ClipVault 是一款 **单机个人版** 桌面应用（Electron）：

- **剪贴板历史**：文本 / 图片 / HTML 自动记录、搜索、置顶；截图支持「图+路径 / 仅路径 / 仅图片」写回
- **凭证保险库**：API Key、账号密码、Token 等加密保存；密钥模式检测一键入库
- **片段库**：常用文本与模板
- **安全能力**：OS `safeStorage` 自动开库（无日常主密码门槛）、可选恢复短语 / 生物识别确认、剪贴板自动清空、审计日志、健康检查、TOTP
- **导入导出**：1Password / Bitwarden / KeePass / Chrome / LastPass 等

**不是**：团队协作、P2P 同步、云端账号、Vera AI、本地 HTTP/CLI/SSH Agent（v3 已收敛为个人本地）。

---

## 3.1.0 亮点

### 无密码日常体验
- 启动时 `vault.ensureOpen` + 系统 `safeStorage`（Windows DPAPI 等）自动打开保险库
- 旧版「主密码库」可一次性迁移，之后免登录
- Onboarding 缩为 3 步：**欢迎 → 快捷键 → 可选导入**

### 个人版界面与导航
- 侧栏：剪贴板 / 凭证 / 片段 / 概览 / 健康 / 设置
- HUD / 命令面板对齐个人场景（无团队入口）
- 生物识别改为敏感操作确认，不再默认索要主密码

### 工程与质量
- 凭证 / 剪贴板 IPC 强制 `workspace=personal`
- E2E 对齐 v3.1 流程；`npm run preflight` 发版门禁
- 单元 + 集成测试通过；Windows 安装包已构建

---

## 系统要求

- **Windows 10 / 11**（x64）
- 无需账号、无需联网即可使用核心功能（健康检查 HIBP 等可选联网能力除外）

---

## 校验（可选）

发布附带：

- `latest.yml` —— electron-updater 元数据
- `clipvault-3.1.0-setup.exe.blockmap` —— 差量更新块图

安装包体积约 **114 MB**。

---

## 文档

- [快速说明 README](https://github.com/dzcnice/clipvault/blob/main/README.md)
- [已知限制](https://github.com/dzcnice/clipvault/blob/main/docs/KNOWN-LIMITATIONS.md)
- [安全与威胁模型](https://github.com/dzcnice/clipvault/blob/main/SECURITY.md)
- [变更日志](https://github.com/dzcnice/clipvault/blob/main/CHANGELOG.md)
- [快捷键](https://github.com/dzcnice/clipvault/blob/main/docs/SHORTCUTS.md)

---

## 从源码构建

```bash
git clone https://github.com/dzcnice/clipvault.git
cd clipvault
npm install
npm run dev          # 开发
npm run preflight    # typecheck + test + build
npm run build:win    # Windows 安装包 → dist/
```

要求：Node.js 20+、npm 10+。

---

## License

MIT

---

**Full Changelog**: https://github.com/dzcnice/clipvault/blob/main/CHANGELOG.md
