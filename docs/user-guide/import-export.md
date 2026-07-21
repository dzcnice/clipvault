# 导入与导出

ClipVault 支持从主流密码管理器批量迁移，以及两种模式的数据导出。

![导入向导封面](placeholder.png)

## 目录

- [支持的来源](#支持的来源)
- [1Password](#1password)
- [Bitwarden](#bitwarden)
- [Chrome / Edge](#chrome--edge)
- [LastPass](#lastpass)
- [通用 CSV](#通用-csv)
- [导出](#导出)

---

## 支持的来源

| 来源 | 格式 | 说明 |
|------|------|------|
| 1Password | `.1pif` / `.csv` | Export → Unencrypted 1PIF 或 CSV |
| Bitwarden | `.json` | File → Export Vault → JSON (unencrypted) |
| Chrome / Edge | `.csv` | 设置 → 密码 → 导出 |
| LastPass | `.csv` | Advanced → Export → LastPass CSV File |
| 通用 CSV | `.csv` | 自定义列映射 |

所有导入均在本机完成，**文件不会上传任何服务器**。

![来源选择](placeholder.png)

---

## 1Password

### 1PIF 格式

1. 1Password 7+ → File → Export → All Items
2. 选择 "1Password Interchange Format (1PIF)"
3. 设置保存位置（建议导入完立即删除）
4. ClipVault 中选择「导入 → 1Password → 1PIF」上传

导入结果：Login / Password / Secure Note → 映射到「账号密码 / 其他」类型；Document 附件暂不支持。

### CSV 格式

同样流程但选 CSV。适合老版本 1Password 6。

---

## Bitwarden

1. Bitwarden Web 端 → Tools → Export Vault
2. Format：`json`，输入主密码
3. ClipVault → 导入 → Bitwarden → 选择 JSON
4. 自动映射：`login.uris` → URL，`fields` → 自定义字段

![Bitwarden 导出](placeholder.png)

---

## Chrome / Edge

1. `chrome://settings/passwords` → 三点菜单 → 导出密码
2. 输入系统账户密码确认
3. 保存为 `Chrome Passwords.csv`
4. ClipVault 导入时选「Chrome/Edge」

> **安全提示**：Chrome 导出的 CSV 是明文！导入完成后请立即安全删除（使用 `sdelete` / `srm` / 系统回收站无法恢复）。

---

## LastPass

1. 浏览器插件 → Account Options → Advanced → Export → LastPass CSV File
2. 可能需要在邮件中点验证链接
3. 复制文本保存为 `.csv`
4. ClipVault 选「LastPass」导入

LastPass 的「Secure Notes」会映射到凭证「其他」类型。

---

## 通用 CSV

若来源工具未列出，可导出 CSV 后用通用模式导入。向导会让你：

1. 预览前 5 行
2. 手动映射列（标题 / 用户名 / 密码 / URL / 备注 / tag）
3. 选择字符编码（UTF-8 / GBK）

![CSV 字段映射](placeholder.png)

---

## 导出

### 纯 JSON（脱敏）

- 凭证 `value` 为空字符串
- 顶层携带 `_warning` 字段
- 用途：备份结构、做分析、提交问题反馈

### 加密 JSON

- 使用独立于主密码的**导出密码**（scrypt 派生新 KEK）
- AES-256-GCM 加密每条凭证 value
- 用途：跨设备迁移、离线备份、寄存第三方云

![导出模式选择](placeholder.png)

### CSV（明文，不推荐）

仅用于外部工具迁移。导出时会弹出强警告，要求确认「我理解 CSV 明文的风险」。

---

**字数：** 约 650 字
