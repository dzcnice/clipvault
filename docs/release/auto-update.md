# 自动更新与安装升级规范

本文说明 ClipVault **如何把新版本推送给已安装用户**，以及 **安装包如何处理旧版本**。目标对齐常见桌面产品（VS Code / Slack 一类）的可预期行为。

---

## 1. 架构一览

```text
发版机                          用户已安装客户端
──────                          ────────────────
bump package.json version
npm run build:win
  → setup.exe
  → latest.yml      ──上传──►  GitHub Release (dzcnice/clipvault)
  → *.blockmap

                                启动 30s 后 / 每 4h / 设置里手动
                                electron-updater 拉取 latest.yml
                                比较 version
                                  ├─ 无更新 → 静默
                                  └─ 有更新 → UpdateNotifier
                                       用户点下载 → 校验 sha512
                                       点「重启安装」→ 覆盖程序文件
                                       用户库 %APPDATA%\clipvault 保留
```

| 组件 | 路径 / 配置 |
|------|-------------|
| 客户端更新 | `src/main/updater/index.ts` + `electron-updater` |
| UI | `UpdateNotifier`、设置「检查更新」 |
| 发布源 | `electron-builder.yml` → `publish.provider: github` |
| 安装器 | NSIS + `build/installer.nsh` |
| 应用 ID | **`com.clipvault.app`（终身不变）** |

---

## 2. 推送给用户的标准流程（每次发版）

### 2.1 必须遵守

1. **`package.json` 的 `version` 严格递增**（SemVer）  
   - 例：`3.1.0` → `3.1.1` / `3.2.0`  
   - **同一 version 覆盖 Release 文件，已装客户端不会认为有新版本**
2. `CHANGELOG.md` 写入对应版本说明（可出现在更新提示里）
3. 构建：

   ```bash
   npm run typecheck
   npm test
   npm run build:win
   ```

4. 产物至少三个（Windows）：

   | 文件 | 作用 |
   |------|------|
   | `dist/clipvault-<ver>-setup.exe` | 全量安装 / 更新包 |
   | `dist/clipvault-<ver>-setup.exe.blockmap` | 差量下载辅助 |
   | `dist/latest.yml` | 版本清单（含 sha512） |

5. 上传到 GitHub Release（tag 建议 `v<ver>`），**三个文件都要在**
6. 本机用旧版装一次 → 设置 → **检查更新** → 确认能扫到新 version

### 2.2 推荐命令

```bash
# 已登录 gh、版本已 bump、已 build:win
gh release create "v$(node -p "require('./package.json').version")" \
  --title "ClipVault $(node -p "require('./package.json').version")" \
  --notes-file docs/release/RELEASE-notes.md \
  dist/clipvault-*-setup.exe \
  dist/clipvault-*-setup.exe.blockmap \
  dist/latest.yml
```

或使用仓库内 `npm run release`（需 `GH_TOKEN` / 签名策略按环境配置）。

### 2.3 用户侧体验（产品规则）

| 步骤 | 行为 |
|------|------|
| 检查 | 自动（30s / 4h） |
| 下载 | **需用户点击**（不静默占带宽） |
| 安装 | 下载完提示「立即重启安装」；也可退出时安装 |
| 数据 | 默认保留本地库 |
| 失败 | 可关闭提示，设置里可重试；周期检查在源 404 时暂停直到手动检查 |

---

## 3. 安装包与旧版本（避免「装两份」）

### 3.1 原则

1. **`appId: com.clipvault.app` 永不修改** —— 否则 Windows 会当成另一个软件  
2. **正常升级 = 覆盖安装**，不是每次先卸再装  
3. **用户数据在 `%APPDATA%\clipvault`**，与 Programs 下程序目录分离  
4. **卸载默认不删用户库**（`deleteAppDataOnUninstall: false`）

### 3.2 NSIS 配置要点

见 `electron-builder.yml`：

- `oneClick: false` —— 可确认安装路径（更正规）  
- `perMachine: false` —— 当前用户安装（勿与整机装混用）  
- `deleteAppDataOnUninstall: false`  
- `include: build/installer.nsh` —— 脏安装时尽量静默卸旧**程序**，不动库  

### 3.3 什么时候会「先卸再装」

仅 `installer.nsh` 在检测到：

- 注册表已有本产品卸载项，且  
- `InstallLocation` 为空或与本次 `$INSTDIR` 不一致  

时，对**旧卸载器**执行 `/S` 静默卸载程序文件。  

**不会**默认删除 `%APPDATA%\clipvault`。

### 3.4 运维注意

| 错误做法 | 后果 |
|----------|------|
| 改 appId | 双图标、双卸载项 |
| 有的机器 per-user、有的 per-machine | 升级对不上 |
| 发版 version 不涨 | 自动更新永不触发 |
| 只上传 exe 不上传 latest.yml | 客户端无法发现版本 |

---

## 4. 代码签名（生产级必选项）

当前流水线已预留 `scripts/sign.js` / 环境变量注入。

| 阶段 | 建议 |
|------|------|
| 内测 / 熟人 | 可无签名；说明 SmartScreen |
| 对外「稳定自动更新」 | **必须 OV/EV 代码签名** |

详见 `docs/release/signing-setup.md`。

未签名时：

- 安装/更新可能被 SmartScreen 拦截  
- 仍可通过 yml 的 sha512 做完整性校验，但信任链不完整  

---

## 5. 通道（stable / beta）

- 设置页可切换 `stable` / `beta`  
- 映射见 `src/main/updater/channel.ts`  
- beta 对应 `allowPrerelease`；发预发布请使用 GitHub prerelease + 匹配 channel 产物  

---

## 6. 故障排查

| 现象 | 检查 |
|------|------|
| 永远无更新 | `latest.yml` 的 `version` 是否 **大于** 本地 `package.json`/已装版本 |
| 404 / 连不上 | 仓库是否 public；Release 是否存在；网络；手动「检查更新」会重试 |
| 校验失败 | blockmap/setup 是否与 yml 同一次构建 |
| 装了两份 | 是否改过 appId；是否混用安装范围 |
| 图标旧 | Windows 图标缓存（与更新无关） |

客户端日志前缀：`[updater]`（主进程 logger）。

---

## 7. 检查清单（复制用）

```text
[ ] version 已递增
[ ] CHANGELOG 已写
[ ] typecheck / test / build:win 通过
[ ] dist 含 setup + blockmap + latest.yml
[ ] latest.yml version 与 package.json 一致
[ ]（可选）签名 setup
[ ] gh release 上传三件套
[ ] 旧版客户端「检查更新」能发现新版本
[ ] 升级后 %APPDATA%\clipvault 数据仍在
```

---

## 8. 与「大厂规范」的对应关系

| 规范点 | ClipVault 做法 |
|--------|----------------|
| 单一应用身份 | 固定 appId |
| 增量通知 | latest.yml + electron-updater |
| 用户确认下载 | autoDownload=false |
| 完整性 | sha512（+ 签名后验签） |
| 升级不丢数据 | 库在 AppData；卸载不默认删库 |
| 覆盖而非双开 | NSIS 同 appId 升级 + installer.nsh 脏路径清理 |
| 可运维 | 本文档 + release 脚本 |

---

最后更新：与 v3.1 个人本地版、GitHub `dzcnice/clipvault` 发布源对齐。
