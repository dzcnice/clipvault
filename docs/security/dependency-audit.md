# 依赖安全审计记录

> 最后更新：2026-04-15
> 执行命令：`npm audit --production --json`
> 工作目录：`ClipVault/`

## 概览

| 严重等级 | 数量 |
|----------|------|
| Critical | 0 |
| **High** | **1（合并包级别）** |
| Moderate | 0（并入 high 的 via 链） |
| Low | 0 |
| **Total** | **1 package with 17 advisories** |

## 详情

### `electron`（直接依赖）

- **当前版本**：当前 lockfile 中安装的 `<= 39.8.4`
- **修复版本**：`41.2.0`（含 semver major 升级）
- **汇总严重度**：**high**（含多条 high / moderate / low advisory）
- **包级范围**：`node_modules/electron`
- **fixAvailable**：✅（但需手动 `npm install electron@41.x` 并全面回归，`npm audit fix` 会变 semver major）

#### 主要 advisory 列表（摘录自 `npm audit --production --json`）

| ID / GHSA | 标题 | Severity | CVSS | 修复范围 |
|----------|------|----------|------|----------|
| GHSA-vmqv-hx8q-j7mg | Electron ASAR Integrity Bypass via resource modification | moderate | 6.1 | `< 35.7.5` |
| GHSA-5rqw-r77c-jp79 | AppleScript injection in `app.moveToApplicationsFolder` (macOS) | moderate | 6.5 | `< 38.8.6` |
| GHSA-xj5x-m3f3-5x3h | Service worker can spoof `executeJavaScript` IPC replies | moderate | 5.9 | `< 38.8.6` |
| GHSA-r5p7-gp4j-qhrx | Incorrect origin passed to permission request handler for iframe | moderate | 5.4 | `< 38.8.6` |
| GHSA-3c8v-cfp5-9885 | Out-of-bounds read in second-instance IPC (macOS / Linux) | moderate | 5.3 | `< 38.8.6` |
| GHSA-xwr5-m59h-vwqr | `nodeIntegrationInWorker` not correctly scoped in shared renderers | moderate | 6.8 | `< 38.8.6` |
| **GHSA-532v-xpq5-8h95** | **Use-after-free in offscreen child window paint callback** | **high** | **8.1** | `< 39.8.1` |
| GHSA-mwmh-mq4g-g6gr | Registry key path injection in `app.setAsDefaultProtocolClient` (Win) | moderate | 4.7 | `< 38.8.6` |
| GHSA-9w97-2464-8783 | Use-after-free in download save dialog callback | moderate | 5.8 | `< 38.8.6` |
| **GHSA-8337-3p73-46f4** | **Use-after-free in WebContents fullscreen / pointer-lock / keyboard-lock callbacks** | **high** | **7.5** | `< 38.8.6` |
| **GHSA-jjp3-mq3x-295m** | **Use-after-free in PowerMonitor (Win / macOS)** | **high** | **7.0** | `< 38.8.6` |
| **GHSA-9wfr-w7mm-pc7f** | **Renderer command-line switch injection via undocumented `commandLineSwitches` webPreference** | **high** | **7.8** | `< 38.8.6` |
| GHSA-jfqx-fxh3-c62j | Unquoted executable path in `app.setLoginItemSettings` (Win) | low | 3.9 | `< 38.8.6` |
| GHSA-4p4r-m79c-wq3v | HTTP Response Header Injection in custom protocol handlers | moderate | 5.9 | `< 38.8.6` |
| GHSA-9899-m83m-qhpj | USB device selection not validated against filtered list | low | 3.3 | `< 38.8.6` |
| GHSA-f37v-82c4-4x64 | Crash in `clipboard.readImage()` on malformed clipboard data | low | 2.8 | `< 39.8.5` |
| GHSA-f3pv-wv63-48x8 | Named `window.open` targets not scoped to opener browsing context | moderate | 6.0 | `< 39.8.5` |

> **high 计数**：4 条 use-after-free + 1 条 command-line switch injection = **5 条 high advisory**，合并到单包仍显示 1 high severity package。

## 影响评估

### 对 ClipVault 的实际风险

1. **T10（屏幕录制 / 截图窃取）**：受 clipboard.readImage 崩溃 advisory 影响，剪贴板监听器若遇畸形图像数据可能进程崩溃。目前有 500ms 轮询回退，影响可接受。
2. **T6（伪造 IPC）**：`executeJavaScript IPC spoof`、`second-instance IPC OOB`、`commandLineSwitches 注入` 三条在默认配置下不直接触达（`contextIsolation` / `sandbox` 已开），但仍提高深度防御等级。
3. **T7（渲染进程 XSS → 逃逸）**：use-after-free 链在恶意页面/iframe 触发下可越权，当前 CSP 阻断绝大多数 inline 脚本来源。
4. **功能面**：`setAsDefaultProtocolClient` 注入（Win）若用户未来启用 `cvshare://` scheme 注册需评估；当前未注册自定义协议。

## 缓解措施

### 短期（v2.0.x 维护窗口）

- [ ] 升级 `electron` 至 `>= 41.2.0`，补齐变更测试（原生模块 rebuild、反截屏 API、`contextIsolation` 兼容性）
- [ ] 在 v2.0.1 release note 中明确列出 CVE 修复
- [ ] 验证 `better-sqlite3` / `node-datachannel` 在新 Electron 版本下的 NAPI 兼容

### 禁用操作

- **禁止** 运行 `npm audit fix`（未授权，且含 semver major，可能破坏构建）
- **禁止** 跳过原生模块 rebuild 步骤直接打包

## 复核历史

| 日期 | 操作 | 结果 |
|------|------|------|
| 2026-04-15 | 执行 `npm audit --production --json` | 1 high severity (electron)，17 条 advisory |

## 如何复核

```bash
cd ClipVault/
npm audit --production --json > tmp-audit.json
# 不要跑 npm audit fix，除非评审通过 electron 升级计划
```
