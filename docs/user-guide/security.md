# 安全与加密

本篇是 [SECURITY.md](../../SECURITY.md) 的用户向简化版。开发者 / 审计方请直接阅读完整威胁模型。

![安全总览](placeholder.png)

## 目录

- [数据存储](#数据存储)
- [加密层级](#加密层级)
- [反截屏 / 反录屏](#反截屏--反录屏)
- [剪贴板 30s 清空](#剪贴板-30s-清空)
- [生物识别](#生物识别)
- [推荐实践](#推荐实践)

---

## 数据存储

所有数据均存于本机，默认路径：

- **Windows**：`%APPDATA%\clipvault\`
- **macOS**：`~/Library/Application Support/clipvault/`
- **Linux**：`~/.config/clipvault/`

内含：

- `clipvault.db`：SQLite 数据库（凭证 value 已 AES-256-GCM 加密）
- `images/`：剪贴板图片（可选加密）
- `backups/`：每 24h 自动备份
- `audit.log`：操作审计

---

## 加密层级

```
主密码 ──► scrypt(N=16384,r=8,p=1) ──► KEK ──► AES-256-GCM ──► 存储的 DEK
                                        │
                                        ▼
                               解密后的 DEK (仅内存)
                                        │
                                        ▼
          凭证 value ──► AES-256-GCM ──► 加密后存 SQLite
```

![两层密钥示意](placeholder.png)

- **主密码** 永不落盘，仅用于派生 KEK
- **DEK** 随机 32 字节，重设主密码 **不需重新加密凭证**
- **BIP39 24 词** 可离线重置主密码（是 DEK 的另一条派生路径）

---

## 反截屏 / 反录屏

在 Windows 与 macOS 上，敏感页面（凭证详情、恢复短语页、Vera 解锁）会调用：

- Windows：`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`
- macOS：`NSWindow.sharingType = .none`

效果：

- OBS / QuickTime / Snipping Tool 等工具截图显示黑色
- 屏幕录制直接录不到窗口内容
- 屏幕共享应用（Zoom / Teams）显示空白

![反截屏示意 - 黑色窗口](placeholder.png)

> 注意：**无法**抵御操作系统级恶意软件或物理拍摄屏幕。

---

## 剪贴板 30s 清空

复制凭证后，会出现倒计时 Toast：

- 默认 30 秒后自动清空系统剪贴板
- 可在「设置 → 安全」调整至 10s / 60s / 永久
- 点击 Toast 上的「留存」可取消本次清空

![清空倒计时 Toast](placeholder.png)

实现：对比 `clipboard.readText()` 与我们复制的明文，仅在匹配时清空，避免误清用户后续的复制内容。

---

## 生物识别

通过「设置 → 安全 → 生物识别」启用后，DEK 会被 OS keystore 额外封装一层：

- Windows：Windows Hello（需 TPM + PIN）
- macOS：Touch ID / Apple Watch
- Linux：libfprint（若发行版支持）

解锁时只需按指纹 / 刷脸；失败 3 次后回退到主密码。

---

## 推荐实践

1. **主密码** ≥ 12 位，使用密码生成器创建
2. **备份 24 词恢复短语** 到纸或不锈钢板
3. **启用 30s 剪贴板清空** + 反截屏保护
4. **Vera 权限** 保持默认 L1，按需临时提权
5. **定期导出加密备份** 到 U 盘 + 云盘（加密 JSON 模式）
6. **凭证健康检查** 每月跑一次，及时替换弱/重复密码

---

**字数：** 约 600 字
