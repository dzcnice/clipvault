# 代码签名配置指南

本文档描述 ClipVault 在 Windows / macOS / Linux 三端的代码签名方案、证书申请流程与 CI/CD 注入方式。

> 当前 `electron-builder.yml` 已留好占位，所有证书材料均通过**环境变量**注入，源码仓库**不会**包含任何密钥文件。

## 当前项目接线（可直接照做）

| 项 | 位置 |
|----|------|
| 签名脚本 | `npm run sign:win` → `scripts/sign.js` |
| 检测模式 | `CSC_LINK`+`CSC_KEY_PASSWORD` → pfx；或 Azure Key Vault 变量 → azure |
| 发版流水线 | `scripts/release.js` 在 build 后调用签名（无凭据时需 `ALLOW_UNSIGNED_RELEASE=1`） |
| 打包配置 | `electron-builder.yml` → `signAndEditExecutable: false`（签名走脚本，避免 builder 双签冲突） |
| 自动更新 | 签名后更新包更易通过 Windows 信任；未签名仍可用 sha512 校验 |

### 无证书时（现状）

```bash
# 仅构建，不签名
npm run build:win
# 发 Release 时允许未签名
set ALLOW_UNSIGNED_RELEASE=1
npm run release -- --skip-sign
```

### 有 pfx 时

```powershell
$env:CSC_LINK = "C:\certs\clipvault.pfx"
$env:CSC_KEY_PASSWORD = "***"
npm run build:win
node scripts/sign.js dist\clipvault-*-setup.exe dist\win-unpacked\ClipVault.exe
```

### 有 Azure Key Vault EV 时

```powershell
$env:AZURE_KEY_VAULT_URI = "https://xxx.vault.azure.net/"
$env:AZURE_CERT_NAME = "clipvault-ev"
$env:AZURE_CLIENT_ID = "..."
$env:AZURE_TENANT_ID = "..."
$env:AZURE_CLIENT_SECRET = "..."
node scripts/sign.js dist\clipvault-*-setup.exe
```

验证：

```powershell
# 查看签名信息（有 signtool 时）
signtool verify /pa dist\clipvault-*-setup.exe
```

## 目录

- [为什么需要代码签名](#为什么需要代码签名)
- [Windows - 方案对比](#windows---方案对比)
- [Windows - 本地签名](#windows---本地签名)
- [Windows - GitHub Actions 注入](#windows---github-actions-注入)
- [Windows - Azure Key Vault HSM](#windows---azure-key-vault-hsm)
- [macOS 签名与公证](#macos-签名与公证)
- [Linux](#linux)
- [验证](#验证)

---

## 为什么需要代码签名

1. **SmartScreen 信任**：未签名的 exe 会弹出 "Windows 保护了您的电脑"，严重劝退用户
2. **自动更新完整性**：`electron-updater` 通过签名验证升级包未被篡改
3. **企业合规**：部分公司/政府环境仅允许运行已签名二进制
4. **供应链安全**：降低发行渠道被中间人替换的风险

---

## Windows - 方案对比

| 方案 | 成本 | 立即信任 | HSM | 推荐度 |
|------|------|----------|-----|--------|
| **自签名证书** | 免费 | ❌（每次运行弹窗） | ❌ | 仅开发测试 |
| **OV 证书 (Sectigo/DigiCert)** | $200-400/年 | ❌（需累积下载量建立信誉） | 可选 | ⭐⭐ |
| **EV 证书 + USB Token** | $400-600/年 | ✅（首次运行即无警告） | ✅（硬件） | ⭐⭐⭐⭐ |
| **EV 证书 + Azure Key Vault HSM** | $400-600/年 + Azure 费用 | ✅ | ✅（云 HSM） | ⭐⭐⭐⭐⭐（CI 友好） |

> 自 2023-06 起，Microsoft 要求所有 OV/EV 代码签名证书私钥存于**FIPS 140-2 Level 2+** 硬件。USB Token 或 HSM 是硬性要求。

推荐：中小团队用 **EV + Azure Key Vault**，可无缝接入 GitHub Actions。

---

## Windows - 本地签名

### 1. 准备

- 从 [Sectigo](https://sectigo.com/) / [DigiCert](https://www.digicert.com/) 申请 EV 代码签名证书
- 收到 USB Token 后安装驱动（通常是 SafeNet Authentication Client）
- `.pfx` 文件导出（注意：EV 私钥通常不可导出，需用 Token 在线签名）

### 2. 设置环境变量

```powershell
$env:CSC_LINK = "C:\path\to\cert.pfx"       # 或 base64 编码的证书内容
$env:CSC_KEY_PASSWORD = "your-pfx-password"
```

### 3. 打包

```powershell
npm run build:win
```

electron-builder 会自动签名 `ClipVault.exe` 和 NSIS 安装程序。

---

## Windows - GitHub Actions 注入

`.github/workflows/release.yml` 示例：

```yaml
env:
  CSC_LINK: ${{ secrets.WIN_CSC_LINK_BASE64 }}
  CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_PASSWORD }}
  GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

steps:
  - name: Build & Sign
    run: npm run build:win
```

GitHub Secret 配置：

- `WIN_CSC_LINK_BASE64`：`.pfx` 文件 base64 编码
- `WIN_CSC_PASSWORD`：密码

---

## Windows - Azure Key Vault HSM

适合 EV 证书 + 无人值守 CI：

1. 在 Azure Portal 创建 **Key Vault**（Premium SKU，支持 HSM）
2. 导入 EV 证书到 Vault
3. 创建 Service Principal，授予 `Sign` 权限
4. 使用 [azuresigntool](https://github.com/vcsjones/AzureSignTool)：

```yaml
- name: Azure Sign
  env:
    AZURE_KEY_VAULT_URI: ${{ secrets.AKV_URI }}
    AZURE_CLIENT_ID: ${{ secrets.AKV_CLIENT_ID }}
    AZURE_TENANT_ID: ${{ secrets.AKV_TENANT_ID }}
    AZURE_CLIENT_SECRET: ${{ secrets.AKV_CLIENT_SECRET }}
    AZURE_CERT_NAME: ClipVault-EV
  run: node scripts/sign.js dist/ClipVault-Setup.exe
```

`scripts/sign.js` 会调用 `AzureSignTool sign -kvu ... -kvc ... -tr http://timestamp.digicert.com -td sha256`。

---

## macOS 签名与公证

### 证书

- 在 [Apple Developer](https://developer.apple.com/) 注册 Developer ID Application 证书（$99/年）
- 导出 `.p12` 保存到 CI

### 环境变量

```bash
export CSC_LINK=/path/to/cert.p12
export CSC_KEY_PASSWORD=xxx
export APPLE_ID=you@example.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345
```

### 启用公证

在 `electron-builder.yml`：

```yaml
mac:
  notarize:
    teamId: ABCDE12345
```

电脑首次运行仍会看到 Gatekeeper 对话，但可直接点打开（已公证状态）。

---

## Linux

- AppImage：无强制签名。可选 GPG 签名 `.AppImage` 为 `.AppImage.asc`
- Snap：通过 Canonical 账号自动签名
- Deb：`dpkg-sig --sign builder` + 自建 APT 源

---

## 验证

### Windows

```powershell
signtool verify /pa /v ClipVault-Setup.exe
```

应看到「Successfully verified: ClipVault-Setup.exe」。右键 → 属性 → 数字签名 中应显示证书链到根 CA。

### macOS

```bash
codesign -dv --verbose=4 ClipVault.app
spctl --assess --type execute -vv ClipVault.app
```

期望：`accepted, source=Notarized Developer ID`。

---

## 安全清单

- [ ] 证书私钥从不提交到 git
- [ ] CI Secret 仅生产 workflow 使用
- [ ] 构建机启用最小权限（`contents: write` 用于发布）
- [ ] EV Token PIN 分 2 人持有（防单点失控）
- [ ] 每年滚动一次证书，提前 60 天告警

---

## 参考

- [electron-builder / Code Signing](https://www.electron.build/code-signing)
- [Microsoft 代码签名新要求（2023）](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/code-signing-best-practices)
- [Apple Notarization](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
